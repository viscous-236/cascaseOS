/**
 * @file integrationAudit.ts
 * @description Persists outbound integration HTTP status and latency (GUD-006).
 *
 * Rows are best-effort: the verifier and startup bootstrap may execute before
 * SQLite is available, and observability must never take down a live call.
 */

import { randomUUID } from 'node:crypto';
import { getDb } from '../db/database.js';

export interface IntegrationHttpCall {
  provider: 'PAYPAL' | 'CHANNEL3';
  method: string;
  path: string;
  status: number;
  latencyMs: number;
  requestId?: string | undefined;
  error?: string | undefined;
}

/** Writes an `INTEGRATION_HTTP_CALL` row to the append-only audit ledger. */
export function recordIntegrationHttpCall(call: IntegrationHttpCall): void {
  try {
    const db = getDb();
    const summary = `${call.provider} ${call.method} ${call.path} -> HTTP ${call.status} in ${call.latencyMs}ms`;
    db.prepare(
      `INSERT INTO audit_events (
        event_id, project_id, task_id, plan_id, event_type, decision,
        reason_codes_json, state_fingerprint, paypal_reference_id,
        channel3_reference_id, summary, payload_json, created_at
      ) VALUES (?, 'SYSTEM', NULL, NULL, 'INTEGRATION_HTTP_CALL', NULL, '[]', NULL, ?, ?, ?, ?, ?)`
    ).run(
      randomUUID(),
      call.provider === 'PAYPAL' ? call.requestId ?? null : null,
      call.provider === 'CHANNEL3' ? call.requestId ?? null : null,
      summary,
      JSON.stringify({
        provider: call.provider,
        method: call.method,
        path: call.path,
        status: call.status,
        latency_ms: call.latencyMs,
        ...(call.error !== undefined ? { error: call.error } : {}),
      }),
      new Date().toISOString()
    );
  } catch {
    // Observability is best-effort when SQLite has not been initialised.
  }
}
