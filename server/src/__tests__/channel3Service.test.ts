/**
 * @file channel3Service.test.ts
 * @description Unit tests for Channel3 Product Graph integration service (TASK-016).
 *
 * Covers:
 * - REQ-006: Live HTTP requests with x-api-key
 * - CON-003: SQLite quote caching & force-refresh toggle
 * - Minor unit conversion from retail prices (PAT-003)
 * - Historical variance and incumbent savings calculation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  searchChannel3Products,
  getChannel3ProductById,
  searchAndAuditSupplierProducts,
  type Channel3SearchResponse,
} from '../services/channel3Service.js';
import * as dbModule from '../db/database.js';
import { QuoteRepo } from '../db/database.js';
import type { CascadeTask } from '../types/domain.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SCHEMA_PATH = resolve(__dirname, '../db/schema.sql');

describe('TASK-016: channel3Service (REQ-006, CON-003)', () => {
  const originalFetch = globalThis.fetch;
  let testDb: Database.Database;

  const mockTask: CascadeTask = {
    task_id: 'task_phase_2_displays',
    project_id: 'proj_apex_clinic_01',
    version: 1,
    name: 'Phase 2: 4K Diagnostic Displays',
    start_date: '2026-10-16',
    end_date: '2026-10-18',
    duration_days: 2,
    materials_in_warehouse: 0,
    crew_assigned: 'Display Tech Team',
    daily_idle_burn_minor: 68000,
    sla_delay_penalty_minor: 144000,
    phase_hardware_budget_max_minor: 160000,
    schedule_status: 'PAYMENT_BLOCKED',
         paypal_invoice_id: 'INV2-PHASE-2',
         paypal_invoice_number: 'INV-002',
         paypal_invoice_view_url: null,
    paypal_invoice_status: 'OVERDUE',
    invoice_total_minor: 450000,
    materials_unlock_minor: 139600,
    deferred_labor_minor: 310400,
    client_name: 'Apex Health Lead',
    client_email: 'client@apexhealth.com',
    qr_code_base64: null,
    last_nudge_message: null,
    last_nudge_sent_at: null,
    sku_search_query: 'LG 32UN880-B 32 inch UltraFine Ergo 4K',
    required_quantity: 4,
    incumbent_vendor_name: 'MedTech Supply Co.',
    incumbent_unit_price_minor: 49000, // $490.00
    historical_unit_price_minor: 38000, // $380.00
    max_allowed_variance_pct: 10.0,
  };

  beforeEach(() => {
    testDb = new Database(':memory:');
    const schema = readFileSync(SCHEMA_PATH, 'utf-8');
    testDb.exec(schema);

    // Seed project and task in testDb
    testDb.prepare(
      `INSERT INTO projects (project_id, name, currency, created_at, updated_at)
       VALUES ('proj_apex_clinic_01', 'Apex Clinic', 'USD', '2026-10-15T00:00:00Z', '2026-10-15T00:00:00Z')`
    ).run();

    testDb.prepare(
      `INSERT INTO tasks (
         task_id, project_id, version, name, start_date, end_date, duration_days,
         materials_in_warehouse, crew_assigned, daily_idle_burn_minor,
         sla_delay_penalty_minor, phase_hardware_budget_max_minor,
         schedule_status, paypal_invoice_id, paypal_invoice_number,
         paypal_invoice_status, invoice_total_minor, materials_unlock_minor,
         deferred_labor_minor, client_name, client_email, sku_search_query,
         required_quantity, incumbent_vendor_name, incumbent_unit_price_minor,
         historical_unit_price_minor, max_allowed_variance_pct
       ) VALUES (
         'task_phase_2_displays', 'proj_apex_clinic_01', 1, 'Phase 2: 4K Diagnostic Displays',
         '2026-10-16', '2026-10-18', 2,
         0, 'Display Tech Team', 68000,
         144000, 160000,
         'PAYMENT_BLOCKED', 'INV2-PHASE-2', 'INV-002',
         'OVERDUE', 450000, 139600,
         310400, 'Apex Health Lead', 'client@apexhealth.com', 'LG 32UN880-B 32 inch UltraFine Ergo 4K',
         4, 'MedTech Supply Co.', 49000,
         38000, 10.0
       )`
    ).run();

    dbModule.setDbForTesting(testDb);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    dbModule.setDbForTesting(null);
    testDb.close();
    vi.restoreAllMocks();
  });

  it('searchChannel3Products: sends POST /search with auth header and query', async () => {
    const mockResponse: Channel3SearchResponse = {
      products: [
        {
          id: 'prod-001',
          title: 'LG 32UN880-B 32" UltraFine Ergo 4K',
          offers: [
            {
              url: 'https://retailer.example.com/lg32',
              domain: 'retailer.example.com',
              price: { price: 349.0, currency: 'USD' },
              availability: 'InStock',
            },
          ],
        },
      ],
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    });
    globalThis.fetch = mockFetch;

    const result = await searchChannel3Products('LG 32UN880-B', 5);

    expect(result.products).toHaveLength(1);
    expect(result.products[0]?.title).toBe('LG 32UN880-B 32" UltraFine Ergo 4K');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/search');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['x-api-key']).toBeDefined();
    const body = JSON.parse(init.body as string);
    expect(body.query).toBe('LG 32UN880-B');
    expect(body.limit).toBe(5);
  });

  it('getChannel3ProductById: retrieves product details via GET', async () => {
    const mockProduct = {
      id: 'prod-001',
      title: 'LG 32UN880-B 32" UltraFine Ergo 4K',
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockProduct,
    });
    globalThis.fetch = mockFetch;

    const product = await getChannel3ProductById('prod-001');
    expect(product).toBeDefined();
    expect(product?.id).toBe('prod-001');

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/products/prod-001');
    expect(init.method).toBe('GET');
  });

  it('searchAndAuditSupplierProducts: converts $349.00 to 34900 minor units and calculates variance + savings', async () => {
    const mockResponse: Channel3SearchResponse = {
      products: [
        {
          id: 'prod-lg-32un880b',
          title: 'LG 32UN880-B 32" UltraFine Ergo 4K',
          images: [
            {
              url: 'https://img.example.com/raw.png',
              cleaned_url: 'https://img.example.com/clean.png',
            },
          ],
          brands: [{ id: 'b1', name: 'LG' }],
          offers: [
            {
              url: 'https://store.example.com/item/1',
              domain: 'store.example.com',
              price: { price: 349.0, currency: 'USD' }, // $349.00 unit price
              availability: 'InStock',
            },
          ],
        },
      ],
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    });

    const quotes = await searchAndAuditSupplierProducts(mockTask);

    expect(quotes).toHaveLength(1);
    const quote = quotes[0]!;

    // Minor unit conversion verification
    expect(quote.unit_price_minor).toBe(34900); // 349.00 * 100
    expect(quote.quantity).toBe(4);
    expect(quote.total_minor).toBe(139600); // 34900 * 4

    // Historical variance: (349 - 380) / 380 = -8.16%
    expect(quote.variance_vs_historical_pct).toBe(-8.16);

    // Savings vs incumbent: (490 * 4) - (349 * 4) = 196000 - 139600 = 56400 cents ($564.00)
    expect(quote.savings_vs_incumbent_minor).toBe(56400);

    expect(quote.source_type).toBe('CHANNEL3_LIVE');
    expect(quote.availability_status).toBe('IN_STOCK');
    expect(quote.image_url).toBe('https://img.example.com/clean.png');

    // Verify persisted into SQLite
    const persisted = QuoteRepo.findByTask(mockTask.task_id);
    expect(persisted).toHaveLength(1);
    expect(persisted[0]?.quote_id).toBe(quote.quote_id);
    expect(persisted[0]?.total_minor).toBe(139600);
  });

  it('searchAndAuditSupplierProducts: uses SQLite cache when forceRefresh is false (CON-003)', async () => {
    // Pre-insert a quote into SQLite
    QuoteRepo.insert({
      quote_id: 'quote_cached_001',
      task_id: mockTask.task_id,
      source_type: 'CHANNEL3_LIVE',
      external_product_id: 'prod-cached',
      product_title: 'Cached Monitor',
      merchant_name: 'Cached Merchant',
      product_url: 'https://cached.example.com',
      image_url: null,
      currency: 'USD',
      unit_price_minor: 34900,
      quantity: 4,
      shipping_minor: 0,
      tax_minor: 0,
      total_minor: 139600,
      variance_vs_historical_pct: -8.16,
      savings_vs_incumbent_minor: 56400,
      availability_status: 'IN_STOCK',
      observed_at: '2026-10-18T00:00:00Z',
    });

    const mockFetch = vi.fn();
    globalThis.fetch = mockFetch;

    // Call without forceRefresh
    const quotes = await searchAndAuditSupplierProducts(mockTask, { forceRefresh: false });

    expect(quotes).toHaveLength(1);
    expect(quotes[0]?.quote_id).toBe('quote_cached_001');
    // Verify NO network call was made (credit saving CON-003)
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
