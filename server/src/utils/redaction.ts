/**
 * @file redaction.ts
 * @description Central secret-redaction helpers (SEC-008).
 *
 * Every log line, error message, or persisted payload that may contain
 * credentials must pass through these helpers before leaving the process.
 */

const REDACTED = '[REDACTED]';

const SECRET_PATTERNS: Array<[RegExp, string]> = [
  // Authorization: Bearer <token>
  [/(authorization\s*[:=]\s*)(bearer\s+)?[^\s,;"'}]+/gi, `$1$2${REDACTED}`],
  // Any standalone Bearer token
  [/(bearer\s+)[A-Za-z0-9._~+/=-]+/gi, `$1${REDACTED}`],
  // PayPal OAuth2 access tokens
  [/\bA21AA[A-Za-z0-9._~+/=-]+/g, REDACTED],
  // JWTs
  [/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, REDACTED],
  // JSON/query style secrets
  [
    /((?:api[-_]?key|client[-_]?secret|access[-_]?token|refresh[-_]?token|password)\s*["']?\s*[:=]\s*["']?)[^"'\s,}&]+/gi,
    `$1${REDACTED}`,
  ],
];

/** Redacts Authorization headers, bearer tokens, and raw API keys from a string. */
export function redactSecrets(input: string): string {
  let output = input;
  for (const [pattern, replacement] of SECRET_PATTERNS) {
    output = output.replace(pattern, replacement);
  }
  return output;
}

/** Returns a copy of an HTTP header map with credential-bearing values redacted. */
export function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === 'authorization' || key.toLowerCase() === 'x-api-key') {
      result[key] = REDACTED;
    } else {
      result[key] = redactSecrets(value);
    }
  }
  return result;
}
