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
