import { prisma } from './db.js';

export const SETTING_KEYS = {
  DELIVERY_FEE_PAISE: 'DELIVERY_FEE_PAISE',
  FREE_DELIVERY_THRESHOLD_PAISE: 'FREE_DELIVERY_THRESHOLD_PAISE',
  COD_LIMIT_PAISE: 'COD_LIMIT_PAISE',
  ONLINE_PAYMENTS_ENABLED: 'ONLINE_PAYMENTS_ENABLED',
} as const;

/**
 * Checks whether online payments (UPI, cards via Razorpay) are enabled.
 * Returns false if process.env.DISABLE_ONLINE_PAYMENTS is 'true' or if
 * ONLINE_PAYMENTS_ENABLED in the settings table is set to 0.
 */
export async function isOnlinePaymentsEnabled(): Promise<boolean> {
  // 1. Emergency host-level environment variable override
  if (process.env.DISABLE_ONLINE_PAYMENTS === 'true') {
    return false;
  }

  // 2. Dynamic database setting
  try {
    const setting = await prisma.setting.findUnique({
      where: { key: SETTING_KEYS.ONLINE_PAYMENTS_ENABLED },
    });
    if (!setting) {
      return true; // Default enabled
    }
    return setting.value_paise !== 0;
  } catch (error) {
    console.error('[Settings] Error checking ONLINE_PAYMENTS_ENABLED:', error);
    return true;
  }
}

/**
 * Updates the online payments kill-switch state in the settings table.
 */
export async function setOnlinePaymentsEnabled(enabled: boolean): Promise<void> {
  await prisma.setting.upsert({
    where: { key: SETTING_KEYS.ONLINE_PAYMENTS_ENABLED },
    update: {
      value_paise: enabled ? 1 : 0,
    },
    create: {
      key: SETTING_KEYS.ONLINE_PAYMENTS_ENABLED,
      value_paise: enabled ? 1 : 0,
      is_dummy: false,
    },
  });
}

/**
 * Retrieves public checkout settings.
 */
export async function getPublicSettings() {
  const [deliveryFee, freeThreshold, codLimit, onlineEnabled] = await Promise.all([
    prisma.setting.findUnique({ where: { key: SETTING_KEYS.DELIVERY_FEE_PAISE } }),
    prisma.setting.findUnique({ where: { key: SETTING_KEYS.FREE_DELIVERY_THRESHOLD_PAISE } }),
    prisma.setting.findUnique({ where: { key: SETTING_KEYS.COD_LIMIT_PAISE } }),
    isOnlinePaymentsEnabled(),
  ]);

  return {
    serviceablePincode: '411001',
    deliveryFeePaise: deliveryFee?.value_paise ?? 2000,
    freeDeliveryThresholdPaise: freeThreshold?.value_paise ?? 30000,
    codLimitPaise: codLimit?.value_paise ?? 100000,
    codMaxLimitPaise: codLimit?.value_paise ?? 100000,
    onlinePaymentsEnabled: onlineEnabled,
  };
}
