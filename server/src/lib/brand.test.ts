import { describe, it, expect } from 'vitest';
import { BRAND_NAME, BRAND_PREFIX, SUPPORT_EMAIL } from './brand.js';
import { generateOrderNumber } from './order.js';

describe('Brand Constants', () => {
  it('should have a non-empty BRAND_NAME', () => {
    expect(BRAND_NAME).toBeDefined();
    expect(BRAND_NAME.trim().length).toBeGreaterThan(0);
    expect(BRAND_NAME).toBe('PlukIt');
  });

  it('should have a non-empty BRAND_PREFIX', () => {
    expect(BRAND_PREFIX).toBeDefined();
    expect(BRAND_PREFIX.trim().length).toBeGreaterThan(0);
    expect(BRAND_PREFIX).toBe('PLUK');
  });

  it('should have a valid SUPPORT_EMAIL', () => {
    expect(SUPPORT_EMAIL).toBeDefined();
    expect(SUPPORT_EMAIL).toMatch(/^[\w.-]+@[\w.-]+\.\w+$/);
  });
});

describe('Order Number Generator', () => {
  it('should use BRAND_PREFIX in generated order numbers', () => {
    const orderNo = generateOrderNumber(1, new Date('2026-01-01'));
    expect(orderNo.startsWith(`${BRAND_PREFIX}-`)).toBe(true);
    expect(orderNo).toBe('PLUK-2026-000001');
  });

  it('should pad order sequence to 6 digits', () => {
    const orderNo = generateOrderNumber(123, new Date('2026-10-27'));
    expect(orderNo).toBe('PLUK-2026-000123');
  });

  it('should match the standard order number format regex', () => {
    const orderNo = generateOrderNumber(42);
    const regex = new RegExp(`^${BRAND_PREFIX}-\\d{4}-\\d{6}$`);
    expect(orderNo).toMatch(regex);
  });

  it('should throw an error for invalid sequence numbers', () => {
    expect(() => generateOrderNumber(0)).toThrow();
    expect(() => generateOrderNumber(-5)).toThrow();
    expect(() => generateOrderNumber(1.5)).toThrow();
  });
});
