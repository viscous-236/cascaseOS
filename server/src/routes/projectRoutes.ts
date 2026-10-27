/**
 * @file projectRoutes.ts
 * @description Multi-Tenant Project Onboarding, Task CRUD & Financial Provisioning Endpoints (TASK-106, REQ-101, REQ-105, REQ-106).
 *
 * Implements:
 * - GET  /api/health            — Live connectivity check (PayPal, Channel3, SQLite, LLM)
 * - GET  /api/projects          — Returns all projects with summary KPIs (REQ-101)
 * - POST /api/projects/bootstrap — Canonical project seeder with live Sandbox IDs
 * - POST /api/projects/create-custom — Multi-tenant onboarding (AI Architect or Manual, REQ-102)
 * - GET  /api/projects/:projectId/state — Full state synchronization endpoint (ARC-005)
 * - POST /api/projects/:projectId/tasks — Add new task phase to Bryntum Gantt (REQ-105)
 * - PATCH /api/projects/:projectId/tasks/:taskId — Interactive task schedule updates & blast radius re-eval (REQ-105)
 * - POST /api/projects/:projectId/dependencies — Add dependency with Kahn cycle check (SEC-101, REQ-105)
 * - DELETE /api/projects/:projectId/dependencies/:dependencyId — Remove dependency (REQ-105)
 * - POST /api/projects/:projectId/tasks/:taskId/provision-financials — Provision PayPal/Channel3 on demand (REQ-106)
 */

import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import {
  getDb,
  ProjectRepo,
  TaskRepo,
  DependencyRepo,
  QuoteRepo,
  withTransaction,
} from '../db/database.js';
import { env } from '../config/env.js';
import { getPayPalAccessToken } from '../services/paypalAuthService.js';
import { searchChannel3Products, searchAndAuditSupplierProducts } from '../services/channel3Service.js';
import { bootstrapApexClinicProject } from '../services/projectBootstrapService.js';
import {
  provisionCustomProject,
  provisionTaskFinancials,
} from '../services/customProjectProvisioner.js';
import { validateAcyclicGraph } from '../engine/dagValidator.js';
import { analyzeProjectBlastRadius } from '../engine/criticalPathEngine.js';
import { addDays } from '../engine/scheduleRerouter.js';
import {
  bootstrapProjectSchema,
  getProjectStateSchema,
} from '../schemas/apiSchemas.js';
import {
  CreateCustomProjectSchema,
  UpsertTaskSchema,
  CreateDependencySchema,
} from '../schemas/onboardingSchemas.js';
import {
  createDraftInvoice,
  sendInvoice,
  getInvoice,
  generateInvoiceQrCode,
} from '../services/paypalInvoicingService.js';
import { computeStateFingerprint } from '../utils/moneyAndHash.js';
import type {
  TaskDependency,
  SupplierQuote,
  CascadeRecoveryPlan,
  PayPalTransactionRecord,
  AuditEvent,
  CascadeTask,
} from '../types/domain.js';

const router = Router();

// ---------------------------------------------------------------------------
// 1. GET /api/health (Live connectivity check)
// ---------------------------------------------------------------------------

router.get('/health', async (_req: Request, res: Response): Promise<void> => {
  const timestamp = new Date().toISOString();
  let dbStatus = 'disconnected';
  let paypalStatus = 'disconnected';
  let channel3Status = 'disconnected';
  let llmStatus = 'ready';

  // 1. Database Check
  try {
    const db = getDb();
    const row = db.prepare('SELECT 1 as alive').get() as { alive: number } | undefined;
    if (row?.alive === 1) dbStatus = 'connected';
  } catch (err) {
    dbStatus = `error: ${String(err)}`;
  }

  // 2. PayPal Sandbox Connectivity Check
  try {
    const token = await getPayPalAccessToken();
    if (token) paypalStatus = 'connected';
  } catch (err) {
    paypalStatus = `error: ${String(err)}`;
  }

  // 3. Channel3 API Connectivity Check
  try {
    const res = await searchChannel3Products('display', 1);
    if (Array.isArray(res.products)) channel3Status = 'connected';
  } catch (err) {
    channel3Status = `error: ${String(err)}`;
  }

  const isHealthy =
    dbStatus === 'connected' &&
    paypalStatus === 'connected' &&
    channel3Status === 'connected';

  res.status(isHealthy ? 200 : 207).json({
    status: isHealthy ? 'healthy' : 'degraded',
    timestamp,
    environment: env.NODE_ENV,
    database: dbStatus,
    paypalSandbox: paypalStatus,
    channel3: channel3Status,
    llm: llmStatus,
    llmProvider: env.IS_GROQ ? 'groq' : 'openai',
    llmModel: env.OPENAI_MODEL,
  });
});

// ---------------------------------------------------------------------------
// 2. GET /api/projects (List all projects with summary KPIs, REQ-101)
// ---------------------------------------------------------------------------

router.get('/projects', async (_req: Request, res: Response): Promise<void> => {
  try {
    let projectsWithSummary = ProjectRepo.findAllWithSummary();
    if (projectsWithSummary.length === 0) {
      await bootstrapApexClinicProject({ skipPayPal: true, skipChannel3: true });
      projectsWithSummary = ProjectRepo.findAllWithSummary();
    }
    res.status(200).json({
      success: true,
      projects: projectsWithSummary,
    });
  } catch (err) {
    console.error('[ProjectRoutes] GET /projects error:', err);
    res.status(500).json({ error: String(err) });
  }
});

// ---------------------------------------------------------------------------
// 3. POST /api/projects/bootstrap (Canonical project seeder)
// ---------------------------------------------------------------------------

router.post('/projects/bootstrap', async (req: Request, res: Response): Promise<void> => {
  const validation = bootstrapProjectSchema.safeParse({ body: req.body });
  if (!validation.success) {
    res.status(400).json({ error: validation.error.format() });
    return;
  }

  try {
    const result = await bootstrapApexClinicProject(validation.data.body);
    res.status(200).json({
      success: true,
      message: 'Apex Diagnostic Clinic & Studio Buildout project ready',
      data: result,
    });
  } catch (err) {
    console.error('[ProjectRoutes] Bootstrap failed:', err);
    res.status(500).json({ error: `Failed to bootstrap project: ${String(err)}` });
  }
});

// ---------------------------------------------------------------------------
// 3b. POST /api/projects/reset (Wipes all database tables & re-seeds factory state)
// ---------------------------------------------------------------------------

router.post('/projects/reset', async (_req: Request, res: Response): Promise<void> => {
  try {
    const db = getDb();
    db.pragma('foreign_keys = OFF');
    db.exec(`
      DELETE FROM user_approvals;
      DELETE FROM paypal_transactions;
      DELETE FROM recovery_plans;
      DELETE FROM supplier_quotes;
      DELETE FROM task_dependencies;
      DELETE FROM tasks;
      DELETE FROM projects;
    `);
    db.pragma('foreign_keys = ON');

    const result = await bootstrapApexClinicProject({ forceReset: true, skipPayPal: true, skipChannel3: true });
    res.status(200).json({
      success: true,
      message: 'All projects and tables reset cleanly to factory defaults',
      project: result.project,
    });
  } catch (err) {
    console.error('[ProjectRoutes] Reset failed:', err);
    res.status(500).json({ error: `Failed to reset database: ${String(err)}` });
  }
});

// ---------------------------------------------------------------------------
// 4. POST /api/projects/create-custom (Multi-Tenant Custom Project Provisioning, REQ-102)
// ---------------------------------------------------------------------------

router.post('/projects/create-custom', async (req: Request, res: Response): Promise<void> => {
  const validation = CreateCustomProjectSchema.safeParse(req.body);
  if (!validation.success) {
    res.status(400).json({ error: validation.error.format() });
    return;
  }

  try {
    const result = await provisionCustomProject(validation.data);
    res.status(201).json({
      success: true,
      message: `Project "${result.name}" successfully provisioned`,
      ...result,
    });
  } catch (err: any) {
    console.error('[ProjectRoutes] create-custom error:', err);
    if (err.message && err.message.includes('DAG_CYCLE_DETECTED')) {
      res.status(400).json({
        error: 'DAG_CYCLE_DETECTED',
        reason: 'DAG_CYCLE_DETECTED',
        message: err.message,
      });
      return;
    }
    res.status(500).json({ error: String(err) });
  }
});

// ---------------------------------------------------------------------------
// 5. GET /api/projects/:projectId/state (Full UI State Synchronization)
// ---------------------------------------------------------------------------

router.get('/projects/:projectId/state', (req: Request, res: Response): void => {
  const validation = getProjectStateSchema.safeParse({ params: req.params });
  if (!validation.success) {
    res.status(400).json({ error: validation.error.format() });
    return;
  }

  const { projectId } = validation.data.params;
  const project = ProjectRepo.findById(projectId);

  if (!project) {
    res.status(404).json({ error: `Project '${projectId}' not found` });
    return;
  }

  const db = getDb();
  const tasks = TaskRepo.findByProject(projectId);
  const dependencies = db
    .prepare<[string], TaskDependency>(
      'SELECT * FROM task_dependencies WHERE project_id = ? ORDER BY dependency_id ASC'
    )
    .all(projectId);

  const supplierQuotes = db
    .prepare<[string], SupplierQuote>(
      `SELECT * FROM supplier_quotes
       WHERE task_id IN (SELECT task_id FROM tasks WHERE project_id = ?)
       ORDER BY observed_at DESC`
    )
    .all(projectId);

  const activeRecoveryPlan = db
    .prepare<[string], CascadeRecoveryPlan>(
      `SELECT * FROM recovery_plans
       WHERE project_id = ? AND status IN ('PROPOSED', 'APPROVED')
       ORDER BY created_at DESC LIMIT 1`
    )
    .get(projectId);

  const paypalTransactions = db
    .prepare<[string], PayPalTransactionRecord>(
      `SELECT * FROM paypal_transactions
       WHERE project_id = ?
       ORDER BY created_at DESC`
    )
    .all(projectId);

  const auditEvents = db
    .prepare<[string], AuditEvent>(
      `SELECT * FROM audit_events
       WHERE project_id = ?
       ORDER BY created_at DESC`
    )
    .all(projectId);

  res.status(200).json({
    project,
    tasks,
    dependencies,
    supplierQuotes,
    activeRecoveryPlan: activeRecoveryPlan ?? null,
    paypalTransactions,
    auditEvents,
  });
});

// ---------------------------------------------------------------------------
// 6. POST /api/projects/:projectId/tasks (Create Task Phase, REQ-105)
// ---------------------------------------------------------------------------

router.post('/projects/:projectId/tasks', async (req: Request, res: Response): Promise<void> => {
  const projectId = String(req.params.projectId);
  const project = ProjectRepo.findById(projectId);
  if (!project) {
    res.status(404).json({ error: `Project '${projectId}' not found` });
    return;
  }

  const validation = UpsertTaskSchema.safeParse(req.body);
  if (!validation.success) {
    res.status(400).json({ error: validation.error.format() });
    return;
  }

  const data = validation.data;
  const taskId = data.task_id || `task_${Date.now()}_${randomUUID().slice(0, 4)}`;
  if (TaskRepo.findById(taskId)) {
    res.status(409).json({ error: `Task '${taskId}' already exists` });
    return;
  }
  const duration = data.duration_days || 2;
  const startDate = data.start_date || new Date().toISOString().slice(0, 10);
  const endDate = data.end_date || addDays(startDate, duration - 1);

  const newTask: CascadeTask = {
    task_id: taskId,
    project_id: projectId,
    version: 1,
    name: data.name || 'New Project Phase',
    start_date: startDate,
    end_date: endDate,
    duration_days: duration,
    materials_in_warehouse: data.materials_in_warehouse ? 1 : 0,
    crew_assigned: data.crew_assigned || 'Project Operations Crew',
    daily_idle_burn_minor: data.daily_idle_burn_minor ?? 60000,
    sla_delay_penalty_minor: data.sla_delay_penalty_minor ?? 0,
    phase_hardware_budget_max_minor: data.phase_hardware_budget_max_minor ?? 150000,
    schedule_status: data.schedule_status || 'SCHEDULED',
    paypal_invoice_id: null,
    paypal_invoice_number: null,
    paypal_invoice_view_url: null,
    paypal_invoice_status: data.paypal_invoice_status || 'DRAFT',
    invoice_total_minor: data.invoice_total_minor ?? 250000,
    materials_unlock_minor: data.materials_unlock_minor ?? Math.floor((data.invoice_total_minor ?? 250000) * 0.4),
    deferred_labor_minor: data.deferred_labor_minor ?? Math.floor((data.invoice_total_minor ?? 250000) * 0.6),
    client_name: TaskRepo.findByProject(projectId)[0]?.client_name || 'Client Billing Contact',
    client_email: TaskRepo.findByProject(projectId)[0]?.client_email || env.PAYPAL_SANDBOX_BUYER_EMAIL,
    qr_code_base64: null,
    last_nudge_message: null,
    last_nudge_sent_at: null,
    sku_search_query: data.sku_search_query || null,
    required_quantity: data.required_quantity ?? 0,
    incumbent_vendor_name: data.incumbent_vendor_name || null,
    incumbent_unit_price_minor: data.incumbent_unit_price_minor ?? null,
    historical_unit_price_minor: data.historical_unit_price_minor ?? null,
    max_allowed_variance_pct: data.max_allowed_variance_pct ?? 10.0,
  };

  withTransaction(() => {
    TaskRepo.insert(newTask);
    getDb()
      .prepare(
        `INSERT INTO audit_events (
          event_id, project_id, task_id, event_type, decision, reason_codes_json,
          state_fingerprint, summary, payload_json, created_at
        ) VALUES (?, ?, ?, 'TASK_CREATED', 'ALLOW', '[]', ?, ?, ?, ?)`
      )
      .run(
        randomUUID(),
        projectId,
        taskId,
        `sha256_${Date.now()}`,
        `Task "${newTask.name}" added to project.`,
        JSON.stringify({ taskId, name: newTask.name }),
        new Date().toISOString()
      );
  });

  // Provision PayPal & Channel3 if requested
  if (data.create_live_paypal_invoice && newTask.invoice_total_minor > 0) {
    const requestId = computeStateFingerprint({
      projectId,
      blockedTaskId: taskId,
      promotedTaskId: taskId,
      invoiceId: `${projectId}:${taskId}`,
      unlockAmountMinor: newTask.materials_unlock_minor,
      channel3ProductId: newTask.sku_search_query || taskId,
      supplierTotalMinor: newTask.invoice_total_minor,
      currency: project.currency,
    }).replace(':', '-');
    const inv = await createDraftInvoice({
        requestId,
        invoicerBusinessName: 'CascadeOS Commercial Fitouts',
        invoicerEmail: env.PAYPAL_SANDBOX_MERCHANT_EMAIL,
        recipientEmail: newTask.client_email,
        memo: `${newTask.name} Milestone Invoice`,
        currency: project.currency,
        dueDate: newTask.end_date,
        items: [
          {
            name: newTask.name,
            quantity: 1,
            unitPriceMinor: newTask.invoice_total_minor,
          },
        ],
    });
    await sendInvoice(inv.id);
    const sentInvoice = await getInvoice(inv.id);
    const recipientViewUrl = sentInvoice.detail.metadata?.recipient_view_url ?? null;
    if (!recipientViewUrl) {
      res.status(502).json({ error: `PayPal invoice ${inv.id} missing recipient_view_url` });
      return;
    }
    let qrBase64: string | null = null;
    try {
      qrBase64 = (await generateInvoiceQrCode(inv.id)).qr_code_base64;
    } catch (err) {
      console.warn(`[ProjectRoutes] QR generation unavailable for ${taskId}: ${String(err)}`);
    }

    TaskRepo.updateInvoice(taskId, {
        paypal_invoice_id: inv.id,
        paypal_invoice_number: sentInvoice.detail.invoice_number || `INV-${taskId}`,
        paypal_invoice_view_url: recipientViewUrl,
        paypal_invoice_status: 'SENT',
        qr_code_base64: qrBase64,
      });
  }

  if (data.run_live_channel3_audit && newTask.sku_search_query && newTask.required_quantity > 0) {
    await searchAndAuditSupplierProducts(newTask, { forceRefresh: true });
  }

  const finalTask = TaskRepo.findById(taskId);
  res.status(201).json({ success: true, task: finalTask });
});

// ---------------------------------------------------------------------------
// 7. PATCH /api/projects/:projectId/tasks/:taskId (Update Task & Recalculate Blast Radius, REQ-105)
// ---------------------------------------------------------------------------

router.patch('/projects/:projectId/tasks/:taskId', (req: Request, res: Response): void => {
  const projectId = String(req.params.projectId);
  const taskId = String(req.params.taskId);
  const project = ProjectRepo.findById(projectId);
  if (!project) {
    res.status(404).json({ error: `Project '${projectId}' not found` });
    return;
  }

  const task = TaskRepo.findById(taskId);
  if (!task || task.project_id !== projectId) {
    res.status(404).json({ error: `Task '${taskId}' not found in project '${projectId}'` });
    return;
  }

  const validation = UpsertTaskSchema.safeParse(req.body);
  if (!validation.success) {
    res.status(400).json({ error: validation.error.format() });
    return;
  }

  const data = validation.data;
  const patch: Partial<CascadeTask> = {};

  if (data.name !== undefined) patch.name = data.name;
  if (data.duration_days !== undefined) {
    patch.duration_days = data.duration_days;
    const start = data.start_date || task.start_date;
    patch.end_date = addDays(start, data.duration_days - 1);
  }
  if (data.start_date !== undefined) patch.start_date = data.start_date;
  if (data.end_date !== undefined) patch.end_date = data.end_date;
  if (data.materials_in_warehouse !== undefined) patch.materials_in_warehouse = data.materials_in_warehouse ? 1 : 0;
  if (data.crew_assigned !== undefined) patch.crew_assigned = data.crew_assigned;
  if (data.daily_idle_burn_minor !== undefined) patch.daily_idle_burn_minor = data.daily_idle_burn_minor;
  if (data.sla_delay_penalty_minor !== undefined) patch.sla_delay_penalty_minor = data.sla_delay_penalty_minor;
  if (data.phase_hardware_budget_max_minor !== undefined) patch.phase_hardware_budget_max_minor = data.phase_hardware_budget_max_minor;
  if (data.schedule_status !== undefined) patch.schedule_status = data.schedule_status;
  if (data.paypal_invoice_status !== undefined) patch.paypal_invoice_status = data.paypal_invoice_status;
  if (data.invoice_total_minor !== undefined) patch.invoice_total_minor = data.invoice_total_minor;
  if (data.materials_unlock_minor !== undefined) patch.materials_unlock_minor = data.materials_unlock_minor;
  if (data.deferred_labor_minor !== undefined) patch.deferred_labor_minor = data.deferred_labor_minor;
  if (data.sku_search_query !== undefined) patch.sku_search_query = data.sku_search_query;
  if (data.required_quantity !== undefined) patch.required_quantity = data.required_quantity;
  if (data.incumbent_vendor_name !== undefined) patch.incumbent_vendor_name = data.incumbent_vendor_name;
  if (data.incumbent_unit_price_minor !== undefined) patch.incumbent_unit_price_minor = data.incumbent_unit_price_minor;
  if (data.historical_unit_price_minor !== undefined) patch.historical_unit_price_minor = data.historical_unit_price_minor;
  if (data.max_allowed_variance_pct !== undefined) patch.max_allowed_variance_pct = data.max_allowed_variance_pct;

  let updatedTask: CascadeTask;
  withTransaction(() => {
    updatedTask = TaskRepo.update(taskId, patch);
    getDb()
      .prepare(
        `INSERT INTO audit_events (
          event_id, project_id, task_id, event_type, decision, reason_codes_json,
          state_fingerprint, summary, payload_json, created_at
        ) VALUES (?, ?, ?, 'TASK_UPDATED', 'ALLOW', '[]', ?, ?, ?, ?)`
      )
      .run(
        randomUUID(),
        projectId,
        taskId,
        `sha256_${Date.now()}`,
        `Task "${updatedTask.name}" updated (version ${updatedTask.version}).`,
        JSON.stringify(patch),
        new Date().toISOString()
      );
  });

  const allTasks = TaskRepo.findByProject(projectId);
  const dependencies = DependencyRepo.findByProject(projectId);
  const blastRadius = analyzeProjectBlastRadius(allTasks, dependencies);

  res.status(200).json({
    success: true,
    task: updatedTask!,
    blastRadius,
  });
});

// ---------------------------------------------------------------------------
// 8. POST /api/projects/:projectId/dependencies (Add Dependency with Kahn Cycle Gate, SEC-101, REQ-105)
// ---------------------------------------------------------------------------

router.post('/projects/:projectId/dependencies', (req: Request, res: Response): void => {
  const projectId = String(req.params.projectId);
  const project = ProjectRepo.findById(projectId);
  if (!project) {
    res.status(404).json({ error: `Project '${projectId}' not found` });
    return;
  }

  const validation = CreateDependencySchema.safeParse(req.body);
  if (!validation.success) {
    res.status(400).json({ error: validation.error.format() });
    return;
  }

  const { from_task_id, to_task_id, lag_days } = validation.data;
  const tasks = TaskRepo.findByProject(projectId);
  const taskIds = tasks.map((t) => t.task_id);

  if (!taskIds.includes(from_task_id) || !taskIds.includes(to_task_id)) {
    res.status(400).json({ error: 'Both from_task_id and to_task_id must belong to project' });
    return;
  }

  const currentDeps = DependencyRepo.findByProject(projectId);
  const proposedDeps = [
    ...currentDeps.map((d) => ({ from_task_id: d.from_task_id, to_task_id: d.to_task_id })),
    { from_task_id, to_task_id },
  ];

  // Kahn's algorithm cycle detection (SEC-101)
  const cycleCheck = validateAcyclicGraph(taskIds, proposedDeps);
  if (!cycleCheck.valid) {
    res.status(400).json({
      error: 'DAG_CYCLE_DETECTED',
      reason: 'DAG_CYCLE_DETECTED',
      message: `Adding dependency ${from_task_id} -> ${to_task_id} creates a circular dependency.`,
      cycleNodes: cycleCheck.cycleNodes,
    });
    return;
  }

  const newDep: TaskDependency = {
    dependency_id: `dep_${projectId}_${Date.now()}_${randomUUID().slice(0, 4)}`,
    project_id: projectId,
    from_task_id,
    to_task_id,
    lag_days: lag_days || 0,
  };

  withTransaction(() => {
    DependencyRepo.insert(newDep);
    getDb()
      .prepare(
        `INSERT INTO audit_events (
          event_id, project_id, task_id, event_type, decision, reason_codes_json,
          state_fingerprint, summary, payload_json, created_at
        ) VALUES (?, ?, ?, 'DEPENDENCY_CREATED', 'ALLOW', '[]', ?, ?, ?, ?)`
      )
      .run(
        randomUUID(),
        projectId,
        to_task_id,
        `sha256_${Date.now()}`,
        `Finish-to-start dependency created: ${from_task_id} -> ${to_task_id}`,
        JSON.stringify({ from_task_id, to_task_id, lag_days }),
        new Date().toISOString()
      );
  });

  res.status(201).json({
    success: true,
    dependency: newDep,
    topologicalOrder: cycleCheck.topologicalOrder,
  });
});

// ---------------------------------------------------------------------------
// 9. DELETE /api/projects/:projectId/dependencies/:dependencyId (Remove Dependency, REQ-105)
// ---------------------------------------------------------------------------

router.delete('/projects/:projectId/dependencies/:dependencyId', (req: Request, res: Response): void => {
  const projectId = String(req.params.projectId);
  const dependencyId = String(req.params.dependencyId);
  try {
    const dependency = DependencyRepo.findByProject(projectId).find((item) => item.dependency_id === dependencyId);
    if (!dependency) {
      res.status(404).json({ error: `Dependency '${dependencyId}' not found in project '${projectId}'` });
      return;
    }
    withTransaction(() => {
      DependencyRepo.deleteById(dependencyId);
      getDb()
        .prepare(
          `INSERT INTO audit_events (
            event_id, project_id, task_id, event_type, decision, reason_codes_json,
            state_fingerprint, summary, payload_json, created_at
          ) VALUES (?, ?, ?, 'DEPENDENCY_DELETED', 'ALLOW', '[]', ?, ?, ?, ?)`
        )
        .run(
          randomUUID(),
          projectId,
          dependency.to_task_id,
          computeStateFingerprint({
            projectId,
            blockedTaskId: dependency.from_task_id,
            promotedTaskId: dependency.to_task_id,
            invoiceId: dependencyId,
            unlockAmountMinor: 0,
            channel3ProductId: dependencyId,
            supplierTotalMinor: 0,
            currency: ProjectRepo.findById(projectId)?.currency || 'USD',
          }),
          `Finish-to-start dependency removed: ${dependency.from_task_id} -> ${dependency.to_task_id}`,
          JSON.stringify({ dependencyId }),
          new Date().toISOString(),
        );
    });
    res.status(200).json({ success: true, deleted: dependencyId });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ---------------------------------------------------------------------------
// 10. POST /api/projects/:projectId/tasks/:taskId/provision-financials (REQ-106)
// ---------------------------------------------------------------------------

router.post(
  '/projects/:projectId/tasks/:taskId/provision-financials',
  async (req: Request, res: Response): Promise<void> => {
    const projectId = String(req.params.projectId);
    const taskId = String(req.params.taskId);
    try {
      const result = await provisionTaskFinancials(projectId, taskId);
      res.status(200).json({
        success: true,
        message: 'Live financials successfully provisioned',
        ...result,
      });
    } catch (err) {
      console.error('[ProjectRoutes] provision-financials error:', err);
      res.status(500).json({ error: String(err) });
    }
  }
);

export default router;
