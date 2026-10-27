/**
 * Money utilities adhering strictly to the Integer Paise Rule.
 * ₹1 = 100 paise. Money is always represented and calculated as integer paise.
 */

export function paiseToRupees(paise: number): number {
  if (!Number.isInteger(paise)) {
    throw new Error(`Paise amount must be an integer, received: ${paise}`);
  }
  return paise / 100;
}

export function formatPaiseToINR(paise: number): string {
  const rupees = paiseToRupees(paise);
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rupees);
}

export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

/**
 * Convert rupee text string to integer paise with pure integer math.
 * Accepts at most two decimal places. Rejects anything else.
 * Examples:
 *   "12.50"  -> 1250
 *   "12.5"   -> 1250
 *   "12"     -> 1200
 *   "12.505" -> throws Error
 */
export function parseRupeesToPaise(input: string): number {
  if (typeof input !== 'string') {
    throw new Error(`Expected rupee amount as string, received: ${typeof input}`);
  }

  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error('Rupee amount cannot be empty');
  }

  // Regex strictly allows whole numbers or numbers with 1 or 2 decimals (e.g. "12", "12.5", "12.50")
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    throw new Error(`Invalid rupee amount '${trimmed}': must be a positive number with at most 2 decimal places`);
  }

  const [wholeStr, fracStr] = trimmed.split('.');
  const whole = parseInt(wholeStr, 10);
  const frac = fracStr ? parseInt(fracStr.padEnd(2, '0'), 10) : 0;

  return whole * 100 + frac;
}

