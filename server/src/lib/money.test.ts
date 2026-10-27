import { describe, it, expect } from 'vitest';
import { paiseToRupees, formatPaiseToINR, parseRupeesToPaise } from './money.js';

describe('Money Utilities & parseRupeesToPaise (F07)', () => {
  it('"12.50" becomes 1250 paise', () => {
    expect(parseRupeesToPaise('12.50')).toBe(1250);
  });

  it('"12.5" becomes 1250 paise', () => {
    expect(parseRupeesToPaise('12.5')).toBe(1250);
  });

  it('"12" becomes 1200 paise', () => {
    expect(parseRupeesToPaise('12')).toBe(1200);
  });

  it('"0.75" becomes 75 paise', () => {
    expect(parseRupeesToPaise('0.75')).toBe(75);
  });

  it('"0.5" becomes 50 paise', () => {
    expect(parseRupeesToPaise('0.5')).toBe(50);
  });

  it('"12.505" is rejected with decimal error', () => {
    expect(() => parseRupeesToPaise('12.505')).toThrow(/at most 2 decimal places/);
  });

  it('Rejects negative numbers, non-numeric strings, and empty input', () => {
    expect(() => parseRupeesToPaise('-12.50')).toThrow();
    expect(() => parseRupeesToPaise('abc')).toThrow();
    expect(() => parseRupeesToPaise('')).toThrow();
    expect(() => parseRupeesToPaise('   ')).toThrow();
  });

  it('paiseToRupees converts integer paise to rupees', () => {
    expect(paiseToRupees(1250)).toBe(12.5);
    expect(paiseToRupees(100)).toBe(1);
    expect(() => paiseToRupees(12.5 as any)).toThrow();
  });

  it('formatPaiseToINR formats with rupee sign and Indian grouping', () => {
    const formatted = formatPaiseToINR(150000);
    expect(formatted).toContain('1,500.00');
  });
});
