import { prisma } from './db.js';
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

/**
 * Retrieve the next atomic order number from the PostgreSQL database sequence.
 * Rule: Order numbers come from a database sequence, not from application memory.
 * Ensures strict concurrency safety and guarantees no duplicates even at the exact same millisecond.
 */
export async function getNextOrderNumber(date: Date = new Date()): Promise<string> {
  const result = await prisma.$queryRaw<Array<{ nextval: bigint }>>`
    SELECT nextval('order_number_seq') AS nextval
  `;
  const seq = Number(result[0].nextval);
  return generateOrderNumber(seq, date);
}
