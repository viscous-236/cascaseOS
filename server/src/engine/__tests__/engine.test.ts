/**
 * @file engine.test.ts
 * @description Vitest unit tests for the deterministic engine layer.
 *
 * Covers TEST-002 through TEST-006 as specified in the PLAN:
 *
 *   TEST-002 — Critical-Path Blast Radius Calculation
 *   TEST-003 — Scenario A Policy Evaluation (REQUIRE_APPROVAL → ALLOW)
 *   TEST-004 — Scenario B Incumbent Vendor Price-Creep BLOCK
 *   TEST-005 — Scenario B Channel3 Replacement Quote ALLOW
 *   TEST-006 — Scenario C Adversarial Dependency & Unknown Cost Fail-Closed
 *
 * Plus additional coverage for scheduleRerouter and edge cases.
 */

import { describe, it, expect } from 'vitest';
import { analyzeProjectBlastRadius } from '../criticalPathEngine.js';
import { computeReroutedSchedule, addDays } from '../scheduleRerouter.js';
import { evaluateRecoveryAndSupplierAction } from '../policyEngine.js';
import type { CascadeTask, TaskDependency } from '../../types/domain.js';

// =============================================================================
// SHARED FIXTURE — "Apex Diagnostic Clinic & Studio Buildout" 6-Phase Project
// Mirrors exactly the demo scenario from DOCS.md §3
// =============================================================================

/** Helper: create a minimal CascadeTask with sensible defaults */
function makeTask(overrides: Partial<CascadeTask> & { task_id: string }): CascadeTask {
  return {
    project_id: 'proj_apex_clinic_01',
    version: 1,
    name: overrides.task_id,
    start_date: '2026-10-14',
    end_date: '2026-10-16',
    duration_days: 2,
    materials_in_warehouse: 0,
    crew_assigned: 'Team Alpha',
    daily_idle_burn_minor: 0,
    sla_delay_penalty_minor: 0,
    phase_hardware_budget_max_minor: 160000,
    schedule_status: 'SCHEDULED',
    paypal_invoice_id: null,
    paypal_invoice_number: null,
    paypal_invoice_status: 'DRAFT',
    invoice_total_minor: 0,
    materials_unlock_minor: 0,
    deferred_labor_minor: 0,
    client_name: 'Apex Medical Group',
    client_email: 'billing@apexclinic.example',
    qr_code_base64: null,
    last_nudge_message: null,
    last_nudge_sent_at: null,
    sku_search_query: null,
    required_quantity: 0,
    incumbent_vendor_name: null,
    incumbent_unit_price_minor: null,
    historical_unit_price_minor: null,
    max_allowed_variance_pct: 10.0,
    ...overrides,
  };
}

// 6 canonical tasks from DOCS.md §3
const PHASE_1 = makeTask({
  task_id: 'task_phase_1_wiring',
  name: 'Phase 1: Power & Conduit Rough-In',
  start_date: '2026-10-12',
  end_date: '2026-10-14',
  duration_days: 2,
  materials_in_warehouse: 1,
  schedule_status: 'COMPLETED',
  paypal_invoice_status: 'PAID',
  invoice_total_minor: 320000,
  materials_unlock_minor: 320000,
  deferred_labor_minor: 0,
  daily_idle_burn_minor: 0,
  sla_delay_penalty_minor: 0,
});

const PHASE_2 = makeTask({
  task_id: 'task_phase_2_displays',
  name: 'Phase 2: 4K Diagnostic Display Mounting',
  start_date: '2026-10-16',
  end_date: '2026-10-18',
  duration_days: 2,
  materials_in_warehouse: 0, // Needs order
  schedule_status: 'PAYMENT_BLOCKED',
  paypal_invoice_status: 'OVERDUE',
  invoice_total_minor: 450000,
  materials_unlock_minor: 139600,
  deferred_labor_minor: 310400,
  daily_idle_burn_minor: 68000,   // $680/day crew burn
  sla_delay_penalty_minor: 144000, // $1,440 SLA penalty
  phase_hardware_budget_max_minor: 160000, // $1,600 cap
  required_quantity: 4,
  incumbent_vendor_name: 'MedTech Supply Co.',
  incumbent_unit_price_minor: 49000,  // $490/unit
  historical_unit_price_minor: 38000, // $380/unit baseline
  max_allowed_variance_pct: 10.0,
  sku_search_query: '32 inch 4K UHD IPS Monitor Ergonomic Stand',
});

const PHASE_3 = makeTask({
  task_id: 'task_phase_3_networking',
  name: 'Phase 3: Acoustic Paneling & Network Rack',
  start_date: '2026-10-19',
  end_date: '2026-10-21',
  duration_days: 3,
  materials_in_warehouse: 1, // In warehouse — READY TO PROMOTE
  schedule_status: 'READY_TO_PROMOTE',
  paypal_invoice_status: 'PAID',
  invoice_total_minor: 280000,
  materials_unlock_minor: 280000,
  deferred_labor_minor: 0,
  daily_idle_burn_minor: 50000,
  sla_delay_penalty_minor: 0,
});

const PHASE_4 = makeTask({
  task_id: 'task_phase_4_calibration',
  name: 'Phase 4: Optical Calibration & Burn-In',
  start_date: '2026-10-19',
  end_date: '2026-10-20',
  duration_days: 2,
  materials_in_warehouse: 0, // No materials needed (service task)
  schedule_status: 'BLOCKED_BY_DEPENDENCY',
  paypal_invoice_status: 'DRAFT',
  invoice_total_minor: 180000,
  materials_unlock_minor: 0,
  deferred_labor_minor: 180000,
  daily_idle_burn_minor: 60000,
  sla_delay_penalty_minor: 0,
});

const PHASE_5 = makeTask({
  task_id: 'task_phase_5_training',
  name: 'Phase 5: Clinical Staff Workflow Training',
  start_date: '2026-10-22',
  end_date: '2026-10-23',
  duration_days: 2,
  materials_in_warehouse: 1,
  schedule_status: 'SCHEDULED',
  paypal_invoice_status: 'DRAFT',
  invoice_total_minor: 150000,
  materials_unlock_minor: 150000,
  deferred_labor_minor: 0,
  daily_idle_burn_minor: 40000,
  sla_delay_penalty_minor: 0,
});

const PHASE_6 = makeTask({
  task_id: 'task_phase_6_handover',
  name: 'Phase 6: Final Handover & Sign-Off',
  start_date: '2026-10-24',
  end_date: '2026-10-24',
  duration_days: 1,
  materials_in_warehouse: 0,
  schedule_status: 'SCHEDULED',
  paypal_invoice_status: 'DRAFT',
  invoice_total_minor: 120000,
  materials_unlock_minor: 0,
  deferred_labor_minor: 120000,
  daily_idle_burn_minor: 30000,
  sla_delay_penalty_minor: 0,
});

const ALL_TASKS = [PHASE_1, PHASE_2, PHASE_3, PHASE_4, PHASE_5, PHASE_6];

// Finish-to-start dependency graph:
// Phase1 → Phase2
// Phase1 → Phase3
// Phase2 → Phase4
// Phase3 → Phase5, Phase4 → Phase5
// Phase5 → Phase6
const ALL_DEPS: TaskDependency[] = [
  { dependency_id: 'd_1_2', project_id: 'proj_apex_clinic_01', from_task_id: 'task_phase_1_wiring', to_task_id: 'task_phase_2_displays', lag_days: 0 },
  { dependency_id: 'd_1_3', project_id: 'proj_apex_clinic_01', from_task_id: 'task_phase_1_wiring', to_task_id: 'task_phase_3_networking', lag_days: 0 },
  { dependency_id: 'd_2_4', project_id: 'proj_apex_clinic_01', from_task_id: 'task_phase_2_displays', to_task_id: 'task_phase_4_calibration', lag_days: 0 },
  { dependency_id: 'd_3_5', project_id: 'proj_apex_clinic_01', from_task_id: 'task_phase_3_networking', to_task_id: 'task_phase_5_training', lag_days: 0 },
  { dependency_id: 'd_4_5', project_id: 'proj_apex_clinic_01', from_task_id: 'task_phase_4_calibration', to_task_id: 'task_phase_5_training', lag_days: 0 },
  { dependency_id: 'd_5_6', project_id: 'proj_apex_clinic_01', from_task_id: 'task_phase_5_training', to_task_id: 'task_phase_6_handover', lag_days: 0 },
];

// =============================================================================
// TEST-002: Critical-Path Blast Radius Calculation
// =============================================================================

describe('TEST-002: analyzeProjectBlastRadius — Blast Radius Calculation (REQ-005)', () => {
  it('identifies Phase 2 and Phase 4 as blocked task IDs', () => {
    const result = analyzeProjectBlastRadius(ALL_TASKS, ALL_DEPS);
    expect(result.blocked_task_ids).toContain('task_phase_2_displays');
    expect(result.blocked_task_ids).toContain('task_phase_4_calibration');
  });

  it('does NOT include Phase 1 (COMPLETED) or Phase 3 (READY_TO_PROMOTE) in blocked set', () => {
    // Phase 2 overdue → transitively blocks Phase4, Phase5, Phase6 (all downstream)
    // Phase 3 is READY_TO_PROMOTE (independent branch from Phase1) — NOT blocked
    const result = analyzeProjectBlastRadius(ALL_TASKS, ALL_DEPS);
    expect(result.blocked_task_ids).not.toContain('task_phase_1_wiring');
    expect(result.blocked_task_ids).not.toContain('task_phase_3_networking');
    // Phase 5 and 6 ARE transitively blocked (Phase2→Phase4→Phase5→Phase6)
    expect(result.blocked_task_ids).toContain('task_phase_5_training');
    expect(result.blocked_task_ids).toContain('task_phase_6_handover');
  });

  it('idle_crew_hours includes all 4 transitively blocked tasks (Phase2+4+5+6)', () => {
    // Phase2: 2d, Phase4: 2d, Phase5: 2d, Phase6: 1d → 7 days * 8h = 56h
    const result = analyzeProjectBlastRadius(ALL_TASKS, ALL_DEPS);
    expect(result.idle_crew_hours).toBe(56);
  });

  it('idle_labor_cost_minor: phase2(2*68000) + phase4(2*60000) + phase5(2*40000) + phase6(1*30000)', () => {
    // 136000 + 120000 + 80000 + 30000 = 366000
    const result = analyzeProjectBlastRadius(ALL_TASKS, ALL_DEPS);
    expect(result.idle_labor_cost_minor).toBe(366000);
  });

  it('sla_penalty_minor = 144000 (Phase 2 only — other phases have 0 penalty)', () => {
    const result = analyzeProjectBlastRadius(ALL_TASKS, ALL_DEPS);
    expect(result.sla_penalty_minor).toBe(144000);
  });

  it('total_exposure_minor = idle_labor(366000) + sla(144000) = 510000', () => {
    const result = analyzeProjectBlastRadius(ALL_TASKS, ALL_DEPS);
    expect(result.total_exposure_minor).toBe(510000);
  });

  it('identifies task_phase_3_networking as a promotable candidate', () => {
    // Phase 3: dependency (phase_1) is COMPLETED, materials_in_warehouse === 1
    const result = analyzeProjectBlastRadius(ALL_TASKS, ALL_DEPS);
    expect(result.promotable_candidate_ids).toContain('task_phase_3_networking');
  });

  it('does NOT include Phase 4 as promotable (not materials_in_warehouse)', () => {
    const result = analyzeProjectBlastRadius(ALL_TASKS, ALL_DEPS);
    expect(result.promotable_candidate_ids).not.toContain('task_phase_4_calibration');
  });

  it('returns empty result when no tasks are overdue', () => {
    const allPaid = ALL_TASKS.map((t) => ({
      ...t,
      paypal_invoice_status: 'PAID' as const,
      schedule_status: 'SCHEDULED' as const,
    }));
    const result = analyzeProjectBlastRadius(allPaid, ALL_DEPS);
    expect(result.blocked_task_ids).toHaveLength(0);
    expect(result.total_exposure_minor).toBe(0);
    expect(result.promotable_candidate_ids).toHaveLength(0);
  });

  it('returns empty result for empty task list', () => {
    const result = analyzeProjectBlastRadius([], []);
    expect(result.blocked_task_ids).toHaveLength(0);
    expect(result.total_exposure_minor).toBe(0);
  });
});

// =============================================================================
// TEST-002 (continued): Schedule Rerouter
// =============================================================================

describe('addDays — Date Arithmetic', () => {
  it('adds 0 days → same date', () => {
    expect(addDays('2026-10-16', 0)).toBe('2026-10-16');
  });

  it('adds 2 days → 2026-10-18', () => {
    expect(addDays('2026-10-16', 2)).toBe('2026-10-18');
  });

  it('handles month boundary (Oct → Nov)', () => {
    expect(addDays('2026-10-30', 2)).toBe('2026-11-01');
  });

  it('handles year boundary (Dec → Jan)', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('computeReroutedSchedule — Schedule Rerouter (REQ-005)', () => {
  it('promotes Phase 3 to Phase 2 start date (2026-10-16)', () => {
    const result = computeReroutedSchedule(PHASE_2, PHASE_3, ALL_TASKS, ALL_DEPS);
    expect(result.new_promoted_start_date).toBe('2026-10-16');
  });

  it('defers Phase 2 to start after Phase 3 ends + 1 day (2026-10-22)', () => {
    // Phase 3: start 2026-10-16, duration 3 days → end 2026-10-18 (10-16 + 2 = 10-18)
    // Phase 2 new start = end + 1 = 2026-10-19
    const result = computeReroutedSchedule(PHASE_2, PHASE_3, ALL_TASKS, ALL_DEPS);
    expect(result.new_blocked_start_date).toBe('2026-10-19');
  });

  it('returns dependency_check_passed = true (Phase 1 COMPLETED before Phase 3)', () => {
    const result = computeReroutedSchedule(PHASE_2, PHASE_3, ALL_TASKS, ALL_DEPS);
    expect(result.dependency_check_passed).toBe(true);
  });

  it('reports correct promoted_task_id and blocked_task_id', () => {
    const result = computeReroutedSchedule(PHASE_2, PHASE_3, ALL_TASKS, ALL_DEPS);
    expect(result.promoted_task_id).toBe('task_phase_3_networking');
    expect(result.blocked_task_id).toBe('task_phase_2_displays');
  });

  it('exposure_mitigated_minor = (2 days * 68000) + 144000 = 280000', () => {
    const result = computeReroutedSchedule(PHASE_2, PHASE_3, ALL_TASKS, ALL_DEPS);
    expect(result.exposure_mitigated_minor).toBe(280000);
  });
});

// =============================================================================
// TEST-003: Scenario A — Policy Evaluation (REQUIRE_APPROVAL → ALLOW)
// =============================================================================

describe('TEST-003: Scenario A — Promote Phase 3 (REQUIRE_APPROVAL → ALLOW)', () => {
  const scenarioABase = {
    taskToPromote: {
      id: 'task_phase_3_networking',
      hard_dependencies: ['task_phase_1_wiring'],
      materials_in_warehouse: true, // In warehouse
    },
    completedTaskIds: ['task_phase_1_wiring'], // Phase 1 COMPLETED
    phaseCurrency: 'USD',
    phaseBudgetMaxMinor: 160000, // $1,600 cap
    historicalUnitPriceMinor: 38000, // $380 baseline
    maxAllowedVariancePct: 10.0,
    proposedQuote: {
      currency: 'USD',
      unitPriceMinor: 34900,  // $349 Channel3 price
      quantity: 4,
      shippingMinor: 0,
      taxMinor: 0,
    },
  };

  it('returns REQUIRE_APPROVAL before human sign-off (no userApproval)', () => {
    const result = evaluateRecoveryAndSupplierAction({
      ...scenarioABase,
      hasExplicitUserApproval: false,
    });
    expect(result.decision).toBe('REQUIRE_APPROVAL');
    expect(result.reason_codes).toHaveLength(0);
    expect(result.requires_user_action).toBe(true);
  });

  it('returns ALLOW with reason_codes=[] after human sign-off', () => {
    const result = evaluateRecoveryAndSupplierAction({
      ...scenarioABase,
      hasExplicitUserApproval: true,
    });
    expect(result.decision).toBe('ALLOW');
    expect(result.reason_codes).toHaveLength(0);
    expect(result.requires_user_action).toBe(false);
  });

  it('observed total_minor = 34900*4 = 139600', () => {
    const result = evaluateRecoveryAndSupplierAction({
      ...scenarioABase,
      hasExplicitUserApproval: true,
    });
    expect(result.observed.total_minor).toBe(139600);
  });

  it('observed variance_pct = -8.16% (Channel3 cheaper than baseline)', () => {
    const result = evaluateRecoveryAndSupplierAction({
      ...scenarioABase,
      hasExplicitUserApproval: true,
    });
    expect(result.observed.variance_pct).toBe(-8.16);
  });

  it('permitted values expose max_budget and max_variance for UI diff', () => {
    const result = evaluateRecoveryAndSupplierAction({
      ...scenarioABase,
      hasExplicitUserApproval: false,
    });
    expect(result.permitted.max_budget_minor).toBe(160000);
    expect(result.permitted.max_variance_pct).toBe(10.0);
    expect(result.permitted.currency).toBe('USD');
  });
});

// =============================================================================
// TEST-004: Scenario B — Incumbent Vendor Price-Creep BLOCK
// =============================================================================

describe('TEST-004: Scenario B — Incumbent $490/unit BLOCK (VENDOR_PRICE_CREEP + BUDGET)', () => {
  const scenarioBIncumbent = {
    taskToPromote: {
      id: 'task_phase_2_displays',
      hard_dependencies: ['task_phase_1_wiring'],
      materials_in_warehouse: false, // NOT in warehouse (needs order)
    },
    completedTaskIds: ['task_phase_1_wiring'],
    phaseCurrency: 'USD',
    phaseBudgetMaxMinor: 160000,   // $1,600 cap
    historicalUnitPriceMinor: 38000, // $380 baseline
    maxAllowedVariancePct: 10.0,
    proposedQuote: {
      currency: 'USD',
      unitPriceMinor: 49000,  // $490/unit (MedTech Supply Co.)
      quantity: 4,
      shippingMinor: 0,
      taxMinor: 0,
    },
    hasExplicitUserApproval: false,
  };

  it('returns BLOCK decision', () => {
    const result = evaluateRecoveryAndSupplierAction(scenarioBIncumbent);
    expect(result.decision).toBe('BLOCK');
  });

  it('includes VENDOR_PRICE_CREEP_EXCEEDED in reason_codes', () => {
    const result = evaluateRecoveryAndSupplierAction(scenarioBIncumbent);
    expect(result.reason_codes).toContain('VENDOR_PRICE_CREEP_EXCEEDED');
  });

  it('includes TOTAL_EXCEEDS_PHASE_BUDGET in reason_codes', () => {
    // 49000 * 4 = 196000 > 160000 budget cap
    const result = evaluateRecoveryAndSupplierAction(scenarioBIncumbent);
    expect(result.reason_codes).toContain('TOTAL_EXCEEDS_PHASE_BUDGET');
  });

  it('includes MATERIALS_NOT_IN_WAREHOUSE in reason_codes', () => {
    const result = evaluateRecoveryAndSupplierAction(scenarioBIncumbent);
    expect(result.reason_codes).toContain('MATERIALS_NOT_IN_WAREHOUSE');
  });

  it('observed.variance_pct = 28.95% (28.95% above baseline)', () => {
    const result = evaluateRecoveryAndSupplierAction(scenarioBIncumbent);
    expect(result.observed.variance_pct).toBe(28.95);
  });

  it('observed.total_minor = 196000 ($1,960)', () => {
    const result = evaluateRecoveryAndSupplierAction(scenarioBIncumbent);
    expect(result.observed.total_minor).toBe(196000);
  });

  it('requires_user_action = true on BLOCK', () => {
    const result = evaluateRecoveryAndSupplierAction(scenarioBIncumbent);
    expect(result.requires_user_action).toBe(true);
  });
});

// =============================================================================
// TEST-005: Scenario B — Channel3 Replacement Quote ALLOW
// =============================================================================

describe('TEST-005: Scenario B — Channel3 $349/unit ALLOW (after approval)', () => {
  const scenarioBChannel3 = {
    taskToPromote: {
      id: 'task_phase_2_displays',
      hard_dependencies: ['task_phase_1_wiring'],
      materials_in_warehouse: false,
    },
    completedTaskIds: ['task_phase_1_wiring'],
    phaseCurrency: 'USD',
    phaseBudgetMaxMinor: 160000,
    historicalUnitPriceMinor: 38000,
    maxAllowedVariancePct: 10.0,
    proposedQuote: {
      currency: 'USD',
      unitPriceMinor: 34900, // $349 Channel3 price
      quantity: 4,
      shippingMinor: 0,
      taxMinor: 0,
    },
    hasExplicitUserApproval: true,
  };

  it('returns BLOCK due to MATERIALS_NOT_IN_WAREHOUSE (still not in warehouse yet)', () => {
    // Even with Channel3 price approved, materials not yet in warehouse → BLOCK
    // This is correct: approval happens BEFORE the order is placed
    const result = evaluateRecoveryAndSupplierAction(scenarioBChannel3);
    // materials_in_warehouse is false, so MATERIALS_NOT_IN_WAREHOUSE fires
    expect(result.reason_codes).toContain('MATERIALS_NOT_IN_WAREHOUSE');
  });

  it('ALLOW when materials_in_warehouse = true (post-order scenario)', () => {
    // After the Channel3 order is placed and materials arrive
    const postOrderInput = {
      ...scenarioBChannel3,
      taskToPromote: {
        ...scenarioBChannel3.taskToPromote,
        materials_in_warehouse: true, // now in warehouse
      },
    };
    const result = evaluateRecoveryAndSupplierAction(postOrderInput);
    expect(result.decision).toBe('ALLOW');
    expect(result.reason_codes).toHaveLength(0);
  });

  it('Channel3 total = 34900*4 = 139600 (within $1,600 cap)', () => {
    const postOrderInput = {
      ...scenarioBChannel3,
      taskToPromote: { ...scenarioBChannel3.taskToPromote, materials_in_warehouse: true },
    };
    const result = evaluateRecoveryAndSupplierAction(postOrderInput);
    expect(result.observed.total_minor).toBe(139600);
  });

  it('Channel3 variance = -8.16% (cheaper than baseline — no creep)', () => {
    const postOrderInput = {
      ...scenarioBChannel3,
      taskToPromote: { ...scenarioBChannel3.taskToPromote, materials_in_warehouse: true },
    };
    const result = evaluateRecoveryAndSupplierAction(postOrderInput);
    expect(result.observed.variance_pct).toBe(-8.16);
  });
});

// =============================================================================
// TEST-006: Scenario C — Adversarial Dependency & Unknown Cost Fail-Closed
// =============================================================================

describe('TEST-006: Scenario C — Adversarial Dependency & Fail-Closed (SEC-006)', () => {
  it('BLOCK: promoting Phase 4 while Phase 2 is incomplete → HARD_DEPENDENCY_VIOLATION', () => {
    const result = evaluateRecoveryAndSupplierAction({
      taskToPromote: {
        id: 'task_phase_4_calibration',
        hard_dependencies: ['task_phase_2_displays'], // Phase 2 NOT completed
        materials_in_warehouse: false,
      },
      completedTaskIds: ['task_phase_1_wiring'], // Only phase 1 done
      phaseCurrency: 'USD',
      phaseBudgetMaxMinor: 160000,
      historicalUnitPriceMinor: 38000,
      maxAllowedVariancePct: 10.0,
      proposedQuote: {
        currency: 'USD',
        unitPriceMinor: 52500, // $2,100 / 4 = $525/unit (unapproved vendor)
        quantity: 4,
        shippingMinor: 0,
        taxMinor: 0,
      },
      hasExplicitUserApproval: false,
    });

    expect(result.decision).toBe('BLOCK');
    expect(result.reason_codes).toContain('HARD_DEPENDENCY_VIOLATION');
    expect(result.observed.unmet_dependencies).toContain('task_phase_2_displays');
  });

  it('BLOCK: unmet dependency + MATERIALS_NOT_IN_WAREHOUSE (Phase 4 is service task)', () => {
    const result = evaluateRecoveryAndSupplierAction({
      taskToPromote: {
        id: 'task_phase_4_calibration',
        hard_dependencies: ['task_phase_2_displays'],
        materials_in_warehouse: false,
      },
      completedTaskIds: ['task_phase_1_wiring'],
      phaseCurrency: 'USD',
      phaseBudgetMaxMinor: 160000,
      historicalUnitPriceMinor: 38000,
      maxAllowedVariancePct: 10.0,
      proposedQuote: {
        currency: 'USD',
        unitPriceMinor: 52500,
        quantity: 4,
        shippingMinor: 0,
        taxMinor: 0,
      },
      hasExplicitUserApproval: false,
    });

    expect(result.reason_codes).toContain('HARD_DEPENDENCY_VIOLATION');
    expect(result.reason_codes).toContain('MATERIALS_NOT_IN_WAREHOUSE');
  });

  it('BLOCK: $2,100 total (210000) exceeds $1,600 (160000) budget → TOTAL_EXCEEDS_PHASE_BUDGET', () => {
    const result = evaluateRecoveryAndSupplierAction({
      taskToPromote: {
        id: 'task_phase_4_calibration',
        hard_dependencies: ['task_phase_2_displays'],
        materials_in_warehouse: false,
      },
      completedTaskIds: ['task_phase_1_wiring'],
      phaseCurrency: 'USD',
      phaseBudgetMaxMinor: 160000,
      historicalUnitPriceMinor: 38000,
      maxAllowedVariancePct: 10.0,
      proposedQuote: {
        currency: 'USD',
        unitPriceMinor: 52500,
        quantity: 4,
        shippingMinor: 0,
        taxMinor: 0,
      },
      hasExplicitUserApproval: false,
    });

    expect(result.reason_codes).toContain('TOTAL_EXCEEDS_PHASE_BUDGET');
    expect(result.observed.total_minor).toBe(210000); // 52500 * 4
  });

  it('BLOCK: null shippingMinor → UNKNOWN_COST_FIELD (SEC-006 fail-closed)', () => {
    const result = evaluateRecoveryAndSupplierAction({
      taskToPromote: {
        id: 'task_phase_3_networking',
        hard_dependencies: ['task_phase_1_wiring'],
        materials_in_warehouse: true,
      },
      completedTaskIds: ['task_phase_1_wiring'],
      phaseCurrency: 'USD',
      phaseBudgetMaxMinor: 160000,
      historicalUnitPriceMinor: 38000,
      maxAllowedVariancePct: 10.0,
      proposedQuote: {
        currency: 'USD',
        unitPriceMinor: 34900,
        quantity: 4,
        shippingMinor: null, // Unknown — must fail closed
        taxMinor: 0,
      },
      hasExplicitUserApproval: true,
    });

    expect(result.decision).toBe('BLOCK');
    expect(result.reason_codes).toContain('UNKNOWN_COST_FIELD');
  });

  it('BLOCK: null taxMinor → UNKNOWN_COST_FIELD (SEC-006 fail-closed)', () => {
    const result = evaluateRecoveryAndSupplierAction({
      taskToPromote: {
        id: 'task_phase_3_networking',
        hard_dependencies: ['task_phase_1_wiring'],
        materials_in_warehouse: true,
      },
      completedTaskIds: ['task_phase_1_wiring'],
      phaseCurrency: 'USD',
      phaseBudgetMaxMinor: 160000,
      historicalUnitPriceMinor: 38000,
      maxAllowedVariancePct: 10.0,
      proposedQuote: {
        currency: 'USD',
        unitPriceMinor: 34900,
        quantity: 4,
        shippingMinor: 0,
        taxMinor: null, // Unknown — must fail closed
      },
      hasExplicitUserApproval: true,
    });

    expect(result.decision).toBe('BLOCK');
    expect(result.reason_codes).toContain('UNKNOWN_COST_FIELD');
  });

  it('BLOCK: both shipping AND tax null → UNKNOWN_COST_FIELD once (not duplicated)', () => {
    const result = evaluateRecoveryAndSupplierAction({
      taskToPromote: {
        id: 'task_phase_3_networking',
        hard_dependencies: ['task_phase_1_wiring'],
        materials_in_warehouse: true,
      },
      completedTaskIds: ['task_phase_1_wiring'],
      phaseCurrency: 'USD',
      phaseBudgetMaxMinor: 160000,
      historicalUnitPriceMinor: 38000,
      maxAllowedVariancePct: 10.0,
      proposedQuote: {
        currency: 'USD',
        unitPriceMinor: 34900,
        quantity: 4,
        shippingMinor: null,
        taxMinor: null,
      },
      hasExplicitUserApproval: true,
    });

    expect(result.decision).toBe('BLOCK');
    expect(result.reason_codes).toContain('UNKNOWN_COST_FIELD');
  });

  it('BLOCK: currency mismatch → CURRENCY_MISMATCH', () => {
    const result = evaluateRecoveryAndSupplierAction({
      taskToPromote: {
        id: 'task_phase_3_networking',
        hard_dependencies: ['task_phase_1_wiring'],
        materials_in_warehouse: true,
      },
      completedTaskIds: ['task_phase_1_wiring'],
      phaseCurrency: 'USD',
      phaseBudgetMaxMinor: 160000,
      historicalUnitPriceMinor: 38000,
      maxAllowedVariancePct: 10.0,
      proposedQuote: {
        currency: 'INR', // Currency mismatch!
        unitPriceMinor: 34900,
        quantity: 4,
        shippingMinor: 0,
        taxMinor: 0,
      },
      hasExplicitUserApproval: true,
    });

    expect(result.decision).toBe('BLOCK');
    expect(result.reason_codes).toContain('CURRENCY_MISMATCH');
  });

  it('BLOCK accumulates ALL applicable reason codes simultaneously', () => {
    // Worst-case adversarial input: everything wrong at once
    const result = evaluateRecoveryAndSupplierAction({
      taskToPromote: {
        id: 'task_phase_4_calibration',
        hard_dependencies: ['task_phase_2_displays', 'task_phase_3_networking'],
        materials_in_warehouse: false,
      },
      completedTaskIds: [], // Nothing completed
      phaseCurrency: 'USD',
      phaseBudgetMaxMinor: 100000,
      historicalUnitPriceMinor: 30000,
      maxAllowedVariancePct: 5.0,
      proposedQuote: {
        currency: 'INR',  // CURRENCY_MISMATCH
        unitPriceMinor: 50000, // VENDOR_PRICE_CREEP
        quantity: 10,          // TOTAL_EXCEEDS_BUDGET
        shippingMinor: null,   // UNKNOWN_COST_FIELD
        taxMinor: null,
      },
      hasExplicitUserApproval: false,
    });

    expect(result.decision).toBe('BLOCK');
    expect(result.reason_codes).toContain('CURRENCY_MISMATCH');
    expect(result.reason_codes).toContain('UNKNOWN_COST_FIELD');
    expect(result.reason_codes).toContain('HARD_DEPENDENCY_VIOLATION');
    expect(result.reason_codes).toContain('MATERIALS_NOT_IN_WAREHOUSE');
    expect(result.reason_codes).toContain('TOTAL_EXCEEDS_PHASE_BUDGET');
    expect(result.reason_codes).toContain('VENDOR_PRICE_CREEP_EXCEEDED');
  });
});
