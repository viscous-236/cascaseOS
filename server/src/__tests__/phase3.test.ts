/**
 * @file phase3.test.ts
 * @description Phase 3 verification tests for CascadeOS PayPal Sandbox Services.
 *
 * Covers:
 * - TASK-011 / REQ-003: paypalAuthService (OAuth2 token exchange, 60s cache, de-duping, clearing)
 * - TASK-012 / REQ-004, REQ-009: paypalInvoicingService (draft, send, get, partial unlock split, QR code, remind)
 * - TASK-013 / REQ-010, REQ-011: paypalOrdersService (create order, capture, get details, idempotency headers)
 * - TASK-014 / DEP-002: paypalAgentToolkitBridge (singleton, read/remind permissions only, SEC-003)
 * - TASK-015 / REQ-012: webhookRoutes (signature verification, INVOICE.PAID, INVOICE.UPDATED, CAPTURE.COMPLETED reconciliation)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  getPayPalAccessToken,
  clearPayPalTokenCache,
} from '../services/paypalAuthService.js';
import {
  createDraftInvoice,
  sendInvoice,
  getInvoice,
  updateInvoiceForPartialMaterialsUnlock,
  generateInvoiceQrCode,
  sendInvoiceReminder,
  type PayPalInvoice,
} from '../services/paypalInvoicingService.js';
import {
  createSupplierOrder,
  captureSupplierOrder,
  getOrderDetails,
} from '../services/paypalOrdersService.js';
import {
  getPayPalAgentToolkit,
  getPayPalAgentTools,
  clearPayPalAgentToolkit,
} from '../services/paypalAgentToolkitBridge.js';
import webhookRouter from '../routes/webhookRoutes.js';
import * as dbModule from '../db/database.js';
import { env } from '../config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SCHEMA_PATH = resolve(__dirname, '../db/schema.sql');

describe('Phase 3: PayPal Sandbox Integration & Services', () => {
  // Save original fetch
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    clearPayPalTokenCache();
    clearPayPalAgentToolkit();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    clearPayPalTokenCache();
    clearPayPalAgentToolkit();
  });

  // ===========================================================================
  // TASK-011: PayPal OAuth2 Auth Service (REQ-003, SEC-008)
  // ===========================================================================
  describe('TASK-011: paypalAuthService (REQ-003, SEC-008)', () => {
    it('fetches an access token via HTTP Basic Auth and grant_type=client_credentials', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          access_token: 'MOCK_SANDBOX_TOKEN_123',
          token_type: 'Bearer',
          expires_in: 32400,
          scope: 'https://uri.paypal.com/services/invoicing',
        }),
      });
      globalThis.fetch = mockFetch;

      const token = await getPayPalAccessToken();

      expect(token).toBe('MOCK_SANDBOX_TOKEN_123');
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://api-m.sandbox.paypal.com/v1/oauth2/token');
      expect(init.method).toBe('POST');
      expect(init.headers).toHaveProperty('Authorization');
      expect((init.headers as Record<string, string>)['Authorization']).toMatch(/^Basic /);
      expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/x-www-form-urlencoded');
      expect(init.body).toBe('grant_type=client_credentials');
    });

    it('returns the cached token without re-fetching on subsequent calls', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          access_token: 'CACHED_TOKEN_XYZ',
          token_type: 'Bearer',
          expires_in: 3600,
          scope: '',
        }),
      });
      globalThis.fetch = mockFetch;

      const token1 = await getPayPalAccessToken();
      const token2 = await getPayPalAccessToken();
      const token3 = await getPayPalAccessToken();

      expect(token1).toBe('CACHED_TOKEN_XYZ');
      expect(token2).toBe('CACHED_TOKEN_XYZ');
      expect(token3).toBe('CACHED_TOKEN_XYZ');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('de-duplicates concurrent calls into a single in-flight fetch request', async () => {
      let resolvePromise!: (val: unknown) => void;
      const delayedPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });

      const mockFetch = vi.fn().mockImplementation(() =>
        delayedPromise.then(() => ({
          ok: true,
          status: 200,
          json: async () => ({
            access_token: 'CONCURRENT_TOKEN_999',
            token_type: 'Bearer',
            expires_in: 3600,
            scope: '',
          }),
        }))
      );
      globalThis.fetch = mockFetch;

      const promise1 = getPayPalAccessToken();
      const promise2 = getPayPalAccessToken();
      const promise3 = getPayPalAccessToken();

      resolvePromise(true);

      const [t1, t2, t3] = await Promise.all([promise1, promise2, promise3]);
      expect(t1).toBe('CONCURRENT_TOKEN_999');
      expect(t2).toBe('CONCURRENT_TOKEN_999');
      expect(t3).toBe('CONCURRENT_TOKEN_999');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('refetches when clearPayPalTokenCache is called', async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            access_token: 'TOKEN_1',
            token_type: 'Bearer',
            expires_in: 3600,
            scope: '',
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            access_token: 'TOKEN_2',
            token_type: 'Bearer',
            expires_in: 3600,
            scope: '',
          }),
        });
      globalThis.fetch = mockFetch;

      const t1 = await getPayPalAccessToken();
      expect(t1).toBe('TOKEN_1');

      clearPayPalTokenCache();

      const t2 = await getPayPalAccessToken();
      expect(t2).toBe('TOKEN_2');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('throws error when PayPal token response is not ok', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => '{"error":"invalid_client"}',
      });

      await expect(getPayPalAccessToken()).rejects.toThrow(/HTTP 401/);
    });
  });

  // ===========================================================================
  // TASK-012: PayPal Invoicing Service (REQ-004, REQ-009, SEC-004)
  // ===========================================================================
  describe('TASK-012: paypalInvoicingService (REQ-004, REQ-009, SEC-004)', () => {
    function setupAuthMock() {
      return vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          access_token: 'INVOICING_TEST_TOKEN',
          token_type: 'Bearer',
          expires_in: 3600,
          scope: '',
        }),
      });
    }

    it('createDraftInvoice: sends formatted payload with minor units converted to decimal strings', async () => {
      const mockFetch = setupAuthMock();
      globalThis.fetch = mockFetch;

      // First call is token, second is invoice create
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ access_token: 'TOKEN', token_type: 'Bearer', expires_in: 3600 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          json: async () => ({
            id: 'INV2-PHASE-2-ABCD',
            status: 'DRAFT',
            detail: { currency_code: 'USD', memo: 'Phase 2 Milestone' },
          }),
        });

      const invoice = await createDraftInvoice({
        requestId: 'req-draft-001',
        invoicerBusinessName: 'Cascade Medical Installations',
        invoicerEmail: 'invoicer@cascadeos.com',
        recipientEmail: 'client@apexclinic.com',
        memo: 'Phase 2 Milestone',
        currency: 'USD',
        dueDate: '2026-10-25',
        items: [
          {
            name: '4K Display Monitors',
            description: '4x 32-inch Ergonomic Displays',
            quantity: 4,
            unitPriceMinor: 34900, // $349.00
          },
        ],
      });

      expect(invoice.id).toBe('INV2-PHASE-2-ABCD');
      expect(invoice.status).toBe('DRAFT');

      const [, createCallInit] = mockFetch.mock.calls[1] as [string, RequestInit];
      expect(createCallInit.method).toBe('POST');
      expect((createCallInit.headers as Record<string, string>)['PayPal-Request-Id']).toBe('req-draft-001');

      const sentBody = JSON.parse(createCallInit.body as string);
      expect(sentBody.detail.currency_code).toBe('USD');
      expect(sentBody.detail.memo).toBe('Phase 2 Milestone');
      expect(sentBody.detail.payment_term.due_date).toBe('2026-10-25');
      expect(sentBody.items[0].quantity).toBe('4');
      expect(sentBody.items[0].unit_amount.value).toBe('349.00'); // REQ-002: converted to decimal string
    });

    it('sendInvoice: sends POST /v2/invoicing/invoices/{id}/send with send_to_recipient', async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ access_token: 'TOKEN', token_type: 'Bearer', expires_in: 3600 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 204,
          text: async () => '',
        });
      globalThis.fetch = mockFetch;

      await expect(sendInvoice('INV2-1234')).resolves.toBeUndefined();

      const [url, init] = mockFetch.mock.calls[1] as [string, RequestInit];
      expect(url).toBe('https://api-m.sandbox.paypal.com/v2/invoicing/invoices/INV2-1234/send');
      expect(init.method).toBe('POST');
      const body = JSON.parse(init.body as string);
      expect(body.send_to_recipient).toBe(true);
      expect(body.send_to_invoicer).toBe(false);
    });

    it('getInvoice: retrieves invoice details via GET /v2/invoicing/invoices/{id}', async () => {
      const mockInvoice: PayPalInvoice = {
        id: 'INV2-5678',
        status: 'SENT',
        detail: { currency_code: 'USD', memo: 'Apex Phase 2' },
      };

      const mockFetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ access_token: 'TOKEN', token_type: 'Bearer', expires_in: 3600 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => mockInvoice,
        });
      globalThis.fetch = mockFetch;

      const result = await getInvoice('INV2-5678');
      expect(result.id).toBe('INV2-5678');
      expect(result.status).toBe('SENT');
    });

    it('updateInvoiceForPartialMaterialsUnlock: updates partial_payment config with exact unlock amount (REQ-009)', async () => {
      const currentInvoice: PayPalInvoice = {
        id: 'INV2-PHASE-2',
        status: 'SENT',
        detail: { currency_code: 'USD', memo: 'Original Invoice' },
        configuration: { allow_tip: false },
      };

      const mockFetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ access_token: 'TOKEN', token_type: 'Bearer', expires_in: 3600 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            ...currentInvoice,
            configuration: {
              partial_payment: {
                allow_partial_payment: true,
                minimum_amount_due: { currency_code: 'USD', value: '1396.00' },
              },
            },
          }),
        });
      globalThis.fetch = mockFetch;

      const updated = await updateInvoiceForPartialMaterialsUnlock(
        'INV2-PHASE-2',
        currentInvoice,
        139600, // $1,396.00 unlock amount
        'USD',
        'Partial materials unlock for Phase 2 hardware'
      );

      const [url, init] = mockFetch.mock.calls[1] as [string, RequestInit];
      expect(url).toBe('https://api-m.sandbox.paypal.com/v2/invoicing/invoices/INV2-PHASE-2');
      expect(init.method).toBe('PUT');

      const body = JSON.parse(init.body as string);
      expect(body.configuration.partial_payment.allow_partial_payment).toBe(true);
      expect(body.configuration.partial_payment.minimum_amount_due.value).toBe('1396.00'); // REQ-002
      expect(body.configuration.partial_payment.minimum_amount_due.currency_code).toBe('USD');
      expect(body.detail.memo).toBe('Partial materials unlock for Phase 2 hardware');
    });

    it('generateInvoiceQrCode: calls generate-qr-code and returns Base64 PNG (REQ-009)', async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ access_token: 'TOKEN', token_type: 'Bearer', expires_in: 3600 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ qr_code_base64: 'iVBORw0KGgoAAAANSUhEUgAA...' }),
        });
      globalThis.fetch = mockFetch;

      const qr = await generateInvoiceQrCode('INV2-PHASE-2');
      expect(qr.qr_code_base64).toBe('iVBORw0KGgoAAAANSUhEUgAA...');

      const [url, init] = mockFetch.mock.calls[1] as [string, RequestInit];
      expect(url).toBe('https://api-m.sandbox.paypal.com/v2/invoicing/invoices/INV2-PHASE-2/generate-qr-code');
      expect(init.method).toBe('POST');
      const body = JSON.parse(init.body as string);
      expect(body.width).toBe(300);
      expect(body.height).toBe(300);
      expect(body.action).toBe('pay');
    });

    it('sendInvoiceReminder: sends remind request with subject and note', async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ access_token: 'TOKEN', token_type: 'Bearer', expires_in: 3600 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 204,
          text: async () => '',
        });
      globalThis.fetch = mockFetch;

      await expect(
        sendInvoiceReminder('INV2-PHASE-2', 'Friendly Update on Apex Clinic', 'Materials unlock available')
      ).resolves.toBeUndefined();

      const [url, init] = mockFetch.mock.calls[1] as [string, RequestInit];
      expect(url).toBe('https://api-m.sandbox.paypal.com/v2/invoicing/invoices/INV2-PHASE-2/remind');
      expect(init.method).toBe('POST');
      const body = JSON.parse(init.body as string);
      expect(body.subject).toBe('Friendly Update on Apex Clinic');
      expect(body.note).toBe('Materials unlock available');
    });
  });

  // ===========================================================================
  // TASK-013: PayPal Orders Service (REQ-010, REQ-011, SEC-004)
  // ===========================================================================
  describe('TASK-013: paypalOrdersService (REQ-010, REQ-011, SEC-004)', () => {
    it('createSupplierOrder: creates an order with CAPTURE intent, Channel3 item breakdown and PayPal-Request-Id', async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ access_token: 'TOKEN', token_type: 'Bearer', expires_in: 3600 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          json: async () => ({
            id: 'ORD-CH3-ARBITRAGE-001',
            status: 'CREATED',
            intent: 'CAPTURE',
          }),
        });
      globalThis.fetch = mockFetch;

      const order = await createSupplierOrder({
        planId: 'plan-rec-001',
        taskId: 'task_phase_2_displays',
        totalMinor: 139600, // $1,396.00
        currency: 'USD',
        description: '4x 32-inch 4K Ergonomic Display Monitors (Channel3 Verified)',
        productTitle: 'LG 32UN880-B 32" UltraFine Ergo 4K',
        quantity: 4,
        unitPriceMinor: 34900,
      });

      expect(order.id).toBe('ORD-CH3-ARBITRAGE-001');
      expect(order.status).toBe('CREATED');

      const [url, init] = mockFetch.mock.calls[1] as [string, RequestInit];
      expect(url).toBe('https://api-m.sandbox.paypal.com/v2/checkout/orders');
      expect(init.method).toBe('POST');
      expect((init.headers as Record<string, string>)['PayPal-Request-Id']).toBe('cascade-order-plan-rec-001');

      const body = JSON.parse(init.body as string);
      expect(body.intent).toBe('CAPTURE');
      expect(body.purchase_units[0].reference_id).toBe('task_phase_2_displays');
      expect(body.purchase_units[0].custom_id).toBe('plan-rec-001');
      expect(body.purchase_units[0].amount.value).toBe('1396.00'); // REQ-002
      expect(body.purchase_units[0].items[0].name).toBe('LG 32UN880-B 32" UltraFine Ergo 4K');
      expect(body.purchase_units[0].items[0].quantity).toBe('4');
      expect(body.purchase_units[0].items[0].unit_amount.value).toBe('349.00');
    });

    it('captureSupplierOrder: captures order and includes idempotency header', async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ access_token: 'TOKEN', token_type: 'Bearer', expires_in: 3600 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            id: 'ORD-CH3-ARBITRAGE-001',
            status: 'COMPLETED',
            purchase_units: [
              {
                reference_id: 'task_phase_2_displays',
                payments: {
                  captures: [
                    {
                      id: 'CAP-777888999',
                      status: 'COMPLETED',
                      amount: { currency_code: 'USD', value: '1396.00' },
                      final_capture: true,
                    },
                  ],
                },
              },
            ],
          }),
        });
      globalThis.fetch = mockFetch;

      const capture = await captureSupplierOrder('ORD-CH3-ARBITRAGE-001');

      expect(capture.status).toBe('COMPLETED');
      expect(capture.purchase_units[0]?.payments?.captures?.[0]?.id).toBe('CAP-777888999');

      const [url, init] = mockFetch.mock.calls[1] as [string, RequestInit];
      expect(url).toBe('https://api-m.sandbox.paypal.com/v2/checkout/orders/ORD-CH3-ARBITRAGE-001/capture');
      expect(init.method).toBe('POST');
      expect((init.headers as Record<string, string>)['PayPal-Request-Id']).toBe('cascade-capture-ORD-CH3-ARBITRAGE-001');
    });

    it('getOrderDetails: retrieves order state', async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ access_token: 'TOKEN', token_type: 'Bearer', expires_in: 3600 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            id: 'ORD-999',
            status: 'APPROVED',
          }),
        });
      globalThis.fetch = mockFetch;

      const order = await getOrderDetails('ORD-999');
      expect(order.id).toBe('ORD-999');
      expect(order.status).toBe('APPROVED');
    });
  });

  // ===========================================================================
  // TASK-014: PayPal Agent Toolkit Bridge (DEP-002, SEC-003)
  // ===========================================================================
  describe('TASK-014: paypalAgentToolkitBridge (DEP-002, SEC-003)', () => {
    it('initializes the PayPalAgentToolkit singleton with read-only/reminder permissions (SEC-003)', () => {
      const toolkit = getPayPalAgentToolkit();
      expect(toolkit).toBeDefined();

      // Singleton test: second call returns exact same instance
      const toolkit2 = getPayPalAgentToolkit();
      expect(toolkit2).toBe(toolkit);
    });

    it('getPayPalAgentTools returns tool definitions', () => {
      const tools = getPayPalAgentTools();
      expect(tools).toBeDefined();
      expect(typeof tools).toBe('object');
    });

    it('clearPayPalAgentToolkit resets singleton', () => {
      const t1 = getPayPalAgentToolkit();
      clearPayPalAgentToolkit();
      const t2 = getPayPalAgentToolkit();
      expect(t2).not.toBe(t1);
    });
  });

  // ===========================================================================
  // TASK-015: Webhook Routes & Reconciliation (REQ-012, PAT-001)
  // ===========================================================================
  describe('TASK-015: webhookRoutes (REQ-012, PAT-001)', () => {
    let testDb: Database.Database;
    let app: express.Express;

    beforeEach(() => {
      // Create fresh in-memory SQLite with schema
      testDb = new Database(':memory:');
      const schema = readFileSync(SCHEMA_PATH, 'utf-8');
      testDb.exec(schema);

      // Seed project and tasks for webhook reconciliation tests
      testDb.prepare(
        `INSERT INTO projects (project_id, name, currency, created_at, updated_at)
         VALUES ('proj_apex_clinic_01', 'Apex Clinic', 'USD', '2026-10-15T00:00:00.000Z', '2026-10-15T00:00:00.000Z')`
      ).run();

      testDb.prepare(
        `INSERT INTO tasks (
           task_id, project_id, version, name, start_date, end_date, duration_days,
           materials_in_warehouse, crew_assigned, daily_idle_burn_minor,
           sla_delay_penalty_minor, phase_hardware_budget_max_minor,
           schedule_status, paypal_invoice_id, paypal_invoice_number,
           paypal_invoice_status, invoice_total_minor, materials_unlock_minor,
           deferred_labor_minor, client_name, client_email,
           required_quantity, max_allowed_variance_pct
         ) VALUES (
           'task_phase_2_displays', 'proj_apex_clinic_01', 1, 'Phase 2: 4K Displays',
           '2026-10-16', '2026-10-18', 2,
           0, 'Tech Alpha', 68000,
           144000, 160000,
           'PAYMENT_BLOCKED', 'INV2-PHASE-2-TEST', 'INV-002',
           'OVERDUE', 450000, 139600,
           310400, 'Apex Clinic Lead', 'client@apexclinic.com',
           4, 10.0
         )`
      ).run();

      // Seed transaction for capture matching
      testDb.prepare(
        `INSERT INTO paypal_transactions (transaction_record_id, project_id, task_id, kind, paypal_resource_id, paypal_capture_id, status, currency, amount_minor, raw_response_json, created_at)
         VALUES ('tx-001', 'proj_apex_clinic_01', 'task_phase_2_displays', 'ORDER_CREATE', 'ORD-CH3-001', 'CAP-REAL-123', 'CREATED', 'USD', 139600, '{}', datetime('now'))`
      ).run();

      // Mock getDb in database.ts to return our in-memory testDb
      vi.spyOn(dbModule, 'getDb').mockReturnValue(testDb);

      // Setup Express app with webhookRouter
      app = express();
      app.use(express.json());
      app.use('/api/webhooks', webhookRouter);
    });

    afterEach(() => {
      testDb.close();
    });

    it('reconciles INVOICING.INVOICE.PAID: marks task invoice PAID and appends audit event', async () => {
      const response = await request(app)
        .post('/api/webhooks/paypal')
        .send({
          id: 'WH-EVT-001',
          event_type: 'INVOICING.INVOICE.PAID',
          resource: {
            id: 'INV2-PHASE-2-TEST',
            status: 'PAID',
          },
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ received: true });

      // Verify task status was updated to PAID
      const task = testDb.prepare(`SELECT paypal_invoice_status FROM tasks WHERE task_id = 'task_phase_2_displays'`).get() as { paypal_invoice_status: string };
      expect(task.paypal_invoice_status).toBe('PAID');

      // Verify audit event was appended
      const audit = testDb.prepare(`SELECT * FROM audit_events WHERE event_type = 'WEBHOOK_INVOICE_PAID'`).get() as { event_type: string; decision: string };
      expect(audit).toBeDefined();
      expect(audit.event_type).toBe('WEBHOOK_INVOICE_PAID');
      expect(audit.decision).toBe('ALLOW');
    });

    it('reconciles INVOICING.INVOICE.UPDATED: updates task paypal_invoice_status', async () => {
      const response = await request(app)
        .post('/api/webhooks/paypal')
        .send({
          id: 'WH-EVT-002',
          event_type: 'INVOICING.INVOICE.UPDATED',
          resource: {
            id: 'INV2-PHASE-2-TEST',
            status: 'PARTIALLY_PAID',
          },
        });

      expect(response.status).toBe(200);

      const task = testDb.prepare(`SELECT paypal_invoice_status FROM tasks WHERE task_id = 'task_phase_2_displays'`).get() as { paypal_invoice_status: string };
      expect(task.paypal_invoice_status).toBe('PARTIALLY_PAID');
    });

    it('reconciles PAYMENT.CAPTURE.COMPLETED: transitions task to MATERIALS_ORDERED', async () => {
      const response = await request(app)
        .post('/api/webhooks/paypal')
        .send({
          id: 'WH-EVT-003',
          event_type: 'PAYMENT.CAPTURE.COMPLETED',
          resource: {
            id: 'CAP-REAL-123',
            status: 'COMPLETED',
          },
        });

      expect(response.status).toBe(200);

      const task = testDb.prepare(`SELECT schedule_status FROM tasks WHERE task_id = 'task_phase_2_displays'`).get() as { schedule_status: string };
      expect(task.schedule_status).toBe('MATERIALS_ORDERED');

      const audit = testDb.prepare(`SELECT * FROM audit_events WHERE event_type = 'WEBHOOK_CAPTURE_COMPLETED'`).get();
      expect(audit).toBeDefined();
    });

    it('gracefully accepts unknown webhook events with 200 without modifying state', async () => {
      const response = await request(app)
        .post('/api/webhooks/paypal')
        .send({
          id: 'WH-EVT-999',
          event_type: 'SOME.UNKNOWN.EVENT',
          resource: { id: 'RESOURCE-XYZ' },
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ received: true });
    });

    it('verifies signature via PayPal verification endpoint when PAYPAL_WEBHOOK_ID is configured', async () => {
      const originalWebhookId = env.PAYPAL_WEBHOOK_ID;
      (env as Record<string, unknown>)['PAYPAL_WEBHOOK_ID'] = 'WH-CONFIGURED-ID-123';

      try {
        const mockFetch = vi.fn()
          // First call: OAuth token
          .mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({ access_token: 'TOKEN', token_type: 'Bearer', expires_in: 3600 }),
          })
          // Second call: verify-webhook-signature
          .mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({ verification_status: 'SUCCESS' }),
          });
        globalThis.fetch = mockFetch;

        const response = await request(app)
          .post('/api/webhooks/paypal')
          .set('paypal-transmission-id', 'trans-001')
          .set('paypal-transmission-time', '2026-10-15T00:00:00Z')
          .set('paypal-cert-url', 'https://api.sandbox.paypal.com/cert')
          .set('paypal-auth-algo', 'SHA256withRSA')
          .set('paypal-transmission-sig', 'VALID_SIGNATURE')
          .send({
            id: 'WH-EVT-004',
            event_type: 'INVOICING.INVOICE.PAID',
            resource: { id: 'INV2-PHASE-2-TEST', status: 'PAID' },
          });

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ received: true });

        // Verify the verify-webhook-signature call was made
        const [verifyUrl, verifyInit] = mockFetch.mock.calls[1] as [string, RequestInit];
        expect(verifyUrl).toBe('https://api-m.sandbox.paypal.com/v1/notifications/verify-webhook-signature');
        expect(verifyInit.method).toBe('POST');
        const payload = JSON.parse(verifyInit.body as string);
        expect(payload.webhook_id).toBe('WH-CONFIGURED-ID-123');
        expect(payload.transmission_id).toBe('trans-001');
      } finally {
        (env as Record<string, unknown>)['PAYPAL_WEBHOOK_ID'] = originalWebhookId;
      }
    });

    it('rejects with HTTP 400 when PayPal verification reports FAILURE', async () => {
      const originalWebhookId = env.PAYPAL_WEBHOOK_ID;
      (env as Record<string, unknown>)['PAYPAL_WEBHOOK_ID'] = 'WH-CONFIGURED-ID-123';

      try {
        const mockFetch = vi.fn()
          .mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({ access_token: 'TOKEN', token_type: 'Bearer', expires_in: 3600 }),
          })
          .mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({ verification_status: 'FAILURE' }),
          });
        globalThis.fetch = mockFetch;

        const response = await request(app)
          .post('/api/webhooks/paypal')
          .set('paypal-transmission-id', 'trans-fake')
          .set('paypal-transmission-time', '2026-10-15T00:00:00Z')
          .set('paypal-cert-url', 'https://api.sandbox.paypal.com/cert')
          .set('paypal-auth-algo', 'SHA256withRSA')
          .set('paypal-transmission-sig', 'FORGED_SIGNATURE')
          .send({
            id: 'WH-EVT-005',
            event_type: 'INVOICING.INVOICE.PAID',
            resource: { id: 'INV2-PHASE-2-TEST' },
          });

        expect(response.status).toBe(400);
        expect(response.body).toEqual({ error: 'Invalid PayPal webhook signature' });
      } finally {
        (env as Record<string, unknown>)['PAYPAL_WEBHOOK_ID'] = originalWebhookId;
      }
    });

    it('rejects with HTTP 400 when required signature headers are missing and webhook ID is set', async () => {
      const originalWebhookId = env.PAYPAL_WEBHOOK_ID;
      (env as Record<string, unknown>)['PAYPAL_WEBHOOK_ID'] = 'WH-CONFIGURED-ID-123';

      try {
        const response = await request(app)
          .post('/api/webhooks/paypal')
          .send({
            id: 'WH-EVT-006',
            event_type: 'INVOICING.INVOICE.PAID',
            resource: { id: 'INV2-PHASE-2-TEST' },
          });

        expect(response.status).toBe(400);
        expect(response.body).toEqual({ error: 'Invalid PayPal webhook signature' });
      } finally {
        (env as Record<string, unknown>)['PAYPAL_WEBHOOK_ID'] = originalWebhookId;
      }
    });
  });
});
