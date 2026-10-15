/**
 * @file moneyAndHash.ts
 * @description Money conversion utilities and SHA-256 state fingerprint generator.
 *
 * Implements:
 * - REQ-002: Integer minor-unit arithmetic throughout; decimal conversion ONLY here
 * - REQ-008: Deterministic SHA-256 state fingerprint for approval binding
 * - PAT-002: Canonical fingerprint verification pattern
 * - PAT-003: Minor-Unit Value Object pattern
 *
 * RULES:
 * 1. `formatMinorToPayPalValue` is the ONLY place minor units → decimal string.
 * 2. `parsePayPalValueToMinor` is the ONLY place PayPal decimal string → minor units.
 * 3. `computeStateFingerprint` MUST produce identical hashes regardless of
 *    object key insertion order (canonical key sort enforced).
 */

import { createHash } from 'node:crypto';

// ===========================================================================
// MONEY CONVERSION (REQ-002, PAT-003)
// ===========================================================================

/**
 * Converts integer minor units to a PayPal-compatible decimal string.
 *
 * This is the ONLY permitted conversion point in the entire codebase.
 * Call this EXCLUSIVELY when building outbound PayPal REST request payloads.
 *
 * @example
 * formatMinorToPayPalValue(139600, 'USD') // → "1396.00"
 * formatMinorToPayPalValue(450000, 'USD') // → "4500.00"
 * formatMinorToPayPalValue(34900, 'USD')  // → "349.00"
 */
export function formatMinorToPayPalValue(
  minorUnits: number,
  currency: string
): string {
  if (!Number.isInteger(minorUnits)) {
    throw new TypeError(
      `formatMinorToPayPalValue: minorUnits must be an integer, received ${minorUnits}`
    );
  }
  if (minorUnits < 0) {
    throw new RangeError(
      `formatMinorToPayPalValue: minorUnits must be >= 0, received ${minorUnits}`
    );
  }

  // All supported currencies use 2 decimal places (USD, INR, etc.)
  // Extend this map if supporting zero-decimal currencies (JPY, KRW)
  const decimalPlaces = getDecimalPlaces(currency);
  const divisor = Math.pow(10, decimalPlaces);
  const major = Math.floor(minorUnits / divisor);
  const minor = minorUnits % divisor;

  return `${major}.${String(minor).padStart(decimalPlaces, '0')}`;
}

/**
 * Parses a PayPal decimal string (e.g., from API responses) into integer minor units.
 *
 * This is the ONLY permitted parsing point for incoming PayPal monetary values.
 * Use when reading back amounts from PayPal API responses.
 *
 * @example
 * parsePayPalValueToMinor("1396.00", 'USD') // → 139600
 * parsePayPalValueToMinor("4500.00", 'USD') // → 450000
 * parsePayPalValueToMinor("349.00", 'USD')  // → 34900
 */
export function parsePayPalValueToMinor(
  valueStr: string,
  currency: string
): number {
  const trimmed = valueStr.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new TypeError(
      `parsePayPalValueToMinor: invalid decimal string "${valueStr}"`
    );
  }

  const decimalPlaces = getDecimalPlaces(currency);
  const [wholePart = '0', fracPart = ''] = trimmed.split('.');
  const paddedFrac = fracPart.padEnd(decimalPlaces, '0').slice(0, decimalPlaces);

  const result = parseInt(wholePart, 10) * Math.pow(10, decimalPlaces) + parseInt(paddedFrac, 10);

  if (!Number.isInteger(result) || result < 0) {
    throw new RangeError(
      `parsePayPalValueToMinor: computed invalid result ${result} for input "${valueStr}"`
    );
  }

  return result;
}

/**
 * Converts integer minor units to a human-readable display string.
 * For UI display only — NOT for PayPal API payloads (use formatMinorToPayPalValue).
 *
 * @example
 * minorUnitsToDisplayString(139600, 'USD') // → "$1,396.00"
 */
export function minorUnitsToDisplayString(
  minorUnits: number,
  currency: string
): string {
  const decimalStr = formatMinorToPayPalValue(minorUnits, currency);
  const value = parseFloat(decimalStr);

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Returns the number of decimal places for a given ISO 4217 currency code.
 * Defaults to 2 for all supported currencies in CascadeOS (USD, INR).
 */
function getDecimalPlaces(currency: string): number {
  const zeroDecimalCurrencies = new Set(['JPY', 'KRW', 'VND', 'CLP']);
  return zeroDecimalCurrencies.has(currency.toUpperCase()) ? 0 : 2;
}

// ===========================================================================
// SHA-256 STATE FINGERPRINT (REQ-008, PAT-002)
// ===========================================================================

/**
 * Payload shape for the canonical CascadeOS state fingerprint.
 * All fields are mandatory — the exact same fields must be present on both
 * proposal generation and pre-execution re-verification (REQ-009, REQ-010).
 */
export interface StateFingerprintPayload {
  projectId: string;
  blockedTaskId: string;
  promotedTaskId: string;
  invoiceId: string;
  unlockAmountMinor: number;
  channel3ProductId: string;
  supplierTotalMinor: number;
  currency: string;
}

/**
 * Computes a deterministic SHA-256 fingerprint over the canonical JSON
 * serialization of the given payload.
 *
 * DETERMINISM GUARANTEE: Object keys are sorted alphabetically before
 * JSON serialization so the hash is identical regardless of the order
 * in which properties were set on the input object (PAT-002).
 *
 * @example
 * const fp = computeStateFingerprint({
 *   projectId: 'proj_apex_clinic_01',
 *   blockedTaskId: 'task_phase_2_displays',
 *   promotedTaskId: 'task_phase_3_networking',
 *   invoiceId: 'INV2-ABCD-1234-EFGH-5678',
 *   unlockAmountMinor: 139600,
 *   channel3ProductId: 'ch3_lg_32un880b',
 *   supplierTotalMinor: 139600,
 *   currency: 'USD',
 * });
 * // → "sha256:<64-hex-char-hash>"
 */
export function computeStateFingerprint(
  payload: StateFingerprintPayload
): string {
  const canonical = canonicalJsonStringify(payload);
  const hash = createHash('sha256').update(canonical, 'utf-8').digest('hex');
  return `sha256:${hash}`;
}

/**
 * Verifies that a newly computed fingerprint matches a previously approved one.
 * Returns true if they match, false if the state has changed (STALE_FINGERPRINT_APPROVAL).
 */
export function verifyStateFingerprint(
  currentPayload: StateFingerprintPayload,
  approvedFingerprint: string
): boolean {
  const recomputed = computeStateFingerprint(currentPayload);
  return recomputed === approvedFingerprint;
}

// ===========================================================================
// INTERNAL: Canonical JSON Serialization
// ===========================================================================

/**
 * Produces a deterministic JSON string by recursively sorting object keys.
 * This ensures `computeStateFingerprint` is order-independent (PAT-002).
 */
function canonicalJsonStringify(value: unknown): string {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return JSON.stringify(value);
  }
  const sorted = Object.keys(value as Record<string, unknown>)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = (value as Record<string, unknown>)[key];
      return acc;
    }, {});
  return JSON.stringify(sorted);
}

// ===========================================================================
// PRICE VARIANCE CALCULATION
// ===========================================================================

/**
 * Calculates percentage variance of a proposed unit price vs. historical baseline.
 * Used by policyEngine to evaluate VENDOR_PRICE_CREEP_EXCEEDED.
 *
 * Returns a positive number for price increases, negative for decreases.
 * Result is rounded to 2 decimal places.
 *
 * @example
 * calcVariancePct(49000, 38000) // → 28.95  (incumbent $490 vs $380 baseline)
 * calcVariancePct(34900, 38000) // → -8.16  (Channel3 $349 — a saving)
 */
export function calcVariancePct(
  proposedUnitPriceMinor: number,
  historicalUnitPriceMinor: number
): number {
  if (historicalUnitPriceMinor === 0) {
    throw new RangeError(
      'calcVariancePct: historicalUnitPriceMinor cannot be 0 (division by zero)'
    );
  }
  const variance =
    ((proposedUnitPriceMinor - historicalUnitPriceMinor) /
      historicalUnitPriceMinor) *
    100;
  return Number(variance.toFixed(2));
}

/**
 * Calculates savings in minor units between incumbent quote and proposed quote.
 * Returns 0 if the proposed quote is MORE expensive (no savings).
 *
 * @example
 * calcSavingsMinor(196000, 139600) // → 56400  ($564.00 savings)
 */
export function calcSavingsMinor(
  incumbentTotalMinor: number,
  proposedTotalMinor: number
): number {
  return Math.max(0, incumbentTotalMinor - proposedTotalMinor);
}
