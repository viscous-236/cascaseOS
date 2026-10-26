/**
 * @file bryntumPatch.ts
 * @description Defensive runtime patch for Bryntum Gantt unmount race condition.
 *
 * Prevents:
 * - Uncaught TypeError: Cannot read properties of undefined (reading 'removeIdentifier')
 *   at CriticalPaths.destroyObserver during component unmounting.
 */

import { CriticalPaths } from '@bryntum/gantt';

if (typeof window !== 'undefined' && typeof CriticalPaths !== 'undefined' && CriticalPaths.prototype) {
  const proto = CriticalPaths.prototype as any;

  // 1. Guard destroyObserver against undefined graph/project
  if (typeof proto.destroyObserver === 'function') {
    const origDestroyObserver = proto.destroyObserver;
    proto.destroyObserver = function (...args: any[]) {
      try {
        return origDestroyObserver.apply(this, args);
      } catch {
        // Suppress unmount race condition where project graph is torn down before feature destructor
        this.criticalPathObserver = null;
      }
    };
  }

  // 2. Guard doDestroy against feature unmount errors
  if (typeof proto.doDestroy === 'function') {
    const origDoDestroy = proto.doDestroy;
    proto.doDestroy = function (...args: any[]) {
      try {
        return origDoDestroy.apply(this, args);
      } catch {
        // Suppress feature destruction errors during unmount
      }
    };
  }
}

export {};
