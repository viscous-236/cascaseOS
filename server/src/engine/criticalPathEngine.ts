/**
 * @file criticalPathEngine.ts
 * @description Deterministic DAG critical-path analyser and blast-radius calculator.
 *
 * Implements REQ-005:
 * - Topological sort of the task DAG
 * - Locates tasks with paypal_invoice_status === 'OVERDUE'
 * - Finds all transitive downstream tasks blocked by the overdue task
 * - Computes idle_crew_hours = blocked_duration_days * 8
 * - Computes idle_labor_cost_minor = blocked_duration_days * daily_idle_burn_minor
 * - Adds sla_delay_penalty_minor
 * - Identifies candidate tasks eligible for schedule promotion
 *
 * This is a PURE function — no DB calls, no side effects. All business
 * rules live here so they can be verified deterministically by Vitest (GUD-001).
 */

import type {
  CascadeTask,
  TaskDependency,
  BlastRadiusResult,
} from '../types/domain.js';

// Hours per blocked work day (used for idle crew burn calculation)
const HOURS_PER_DAY = 8;

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Analyses the project task DAG to compute the blast radius of all overdue
 * invoices and identify tasks eligible for schedule promotion.
 *
 * @param tasks       All tasks belonging to the project
 * @param dependencies All task_dependencies for the project
 * @returns           BlastRadiusResult with blocked tasks, costs, and candidates
 */
export function analyzeProjectBlastRadius(
  tasks: CascadeTask[],
  dependencies: TaskDependency[]
): BlastRadiusResult {
  if (tasks.length === 0) {
    return emptyResult();
  }

  const taskMap = buildTaskMap(tasks);
  const adjacency = buildAdjacencyMap(dependencies);

  // 1. Find root blocked tasks: those with OVERDUE invoices and PAYMENT_BLOCKED status
  const overdueRootIds = tasks
    .filter(
      (t) =>
        t.paypal_invoice_status === 'OVERDUE' &&
        t.schedule_status === 'PAYMENT_BLOCKED'
    )
    .map((t) => t.task_id);

  if (overdueRootIds.length === 0) {
    return emptyResult();
  }

  // 2. BFS/DFS downstream from each overdue root to find all transitively blocked tasks
  const allBlockedIds = new Set<string>();

  for (const rootId of overdueRootIds) {
    allBlockedIds.add(rootId);
    collectDownstream(rootId, adjacency, allBlockedIds);
  }

  // 3. Compute costs across ALL blocked tasks
  let idleCrewHours = 0;
  let idleLaborCostMinor = 0;
  let slaPenaltyMinor = 0;

  for (const blockedId of allBlockedIds) {
    const task = taskMap.get(blockedId);
    if (!task) continue;

    idleCrewHours += task.duration_days * HOURS_PER_DAY;
    idleLaborCostMinor += task.duration_days * task.daily_idle_burn_minor;
    slaPenaltyMinor += task.sla_delay_penalty_minor;
  }

  const totalExposureMinor = idleLaborCostMinor + slaPenaltyMinor;

  // 4. Find tasks eligible for promotion:
  //    - NOT in the blocked set
  //    - NOT already COMPLETED, MATERIALS_ORDERED, or REROUTED_ACTIVE
  //    - ALL hard dependencies (from_task_ids pointing to this task) are COMPLETED
  //    - materials_in_warehouse === 1
  const completedTaskIds = new Set(
    tasks
      .filter((t) => t.schedule_status === 'COMPLETED')
      .map((t) => t.task_id)
  );

  // Build reverse adjacency: to_task_id → [from_task_id, ...]
  const reverseAdj = buildReverseAdjacency(dependencies);

  const promotableCandidateIds = tasks
    .filter((t) => {
      if (allBlockedIds.has(t.task_id)) return false;
      if (
        t.schedule_status === 'COMPLETED' ||
        t.schedule_status === 'MATERIALS_ORDERED' ||
        t.schedule_status === 'REROUTED_ACTIVE'
      )
        return false;
      if (t.materials_in_warehouse !== 1) return false;

      // All dependencies of this task must be COMPLETED
      const deps = reverseAdj.get(t.task_id) ?? [];
      return deps.every((fromId) => completedTaskIds.has(fromId));
    })
    .map((t) => t.task_id);

  return {
    blocked_task_ids: Array.from(allBlockedIds),
    idle_crew_hours: idleCrewHours,
    idle_labor_cost_minor: idleLaborCostMinor,
    sla_penalty_minor: slaPenaltyMinor,
    total_exposure_minor: totalExposureMinor,
    promotable_candidate_ids: promotableCandidateIds,
  };
}

// =============================================================================
// INTERNAL HELPERS
// =============================================================================

/** Builds a Map<task_id, CascadeTask> for O(1) lookup */
function buildTaskMap(tasks: CascadeTask[]): Map<string, CascadeTask> {
  return new Map(tasks.map((t) => [t.task_id, t]));
}

/**
 * Builds a forward adjacency map: from_task_id → [to_task_id, ...]
 * Represents "task A must finish before task B can start"
 */
function buildAdjacencyMap(
  dependencies: TaskDependency[]
): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  for (const dep of dependencies) {
    const existing = adj.get(dep.from_task_id) ?? [];
    existing.push(dep.to_task_id);
    adj.set(dep.from_task_id, existing);
  }
  return adj;
}

/**
 * Builds a reverse adjacency map: to_task_id → [from_task_id, ...]
 * Represents "task B depends on these upstream tasks"
 */
function buildReverseAdjacency(
  dependencies: TaskDependency[]
): Map<string, string[]> {
  const rev = new Map<string, string[]>();
  for (const dep of dependencies) {
    const existing = rev.get(dep.to_task_id) ?? [];
    existing.push(dep.from_task_id);
    rev.set(dep.to_task_id, existing);
  }
  return rev;
}

/**
 * DFS traversal from startId to collect all downstream (transitively blocked) task IDs.
 * Adds each visited node to the `visited` set to prevent cycles.
 */
function collectDownstream(
  startId: string,
  adjacency: Map<string, string[]>,
  visited: Set<string>
): void {
  const children = adjacency.get(startId) ?? [];
  for (const childId of children) {
    if (!visited.has(childId)) {
      visited.add(childId);
      collectDownstream(childId, adjacency, visited);
    }
  }
}

/** Returns a zeroed-out BlastRadiusResult for projects with no blockages */
function emptyResult(): BlastRadiusResult {
  return {
    blocked_task_ids: [],
    idle_crew_hours: 0,
    idle_labor_cost_minor: 0,
    sla_penalty_minor: 0,
    total_exposure_minor: 0,
    promotable_candidate_ids: [],
  };
}
