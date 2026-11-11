/**
 * @file paypalAuthService.ts
 * @description Live PayPal Sandbox OAuth2 token client with in-memory expiry caching.
 *
 * Implements:
 * - REQ-003: Authenticate against POST /v1/oauth2/token with Basic Auth
 * - SEC-008: Never log or expose the bearer token or credentials
 *
 * PayPal does not include every enabled app feature in the default
 * `client_credentials` scope list. Invoicing must be requested explicitly,
 * otherwise `/v2/invoicing/*` returns NOT_AUTHORIZED even when the feature is
 * enabled on the app.
 *
 * Token caching strategy:
 * - Cache tokens in module-scoped state after the first fetch
 * - Refresh automatically when remaining TTL <= 60 seconds
 * - Thread-safe via a shared promise per scope (no duplicate concurrent fetches)
 * - Keep the default and Invoicing-scoped tokens in separate caches
 */

import { env } from '../config/env.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PayPalTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number; // seconds until expiry
  scope: string;
}

interface CachedToken {
  token: string;
  expiresAtMs: number;
}

interface FreshToken {
  accessToken: string;
  expiresAtMs: number;
}

// ---------------------------------------------------------------------------
// Scope constants
// ---------------------------------------------------------------------------

export const PAYPAL_INVOICING_SCOPE = 'https://uri.paypal.com/services/invoicing';

const DEFAULT_TOKEN_CACHE_KEY = 'default';

// ---------------------------------------------------------------------------
// Module-scoped caches (never exported — SEC-008)
// ---------------------------------------------------------------------------

const _tokenCache = new Map<string, CachedToken>();
const _fetchInFlight = new Map<string, Promise<string>>();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns a valid PayPal Sandbox OAuth2 Bearer token for the app's default
 * scope set (Orders, Payouts, Webhooks, etc.).
 *
 * Fetches a fresh token if the cache is empty or within 60 seconds of expiry.
 * Concurrent callers receive the same in-flight Promise to avoid duplicate
 * network requests.
 */
export async function getPayPalAccessToken(): Promise<string> {
  return _getToken(DEFAULT_TOKEN_CACHE_KEY);
}

/**
 * Returns a PayPal Sandbox OAuth2 Bearer token that explicitly includes the
 * Invoicing scope. Use this for every `/v2/invoicing/*` request.
 */
export async function getPayPalInvoicingAccessToken(): Promise<string> {
  return _getToken(PAYPAL_INVOICING_SCOPE, PAYPAL_INVOICING_SCOPE);
}

/**
 * Clears all cached tokens. Useful in tests or after credential rotation.
 * Does NOT revoke the tokens at PayPal.
 */
export function clearPayPalTokenCache(): void {
  _tokenCache.clear();
  _fetchInFlight.clear();
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

async function _getToken(cacheKey: string, scope?: string): Promise<string> {
  const nowMs = Date.now();
  const earlyRefreshThresholdMs = 60 * 1000; // 60 seconds

  const cached = _tokenCache.get(cacheKey);
  if (cached !== undefined && nowMs < cached.expiresAtMs - earlyRefreshThresholdMs) {
    return cached.token;
  }

  // If a fetch is already in flight for this scope, wait for it
  const inFlight = _fetchInFlight.get(cacheKey);
  if (inFlight !== undefined) {
    return inFlight;
  }

  const pending = _fetchFreshToken(scope)
    .then(({ accessToken, expiresAtMs }) => {
      _tokenCache.set(cacheKey, { token: accessToken, expiresAtMs });
      return accessToken;
    })
    .finally(() => {
      _fetchInFlight.delete(cacheKey);
    });

  _fetchInFlight.set(cacheKey, pending);
  return pending;
}

/**
 * Executes the live OAuth2 token exchange against PayPal Sandbox.
 * When a scope is supplied, it is explicitly requested; otherwise PayPal
 * returns the app's default scope set.
 */
async function _fetchFreshToken(scope?: string): Promise<FreshToken> {
  const tokenUrl = `${env.PAYPAL_API_BASE_URL}/v1/oauth2/token`;

  // HTTP Basic Auth: base64(clientId:clientSecret) per PayPal spec
  const credentials = Buffer.from(
    `${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`
  ).toString('base64');

  const body = new URLSearchParams({ grant_type: 'client_credentials' });
  if (scope !== undefined) {
    body.set('scope', scope);
  }

  let response: Response;
  try {
    response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: body.toString(),
    });
  } catch (networkError) {
    throw new Error(
      `PayPalAuthService: network error fetching token from ${tokenUrl}: ${String(networkError)}`
    );
  }

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '(unreadable)');
    throw new Error(
      `PayPalAuthService: token endpoint returned HTTP ${response.status} — ${errorBody}`
    );
  }

  let payload: PayPalTokenResponse;
  try {
    payload = (await response.json()) as PayPalTokenResponse;
  } catch {
    throw new Error('PayPalAuthService: failed to parse token response as JSON');
  }

  if (!payload.access_token || typeof payload.expires_in !== 'number') {
    throw new Error(
      'PayPalAuthService: token response missing access_token or expires_in'
    );
  }

  const expiresAtMs = Date.now() + payload.expires_in * 1000;

  // Log only lifecycle metadata, never the token value (SEC-008)
  console.log(
    `[PayPalAuth] Token refreshed${scope !== undefined ? ` (${scope})` : ''}. ` +
      `Expires in ${payload.expires_in}s. ` +
      `Cache valid until ${new Date(expiresAtMs).toISOString()}`
  );

  return { accessToken: payload.access_token, expiresAtMs };
}
