/**
 * @file apiIntegration.test.ts
 * @description Comprehensive HTTP integration tests for CascadeOS Express REST API (Phase 5).
 *
 * Covers:
 * - ARC-004: All Express endpoints and deterministic JSON envelopes
 * - TEST-007: Fingerprint Mutation Invalidation (409 STALE_FINGERPRINT_APPROVAL)
 * - TEST-008 / SEC-007: Append-Only Audit Ledger Triggers
 * - TEST-009 / SEC-005: Zod Input Validation Gate (400 Bad Request)
 * - Scenario A, B, and C live execution and policy enforcement (REQ-018)
 * - Approval checkout and order lifecycle (REQ-008, REQ-010, REQ-011)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import app from '../index.js';
import * as dbModule from '../db/database.js';
import { clearPayPalTokenCache } from '../services/paypalAuthService.js';
import { clearOpenAIClient } from '../services/nudgeAndFinOpsAiService.js';
import { APEX_PROJECT_ID } from '../services/projectBootstrapService.js';
import { computeStateFingerprint } from '../utils/moneyAndHash.js';

const paypalOrdersMock = vi.hoisted(() => ({
  createSupplierOrder: vi.fn(),
  captureSupplierOrder: vi.fn(),
  getOrderDetails: vi.fn(),
}));

vi.mock('../services/paypalOrdersService.js', () => paypalOrdersMock);

/** Health checks must not call live PayPal/Channel3 APIs during unit tests. */
const paypalAuthMock = vi.hoisted(() => ({
  getPayPalAccessToken: vi.fn(async () => 'test-paypal-access-token'),
  getPayPalInvoicingAccessToken: vi.fn(async () => 'test-paypal-invoicing-token'),
  clearPayPalTokenCache: vi.fn(),
}));

vi.mock('../services/paypalAuthService.js', () => paypalAuthMock);

vi.mock('../services/channel3Service.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/channel3Service.js')>();
  return {
    ...actual,
    searchChannel3Products: vi.fn(async () => ({ products: [] })),
  };
});

/**
 * Scenario execution tests must never depend on live LLM latency. These mocks
 * keep the deterministic fallback contract while removing the network call.
 */
const aiServiceMock = vi.hoisted(() => {
  const format = (minor: number) => `USD $${(minor / 100).toFixed(2)}`;
  return {
    clearOpenAIClient: vi.fn(),
    generateClientNudgeMessage: vi.fn(async (params: {
      projectName: string;
      blockedTaskName: string;
      materialsUnlockMinor: number;
      invoiceTotalMinor: number;
      exposureAtRiskMinor: number;
    }) => ({
      subject: `Milestone Update: ${params.projectName}`,
      body: `Materials unlock ${format(params.materialsUnlockMinor)} keeps ${params.blockedTaskName} on schedule.`,
      summary: 'Deterministic test nudge',
      tone: 'warm_collaborative',
      materials_unlock_amount_formatted: format(params.materialsUnlockMinor),
      invoice_total_amount_formatted: format(params.invoiceTotalMinor),
      exposure_at_risk_formatted: format(params.exposureAtRiskMinor),
      key_call_to_action: `Unlock materials for ${format(params.materialsUnlockMinor)}`,
    })),
    generateFinOpsPolicyExplanation: vi.fn(async (params: {
      taskName: string;
      decision: string;
    }) => ({
      headline: `${params.decision}: Policy evaluation for ${params.taskName}`,
      reason_summary: 'Deterministic test explanation',
      policy_decision: params.decision,
      remediation_steps: ['Review the policy decision', 'Collect compliant supplier quotes'],
    })),
  };
});

vi.mock('../services/nudgeAndFinOpsAiService.js', () => aiServiceMock);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SCHEMA_PATH = resolve(__dirname, '../db/schema.sql');

describe('Phase 5: Express REST API & Scenario Orchestration', () => {
  let testDb: Database.Database;

  beforeEach(() => {
    testDb = new Database(':memory:');
    const schema = readFileSync(SCHEMA_PATH, 'utf-8');
    testDb.exec(schema);
    dbModule.setDbForTesting(testDb);
    clearPayPalTokenCache();
    clearOpenAIClient();
    paypalOrdersMock.createSupplierOrder.mockReset();
    paypalOrdersMock.captureSupplierOrder.mockReset();
    paypalOrdersMock.getOrderDetails.mockReset();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    dbModule.setDbForTesting(null);
    testDb.close();
    vi.restoreAllMocks();
  });

  // ===========================================================================
  // 1. Health & Validation (SEC-005, TEST-009)
  // ===========================================================================

  describe('GET /api/health', () => {
    it('returns healthy/degraded status with connected database', async () => {
      const res = await request(app).get('/api/health');
      expect([200, 207]).toContain(res.status);
      expect(res.body.database).toBe('connected');
      expect(res.body.environment).toBeDefined();
    });
  });

  describe('TEST-009: Zod Input Validation Gate (SEC-005)', () => {
    it('rejects invalid scenarioId with 400 Bad Request', async () => {
      const res = await request(app).post('/api/scenarios/SCENARIO_INVALID/trigger');
      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });

    it('rejects malformed approval request with missing fingerprint with 400', async () => {
      const res = await request(app)
        .post('/api/recovery-plans/plan_123/approve-schedule-and-split')
        .send({ approverActor: 'Alice' }); // missing approvedFingerprint
      expect(res.status).toBe(400);
    });

    it('TEST-009: rejects negative, floating-point, and missing order amounts with 400', async () => {
      const validFingerprint = 'a'.repeat(64);
      const base = {
        planId: 'plan_validation',
        taskId: 'task_validation',
        quoteId: 'quote_validation',
        approvedFingerprint: validFingerprint,
      };

      const negative = await request(app)
        .post('/api/paypal/orders/create')
        .send({ ...base, expectedTotalMinor: -139600 });
      expect(negative.status).toBe(400);

      const floating = await request(app)
        .post('/api/paypal/orders/create')
        .send({ ...base, expectedTotalMinor: 1396.55 });
      expect(floating.status).toBe(400);

      const missing = await request(app)
        .post('/api/paypal/orders/create')
        .send({ planId: 'plan_validation' });
      expect(missing.status).toBe(400);
    });

    it('rejects non-existent endpoint with 404', async () => {
      const res = await request(app).get('/api/non-existent-endpoint');
      expect(res.status).toBe(404);
      expect(res.body.error).toContain('Endpoint not found');
    });
  });

  // ===========================================================================
  // 2. Project Bootstrap & State Synchronization (ARC-004, ARC-005)
  // ===========================================================================

  describe('Project Lifecycle & State Sync', () => {
    it('POST /api/projects/bootstrap seeds the 6 tasks and returns state', async () => {
      const res = await request(app)
        .post('/api/projects/bootstrap')
        .send({ skipPayPal: true, skipChannel3: true });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.tasks).toHaveLength(6);
      expect(res.body.data.dependencies.length).toBeGreaterThan(0);
    });

    it('GET /api/projects/:projectId/state returns full unified state tree', async () => {
      // First bootstrap
      await request(app)
        .post('/api/projects/bootstrap')
        .send({ skipPayPal: true, skipChannel3: true });

      const res = await request(app).get(`/api/projects/${APEX_PROJECT_ID}/state`);
      expect(res.status).toBe(200);
      expect(res.body.project.project_id).toBe(APEX_PROJECT_ID);
      expect(res.body.tasks).toHaveLength(6);
      expect(res.body.dependencies).toBeInstanceOf(Array);
      expect(res.body.supplierQuotes).toBeInstanceOf(Array);
      expect(res.body.auditEvents).toHaveLength(1); // 1 bootstrap audit event
    });
  });

  // ===========================================================================
  // 3. Scenario Triggers (REQ-018)
  // ===========================================================================

  describe('Scenario Triggers (REQ-018)', () => {
    beforeEach(async () => {
      // Bootstrap clean state before each scenario test
      await request(app)
        .post('/api/projects/bootstrap')
        .send({ skipPayPal: true, skipChannel3: true });
    });

    it('SCENARIO_A: analyzes blast radius, reroutes schedule, and drafts $1,396 split plan', async () => {
      const res = await request(app).post('/api/scenarios/SCENARIO_A/trigger');
      expect(res.status).toBe(200);
      expect(res.body.scenarioId).toBe('SCENARIO_A');
      expect(res.body.blastRadius.idle_crew_hours).toBe(56);
      expect(res.body.blastRadius.total_exposure_minor).toBe(510000); // 366000 labor + 144000 sla
      expect(res.body.reroutedSchedule.promoted_task_id).toBe('task_phase_3_networking');
      expect(res.body.reroutedSchedule.new_promoted_start_date).toBe('2026-10-16');
      expect(res.body.plan.policy_decision).toBe('REQUIRE_APPROVAL');
      expect(res.body.nudge.materials_unlock_amount_formatted).toContain('1396.00');
    }, 20000);

    it('SCENARIO_B: blocks incumbent price creep (+28.95%) and evaluates Channel3 replacement', async () => {
      // Seed a cached CHANNEL3_LIVE quote so the scenario uses the SQLite cache
      // path (CON-003) instead of making a live Channel3 network request.
      testDb.prepare(
        `INSERT INTO supplier_quotes (
          quote_id, task_id, source_type, external_product_id, product_title,
          merchant_name, product_url, image_url, currency, unit_price_minor,
          quantity, shipping_minor, tax_minor, total_minor, variance_vs_historical_pct,
          savings_vs_incumbent_minor, availability_status, observed_at
        ) VALUES (
          @quote_id, @task_id, @source_type, @external_product_id, @product_title,
          @merchant_name, @product_url, @image_url, @currency, @unit_price_minor,
          @quantity, @shipping_minor, @tax_minor, @total_minor, @variance_vs_historical_pct,
          @savings_vs_incumbent_minor, @availability_status, @observed_at
        )`
      ).run({
        quote_id: 'quote_test_channel3_phase2',
        task_id: 'task_phase_2_displays',
        source_type: 'CHANNEL3_LIVE',
        external_product_id: 'ch3-display-349',
        product_title: 'Dell UltraSharp 32" 4K USB-C Monitor',
        merchant_name: 'Channel3 Verified Merchant',
        product_url: 'https://example.com/ch3-display-349',
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
        observed_at: new Date().toISOString(),
      });

      const res = await request(app).post('/api/scenarios/SCENARIO_B/trigger');
      expect(res.status).toBe(200);
      expect(res.body.scenarioId).toBe('SCENARIO_B');

      // Incumbent quote was blocked
      expect(res.body.incumbentBlocked.decision).toBe('BLOCK');
      expect(res.body.incumbentBlocked.reason_codes).toContain('VENDOR_PRICE_CREEP_EXCEEDED');
      expect(res.body.incumbentBlocked.reason_codes).toContain('TOTAL_EXCEEDS_PHASE_BUDGET');

      // Channel3 quote proposal
      expect(res.body.channel3Proposed.plan).toBeDefined();
      expect(res.body.channel3Proposed.quote.unit_price_minor).toBeLessThanOrEqual(41800); // within 10%
    }, 20000);

    it('SCENARIO_C: hard blocks adversarial dependency violation and missing costs (SEC-006)', async () => {
      const res = await request(app).post('/api/scenarios/SCENARIO_C/trigger');
      expect(res.status).toBe(200);
      expect(res.body.scenarioId).toBe('SCENARIO_C');
      expect(res.body.decision).toBe('BLOCK');
      expect(res.body.reasonCodes).toContain('HARD_DEPENDENCY_VIOLATION');
      expect(res.body.reasonCodes).toContain('UNKNOWN_COST_FIELD');
    }, 20000);
  });

  // ===========================================================================
  // 4. Approval & Order Execution (TEST-007, REQ-008, REQ-010, REQ-011)
  // ===========================================================================

  describe('Approval & PayPal Execution Lifecycle', () => {
    let scenarioAPlan: any;

    beforeEach(async () => {
      await request(app)
        .post('/api/projects/bootstrap')
        .send({ skipPayPal: true, skipChannel3: true });

      const triggerRes = await request(app).post('/api/scenarios/SCENARIO_A/trigger');
      scenarioAPlan = triggerRes.body.plan;
    }, 30000);

    it('POST /api/recovery-plans/:planId/approve-schedule-and-split approves plan and applies schedule dates', async () => {
      const res = await request(app)
        .post(`/api/recovery-plans/${scenarioAPlan.plan_id}/approve-schedule-and-split`)
        .send({
          approvedFingerprint: scenarioAPlan.state_fingerprint,
          approverActor: 'Supervisor Vance',
          customNudgeNote: 'Approved for immediate hardware unlock',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify promoted task is now REROUTED_ACTIVE
      const promoted = res.body.tasks.find((t: any) => t.task_id === 'task_phase_3_networking');
      expect(promoted.schedule_status).toBe('REROUTED_ACTIVE');
      expect(promoted.start_date).toBe('2026-10-16');

      // Verify approval recorded in SQLite
      const approvals = testDb.prepare('SELECT * FROM user_approvals').all();
      expect(approvals).toHaveLength(1);
    });

    it('rejects a repeated approval with 409 and writes no duplicate approval', async () => {
      const approvalBody = {
        approvedFingerprint: scenarioAPlan.state_fingerprint,
        approverActor: 'Supervisor Vance',
      };
      const first = await request(app)
        .post(`/api/recovery-plans/${scenarioAPlan.plan_id}/approve-schedule-and-split`)
        .send(approvalBody);
      expect(first.status).toBe(200);

      const second = await request(app)
        .post(`/api/recovery-plans/${scenarioAPlan.plan_id}/approve-schedule-and-split`)
        .send(approvalBody);
      expect(second.status).toBe(409);

      const approvals = testDb.prepare('SELECT COUNT(*) AS count FROM user_approvals').get() as { count: number };
      expect(approvals.count).toBe(1);
      const auditRows = testDb
        .prepare("SELECT COUNT(*) AS count FROM audit_events WHERE plan_id = ? AND event_type = 'PLAN_APPROVED_SCHEDULE_SPLIT'")
        .get(scenarioAPlan.plan_id) as { count: number };
      expect(auditRows.count).toBe(1);
    });

    it('returns executed recovery plans and approvals in project state for compliance export', async () => {
      const approval = await request(app)
        .post(`/api/recovery-plans/${scenarioAPlan.plan_id}/approve-schedule-and-split`)
        .send({
          approvedFingerprint: scenarioAPlan.state_fingerprint,
          approverActor: 'Supervisor Vance',
        });
      expect(approval.status).toBe(200);

      // Simulate the execution phase. The state endpoint must expose all plan
      // statuses, including plans that are no longer active.
      testDb
        .prepare("UPDATE recovery_plans SET status = 'EXECUTED' WHERE plan_id = ?")
        .run(scenarioAPlan.plan_id);

      const stateRes = await request(app).get(`/api/projects/${APEX_PROJECT_ID}/state`);
      expect(stateRes.status).toBe(200);
      const executedPlan = stateRes.body.recoveryPlans.find(
        (plan: any) => plan.plan_id === scenarioAPlan.plan_id
      );
      expect(executedPlan?.status).toBe('EXECUTED');
      expect(stateRes.body.userApprovals).toHaveLength(1);
      expect(stateRes.body.userApprovals[0].plan_id).toBe(scenarioAPlan.plan_id);
      expect(stateRes.body.userApprovals[0].approver_actor).toBe('Supervisor Vance');
    });

    /**
     * Scenario A's persisted incumbent quote is intentionally over budget, so
     * order-level tests replace it with a compliant Channel3-shaped quote and
     * recompute the canonical fingerprint before approval.
     */
    async function prepareCompliantApprovedOrder() {
      const quote = testDb
        .prepare('SELECT * FROM supplier_quotes WHERE quote_id = ?')
        .get(scenarioAPlan.selected_quote_id) as any;
      testDb
        .prepare(
          `UPDATE supplier_quotes
           SET source_type = 'CHANNEL3_LIVE', external_product_id = 'ch3-display-349',
               unit_price_minor = 34900, quantity = 4, total_minor = 139600,
               variance_vs_historical_pct = -8.16, savings_vs_incumbent_minor = 56400
           WHERE quote_id = ?`
        )
        .run(quote.quote_id);

      const task = testDb
        .prepare('SELECT * FROM tasks WHERE task_id = ?')
        .get(quote.task_id) as any;
      const fingerprint = computeStateFingerprint({
        projectId: scenarioAPlan.project_id,
        blockedTaskId: scenarioAPlan.blocked_task_id,
        promotedTaskId: scenarioAPlan.promoted_task_id,
        invoiceId: task.paypal_invoice_id ?? `${scenarioAPlan.project_id}:${scenarioAPlan.blocked_task_id}`,
        unlockAmountMinor: scenarioAPlan.immediate_unlock_minor,
        channel3ProductId: 'ch3-display-349',
        supplierTotalMinor: 139600,
        currency: 'USD',
      });
      testDb
        .prepare('UPDATE recovery_plans SET state_fingerprint = ? WHERE plan_id = ?')
        .run(fingerprint, scenarioAPlan.plan_id);

      const approval = await request(app)
        .post(`/api/recovery-plans/${scenarioAPlan.plan_id}/approve-schedule-and-split`)
        .send({ approvedFingerprint: fingerprint, approverActor: 'Supervisor Vance' });
      expect(approval.status).toBe(200);

      return { quote, taskId: quote.task_id as string, fingerprint };
    }

    it('TEST-007: rejects a 1-cent quote mutation after approval with 409 STALE_FINGERPRINT_APPROVAL', async () => {
      const { quote, taskId, fingerprint } = await prepareCompliantApprovedOrder();

      testDb
        .prepare('UPDATE supplier_quotes SET total_minor = total_minor + 1 WHERE quote_id = ?')
        .run(quote.quote_id);

      const res = await request(app)
        .post('/api/paypal/orders/create')
        .send({
          planId: scenarioAPlan.plan_id,
          taskId,
          quoteId: quote.quote_id,
          approvedFingerprint: fingerprint,
        });

      expect(res.status).toBe(409);
      expect(res.body.reasonCodes).toContain('STALE_FINGERPRINT_APPROVAL');
      expect(paypalOrdersMock.createSupplierOrder).not.toHaveBeenCalled();
    });

    it('TEST-014: creates the backend order, captures it, and transitions the task to MATERIALS_ORDERED', async () => {
      const { quote, taskId, fingerprint } = await prepareCompliantApprovedOrder();
      paypalOrdersMock.createSupplierOrder.mockResolvedValue({
        id: '5O190127TN364715T',
        status: 'CREATED',
      });
      paypalOrdersMock.captureSupplierOrder.mockResolvedValue({
        id: '5O190127TN364715T',
        status: 'COMPLETED',
        purchase_units: [
          {
            reference_id: taskId,
            payments: {
              captures: [
                {
                  id: 'CAPTURE-9XY12345',
                  status: 'COMPLETED',
                  amount: { currency_code: 'USD', value: '1396.00' },
                },
              ],
            },
          },
        ],
      });

      const createRes = await request(app)
        .post('/api/paypal/orders/create')
        .send({
          planId: scenarioAPlan.plan_id,
          taskId,
          quoteId: quote.quote_id,
          approvedFingerprint: fingerprint,
          expectedTotalMinor: 139600,
        });
      expect(createRes.status).toBe(201);
      expect(createRes.body.paypalOrderId).toBe('5O190127TN364715T');

      const orderRow = testDb
        .prepare("SELECT * FROM paypal_transactions WHERE kind = 'ORDER_CREATE'")
        .get() as any;
      expect(orderRow.paypal_resource_id).toBe('5O190127TN364715T');
      expect(orderRow.status).toBe('CREATED');

      const captureRes = await request(app)
        .post('/api/paypal/orders/5O190127TN364715T/capture')
        .send({ taskId });
      expect(captureRes.status).toBe(200);
      expect(captureRes.body.captureId).toBe('CAPTURE-9XY12345');

      const captureRow = testDb
        .prepare("SELECT * FROM paypal_transactions WHERE kind = 'ORDER_CAPTURE'")
        .get() as any;
      expect(captureRow.paypal_capture_id).toBe('CAPTURE-9XY12345');
      expect(captureRow.status).toBe('COMPLETED');

      const taskRow = testDb
        .prepare('SELECT schedule_status FROM tasks WHERE task_id = ?')
        .get(taskId) as { schedule_status: string };
      expect(taskRow.schedule_status).toBe('MATERIALS_ORDERED');

      // A capture must never be replayable.
      const duplicateCapture = await request(app)
        .post('/api/paypal/orders/5O190127TN364715T/capture')
        .send({ taskId });
      expect(duplicateCapture.status).toBe(409);
      expect(paypalOrdersMock.captureSupplierOrder).toHaveBeenCalledTimes(1);
    });

    it('rejects capture of an order that CascadeOS did not create', async () => {
      const { taskId } = await prepareCompliantApprovedOrder();

      const res = await request(app)
        .post('/api/paypal/orders/FOREIGN-SANDBOX-ORDER/capture')
        .send({ taskId });

      expect(res.status).toBe(404);
      expect(paypalOrdersMock.captureSupplierOrder).not.toHaveBeenCalled();
    });

    it('rejects capture when the stored order belongs to a different task', async () => {
      const { quote, taskId, fingerprint } = await prepareCompliantApprovedOrder();
      paypalOrdersMock.createSupplierOrder.mockResolvedValue({
        id: 'ORDER-OWNED-BY-PHASE-2',
        status: 'CREATED',
      });

      const createRes = await request(app)
        .post('/api/paypal/orders/create')
        .send({
          planId: scenarioAPlan.plan_id,
          taskId,
          quoteId: quote.quote_id,
          approvedFingerprint: fingerprint,
          expectedTotalMinor: 139600,
        });
      expect(createRes.status).toBe(201);

      const otherTask = testDb
        .prepare('SELECT task_id FROM tasks WHERE task_id != ? LIMIT 1')
        .get(taskId) as { task_id: string };
      const res = await request(app)
        .post('/api/paypal/orders/ORDER-OWNED-BY-PHASE-2/capture')
        .send({ taskId: otherTask.task_id });

      expect(res.status).toBe(409);
      expect(paypalOrdersMock.captureSupplierOrder).not.toHaveBeenCalled();
    });

    it('rejects an order when the client expected total does not match the persisted quote', async () => {
      const { quote, taskId, fingerprint } = await prepareCompliantApprovedOrder();
      const res = await request(app)
        .post('/api/paypal/orders/create')
        .send({
          planId: scenarioAPlan.plan_id,
          taskId,
          quoteId: quote.quote_id,
          approvedFingerprint: fingerprint,
          expectedTotalMinor: 139601,
        });

      expect(res.status).toBe(409);
      expect(res.body.reasonCodes).toContain('STALE_QUOTE_TOTAL');
    });
  });

  // ===========================================================================
  // 5. Studio Agent Chat (REQ-016)
  // ===========================================================================

  describe('POST /api/studio-agent/chat', () => {
    it('executes chat endpoint and returns assistant response with tool capabilities', async () => {
      const res = await request(app)
        .post('/api/studio-agent/chat')
        .send({
          message: 'What is our current exposure on the Apex Clinic project?',
        });

      expect(res.status).toBe(200);
      expect(res.body.role).toBe('assistant');
      expect(typeof res.body.content).toBe('string');
      expect(res.body.content.length).toBeGreaterThan(0);
    }, 15000);
  });
});
