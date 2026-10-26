/**
 * @file dynamicProjectsIntegration.test.ts
 * @description Integration tests for Dynamic Multi-Tenant Project Onboarding,
 * Kahn cycle verification, and Bryntum Gantt CRUD endpoints (Phase 4).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import app from '../index.js';
import * as dbModule from '../db/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SCHEMA_PATH = resolve(__dirname, '../db/schema.sql');

describe('Dynamic Multi-Tenant Project Onboarding & Task CRUD API', () => {
  let testDb: Database.Database;

  beforeEach(() => {
    testDb = new Database(':memory:');
    const schema = readFileSync(SCHEMA_PATH, 'utf-8');
    testDb.exec(schema);
    dbModule.setDbForTesting(testDb);
  });

  afterEach(() => {
    dbModule.setDbForTesting(null);
    testDb.close();
    vi.restoreAllMocks();
  });

  describe('GET /api/projects', () => {
    it('returns empty list or seeded projects with summary KPIs (REQ-101)', async () => {
      const res = await request(app).get('/api/projects');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.projects)).toBe(true);
    });
  });

  describe('POST /api/projects/create-custom', () => {
    it('creates a custom project in MANUAL_STRUCTURED mode and persists DAG (REQ-102)', async () => {
      const payload = {
        mode: 'MANUAL_STRUCTURED',
        project_name: 'Apex Soundstage Arena',
        currency: 'USD',
        start_date: '2026-11-01',
        client_name: 'Apex Arena LLC',
        client_email: 'billing@apexarena.com',
        tasks: [
          {
            task_id: 'phase_1_rigging',
            name: 'Structural Rigging',
            duration_days: 3,
            crew_assigned: 'Rigging Crew',
            daily_idle_burn_minor: 60000,
            sla_delay_penalty_minor: 0,
            phase_hardware_budget_max_minor: 100000,
            materials_in_warehouse: true,
            create_live_paypal_invoice: false,
          },
          {
            task_id: 'phase_2_video',
            name: 'Video Wall Installation',
            duration_days: 4,
            crew_assigned: 'Display Techs',
            daily_idle_burn_minor: 80000,
            sla_delay_penalty_minor: 120000,
            phase_hardware_budget_max_minor: 150000,
            materials_in_warehouse: false,
            create_live_paypal_invoice: false,
          },
        ],
        dependencies: [
          {
            from_task_id: 'phase_1_rigging',
            to_task_id: 'phase_2_video',
            lag_days: 0,
          },
        ],
        create_live_paypal_invoices: false,
        run_live_channel3_audit: false,
      };

      const res = await request(app).post('/api/projects/create-custom').send(payload);
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.project.name).toBe('Apex Soundstage Arena');
      expect(res.body.tasks).toHaveLength(2);
      expect(res.body.dependencies).toHaveLength(1);

      // Verify GET /api/projects now lists this project
      const listRes = await request(app).get('/api/projects');
      expect(listRes.status).toBe(200);
      const found = listRes.body.projects.find((p: any) => p.name === 'Apex Soundstage Arena');
      expect(found).toBeDefined();
      expect(found.total_tasks).toBe(2);
    });

    it('rejects cyclic dependencies with HTTP 400 DAG_CYCLE_DETECTED (SEC-101)', async () => {
      const payload = {
        mode: 'MANUAL_STRUCTURED',
        project_name: 'Cyclic Project Test',
        currency: 'USD',
        start_date: '2026-11-01',
        client_name: 'Cycle Corp',
        client_email: 'cycle@test.com',
        tasks: [
          {
            task_id: 'task_a',
            name: 'Task A',
            duration_days: 2,
            materials_in_warehouse: true,
          },
          {
            task_id: 'task_b',
            name: 'Task B',
            duration_days: 2,
            materials_in_warehouse: true,
          },
        ],
        dependencies: [
          { from_task_id: 'task_a', to_task_id: 'task_b', lag_days: 0 },
          { from_task_id: 'task_b', to_task_id: 'task_a', lag_days: 0 }, // Cycle!
        ],
        create_live_paypal_invoices: false,
        run_live_channel3_audit: false,
      };

      const res = await request(app).post('/api/projects/create-custom').send(payload);
      expect(res.status).toBe(400);
      expect(res.body.reason).toBe('DAG_CYCLE_DETECTED');
    });
  });

  describe('Task & Dependency CRUD (REQ-105)', () => {
    let projectId: string;

    beforeEach(async () => {
      const payload = {
        mode: 'MANUAL_STRUCTURED',
        project_name: 'CRUD Test Project',
        currency: 'USD',
        start_date: '2026-11-01',
        client_name: 'CRUD Client',
        client_email: 'crud@test.com',
        tasks: [
          {
            task_id: 'task_1',
            name: 'Phase 1 Init',
            duration_days: 3,
            materials_in_warehouse: true,
          },
          {
            task_id: 'task_2',
            name: 'Phase 2 Procure',
            duration_days: 4,
            materials_in_warehouse: false,
          },
        ],
        dependencies: [
          { from_task_id: 'task_1', to_task_id: 'task_2', lag_days: 0 },
        ],
        create_live_paypal_invoices: false,
        run_live_channel3_audit: false,
      };

      const res = await request(app).post('/api/projects/create-custom').send(payload);
      projectId = res.body.project.project_id;
    });

    it('patches task schedule and warehouse readiness', async () => {
      const patchRes = await request(app)
        .patch(`/api/projects/${projectId}/tasks/task_2`)
        .send({
          materials_in_warehouse: true,
          duration_days: 5,
        });

      expect(patchRes.status).toBe(200);
      expect(patchRes.body.success).toBe(true);
      expect(patchRes.body.task.materials_in_warehouse).toBe(1);
      expect(patchRes.body.task.duration_days).toBe(5);
    });

    it('adds a new task phase to the project', async () => {
      const addRes = await request(app)
        .post(`/api/projects/${projectId}/tasks`)
        .send({
          name: 'Phase 3 Commissioning',
          duration_days: 2,
          crew_assigned: 'Testing Crew',
          materials_in_warehouse: true,
        });

      expect(addRes.status).toBe(201);
      expect(addRes.body.success).toBe(true);
      expect(addRes.body.task.name).toBe('Phase 3 Commissioning');
    });

    it('prevents adding a dependency that introduces a cycle (SEC-101)', async () => {
      // task_1 -> task_2 already exists. Adding task_2 -> task_1 creates a cycle
      const cycleDepRes = await request(app)
        .post(`/api/projects/${projectId}/dependencies`)
        .send({
          from_task_id: 'task_2',
          to_task_id: 'task_1',
        });

      expect(cycleDepRes.status).toBe(400);
      expect(cycleDepRes.body.reason).toBe('DAG_CYCLE_DETECTED');
    });
  });
});
