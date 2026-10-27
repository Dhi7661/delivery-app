import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from './db.js';
import {
  getSetting,
  calculateDeliveryFee,
  isCodAllowed,
  validateSellingPrice,
} from './pricing.js';

describe('F01: Settings and pricing rules', () => {
  beforeAll(async () => {
    // Ensure the 3 dummy settings exist in the database for the test suite
    await prisma.setting.upsert({
      where: { key: 'DELIVERY_FEE_PAISE' },
      update: { value_paise: 2000, is_dummy: true },
      create: { key: 'DELIVERY_FEE_PAISE', value_paise: 2000, is_dummy: true },
    });
    await prisma.setting.upsert({
      where: { key: 'FREE_DELIVERY_THRESHOLD_PAISE' },
      update: { value_paise: 30000, is_dummy: true },
      create: { key: 'FREE_DELIVERY_THRESHOLD_PAISE', value_paise: 30000, is_dummy: true },
    });
    await prisma.setting.upsert({
      where: { key: 'COD_LIMIT_PAISE' },
      update: { value_paise: 100000, is_dummy: true },
      create: { key: 'COD_LIMIT_PAISE', value_paise: 100000, is_dummy: true },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('Subtotal below the threshold: fee applies.', async () => {
    // Threshold is 30,000 paise (₹300), delivery fee is 2,000 paise (₹20)
    const feeBelowThreshold = await calculateDeliveryFee(29999);
    expect(feeBelowThreshold).toBe(2000);

    const feeForZeroSubtotal = await calculateDeliveryFee(0);
    expect(feeForZeroSubtotal).toBe(2000);

    const feeForSmallBasket = await calculateDeliveryFee(15000); // ₹150
    expect(feeForSmallBasket).toBe(2000);
  });

  it('Subtotal exactly at the threshold: fee is zero.', async () => {
    // Exactly at threshold: 30,000 paise (₹300) -> delivery fee is 0
    const feeAtThreshold = await calculateDeliveryFee(30000);
    expect(feeAtThreshold).toBe(0);

    // Above threshold: 45,000 paise (₹450) -> delivery fee is 0
    const feeAboveThreshold = await calculateDeliveryFee(45000);
    expect(feeAboveThreshold).toBe(0);
  });

  it('Total exactly at the COD limit: allowed. One paisa above: refused.', async () => {
    // COD limit is 100,000 paise (₹1,000)
    // Exactly at COD limit: allowed
    const atLimit = await isCodAllowed(100000);
    expect(atLimit).toBe(true);

    // One paisa below limit: allowed
    const belowLimit = await isCodAllowed(99999);
    expect(belowLimit).toBe(true);

    // One paisa above limit (100,001 paise): refused
    const onePaisaAbove = await isCodAllowed(100001);
    expect(onePaisaAbove).toBe(false);

    // Well above limit (150,000 paise): refused
    const wellAbove = await isCodAllowed(150000);
    expect(wellAbove).toBe(false);
  });

  it('Selling price equal to MRP: accepted. One paisa above MRP: rejected.', () => {
    const mrpPaise = 15000; // ₹150

    // Equal to MRP: accepted
    const equalResult = validateSellingPrice(mrpPaise, 15000);
    expect(equalResult.valid).toBe(true);
    expect(equalResult.error).toBeUndefined();

    // Discounted below MRP: accepted
    const discountedResult = validateSellingPrice(mrpPaise, 14000);
    expect(discountedResult.valid).toBe(true);

    // One paisa above MRP (15,001 paise): rejected
    const onePaisaAbove = validateSellingPrice(mrpPaise, 15001);
    expect(onePaisaAbove.valid).toBe(false);
    expect(onePaisaAbove.error).toContain('Violation of Legal Metrology');

    // Well above MRP: rejected
    const wellAbove = validateSellingPrice(mrpPaise, 18000);
    expect(wellAbove.valid).toBe(false);
  });

  it('Missing setting: throws an error.', async () => {
    // Attempting to retrieve an unconfigured key must throw an error, never fall back
    await expect(getSetting('NON_EXISTENT_SETTING_KEY')).rejects.toThrow(
      /Missing setting: 'NON_EXISTENT_SETTING_KEY'/
    );
  });
});
