/**
 * @file database.ts
 * @description better-sqlite3 database connection manager and typed repository layer.
 *
 * Implements:
 * - REQ-001: Persistent SQLite with WAL mode and foreign keys
 * - PAT-001: Every state mutation + audit INSERT wrapped in db.transaction()
 * - SEC-007: Append-only audit_events enforced by DDL triggers
 *
 * Usage:
 *   import { db, ProjectRepo, TaskRepo, ... } from './database.js';
 */

import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { env } from '../config/env.js';
import type {
  Project,
  CascadeTask,
  TaskDependency,
  SupplierQuote,
  CascadeRecoveryPlan,
  UserApproval,
  PayPalTransactionRecord,
  AuditEvent,
} from '../types/domain.js';

// ---------------------------------------------------------------------------
// Resolve paths relative to this file (ESM-safe)
// ---------------------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SCHEMA_PATH = resolve(__dirname, 'schema.sql');

// ---------------------------------------------------------------------------
// Database singleton
// ---------------------------------------------------------------------------
let _db: Database.Database | null = null;

/**
 * Returns the singleton better-sqlite3 Database instance.
 * Initialises the database (schema + WAL mode) on first call.
 */
export function getDb(): Database.Database {
  if (_db) return _db;
  throw new Error(
    'Database not initialised. Call initDatabase() before accessing getDb().'
  );
}

/**
 * Initialises the SQLite database:
 * 1. Creates the data directory if it doesn't exist.
 * 2. Opens/creates the SQLite file at env.DATABASE_PATH.
 * 3. Runs schema.sql (idempotent — uses CREATE TABLE IF NOT EXISTS).
 * 4. Verifies WAL mode and foreign keys are active.
 *
 * Call this once at server startup in index.ts.
 */
export async function initDatabase(): Promise<void> {
  const dbPath = resolve(process.cwd(), env.DATABASE_PATH);
  const dbDir = dirname(dbPath);

  // Ensure the data directory exists
  await mkdir(dbDir, { recursive: true });

  _db = new Database(dbPath);

  // Execute schema DDL (idempotent)
  const schema = readFileSync(SCHEMA_PATH, 'utf-8');
  _db.exec(schema);

  // Verify PRAGMA settings applied by schema.sql
  const journalMode = (_db.pragma('journal_mode') as Array<{ journal_mode: string }>)[0]?.journal_mode;
  const foreignKeys = (_db.pragma('foreign_keys') as Array<{ foreign_keys: number }>)[0]?.foreign_keys;

  if (journalMode !== 'wal') {
    throw new Error(`Expected WAL journal mode, got: ${journalMode}`);
  }
  if (foreignKeys !== 1) {
    throw new Error(`Expected foreign_keys=ON (1), got: ${foreignKeys}`);
  }

  console.log(`✅  SQLite ready — ${dbPath} [WAL, FK=ON]`);
}

// ---------------------------------------------------------------------------
// Helper: current UTC ISO-8601 timestamp
// ---------------------------------------------------------------------------
function now(): string {
  return new Date().toISOString();
}

// ===========================================================================
// PROJECT REPOSITORY
// ===========================================================================

export const ProjectRepo = {
  findById(projectId: string): Project | undefined {
    return getDb()
      .prepare<[string], Project>('SELECT * FROM projects WHERE project_id = ?')
      .get(projectId);
  },

  findAll(): Project[] {
    return getDb()
      .prepare<[], Project>('SELECT * FROM projects ORDER BY created_at DESC')
      .all();
  },

  insert(project: Omit<Project, 'created_at' | 'updated_at'>): Project {
    const ts = now();
    const row: Project = { ...project, created_at: ts, updated_at: ts };
    getDb()
      .prepare(
        `INSERT INTO projects (project_id, name, currency, created_at, updated_at)
         VALUES (@project_id, @name, @currency, @created_at, @updated_at)`
      )
      .run(row);
    return row;
  },

  touchUpdatedAt(projectId: string): void {
    getDb()
      .prepare('UPDATE projects SET updated_at = ? WHERE project_id = ?')
      .run(now(), projectId);
  },
};

// ===========================================================================
// TASK REPOSITORY
// ===========================================================================

export const TaskRepo = {
  findById(taskId: string): CascadeTask | undefined {
    return getDb()
      .prepare<[string], CascadeTask>('SELECT * FROM tasks WHERE task_id = ?')
      .get(taskId);
  },

  findByProject(projectId: string): CascadeTask[] {
    return getDb()
      .prepare<[string], CascadeTask>(
        'SELECT * FROM tasks WHERE project_id = ? ORDER BY start_date ASC'
      )
      .all(projectId);
  },

  insert(task: CascadeTask): void {
    getDb()
      .prepare(
        `INSERT INTO tasks (
          task_id, project_id, version, name, start_date, end_date, duration_days,
          materials_in_warehouse, crew_assigned, daily_idle_burn_minor,
          sla_delay_penalty_minor, phase_hardware_budget_max_minor,
          schedule_status, paypal_invoice_id, paypal_invoice_number,
          paypal_invoice_status, invoice_total_minor, materials_unlock_minor,
          deferred_labor_minor, client_name, client_email, qr_code_base64,
          last_nudge_message, last_nudge_sent_at, sku_search_query,
          required_quantity, incumbent_vendor_name, incumbent_unit_price_minor,
          historical_unit_price_minor, max_allowed_variance_pct
        ) VALUES (
          @task_id, @project_id, @version, @name, @start_date, @end_date, @duration_days,
          @materials_in_warehouse, @crew_assigned, @daily_idle_burn_minor,
          @sla_delay_penalty_minor, @phase_hardware_budget_max_minor,
          @schedule_status, @paypal_invoice_id, @paypal_invoice_number,
          @paypal_invoice_status, @invoice_total_minor, @materials_unlock_minor,
          @deferred_labor_minor, @client_name, @client_email, @qr_code_base64,
          @last_nudge_message, @last_nudge_sent_at, @sku_search_query,
          @required_quantity, @incumbent_vendor_name, @incumbent_unit_price_minor,
          @historical_unit_price_minor, @max_allowed_variance_pct
        )`
      )
      .run(task);
  },

  /** Update schedule status + dates + version (optimistic increment) */
  updateSchedule(
    taskId: string,
    patch: {
      schedule_status: CascadeTask['schedule_status'];
      start_date?: string;
      end_date?: string;
      end_date_new?: string;
    }
  ): void {
    getDb()
      .prepare(
        `UPDATE tasks
         SET schedule_status = @schedule_status,
             start_date = COALESCE(@start_date, start_date),
             end_date = COALESCE(@end_date, end_date),
             version = version + 1
         WHERE task_id = @task_id`
      )
      .run({ task_id: taskId, ...patch });
  },

  /** Update PayPal invoice fields after real Sandbox API calls */
  updateInvoice(
    taskId: string,
    patch: {
      paypal_invoice_id?: string | null;
      paypal_invoice_number?: string | null;
      paypal_invoice_status?: CascadeTask['paypal_invoice_status'];
      qr_code_base64?: string | null;
      last_nudge_message?: string | null;
      last_nudge_sent_at?: string | null;
    }
  ): void {
    getDb()
      .prepare(
        `UPDATE tasks
         SET paypal_invoice_id      = COALESCE(@paypal_invoice_id, paypal_invoice_id),
             paypal_invoice_number  = COALESCE(@paypal_invoice_number, paypal_invoice_number),
             paypal_invoice_status  = COALESCE(@paypal_invoice_status, paypal_invoice_status),
             qr_code_base64         = COALESCE(@qr_code_base64, qr_code_base64),
             last_nudge_message     = COALESCE(@last_nudge_message, last_nudge_message),
             last_nudge_sent_at     = COALESCE(@last_nudge_sent_at, last_nudge_sent_at),
             version                = version + 1
         WHERE task_id = @task_id`
      )
      .run({ task_id: taskId, ...patch });
  },
};

// ===========================================================================
// TASK DEPENDENCY REPOSITORY
// ===========================================================================

export const DependencyRepo = {
  findByProject(projectId: string): TaskDependency[] {
    return getDb()
      .prepare<[string], TaskDependency>(
        'SELECT * FROM task_dependencies WHERE project_id = ?'
      )
      .all(projectId);
  },

  insert(dep: TaskDependency): void {
    getDb()
      .prepare(
        `INSERT INTO task_dependencies
           (dependency_id, project_id, from_task_id, to_task_id, lag_days)
         VALUES
           (@dependency_id, @project_id, @from_task_id, @to_task_id, @lag_days)`
      )
      .run(dep);
  },
};

// ===========================================================================
// SUPPLIER QUOTE REPOSITORY
// ===========================================================================

export const QuoteRepo = {
  findById(quoteId: string): SupplierQuote | undefined {
    return getDb()
      .prepare<[string], SupplierQuote>(
        'SELECT * FROM supplier_quotes WHERE quote_id = ?'
      )
      .get(quoteId);
  },

  findByTask(taskId: string): SupplierQuote[] {
    return getDb()
      .prepare<[string], SupplierQuote>(
        'SELECT * FROM supplier_quotes WHERE task_id = ? ORDER BY observed_at DESC'
      )
      .all(taskId);
  },

  findByProject(projectId: string): SupplierQuote[] {
    return getDb()
      .prepare<[string], SupplierQuote>(
        `SELECT sq.* FROM supplier_quotes sq
         JOIN tasks t ON t.task_id = sq.task_id
         WHERE t.project_id = ?
         ORDER BY sq.observed_at DESC`
      )
      .all(projectId);
  },

  insert(quote: SupplierQuote): void {
    getDb()
      .prepare(
        `INSERT INTO supplier_quotes (
          quote_id, task_id, source_type, external_product_id, product_title,
          merchant_name, product_url, image_url, currency, unit_price_minor,
          quantity, shipping_minor, tax_minor, total_minor,
          variance_vs_historical_pct, savings_vs_incumbent_minor,
          availability_status, observed_at
        ) VALUES (
          @quote_id, @task_id, @source_type, @external_product_id, @product_title,
          @merchant_name, @product_url, @image_url, @currency, @unit_price_minor,
          @quantity, @shipping_minor, @tax_minor, @total_minor,
          @variance_vs_historical_pct, @savings_vs_incumbent_minor,
          @availability_status, @observed_at
        )`
      )
      .run(quote);
  },
};

// ===========================================================================
// RECOVERY PLAN REPOSITORY
// ===========================================================================

export const RecoveryPlanRepo = {
  findById(planId: string): CascadeRecoveryPlan | undefined {
    return getDb()
      .prepare<[string], CascadeRecoveryPlan>(
        'SELECT * FROM recovery_plans WHERE plan_id = ?'
      )
      .get(planId);
  },

  findActiveByProject(projectId: string): CascadeRecoveryPlan | null {
    return (
      getDb()
        .prepare<[string], CascadeRecoveryPlan>(
          `SELECT * FROM recovery_plans
           WHERE project_id = ? AND status IN ('PROPOSED', 'APPROVED')
           ORDER BY created_at DESC
           LIMIT 1`
        )
        .get(projectId) ?? null
    );
  },

  insert(plan: CascadeRecoveryPlan): void {
    getDb()
      .prepare(
        `INSERT INTO recovery_plans (
          plan_id, project_id, blocked_task_id, promoted_task_id, selected_quote_id,
          state_fingerprint, policy_decision, reason_codes_json,
          idle_crew_hours, idle_labor_cost_minor, sla_penalty_minor, total_exposure_minor,
          new_promoted_start_date, new_blocked_start_date,
          immediate_unlock_minor, deferred_labor_minor,
          nudge_draft_text, status, created_at
        ) VALUES (
          @plan_id, @project_id, @blocked_task_id, @promoted_task_id, @selected_quote_id,
          @state_fingerprint, @policy_decision, @reason_codes_json,
          @idle_crew_hours, @idle_labor_cost_minor, @sla_penalty_minor, @total_exposure_minor,
          @new_promoted_start_date, @new_blocked_start_date,
          @immediate_unlock_minor, @deferred_labor_minor,
          @nudge_draft_text, @status, @created_at
        )`
      )
      .run(plan);
  },

  updateStatus(
    planId: string,
    status: CascadeRecoveryPlan['status']
  ): void {
    getDb()
      .prepare('UPDATE recovery_plans SET status = ? WHERE plan_id = ?')
      .run(status, planId);
  },
};

// ===========================================================================
// USER APPROVAL REPOSITORY
// ===========================================================================

export const ApprovalRepo = {
  findByPlan(planId: string): UserApproval | undefined {
    return getDb()
      .prepare<[string], UserApproval>(
        'SELECT * FROM user_approvals WHERE plan_id = ? LIMIT 1'
      )
      .get(planId);
  },

  insert(approval: UserApproval): void {
    getDb()
      .prepare(
        `INSERT INTO user_approvals
           (approval_id, plan_id, approved_fingerprint, approver_actor, approved_at)
         VALUES
           (@approval_id, @plan_id, @approved_fingerprint, @approver_actor, @approved_at)`
      )
      .run(approval);
  },
};

// ===========================================================================
// PAYPAL TRANSACTION REPOSITORY
// ===========================================================================

export const TransactionRepo = {
  findByProject(projectId: string): PayPalTransactionRecord[] {
    return getDb()
      .prepare<[string], PayPalTransactionRecord>(
        'SELECT * FROM paypal_transactions WHERE project_id = ? ORDER BY created_at DESC'
      )
      .all(projectId);
  },

  insert(record: PayPalTransactionRecord): void {
    getDb()
      .prepare(
        `INSERT INTO paypal_transactions (
          transaction_record_id, project_id, task_id, plan_id, kind,
          paypal_resource_id, paypal_capture_id, status, currency,
          amount_minor, raw_response_json, created_at
        ) VALUES (
          @transaction_record_id, @project_id, @task_id, @plan_id, @kind,
          @paypal_resource_id, @paypal_capture_id, @status, @currency,
          @amount_minor, @raw_response_json, @created_at
        )`
      )
      .run(record);
  },
};

// ===========================================================================
// AUDIT EVENT REPOSITORY (Append-Only — SEC-007)
// ===========================================================================

export const AuditRepo = {
  findByProject(projectId: string): AuditEvent[] {
    return getDb()
      .prepare<[string], AuditEvent>(
        'SELECT * FROM audit_events WHERE project_id = ? ORDER BY created_at DESC'
      )
      .all(projectId);
  },

  /**
   * Appends an audit event.
   * The BEFORE UPDATE / BEFORE DELETE SQLite triggers guarantee this record
   * is immutable once written (SEC-007, PAT-001).
   */
  append(event: Omit<AuditEvent, 'event_id' | 'created_at'>): AuditEvent {
    const row: AuditEvent = {
      ...event,
      event_id: randomUUID(),
      created_at: now(),
    };
    getDb()
      .prepare(
        `INSERT INTO audit_events (
          event_id, project_id, task_id, plan_id, event_type, decision,
          reason_codes_json, state_fingerprint, paypal_reference_id,
          channel3_reference_id, summary, payload_json, created_at
        ) VALUES (
          @event_id, @project_id, @task_id, @plan_id, @event_type, @decision,
          @reason_codes_json, @state_fingerprint, @paypal_reference_id,
          @channel3_reference_id, @summary, @payload_json, @created_at
        )`
      )
      .run(row);
    return row;
  },
};

// ===========================================================================
// TRANSACTIONAL HELPER (PAT-001)
// ===========================================================================

/**
 * Wraps a function in a better-sqlite3 transaction.
 * Use this for every state mutation that also produces an audit event so
 * SQLite state and audit log are always consistent (PAT-001).
 *
 * @example
 * withTransaction(() => {
 *   TaskRepo.updateSchedule(taskId, patch);
 *   AuditRepo.append(event);
 * });
 */
export function withTransaction<T>(fn: () => T): T {
  return getDb().transaction(fn)();
}

/** Exported for use in tests and scripts */
export { randomUUID };
