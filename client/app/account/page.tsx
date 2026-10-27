'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Header from '@/components/Header';
import BottomNav from '@/components/BottomNav';
import { useAuth } from '@/context/AuthContext';

export default function AccountPage() {
  const { user, loading, sendOtp, verifyOtp, logout } = useAuth();

  const [step, setStep] = useState<'PHONE' | 'OTP'>('PHONE');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [otp, setOtp] = useState('');
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
    } else {
      setErrorMessage(res.error || 'Failed to resend OTP.');
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900 antialiased pb-24">
      <Header showBack title="My Account" />

      <main className="mx-auto w-full max-w-md flex-1 px-3 py-4">
        {loading ? (
          <div className="flex min-h-[300px] flex-col items-center justify-center text-slate-400">
            <div className="h-8 w-8 animate-spin rounded-full border-3 border-emerald-600 border-t-transparent" />
            <span className="mt-3 text-sm font-medium">Loading account details...</span>
          </div>
        ) : user ? (
          /* Logged In View */
          <div className="flex flex-col gap-4">
            {/* User Profile Card */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
              <div className="flex items-center gap-3.5">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-xl font-black text-white shadow-sm">
                  {user.name ? user.name.charAt(0).toUpperCase() : 'U'}
                </div>
                <div className="min-w-0 flex-1">
                  <h1 className="text-base font-extrabold text-slate-900 truncate">
                    {user.name || 'Valued Customer'}
                  </h1>
                  <span className="text-xs font-semibold text-slate-500 block mt-0.5">
                    +91 {user.phone}
                  </span>
                  <span className="mt-1.5 inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
                    ✓ Verified Customer
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Links */}
            <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-2xs divide-y divide-slate-100">
              <Link
                href="/orders"
                className="flex items-center justify-between p-3.5 hover:bg-slate-50 rounded-xl transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-base">
                    📦
                  </span>
                  <div>
                    <span className="text-sm font-bold text-slate-800 block">
                      My Orders
                    </span>
                    <span className="text-xs text-slate-400">
                      View past orders and tracking
                    </span>
                  </div>
                </div>
                <span className="text-slate-400 text-lg">&rsaquo;</span>
              </Link>

              <Link
                href="/cart"
                className="flex items-center justify-between p-3.5 hover:bg-slate-50 rounded-xl transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-base">
                    🛒
                  </span>
                  <div>
                    <span className="text-sm font-bold text-slate-800 block">
                      My Cart
                    </span>
                    <span className="text-xs text-slate-400">
                      View active items &amp; checkout
                    </span>
                  </div>
                </div>
                <span className="text-slate-400 text-lg">&rsaquo;</span>
              </Link>
            </div>

            {/* Service Area Info */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                Serviceable Area
              </h2>
              <div className="flex items-start gap-2.5 text-xs text-slate-700">
                <span className="text-base">📍</span>
                <div>
                  <span className="font-bold text-slate-900 block">
                    Pune Camp (411001)
                  </span>
                  <span className="text-slate-500 text-[11px] mt-0.5 block">
                    Hyper-local delivery from neighborhood partner shops in 15-45 minutes.
                  </span>
                </div>
              </div>
            </div>

            {/* Logout Button */}
            <div className="pt-2">
              <button
                type="button"
                onClick={logout}
                className="flex min-h-[48px] w-full items-center justify-center rounded-xl border border-rose-200 bg-white font-bold text-sm text-rose-600 shadow-2xs hover:bg-rose-50 active:bg-rose-100 cursor-pointer transition-colors"
              >
                Log Out
              </button>
            </div>
          </div>
        ) : (
          /* Logged Out / Login View */
          <div className="flex flex-col gap-4">
            <div className="text-center pt-2 pb-1">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-2xl shadow-xs">
                📱
              </div>
              <h1 className="mt-3 text-lg font-black text-slate-900">
                {step === 'PHONE' ? 'Sign In with Phone' : 'Enter Verification Code'}
              </h1>
              <p className="mt-1 text-xs text-slate-500 max-w-xs mx-auto">
                {step === 'PHONE'
                  ? 'Enter your mobile number to view past orders and track current deliveries.'
                  : `Enter the 6-digit code sent to +91 ${phone}`}
              </p>
            </div>

            {errorMessage && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 flex items-start gap-2 animate-fade-in">
                <span className="text-rose-600 text-sm">⚠️</span>
                <span className="flex-1 font-medium">{errorMessage}</span>
              </div>
            )}

            {step === 'PHONE' ? (
              /* Phone Input Form */
              <form onSubmit={handleSendOtp} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs space-y-4">
                <div>
                  <label htmlFor="auth-phone" className="block text-xs font-bold text-slate-700 mb-1">
                    Mobile Number
                  </label>
                  <div className="flex rounded-xl border border-slate-200 overflow-hidden focus-within:border-emerald-600 focus-within:ring-1 focus-within:ring-emerald-600 min-h-[44px]">
                    <span className="flex items-center bg-slate-50 px-3 text-xs font-bold text-slate-500 border-r border-slate-200">
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
                      className="w-full px-3 py-2.5 text-sm font-medium text-slate-800 placeholder-slate-400 focus:outline-hidden"
                    />
                  </div>
                  <span className="mt-1 block text-[11px] text-slate-400">
                    We will send an OTP via SMS to verify your account.
                  </span>
                </div>

                <button
                  type="submit"
                  disabled={submitting || phone.length < 10}
                  className={`flex min-h-[48px] w-full items-center justify-center rounded-xl font-bold text-sm text-white shadow-md transition-all active:scale-98 ${
                    submitting || phone.length < 10
                      ? 'bg-slate-300 cursor-not-allowed text-slate-500'
                      : 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 cursor-pointer'
                  }`}
                >
                  {submitting ? (
                    <div className="flex items-center gap-2">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      <span>Sending OTP...</span>
                    </div>
                  ) : (
                    <span>Get OTP Code</span>
                  )}
                </button>
              </form>
            ) : (
              /* OTP Verification Form */
              <form onSubmit={handleVerifyOtp} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs space-y-4">
                {/* Optional Name field */}
                <div>
                  <label htmlFor="auth-name" className="block text-xs font-bold text-slate-700 mb-1">
                    Your Name <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    id="auth-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="E.g. Rahul Sharma"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-800 placeholder-slate-400 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 focus:outline-hidden min-h-[44px]"
                  />
                </div>

                {/* 6-Digit OTP */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label htmlFor="auth-otp" className="block text-xs font-bold text-slate-700">
                      6-Digit OTP Code
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setStep('PHONE');
                        setOtp('');
                      }}
                      className="text-[11px] font-bold text-emerald-700 hover:underline cursor-pointer"
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
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-center text-lg tracking-widest font-mono font-bold text-slate-800 placeholder-slate-400 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 focus:outline-hidden min-h-[48px]"
                  />
                </div>

                {/* Resend button */}
                <div className="text-center text-xs">
                  {resendTimer > 0 ? (
                    <span className="text-slate-400">
                      Resend OTP in <strong>{resendTimer}s</strong>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={handleResendOtp}
                      className="font-bold text-emerald-700 hover:underline cursor-pointer"
                    >
                      Resend OTP Code
                    </button>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={submitting || otp.length < 6}
                  className={`flex min-h-[48px] w-full items-center justify-center rounded-xl font-bold text-sm text-white shadow-md transition-all active:scale-98 ${
                    submitting || otp.length < 6
                      ? 'bg-slate-300 cursor-not-allowed text-slate-500'
                      : 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 cursor-pointer'
                  }`}
                >
                  {submitting ? (
                    <div className="flex items-center gap-2">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      <span>Verifying...</span>
                    </div>
                  ) : (
                    <span>Verify &amp; Continue</span>
                  )}
                </button>
              </form>
            )}
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
