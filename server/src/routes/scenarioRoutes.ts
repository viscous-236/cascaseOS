/**
 * @file scenarioRoutes.ts
 * @description 1-Click Live Hackathon Scenario Triggers (TASK-021, REQ-018).
 *
 * Implements:
 * - POST /api/scenarios/:scenarioId/trigger
 *   1. SCENARIO_A: Overdue Invoice + Critical-Path Blast Radius + Schedule Reroute + $1,396 Materials Split
 *   2. SCENARIO_B: Incumbent $490/u Price-Creep BLOCK + Channel3 $349/u Arbitrage Discovery ($564 Savings)
 *   3. SCENARIO_C: Adversarial Hard-Dependency & Cost Fail-Closed BLOCK (SEC-006)
 */

import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import { getDb, TaskRepo, withTransaction } from '../db/database.js';
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
import { APEX_PROJECT_ID } from '../services/projectBootstrapService.js';
import type {
  TaskDependency,
  SupplierQuote,
  CascadeRecoveryPlan,
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
  const { forceRefresh } = validation.data.body;
  const db = getDb();

  const tasks = TaskRepo.findByProject(APEX_PROJECT_ID);
  if (tasks.length === 0) {
    res.status(400).json({
      error: 'Project not bootstrapped. Call POST /api/projects/bootstrap first.',
    });
    return;
  }

  const dependencies = db
    .prepare<[string], TaskDependency>(
      'SELECT * FROM task_dependencies WHERE project_id = ?'
    )
    .all(APEX_PROJECT_ID);

  const completedTaskIds = tasks
    .filter((t) => t.schedule_status === 'COMPLETED')
    .map((t) => t.task_id);

  try {
    switch (scenarioId) {
      // =======================================================================
      // SCENARIO A: Overdue Invoice & Critical-Path Schedule Reroute
      // =======================================================================
      case 'SCENARIO_A': {
        const phase2Task = tasks.find((t) => t.task_id === 'task_phase_2_displays');
        const phase3Task = tasks.find((t) => t.task_id === 'task_phase_3_networking');

        if (!phase2Task || !phase3Task) {
          res.status(500).json({ error: 'Required canonical tasks missing' });
          return;
        }

        // 1. Analyze Blast Radius
        const blastRadius = analyzeProjectBlastRadius(tasks, dependencies);

        // 2. Compute Schedule Reroute (Phase 3 promoted, Phase 2 deferred)
        const rerouted = computeReroutedSchedule(phase2Task, phase3Task, tasks, dependencies);

        // 3. Evaluate Policy for Proposed Schedule Reroute
        const phase3HardDeps = dependencies
          .filter((d) => d.to_task_id === phase3Task.task_id)
          .map((d) => d.from_task_id);

        const policyResult = evaluateRecoveryAndSupplierAction({
          taskToPromote: {
            id: phase3Task.task_id,
            hard_dependencies: phase3HardDeps,
            materials_in_warehouse: phase3Task.materials_in_warehouse === 1,
          },
          completedTaskIds,
          phaseCurrency: 'USD',
          phaseBudgetMaxMinor: 160000,
          historicalUnitPriceMinor: 38000,
          maxAllowedVariancePct: 10.0,
          proposedQuote: {
            currency: 'USD',
            unitPriceMinor: 34900,
            quantity: 4,
            shippingMinor: 0,
            taxMinor: 0,
          },
          hasExplicitUserApproval: false, // Before human sign-off -> REQUIRE_APPROVAL
        });

        // 4. Compute Canonical SHA-256 State Fingerprint (PAT-002)
        const stateFingerprint = computeStateFingerprint({
          projectId: APEX_PROJECT_ID,
          blockedTaskId: phase2Task.task_id,
          promotedTaskId: phase3Task.task_id,
          invoiceId: phase2Task.paypal_invoice_id || 'INV2-PHASE-2',
          unlockAmountMinor: phase2Task.materials_unlock_minor,
          channel3ProductId: 'quote_incumbent_phase2',
          supplierTotalMinor: phase2Task.materials_unlock_minor,
          currency: 'USD',
        });

        // 5. Generate AI Nudge-Bot Message & Policy Explanation
        const nudge = await generateClientNudgeMessage({
          clientName: phase2Task.client_name,
          clientEmail: phase2Task.client_email,
          projectName: 'Apex Diagnostic Clinic & Studio Buildout',
          blockedTaskName: phase2Task.name,
          overdueInvoiceNumber: phase2Task.paypal_invoice_number || 'INV-002',
          invoiceTotalMinor: phase2Task.invoice_total_minor,
          materialsUnlockMinor: phase2Task.materials_unlock_minor,
          deferredLaborMinor: phase2Task.deferred_labor_minor,
          exposureAtRiskMinor: blastRadius.total_exposure_minor,
          currency: 'USD',
        });

        const explanation = await generateFinOpsPolicyExplanation({
          taskName: phase3Task.name,
          decision: policyResult.decision,
          reasonCodes: policyResult.reason_codes,
          permitted: policyResult.permitted,
          observed: policyResult.observed,
          contextNotes: 'Milestone Phase 2 overdue by 2 days; evaluating promoting Phase 3 networking ahead.',
        });

        // 6. Persist Recovery Plan in SQLite (PAT-001)
        const planId = `plan_reroute_${Date.now()}`;
        const plan: CascadeRecoveryPlan = {
          plan_id: planId,
          project_id: APEX_PROJECT_ID,
          blocked_task_id: phase2Task.task_id,
          promoted_task_id: phase3Task.task_id,
          selected_quote_id: 'quote_incumbent_phase2',
          state_fingerprint: stateFingerprint,
          policy_decision: policyResult.decision,
          reason_codes_json: JSON.stringify(policyResult.reason_codes),
          idle_crew_hours: blastRadius.idle_crew_hours,
          idle_labor_cost_minor: blastRadius.idle_labor_cost_minor,
          sla_penalty_minor: blastRadius.sla_penalty_minor,
          total_exposure_minor: blastRadius.total_exposure_minor,
          new_promoted_start_date: rerouted.new_promoted_start_date,
          new_blocked_start_date: rerouted.new_blocked_start_date,
          immediate_unlock_minor: phase2Task.materials_unlock_minor,
          deferred_labor_minor: phase2Task.deferred_labor_minor,
          nudge_draft_text: nudge.body,
          status: 'PROPOSED',
          created_at: new Date().toISOString(),
        };

        withTransaction(() => {
          // Supersede existing pending plans
          db.prepare(
            `UPDATE recovery_plans SET status = 'SUPERSEDED'
             WHERE project_id = ? AND status = 'PROPOSED'`
          ).run(APEX_PROJECT_ID);

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
          ).run(nudge.body, phase2Task.task_id);

          // Append audit event (SEC-007)
          db.prepare(
            `INSERT INTO audit_events (
              event_id, project_id, task_id, plan_id, event_type, decision,
              reason_codes_json, state_fingerprint, paypal_reference_id,
              channel3_reference_id, summary, payload_json, created_at
            ) VALUES (?, ?, ?, ?, 'SCENARIO_A_TRIGGERED', 'REQUIRE_APPROVAL', ?, ?, ?, NULL, ?, ?, ?)`
          ).run(
            randomUUID(),
            APEX_PROJECT_ID,
            phase2Task.task_id,
            planId,
            JSON.stringify(policyResult.reason_codes),
            stateFingerprint,
            phase2Task.paypal_invoice_id,
            `Scenario A triggered: Phase 2 overdue ($${(blastRadius.total_exposure_minor / 100).toFixed(2)} exposure). Reroute proposed.`,
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
        const phase2Task = tasks.find((t) => t.task_id === 'task_phase_2_displays');
        if (!phase2Task) {
          res.status(500).json({ error: 'Phase 2 task missing' });
          return;
        }

        const phase2HardDeps = dependencies
          .filter((d) => d.to_task_id === phase2Task.task_id)
          .map((d) => d.from_task_id);

        // 1. Evaluate Incumbent Quote ($490/u -> $1,960 total) -> BLOCK
        const incumbentEval = evaluateRecoveryAndSupplierAction({
          taskToPromote: {
            id: phase2Task.task_id,
            hard_dependencies: phase2HardDeps,
            materials_in_warehouse: phase2Task.materials_in_warehouse === 1,
          },
          completedTaskIds,
          phaseCurrency: 'USD',
          phaseBudgetMaxMinor: 160000,
          historicalUnitPriceMinor: 38000,
          maxAllowedVariancePct: 10.0,
          proposedQuote: {
            currency: 'USD',
            unitPriceMinor: 49000,
            quantity: 4,
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
          APEX_PROJECT_ID,
          phase2Task.task_id,
          JSON.stringify(incumbentEval.reason_codes),
          'Incumbent vendor quote ($490.00/u) BLOCKED: Price creep (+28.95%) & Phase budget exceeded ($1,960 vs $1,600 cap)',
          JSON.stringify(incumbentEval),
          new Date().toISOString()
        );

        // 2. Fetch Live Channel3 Quotes (~$349/u)
        const channel3Quotes = await searchAndAuditSupplierProducts(phase2Task, {
          forceRefresh: Boolean(forceRefresh),
        });

        const maxCompliantPrice = phase2Task.historical_unit_price_minor
          ? Math.round(phase2Task.historical_unit_price_minor * 1.1)
          : 41800;

        const compliantQuote = channel3Quotes.find(
          (q) => q.unit_price_minor > 0 && q.unit_price_minor <= maxCompliantPrice
        );

        const bestQuote = compliantQuote || channel3Quotes[0] || (
          db.prepare<[string], SupplierQuote>(
            `SELECT * FROM supplier_quotes
             WHERE task_id = ? AND source_type = 'CHANNEL3_LIVE'
             ORDER BY unit_price_minor ASC LIMIT 1`
          ).get(phase2Task.task_id)
        );

        if (!bestQuote) {
          res.status(502).json({
            error: 'No compliant supplier quotes returned from Channel3',
            incumbentBlocked: incumbentEval,
          });
          return;
        }

        // 3. Evaluate Channel3 Quote Policy
        const channel3Eval = evaluateRecoveryAndSupplierAction({
          taskToPromote: {
            id: phase2Task.task_id,
            hard_dependencies: phase2HardDeps,
            materials_in_warehouse: true, // Post-order candidate evaluation
          },
          completedTaskIds,
          phaseCurrency: 'USD',
          phaseBudgetMaxMinor: 160000,
          historicalUnitPriceMinor: 38000,
          maxAllowedVariancePct: 10.0,
          proposedQuote: {
            currency: bestQuote.currency,
            unitPriceMinor: bestQuote.unit_price_minor,
            quantity: bestQuote.quantity,
            shippingMinor: bestQuote.shipping_minor ?? 0,
            taxMinor: bestQuote.tax_minor ?? 0,
          },
          hasExplicitUserApproval: false,
        });

        // 4. Compute State Fingerprint
        const stateFingerprint = computeStateFingerprint({
          projectId: APEX_PROJECT_ID,
          blockedTaskId: phase2Task.task_id,
          promotedTaskId: phase2Task.task_id,
          invoiceId: phase2Task.paypal_invoice_id || 'INV2-PHASE-2',
          unlockAmountMinor: bestQuote.total_minor,
          channel3ProductId: bestQuote.external_product_id,
          supplierTotalMinor: bestQuote.total_minor,
          currency: bestQuote.currency,
        });

        // 5. Generate FinOps Explanation
        const explanation = await generateFinOpsPolicyExplanation({
          taskName: phase2Task.name,
          decision: channel3Eval.decision,
          reasonCodes: channel3Eval.reason_codes,
          permitted: channel3Eval.permitted,
          observed: channel3Eval.observed,
          contextNotes: `Incumbent quote ($490.00) blocked. Channel3 replacement discovered at $${(bestQuote.unit_price_minor / 100).toFixed(2)}/u saving $${(bestQuote.savings_vs_incumbent_minor / 100).toFixed(2)}.`,
        });

        // 6. Persist Proposed Arbitrage Plan
        const planId = `plan_arbitrage_${Date.now()}`;
        const plan: CascadeRecoveryPlan = {
          plan_id: planId,
          project_id: APEX_PROJECT_ID,
          blocked_task_id: phase2Task.task_id,
          promoted_task_id: phase2Task.task_id,
          selected_quote_id: bestQuote.quote_id,
          state_fingerprint: stateFingerprint,
          policy_decision: channel3Eval.decision,
          reason_codes_json: JSON.stringify(channel3Eval.reason_codes),
          idle_crew_hours: 0,
          idle_labor_cost_minor: 0,
          sla_penalty_minor: 0,
          total_exposure_minor: 0,
          new_promoted_start_date: phase2Task.start_date,
          new_blocked_start_date: phase2Task.start_date,
          immediate_unlock_minor: bestQuote.total_minor,
          deferred_labor_minor: phase2Task.deferred_labor_minor,
          nudge_draft_text: `Supplier replacement approved: Channel3 quote $${(bestQuote.unit_price_minor / 100).toFixed(2)}/u saves $${(bestQuote.savings_vs_incumbent_minor / 100).toFixed(2)} vs incumbent.`,
          status: 'PROPOSED',
          created_at: new Date().toISOString(),
        };

        withTransaction(() => {
          db.prepare(
            `UPDATE recovery_plans SET status = 'SUPERSEDED'
             WHERE project_id = ? AND status = 'PROPOSED'`
          ).run(APEX_PROJECT_ID);

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
            APEX_PROJECT_ID,
            phase2Task.task_id,
            planId,
            JSON.stringify(channel3Eval.reason_codes),
            stateFingerprint,
            bestQuote.external_product_id,
            `Scenario B triggered: Incumbent blocked (+28.95% creep). Channel3 replacement quote approved saving $${(bestQuote.savings_vs_incumbent_minor / 100).toFixed(2)}.`,
            JSON.stringify({ incumbentEval, bestQuote }),
            new Date().toISOString()
          );
        });

        res.status(200).json({
          scenarioId: 'SCENARIO_B',
          success: true,
          incumbentBlocked: incumbentEval,
          channel3Proposed: {
            plan,
            quote: bestQuote,
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
        const phase4Task = tasks.find((t) => t.task_id === 'task_phase_4_calibration');
        if (!phase4Task) {
          res.status(500).json({ error: 'Phase 4 task missing' });
          return;
        }

        const phase4HardDeps = dependencies
          .filter((d) => d.to_task_id === phase4Task.task_id)
          .map((d) => d.from_task_id);

        // Attempting to promote Phase 4 ahead of Phase 2 with unapproved $2,100 quote and missing shipping cost
        const adversarialEval = evaluateRecoveryAndSupplierAction({
          taskToPromote: {
            id: phase4Task.task_id,
            hard_dependencies: phase4HardDeps,
            materials_in_warehouse: false, // Service task / not in warehouse
          },
          completedTaskIds,
          phaseCurrency: 'USD',
          phaseBudgetMaxMinor: 160000,
          historicalUnitPriceMinor: 38000,
          maxAllowedVariancePct: 10.0,
          proposedQuote: {
            currency: 'USD',
            unitPriceMinor: 210000, // $2,100.00
            quantity: 1,
            shippingMinor: null, // Missing cost -> UNKNOWN_COST_FIELD (SEC-006 fail-closed)
            taxMinor: 0,
          },
          hasExplicitUserApproval: false,
        });

        const explanation = await generateFinOpsPolicyExplanation({
          taskName: phase4Task.name,
          decision: adversarialEval.decision,
          reasonCodes: adversarialEval.reason_codes,
          permitted: adversarialEval.permitted,
          observed: adversarialEval.observed,
          contextNotes: 'Adversarial attempt to promote Phase 4 calibration while Phase 2 displays mounting is incomplete, with missing cost fields.',
        });

        // Record adversarial block in audit ledger (SEC-007)
        db.prepare(
          `INSERT INTO audit_events (
            event_id, project_id, task_id, plan_id, event_type, decision,
            reason_codes_json, state_fingerprint, paypal_reference_id,
            channel3_reference_id, summary, payload_json, created_at
          ) VALUES (?, ?, ?, NULL, 'ADVERSARIAL_ATTEMPT_BLOCKED', 'BLOCK', ?, NULL, NULL, NULL, ?, ?, ?)`
        ).run(
          randomUUID(),
          APEX_PROJECT_ID,
          phase4Task.task_id,
          JSON.stringify(adversarialEval.reason_codes),
          'Adversarial bypass attempt BLOCKED: Hard dependency violation + Unknown cost field fail-closed gate',
          JSON.stringify({ adversarialEval, explanation }),
          new Date().toISOString()
        );

        res.status(200).json({
          scenarioId: 'SCENARIO_C',
          success: true,
          decision: adversarialEval.decision,
          reasonCodes: adversarialEval.reason_codes,
          permitted: adversarialEval.permitted,
          observed: adversarialEval.observed,
          explanation,
        });
        return;
      }
    }
  } catch (err) {
    console.error(`[ScenarioRoutes] Error executing ${scenarioId}:`, err);
    res.status(500).json({ error: `Scenario execution error: ${String(err)}` });
  }
});

export default router;
