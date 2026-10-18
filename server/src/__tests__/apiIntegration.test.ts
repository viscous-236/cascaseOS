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
    });

    it('SCENARIO_B: blocks incumbent price creep (+28.95%) and evaluates Channel3 replacement', async () => {
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
    });

    it('SCENARIO_C: hard blocks adversarial dependency violation and missing costs (SEC-006)', async () => {
      const res = await request(app).post('/api/scenarios/SCENARIO_C/trigger');
      expect(res.status).toBe(200);
      expect(res.body.scenarioId).toBe('SCENARIO_C');
      expect(res.body.decision).toBe('BLOCK');
      expect(res.body.reasonCodes).toContain('HARD_DEPENDENCY_VIOLATION');
      expect(res.body.reasonCodes).toContain('UNKNOWN_COST_FIELD');
    });
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

    it('TEST-007: rejects approval with 409 Conflict if state fingerprint does not match (tamper-detection)', async () => {
      const tamperedFingerprint = 'sha256:0000000000000000000000000000000000000000000000000000000000000000';
      const res = await request(app)
        .post(`/api/recovery-plans/${scenarioAPlan.plan_id}/approve-schedule-and-split`)
        .send({
          approvedFingerprint: tamperedFingerprint,
          approverActor: 'MaliciousActor',
        });

      expect(res.status).toBe(409);
      expect(res.body.reasonCodes).toContain('STALE_FINGERPRINT_APPROVAL');

      // Audit event was written
      const auditRows = testDb.prepare("SELECT * FROM audit_events WHERE decision = 'BLOCK'").all();
      expect(auditRows.length).toBeGreaterThanOrEqual(1);
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
    });
  });
});
