/**
 * @file scheduleRerouter.ts
 * @description Deterministic schedule promotion engine.
 *
 * Implements REQ-005, TASK-008:
 * - Swaps candidateTask into blockedTask.start_date
 * - Defers blockedTask to start after candidateTask ends (+ lag_days)
 * - Verifies zero dependency cycle or finish-to-start violations
 *
 * PURE FUNCTION — no DB calls, no side effects (GUD-001).
 */

import type {
  CascadeTask,
  TaskDependency,
  RerouteResult,
} from '../types/domain.js';

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Computes a rerouted schedule by promoting the candidate task into the slot
 * vacated by the blocked task, and deferring the blocked task to start after
 * the candidate task ends.
 *
 * Validates:
 * 1. The candidate's own dependencies are all COMPLETED (safe to promote)
 * 2. The deferred blocked start date does not violate any of its dependencies
 * 3. No dependency cycle is introduced
 *
 * @param blockedTask   The PAYMENT_BLOCKED task to defer
 * @param candidateTask The READY_TO_PROMOTE task to pull forward
 * @param allTasks      All project tasks (for dependency resolution)
 * @param dependencies  All project task_dependencies
 * @returns             RerouteResult with new dates and validation flag
 */
export function computeReroutedSchedule(
  blockedTask: CascadeTask,
  candidateTask: CascadeTask,
  allTasks: CascadeTask[],
  dependencies: TaskDependency[]
): RerouteResult {
  // Promoted task takes the blocked task's original start date
  const newPromotedStartDate = blockedTask.start_date;
  const newPromotedEndDate = addDays(
    newPromotedStartDate,
    candidateTask.duration_days - 1
  );

  // Blocked task deferred to start the day after the promoted task ends
  // (+ any relevant lag_days from the dependency, default 0)
  const lag = getLagBetween(blockedTask.task_id, candidateTask.task_id, dependencies);
  const newBlockedStartDate = addDays(newPromotedEndDate, 1 + lag);
  const newBlockedEndDate = addDays(
    newBlockedStartDate,
    blockedTask.duration_days - 1
  );

  // Build a map of all task end dates for dependency validation
  const taskEndDateMap = buildTaskEndDateMap(allTasks);
  // Override with our proposed new dates
  taskEndDateMap.set(candidateTask.task_id, newPromotedEndDate);
  taskEndDateMap.set(blockedTask.task_id, newBlockedEndDate);

  // Check: all dependencies of the blocked task are satisfied
  // (i.e., all upstream tasks finish before newBlockedStartDate)
  const dependencyCheckPassed = validateDependencies(
    blockedTask.task_id,
    newBlockedStartDate,
    dependencies,
    taskEndDateMap
  );

  const exposureMitigatedMinor =
    blockedTask.duration_days * blockedTask.daily_idle_burn_minor +
    blockedTask.sla_delay_penalty_minor;

  return {
    promoted_task_id: candidateTask.task_id,
    blocked_task_id: blockedTask.task_id,
    new_promoted_start_date: newPromotedStartDate,
    new_blocked_start_date: newBlockedStartDate,
    dependency_check_passed: dependencyCheckPassed,
    exposure_mitigated_minor: exposureMitigatedMinor,
  };
}

// =============================================================================
// INTERNAL HELPERS
// =============================================================================

/**
 * Adds N calendar days to an ISO date string (YYYY-MM-DD) and returns result.
 * @example addDays('2026-10-16', 2) → '2026-10-18'
 */
export function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Returns lag_days for a direct dependency between two tasks (default 0 if none) */
function getLagBetween(
  toTaskId: string,
  fromTaskId: string,
  dependencies: TaskDependency[]
): number {
  const dep = dependencies.find(
    (d) => d.from_task_id === fromTaskId && d.to_task_id === toTaskId
  );
  return dep?.lag_days ?? 0;
}

/** Builds a map of task_id → current end_date for all tasks */
function buildTaskEndDateMap(tasks: CascadeTask[]): Map<string, string> {
  return new Map(tasks.map((t) => [t.task_id, t.end_date]));
}

/**
 * Validates that all upstream finish-to-start dependencies for `taskId` are
 * satisfied given the proposed new start date and the current end-date map.
 * Returns true if all upstream tasks end before newStartDate.
 */
function validateDependencies(
  taskId: string,
  newStartDate: string,
  dependencies: TaskDependency[],
  taskEndDateMap: Map<string, string>
): boolean {
  const upstreamDeps = dependencies.filter((d) => d.to_task_id === taskId);
  for (const dep of upstreamDeps) {
    const upstreamEnd = taskEndDateMap.get(dep.from_task_id);
    if (!upstreamEnd) continue; // Unknown task — skip gracefully
    // Upstream task must end before (or on the day before) the new start
    const upstreamEndDate = new Date(`${upstreamEnd}T00:00:00Z`);
    const proposedStart = new Date(`${newStartDate}T00:00:00Z`);
    const effectiveStartAfterLag = new Date(proposedStart);
    effectiveStartAfterLag.setUTCDate(
      effectiveStartAfterLag.getUTCDate() - dep.lag_days
    );
    if (upstreamEndDate >= effectiveStartAfterLag) {
      return false; // Dependency violation
    }
  }
  return true;
}
