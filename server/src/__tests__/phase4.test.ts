/**
 * @file phase4.test.ts
 * @description Unit tests for Phase 4 Services (TASK-016, TASK-017, TASK-018).
 *
 * Covers:
 * - TASK-017: Nudge-Bot and FinOps AI Service (GUD-003, SEC-002, SEC-003)
 * - TASK-018: Project Bootstrap Service (CON-001, REQ-004, REQ-006)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as dbModule from '../db/database.js';
import {
  generateClientNudgeMessage,
  generateFinOpsPolicyExplanation,
  clearOpenAIClient,
  type ClientNudgeParams,
  type FinOpsExplanationParams,
} from '../services/nudgeAndFinOpsAiService.js';
import {
  bootstrapApexClinicProject,
  APEX_PROJECT_ID,
  CANONICAL_DEPENDENCIES,
} from '../services/projectBootstrapService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SCHEMA_PATH = resolve(__dirname, '../db/schema.sql');

describe('Phase 4: AI Nudge-Bot & Project Bootstrap Services', () => {
  let testDb: Database.Database;

  beforeEach(() => {
    testDb = new Database(':memory:');
    const schema = readFileSync(SCHEMA_PATH, 'utf-8');
    testDb.exec(schema);
    dbModule.setDbForTesting(testDb);
    clearOpenAIClient();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    dbModule.setDbForTesting(null);
    testDb.close();
    vi.restoreAllMocks();
  });

  // ===========================================================================
  // TASK-017: Nudge-Bot & FinOps AI Service (GUD-003, SEC-002, SEC-003)
  // ===========================================================================

  describe('TASK-017: nudgeAndFinOpsAiService', () => {
    const nudgeParams: ClientNudgeParams = {
      clientName: 'Dr. Marcus Vance',
      clientEmail: 'marcus@apexhealth.com',
      projectName: 'Apex Diagnostic Clinic & Studio Buildout',
      blockedTaskName: 'Phase 2: 4K Diagnostic Display Mounting',
      overdueInvoiceNumber: 'INV-002',
      invoiceTotalMinor: 450000,
      materialsUnlockMinor: 139600,
      deferredLaborMinor: 310400,
      exposureAtRiskMinor: 280000,
      currency: 'USD',
    };

    it('generateClientNudgeMessage: formats exact minor units and maintains warm collaborative tone (GUD-003)', async () => {
      const result = await generateClientNudgeMessage(nudgeParams);

      expect(result.tone).toBe('warm_collaborative');
      expect(result.materials_unlock_amount_formatted).toBe('USD $1396.00');
      expect(result.invoice_total_amount_formatted).toBe('USD $4500.00');
      expect(result.exposure_at_risk_formatted).toBe('USD $2800.00');
      expect(result.subject).toContain('Apex Diagnostic Clinic');
      expect(result.body).toContain('Dr. Marcus Vance');
      expect(result.body).toContain('1396.00');
      expect(result.body).not.toMatch(/debt collection|default notice|penalty fee/i);
    });

    it('generateFinOpsPolicyExplanation: produces explanation and remediation steps for BLOCK decision', async () => {
      const params: FinOpsExplanationParams = {
        taskName: 'Phase 2: 4K Displays',
        decision: 'BLOCK',
        reasonCodes: ['VENDOR_PRICE_CREEP_EXCEEDED', 'TOTAL_EXCEEDS_PHASE_BUDGET'],
        permitted: { max_unit_price: 41800, max_budget: 160000 },
        observed: { unit_price: 49000, total: 196000 },
      };

      const result = await generateFinOpsPolicyExplanation(params);

      expect(result.policy_decision).toBe('BLOCK');
      expect(result.headline.toUpperCase()).toContain('BLOCK');
      expect(result.reason_summary.length).toBeGreaterThan(10);
      expect(result.remediation_steps.length).toBeGreaterThan(0);
    });

    it('generateFinOpsPolicyExplanation: handles REQUIRE_APPROVAL decision', async () => {
      const params: FinOpsExplanationParams = {
        taskName: 'Phase 3: Acoustic Paneling & Network Rack',
        decision: 'REQUIRE_APPROVAL',
        reasonCodes: [],
        permitted: {},
        observed: {},
      };

      const result = await generateFinOpsPolicyExplanation(params);

      expect(result.policy_decision).toBe('REQUIRE_APPROVAL');
      expect(result.headline.toUpperCase()).toMatch(/REQUIRE_APPROVAL|APPROVAL/);
      expect(result.reason_summary.length).toBeGreaterThan(10);
    });
  });

  // ===========================================================================
  // TASK-018: Project Bootstrap Service (CON-001, REQ-004, REQ-006)
  // ===========================================================================

  describe('TASK-018: projectBootstrapService', () => {
    it('bootstraps the 6 canonical tasks, dependencies, and incumbent quote', async () => {
      const result = await bootstrapApexClinicProject({
        skipPayPal: true,
        skipChannel3: true,
      });

      expect(result.project.project_id).toBe(APEX_PROJECT_ID);
      expect(result.tasks).toHaveLength(6);
      expect(result.dependencies).toHaveLength(CANONICAL_DEPENDENCIES.length);

      // Verify task statuses
      const p1 = result.tasks.find((t) => t.task_id === 'task_phase_1_wiring')!;
      expect(p1.schedule_status).toBe('COMPLETED');
      expect(p1.paypal_invoice_status).toBe('PAID');

      const p2 = result.tasks.find((t) => t.task_id === 'task_phase_2_displays')!;
      expect(p2.schedule_status).toBe('PAYMENT_BLOCKED');
      expect(p2.paypal_invoice_status).toBe('OVERDUE');
      expect(p2.invoice_total_minor).toBe(450000);
      expect(p2.materials_unlock_minor).toBe(139600);
      expect(p2.deferred_labor_minor).toBe(310400);

      const p3 = result.tasks.find((t) => t.task_id === 'task_phase_3_networking')!;
      expect(p3.schedule_status).toBe('READY_TO_PROMOTE');
      expect(p3.materials_in_warehouse).toBe(1);

      // Verify incumbent quote
      const quotes = result.quotes;
      expect(quotes.length).toBeGreaterThanOrEqual(1);
      const incQuote = quotes.find((q) => q.source_type === 'INCUMBENT_INVOICE')!;
      expect(incQuote.merchant_name).toBe('MedTech Supply Co.');
      expect(incQuote.unit_price_minor).toBe(49000);
      expect(incQuote.variance_vs_historical_pct).toBe(28.95);

      // Verify audit event was logged
      const auditRows = testDb.prepare('SELECT * FROM audit_events').all();
      expect(auditRows.length).toBe(1);
      expect((auditRows[0] as any).event_type).toBe('PROJECT_BOOTSTRAP');
    });

    it('returns existing cached project without duplicate mutation when forceReset is false (RISK-001)', async () => {
      // First bootstrap
      await bootstrapApexClinicProject({ skipPayPal: true, skipChannel3: true });

      // Second bootstrap without forceReset
      const secondResult = await bootstrapApexClinicProject({ skipPayPal: true, skipChannel3: true });
      expect(secondResult.project.project_id).toBe(APEX_PROJECT_ID);
      expect(secondResult.tasks).toHaveLength(6);

      // Should still be exactly 1 audit event from first bootstrap
      const auditRows = testDb.prepare('SELECT * FROM audit_events').all();
      expect(auditRows.length).toBe(1);
    });

    it('recreates the project cleanly when forceReset is true', async () => {
      // First bootstrap
      await bootstrapApexClinicProject({ skipPayPal: true, skipChannel3: true });

      // Second bootstrap with forceReset: true
      const resetResult = await bootstrapApexClinicProject({
        forceReset: true,
        skipPayPal: true,
        skipChannel3: true,
      });

      expect(resetResult.project.project_id).toBe(APEX_PROJECT_ID);
      expect(resetResult.tasks).toHaveLength(6);

      // Audit table has 2 events (first bootstrap + second reset bootstrap)
      const auditRows = testDb.prepare('SELECT * FROM audit_events').all();
      expect(auditRows.length).toBe(2);
    });
  });
});
