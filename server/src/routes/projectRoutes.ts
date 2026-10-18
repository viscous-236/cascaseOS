/**
 * @file projectRoutes.ts
 * @description Project bootstrap, state, and system health endpoints (TASK-020, ARC-004).
 *
 * Implements:
 * - GET  /api/health            — Live connectivity check (PayPal, Channel3, SQLite, LLM)
 * - POST /api/projects/bootstrap — Canonical project seeder with live Sandbox IDs
 * - GET  /api/projects/:projectId/state — Full state synchronization endpoint (ARC-005)
 */

import { Router, type Request, type Response } from 'express';
import { getDb, ProjectRepo, TaskRepo } from '../db/database.js';
import { env } from '../config/env.js';
import { getPayPalAccessToken } from '../services/paypalAuthService.js';
import { searchChannel3Products } from '../services/channel3Service.js';
import { bootstrapApexClinicProject } from '../services/projectBootstrapService.js';
import {
  bootstrapProjectSchema,
  getProjectStateSchema,
} from '../schemas/apiSchemas.js';
import type {
  TaskDependency,
  SupplierQuote,
  CascadeRecoveryPlan,
  PayPalTransactionRecord,
  AuditEvent,
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
// 2. POST /api/projects/bootstrap (Live project seeder)
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
// 3. GET /api/projects/:projectId/state (Full UI State Synchronization)
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

export default router;
