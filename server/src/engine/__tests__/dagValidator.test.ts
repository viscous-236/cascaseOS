/**
 * @file dagValidator.test.ts
 * @description Unit tests for DAG validation and cycle detection (TEST-101, SEC-101).
 */

import { describe, it, expect } from 'vitest';
import { validateAcyclicGraph, detectDagCycle } from '../dagValidator.js';

describe('dagValidator — Kahn’s Algorithm DAG Validation (SEC-101, TEST-101)', () => {
  it('validates a linear chain DAG: A -> B -> C', () => {
    const taskIds = ['A', 'B', 'C'];
    const deps = [
      { from_task_id: 'A', to_task_id: 'B' },
      { from_task_id: 'B', to_task_id: 'C' },
    ];

    const result = validateAcyclicGraph(taskIds, deps);
    expect(result.valid).toBe(true);
    expect(result.topologicalOrder).toEqual(['A', 'B', 'C']);
    expect(result.cycleNodes).toEqual([]);
    expect(detectDagCycle(taskIds, deps)).toBe(false);
  });

  it('validates a branching and converging diamond DAG: A -> B, A -> C, B -> D, C -> D', () => {
    const taskIds = ['A', 'B', 'C', 'D'];
    const deps = [
      { from_task_id: 'A', to_task_id: 'B' },
      { from_task_id: 'A', to_task_id: 'C' },
      { from_task_id: 'B', to_task_id: 'D' },
      { from_task_id: 'C', to_task_id: 'D' },
    ];

    const result = validateAcyclicGraph(taskIds, deps);
    expect(result.valid).toBe(true);
    expect(result.topologicalOrder[0]).toBe('A');
    expect(result.topologicalOrder[3]).toBe('D');
    expect(result.cycleNodes).toHaveLength(0);
  });

  it('rejects a direct 2-node cycle: A -> B -> A', () => {
    const taskIds = ['A', 'B'];
    const deps = [
      { from_task_id: 'A', to_task_id: 'B' },
      { from_task_id: 'B', to_task_id: 'A' },
    ];

    const result = validateAcyclicGraph(taskIds, deps);
    expect(result.valid).toBe(false);
    expect(result.topologicalOrder).toEqual([]);
    expect(result.cycleNodes).toContain('A');
    expect(result.cycleNodes).toContain('B');
    expect(detectDagCycle(taskIds, deps)).toBe(true);
  });

  it('rejects a 3-node cycle: A -> B -> C -> A with an unattached node D', () => {
    const taskIds = ['A', 'B', 'C', 'D'];
    const deps = [
      { from_task_id: 'A', to_task_id: 'B' },
      { from_task_id: 'B', to_task_id: 'C' },
      { from_task_id: 'C', to_task_id: 'A' },
    ];

    const result = validateAcyclicGraph(taskIds, deps);
    expect(result.valid).toBe(false);
    expect(result.cycleNodes).toContain('A');
    expect(result.cycleNodes).toContain('B');
    expect(result.cycleNodes).toContain('C');
    expect(result.cycleNodes).not.toContain('D'); // D is acyclic
  });

  it('rejects self-referencing dependency: A -> A', () => {
    const taskIds = ['A'];
    const deps = [{ from_task_id: 'A', to_task_id: 'A' }];

    const result = validateAcyclicGraph(taskIds, deps);
    expect(result.valid).toBe(false);
    expect(result.cycleNodes).toEqual(['A']);
  });

  it('handles empty task list gracefully', () => {
    const result = validateAcyclicGraph([], []);
    expect(result.valid).toBe(true);
    expect(result.topologicalOrder).toEqual([]);
    expect(result.cycleNodes).toEqual([]);
  });
});
