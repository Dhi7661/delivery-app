/**
 * Money formatting helper for displaying integer paise as Rupees (₹)
 * Always expects an integer number of paise.
 * ₹1 = 100 paise.
 */
export function formatPaise(paise: number): string {
  if (!Number.isInteger(paise)) {
    throw new TypeError(`Expected integer paise, got ${paise}`);
  }
  const rupees = paise / 100;
  if (paise % 100 === 0) {
    return `₹${rupees.toLocaleString('en-IN')}`;
  }
  return `₹${rupees.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
