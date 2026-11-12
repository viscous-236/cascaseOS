/**
 * @file finopsWorkflow.ts
 * @description Render Workflows distributed FinOps orchestration engine (Render Sponsor Track).
 *
 * Implements:
 * - Distributed background execution using Render Workflows SDK (@renderinc/sdk/workflows)
 * - Multi-step pipeline:
 *     1. Reconcile PayPal Invoices
 *     2. Audit Hardware Procurement via Channel3 Product Graph
 *     3. Evaluate Kahn DAG blast radius & delay exposure
 * - Automatic retries, fault tolerance, and execution metadata logging
 */

import { task, flow, type TaskContext, type FlowContext } from '@renderinc/sdk/workflows';
import { TaskRepo, DependencyRepo } from '../db/database.js';
import { searchAndAuditSupplierProducts } from '../services/channel3Service.js';
import { analyzeProjectBlastRadius } from '../engine/criticalPathEngine.js';
import { getInvoice } from '../services/paypalInvoicingService.js';

export interface WorkflowAuditResult {
  projectId: string;
  invoicesChecked: number;
  quotesAudited: number;
  totalExposureMinor: number;
  executedAt: string;
}

/**
 * Task 1: Reconcile PayPal Invoices
 * Checks active PayPal Sandbox invoices and flags payment blocks.
 */
export const reconcilePayPalInvoicesTask = task(
  {
    name: 'reconcilePayPalInvoices',
    plan: 'starter',
    timeoutSeconds: 120,
    retry: {
      maxRetries: 3,
      waitDurationMs: 1000,
      backoffScaling: 2,
    },
  },
  async (_ctx: TaskContext, projectId: string) => {
    const tasks = TaskRepo.findByProject(projectId);
    let checked = 0;

    for (const t of tasks) {
      if (t.paypal_invoice_id) {
        try {
          const inv = await getInvoice(t.paypal_invoice_id);
          checked++;
          if (inv.status && inv.status !== t.paypal_invoice_status) {
            TaskRepo.updateInvoice(t.task_id, {
              paypal_invoice_status: inv.status as any,
            });
          }
        } catch {
          // Keep resilient
        }
      }
    }

    return { projectId, checked };
  }
);

/**
 * Task 2: Audit Hardware Procurement via Channel3
 * Queries live Channel3 Product Graph across retail merchants and detects price creep.
 */
export const auditHardwareProcurementTask = task(
  {
    name: 'auditHardwareProcurement',
    plan: 'starter',
    timeoutSeconds: 180,
    retry: {
      maxRetries: 3,
      waitDurationMs: 1500,
      backoffScaling: 2,
    },
  },
  async (_ctx: TaskContext, projectId: string) => {
    const tasks = TaskRepo.findByProject(projectId);
    let quotesCount = 0;

    for (const t of tasks) {
      if (t.sku_search_query && t.required_quantity > 0) {
        try {
          const quotes = await searchAndAuditSupplierProducts(t, { forceRefresh: true });
          quotesCount += quotes.length;
        } catch {
          // Graceful fallback
        }
      }
    }

    return { projectId, quotesCount };
  }
);

/**
 * Task 3: Evaluate Downstream Delay Exposure
 * Runs Kahn DAG traversal to compute transitive idle labor burn & SLA penalties.
 */
export const evaluateDelayExposureTask = task(
  {
    name: 'evaluateDelayExposure',
    plan: 'starter',
    timeoutSeconds: 60,
  },
  async (_ctx: TaskContext, projectId: string) => {
    const tasks = TaskRepo.findByProject(projectId);
    const deps = DependencyRepo.findByProject(projectId);
    const blast = analyzeProjectBlastRadius(tasks, deps);
    return {
      projectId,
      idleCrewHours: blast.idle_crew_hours,
      idleLaborCostMinor: blast.idle_labor_cost_minor,
      slaPenaltyMinor: blast.sla_penalty_minor,
      totalExposureMinor: blast.total_exposure_minor,
      blockedTaskIds: blast.blocked_task_ids,
    };
  }
);

/**
 * Flow: End-to-End Cascade Delivery FinOps Workflow
 * Orchestrates multi-step distributed execution using the Render Workflows engine.
 */
export const cascadeDeliveryFinOpsFlow = flow(
  {
    name: 'cascadeDeliveryFinOpsFlow',
    plan: 'standard',
    timeoutSeconds: 300,
  },
  async (ctx: FlowContext, projectId: string): Promise<WorkflowAuditResult> => {
    // Step 1: Reconcile PayPal Invoices
    const invoiceResult = await ctx.step(
      'reconcile-invoices',
      async (pId: string) => {
        const tasks = TaskRepo.findByProject(pId);
        let checked = 0;
        for (const t of tasks) {
          if (t.paypal_invoice_id) {
            try {
              const inv = await getInvoice(t.paypal_invoice_id);
              checked++;
              if (inv.status && inv.status !== t.paypal_invoice_status) {
                TaskRepo.updateInvoice(t.task_id, {
                  paypal_invoice_status: inv.status as any,
                });
              }
            } catch {
              // Resilient
            }
          }
        }
        return { checked };
      },
      [projectId],
      { retry: { maxRetries: 3, waitDurationMs: 1000, backoffScaling: 2 } }
    );

    // Step 2: Audit Hardware Procurement via Channel3
    const quoteResult = await ctx.step(
      'audit-channel3-procurement',
      async (pId: string) => {
        const tasks = TaskRepo.findByProject(pId);
        let quotesCount = 0;
        for (const t of tasks) {
          if (t.sku_search_query && t.required_quantity > 0) {
            try {
              const quotes = await searchAndAuditSupplierProducts(t, { forceRefresh: true });
              quotesCount += quotes.length;
            } catch {
              // Resilient
            }
          }
        }
        return { quotesCount };
      },
      [projectId],
      { retry: { maxRetries: 2, waitDurationMs: 1000, backoffScaling: 2 } }
    );

    // Step 3: Compute Blast Radius & Total Exposure
    const exposureResult = await ctx.step(
      'evaluate-blast-radius',
      (pId: string) => {
        const tasks = TaskRepo.findByProject(pId);
        const deps = DependencyRepo.findByProject(pId);
        const blast = analyzeProjectBlastRadius(tasks, deps);
        return { totalExposureMinor: blast.total_exposure_minor };
      },
      [projectId]
    );

    return {
      projectId,
      invoicesChecked: invoiceResult.checked,
      quotesAudited: quoteResult.quotesCount,
      totalExposureMinor: exposureResult.totalExposureMinor,
      executedAt: new Date().toISOString(),
    };
  }
);
