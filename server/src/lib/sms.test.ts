import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isDevOtpEnabled, sendOtpSms } from './sms.js';

describe('SMS & OTP Service', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('Enables dev OTP in development environment by default', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.ENABLE_DEV_OTP;
    expect(isDevOtpEnabled()).toBe(true);
  });

  it('Disables dev OTP in production environment by default', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.ENABLE_DEV_OTP;
    expect(isDevOtpEnabled()).toBe(false);
  });

  it('Explicit ENABLE_DEV_OTP=false overrides development environment', () => {
    process.env.NODE_ENV = 'development';
    process.env.ENABLE_DEV_OTP = 'false';
    expect(isDevOtpEnabled()).toBe(false);
  });

  it('Explicit ENABLE_DEV_OTP=true enables dev OTP', () => {
    process.env.NODE_ENV = 'production';
    process.env.ENABLE_DEV_OTP = 'true';
    expect(isDevOtpEnabled()).toBe(true);
  });

  it('Returns debugOtp when dev OTP is enabled', async () => {
    process.env.ENABLE_DEV_OTP = 'true';
    const result = await sendOtpSms('9876543210', '123456');
    expect(result.success).toBe(true);
    expect(result.debugOtp).toBe('123456');
  });

  it('Omits debugOtp when dev OTP is disabled (production simulation)', async () => {
    process.env.ENABLE_DEV_OTP = 'false';
    const result = await sendOtpSms('9876543210', '123456');
    expect(result.success).toBe(true);
    expect(result.debugOtp).toBeUndefined();
  });
});
