import { BRAND_PREFIX } from './brand.js';

/**
 * Generate human-friendly sequential order number.
 * Format: [BRAND_PREFIX]-[YYYY]-[000001] (e.g. PLUK-2026-000001)
 *
 * @param sequence Integer sequential order counter
 * @param date Optional date to use for year (defaults to current date)
 */
export function generateOrderNumber(sequence: number, date: Date = new Date()): string {
  if (!Number.isInteger(sequence) || sequence <= 0) {
    throw new Error(`Order sequence must be a positive integer, received: ${sequence}`);
  }

  const year = date.getFullYear();
  const paddedSequence = String(sequence).padStart(6, '0');
  return `${BRAND_PREFIX}-${year}-${paddedSequence}`;
}
