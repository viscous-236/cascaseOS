/**
 * @file formatters.ts
 * @description Safe monetary and percentage formatting utilities for CascadeOS UI (REQ-002, PAT-003).
 */

export function formatMinorToUSD(minorUnits: number | null | undefined): string {
  if (minorUnits === null || minorUnits === undefined || isNaN(minorUnits)) {
    return '$0.00';
  }
  const dollars = minorUnits / 100;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(dollars);
}

export function formatMinorToPayPalValue(minorUnits: number): string {
  if (!Number.isInteger(minorUnits) || minorUnits < 0) throw new Error('PayPal amount must be a non-negative integer minor-unit value');
  return (minorUnits / 100).toFixed(2);
}

export function formatVariancePct(pct: number | null | undefined): string {
  if (pct === null || pct === undefined || isNaN(pct)) {
    return '0.00%';
  }
  const prefix = pct > 0 ? '+' : '';
  return `${prefix}${pct.toFixed(2)}%`;
}

export function truncateHash(hash: string | null | undefined, head = 10, tail = 8): string {
  if (!hash) return '—';
  if (hash.length <= head + tail + 3) return hash;
  return `${hash.slice(0, head)}…${hash.slice(-tail)}`;
}
