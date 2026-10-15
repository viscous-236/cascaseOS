/**
 * @file paypalAuthService.ts
 * @description Live PayPal Sandbox OAuth2 token client with in-memory expiry caching.
 *
 * Implements:
 * - REQ-003: Authenticate against POST /v1/oauth2/token with Basic Auth
 * - SEC-008: Never log or expose the bearer token or credentials
 *
 * Token caching strategy:
 * - Cache token in module-scoped variable after first fetch
 * - Refresh automatically when remaining TTL <= 60 seconds
 * - Thread-safe via a shared promise (no duplicate concurrent fetches)
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

// ---------------------------------------------------------------------------
// Module-scoped cache (never exported — SEC-008)
// ---------------------------------------------------------------------------

let _cachedToken: string | null = null;
/** Absolute epoch-ms when the cached token expires */
let _tokenExpiresAtMs = 0;
/** In-flight request guard — prevents concurrent duplicate fetches */
let _fetchInFlight: Promise<string> | null = null;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns a valid PayPal Sandbox OAuth2 Bearer token.
 *
 * Fetches a fresh token if the cache is empty or within 60 seconds of expiry.
 * Concurrent callers receive the same in-flight Promise to avoid duplicate
 * network requests.
 */
export async function getPayPalAccessToken(): Promise<string> {
  const nowMs = Date.now();
  const earlyRefreshThresholdMs = 60 * 1000; // 60 seconds

  // Return cached token if still valid with headroom
  if (_cachedToken !== null && nowMs < _tokenExpiresAtMs - earlyRefreshThresholdMs) {
    return _cachedToken;
  }

  // If a fetch is already in flight, wait for it
  if (_fetchInFlight !== null) {
    return _fetchInFlight;
  }

  // Start a new fetch and cache the promise
  _fetchInFlight = _fetchFreshToken().finally(() => {
    _fetchInFlight = null;
  });

  return _fetchInFlight;
}

/**
 * Clears the cached token. Useful in tests or after credential rotation.
 * Does NOT revoke the token at PayPal.
 */
export function clearPayPalTokenCache(): void {
  _cachedToken = null;
  _tokenExpiresAtMs = 0;
  _fetchInFlight = null;
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

/**
 * Executes the live OAuth2 token exchange against PayPal Sandbox.
 * Stores the result in module-scoped cache variables.
 */
async function _fetchFreshToken(): Promise<string> {
  const tokenUrl = `${env.PAYPAL_API_BASE_URL}/v1/oauth2/token`;

  // HTTP Basic Auth: base64(clientId:clientSecret) per PayPal spec
  const credentials = Buffer.from(
    `${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`
  ).toString('base64');

  let response: Response;
  try {
    response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: 'grant_type=client_credentials',
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

  // Cache the token — log only the status, never the token value (SEC-008)
  _cachedToken = payload.access_token;
  _tokenExpiresAtMs = Date.now() + payload.expires_in * 1000;

  console.log(
    `[PayPalAuth] Token refreshed. Expires in ${payload.expires_in}s. ` +
      `Cache valid until ${new Date(_tokenExpiresAtMs).toISOString()}`
  );

  return _cachedToken;
}
