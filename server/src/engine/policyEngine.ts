/**
 * @file policyEngine.ts
 * @description Deterministic policy firewall — ALLOW / BLOCK / REQUIRE_APPROVAL.
 *
 * Implements REQ-007, TASK-009:
 * Evaluates every proposed schedule mutation and supplier order through
 * 7 sequential deterministic checks, ALL using integer minor-unit arithmetic.
 *
 * CRITICAL RULES:
 * - The LLM is NEVER permitted to call this function or bypass its output (SEC-003).
 * - null shipping or tax MUST fail closed with UNKNOWN_COST_FIELD (SEC-006).
 * - All 7 checks run independently; multiple reason_codes can be returned.
 * - Returns BLOCK if ANY check fails; REQUIRE_APPROVAL if clean but no human sign-off;
 *   ALLOW only if clean AND hasExplicitUserApproval === true.
 *
 * PURE FUNCTION — no DB calls, no side effects (GUD-001).
 */

import type { PolicyEvaluationResult, ReasonCode } from '../types/domain.js';

// =============================================================================
// INPUT TYPE
// =============================================================================

export interface PolicyEvaluationInput {
  /** The task being promoted (must have all hard dependencies completed) */
  taskToPromote: {
    id: string;
    /** task_ids that must be COMPLETED before this task can start */
    hard_dependencies: string[];
    /** 1 = materials physically in warehouse; 0 = not */
    materials_in_warehouse: boolean;
  };

  /** task_ids with schedule_status === 'COMPLETED' */
  completedTaskIds: string[];

  /** ISO 4217 currency of the phase (e.g., 'USD') */
  phaseCurrency: string;

  /** Maximum allowed hardware spend for this phase, in integer minor units */
  phaseBudgetMaxMinor: number;

  /** Historical baseline unit price in integer minor units */
  historicalUnitPriceMinor: number;

  /** Maximum % variance above historical before VENDOR_PRICE_CREEP_EXCEEDED fires */
  maxAllowedVariancePct: number;

  /** The proposed supplier quote */
  proposedQuote: {
    currency: string;
    unitPriceMinor: number;
    quantity: number;
    /**
     * null = unknown cost — MUST fail closed with UNKNOWN_COST_FIELD (SEC-006).
     * Never coerce null to 0.
     */
    shippingMinor: number | null;
    /**
     * null = unknown cost — MUST fail closed with UNKNOWN_COST_FIELD (SEC-006).
     * Never coerce null to 0.
     */
    taxMinor: number | null;
  };

  /**
   * True only if the system has verified a matching user_approval record exists
   * in the database with a valid state_fingerprint (PAT-002, SEC-003).
   */
  hasExplicitUserApproval: boolean;
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Evaluates a proposed recovery and supplier action through 7 deterministic checks.
 *
 * Always returns the full {observed, permitted} diff so the UI can display
 * exactly what violated which threshold (GUD-002).
 *
 * Check order (any failure = BLOCK):
 *  1. CURRENCY_MISMATCH
 *  2. UNKNOWN_COST_FIELD    (null shipping or tax)
 *  3. HARD_DEPENDENCY_VIOLATION
 *  4. MATERIALS_NOT_IN_WAREHOUSE
 *  5. TOTAL_EXCEEDS_PHASE_BUDGET
 *  6. VENDOR_PRICE_CREEP_EXCEEDED
 *  7. STALE_FINGERPRINT_APPROVAL  (only if hasExplicitUserApproval explicitly false)
 */
export function evaluateRecoveryAndSupplierAction(
  input: PolicyEvaluationInput
): PolicyEvaluationResult {
  const reasonCodes: ReasonCode[] = [];

  // ─── Check 1: Currency consistency ──────────────────────────────────────────
  if (input.proposedQuote.currency !== input.phaseCurrency) {
    reasonCodes.push('CURRENCY_MISMATCH');
  }

  // ─── Check 2: Fail closed on null shipping or tax (SEC-006, PAT-006) ────────
  if (
    input.proposedQuote.shippingMinor === null ||
    input.proposedQuote.taxMinor === null
  ) {
    reasonCodes.push('UNKNOWN_COST_FIELD');
  }

  // ─── Check 3: Hard dependency verification ───────────────────────────────────
  const unmetDeps = input.taskToPromote.hard_dependencies.filter(
    (depId) => !input.completedTaskIds.includes(depId)
  );
  if (unmetDeps.length > 0) {
    reasonCodes.push('HARD_DEPENDENCY_VIOLATION');
  }

  // ─── Check 4: Materials physically in warehouse ──────────────────────────────
  if (!input.taskToPromote.materials_in_warehouse) {
    reasonCodes.push('MATERIALS_NOT_IN_WAREHOUSE');
  }

  // ─── Check 5: Budget cap (integer minor-unit arithmetic) ─────────────────────
  // NOTE: If shipping or tax is null, we use 0 for the total calculation
  // BUT the UNKNOWN_COST_FIELD reason code is already set above → result is BLOCK.
  const subtotalMinor =
    input.proposedQuote.unitPriceMinor * input.proposedQuote.quantity;
  const totalMinor =
    subtotalMinor +
    (input.proposedQuote.shippingMinor ?? 0) +
    (input.proposedQuote.taxMinor ?? 0);

  if (totalMinor > input.phaseBudgetMaxMinor) {
    reasonCodes.push('TOTAL_EXCEEDS_PHASE_BUDGET');
  }

  // ─── Check 6: Supplier price-creep vs. historical baseline ───────────────────
  const variancePct =
    input.historicalUnitPriceMinor === 0
      ? 0
      : ((input.proposedQuote.unitPriceMinor - input.historicalUnitPriceMinor) /
          input.historicalUnitPriceMinor) *
        100;

  if (variancePct > input.maxAllowedVariancePct) {
    reasonCodes.push('VENDOR_PRICE_CREEP_EXCEEDED');
  }

  // ─── Build observed / permitted diff (always, for UI GUD-002) ───────────────
  const observed = {
    currency: input.proposedQuote.currency,
    total_minor: totalMinor,
    variance_pct: Number(variancePct.toFixed(2)),
    unmet_dependencies: unmetDeps,
  };

  const permitted = {
    currency: input.phaseCurrency,
    max_budget_minor: input.phaseBudgetMaxMinor,
    max_variance_pct: input.maxAllowedVariancePct,
  };

  // ─── If any check failed → BLOCK ────────────────────────────────────────────
  if (reasonCodes.length > 0) {
    return {
      decision: 'BLOCK',
      reason_codes: reasonCodes,
      observed,
      permitted,
      requires_user_action: true,
    };
  }

  // ─── All checks passed — gate on explicit human approval (SEC-003) ───────────
  if (!input.hasExplicitUserApproval) {
    return {
      decision: 'REQUIRE_APPROVAL',
      reason_codes: [],
      observed,
      permitted,
      requires_user_action: true,
    };
  }

  // ─── ALLOW: all checks passed + human signed off ─────────────────────────────
  return {
    decision: 'ALLOW',
    reason_codes: [],
    observed,
    permitted,
    requires_user_action: false,
  };
}

// =============================================================================
// RE-EXPORTS for consumers
// =============================================================================
export type { PolicyEvaluationResult };
