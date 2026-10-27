import { prisma } from './db.js';

/**
 * Pricing Rules & Legal Metrology Implementation (F01)
 * All monetary amounts are strictly integer paise.
 */

/**
 * Retrieve a setting value in paise by key from the database.
 * Rule: A missing setting throws an error. It must never fall back to a default silently.
 */
export async function getSetting(key: string): Promise<number> {
  const setting = await prisma.setting.findUnique({
    where: { key },
  });

  if (!setting) {
    throw new Error(`Missing setting: '${key}' was not found in the settings table.`);
  }

  if (!Number.isInteger(setting.value_paise)) {
    throw new Error(`Invalid setting: '${key}' value must be an integer number of paise.`);
  }

  return setting.value_paise;
}

/**
 * Validate customer selling price against printed MRP.
 * Rules:
 * - A selling price equal to MRP is accepted.
 * - A selling price above MRP is rejected.
 */
export function validateSellingPrice(
  mrp_paise: number,
  selling_paise: number
): { valid: boolean; error?: string } {
  if (!Number.isInteger(mrp_paise) || mrp_paise <= 0) {
    return { valid: false, error: 'MRP must be a positive integer in paise.' };
  }

  if (!Number.isInteger(selling_paise) || selling_paise <= 0) {
    return { valid: false, error: 'Selling price must be a positive integer in paise.' };
  }

  if (selling_paise > mrp_paise) {
    return {
      valid: false,
      error: `Selling price (${selling_paise} paise) exceeds printed MRP (${mrp_paise} paise). Violation of Legal Metrology.`,
    };
  }

  return { valid: true };
}

/**
 * Calculate the delivery fee based on order subtotal in paise.
 * Rules:
 * - Delivery fee is 0 when the subtotal is at or above FREE_DELIVERY_THRESHOLD_PAISE.
 * - Otherwise the fee is DELIVERY_FEE_PAISE.
 */
export async function calculateDeliveryFee(subtotal_paise: number): Promise<number> {
  if (!Number.isInteger(subtotal_paise) || subtotal_paise < 0) {
    throw new Error(`Subtotal must be a non-negative integer in paise, received: ${subtotal_paise}`);
  }

  const freeThresholdPaise = await getSetting('FREE_DELIVERY_THRESHOLD_PAISE');
  const deliveryFeePaise = await getSetting('DELIVERY_FEE_PAISE');

  if (subtotal_paise >= freeThresholdPaise) {
    return 0;
  }

  return deliveryFeePaise;
}

/**
 * Determine whether Cash on Delivery (COD) is allowed for an order total in paise.
 * Rules:
 * - COD is allowed when total_paise <= COD_LIMIT_PAISE.
 * - COD is refused when total_paise > COD_LIMIT_PAISE.
 */
export async function isCodAllowed(total_paise: number): Promise<boolean> {
  if (!Number.isInteger(total_paise) || total_paise < 0) {
    throw new Error(`Total must be a non-negative integer in paise, received: ${total_paise}`);
  }

  const codLimitPaise = await getSetting('COD_LIMIT_PAISE');
  return total_paise <= codLimitPaise;
}
