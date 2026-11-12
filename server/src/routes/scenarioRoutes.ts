/**
 * @file scenarioRoutes.ts
 * @description Dynamic Live Hackathon Scenario Trigger Router (TASK-021, REQ-018, REQ-022, PAT-007).
 *
 * Implements:
 * - PAT-007: Dynamic Scenario Targeting Pattern (accepts projectId and targetTaskId)
 * - REQ-022: Operates dynamically on any active project without hardcoded task IDs
 * - POST /api/scenarios/:scenarioId/trigger
 *   1. SCENARIO_A: Overdue Invoice + Critical-Path Blast Radius + Schedule Reroute + Materials Split
 *   2. SCENARIO_B: Incumbent Price-Creep BLOCK + Channel3 Arbitrage Discovery
 *   3. SCENARIO_C: Adversarial Hard-Dependency & Cost Fail-Closed BLOCK (SEC-006)
 */

import { Router, type Request, type Response } from 'express';
import { ProjectRepo } from '../db/database.js';
import { triggerScenarioSchema } from '../schemas/apiSchemas.js';
import {
  executeScenario,
  ScenarioExecutionError,
} from '../services/scenarioExecutionService.js';

export { executeScenario, ScenarioExecutionError };

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

  try {
    const result = await executeScenario(scenarioId as 'SCENARIO_A' | 'SCENARIO_B' | 'SCENARIO_C', {
      projectId,
      ...(targetTaskId !== undefined ? { targetTaskId } : {}),
      ...(forceRefresh !== undefined ? { forceRefresh } : {}),
    });
    res.status(200).json(result);
  } catch (err) {
    if (err instanceof ScenarioExecutionError) {
      res.status(err.statusCode).json({
        error: err.message,
        ...(err.details ? { details: err.details } : {}),
      });
      return;
    }
    console.error(`[ScenarioRoutes] Error executing ${scenarioId}:`, err);
    res.status(500).json({ error: String(err) });
  }
});

export default router;
