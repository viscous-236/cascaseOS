-- =============================================================================
-- CascadeOS — SQLite Database Schema
-- File: server/src/db/schema.sql
-- =============================================================================
-- CRITICAL: This DDL is the single source of truth (ARC-003).
-- Do NOT modify table or column definitions without updating domain.ts to match.
-- All monetary columns are INTEGER minor units (e.g., 139600 = USD $1,396.00).
-- =============================================================================

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS projects (
  project_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  currency TEXT NOT NULL CHECK (length(currency) = 3),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  task_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  version INTEGER NOT NULL DEFAULT 1,
  name TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  duration_days INTEGER NOT NULL CHECK (duration_days > 0),
  materials_in_warehouse INTEGER NOT NULL CHECK (materials_in_warehouse IN (0, 1)),
  crew_assigned TEXT NOT NULL,
  daily_idle_burn_minor INTEGER NOT NULL CHECK (daily_idle_burn_minor >= 0),
  sla_delay_penalty_minor INTEGER NOT NULL CHECK (sla_delay_penalty_minor >= 0),
  phase_hardware_budget_max_minor INTEGER NOT NULL CHECK (phase_hardware_budget_max_minor >= 0),
  schedule_status TEXT NOT NULL CHECK (
    schedule_status IN (
      'COMPLETED',
      'SCHEDULED',
      'PAYMENT_BLOCKED',
      'READY_TO_PROMOTE',
      'BLOCKED_BY_DEPENDENCY',
      'REROUTED_ACTIVE',
      'MATERIALS_ORDERED'
    )
  ),
  paypal_invoice_id TEXT,
  paypal_invoice_number TEXT,
  paypal_invoice_view_url TEXT,
  paypal_invoice_status TEXT NOT NULL CHECK (
    paypal_invoice_status IN ('DRAFT', 'SENT', 'OVERDUE', 'PARTIALLY_PAID', 'PAID', 'CANCELLED')
  ),
  invoice_total_minor INTEGER NOT NULL CHECK (invoice_total_minor >= 0),
  materials_unlock_minor INTEGER NOT NULL CHECK (materials_unlock_minor >= 0),
  deferred_labor_minor INTEGER NOT NULL CHECK (deferred_labor_minor >= 0),
  client_name TEXT NOT NULL,
  client_email TEXT NOT NULL,
  qr_code_base64 TEXT,
  last_nudge_message TEXT,
  last_nudge_sent_at TEXT,
  sku_search_query TEXT,
  required_quantity INTEGER NOT NULL DEFAULT 0,
  incumbent_vendor_name TEXT,
  incumbent_unit_price_minor INTEGER,
  historical_unit_price_minor INTEGER,
  max_allowed_variance_pct REAL NOT NULL DEFAULT 10.0
);

CREATE TABLE IF NOT EXISTS task_dependencies (
  dependency_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  from_task_id TEXT NOT NULL REFERENCES tasks(task_id),
  to_task_id TEXT NOT NULL REFERENCES tasks(task_id),
  lag_days INTEGER NOT NULL DEFAULT 0,
  UNIQUE(project_id, from_task_id, to_task_id)
);

CREATE TABLE IF NOT EXISTS supplier_quotes (
  quote_id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(task_id),
  source_type TEXT NOT NULL CHECK (source_type IN ('INCUMBENT_INVOICE', 'CHANNEL3_LIVE')),
  external_product_id TEXT NOT NULL,
  product_title TEXT NOT NULL,
  merchant_name TEXT NOT NULL,
  product_url TEXT,
  image_url TEXT,
  currency TEXT NOT NULL,
  unit_price_minor INTEGER NOT NULL CHECK (unit_price_minor >= 0),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  shipping_minor INTEGER,
  tax_minor INTEGER,
  total_minor INTEGER NOT NULL CHECK (total_minor >= 0),
  variance_vs_historical_pct REAL NOT NULL,
  savings_vs_incumbent_minor INTEGER NOT NULL DEFAULT 0,
  availability_status TEXT NOT NULL,
  observed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS recovery_plans (
  plan_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  blocked_task_id TEXT NOT NULL REFERENCES tasks(task_id),
  promoted_task_id TEXT NOT NULL REFERENCES tasks(task_id),
  selected_quote_id TEXT NOT NULL REFERENCES supplier_quotes(quote_id),
  state_fingerprint TEXT NOT NULL,
  policy_decision TEXT NOT NULL CHECK (policy_decision IN ('ALLOW', 'BLOCK', 'REQUIRE_APPROVAL')),
  reason_codes_json TEXT NOT NULL,
  idle_crew_hours INTEGER NOT NULL,
  idle_labor_cost_minor INTEGER NOT NULL,
  sla_penalty_minor INTEGER NOT NULL,
  total_exposure_minor INTEGER NOT NULL,
  new_promoted_start_date TEXT NOT NULL,
  new_blocked_start_date TEXT NOT NULL,
  immediate_unlock_minor INTEGER NOT NULL,
  deferred_labor_minor INTEGER NOT NULL,
  nudge_draft_text TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PROPOSED', 'APPROVED', 'EXECUTED', 'BLOCKED', 'SUPERSEDED')),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_approvals (
  approval_id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES recovery_plans(plan_id),
  approved_fingerprint TEXT NOT NULL,
  approver_actor TEXT NOT NULL,
  approved_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS paypal_transactions (
  transaction_record_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  task_id TEXT NOT NULL REFERENCES tasks(task_id),
  plan_id TEXT REFERENCES recovery_plans(plan_id),
  kind TEXT NOT NULL CHECK (kind IN ('INVOICE_CREATE', 'INVOICE_SPLIT_UPDATE', 'INVOICE_REMIND', 'ORDER_CREATE', 'ORDER_CAPTURE')),
  paypal_resource_id TEXT NOT NULL,
  paypal_capture_id TEXT,
  status TEXT NOT NULL,
  currency TEXT NOT NULL,
  amount_minor INTEGER NOT NULL,
  raw_response_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_events (
  event_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  task_id TEXT,
  plan_id TEXT,
  event_type TEXT NOT NULL,
  decision TEXT,
  reason_codes_json TEXT,
  state_fingerprint TEXT,
  paypal_reference_id TEXT,
  channel3_reference_id TEXT,
  summary TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- =============================================================================
-- APPEND-ONLY AUDIT LEDGER TRIGGERS (SEC-007)
-- These triggers enforce that audit_events rows can NEVER be modified
-- or deleted once written. Any attempt raises ABORT.
-- =============================================================================

CREATE TRIGGER IF NOT EXISTS prevent_audit_update
BEFORE UPDATE ON audit_events
BEGIN
  SELECT RAISE(ABORT, 'Audit ledger is append-only: UPDATE prohibited');
END;

CREATE TRIGGER IF NOT EXISTS prevent_audit_delete
BEFORE DELETE ON audit_events
BEGIN
  SELECT RAISE(ABORT, 'Audit ledger is append-only: DELETE prohibited');
END;
