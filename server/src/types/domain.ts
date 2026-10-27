/**
 * @file domain.ts
 * @description Canonical TypeScript domain interfaces for CascadeOS.
 *
 * CRITICAL RULES (REQ-002, PAT-003):
 * - ALL monetary amounts are stored as INTEGER MINOR UNITS (e.g., USD cents).
 *   $1,396.00 → 139600  |  $4,500.00 → 450000
 * - Conversion to decimal strings happens ONLY at the PayPal API boundary via
 *   formatMinorToPayPalValue() in moneyAndHash.ts.
 * - Never use `number` for money and then divide by 100 ad-hoc — use these types.
 */

// =============================================================================
// MONEY VALUE OBJECT (PAT-003)
// =============================================================================

/** A type-safe money value in integer minor units (cents, paise, etc.) */
export interface MinorUnitMoney {
  /** Integer minor units — e.g., 139600 for USD $1,396.00 */
  readonly amountMinor: number;
  /** ISO 4217 currency code */
  readonly currency: 'USD' | 'INR';
}

// =============================================================================
// POLICY ENGINE TYPES (REQ-007)
// =============================================================================

/** All possible machine-readable reason codes returned by policyEngine.ts */
export type ReasonCode =
  | 'HARD_DEPENDENCY_VIOLATION'
  | 'MATERIALS_NOT_IN_WAREHOUSE'
  | 'VENDOR_PRICE_CREEP_EXCEEDED'
  | 'TOTAL_EXCEEDS_PHASE_BUDGET'
  | 'CURRENCY_MISMATCH'
  | 'UNKNOWN_COST_FIELD'
  | 'STALE_FINGERPRINT_APPROVAL';

/** The three possible outcomes from the deterministic policy firewall */
export type PolicyDecisionType = 'ALLOW' | 'BLOCK' | 'REQUIRE_APPROVAL';

/**
 * Full result returned by policyEngine.evaluateRecoveryAndSupplierAction().
 * Always includes both Observed and Permitted values for UI diff display (GUD-002).
 */
export interface PolicyEvaluationResult {
  decision: PolicyDecisionType;
  reason_codes: ReasonCode[];
  /** Values actually observed for this proposal */
  observed: {
    currency: string;
    total_minor: number;
    variance_pct: number;
    unmet_dependencies: string[];
  };
  /** Values the policy permits */
  permitted: {
    currency: string;
    max_budget_minor: number;
    max_variance_pct: number;
  };
  requires_user_action: boolean;
}

// =============================================================================
// SCHEDULE STATUS (tasks table)
// =============================================================================

export type ScheduleStatus =
  | 'COMPLETED'
  | 'SCHEDULED'
  | 'PAYMENT_BLOCKED'
  | 'READY_TO_PROMOTE'
  | 'BLOCKED_BY_DEPENDENCY'
  | 'REROUTED_ACTIVE'
  | 'MATERIALS_ORDERED';

// =============================================================================
// PAYPAL INVOICE STATUS (tasks table)
// =============================================================================

export type PayPalInvoiceStatus =
  | 'DRAFT'
  | 'SENT'
  | 'OVERDUE'
  | 'PARTIALLY_PAID'
  | 'PAID'
  | 'CANCELLED';

// =============================================================================
// CORE DOMAIN ENTITIES
// =============================================================================

/**
 * A project container for a 6-phase buildout.
 * Maps 1:1 to the `projects` SQLite table (ARC-003).
 */
export interface Project {
  project_id: string;
  name: string;
  currency: string; // ISO 4217, length === 3
  created_at: string; // ISO-8601 UTC
  updated_at: string; // ISO-8601 UTC
}

/**
 * A single billable phase/task in a project.
 * All monetary fields are integer minor units (REQ-002).
 * Maps 1:1 to the `tasks` SQLite table (ARC-003).
 */
export interface CascadeTask {
  task_id: string;
  project_id: string;
  /** Optimistic locking version counter — incremented on each update */
  version: number;
  name: string;
  /** ISO 8601 date string: YYYY-MM-DD */
  start_date: string;
  /** ISO 8601 date string: YYYY-MM-DD */
  end_date: string;
  duration_days: number; // > 0
  /** 1 = materials physically present in warehouse; 0 = not present */
  materials_in_warehouse: 0 | 1;
  crew_assigned: string;
  /** Crew idle cost per blocked day in integer minor units */
  daily_idle_burn_minor: number;
  /** SLA penalty for this task being late, in integer minor units */
  sla_delay_penalty_minor: number;
  /** Maximum spend allowed on hardware for this phase, in integer minor units */
  phase_hardware_budget_max_minor: number;
  schedule_status: ScheduleStatus;
  paypal_invoice_id: string | null;
  paypal_invoice_number: string | null;
  /** Direct PayPal Sandbox recipient payment page URL */
  paypal_invoice_view_url: string | null;
  paypal_invoice_status: PayPalInvoiceStatus;
  /** Full invoice total in integer minor units */
  invoice_total_minor: number;
  /** Portion of invoice needed immediately to unlock materials ordering */
  materials_unlock_minor: number;
  /** Portion of invoice deferred to labor milestone */
  deferred_labor_minor: number;
  client_name: string;
  client_email: string;
  /** Base64-encoded PNG QR code from PayPal Sandbox generate-qr-code endpoint */
  qr_code_base64: string | null;
  last_nudge_message: string | null;
  /** ISO-8601 UTC timestamp of last nudge sent */
  last_nudge_sent_at: string | null;
  /** Search query string sent to Channel3 /v0/search */
  sku_search_query: string | null;
  required_quantity: number;
  incumbent_vendor_name: string | null;
  /** Incumbent vendor unit price in integer minor units */
  incumbent_unit_price_minor: number | null;
  /** Historical baseline unit price in integer minor units */
  historical_unit_price_minor: number | null;
  /** Maximum allowed price variance % before VENDOR_PRICE_CREEP_EXCEEDED fires */
  max_allowed_variance_pct: number;
}

/**
 * A finish-to-start dependency between two tasks.
 * Maps 1:1 to the `task_dependencies` SQLite table (ARC-003).
 */
export interface TaskDependency {
  dependency_id: string;
  project_id: string;
  from_task_id: string;
  to_task_id: string;
  lag_days: number;
}

/**
 * A supplier quote from either an incumbent invoice or a live Channel3 API call.
 * All monetary fields are integer minor units (REQ-002).
 * Maps 1:1 to the `supplier_quotes` SQLite table (ARC-003).
 */
export interface SupplierQuote {
  quote_id: string;
  task_id: string;
  /** INCUMBENT_INVOICE = vendor quote; CHANNEL3_LIVE = real-time Channel3 data */
  source_type: 'INCUMBENT_INVOICE' | 'CHANNEL3_LIVE';
  external_product_id: string;
  product_title: string;
  merchant_name: string;
  product_url: string | null;
  image_url: string | null;
  currency: string;
  unit_price_minor: number;
  quantity: number;
  /** null = unknown; NEVER coerce to 0 — fail closed with UNKNOWN_COST_FIELD (SEC-006) */
  shipping_minor: number | null;
  /** null = unknown; NEVER coerce to 0 — fail closed with UNKNOWN_COST_FIELD (SEC-006) */
  tax_minor: number | null;
  total_minor: number;
  /** Percentage variance vs. historical baseline. Can be negative (savings). */
  variance_vs_historical_pct: number;
  /** Savings in minor units vs. incumbent quote. 0 if no incumbent. */
  savings_vs_incumbent_minor: number;
  availability_status: string;
  /** ISO-8601 UTC timestamp when Channel3 was queried */
  observed_at: string;
}

// =============================================================================
// RECOVERY PLAN
// =============================================================================

/**
 * A proposed recovery action for a blocked task.
 * Maps 1:1 to the `recovery_plans` SQLite table (ARC-003).
 */
export interface CascadeRecoveryPlan {
  plan_id: string;
  project_id: string;
  blocked_task_id: string;
  promoted_task_id: string;
  selected_quote_id: string;
  /** SHA-256 fingerprint of canonical state — must match on approval (REQ-008, PAT-002) */
  state_fingerprint: string;
  policy_decision: PolicyDecisionType;
  /** JSON-serialized ReasonCode[] */
  reason_codes_json: string;
  idle_crew_hours: number;
  idle_labor_cost_minor: number;
  sla_penalty_minor: number;
  total_exposure_minor: number;
  /** ISO 8601 date string: YYYY-MM-DD */
  new_promoted_start_date: string;
  /** ISO 8601 date string: YYYY-MM-DD */
  new_blocked_start_date: string;
  immediate_unlock_minor: number;
  deferred_labor_minor: number;
  nudge_draft_text: string;
  status: 'PROPOSED' | 'APPROVED' | 'EXECUTED' | 'BLOCKED' | 'SUPERSEDED';
  created_at: string; // ISO-8601 UTC
}

// =============================================================================
// USER APPROVAL
// =============================================================================

/**
 * Records explicit human approval of a recovery plan (SEC-003, PAT-002).
 * Maps 1:1 to the `user_approvals` SQLite table (ARC-003).
 */
export interface UserApproval {
  approval_id: string;
  plan_id: string;
  /** SHA-256 fingerprint the approver signed off on */
  approved_fingerprint: string;
  /** Identity string of the approver (e.g., user email or session ID) */
  approver_actor: string;
  /** ISO-8601 UTC timestamp */
  approved_at: string;
}

// =============================================================================
// PAYPAL TRANSACTION RECORD
// =============================================================================

export type PayPalTransactionKind =
  | 'INVOICE_CREATE'
  | 'INVOICE_SPLIT_UPDATE'
  | 'INVOICE_REMIND'
  | 'ORDER_CREATE'
  | 'ORDER_CAPTURE';

/**
 * An immutable record of every outbound PayPal API call.
 * Maps 1:1 to the `paypal_transactions` SQLite table (ARC-003).
 * Raw JSON response is stored verbatim for full judge auditability (GUD-006).
 */
export interface PayPalTransactionRecord {
  transaction_record_id: string;
  project_id: string;
  task_id: string;
  plan_id: string | null;
  kind: PayPalTransactionKind;
  /** The primary PayPal resource ID returned (invoice_id, order_id, etc.) */
  paypal_resource_id: string;
  /** Capture ID — only set after ORDER_CAPTURE (REQ-011) */
  paypal_capture_id: string | null;
  status: string;
  currency: string;
  amount_minor: number;
  /** Full raw JSON response from PayPal Sandbox — NEVER redact fields here */
  raw_response_json: string;
  created_at: string; // ISO-8601 UTC
}

// =============================================================================
// AUDIT EVENT (Append-Only)
// =============================================================================

/**
 * An immutable audit log entry.
 * Protected by BEFORE UPDATE / BEFORE DELETE SQLite triggers (SEC-007, PAT-001).
 * Maps 1:1 to the `audit_events` SQLite table (ARC-003).
 */
export interface AuditEvent {
  event_id: string;
  project_id: string;
  task_id: string | null;
  plan_id: string | null;
  event_type: string;
  decision: string | null;
  /** JSON-serialized ReasonCode[] or null */
  reason_codes_json: string | null;
  state_fingerprint: string | null;
  /** PayPal invoice_id or order_id involved */
  paypal_reference_id: string | null;
  /** Channel3 product_id involved */
  channel3_reference_id: string | null;
  summary: string;
  /** Full JSON payload for judge review — includes HTTP status codes and latency (GUD-006) */
  payload_json: string;
  created_at: string; // ISO-8601 UTC
}

// =============================================================================
// COMPOSITE API RESPONSE SHAPE
// =============================================================================

/**
 * Full project state returned by GET /api/projects/:projectId/state (ARC-004).
 * Used by both BryntumGantt and AgStudio data sources (ARC-005).
 */
export interface ProjectStateResponse {
  project: Project;
  tasks: CascadeTask[];
  dependencies: TaskDependency[];
  supplierQuotes: SupplierQuote[];
  activeRecoveryPlan: CascadeRecoveryPlan | null;
  paypalTransactions: PayPalTransactionRecord[];
  auditEvents: AuditEvent[];
}

// =============================================================================
// BLAST RADIUS ANALYSIS RESULT
// =============================================================================

/**
 * Result from criticalPathEngine.analyzeProjectBlastRadius() (REQ-005).
 * All monetary values are integer minor units.
 */
export interface BlastRadiusResult {
  /** Task IDs that are directly or transitively blocked */
  blocked_task_ids: string[];
  idle_crew_hours: number;
  idle_labor_cost_minor: number;
  sla_penalty_minor: number;
  total_exposure_minor: number;
  /** Tasks eligible for schedule promotion (dependencies met + materials_in_warehouse === 1) */
  promotable_candidate_ids: string[];
}

// =============================================================================
// SCHEDULE REROUTE RESULT
// =============================================================================

/**
 * Result from scheduleRerouter.computeReroutedSchedule() (REQ-005).
 */
export interface RerouteResult {
  promoted_task_id: string;
  blocked_task_id: string;
  /** New ISO 8601 date string for the promoted task */
  new_promoted_start_date: string;
  /** New ISO 8601 date string for the blocked task (deferred) */
  new_blocked_start_date: string;
  dependency_check_passed: boolean;
  exposure_mitigated_minor: number;
}
