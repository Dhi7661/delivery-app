'use client';

import React from 'react';

interface DevOtpBannerProps {
  otp: string | null;
  onAutoFill: (code: string) => void;
}

/**
 * ============================================================================
 * DEV-ONLY OTP HELPER BANNER
 * ============================================================================
 * Displays the 6-digit verification code and an "Auto-fill" button during
 * local development and testing without needing a third-party SMS gateway.
 *
 * SAFETY IN PRODUCTION:
 * - Automatically completely hidden whenever NODE_ENV === 'production' OR
 *   whenever the backend server omits `debugOtp` (e.g. ENABLE_DEV_OTP=false).
 *
 * HOW TO EASILY REMOVE WHEN READY FOR PRODUCTION:
 * Option A (Zero code change):
 *   Deploy with `NODE_ENV=production` or set `ENABLE_DEV_OTP=false` on backend.
 *   The banner is guaranteed never to appear or expose codes.
 *
 * Option B (Clean permanent removal):
 *   1. Delete this file: `client/components/DevOtpBanner.tsx`
 *   2. In `client/app/account/page.tsx`, delete the `<DevOtpBanner ... />` line.
 * ============================================================================
 */
export default function DevOtpBanner({ otp, onAutoFill }: DevOtpBannerProps) {
  // If running in production or no dev OTP was provided by server, do not render
  if (process.env.NODE_ENV === 'production' || !otp) {
    return null;
  }

  return (
    <aside
      data-testid="dev-otp-banner"
      aria-label="Development OTP helper"
      className="rounded-[14px] border border-border bg-surface p-2.5 text-xs text-heading flex items-center justify-between shadow-2xs"
    >
      <div className="flex items-center gap-1.5">
        <span aria-hidden="true">🧪</span>
        <span>
          Dev OTP: <strong className="font-mono text-sm text-heading font-black tracking-wider">{otp}</strong>
        </span>
      </div>
      <button
        type="button"
        onClick={() => onAutoFill(otp)}
        className="rounded-[8px] bg-primary px-2.5 py-1 text-[11px] font-bold text-card shadow-xs hover:opacity-90 active:scale-95 cursor-pointer transition-opacity"
      >
        Auto-fill
      </button>
    </aside>
  );
}
