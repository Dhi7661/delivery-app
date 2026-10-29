'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Header from '@/components/ui/Header';
import BottomNav from '@/components/ui/BottomNav';
import Button from '@/components/ui/Button';
import DevOtpBanner from '@/components/DevOtpBanner';
import { useAuth } from '@/context/AuthContext';
import { DELIVERY_ETA_TEXT, BRAND_NAME } from '@/lib/brand';

export default function AccountPage() {
  const { user, loading, sendOtp, verifyOtp, logout } = useAuth();

  const [step, setStep] = useState<'PHONE' | 'OTP'>('PHONE');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [otp, setOtp] = useState('');
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resendTimer, setResendTimer] = useState(0);

  // Timer countdown for resending OTP
  useEffect(() => {
    if (resendTimer <= 0) return;
    const interval = setInterval(() => {
      setResendTimer((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [resendTimer]);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const cleanPhone = phone.trim().replace(/\D/g, '');
    if (!/^[6-9]\d{9}$/.test(cleanPhone)) {
      setErrorMessage('Please enter a valid 10-digit Indian mobile number starting with 6-9.');
      return;
    }

    setSubmitting(true);
    const res = await sendOtp(cleanPhone);
    setSubmitting(false);

    if (res.success) {
      setStep('OTP');
      setResendTimer(30);
      if (res.debugOtp) {
        setDevOtp(res.debugOtp);
      }
    } else {
      setErrorMessage(res.error || 'Failed to send OTP. Please try again.');
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const cleanOtp = otp.trim().replace(/\D/g, '');
    if (cleanOtp.length !== 6) {
      setErrorMessage('Please enter the full 6-digit OTP code.');
      return;
    }

    setSubmitting(true);
    const cleanPhone = phone.trim().replace(/\D/g, '');
    const res = await verifyOtp(cleanPhone, cleanOtp, name.trim() || undefined);
    setSubmitting(false);

    if (!res.success) {
      setErrorMessage(res.error || 'Verification failed. Please check the code.');
    } else {
      setOtp('');
      setStep('PHONE');
    }
  };

  const handleResendOtp = async () => {
    if (resendTimer > 0) return;
    setErrorMessage(null);
    const cleanPhone = phone.trim().replace(/\D/g, '');
    const res = await sendOtp(cleanPhone);
    if (res.success) {
      setResendTimer(30);
      if (res.debugOtp) {
        setDevOtp(res.debugOtp);
      }
    } else {
      setErrorMessage(res.error || 'Failed to resend OTP.');
    }
  };

  // Mask phone to show only last 4 digits per Warm Saffron spec
  const maskedPhone = user?.phone
    ? `•••• •• ${user.phone.slice(-4)}`
    : '';

  return (
    <div className="flex min-h-screen flex-col bg-background text-text antialiased pb-28">
      {/* Top Header matching account.png */}
      <Header variant="account" />

      <main className="mx-auto w-full max-w-md flex-1 px-4 py-4 space-y-4">
        {/* Title row matching account.png */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-black text-heading">My Account</h1>
            <p className="text-xs font-semibold text-muted">
              Manage your neighbourhood kirana preferences
            </p>
          </div>
          <span className="rounded-[10px] border border-border bg-chip px-2.5 py-1 font-mono text-xs font-bold text-heading">
            #AK-8924
          </span>
        </div>

        {loading ? (
          <div className="flex min-h-[300px] flex-col items-center justify-center text-muted">
            <div className="h-8 w-8 animate-spin rounded-full border-3 border-primary border-t-transparent" />
            <span className="mt-3 text-sm font-semibold">Loading account details...</span>
          </div>
        ) : user ? (
          /* Logged In View matching account.png */
          <div className="flex flex-col space-y-4">
            {/* 1. User Profile Card matching account.png */}
            <div className="rounded-[20px] border border-border bg-card p-4 shadow-2xs space-y-3">
              <div className="flex items-center gap-3.5">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary text-lg font-black text-card shadow-xs">
                  {user.name
                    ? user.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
                    : 'AD'}
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-base font-extrabold text-heading truncate">
                    {user.name || 'Akshay Deshmukh'}
                  </h2>
                  <span className="text-xs font-semibold text-muted block mt-0.5 truncate">
                    +91 {user.phone || '98230 45678'} &bull; {user.email || 'akshay.d@example.in'}
                  </span>
                </div>
              </div>

              {/* Verified Kirana Regular Badge matching account.png */}
              <div className="rounded-[12px] border border-border bg-surface p-2.5 flex items-center gap-2 text-xs font-semibold text-heading">
                <svg className="h-4 w-4 text-primary shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                </svg>
                <span>Kothrud Regular &bull; 24 Orders &bull; Since Nov 2022</span>
              </div>
            </div>

            {/* 2. Two-Column Stats Cards matching account.png */}
            <div className="grid grid-cols-2 gap-3">
              {/* Seasonal Savings Impact */}
              <div className="flex flex-col justify-between rounded-[20px] border border-border bg-card p-3.5 shadow-2xs">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted">
                  Seasonal Savings Impact
                </span>
                <div className="mt-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface border border-border text-primary">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" />
                    </svg>
                  </div>
                  <span className="mt-2 block text-lg font-black text-heading">8 Trips</span>
                  <span className="text-[11px] font-medium text-muted">Mandi trips saved this quarter</span>
                </div>
              </div>

              {/* Kothrud Mandi Benchmark */}
              <div className="flex flex-col justify-between rounded-[20px] border border-border bg-card p-3.5 shadow-2xs">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted">
                  Kothrud Mandi Benchmark
                </span>
                <div className="mt-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-saffron/20 border border-saffron/40 text-on-saffron">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <span className="mt-2 block text-lg font-black text-heading">&#x20B9;2,410</span>
                  <span className="text-[11px] font-medium text-muted">Total Saved vs Daily Retail</span>
                </div>
              </div>
            </div>

            {/* 3. Delivery Destination matching account.png */}
            <div className="space-y-2">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-muted">
                Delivery Destination
              </h3>
              <div className="rounded-[20px] border border-border bg-card p-4 shadow-2xs space-y-3">
                <div className="flex items-start gap-2.5">
                  <svg className="h-4 w-4 text-primary shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-heading">Home</span>
                      <span className="rounded-full bg-chip px-2 py-0.5 text-[10px] font-bold text-muted uppercase">Default</span>
                    </div>
                    <p className="mt-1 text-xs text-text font-medium leading-relaxed">
                      Flat 402, Mayur Colony, Kothrud - 411038, Pune
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted">
                      Drop Note: Leave with security gate if ring unanswered
                    </p>
                  </div>
                </div>

                <Link
                  href="/account/addresses"
                  className="flex min-h-[42px] w-full items-center justify-center rounded-[12px] border border-dashed border-border text-xs font-bold text-heading hover:bg-surface active:bg-chip transition-colors"
                >
                  + + Add New Address
                </Link>
              </div>
            </div>

            {/* 4. Account Preferences & Services matching account.png */}
            <div className="space-y-2">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-muted">
                Account Preferences &amp; Services
              </h3>
              <div className="rounded-[20px] border border-border bg-card shadow-2xs divide-y divide-border/40 overflow-hidden">
                {/* 1. Payment Methods & UPI */}
                <div className="flex items-center justify-between p-3.5 hover:bg-surface cursor-pointer transition-colors">
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface border border-border text-primary">
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                      </svg>
                    </span>
                    <div>
                      <span className="text-xs font-bold text-heading block">Payment Methods &amp; UPI</span>
                      <span className="text-[11px] text-muted">Saved: GPay &bull;&bull; 56</span>
                    </div>
                  </div>
                  <span className="text-muted text-sm">&rsaquo;</span>
                </div>


                {/* 3. Notifications & Delivery Alerts */}
                <div className="flex items-center justify-between p-3.5 hover:bg-surface cursor-pointer transition-colors">
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface border border-border text-primary">
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                      </svg>
                    </span>
                    <div>
                      <span className="text-xs font-bold text-heading block">Notifications &amp; Delivery Alerts</span>
                      <span className="text-[11px] text-muted">WhatsApp updates enabled</span>
                    </div>
                  </div>
                  <span className="text-muted text-sm">&rsaquo;</span>
                </div>

                {/* 4. Language / भाषा */}
                <div className="flex items-center justify-between p-3.5 hover:bg-surface cursor-pointer transition-colors">
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface border border-border text-primary">
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
                      </svg>
                    </span>
                    <div>
                      <span className="text-xs font-bold text-heading block">Language / भाषा</span>
                      <span className="text-[11px] text-muted">English / मराठी (Marathi)</span>
                    </div>
                  </div>
                  <span className="text-muted text-sm">&rsaquo;</span>
                </div>

                {/* 5. Help & Neighbourhood Support */}
                <div className="flex items-center justify-between p-3.5 hover:bg-surface cursor-pointer transition-colors">
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface border border-border text-primary">
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
                      </svg>
                    </span>
                    <div>
                      <span className="text-xs font-bold text-heading block">Help &amp; Neighbourhood Support</span>
                      <span className="text-[11px] text-muted">Call or chat with Kothrud desk</span>
                    </div>
                  </div>
                  <span className="text-muted text-sm">&rsaquo;</span>
                </div>

                {/* 6. About BRAND_NAME & Farm Partners */}
                <div className="flex items-center justify-between p-3.5 hover:bg-surface cursor-pointer transition-colors">
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface border border-border text-primary">
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                      </svg>
                    </span>
                    <div>
                      <span className="text-xs font-bold text-heading block">About {BRAND_NAME} &amp; Farm Partners</span>
                      <span className="text-[11px] text-muted">Direct sourcing from Junnar &amp; Saswad</span>
                    </div>
                  </div>
                  <span className="text-muted text-sm">&rsaquo;</span>
                </div>
              </div>
            </div>

            {/* 5. Logout Button matching account.png */}
            <div className="pt-2">
              <button
                type="button"
                onClick={logout}
                className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-[14px] border border-border bg-card text-sm font-bold text-heading hover:bg-surface active:bg-chip shadow-2xs transition-colors cursor-pointer"
              >
                <svg className="h-4 w-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                <span>Log out</span>
              </button>
            </div>

            {/* 6. Trust Footer matching account.png */}
            <div className="text-center pt-2 pb-4 space-y-0.5 text-muted">
              <p className="text-xs font-semibold text-heading">
                {BRAND_NAME} &bull; Crafted with local trust for Kothrud
              </p>
              <p className="text-[11px] font-medium">
                App version 2.4.1 (Pune Build)
              </p>
            </div>
          </div>
        ) : (
          /* Logged Out / Login View */
          <div className="flex flex-col space-y-4">
            <div className="text-center pt-2 pb-1">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-chip text-primary shadow-xs">
                <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
              </div>
              <h2 className="mt-3 text-lg font-black text-heading">
                {step === 'PHONE' ? 'Sign In with Phone' : 'Enter Verification Code'}
              </h2>
              <p className="mt-1 text-xs font-medium text-muted max-w-xs mx-auto">
                {step === 'PHONE'
                  ? 'Enter your mobile number to view past orders and track current deliveries.'
                  : `Enter the 6-digit code sent to +91 ${phone}`}
              </p>
            </div>

            {errorMessage && (
              <div className="rounded-[14px] border border-danger/40 bg-surface p-3 text-xs text-danger flex items-start gap-2">
                <span className="text-danger font-bold text-sm">⚠️</span>
                <span className="flex-1 font-semibold">{errorMessage}</span>
              </div>
            )}

            {step === 'PHONE' ? (
              <form onSubmit={handleSendOtp} className="rounded-[18px] border border-border bg-card p-4 shadow-2xs space-y-4">
                <div>
                  <label htmlFor="auth-phone" className="block text-xs font-bold text-heading mb-1">
                    Mobile Number
                  </label>
                  <div className="flex rounded-[12px] border border-border overflow-hidden focus-within:border-primary min-h-[44px]">
                    <span className="flex items-center bg-chip px-3 text-xs font-bold text-muted border-r border-border">
                      +91
                    </span>
                    <input
                      id="auth-phone"
                      type="tel"
                      inputMode="numeric"
                      required
                      maxLength={10}
                      value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                      placeholder="10-digit mobile number"
                      className="w-full bg-card px-3 py-2.5 text-sm font-medium text-text placeholder-muted focus:outline-hidden"
                    />
                  </div>
                  <span className="mt-1 block text-[11px] text-muted">
                    We will send an OTP via SMS to verify your account.
                  </span>
                </div>

                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  fullWidth
                  disabled={submitting || phone.length < 10}
                >
                  {submitting ? 'Sending OTP...' : 'Get OTP Code'}
                </Button>
              </form>
            ) : (
              <form onSubmit={handleVerifyOtp} className="rounded-[18px] border border-border bg-card p-4 shadow-2xs space-y-4">
                <DevOtpBanner otp={devOtp} onAutoFill={setOtp} />

                <div>
                  <label htmlFor="auth-name" className="block text-xs font-bold text-heading mb-1">
                    Your Name <span className="text-muted font-normal">(Optional)</span>
                  </label>
                  <input
                    id="auth-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="E.g. Rahul Sharma"
                    className="w-full rounded-[12px] border border-border bg-card px-3 py-2.5 text-sm font-medium text-text placeholder-muted focus:border-primary focus:outline-hidden min-h-[44px]"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label htmlFor="auth-otp" className="block text-xs font-bold text-heading">
                      6-Digit OTP Code
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setStep('PHONE');
                        setOtp('');
                      }}
                      className="text-[11px] font-bold text-primary hover:underline cursor-pointer"
                    >
                      Change Number
                    </button>
                  </div>
                  <input
                    id="auth-otp"
                    type="tel"
                    inputMode="numeric"
                    required
                    maxLength={6}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="Enter 6-digit OTP"
                    className="w-full rounded-[12px] border border-border bg-card px-3 py-2.5 text-center text-lg tracking-widest font-mono font-bold text-text placeholder-muted focus:border-primary focus:outline-hidden min-h-[48px]"
                  />
                </div>

                <div className="text-center text-xs">
                  {resendTimer > 0 ? (
                    <span className="text-muted">
                      Resend OTP in <strong>{resendTimer}s</strong>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={handleResendOtp}
                      className="font-bold text-primary hover:underline cursor-pointer"
                    >
                      Resend OTP Code
                    </button>
                  )}
                </div>

                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  fullWidth
                  disabled={submitting || otp.length < 6}
                >
                  {submitting ? 'Verifying...' : 'Verify & Continue'}
                </Button>
              </form>
            )}
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
