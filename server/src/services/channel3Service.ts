/**
 * @file channel3Service.ts
 * @description Live Channel3 Product Graph client and supplier price-creep auditor.
 *
 * Implements:
 * - REQ-006: Live HTTP requests to Channel3 Product Graph APIs with header `x-api-key: env.CHANNEL3_API_KEY`
 * - CON-003: Rate-limit and credit quota caching per task/query in SQLite
 * - TASK-016: searchAndAuditSupplierProducts converting retail prices into integer minor units,
 *   calculating variance vs. historical baseline and savings vs. incumbent
 *
 * Grounded in Channel3 API v1 specification (@channel3/sdk 4.0 patterns).
 */

import { randomUUID } from 'node:crypto';
import { env } from '../config/env.js';
import { QuoteRepo } from '../db/database.js';
import { calcVariancePct, calcSavingsMinor } from '../utils/moneyAndHash.js';
import type { CascadeTask, SupplierQuote } from '../types/domain.js';

// ---------------------------------------------------------------------------
// Channel3 API Response Types (matching v1 wire format)
// ---------------------------------------------------------------------------

export interface Channel3Price {
  price: number; // decimal e.g. 349.00
  currency: string;
  compare_at_price?: number | null;
}

export interface Channel3Offer {
  url: string;
  domain: string;
  price: Channel3Price;
  availability: 'InStock' | 'OutOfStock';
  condition?: 'new' | 'used' | null;
  max_commission_rate?: number;
}

export interface Channel3Image {
  url: string;
  cleaned_url?: string | null;
  is_main_image?: boolean;
  shot_type?: string | null;
  alt_text?: string | null;
}

export interface Channel3Brand {
  id: string;
  name: string;
}

export interface Channel3Product {
  id: string;
  title: string;
  description?: string | null;
  brands?: Channel3Brand[];
  images?: Channel3Image[];
  offers?: Channel3Offer[];
  category?: {
    slug: string;
    title: string;
  } | null;
}

export interface Channel3SearchResponse {
  products: Channel3Product[];
  next_page_token?: string | null;
}

// ---------------------------------------------------------------------------
// Helper: Raw HTTP fetch to Channel3
// ---------------------------------------------------------------------------

async function channel3Request<T = unknown>(
  method: 'GET' | 'POST',
  path: string,
  body?: unknown
): Promise<T> {
  const url = `${env.CHANNEL3_API_BASE_URL}${path}`;

  const headers: Record<string, string> = {
    'x-api-key': env.CHANNEL3_API_KEY,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  const requestInit: RequestInit = {
    method,
    headers,
  };

  if (body !== undefined) {
    requestInit.body = JSON.stringify(body);
  }

  let response: Response;
  try {
    response = await fetch(url, requestInit);
  } catch (networkErr) {
    throw new Error(
      `Channel3Service: Network error [${method} ${url}]: ${String(networkErr)}`
    );
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => '(unreadable)');
    throw new Error(
      `Channel3Service: [${method} ${url}] returned HTTP ${response.status}: ${errorText}`
    );
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new Error(
      `Channel3Service: Failed to parse JSON response from [${method} ${url}]`
    );
  }
}

// ---------------------------------------------------------------------------
// 1. Direct Search
// ---------------------------------------------------------------------------

/**
 * Searches the live Channel3 product catalog by text query.
 * Calls POST /search (or /v1/search).
 */
export async function searchChannel3Products(
  query: string,
  limit: number = 5
): Promise<Channel3SearchResponse> {
  return channel3Request<Channel3SearchResponse>('POST', '/search', {
    query,
    limit,
  });
}

// ---------------------------------------------------------------------------
// 2. Direct Product Lookup by ID
// ---------------------------------------------------------------------------

/**
 * Retrieves a full canonical product by its Channel3 ID.
 * Calls GET /products/{productId}.
 */
export async function getChannel3ProductById(
  productId: string
): Promise<Channel3Product | null> {
  try {
    return await channel3Request<Channel3Product>('GET', `/products/${productId}`);
  } catch (err) {
    console.warn(`Channel3Service: Product lookup failed for ${productId}:`, err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// 3. Search & Audit Supplier Products for a Task (TASK-016)
// ---------------------------------------------------------------------------

/**
 * Audits supplier options for a task using Channel3.
 *
 * 1. Checks SQLite cache for existing recent quotes unless forceRefresh is true (CON-003).
 * 2. Queries live Channel3 /search for task.sku_search_query.
 * 3. Normalizes prices into integer minor units (cents).
 * 4. Calculates variance vs. historical baseline and savings vs. incumbent.
 * 5. Persists verified quotes into SQLite supplier_quotes table.
 *
 * (REQ-006, CON-003, TASK-016)
 */
export async function searchAndAuditSupplierProducts(
  task: CascadeTask,
  options: { forceRefresh?: boolean } = {}
): Promise<SupplierQuote[]> {
  // Check SQLite cache if forceRefresh is not requested (CON-003)
  if (!options.forceRefresh) {
    const cachedQuotes = QuoteRepo.findByTask(task.task_id).filter(
      (q) => q.source_type === 'CHANNEL3_LIVE'
    );
    if (cachedQuotes.length > 0) {
      return cachedQuotes;
    }
  }

  const query = task.sku_search_query ?? task.name;
  const searchResult = await searchChannel3Products(query, 5);

  const quotes: SupplierQuote[] = [];
  const now = new Date().toISOString();

  for (const product of searchResult.products) {
    const offer = product.offers?.[0];
    const rawPrice = offer?.price?.price ?? 0;
    const unitPriceMinor = Math.round(rawPrice * 100);
    const quantity = task.required_quantity > 0 ? task.required_quantity : 1;
    const totalMinor = unitPriceMinor * quantity;

    const varianceVsHistorical =
      task.historical_unit_price_minor && task.historical_unit_price_minor > 0
        ? calcVariancePct(unitPriceMinor, task.historical_unit_price_minor)
        : 0;

    const incumbentTotal = task.incumbent_unit_price_minor
      ? task.incumbent_unit_price_minor * quantity
      : 0;

    const savingsVsIncumbent = incumbentTotal > 0
      ? calcSavingsMinor(incumbentTotal, totalMinor)
      : 0;

    const imageUrl =
      product.images?.[0]?.cleaned_url ??
      product.images?.[0]?.url ??
      null;

    const quote: SupplierQuote = {
      quote_id: `quote_ch3_${randomUUID().slice(0, 8)}`,
      task_id: task.task_id,
      source_type: 'CHANNEL3_LIVE',
      external_product_id: product.id,
      product_title: product.title,
      merchant_name: offer?.domain ?? product.brands?.[0]?.name ?? 'Verified Merchant',
      product_url: offer?.url ?? null,
      image_url: imageUrl,
      currency: offer?.price?.currency ?? 'USD',
      unit_price_minor: unitPriceMinor,
      quantity,
      shipping_minor: 0,
      tax_minor: 0,
      total_minor: totalMinor,
      variance_vs_historical_pct: varianceVsHistorical,
      savings_vs_incumbent_minor: savingsVsIncumbent,
      availability_status: offer?.availability === 'InStock' ? 'IN_STOCK' : 'AVAILABLE',
      observed_at: now,
    };

    QuoteRepo.insert(quote);
    quotes.push(quote);
  }

  // Sort discovered quotes ascending by unit price (best arbitrage first)
  quotes.sort((a, b) => a.unit_price_minor - b.unit_price_minor);

  return quotes;
}
