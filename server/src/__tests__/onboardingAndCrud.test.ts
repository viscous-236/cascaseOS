/**
 * @file onboardingAndCrud.test.ts
 * @description Dynamic onboarding, DAG safety, live provisioning, and task-patch
 * integration tests (TEST-015 through TEST-018).
 *
 * Network access is mocked at the `fetch` boundary so the real PayPal and
 * Channel3 client code, normalization, SQLite persistence, and policy engines
 * all execute. No service-level stubs are used.
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
import { validateAcyclicGraph } from '../engine/dagValidator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SCHEMA_PATH = resolve(__dirname, '../db/schema.sql');

interface CustomTaskFixture {
  task_id: string;
  name: string;
  duration_days: number;
  materials_in_warehouse?: boolean;
  crew_assigned?: string;
  daily_idle_burn_minor?: number;
  sla_delay_penalty_minor?: number;
  phase_hardware_budget_max_minor?: number;
  invoice_total_minor?: number;
  materials_unlock_minor?: number;
  deferred_labor_minor?: number;
  sku_search_query?: string | null;
  required_quantity?: number;
  incumbent_vendor_name?: string | null;
  incumbent_unit_price_minor?: number | null;
  historical_unit_price_minor?: number | null;
  max_allowed_variance_pct?: number;
}

function customTasks(): CustomTaskFixture[] {
  return [
    {
      task_id: 'custom_phase_a',
      name: 'Custom Hardware Install',
      duration_days: 2,
      materials_in_warehouse: false,
      crew_assigned: 'Custom Rigging Crew',
      daily_idle_burn_minor: 60000,
      sla_delay_penalty_minor: 0,
      phase_hardware_budget_max_minor: 200000,
      invoice_total_minor: 250000,
      materials_unlock_minor: 100000,
      deferred_labor_minor: 150000,
      sku_search_query: '32 inch 4K diagnostic display',
      required_quantity: 2,
      incumbent_vendor_name: 'Custom Display Vendor',
      incumbent_unit_price_minor: 49000,
      historical_unit_price_minor: 34900,
      max_allowed_variance_pct: 10,
    },
    {
      task_id: 'custom_phase_b',
      name: 'Custom Calibration',
      duration_days: 2,
      materials_in_warehouse: false,
      crew_assigned: 'Calibration Crew',
      daily_idle_burn_minor: 50000,
      invoice_total_minor: 0,
    },
    {
      task_id: 'custom_phase_c',
      name: 'Custom Network Fitout',
      duration_days: 3,
      materials_in_warehouse: true,
      crew_assigned: 'Network Crew',
      daily_idle_burn_minor: 75000,
      invoice_total_minor: 0,
    },
    {
      task_id: 'custom_phase_d',
      name: 'Custom Handover',
      duration_days: 1,
      materials_in_warehouse: false,
      crew_assigned: 'Handover Crew',
      daily_idle_burn_minor: 40000,
      invoice_total_minor: 0,
    },
  ];
}

function customDependencies() {
  return [
    { from_task_id: 'custom_phase_a', to_task_id: 'custom_phase_b', lag_days: 0 },
    { from_task_id: 'custom_phase_c', to_task_id: 'custom_phase_d', lag_days: 0 },
  ];
}

/**
 * Stubs the network boundary for PayPal Sandbox (OAuth2 + Invoicing v2) and
 * Channel3 search. Returns realistic wire-format payloads so the production
 * clients execute unmodified.
 */
function installLiveNetworkMock(): { invoiceIds: string[] } {
  const invoiceIds: string[] = [];
  let invoiceSeq = 0;

  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = (init?.method ?? 'GET').toUpperCase();
    const body = typeof init?.body === 'string' ? init.body : '';

    if (url.endsWith('/v1/oauth2/token')) {
      return new Response(
        JSON.stringify({
          access_token: 'A21AA-onboarding-test-token',
          token_type: 'Bearer',
          expires_in: 32000,
          scope: 'invoicing',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }

    if (method === 'POST' && url.endsWith('/v2/invoicing/invoices')) {
      invoiceSeq += 1;
      const invoiceId = `INV2-ONBD-${String(invoiceSeq).padStart(4, '0')}-TEST`;
      invoiceIds.push(invoiceId);
      const parsed = JSON.parse(body) as { detail?: { memo?: string } };
      return new Response(
        JSON.stringify({
          id: invoiceId,
          status: 'DRAFT',
          detail: {
            invoice_number: `INV-ONBD-${String(invoiceSeq).padStart(4, '0')}`,
            memo: parsed.detail?.memo ?? null,
            metadata: {
              recipient_view_url: `https://www.sandbox.paypal.com/invoice/p/#${invoiceId}`,
            },
          },
        }),
        { status: 201, headers: { 'content-type': 'application/json' } }
      );
    }

    if (method === 'POST' && /\/v2\/invoicing\/invoices\/[^/]+\/send$/.test(url)) {
      return new Response(null, { status: 204 });
    }

    if (method === 'GET' && /\/v2\/invoicing\/invoices\/[^/]+$/.test(url)) {
      const invoiceId = decodeURIComponent(url.split('/').pop() ?? '');
      return new Response(
        JSON.stringify({
          id: invoiceId,
          status: 'SENT',
          detail: {
            invoice_number: `INV-ONBD-${invoiceId.slice(-9, -5)}`,
            metadata: {
              recipient_view_url: `https://www.sandbox.paypal.com/invoice/p/#${invoiceId}`,
            },
          },
          configuration: {
            partial_payment: {
              allow_partial_payment: true,
              minimum_amount_due: { currency_code: 'USD', value: '1000.00' },
            },
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }

    if (method === 'POST' && url.endsWith('/search')) {
      const parsed = JSON.parse(body) as { query?: string };
      return new Response(
        JSON.stringify({
          products: [
            {
              id: 'ch3_custom_display_01',
              title: `Verified ${parsed.query ?? 'product'}`,
              brands: [{ name: 'Verified Brand' }],
              images: [{ url: 'https://cdn.trychannel3.com/custom-display.png' }],
              offers: [
                {
                  domain: 'verified-supplier.example.com',
                  url: 'https://verified-supplier.example.com/custom-display',
                  price: { price: 349, currency: 'USD' },
                  availability: 'InStock',
                },
              ],
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }

    return new Response(`Unhandled mock route: ${method} ${url}`, { status: 500 });
  });

  vi.stubGlobal('fetch', fetchMock);
  return { invoiceIds };
}

async function createCustomProject() {
  const payload = {
    mode: 'MANUAL_STRUCTURED',
    project_name: 'Custom Robotics Lab Buildout',
    currency: 'USD',
    start_date: '2026-11-02',
    client_name: 'Dr. Custom Client',
    client_email: 'custom.client@example.com',
    tasks: customTasks(),
    dependencies: customDependencies(),
    create_live_paypal_invoices: true,
    run_live_channel3_audit: true,
  };

  const res = await request(app).post('/api/projects/create-custom').send(payload);
  expect(res.status).toBe(201);
  return res.body as {
    project_id: string;
    project: { project_id: string; name: string };
    tasks: Array<{ task_id: string; paypal_invoice_id: string | null; paypal_invoice_view_url: string | null }>;
    dependencies: Array<{ dependency_id: string }>;
    stats: {
      tasks_count: number;
      dependencies_count: number;
      paypal_invoices_created: number;
      channel3_quotes_created: number;
    };
    provisioned_summary: {
      live_paypal_invoices_created: Array<{ task_id: string; paypal_invoice_id: string; status: string }>;
    };
  };
}

describe('Onboarding, DAG safety & interactive CRUD (TEST-015–TEST-018)', () => {
  let testDb: Database.Database;

  beforeEach(() => {
    testDb = new Database(':memory:');
    testDb.exec(readFileSync(SCHEMA_PATH, 'utf-8'));
    dbModule.setDbForTesting(testDb);
    clearPayPalTokenCache();
    clearOpenAIClient();
  });

  afterEach(() => {
    dbModule.setDbForTesting(null);
    testDb.close();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('TEST-015: fails closed with DAG_CYCLE_DETECTED on a cyclic dependency POST', async () => {
    // Direct engine contract: task_1 -> task_2 -> task_3 -> task_1
    const direct = validateAcyclicGraph(
      ['task_1', 'task_2', 'task_3'],
      [
        { from_task_id: 'task_1', to_task_id: 'task_2' },
        { from_task_id: 'task_2', to_task_id: 'task_3' },
        { from_task_id: 'task_3', to_task_id: 'task_1' },
      ]
    );
    expect(direct.valid).toBe(false);
    expect(direct.cycleNodes.length).toBeGreaterThan(0);

    // HTTP contract: bootstrap the canonical chain, then close the cycle.
    const bootstrap = await request(app)
      .post('/api/projects/bootstrap')
      .send({ skipPayPal: true, skipChannel3: true });
    expect(bootstrap.status).toBe(200);

    const cycleRes = await request(app)
      .post('/api/projects/proj_apex_clinic_01/dependencies')
      .send({
        from_task_id: 'task_phase_6_handover',
        to_task_id: 'task_phase_1_wiring',
        lag_days: 0,
      });

    expect(cycleRes.status).toBe(400);
    expect(cycleRes.body.reason).toBe('DAG_CYCLE_DETECTED');
    expect(cycleRes.body.message).toMatch(/circular dependency/i);
    expect(Array.isArray(cycleRes.body.cycleNodes)).toBe(true);

    const persisted = testDb
      .prepare(
        `SELECT COUNT(*) AS count FROM task_dependencies
         WHERE from_task_id = 'task_phase_6_handover'
           AND to_task_id = 'task_phase_1_wiring'`
      )
      .get() as { count: number };
    expect(persisted.count).toBe(0);
  });

  it('TEST-016: runs SCENARIO_A and SCENARIO_B against custom task IDs without default references', async () => {
    installLiveNetworkMock();
    const created = await createCustomProject();
    const projectId = created.project_id;

    const scenarioA = await request(app)
      .post('/api/scenarios/SCENARIO_A/trigger')
      .send({ projectId });

    expect(scenarioA.status).toBe(200);
    expect(scenarioA.body.scenarioId).toBe('SCENARIO_A');
    expect(scenarioA.body.plan.blocked_task_id).toBe('custom_phase_a');
    expect(scenarioA.body.plan.promoted_task_id).toBe('custom_phase_c');
    expect(scenarioA.body.blastRadius.idle_crew_hours).toBe((2 + 2) * 8);
    expect(scenarioA.body.blastRadius.total_exposure_minor).toBe(2 * 60000 + 2 * 50000);
    expect(scenarioA.body.plan.policy_decision).toBe('REQUIRE_APPROVAL');

    const scenarioB = await request(app)
      .post('/api/scenarios/SCENARIO_B/trigger')
      .send({ projectId, forceRefresh: false });

    expect(scenarioB.status).toBe(200);
    expect(scenarioB.body.incumbentBlocked.decision).toBe('BLOCK');
    expect(scenarioB.body.incumbentBlocked.reason_codes).toContain('VENDOR_PRICE_CREEP_EXCEEDED');
    expect(scenarioB.body.channel3Proposed.quote.source_type).toBe('CHANNEL3_LIVE');
    expect(scenarioB.body.channel3Proposed.quote.unit_price_minor).toBe(34900);
    expect(scenarioB.body.channel3Proposed.plan.blocked_task_id).toBe('custom_phase_a');

    // No default Apex IDs leak into any scenario artifact.
    expect(JSON.stringify(scenarioB.body)).not.toMatch(/task_phase_[1-6]_/);
    expect(JSON.stringify(scenarioA.body)).not.toMatch(/task_phase_[1-6]_/);
  });

  it('TEST-017: persists genuine INV2 invoice IDs, view URLs, and CHANNEL3_LIVE quotes', async () => {
    const { invoiceIds } = installLiveNetworkMock();
    const created = await createCustomProject();
    const projectId = created.project_id;

    expect(created.stats.tasks_count).toBe(4);
    expect(created.stats.dependencies_count).toBe(2);
    // Only custom_phase_a carries a billable invoice total.
    expect(created.stats.paypal_invoices_created).toBe(1);
    expect(created.stats.channel3_quotes_created).toBe(1);
    expect(invoiceIds).toHaveLength(1);

    const phaseA = created.tasks.find((t) => t.task_id === 'custom_phase_a')!;
    expect(phaseA.paypal_invoice_id).toMatch(/^INV2-[A-Z0-9-]+$/);
    expect(phaseA.paypal_invoice_id).not.toMatch(/FALLBACK|MOCK/i);
    expect(phaseA.paypal_invoice_view_url).toBe(
      `https://www.sandbox.paypal.com/invoice/p/#${phaseA.paypal_invoice_id}`
    );

    const invoiceRow = testDb
      .prepare('SELECT * FROM tasks WHERE task_id = ?')
      .get('custom_phase_a') as {
        paypal_invoice_id: string;
        paypal_invoice_status: string;
        paypal_invoice_view_url: string;
      };
    expect(invoiceRow.paypal_invoice_id).toBe(phaseA.paypal_invoice_id);
    expect(invoiceRow.paypal_invoice_status).toBe('SENT');
    expect(invoiceRow.paypal_invoice_view_url).toContain('sandbox.paypal.com/invoice/p/');

    const quoteRows = testDb
      .prepare(
        `SELECT * FROM supplier_quotes
         WHERE task_id = ? AND source_type = 'CHANNEL3_LIVE'`
      )
      .all('custom_phase_a') as Array<{
        external_product_id: string;
        unit_price_minor: number;
        quantity: number;
        total_minor: number;
        currency: string;
      }>;
    expect(quoteRows).toHaveLength(1);
    expect(quoteRows[0]!.external_product_id).toBe('ch3_custom_display_01');
    expect(quoteRows[0]!.unit_price_minor).toBe(34900);
    expect(quoteRows[0]!.quantity).toBe(2);
    expect(quoteRows[0]!.total_minor).toBe(69800);
    expect(quoteRows[0]!.currency).toBe('USD');

    // Cross-tenant isolation: quotes are scoped to the custom project's tasks.
    const stateRes = await request(app).get(`/api/projects/${projectId}/state`);
    expect(stateRes.status).toBe(200);
    expect(stateRes.body.supplierQuotes).toHaveLength(1);
    expect(
      (stateRes.body.tasks as Array<{ task_id: string }>)
        .map((t) => t.task_id)
        .sort()
    ).toEqual(['custom_phase_a', 'custom_phase_b', 'custom_phase_c', 'custom_phase_d']);
  });

  it('TEST-018: PATCH persists recalculated exposure and the real policy decision', async () => {
    installLiveNetworkMock();
    const created = await createCustomProject();
    const projectId = created.project_id;

    // Mark phase A overdue so blast radius is non-zero before the patch.
    const scenario = await request(app)
      .post('/api/scenarios/SCENARIO_A/trigger')
      .send({ projectId });
    expect(scenario.status).toBe(200);
    expect(scenario.body.blastRadius.total_exposure_minor).toBe(2 * 60000 + 2 * 50000);

    const patchRes = await request(app)
      .patch(`/api/projects/${projectId}/tasks/custom_phase_a`)
      .send({ duration_days: 4, incumbent_unit_price_minor: 49000 });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.task.duration_days).toBe(4);
    expect(patchRes.body.task.end_date).toBe('2026-11-05');

    // 4 idle days for A + 2 downstream idle days for B.
    expect(patchRes.body.blastRadius.idle_crew_hours).toBe((4 + 2) * 8);
    expect(patchRes.body.blastRadius.total_exposure_minor).toBe(4 * 60000 + 2 * 50000);

    // Materials are still not in warehouse and the incumbent is +40.4% over
    // baseline, so the persisted decision must be BLOCK with both reason codes.
    expect(patchRes.body.policyResult.decision).toBe('BLOCK');
    expect(patchRes.body.policyResult.reason_codes).toEqual(
      expect.arrayContaining(['MATERIALS_NOT_IN_WAREHOUSE', 'VENDOR_PRICE_CREEP_EXCEEDED'])
    );

    const auditRow = testDb
      .prepare(
        `SELECT * FROM audit_events
         WHERE project_id = ? AND task_id = ? AND event_type = 'TASK_UPDATED'
         ORDER BY created_at DESC LIMIT 1`
      )
      .get(projectId, 'custom_phase_a') as {
        decision: string;
        reason_codes_json: string;
        state_fingerprint: string;
        payload_json: string;
      };

    expect(auditRow.decision).toBe('BLOCK');
    expect(auditRow.state_fingerprint).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(JSON.parse(auditRow.reason_codes_json)).toEqual(
      expect.arrayContaining(['MATERIALS_NOT_IN_WAREHOUSE', 'VENDOR_PRICE_CREEP_EXCEEDED'])
    );

    const payload = JSON.parse(auditRow.payload_json) as {
      patch: { duration_days: number; incumbent_unit_price_minor: number };
      blastRadius: { total_exposure_minor: number; idle_crew_hours: number };
      policyResult: { decision: string; reason_codes: string[] };
    };
    expect(payload.patch).toEqual(
      expect.objectContaining({ duration_days: 4, incumbent_unit_price_minor: 49000 })
    );
    expect(payload.blastRadius.total_exposure_minor).toBe(340000);
    expect(payload.blastRadius.idle_crew_hours).toBe(48);
    expect(payload.policyResult.decision).toBe('BLOCK');

    const persistedTask = testDb
      .prepare('SELECT duration_days, incumbent_unit_price_minor FROM tasks WHERE task_id = ?')
      .get('custom_phase_a') as { duration_days: number; incumbent_unit_price_minor: number };
    expect(persistedTask.duration_days).toBe(4);
    expect(persistedTask.incumbent_unit_price_minor).toBe(49000);
  });
});
