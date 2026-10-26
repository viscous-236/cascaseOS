/**
 * @file domain.ts
 * @description Strongly typed frontend domain interfaces for CascadeOS.
 *
 * Implements:
 * - REQ-002: Integer minor units throughout
 * - ARC-005: Unified Project State tree matching Express backend
 */

export type ScheduleStatus =
  | 'COMPLETED'
  | 'SCHEDULED'
  | 'PAYMENT_BLOCKED'
  | 'READY_TO_PROMOTE'
  | 'BLOCKED_BY_DEPENDENCY'
  | 'REROUTED_ACTIVE'
  | 'MATERIALS_ORDERED';

export type PayPalInvoiceStatus =
  | 'DRAFT'
  | 'SENT'
  | 'OVERDUE'
  | 'PARTIALLY_PAID'
  | 'PAID'
  | 'CANCELLED';

export type ReasonCode =
  | 'HARD_DEPENDENCY_VIOLATION'
  | 'MATERIALS_NOT_IN_WAREHOUSE'
  | 'VENDOR_PRICE_CREEP_EXCEEDED'
  | 'TOTAL_EXCEEDS_PHASE_BUDGET'
  | 'CURRENCY_MISMATCH'
  | 'UNKNOWN_COST_FIELD'
  | 'STALE_FINGERPRINT_APPROVAL';

export type PolicyDecisionType = 'ALLOW' | 'BLOCK' | 'REQUIRE_APPROVAL';

export interface PolicyEvaluationResult {
  decision: PolicyDecisionType;
  reason_codes: ReasonCode[];
  observed: {
    currency: string;
    total_minor: number;
    variance_pct: number;
    unmet_dependencies: string[];
  };
  permitted: {
    currency: string;
    max_budget_minor: number;
    max_variance_pct: number;
  };
  requires_user_action: boolean;
}

export interface Project {
  project_id: string;
  name: string;
  currency: string;
  created_at: string;
  updated_at: string;
}

export interface ProjectSummary extends Project {
  total_tasks: number;
  overdue_invoices_count: number;
  total_exposure_minor: number;
  total_arbitrage_savings_minor: number;
}

export interface ManualTaskInput {
  task_id?: string;
  name: string;
  duration_days: number;
  start_date?: string;
  end_date?: string;
  materials_in_warehouse?: boolean;
  crew_assigned?: string;
  daily_idle_burn_minor?: number;
  sla_delay_penalty_minor?: number;
  phase_hardware_budget_max_minor?: number;
  schedule_status?: ScheduleStatus;
  invoice_total_minor?: number;
  materials_unlock_minor?: number;
  deferred_labor_minor?: number;
  sku_search_query?: string | null;
  required_quantity?: number;
  incumbent_vendor_name?: string | null;
  incumbent_unit_price_minor?: number | null;
  historical_unit_price_minor?: number | null;
  max_allowed_variance_pct?: number;
  create_live_paypal_invoice?: boolean;
}

export interface TaskDependencyInput {
  from_task_id: string;
  to_task_id: string;
  lag_days?: number;
}

export interface CreateCustomProjectPayload {
  mode: 'AI_ARCHITECT' | 'MANUAL_STRUCTURED';
  project_name: string;
  currency?: 'USD';
  start_date: string;
  client_name: string;
  client_email: string;
  ai_prompt?: string;
  tasks?: ManualTaskInput[];
  dependencies?: TaskDependencyInput[];
  create_live_paypal_invoices?: boolean;
  run_live_channel3_audit?: boolean;
}

export interface UpsertTaskPayload {
  task_id?: string;
  name?: string;
  start_date?: string;
  end_date?: string;
  duration_days?: number;
  materials_in_warehouse?: boolean;
  crew_assigned?: string;
  daily_idle_burn_minor?: number;
  sla_delay_penalty_minor?: number;
  phase_hardware_budget_max_minor?: number;
  schedule_status?: ScheduleStatus;
  paypal_invoice_status?: PayPalInvoiceStatus;
  invoice_total_minor?: number;
  materials_unlock_minor?: number;
  deferred_labor_minor?: number;
  sku_search_query?: string | null;
  required_quantity?: number;
  incumbent_vendor_name?: string | null;
  incumbent_unit_price_minor?: number | null;
  historical_unit_price_minor?: number | null;
  max_allowed_variance_pct?: number;
  create_live_paypal_invoice?: boolean;
  run_live_channel3_audit?: boolean;
}

export interface CreateDependencyPayload {
  from_task_id: string;
  to_task_id: string;
  lag_days?: number;
}

export interface CascadeTask {
  task_id: string;
  project_id: string;
  version: number;
  name: string;
  start_date: string;
  end_date: string;
  duration_days: number;
  materials_in_warehouse: 0 | 1;
  crew_assigned: string;
  daily_idle_burn_minor: number;
  sla_delay_penalty_minor: number;
  phase_hardware_budget_max_minor: number;
  schedule_status: ScheduleStatus;
  paypal_invoice_id: string | null;
  paypal_invoice_number: string | null;
  paypal_invoice_status: PayPalInvoiceStatus;
  invoice_total_minor: number;
  materials_unlock_minor: number;
  deferred_labor_minor: number;
  client_name: string;
  client_email: string;
  qr_code_base64: string | null;
  last_nudge_message: string | null;
  last_nudge_sent_at: string | null;
  sku_search_query: string | null;
  required_quantity: number;
  incumbent_vendor_name: string | null;
  incumbent_unit_price_minor: number | null;
  historical_unit_price_minor: number | null;
  max_allowed_variance_pct: number;
}

export interface TaskDependency {
  dependency_id: string;
  project_id: string;
  from_task_id: string;
  to_task_id: string;
  lag_days: number;
}

export interface SupplierQuote {
  quote_id: string;
  task_id: string;
  source_type: 'INCUMBENT_INVOICE' | 'CHANNEL3_LIVE';
  external_product_id: string;
  product_title: string;
  merchant_name: string;
  product_url: string | null;
  image_url: string | null;
  currency: string;
  unit_price_minor: number;
  quantity: number;
  shipping_minor: number | null;
  tax_minor: number | null;
  total_minor: number;
  variance_vs_historical_pct: number;
  savings_vs_incumbent_minor: number;
  availability_status: string;
  observed_at: string;
}

export interface CascadeRecoveryPlan {
  plan_id: string;
  project_id: string;
  blocked_task_id: string;
  promoted_task_id: string;
  selected_quote_id: string;
  state_fingerprint: string;
  policy_decision: PolicyDecisionType;
  reason_codes_json: string;
  idle_crew_hours: number;
  idle_labor_cost_minor: number;
  sla_penalty_minor: number;
  total_exposure_minor: number;
  new_promoted_start_date: string;
  new_blocked_start_date: string;
  immediate_unlock_minor: number;
  deferred_labor_minor: number;
  nudge_draft_text: string;
  status: 'PROPOSED' | 'APPROVED' | 'EXECUTED' | 'BLOCKED' | 'SUPERSEDED';
  created_at: string;
}

export interface UserApproval {
  approval_id: string;
  plan_id: string;
  approved_fingerprint: string;
  approver_actor: string;
  approved_at: string;
}

export interface PayPalTransactionRecord {
  transaction_record_id: string;
  project_id: string;
  task_id: string;
  plan_id: string | null;
  kind: string;
  paypal_resource_id: string;
  paypal_capture_id: string | null;
  status: string;
  currency: string;
  amount_minor: number;
  raw_response_json: string;
  created_at: string;
}

export interface AuditEvent {
  event_id: string;
  project_id: string;
  task_id: string | null;
  plan_id: string | null;
  event_type: string;
  decision: PolicyDecisionType;
  reason_codes_json: string;
  state_fingerprint: string | null;
  paypal_reference_id: string | null;
  channel3_reference_id: string | null;
  summary: string;
  payload_json: string;
  created_at: string;
}

export interface UnifiedProjectState {
  project: Project;
  tasks: CascadeTask[];
  dependencies: TaskDependency[];
  supplierQuotes: SupplierQuote[];
  recoveryPlans: CascadeRecoveryPlan[];
  userApprovals: UserApproval[];
  paypalTransactions: PayPalTransactionRecord[];
  auditEvents: AuditEvent[];
}

export interface SystemHealthResponse {
  status: 'healthy' | 'degraded';
  timestamp: string;
  environment: string;
  database: string;
  paypalSandbox: string;
  channel3: string;
  llm: string;
  llmProvider: string;
  llmModel: string;
}

export interface ScenarioTriggerResponse {
  scenarioId: 'SCENARIO_A' | 'SCENARIO_B' | 'SCENARIO_C';
  success: boolean;
  plan?: CascadeRecoveryPlan;
  blastRadius?: {
    blocked_task_ids: string[];
    idle_crew_hours: number;
    idle_labor_cost_minor: number;
    sla_penalty_minor: number;
    total_exposure_minor: number;
  };
  reroutedSchedule?: {
    promoted_task_id: string;
    blocked_task_id: string;
    new_promoted_start_date: string;
    new_blocked_start_date: string;
  };
  policyResult?: PolicyEvaluationResult;
  nudge?: {
    subject: string;
    body: string;
    summary: string;
    materials_unlock_amount_formatted: string;
  };
  incumbentBlocked?: PolicyEvaluationResult;
  channel3Proposed?: {
    plan: CascadeRecoveryPlan;
    quote: SupplierQuote;
    policyResult: PolicyEvaluationResult;
    explanation?: {
      explanation_md: string;
      remediation_steps: string[];
    };
  };
  decision?: PolicyDecisionType;
  reasonCodes?: ReasonCode[];
}
