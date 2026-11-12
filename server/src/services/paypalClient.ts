/**
 * @file paypalClient.ts
 * @description Typed PayPal REST transport generated from the official PayPal
 * Invoicing v2 and Orders v2 OpenAPI specifications via the APIMatic Context
 * Plugin / SDK generator workflow (ARC-006).
 *
 * The checked-in transport is kept intentionally small so it can be regenerated
 * from the APIMatic pipeline documented in `docs/apimatic.md` without changing
 * the service-level request/response contracts.
 *
 * Responsibilities:
 * - Attach OAuth2 bearer credentials and PayPal-Request-Id headers.
 * - Enforce a strict JSON response shape at every call site.
 * - Record HTTP status + latency into the audit ledger (GUD-006).
 * - Redact credentials from every emitted error (SEC-008).
 */

import { getPayPalAccessToken } from './paypalAuthService.js';
import { env } from '../config/env.js';
import { recordIntegrationHttpCall } from './integrationAudit.js';
import { redactSecrets } from '../utils/redaction.js';

export type PayPalHttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';
export type PayPalResponseType = 'json' | 'text' | 'arrayBuffer' | 'response';

export interface PayPalRequest<TBody = unknown> {
  method: PayPalHttpMethod;
  /** API-relative path, e.g. `/v2/checkout/orders`. */
  path: string;
  body?: TBody;
  /** PayPal idempotency key (SEC-004). */
  requestId?: string;
  accept?: string;
  responseType?: PayPalResponseType;
  /** Overrides the default merchant token provider (e.g. Invoicing scope). */
  tokenProvider?: () => Promise<string>;
  /** Overrides the sandbox base URL in tests. */
  apiBaseUrl?: string;
}

export interface PayPalResponse<T> {
  status: number;
  headers: Headers;
  body: T;
  latencyMs: number;
}

export class PayPalApiError extends Error {
  public readonly status: number;
  public readonly path: string;

  constructor(status: number, path: string, body: string) {
    super(
      redactSecrets(
        `PayPal API error: [${path}] returned HTTP ${status}: ${body}`
      )
    );
    this.name = 'PayPalApiError';
    this.status = status;
    this.path = path;
  }
}

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/**
 * Low-level request used by both the typed services and the live verifier.
 * The response Body is parsed according to `responseType`; `'response'` returns
 * the raw fetch Response for multipart/QR handling.
 */
export async function paypalFetch<T = unknown, TBody = unknown>(
  request: PayPalRequest<TBody>
): Promise<PayPalResponse<T>> {
  const tokenProvider = request.tokenProvider ?? getPayPalAccessToken;
  const baseUrl = request.apiBaseUrl ?? env.PAYPAL_API_BASE_URL;
  const url = `${baseUrl}${request.path}`;
  const token = await tokenProvider();

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Accept: request.accept ?? 'application/json',
    'PayPal-Partner-Attribution-Id': 'CascadeOS-Hackathon-2026',
  };
  if (request.requestId !== undefined) {
    headers['PayPal-Request-Id'] = request.requestId;
  }

  const init: RequestInit = { method: request.method, headers };
  if (request.body !== undefined) {
    init.body = JSON.stringify(request.body);
  }

  const startedAt = nowMs();
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (networkError) {
    const latencyMs = Math.round(nowMs() - startedAt);
    recordIntegrationHttpCall({
      provider: 'PAYPAL',
      method: request.method,
      path: request.path,
      status: 0,
      latencyMs,
      error: redactSecrets(String(networkError)),
    });
    throw new Error(
      redactSecrets(
        `PayPalClient: network error [${request.method} ${request.path}]: ${String(networkError)}`
      )
    );
  }

  const latencyMs = Math.round(nowMs() - startedAt);
  recordIntegrationHttpCall({
    provider: 'PAYPAL',
    method: request.method,
    path: request.path,
    status: response.status,
    latencyMs,
    ...(request.requestId !== undefined ? { requestId: request.requestId } : {}),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '(unreadable)');
    throw new PayPalApiError(response.status, request.path, errorBody);
  }

  let body: T;
  switch (request.responseType) {
    case 'response':
      body = response as unknown as T;
      break;
    case 'text':
      body = (await response.text()) as unknown as T;
      break;
    case 'arrayBuffer':
      body = (await response.arrayBuffer()) as unknown as T;
      break;
    case 'json':
    default:
      if (response.status === 204) {
        body = {} as T;
      } else {
        try {
          body = (await response.json()) as T;
        } catch {
          throw new Error(
            `PayPalClient: failed to parse JSON response from [${request.method} ${request.path}]`
          );
        }
      }
      break;
  }

  return { status: response.status, headers: response.headers, body, latencyMs };
}

/** Typed convenience wrapper for JSON PayPal APIs. */
export async function paypalHttpRequest<T, TBody = unknown>(
  request: PayPalRequest<TBody>
): Promise<PayPalResponse<T>> {
  return paypalFetch<T, TBody>({ ...request, responseType: request.responseType ?? 'json' });
}
