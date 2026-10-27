/**
 * @file customProjectProvisioner.ts
 * @description Orchestrator for Multi-Tenant Custom Project Provisioning (TASK-105, REQ-102, REQ-103, REQ-104, CON-101).
 *
 * Implements:
 * - Dynamic project creation from AI Blueprint or manual structured phase inputs
 * - Fail-closed DAG cycle validation via Kahn's algorithm (SEC-101)
 * - Live PayPal Sandbox Invoicing v2 creation & dispatch (REQ-103, CON-101)
 * - Live Channel3 Product Graph search & price-creep audit (REQ-104, CON-101)
 * - Append-only audit trail logging (SEC-007)
 */

import { randomUUID } from 'node:crypto';
import { getDb, ProjectRepo, TaskRepo, DependencyRepo, withTransaction } from '../db/database.js';
import { env } from '../config/env.js';
import { validateAcyclicGraph } from '../engine/dagValidator.js';
import { addDays } from '../engine/scheduleRerouter.js';
import { generateProjectBlueprintFromPrompt } from './projectArchitectAiService.js';
import { createDraftInvoice, sendInvoice, getInvoice } from './paypalInvoicingService.js';
import { searchAndAuditSupplierProducts } from './channel3Service.js';
import { computeStateFingerprint } from '../utils/moneyAndHash.js';
import type {
  CreateCustomProjectInput,
  ManualTaskInputSchema,
} from '../schemas/onboardingSchemas.js';
import type { CascadeTask, TaskDependency, Project } from '../types/domain.js';

export interface ProvisionCustomProjectResult {
  project_id: string;
  name: string;
  project: Project;
  tasks: CascadeTask[];
  dependencies: TaskDependency[];
  stats: {
    tasks_count: number;
    dependencies_count: number;
    paypal_invoices_created: number;
    channel3_quotes_created: number;
    initial_exposure_minor: number;
  };
  provisioned_summary: {
    tasks_created: number;
    dependencies_created: number;
    live_paypal_invoices_created: Array<{
      task_id: string;
      paypal_invoice_id: string;
      status: string;
    }>;
    live_channel3_quotes_fetched: number;
  };
}

/**
 * Creates a brand-new multi-tenant project from scratch, validating the DAG,
 * saving to SQLite, and provisioning genuine PayPal Sandbox invoices and Channel3 quotes.
 */
export async function provisionCustomProject(
  input: CreateCustomProjectInput
): Promise<ProvisionCustomProjectResult> {
  const db = getDb();
  const projectId = `proj_custom_${Date.now()}_${randomUUID().slice(0, 4)}`;

  let rawTasks: Array<any> = [];
  let rawDependencies: Array<{ from_task_id: string; to_task_id: string; lag_days: number }> = [];
  let projectName = input.project_name;

  // 1. Resolve Phase & Dependency Blueprint
  if (input.mode === 'AI_ARCHITECT') {
    const aiBlueprint = await generateProjectBlueprintFromPrompt({
      prompt: input.ai_prompt!,
      clientName: input.client_name,
      clientEmail: input.client_email,
      startDate: input.start_date,
      currency: 'USD',
    });
    rawTasks = aiBlueprint.tasks;
    rawDependencies = aiBlueprint.dependencies;
    if (aiBlueprint.project_name && aiBlueprint.project_name.length >= 3) {
      projectName = aiBlueprint.project_name;
    }
  } else {
    rawTasks = (input.tasks || []).map((t, idx) => ({
      ...t,
      task_id: t.task_id || `phase_${idx + 1}_${t.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
    }));
    rawDependencies = (input.dependencies || []).map((d) => ({
      from_task_id: d.from_task_id,
      to_task_id: d.to_task_id,
      lag_days: d.lag_days ?? 0,
    }));
  }

  // 2. Validate DAG via Kahn's algorithm (SEC-101)
  const taskIds = rawTasks.map((t) => t.task_id);
  if (new Set(taskIds).size !== taskIds.length) {
    throw new Error('DAG_INVALID: Task IDs must be unique');
  }
  const taskIdSet = new Set(taskIds);
  if (rawDependencies.some((dep) => !taskIdSet.has(dep.from_task_id) || !taskIdSet.has(dep.to_task_id))) {
    throw new Error('DAG_INVALID: Every dependency must reference tasks in the project');
  }
  const dagValidation = validateAcyclicGraph(taskIds, rawDependencies);
  if (!dagValidation.valid) {
    throw new Error(
      `DAG_CYCLE_DETECTED: Dependency cycle detected in tasks: ${dagValidation.cycleNodes.join(', ')}`
    );
  }

  // 3. Compute deterministic calendar dates from topological order
  const taskEndDateMap = new Map<string, string>();
  const taskDateMap = new Map<string, { start_date: string; end_date: string }>();

  // Map dependencies for quick lookup: to_task_id -> [ { from_task_id, lag_days } ]
  const upstreamDepMap = new Map<string, Array<{ from_task_id: string; lag_days: number }>>();
  for (const dep of rawDependencies) {
    const list = upstreamDepMap.get(dep.to_task_id) ?? [];
    list.push(dep);
    upstreamDepMap.set(dep.to_task_id, list);
  }

  for (const taskId of dagValidation.topologicalOrder) {
    const taskSpec = rawTasks.find((t) => t.task_id === taskId)!;
    const upstreams = upstreamDepMap.get(taskId) ?? [];

    let startDate = input.start_date;

    if (upstreams.length > 0) {
      let latestPrerequisiteEnd = input.start_date;
      for (const u of upstreams) {
        const uEnd = taskEndDateMap.get(u.from_task_id);
        if (uEnd) {
          const readyDate = addDays(uEnd, 1 + (u.lag_days || 0));
          if (readyDate > latestPrerequisiteEnd) {
            latestPrerequisiteEnd = readyDate;
          }
        }
      }
      startDate = latestPrerequisiteEnd;
    }

    const durationDays = taskSpec.duration_days || 2;
    const endDate = addDays(startDate, durationDays - 1);

    taskEndDateMap.set(taskId, endDate);
    taskDateMap.set(taskId, { start_date: startDate, end_date: endDate });
  }

  // 4. Assemble canonical domain tasks
  const canonicalTasks: CascadeTask[] = rawTasks.map((t, idx) => {
    const dates = taskDateMap.get(t.task_id) || {
      start_date: input.start_date,
      end_date: addDays(input.start_date, (t.duration_days || 2) - 1),
    };

    return {
      task_id: t.task_id,
      project_id: projectId,
      version: 1,
      name: t.name,
      start_date: dates.start_date,
      end_date: dates.end_date,
      duration_days: t.duration_days || 2,
      materials_in_warehouse: t.materials_in_warehouse ? 1 : 0,
      crew_assigned: t.crew_assigned || 'Project Operations Crew',
      daily_idle_burn_minor: t.daily_idle_burn_minor ?? 60000,
      sla_delay_penalty_minor: t.sla_delay_penalty_minor ?? 0,
      phase_hardware_budget_max_minor: t.phase_hardware_budget_max_minor ?? 150000,
      schedule_status: idx === 0 ? 'SCHEDULED' : (t.schedule_status || 'SCHEDULED'),
      paypal_invoice_id: null,
      paypal_invoice_number: null,
      paypal_invoice_view_url: null,
      paypal_invoice_status: 'DRAFT',
      invoice_total_minor: t.invoice_total_minor ?? 250000,
      materials_unlock_minor: t.materials_unlock_minor ?? Math.floor((t.invoice_total_minor ?? 250000) * 0.4),
      deferred_labor_minor: t.deferred_labor_minor ?? Math.floor((t.invoice_total_minor ?? 250000) * 0.6),
      client_name: input.client_name,
      client_email: input.client_email,
      qr_code_base64: null,
      last_nudge_message: null,
      last_nudge_sent_at: null,
      sku_search_query: t.sku_search_query ?? null,
      required_quantity: t.required_quantity ?? 0,
      incumbent_vendor_name: t.incumbent_vendor_name ?? null,
      incumbent_unit_price_minor: t.incumbent_unit_price_minor ?? null,
      historical_unit_price_minor: t.historical_unit_price_minor ?? null,
      max_allowed_variance_pct: t.max_allowed_variance_pct ?? 10.0,
    };
  });

  const canonicalDeps: TaskDependency[] = rawDependencies.map((d, idx) => ({
    dependency_id: `dep_${projectId}_${idx + 1}`,
    project_id: projectId,
    from_task_id: d.from_task_id,
    to_task_id: d.to_task_id,
    lag_days: d.lag_days ?? 0,
  }));

  // 5. Persist Project, Tasks, and Dependencies to SQLite within Transaction
  withTransaction(() => {
    ProjectRepo.insert({
      project_id: projectId,
      name: projectName,
      currency: input.currency || 'USD',
    });

    for (const task of canonicalTasks) {
      TaskRepo.insert(task);
    }

    for (const dep of canonicalDeps) {
      DependencyRepo.insert(dep);
    }

    // Append-only audit record
    db.prepare(
      `INSERT INTO audit_events (
        event_id, project_id, task_id, event_type, decision, reason_codes_json,
        state_fingerprint, summary, payload_json, created_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )`
    ).run(
      randomUUID(),
      projectId,
      null,
      'ONBOARDING_PROJECT_PROVISIONED',
      'ALLOW',
      JSON.stringify([]),
      computeStateFingerprint({
        projectId,
        blockedTaskId: taskIds[0] ?? projectId,
        promotedTaskId: taskIds[1] ?? taskIds[0] ?? projectId,
        invoiceId: projectId,
        unlockAmountMinor: 0,
        channel3ProductId: projectId,
        supplierTotalMinor: 0,
        currency: input.currency || 'USD',
      }),
      `Custom project "${projectName}" provisioned with ${canonicalTasks.length} phases and ${canonicalDeps.length} dependencies.`,
      JSON.stringify({ tasks_count: canonicalTasks.length, dependencies_count: canonicalDeps.length }),
      new Date().toISOString()
    );
  });

  const liveInvoicesCreated: Array<{ task_id: string; paypal_invoice_id: string; status: string }> = [];
  let liveChannel3QuotesCount = 0;

  // 6. Provision Live PayPal Sandbox Invoices (REQ-103, CON-101)
  if (input.create_live_paypal_invoices !== false) {
    for (const task of canonicalTasks) {
      if (task.invoice_total_minor > 0) {
        const requestId = computeStateFingerprint({
          projectId,
          blockedTaskId: task.task_id,
          promotedTaskId: task.task_id,
          invoiceId: `${projectId}:${task.task_id}`,
          unlockAmountMinor: task.materials_unlock_minor,
          channel3ProductId: task.sku_search_query ?? task.task_id,
          supplierTotalMinor: task.invoice_total_minor,
          currency: input.currency || 'USD',
        }).replace(':', '-');
        const inv = await createDraftInvoice({
            requestId,
            invoicerBusinessName: 'CascadeOS Commercial Fitouts',
            invoicerEmail: env.PAYPAL_SANDBOX_MERCHANT_EMAIL,
            recipientEmail: input.client_email,
            memo: `${task.name} Milestone Invoice`,
            currency: input.currency || 'USD',
            dueDate: task.end_date,
            items: [
              {
                name: task.name,
                description: `Payment milestone for ${task.name}`,
                quantity: 1,
                unitPriceMinor: task.invoice_total_minor,
              },
            ],
        });
        await sendInvoice(inv.id);
        const sentInvoice = await getInvoice(inv.id);
        const recipientViewUrl = sentInvoice.detail.metadata?.recipient_view_url ?? null;
        if (!recipientViewUrl) throw new Error(`PayPal invoice ${inv.id} missing recipient_view_url`);

        TaskRepo.updateInvoice(task.task_id, {
          paypal_invoice_id: inv.id,
          paypal_invoice_number: sentInvoice.detail.invoice_number ?? null,
          paypal_invoice_view_url: recipientViewUrl,
          paypal_invoice_status: 'SENT',
        });

        liveInvoicesCreated.push({
          task_id: task.task_id,
          paypal_invoice_id: inv.id,
          status: sentInvoice.status || 'SENT',
        });
      }
    }
  }

  // 7. Provision Live Channel3 Quotes (REQ-104, CON-101)
  if (input.run_live_channel3_audit !== false) {
    for (const task of canonicalTasks) {
      if (task.sku_search_query && task.required_quantity > 0) {
        const quotes = await searchAndAuditSupplierProducts(task, { forceRefresh: true });
        liveChannel3QuotesCount += quotes.length;
      }
    }
  }

  const project = ProjectRepo.findById(projectId)!;
  const tasks = TaskRepo.findByProject(projectId);
  const dependencies = DependencyRepo.findByProject(projectId);
  const initialExposure = canonicalTasks.reduce(
    (acc, t) => acc + (t.duration_days * t.daily_idle_burn_minor + t.sla_delay_penalty_minor),
    0
  );

  return {
    project,
    tasks,
    dependencies,
    stats: {
      tasks_count: canonicalTasks.length,
      dependencies_count: canonicalDeps.length,
      paypal_invoices_created: liveInvoicesCreated.length,
      channel3_quotes_created: liveChannel3QuotesCount,
      initial_exposure_minor: initialExposure,
    },
    project_id: projectId,
    name: projectName,
    provisioned_summary: {
      tasks_created: canonicalTasks.length,
      dependencies_created: canonicalDeps.length,
      live_paypal_invoices_created: liveInvoicesCreated,
      live_channel3_quotes_fetched: liveChannel3QuotesCount,
    },
  };
}

/**
 * Provisions live financials (PayPal Sandbox invoice & Channel3 price-creep audit)
 * for a specific existing task on demand (REQ-106).
 */
export async function provisionTaskFinancials(
  projectId: string,
  taskId: string
): Promise<{
  task: CascadeTask;
  paypal_invoice_id: string | null;
  channel3_quotes_count: number;
}> {
  const task = TaskRepo.findById(taskId);
  if (!task || task.project_id !== projectId) {
    throw new Error(`Task ${taskId} not found in project ${projectId}`);
  }

  let paypalInvoiceId = task.paypal_invoice_id;
  let qrBase64 = task.qr_code_base64;

  // 1. Provision PayPal Sandbox invoice if missing
  if (!paypalInvoiceId && task.invoice_total_minor > 0) {
    const requestId = computeStateFingerprint({
        projectId,
        blockedTaskId: task.task_id,
        promotedTaskId: task.task_id,
        invoiceId: `${projectId}:${task.task_id}`,
        unlockAmountMinor: task.materials_unlock_minor,
        channel3ProductId: task.sku_search_query ?? task.task_id,
        supplierTotalMinor: task.invoice_total_minor,
        currency: 'USD',
    }).replace(':', '-');
    const inv = await createDraftInvoice({
        requestId,
        invoicerBusinessName: 'CascadeOS Commercial Fitouts',
        invoicerEmail: env.PAYPAL_SANDBOX_MERCHANT_EMAIL,
        recipientEmail: task.client_email,
        memo: `${task.name} Milestone Invoice`,
        currency: 'USD',
        dueDate: task.end_date,
        items: [
          {
            name: task.name,
            description: `Payment milestone for ${task.name}`,
            quantity: 1,
            unitPriceMinor: task.invoice_total_minor,
          },
        ],
    });

    await sendInvoice(inv.id);
    paypalInvoiceId = inv.id;
      const sentInvoice = await getInvoice(inv.id);
      const recipientViewUrl = sentInvoice.detail.metadata?.recipient_view_url ?? null;
      if (!recipientViewUrl) throw new Error(`PayPal invoice ${inv.id} missing recipient_view_url`);

    TaskRepo.updateInvoice(task.task_id, {
        paypal_invoice_id: inv.id,
        paypal_invoice_number: sentInvoice.detail.invoice_number ?? null,
        paypal_invoice_view_url: recipientViewUrl,
        paypal_invoice_status: 'SENT',
        qr_code_base64: qrBase64,
    });
  }

  // 2. Run Channel3 search & audit if sku_search_query present
  let quotesCount = 0;
  if (task.sku_search_query && task.required_quantity > 0) {
    const quotes = await searchAndAuditSupplierProducts(task, { forceRefresh: true });
    quotesCount = quotes.length;
  }

  const updatedTask = TaskRepo.findById(taskId)!;
  return {
    task: updatedTask,
    paypal_invoice_id: paypalInvoiceId,
    channel3_quotes_count: quotesCount,
  };
}
