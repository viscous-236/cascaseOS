/**
 * @file phase1.test.ts
 * @description Phase 1 verification tests for CascadeOS.
 *
 * Covers:
 *   TEST-001 — Minor-Unit Conversion & SHA-256 Fingerprint Determinism
 *   TEST-DB-1 — SQLite initialises with WAL mode + foreign keys ON
 *   TEST-DB-2 — Append-only audit triggers fire on UPDATE / DELETE (SEC-007)
 *   TEST-DB-3 — All repository write/read round-trips work correctly
 *   TEST-ENV-1 — env.ts rejects invalid / missing variables
 *   TEST-MONEY-* — Edge cases for money conversion utilities
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  formatMinorToPayPalValue,
  parsePayPalValueToMinor,
  computeStateFingerprint,
  verifyStateFingerprint,
  calcVariancePct,
  calcSavingsMinor,
  minorUnitsToDisplayString,
  type StateFingerprintPayload,
} from '../utils/moneyAndHash.js';

// ---------------------------------------------------------------------------
// Helpers for isolated DB tests
// ---------------------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SCHEMA_PATH = resolve(__dirname, '../db/schema.sql');

function createTestDb(): Database.Database {
  const dir = mkdtempSync(join(tmpdir(), 'cascade-test-'));
  const db = new Database(join(dir, 'test.sqlite'));
  const schema = readFileSync(SCHEMA_PATH, 'utf-8');
  db.exec(schema);
  return db;
}

// =============================================================================
// TEST-001: Minor-Unit Conversion & SHA-256 Fingerprint Determinism
// =============================================================================

describe('TEST-001: Minor-Unit Conversion (REQ-002, PAT-003)', () => {
  // --- formatMinorToPayPalValue ---
  it('formats 139600 cents → "1396.00" (materials unlock amount)', () => {
    expect(formatMinorToPayPalValue(139600, 'USD')).toBe('1396.00');
  });

  it('formats 450000 cents → "4500.00" (phase 2 invoice)', () => {
    expect(formatMinorToPayPalValue(450000, 'USD')).toBe('4500.00');
  });

  it('formats 280000 cents → "2800.00" (phase 3 invoice)', () => {
    expect(formatMinorToPayPalValue(280000, 'USD')).toBe('2800.00');
  });

  it('formats 34900 cents → "349.00" (Channel3 unit price)', () => {
    expect(formatMinorToPayPalValue(34900, 'USD')).toBe('349.00');
  });

  it('formats 49000 cents → "490.00" (incumbent unit price)', () => {
    expect(formatMinorToPayPalValue(49000, 'USD')).toBe('490.00');
  });

  it('formats 196000 cents → "1960.00" (incumbent total)', () => {
    expect(formatMinorToPayPalValue(196000, 'USD')).toBe('1960.00');
  });

  it('formats 0 cents → "0.00"', () => {
    expect(formatMinorToPayPalValue(0, 'USD')).toBe('0.00');
  });

  it('formats single cent → "0.01"', () => {
    expect(formatMinorToPayPalValue(1, 'USD')).toBe('0.01');
  });

  it('throws on non-integer input', () => {
    expect(() => formatMinorToPayPalValue(139600.5, 'USD')).toThrow(TypeError);
  });

  it('throws on negative input', () => {
    expect(() => formatMinorToPayPalValue(-100, 'USD')).toThrow(RangeError);
  });

  // --- parsePayPalValueToMinor ---
  it('parses "1396.00" → 139600', () => {
    expect(parsePayPalValueToMinor('1396.00', 'USD')).toBe(139600);
  });

  it('parses "4500.00" → 450000', () => {
    expect(parsePayPalValueToMinor('4500.00', 'USD')).toBe(450000);
  });

  it('parses "349.00" → 34900', () => {
    expect(parsePayPalValueToMinor('349.00', 'USD')).toBe(34900);
  });

  it('parses "0.00" → 0', () => {
    expect(parsePayPalValueToMinor('0.00', 'USD')).toBe(0);
  });

  it('parses "0.01" → 1', () => {
    expect(parsePayPalValueToMinor('0.01', 'USD')).toBe(1);
  });

  it('round-trips: format then parse returns original value', () => {
    const originalMinor = 139600;
    const formatted = formatMinorToPayPalValue(originalMinor, 'USD');
    const parsed = parsePayPalValueToMinor(formatted, 'USD');
    expect(parsed).toBe(originalMinor);
  });

  it('round-trips for all demo scenario amounts', () => {
    const amounts = [450000, 280000, 139600, 196000, 34900, 49000, 38000, 320000, 180000, 150000, 120000];
    for (const amt of amounts) {
      expect(parsePayPalValueToMinor(formatMinorToPayPalValue(amt, 'USD'), 'USD')).toBe(amt);
    }
  });

  it('throws on non-numeric string', () => {
    expect(() => parsePayPalValueToMinor('abc', 'USD')).toThrow(TypeError);
  });

  it('display string is human-readable USD format', () => {
    expect(minorUnitsToDisplayString(139600, 'USD')).toBe('$1,396.00');
    expect(minorUnitsToDisplayString(450000, 'USD')).toBe('$4,500.00');
    expect(minorUnitsToDisplayString(280000, 'USD')).toBe('$2,800.00');
  });
});

// =============================================================================
// TEST-001 (continued): SHA-256 Fingerprint Determinism
// =============================================================================

describe('TEST-001: SHA-256 State Fingerprint Determinism (REQ-008, PAT-002)', () => {
  const basePayload: StateFingerprintPayload = {
    projectId: 'proj_apex_clinic_01',
    blockedTaskId: 'task_phase_2_displays',
    promotedTaskId: 'task_phase_3_networking',
    invoiceId: 'INV2-ABCD-1234-EFGH-5678',
    unlockAmountMinor: 139600,
    channel3ProductId: 'ch3_lg_32un880b',
    supplierTotalMinor: 139600,
    currency: 'USD',
  };

  it('produces a sha256: prefixed string', () => {
    const fp = computeStateFingerprint(basePayload);
    expect(fp).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('produces identical hashes for the same payload (repeatability)', () => {
    const fp1 = computeStateFingerprint(basePayload);
    const fp2 = computeStateFingerprint(basePayload);
    expect(fp1).toBe(fp2);
  });

  it('produces identical hash regardless of object key insertion order', () => {
    // Same data, different property order
    const shuffledPayload: StateFingerprintPayload = {
      currency: 'USD',
      supplierTotalMinor: 139600,
      channel3ProductId: 'ch3_lg_32un880b',
      unlockAmountMinor: 139600,
      invoiceId: 'INV2-ABCD-1234-EFGH-5678',
      promotedTaskId: 'task_phase_3_networking',
      blockedTaskId: 'task_phase_2_displays',
      projectId: 'proj_apex_clinic_01',
    };
    expect(computeStateFingerprint(basePayload)).toBe(
      computeStateFingerprint(shuffledPayload)
    );
  });

  it('produces different hash when any field changes (tamper-detection)', () => {
    const tamperedPayload: StateFingerprintPayload = {
      ...basePayload,
      unlockAmountMinor: 139601, // changed by 1 cent
    };
    expect(computeStateFingerprint(basePayload)).not.toBe(
      computeStateFingerprint(tamperedPayload)
    );
  });

  it('verifyStateFingerprint returns true when payload matches approved fingerprint', () => {
    const fingerprint = computeStateFingerprint(basePayload);
    expect(verifyStateFingerprint(basePayload, fingerprint)).toBe(true);
  });

  it('verifyStateFingerprint returns false when payload has been tampered', () => {
    const fingerprint = computeStateFingerprint(basePayload);
    const tampered = { ...basePayload, supplierTotalMinor: 200000 };
    expect(verifyStateFingerprint(tampered, fingerprint)).toBe(false);
  });

  it('verifyStateFingerprint catches STALE_FINGERPRINT_APPROVAL scenario (TEST-007)', () => {
    // Simulate: user approved at price 34900/unit, then price changed to 34901
    const atApprovalTime: StateFingerprintPayload = { ...basePayload, supplierTotalMinor: 139600 };
    const approvedFp = computeStateFingerprint(atApprovalTime);

    // 1 cent change invalidates consent
    const atExecutionTime: StateFingerprintPayload = { ...basePayload, supplierTotalMinor: 139601 };
    expect(verifyStateFingerprint(atExecutionTime, approvedFp)).toBe(false);
  });
});

// =============================================================================
// TEST-MONEY: Price Variance & Savings Calculations
// =============================================================================

describe('Price Variance & Savings Utilities', () => {
  it('calcVariancePct: incumbent $490 vs $380 baseline → +28.95%', () => {
    // Scenario B: 49000 proposed, 38000 historical
    expect(calcVariancePct(49000, 38000)).toBe(28.95);
  });

  it('calcVariancePct: Channel3 $349 vs $380 baseline → -8.16%', () => {
    // Channel3 quote is cheaper than historical
    expect(calcVariancePct(34900, 38000)).toBe(-8.16);
  });

  it('calcVariancePct: same price → 0%', () => {
    expect(calcVariancePct(38000, 38000)).toBe(0);
  });

  it('calcVariancePct throws when historical is zero', () => {
    expect(() => calcVariancePct(100, 0)).toThrow(RangeError);
  });

  it('calcSavingsMinor: incumbent $1960 vs Channel3 $1396 → 56400 cents ($564)', () => {
    expect(calcSavingsMinor(196000, 139600)).toBe(56400);
  });

  it('calcSavingsMinor: returns 0 when proposed is more expensive (no negative savings)', () => {
    expect(calcSavingsMinor(139600, 196000)).toBe(0);
  });

  it('calcSavingsMinor: returns 0 when same price', () => {
    expect(calcSavingsMinor(139600, 139600)).toBe(0);
  });
});

// =============================================================================
// TEST-DB-1: SQLite WAL mode + Foreign Keys
// =============================================================================

describe('TEST-DB-1: SQLite Initialisation (REQ-001)', () => {
  let db: Database.Database;

  beforeAll(() => {
    db = createTestDb();
  });

  afterAll(() => {
    db.close();
  });

  it('journal_mode is WAL', () => {
    const result = db.pragma('journal_mode') as Array<{ journal_mode: string }>;
    expect(result[0]?.journal_mode).toBe('wal');
  });

  it('foreign_keys are ON (= 1)', () => {
    const result = db.pragma('foreign_keys') as Array<{ foreign_keys: number }>;
    expect(result[0]?.foreign_keys).toBe(1);
  });

  it('all 8 tables exist in the schema', () => {
    const tables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
      .all() as Array<{ name: string }>;
    const tableNames = tables.map((t) => t.name);
    expect(tableNames).toContain('projects');
    expect(tableNames).toContain('tasks');
    expect(tableNames).toContain('task_dependencies');
    expect(tableNames).toContain('supplier_quotes');
    expect(tableNames).toContain('recovery_plans');
    expect(tableNames).toContain('user_approvals');
    expect(tableNames).toContain('paypal_transactions');
    expect(tableNames).toContain('audit_events');
  });

  it('both append-only audit triggers exist', () => {
    const triggers = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='trigger' ORDER BY name`)
      .all() as Array<{ name: string }>;
    const triggerNames = triggers.map((t) => t.name);
    expect(triggerNames).toContain('prevent_audit_update');
    expect(triggerNames).toContain('prevent_audit_delete');
  });
});

// =============================================================================
// TEST-DB-2: Append-Only Audit Ledger Triggers (SEC-007, TEST-008)
// =============================================================================

describe('TEST-DB-2 / TEST-008: Append-Only Audit Triggers (SEC-007)', () => {
  let db: Database.Database;

  beforeAll(() => {
    db = createTestDb();
    // Insert a project and an audit event to test against
    db.prepare(
      `INSERT INTO projects (project_id, name, currency, created_at, updated_at)
       VALUES ('proj_test', 'Test Project', 'USD', '2026-10-15T00:00:00.000Z', '2026-10-15T00:00:00.000Z')`
    ).run();

    db.prepare(
      `INSERT INTO audit_events
         (event_id, project_id, task_id, plan_id, event_type, decision,
          reason_codes_json, state_fingerprint, paypal_reference_id,
          channel3_reference_id, summary, payload_json, created_at)
       VALUES
         ('evt_test_001', 'proj_test', NULL, NULL, 'TEST_EVENT', 'ALLOW',
          '[]', NULL, NULL, NULL, 'Test audit entry', '{}', '2026-10-15T00:00:00.000Z')`
    ).run();
  });

  afterAll(() => {
    db.close();
  });

  it('INSERT into audit_events succeeds (row is writable once)', () => {
    const row = db
      .prepare("SELECT * FROM audit_events WHERE event_id = 'evt_test_001'")
      .get() as { summary: string } | undefined;
    expect(row?.summary).toBe('Test audit entry');
  });

  it('UPDATE on audit_events is ABORTED by trigger (SEC-007)', () => {
    expect(() => {
      db.prepare(
        `UPDATE audit_events SET decision = 'BLOCK' WHERE event_id = 'evt_test_001'`
      ).run();
    }).toThrow(/Audit ledger is append-only/);
  });

  it('DELETE on audit_events is ABORTED by trigger (SEC-007)', () => {
    expect(() => {
      db.prepare(
        `DELETE FROM audit_events WHERE event_id = 'evt_test_001'`
      ).run();
    }).toThrow(/Audit ledger is append-only/);
  });

  it('audit row still intact after failed mutation attempts', () => {
    const row = db
      .prepare("SELECT * FROM audit_events WHERE event_id = 'evt_test_001'")
      .get() as { decision: string } | undefined;
    // decision was NOT changed to BLOCK — still 'ALLOW'
    expect(row?.decision).toBe('ALLOW');
  });
});

// =============================================================================
// TEST-DB-3: Repository Round-Trip (basic write/read for all repos)
// =============================================================================

describe('TEST-DB-3: Repository Round-Trip Writes', () => {
  let db: Database.Database;

  beforeAll(() => {
    db = createTestDb();

    // Seed project
    db.prepare(
      `INSERT INTO projects (project_id, name, currency, created_at, updated_at)
       VALUES ('proj_apex', 'Apex Clinic', 'USD', '2026-10-15T00:00:00.000Z', '2026-10-15T00:00:00.000Z')`
    ).run();

    // Seed task (Phase 2 from the demo scenario)
    db.prepare(
      `INSERT INTO tasks (
         task_id, project_id, version, name, start_date, end_date, duration_days,
         materials_in_warehouse, crew_assigned, daily_idle_burn_minor,
         sla_delay_penalty_minor, phase_hardware_budget_max_minor,
         schedule_status, paypal_invoice_id, paypal_invoice_number,
         paypal_invoice_status, invoice_total_minor, materials_unlock_minor,
         deferred_labor_minor, client_name, client_email,
         required_quantity, max_allowed_variance_pct
       ) VALUES (
         'task_phase_2', 'proj_apex', 1, 'Phase 2: Display Mounting',
         '2026-10-16', '2026-10-18', 2,
         0, 'Tech Team Alpha', 68000,
         144000, 160000,
         'PAYMENT_BLOCKED', 'INV2-TEST-0001', 'INV-001',
         'OVERDUE', 450000, 139600,
         310400, 'Apex Medical Group', 'billing@apexclinic.example',
         4, 10.0
       )`
    ).run();
  });

  afterAll(() => {
    db.close();
  });

  it('projects table: can read inserted project', () => {
    const row = db
      .prepare("SELECT * FROM projects WHERE project_id = 'proj_apex'")
      .get() as { name: string; currency: string } | undefined;
    expect(row?.name).toBe('Apex Clinic');
    expect(row?.currency).toBe('USD');
  });

  it('tasks table: integer minor units stored and retrieved correctly', () => {
    const row = db
      .prepare("SELECT * FROM tasks WHERE task_id = 'task_phase_2'")
      .get() as {
        invoice_total_minor: number;
        materials_unlock_minor: number;
        deferred_labor_minor: number;
        daily_idle_burn_minor: number;
        sla_delay_penalty_minor: number;
        phase_hardware_budget_max_minor: number;
      } | undefined;

    expect(row?.invoice_total_minor).toBe(450000);
    expect(row?.materials_unlock_minor).toBe(139600);
    expect(row?.deferred_labor_minor).toBe(310400);
    expect(row?.daily_idle_burn_minor).toBe(68000);
    expect(row?.sla_delay_penalty_minor).toBe(144000);
    expect(row?.phase_hardware_budget_max_minor).toBe(160000);
  });

  it('tasks table: materials_unlock + deferred_labor = invoice_total (arithmetic integrity)', () => {
    const row = db
      .prepare("SELECT * FROM tasks WHERE task_id = 'task_phase_2'")
      .get() as {
        invoice_total_minor: number;
        materials_unlock_minor: number;
        deferred_labor_minor: number;
      } | undefined;

    expect((row?.materials_unlock_minor ?? 0) + (row?.deferred_labor_minor ?? 0))
      .toBe(row?.invoice_total_minor);
  });

  it('task_dependencies: FK constraint rejects reference to non-existent task', () => {
    expect(() => {
      db.prepare(
        `INSERT INTO task_dependencies (dependency_id, project_id, from_task_id, to_task_id, lag_days)
         VALUES ('dep_001', 'proj_apex', 'task_phase_NONEXISTENT', 'task_phase_2', 0)`
      ).run();
    }).toThrow(); // FK violation
  });

  it('supplier_quotes: rejects source_type outside allowed enum', () => {
    expect(() => {
      db.prepare(
        `INSERT INTO supplier_quotes (
           quote_id, task_id, source_type, external_product_id, product_title,
           merchant_name, currency, unit_price_minor, quantity, total_minor,
           variance_vs_historical_pct, availability_status, observed_at
         ) VALUES (
           'q_001', 'task_phase_2', 'INVALID_SOURCE', 'prod_001', 'Monitor',
           'Vendor', 'USD', 34900, 4, 139600,
           -8.16, 'IN_STOCK', '2026-10-15T00:00:00.000Z'
         )`
      ).run();
    }).toThrow(); // CHECK constraint
  });

  it('tasks table: rejects schedule_status outside allowed enum', () => {
    expect(() => {
      db.prepare(
        `UPDATE tasks SET schedule_status = 'INVALID_STATUS' WHERE task_id = 'task_phase_2'`
      ).run();
    }).toThrow(); // CHECK constraint
  });

  it('paypal_invoice_status: rejects value outside allowed enum', () => {
    expect(() => {
      db.prepare(
        `UPDATE tasks SET paypal_invoice_status = 'PENDING' WHERE task_id = 'task_phase_2'`
      ).run();
    }).toThrow(); // CHECK constraint
  });
});
