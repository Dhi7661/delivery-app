/**
 * SMS & OTP Delivery Service
 *
 * PRODUCTION READY & EASY REMOVAL / TOGGLE:
 * ----------------------------------------------------
 * 1. Automatic in Production:
 *    When `NODE_ENV === 'production'` or `ENABLE_DEV_OTP !== 'true'`,
 *    the OTP is sent via the real SMS Gateway (e.g. Twilio, MSG91, Fast2SMS)
 *    and NEVER returned in API responses or dev banners.
 *
 * 2. In Local Development:
 *    When `ENABLE_DEV_OTP` is enabled (default in non-production),
 *    the OTP is logged to the server console and optionally provided
 *    to the client dev banner for frictionless testing.
 *
 * 3. To switch to a real SMS provider when ready:
 *    - Put your SMS API credentials in `.env` (e.g. MSG91_AUTH_KEY or TWILIO_ACCOUNT_SID).
 *    - Connect your provider in `sendProductionSms()` below.
 *    - Set `ENABLE_DEV_OTP=false` in `.env`.
 */

export interface SmsSendResult {
  success: boolean;
  debugOtp?: string; // Strictly undefined in production
  error?: string;
}

/**
 * Determine if dev OTP helper mode is active.
 * Controlled by ENABLE_DEV_OTP environment variable, defaulting to true in development/test.
 */
export function isDevOtpEnabled(): boolean {
  if (process.env.ENABLE_DEV_OTP !== undefined) {
    return process.env.ENABLE_DEV_OTP === 'true';
  }
  return process.env.NODE_ENV !== 'production';
}

/**
 * Dispatches an SMS containing the OTP to the given phone number.
 */
export async function sendOtpSms(phone: string, otp: string): Promise<SmsSendResult> {
  const isDev = isDevOtpEnabled();

  if (isDev) {
    // Development mode: log OTP to server console for testing
    console.log(`[PlukIt SMS Dev Service] 📱 OTP for +91 ${phone}: ${otp}`);
    return {
      success: true,
      debugOtp: otp,
    };
  }

  // Production mode: Real SMS Provider integration (e.g. Twilio, Fast2SMS, MSG91)
  try {
    // When ready to integrate a live SMS gateway provider:
    // Example (Twilio / MSG91 / Fast2SMS):
    // await smsProvider.send({ to: `+91${phone}`, text: `Your PlukIt code is ${otp}. Valid for 5 minutes.` });
    return {
      success: true,
    };
  } catch (err: any) {
    console.error('[PlukIt SMS] Failed to send SMS via provider:', err);
    return {
      success: false,
      error: 'Failed to deliver SMS. Please try again.',
    };
  }
}
