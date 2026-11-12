/**
 * @file paypalClient.test.ts
 * @description Typed PayPal transport, observability, and redaction tests
 * (ARC-006, GUD-006, SEC-008).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { paypalHttpRequest, PayPalApiError } from '../services/paypalClient.js';
import { redactSecrets, redactHeaders } from '../utils/redaction.js';
import * as dbModule from '../db/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SCHEMA_PATH = resolve(__dirname, '../db/schema.sql');

describe('paypalClient (ARC-006)', () => {
  let testDb: Database.Database;

  beforeEach(() => {
    testDb = new Database(':memory:');
    testDb.exec(readFileSync(SCHEMA_PATH, 'utf-8'));
    dbModule.setDbForTesting(testDb);
  });

  afterEach(() => {
    dbModule.setDbForTesting(null);
    testDb.close();
    vi.unstubAllGlobals();
  });

  it('sends strict headers and parses a typed JSON response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'ORDER-123', status: 'CREATED' }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const response = await paypalHttpRequest<{ id: string; status: string }>({
      method: 'POST',
      path: '/v2/checkout/orders',
      requestId: 'cascade-order-plan-1',
      body: { intent: 'CAPTURE' },
      tokenProvider: async () => 'A21AA-test-token',
      apiBaseUrl: 'https://api-m.sandbox.paypal.com',
    });

    expect(response.body).toEqual({ id: 'ORDER-123', status: 'CREATED' });
    expect(response.status).toBe(201);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer A21AA-test-token');
    expect(headers['PayPal-Request-Id']).toBe('cascade-order-plan-1');
    expect(headers['PayPal-Partner-Attribution-Id']).toContain('CascadeOS');
    expect(JSON.parse(init.body as string)).toEqual({ intent: 'CAPTURE' });
  });

  it('throws a redacted PayPalApiError on non-2xx responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('{"error":"invalid token A21AA-secret-token-value"}', {
          status: 401,
        })
      )
    );

    const promise = paypalHttpRequest({
      method: 'GET',
      path: '/v2/checkout/orders/ORDER-1',
      tokenProvider: async () => 'A21AA-secret-token-value',
      apiBaseUrl: 'https://api-m.sandbox.paypal.com',
    });

    await expect(promise).rejects.toBeInstanceOf(PayPalApiError);
    await expect(promise).rejects.not.toThrow(/A21AA-secret-token-value/);
  });

  it('persists HTTP status and latency into audit_events (GUD-006)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
      )
    );

    await paypalHttpRequest({
      method: 'GET',
      path: '/v2/invoicing/invoices/INV2-TEST',
      tokenProvider: async () => 'token',
      apiBaseUrl: 'https://api-m.sandbox.paypal.com',
    });

    const rows = testDb
      .prepare("SELECT * FROM audit_events WHERE event_type = 'INTEGRATION_HTTP_CALL'")
      .all() as Array<{ summary: string; payload_json: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.summary).toContain('PAYPAL GET /v2/invoicing/invoices/INV2-TEST');
    expect(rows[0]!.summary).toContain('HTTP 200');
    const payload = JSON.parse(rows[0]!.payload_json);
    expect(payload.provider).toBe('PAYPAL');
    expect(payload.latency_ms).toBeGreaterThanOrEqual(0);
  });

  it('records failed network calls as status 0 without leaking credentials', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('socket failed with Bearer A21AA-leaked'))
    );

    await expect(
      paypalHttpRequest({
        method: 'POST',
        path: '/v2/checkout/orders',
        tokenProvider: async () => 'A21AA-leaked',
        apiBaseUrl: 'https://api-m.sandbox.paypal.com',
      })
    ).rejects.toThrow(/network error/i);

    const rows = testDb
      .prepare("SELECT * FROM audit_events WHERE event_type = 'INTEGRATION_HTTP_CALL'")
      .all() as Array<{ payload_json: string }>;
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0]!.payload_json).status).toBe(0);
    expect(rows[0]!.payload_json).not.toContain('A21AA-leaked');
  });
});

describe('SEC-008 redaction', () => {
  it('redacts bearer tokens, authorization headers, and API keys', () => {
    const input =
      'Authorization: Bearer A21AA-raw-token x-api-key=ch3-secret-key Bearer abc.def.ghi';
    const output = redactSecrets(input);
    expect(output).not.toContain('A21AA-raw-token');
    expect(output).not.toContain('ch3-secret-key');
    expect(output).not.toContain('abc.def.ghi');
    expect(output).toContain('[REDACTED]');
  });

  it('redacts credential-bearing headers', () => {
    expect(
      redactHeaders({
        Authorization: 'Bearer A21AA-token',
        'x-api-key': 'ch3-secret',
        'Content-Type': 'application/json',
      })
    ).toEqual({
      Authorization: '[REDACTED]',
      'x-api-key': '[REDACTED]',
      'Content-Type': 'application/json',
    });
  });
});
