/**
 * @file verifyLiveSandbox.ts
 * @description Standalone Live Verification Script for PayPal Sandbox & Channel3 APIs (TASK-038).
 *
 * Implements:
 * - CON-001: Genuine live sandbox network verification
 * - TEST-012: Live PayPal Sandbox OAuth2, invoice lifecycle, and order creation
 * - TEST-013: Live Channel3 product search and quote verification
 *
 * The verifier fails closed: every integration must succeed and return a genuine
 * live identifier before the script reports success. No placeholder invoice IDs,
 * fallback prices, or swallowed errors are accepted.
 *
 * Usage:
 *   npm run verify:sandbox
 */

import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { env } from '../config/env.js';
import { getDb } from '../db/database.js';
import { APEX_PROJECT_ID } from '../services/projectBootstrapService.js';
import { formatMinorToPayPalValue } from '../utils/moneyAndHash.js';
import { getPayPalAccessToken } from '../services/paypalAuthService.js';
import {
  createDraftInvoice,
  sendInvoice,
  getInvoice,
  updateInvoiceForPartialMaterialsUnlock,
  generateInvoiceQrCode,
  sendInvoiceReminder,
  type CreateInvoiceParams,
  type PayPalInvoice,
  type QrCodeResponse,
} from '../services/paypalInvoicingService.js';
import {
  createSupplierOrder,
  type CreateOrderParams,
  type PayPalOrderDetails,
} from '../services/paypalOrdersService.js';
import {
  searchChannel3Products,
  type Channel3SearchResponse,
} from '../services/channel3Service.js';
import { redactSecrets } from '../utils/redaction.js';

export interface LiveSandboxVerifierDeps {
  getPayPalAccessToken: () => Promise<string>;
  createDraftInvoice: (params: CreateInvoiceParams) => Promise<PayPalInvoice>;
  sendInvoice: (invoiceId: string) => Promise<void>;
  getInvoice: (invoiceId: string) => Promise<PayPalInvoice>;
  updateInvoiceForPartialMaterialsUnlock: (
    invoiceId: string,
    currentInvoice: PayPalInvoice,
    unlockMinor: number,
    currency: string,
    note: string
  ) => Promise<PayPalInvoice>;
  generateInvoiceQrCode: (invoiceId: string) => Promise<QrCodeResponse>;
  sendInvoiceReminder: (invoiceId: string, subject: string, note: string) => Promise<void>;
  createSupplierOrder: (params: CreateOrderParams) => Promise<PayPalOrderDetails>;
  searchChannel3Products: (query: string) => Promise<Channel3SearchResponse>;
  /** Persists the live order into `paypal_transactions` (TEST-011). */
  persistOrder: (input: PersistLiveOrderInput) => void;
  /** Persists the normalized product into `supplier_quotes` (TEST-012). */
  persistQuote: (input: PersistLiveQuoteInput) => void;
}

export interface PersistLiveOrderInput {
  orderId: string;
  status: string;
  amountMinor: number;
  currency: string;
  rawResponse: PayPalOrderDetails;
}

export interface PersistLiveQuoteInput {
  externalProductId: string;
  productTitle: string;
  merchantName: string;
  unitPriceMinor: number;
  currency: string;
  totalMinor: number;
  availabilityStatus: string;
  rawProduct: Channel3SearchResponse['products'][number];
}

export interface LiveSandboxVerificationReport {
  paypalTokenAcquired: boolean;
  invoiceId: string;
  invoiceNumber: string;
  invoiceStatus: string;
  partialPaymentEnabled: boolean;
  partialPaymentMinimum: string;
  qrCodeBase64Length: number;
  reminderSent: boolean;
  orderId: string;
  orderStatus: string;
  orderPersisted: boolean;
  channel3ProductCount: number;
  channel3ProductTitle: string;
  channel3Merchant: string;
  channel3Price: number;
  quotePersisted: boolean;
}

type VerificationLogger = (message: string) => void;

const LIVE_INVOICE_ID = /^INV2-[A-Z0-9]+/i;
const PARTIAL_UNLOCK_MINOR = 139600; // $1,396.00 materials unlock (REQ-009)
const PNG_BASE64_PREFIX = 'iVBOR';

function assertLiveInvoice(invoice: PayPalInvoice): void {
  if (!invoice.id || !LIVE_INVOICE_ID.test(invoice.id) || /(?:FALLBACK|MOCK)/i.test(invoice.id)) {
    throw new Error(
      `PayPal invoice verification failed: expected a live INV2-... invoice ID, received '${invoice.id || '(empty)'}'`
    );
  }
}

function findPricedProduct(products: Channel3SearchResponse['products']) {
  for (const product of products) {
    const offer = product.offers?.[0];
    const price = offer?.price?.price;
    if (typeof price === 'number' && Number.isFinite(price) && price > 0) {
      return {
        product,
        price,
        merchant: offer?.domain || product.brands?.[0]?.name || 'Supplier',
      };
    }
  }
  return null;
}

export async function runLiveSandboxVerification(
  deps: LiveSandboxVerifierDeps,
  log: VerificationLogger = console.log
): Promise<LiveSandboxVerificationReport> {
  log('\n=============================================================');
  log(' CascadeOS: Live Production Sandbox Smoke Test Verification');
  log('=============================================================\n');

  // 1. PayPal Sandbox OAuth2
  log('[1/4] Authenticating with PayPal Sandbox OAuth2...');
  const token = await deps.getPayPalAccessToken();
  if (!token) {
    throw new Error('PayPal OAuth2 verification failed: empty access token');
  }
  log('   ✓ PayPal Sandbox Token acquired (redacted)\n');

  // 2. PayPal Invoicing v2 Full Lifecycle
  log('[2/4] Testing full invoice lifecycle on api-m.sandbox.paypal.com...');
  let invoice: PayPalInvoice;
  try {
    invoice = await deps.createDraftInvoice({
      requestId: `verify-req-${Date.now()}`,
      invoicerBusinessName: 'CascadeOS General Contracting',
      invoicerEmail: env.PAYPAL_SANDBOX_MERCHANT_EMAIL,
      recipientEmail: env.PAYPAL_SANDBOX_BUYER_EMAIL,
      memo: 'Live smoke test invoice created by verifyLiveSandbox.ts',
      currency: 'USD',
      items: [
        {
          name: 'Phase 2 Concrete Materials Deposit',
          quantity: 1,
          unitPriceMinor: 400000,
        },
      ],
    });
  } catch (error) {
    throw new Error(`PayPal invoice verification failed: ${String(error)}`);
  }

  assertLiveInvoice(invoice);
  const invoiceNumber = invoice.detail?.invoice_number || '(auto)';
  log(`   ✓ Draft Invoice Created: ${invoice.id}`);
  log(`   ✓ Invoice Number: ${invoiceNumber}`);
  log(`   ✓ Draft Status: ${invoice.status}`);

  try {
    await deps.sendInvoice(invoice.id);
  } catch (error) {
    throw new Error(`PayPal invoice send verification failed: ${String(error)}`);
  }

  let sentInvoice: PayPalInvoice;
  try {
    sentInvoice = await deps.getInvoice(invoice.id);
  } catch (error) {
    throw new Error(`PayPal invoice send verification failed: ${String(error)}`);
  }
  if (sentInvoice.status !== 'SENT') {
    throw new Error(
      `PayPal invoice send verification failed: expected SENT status, received '${sentInvoice.status}'`
    );
  }
  log(`   ✓ Invoice Sent: ${sentInvoice.status}`);

  const partialNote =
    'Live verification: pay the materials portion to release critical project hardware.';
  try {
    await deps.updateInvoiceForPartialMaterialsUnlock(
      invoice.id,
      sentInvoice,
      PARTIAL_UNLOCK_MINOR,
      'USD',
      partialNote
    );
  } catch (error) {
    throw new Error(`PayPal partial payment verification failed: ${String(error)}`);
  }
  const expectedMinimum = formatMinorToPayPalValue(PARTIAL_UNLOCK_MINOR, 'USD');
  log(`   ✓ Partial Payment Enabled: minimum $${expectedMinimum}`);

  let qrCodeBase64: string;
  try {
    const qr = await deps.generateInvoiceQrCode(invoice.id);
    qrCodeBase64 = qr.qr_code_base64;
  } catch (error) {
    throw new Error(`PayPal QR code verification failed: ${String(error)}`);
  }
  if (!qrCodeBase64 || !qrCodeBase64.startsWith(PNG_BASE64_PREFIX)) {
    throw new Error('PayPal QR code verification failed: expected a non-empty Base64 PNG');
  }
  log(`   ✓ QR Code Generated: ${qrCodeBase64.length} Base64 chars`);

  try {
    await deps.sendInvoiceReminder(
      invoice.id,
      'CascadeOS live verification reminder',
      'Live verification of the PayPal Invoicing reminder channel. No action required.'
    );
  } catch (error) {
    throw new Error(`PayPal invoice reminder verification failed: ${String(error)}`);
  }
  log('   ✓ Reminder Sent');

  let finalInvoice: PayPalInvoice;
  try {
    finalInvoice = await deps.getInvoice(invoice.id);
  } catch (error) {
    throw new Error(`PayPal invoice final state verification failed: ${String(error)}`);
  }

  const partialPayment = finalInvoice.configuration?.partial_payment;
  if (partialPayment?.allow_partial_payment !== true) {
    throw new Error(
      'PayPal partial payment verification failed: allow_partial_payment is not enabled on the sent invoice'
    );
  }
  const minimumAmount = partialPayment.minimum_amount_due?.value;
  if (minimumAmount !== expectedMinimum) {
    throw new Error(
      `PayPal partial payment verification failed: expected minimum ${expectedMinimum}, received '${minimumAmount ?? '(missing)'}'`
    );
  }
  if (!finalInvoice.detail?.metadata?.recipient_view_url) {
    throw new Error(
      'PayPal invoice final state verification failed: missing recipient_view_url'
    );
  }
  log(`   ✓ Final Invoice Status: ${finalInvoice.status}`);
  log(`   ✓ Recipient View URL: ${finalInvoice.detail.metadata.recipient_view_url}\n`);

  // 3. PayPal Orders v2 Order Creation
  log('[3/4] Creating Live Order on PayPal Orders v2...');
  let order: PayPalOrderDetails;
  try {
    order = await deps.createSupplierOrder({
      planId: `plan-verify-${Date.now()}`,
      taskId: 'task_phase_2_displays',
      totalMinor: 139600, // $1,396.00
      currency: 'USD',
      description: 'Channel3 Supplier Live Verification Order',
      productTitle: 'Trane XR14 Commercial Grade Compressor',
      quantity: 4,
      unitPriceMinor: 34900,
    });
  } catch (error) {
    throw new Error(`PayPal order verification failed: ${String(error)}`);
  }
  if (!order.id || !/^[A-Z0-9]{10,}$/i.test(order.id)) {
    throw new Error('PayPal order verification failed: missing a genuine PayPal order ID');
  }
  if (order.status !== 'CREATED') {
    throw new Error(
      `PayPal order verification failed: expected CREATED status, received '${order.status}'`
    );
  }

  try {
    deps.persistOrder({
      orderId: order.id,
      status: order.status,
      amountMinor: 139600,
      currency: 'USD',
      rawResponse: order,
    });
  } catch (error) {
    throw new Error(`PayPal order persistence failed: ${String(error)}`);
  }
  log(`   ✓ PayPal Order Created: ${order.id}`);
  log(`   ✓ Order Status: ${order.status} (persisted in paypal_transactions)\n`);

  // 4. Channel3 Product Search
  log('[4/4] Querying Channel3 Catalog API (/v0/search)...');
  let searchResult: Channel3SearchResponse;
  try {
    searchResult = await deps.searchChannel3Products('HVAC Commercial Compressor');
  } catch (error) {
    throw new Error(`Channel3 verification failed: ${String(error)}`);
  }

  const products = searchResult.products || [];
  const priced = findPricedProduct(products);
  if (!priced) {
    throw new Error(
      `Channel3 verification failed: no priced product returned across ${products.length} result(s)`
    );
  }

  log(`   ✓ Channel3 Search successful. Found ${products.length} products.`);
  log(`   ✓ Sample Product: "${priced.product.title}" by ${priced.merchant}`);
  log(`   ✓ Price: $${priced.price.toFixed(2)}`);

  const externalProductId = priced.product.id;
  if (typeof externalProductId !== 'string' || externalProductId.trim().length === 0) {
    throw new Error(
      'Channel3 verification failed: priced product is missing a genuine external product ID'
    );
  }
  const unitPriceMinor = Math.round(priced.price * 100);
  if (!Number.isInteger(unitPriceMinor) || unitPriceMinor <= 0) {
    throw new Error(
      `Channel3 verification failed: price '${priced.price}' did not normalize to positive integer minor units`
    );
  }
  const offer = priced.product.offers?.[0];
  try {
    deps.persistQuote({
      externalProductId,
      productTitle: priced.product.title,
      merchantName: priced.merchant,
      unitPriceMinor,
      currency: offer?.price.currency ?? 'USD',
      totalMinor: unitPriceMinor,
      availabilityStatus: offer?.availability ?? 'InStock',
      rawProduct: priced.product,
    });
  } catch (error) {
    throw new Error(`Channel3 quote persistence failed: ${String(error)}`);
  }
  log(`   ✓ Quote Persisted: ${externalProductId} (${unitPriceMinor} minor units)\n`);

  log('=============================================================');
  log(' SUCCESS: All Live Sandbox Integrations Verified!');
  log(' Zero mocks used. Live endpoints returned genuine live IDs.');
  log(' Invoice create, send, partial payment, QR, and reminder verified.');
  log('=============================================================\n');

  return {
    paypalTokenAcquired: true,
    invoiceId: invoice.id,
    invoiceNumber,
    invoiceStatus: finalInvoice.status,
    partialPaymentEnabled: partialPayment.allow_partial_payment,
    partialPaymentMinimum: minimumAmount,
    qrCodeBase64Length: qrCodeBase64.length,
    reminderSent: true,
    orderId: order.id,
    orderStatus: order.status,
    orderPersisted: true,
    channel3ProductCount: products.length,
    channel3ProductTitle: priced.product.title,
    channel3Merchant: priced.merchant,
    channel3Price: priced.price,
    quotePersisted: true,
  };
}

/** Writes the live order into `paypal_transactions` (TEST-011). */
export function persistLiveOrderToDb(input: PersistLiveOrderInput): void {
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO paypal_transactions (
        transaction_record_id, project_id, task_id, plan_id, kind,
        paypal_resource_id, paypal_capture_id, status, currency, amount_minor,
        raw_response_json, created_at
      ) VALUES (?, ?, ?, NULL, 'ORDER_CREATE', ?, NULL, ?, ?, ?, ?, ?)`
    )
    .run(
      randomUUID(),
      APEX_PROJECT_ID,
      'task_phase_2_displays',
      input.orderId,
      input.status,
      input.currency,
      input.amountMinor,
      JSON.stringify(input.rawResponse),
      now
    );
}

/** Writes the normalized Channel3 product into `supplier_quotes` (TEST-012). */
export function persistLiveQuoteToDb(input: PersistLiveQuoteInput): void {
  getDb()
    .prepare(
      `INSERT INTO supplier_quotes (
        quote_id, task_id, source_type, external_product_id, product_title,
        merchant_name, product_url, image_url, currency, unit_price_minor,
        quantity, shipping_minor, tax_minor, total_minor,
        variance_vs_historical_pct, savings_vs_incumbent_minor,
        availability_status, observed_at
      ) VALUES (?, ?, 'CHANNEL3_LIVE', ?, ?, ?, NULL, NULL, ?, ?, 1, 0, 0, ?, 0, 0, ?, ?)`
    )
    .run(
      randomUUID(),
      'task_phase_2_displays',
      input.externalProductId,
      input.productTitle,
      input.merchantName,
      input.currency,
      input.unitPriceMinor,
      input.totalMinor,
      input.availabilityStatus,
      new Date().toISOString()
    );
}

async function main(): Promise<void> {
  try {
    await runLiveSandboxVerification({
      getPayPalAccessToken,
      createDraftInvoice,
      sendInvoice,
      getInvoice,
      updateInvoiceForPartialMaterialsUnlock,
      generateInvoiceQrCode,
      sendInvoiceReminder,
      createSupplierOrder,
      searchChannel3Products,
      persistOrder: persistLiveOrderToDb,
      persistQuote: persistLiveQuoteToDb,
    });
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Smoke Test Error:', redactSecrets(String(error)));
    process.exit(1);
  }
}

const entryPoint = process.argv[1];
if (entryPoint && import.meta.url === pathToFileURL(entryPoint).href) {
  void main();
}
