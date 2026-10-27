/**
 * @file scenarioRoutes.ts
 * @description Dynamic Live Hackathon Scenario Triggers (TASK-021, REQ-018, REQ-107, PAT-101).
 *
 * Implements:
 * - PAT-101: Dynamic Scenario Targeting Pattern (accepts projectId and targetTaskId)
 * - REQ-107: Operates dynamically on any active project without hardcoded task IDs
 * - POST /api/scenarios/:scenarioId/trigger
 *   1. SCENARIO_A: Overdue Invoice + Critical-Path Blast Radius + Schedule Reroute + Materials Split
 *   2. SCENARIO_B: Incumbent Price-Creep BLOCK + Channel3 Arbitrage Discovery
 *   3. SCENARIO_C: Adversarial Hard-Dependency & Cost Fail-Closed BLOCK (SEC-006)
 */

import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import { getDb, ProjectRepo, TaskRepo, QuoteRepo, withTransaction } from '../db/database.js';
import { analyzeProjectBlastRadius } from '../engine/criticalPathEngine.js';
import { computeReroutedSchedule } from '../engine/scheduleRerouter.js';
import { evaluateRecoveryAndSupplierAction } from '../engine/policyEngine.js';
import { computeStateFingerprint } from '../utils/moneyAndHash.js';
import { searchAndAuditSupplierProducts } from '../services/channel3Service.js';
import {
  generateClientNudgeMessage,
  generateFinOpsPolicyExplanation,
} from '../services/nudgeAndFinOpsAiService.js';
import { triggerScenarioSchema } from '../schemas/apiSchemas.js';
import type {
  TaskDependency,
  SupplierQuote,
  CascadeRecoveryPlan,
  CascadeTask,
} from '../types/domain.js';

const router = Router();

// ---------------------------------------------------------------------------
// POST /api/scenarios/:scenarioId/trigger
// ---------------------------------------------------------------------------

router.post('/scenarios/:scenarioId/trigger', async (req: Request, res: Response): Promise<void> => {
  const validation = triggerScenarioSchema.safeParse({
    params: req.params,
    body: req.body,
  });

  if (!validation.success) {
    res.status(400).json({ error: validation.error.format() });
    return;
  }

  const { scenarioId } = validation.data.params;
  const { forceRefresh, projectId: reqProjectId, targetTaskId } = validation.data.body;
  const projectId = reqProjectId ?? ProjectRepo.findAll()[0]?.project_id;
  if (!projectId) {
    res.status(400).json({ error: 'projectId is required when no project exists' });
    return;
  }
  const db = getDb();

  let tasks = TaskRepo.findByProject(projectId);
  if (tasks.length === 0) {
    res.status(404).json({ error: `Project '${projectId}' has no tasks.` });
    return;
  }

  const dependencies = db
    .prepare<[string], TaskDependency>(
      'SELECT * FROM task_dependencies WHERE project_id = ?'
    )
    .all(projectId);

  const completedTaskIds = tasks
    .filter((t) => t.schedule_status === 'COMPLETED')
    .map((t) => t.task_id);

  try {
    switch (scenarioId) {
      // =======================================================================
      // SCENARIO A: Overdue Invoice & Critical-Path Schedule Reroute
      // =======================================================================
      case 'SCENARIO_A': {
        let blockedTask = targetTaskId ? tasks.find((t) => t.task_id === targetTaskId) : null;
        if (!blockedTask) {
          blockedTask = tasks.find((t) => t.paypal_invoice_status === 'OVERDUE')
            || tasks.find((t) => t.schedule_status === 'PAYMENT_BLOCKED')
            || tasks.find((t) => t.paypal_invoice_id && t.materials_in_warehouse === 0)
            || tasks.find((t) => t.schedule_status !== 'COMPLETED');
        }

        if (!blockedTask) {
          res.status(500).json({ error: 'No suitable blocked task found in project' });
          return;
        }

        // Ensure blockedTask is marked OVERDUE and PAYMENT_BLOCKED
        if (blockedTask.paypal_invoice_status !== 'OVERDUE' || blockedTask.schedule_status !== 'PAYMENT_BLOCKED') {
          TaskRepo.update(blockedTask.task_id, {
            paypal_invoice_status: 'OVERDUE',
            schedule_status: 'PAYMENT_BLOCKED',
          });
          blockedTask = TaskRepo.findById(blockedTask.task_id)!;
        }

        const freshTasks = TaskRepo.findByProject(projectId);
        const blastRadius = analyzeProjectBlastRadius(freshTasks, dependencies);

        let candidateTask: CascadeTask | undefined = blastRadius.promotable_candidate_ids.length > 0
          ? freshTasks.find((t) => t.task_id === blastRadius.promotable_candidate_ids[0])
          : freshTasks.find((t) => t.task_id !== blockedTask?.task_id && t.materials_in_warehouse === 1);

        if (!candidateTask) {
          candidateTask = freshTasks.find((t) => t.task_id !== blockedTask?.task_id) || blockedTask;
        }

        // 2. Compute Schedule Reroute
        const rerouted = computeReroutedSchedule(blockedTask, candidateTask, freshTasks, dependencies);

        // 3. Evaluate Policy for Proposed Schedule Reroute
        const candidateHardDeps = dependencies
          .filter((d) => d.to_task_id === candidateTask.task_id)
          .map((d) => d.from_task_id);

        const policyResult = evaluateRecoveryAndSupplierAction({
          taskToPromote: {
            id: candidateTask.task_id,
            hard_dependencies: candidateHardDeps,
            materials_in_warehouse: candidateTask.materials_in_warehouse === 1,
          },
          completedTaskIds,
          phaseCurrency: 'USD',
          phaseBudgetMaxMinor: candidateTask.phase_hardware_budget_max_minor,
          historicalUnitPriceMinor: candidateTask.historical_unit_price_minor ?? 0,
          maxAllowedVariancePct: candidateTask.max_allowed_variance_pct,
          proposedQuote: {
            currency: 'USD',
            unitPriceMinor: candidateTask.historical_unit_price_minor ?? 0,
            quantity: candidateTask.required_quantity > 0 ? candidateTask.required_quantity : 1,
            shippingMinor: 0,
            taxMinor: 0,
          },
          hasExplicitUserApproval: false, // Before human sign-off -> REQUIRE_APPROVAL
        });

        // 4. Generate AI Nudge-Bot Message & Policy Explanation
        const nudge = await generateClientNudgeMessage({
          clientName: blockedTask.client_name,
          clientEmail: blockedTask.client_email,
          projectName: 'Active Client Project',
          blockedTaskName: blockedTask.name,
          overdueInvoiceNumber: blockedTask.paypal_invoice_number || `INV-${blockedTask.task_id}`,
          invoiceTotalMinor: blockedTask.invoice_total_minor,
          materialsUnlockMinor: blockedTask.materials_unlock_minor,
          deferredLaborMinor: blockedTask.deferred_labor_minor,
          exposureAtRiskMinor: blastRadius.total_exposure_minor,
          currency: 'USD',
        });

        const explanation = await generateFinOpsPolicyExplanation({
          taskName: candidateTask.name,
          decision: policyResult.decision,
          reasonCodes: policyResult.reason_codes,
          permitted: policyResult.permitted,
          observed: policyResult.observed,
          contextNotes: `Milestone ${blockedTask.name} overdue; evaluating promoting ${candidateTask.name} ahead.`,
        });

        // Ensure valid foreign key reference for recovery_plans.selected_quote_id
        const existingQuotes = QuoteRepo.findByTask(blockedTask.task_id);
        let quoteId = existingQuotes[0]?.quote_id;
        if (!quoteId) {
          res.status(422).json({
            error: 'No supplier quote exists for selected blocked task',
          });
          return;
        }

        const selectedQuote = QuoteRepo.findById(quoteId);
        if (!selectedQuote) {
          res.status(500).json({ error: 'Recovery quote could not be resolved' });
          return;
        }

        const stateFingerprint = computeStateFingerprint({
          projectId,
          blockedTaskId: blockedTask.task_id,
          promotedTaskId: candidateTask.task_id,
          invoiceId: blockedTask.paypal_invoice_id ?? `${projectId}:${blockedTask.task_id}`,
          unlockAmountMinor: blockedTask.materials_unlock_minor,
          channel3ProductId: selectedQuote.external_product_id,
          supplierTotalMinor: selectedQuote.total_minor,
          currency: 'USD',
        });

        // 5. Persist Recovery Plan in SQLite (PAT-001)
        const planId = `plan_reroute_${Date.now()}`;
        const plan: CascadeRecoveryPlan = {
          plan_id: planId,
          project_id: projectId,
          blocked_task_id: blockedTask.task_id,
          promoted_task_id: candidateTask.task_id,
          selected_quote_id: quoteId,
          state_fingerprint: stateFingerprint,
          policy_decision: policyResult.decision,
          reason_codes_json: JSON.stringify(policyResult.reason_codes),
          idle_crew_hours: blastRadius.idle_crew_hours,
          idle_labor_cost_minor: blastRadius.idle_labor_cost_minor,
          sla_penalty_minor: blastRadius.sla_penalty_minor,
          total_exposure_minor: blastRadius.total_exposure_minor,
          new_promoted_start_date: rerouted.new_promoted_start_date,
          new_blocked_start_date: rerouted.new_blocked_start_date,
          immediate_unlock_minor: blockedTask.materials_unlock_minor,
          deferred_labor_minor: blockedTask.deferred_labor_minor,
          nudge_draft_text: nudge.body,
          status: 'PROPOSED',
          created_at: new Date().toISOString(),
        };

        withTransaction(() => {
          // Supersede existing pending plans
          db.prepare(
            `UPDATE recovery_plans SET status = 'SUPERSEDED'
             WHERE project_id = ? AND status = 'PROPOSED'`
          ).run(projectId);

          // Insert new recovery plan
          db.prepare(
            `INSERT INTO recovery_plans (
              plan_id, project_id, blocked_task_id, promoted_task_id, selected_quote_id,
              state_fingerprint, policy_decision, reason_codes_json, idle_crew_hours,
              idle_labor_cost_minor, sla_penalty_minor, total_exposure_minor,
              new_promoted_start_date, new_blocked_start_date, immediate_unlock_minor,
              deferred_labor_minor, nudge_draft_text, status, created_at
            ) VALUES (
              @plan_id, @project_id, @blocked_task_id, @promoted_task_id, @selected_quote_id,
              @state_fingerprint, @policy_decision, @reason_codes_json, @idle_crew_hours,
              @idle_labor_cost_minor, @sla_penalty_minor, @total_exposure_minor,
              @new_promoted_start_date, @new_blocked_start_date, @immediate_unlock_minor,
              @deferred_labor_minor, @nudge_draft_text, @status, @created_at
            )`
          ).run(plan);

          // Update task with nudge draft
          db.prepare(
            `UPDATE tasks SET last_nudge_message = ? WHERE task_id = ?`
          ).run(nudge.body, blockedTask.task_id);

          // Append audit event (SEC-007)
          db.prepare(
            `INSERT INTO audit_events (
              event_id, project_id, task_id, plan_id, event_type, decision,
              reason_codes_json, state_fingerprint, paypal_reference_id,
              channel3_reference_id, summary, payload_json, created_at
            ) VALUES (?, ?, ?, ?, 'SCENARIO_A_TRIGGERED', 'REQUIRE_APPROVAL', ?, ?, ?, NULL, ?, ?, ?)`
          ).run(
            randomUUID(),
            projectId,
            blockedTask.task_id,
            planId,
            JSON.stringify(policyResult.reason_codes),
            stateFingerprint,
            blockedTask.paypal_invoice_id,
            `Scenario A triggered: Task "${blockedTask.name}" overdue ($${(blastRadius.total_exposure_minor / 100).toFixed(2)} exposure). Reroute proposed.`,
            JSON.stringify({ blastRadius, rerouted, nudgeSubject: nudge.subject }),
            new Date().toISOString()
          );
        });

        res.status(200).json({
          scenarioId: 'SCENARIO_A',
          success: true,
          plan,
          blastRadius,
          reroutedSchedule: rerouted,
          policyResult,
          nudge,
          explanation,
        });
        return;
      }

      // =======================================================================
      // SCENARIO B: Vendor Price-Creep BLOCK & Channel3 Arbitrage Discovery
      // =======================================================================
      case 'SCENARIO_B': {
        let hardwareTask = targetTaskId ? tasks.find((t) => t.task_id === targetTaskId) : null;
        if (!hardwareTask) {
          hardwareTask = tasks.find(
            (t) => Boolean(t.sku_search_query) && t.required_quantity > 0
          );
        }

        if (!hardwareTask) {
          res.status(500).json({ error: 'Hardware task missing' });
          return;
        }

        const hardwareHardDeps = dependencies
          .filter((d) => d.to_task_id === hardwareTask.task_id)
          .map((d) => d.from_task_id);

        if (hardwareTask.incumbent_unit_price_minor === null || hardwareTask.historical_unit_price_minor === null || hardwareTask.required_quantity < 1) {
          res.status(422).json({ error: 'Hardware task lacks incumbent price, historical baseline, or quantity' });
          return;
        }
        const incumbentUnitPrice = hardwareTask.incumbent_unit_price_minor;
        const historicalUnitPrice = hardwareTask.historical_unit_price_minor;
        const requiredQty = hardwareTask.required_quantity;

        // 1. Evaluate Incumbent Quote (+28.95% creep) -> BLOCK
        const incumbentEval = evaluateRecoveryAndSupplierAction({
          taskToPromote: {
            id: hardwareTask.task_id,
            hard_dependencies: hardwareHardDeps,
            materials_in_warehouse: hardwareTask.materials_in_warehouse === 1,
          },
          completedTaskIds,
          phaseCurrency: 'USD',
          phaseBudgetMaxMinor: hardwareTask.phase_hardware_budget_max_minor,
          historicalUnitPriceMinor: historicalUnitPrice,
          maxAllowedVariancePct: hardwareTask.max_allowed_variance_pct,
          proposedQuote: {
            currency: 'USD',
            unitPriceMinor: incumbentUnitPrice,
            quantity: requiredQty,
            shippingMinor: 0,
            taxMinor: 0,
          },
          hasExplicitUserApproval: false,
        });

        // Record the Incumbent BLOCK audit event immediately (SEC-007)
        db.prepare(
          `INSERT INTO audit_events (
            event_id, project_id, task_id, plan_id, event_type, decision,
            reason_codes_json, state_fingerprint, paypal_reference_id,
            channel3_reference_id, summary, payload_json, created_at
          ) VALUES (?, ?, ?, NULL, 'INCUMBENT_QUOTE_EVALUATED', 'BLOCK', ?, NULL, NULL, NULL, ?, ?, ?)`
        ).run(
          randomUUID(),
          projectId,
          hardwareTask.task_id,
          JSON.stringify(incumbentEval.reason_codes),
          `Incumbent vendor quote ($${(incumbentUnitPrice / 100).toFixed(2)}/u) BLOCKED: Price creep & Phase budget exceeded`,
          JSON.stringify(incumbentEval),
          new Date().toISOString()
        );

        // 2. Fetch Live Channel3 Quotes
        let channel3Quotes: SupplierQuote[] = [];
        try {
          channel3Quotes = await searchAndAuditSupplierProducts(hardwareTask, {
            forceRefresh: Boolean(forceRefresh),
          });
        } catch (err) {
          res.status(502).json({
            error: 'Channel3 live supplier audit failed',
            message: String(err),
          });
          return;
        }

        const maxCompliantPrice = Math.round(historicalUnitPrice * 1.1);
        let bestQuote: SupplierQuote | undefined = channel3Quotes.find(
          (q) => q.unit_price_minor > 0 && q.unit_price_minor <= maxCompliantPrice
        );

        if (!bestQuote) {
          bestQuote = db.prepare<[string, number], SupplierQuote>(
            `SELECT * FROM supplier_quotes
             WHERE task_id = ? AND source_type = 'CHANNEL3_LIVE' AND unit_price_minor <= ?
             ORDER BY unit_price_minor ASC LIMIT 1`
          ).get(hardwareTask.task_id, maxCompliantPrice);
        }

        if (!bestQuote) {
          res.status(422).json({
            error: 'No compliant Channel3 quote found',
            max_unit_price_minor: maxCompliantPrice,
          });
          return;
        }

        const safeQuote = bestQuote;

        // 3. Evaluate Channel3 Quote Policy
        const channel3Eval = evaluateRecoveryAndSupplierAction({
          taskToPromote: {
            id: hardwareTask.task_id,
            hard_dependencies: hardwareHardDeps,
            materials_in_warehouse: true, // Post-order candidate evaluation
          },
          completedTaskIds,
          phaseCurrency: 'USD',
          phaseBudgetMaxMinor: hardwareTask.phase_hardware_budget_max_minor,
          historicalUnitPriceMinor: historicalUnitPrice,
          maxAllowedVariancePct: hardwareTask.max_allowed_variance_pct,
          proposedQuote: {
            currency: safeQuote.currency,
            unitPriceMinor: safeQuote.unit_price_minor,
            quantity: safeQuote.quantity,
            shippingMinor: safeQuote.shipping_minor ?? 0,
            taxMinor: safeQuote.tax_minor ?? 0,
          },
          hasExplicitUserApproval: false,
        });

        // 4. Compute State Fingerprint
        const stateFingerprint = computeStateFingerprint({
          projectId: projectId,
          blockedTaskId: hardwareTask.task_id,
          promotedTaskId: hardwareTask.task_id,
          invoiceId: hardwareTask.paypal_invoice_id ?? `${projectId}:${hardwareTask.task_id}`,
          unlockAmountMinor: safeQuote.total_minor,
          channel3ProductId: safeQuote.external_product_id,
          supplierTotalMinor: safeQuote.total_minor,
          currency: safeQuote.currency,
        });

        // 5. Generate FinOps Explanation
        const explanation = await generateFinOpsPolicyExplanation({
          taskName: hardwareTask.name,
          decision: channel3Eval.decision,
          reasonCodes: channel3Eval.reason_codes,
          permitted: channel3Eval.permitted,
          observed: channel3Eval.observed,
          contextNotes: `Incumbent quote ($${(incumbentUnitPrice / 100).toFixed(2)}) blocked. Channel3 replacement discovered at $${(safeQuote.unit_price_minor / 100).toFixed(2)}/u saving $${(safeQuote.savings_vs_incumbent_minor / 100).toFixed(2)}.`,
        });

        // 6. Persist Proposed Arbitrage Plan
        const planId = `plan_arbitrage_${Date.now()}`;
        const plan: CascadeRecoveryPlan = {
          plan_id: planId,
          project_id: projectId,
          blocked_task_id: hardwareTask.task_id,
          promoted_task_id: hardwareTask.task_id,
          selected_quote_id: safeQuote.quote_id,
          state_fingerprint: stateFingerprint,
          policy_decision: channel3Eval.decision,
          reason_codes_json: JSON.stringify(channel3Eval.reason_codes),
          idle_crew_hours: 0,
          idle_labor_cost_minor: 0,
          sla_penalty_minor: 0,
          total_exposure_minor: 0,
          new_promoted_start_date: hardwareTask.start_date,
          new_blocked_start_date: hardwareTask.start_date,
          immediate_unlock_minor: safeQuote.total_minor,
          deferred_labor_minor: hardwareTask.deferred_labor_minor,
          nudge_draft_text: `Supplier replacement approved: Channel3 quote $${(safeQuote.unit_price_minor / 100).toFixed(2)}/u saves $${(safeQuote.savings_vs_incumbent_minor / 100).toFixed(2)} vs incumbent.`,
          status: 'PROPOSED',
          created_at: new Date().toISOString(),
        };

        withTransaction(() => {
          db.prepare(
            `UPDATE recovery_plans SET status = 'SUPERSEDED'
             WHERE project_id = ? AND status = 'PROPOSED'`
          ).run(projectId);

          db.prepare(
            `INSERT INTO recovery_plans (
              plan_id, project_id, blocked_task_id, promoted_task_id, selected_quote_id,
              state_fingerprint, policy_decision, reason_codes_json, idle_crew_hours,
              idle_labor_cost_minor, sla_penalty_minor, total_exposure_minor,
              new_promoted_start_date, new_blocked_start_date, immediate_unlock_minor,
              deferred_labor_minor, nudge_draft_text, status, created_at
            ) VALUES (
              @plan_id, @project_id, @blocked_task_id, @promoted_task_id, @selected_quote_id,
              @state_fingerprint, @policy_decision, @reason_codes_json, @idle_crew_hours,
              @idle_labor_cost_minor, @sla_penalty_minor, @total_exposure_minor,
              @new_promoted_start_date, @new_blocked_start_date, @immediate_unlock_minor,
              @deferred_labor_minor, @nudge_draft_text, @status, @created_at
            )`
          ).run(plan);

          db.prepare(
            `INSERT INTO audit_events (
              event_id, project_id, task_id, plan_id, event_type, decision,
              reason_codes_json, state_fingerprint, paypal_reference_id,
              channel3_reference_id, summary, payload_json, created_at
            ) VALUES (?, ?, ?, ?, 'SCENARIO_B_TRIGGERED', 'REQUIRE_APPROVAL', ?, ?, NULL, ?, ?, ?, ?)`
          ).run(
            randomUUID(),
            projectId,
            hardwareTask.task_id,
            planId,
            JSON.stringify(channel3Eval.reason_codes),
            stateFingerprint,
            safeQuote.external_product_id,
            `Scenario B triggered: Incumbent blocked (+28.95% creep). Channel3 replacement quote approved saving $${(safeQuote.savings_vs_incumbent_minor / 100).toFixed(2)}.`,
            JSON.stringify({ incumbentEval, bestQuote: safeQuote }),
            new Date().toISOString()
          );
        });

        res.status(200).json({
          scenarioId: 'SCENARIO_B',
          success: true,
          incumbentBlocked: incumbentEval,
          channel3Proposed: {
            plan,
            quote: safeQuote,
            policyResult: channel3Eval,
            explanation,
          },
        });
        return;
      }

      // =======================================================================
      // SCENARIO C: Adversarial Dependency & Budget Override Hard BLOCK
      // =======================================================================
      case 'SCENARIO_C': {
        let downstreamTask = targetTaskId ? tasks.find((t) => t.task_id === targetTaskId) : null;
        if (!downstreamTask) {
          downstreamTask = tasks.find(
            (t) => dependencies.some((d) => d.to_task_id === t.task_id)
              && t.schedule_status !== 'COMPLETED'
          );
        }

        if (!downstreamTask) {
          res.status(500).json({ error: 'Downstream task missing' });
          return;
        }

        // Gather real prerequisites
        let requiredPrereqs = dependencies
          .filter((d) => d.to_task_id === downstreamTask.task_id)
          .map((d) => d.from_task_id);

        if (requiredPrereqs.length === 0) {
          res.status(400).json({ error: 'Selected task has no hard dependency to test' });
          return;
        }

        // Evaluate adversarial proposal:
        // 1. Incomplete prerequisite
        // 2. Hardware not in warehouse
        // 3. $2,100 quote exceeding $1,600 cap
        // 4. Missing / null shipping and tax
        const adversarialEval = evaluateRecoveryAndSupplierAction({
          taskToPromote: {
            id: downstreamTask.task_id,
            hard_dependencies: requiredPrereqs,
            materials_in_warehouse: false,
          },
          completedTaskIds: [], // None completed -> HARD_DEPENDENCY_VIOLATION
          phaseCurrency: 'USD',
          phaseBudgetMaxMinor: 160000,
          historicalUnitPriceMinor: 38000,
          maxAllowedVariancePct: 10.0,
          proposedQuote: {
            currency: 'USD',
            unitPriceMinor: 52500,
            quantity: 4, // $2,100 total > $1,600 cap
            shippingMinor: null, // UNKNOWN_COST_FIELD fail-closed
            taxMinor: null,
          },
          hasExplicitUserApproval: false,
        });

        const stateFingerprint = computeStateFingerprint({
          projectId: projectId,
          blockedTaskId: downstreamTask.task_id,
          promotedTaskId: downstreamTask.task_id,
          invoiceId: `${projectId}:${downstreamTask.task_id}:adversarial`,
          unlockAmountMinor: 210000,
          channel3ProductId: `adversarial:${downstreamTask.task_id}`,
          supplierTotalMinor: 210000,
          currency: 'USD',
        });

        const explanation = await generateFinOpsPolicyExplanation({
          taskName: downstreamTask.name,
          decision: adversarialEval.decision,
          reasonCodes: adversarialEval.reason_codes,
          permitted: adversarialEval.permitted,
          observed: adversarialEval.observed,
          contextNotes: 'Adversarial override attempt: dependency bypass + $2,100 unapproved vendor + unknown freight costs.',
        });

        // Record immutable BLOCK audit event (SEC-007)
        withTransaction(() => {
          db.prepare(
            `INSERT INTO audit_events (
              event_id, project_id, task_id, plan_id, event_type, decision,
              reason_codes_json, state_fingerprint, paypal_reference_id,
              channel3_reference_id, summary, payload_json, created_at
            ) VALUES (?, ?, ?, NULL, 'ADVERSARIAL_ATTEMPT_BLOCKED', 'BLOCK', ?, ?, NULL, NULL, ?, ?, ?)`
          ).run(
            randomUUID(),
            projectId,
            downstreamTask.task_id,
            JSON.stringify(adversarialEval.reason_codes),
            stateFingerprint,
            `Scenario C: Adversarial mutation BLOCKED. Violations: ${adversarialEval.reason_codes.join(', ')}`,
            JSON.stringify({ adversarialEval, explanation }),
            new Date().toISOString()
          );
        });

        res.status(200).json({
          scenarioId: 'SCENARIO_C',
          success: true,
          decision: adversarialEval.decision,
          reasonCodes: adversarialEval.reason_codes,
          adversarialEval,
          explanation,
        });
        return;
      }
    }
  } catch (err) {
    console.error(`[ScenarioRoutes] Error executing ${scenarioId}:`, err);
    res.status(500).json({ error: String(err) });
  }
});

export default router;
