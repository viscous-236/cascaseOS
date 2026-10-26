/**
 * @file dagValidator.ts
 * @description Deterministic Acyclic Graph (DAG) validator using Kahn's algorithm (TASK-101, SEC-101).
 *
 * Implements:
 * - SEC-101: Fail-closed cycle detection gate preventing infinite loops or circular scheduling
 * - Topological sort ordering for deterministic task scheduling
 * - Cycle node extraction for precise developer/user diagnostics
 */

export interface DagValidationResult {
  valid: boolean;
  topologicalOrder: string[];
  cycleNodes: string[];
}

/**
 * Validates that the directed graph formed by taskIds and dependencies is acyclic (a valid DAG).
 * Uses Kahn's algorithm (O(V + E)).
 *
 * @param taskIds Array of unique task IDs representing vertices.
 * @param dependencies Array of directed edges where `from_task_id` must complete before `to_task_id` can start.
 * @returns DagValidationResult with boolean validity, topological sort order, and any nodes caught in cycles.
 */
export function validateAcyclicGraph(
  taskIds: string[],
  dependencies: Array<{ from_task_id: string; to_task_id: string }>
): DagValidationResult {
  if (taskIds.length === 0) {
    return { valid: true, topologicalOrder: [], cycleNodes: [] };
  }

  const taskIdSet = new Set(taskIds);
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  // Initialize data structures for all task vertices
  for (const id of taskIds) {
    inDegree.set(id, 0);
    adjacency.set(id, []);
  }

  // Populate graph edges (ignore dependencies referencing non-existent tasks)
  for (const dep of dependencies) {
    if (!taskIdSet.has(dep.from_task_id) || !taskIdSet.has(dep.to_task_id)) {
      continue;
    }
    // Self-dependency is an immediate cycle
    if (dep.from_task_id === dep.to_task_id) {
      return {
        valid: false,
        topologicalOrder: [],
        cycleNodes: [dep.from_task_id],
      };
    }

    const currentIn = inDegree.get(dep.to_task_id) ?? 0;
    inDegree.set(dep.to_task_id, currentIn + 1);

    const edges = adjacency.get(dep.from_task_id) ?? [];
    edges.push(dep.to_task_id);
    adjacency.set(dep.from_task_id, edges);
  }

  // Queue of vertices with 0 in-degree
  const queue: string[] = [];
  for (const [id, deg] of inDegree.entries()) {
    if (deg === 0) {
      queue.push(id);
    }
  }

  const topologicalOrder: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    topologicalOrder.push(current);

    const neighbors = adjacency.get(current) ?? [];
    for (const neighbor of neighbors) {
      const remainingDegree = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, remainingDegree);
      if (remainingDegree === 0) {
        queue.push(neighbor);
      }
    }
  }

  const isAcyclic = topologicalOrder.length === taskIds.length;
  const cycleNodes = isAcyclic
    ? []
    : taskIds.filter((id) => !topologicalOrder.includes(id));

  return {
    valid: isAcyclic,
    topologicalOrder: isAcyclic ? topologicalOrder : [],
    cycleNodes,
  };
}

/**
 * Convenience helper returning true if the graph contains any cycle.
 */
export function detectDagCycle(
  taskIds: string[],
  dependencies: Array<{ from_task_id: string; to_task_id: string }>
): boolean {
  return !validateAcyclicGraph(taskIds, dependencies).valid;
}
