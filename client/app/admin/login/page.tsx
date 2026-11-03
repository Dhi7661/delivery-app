'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { API_BASE_URL } from '@/lib/api';

export default function AdminLoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<'CREDENTIALS' | '2FA'>('CREDENTIALS');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [tempToken, setTempToken] = useState('');
  const [maskedContact, setMaskedContact] = useState('');
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Check if admin is already logged in
  useEffect(() => {
    async function checkExistingSession() {
      try {
        const res = await fetch(`${API_BASE_URL}/admin/auth/me`, {
          credentials: 'include',
        });
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.admin) {
            router.replace('/admin/orders');
            return;
          }
        }
      } catch (err) {
        // Not logged in or network error, stay on login page
      } finally {
        setCheckingAuth(false);
      }
    }

    checkExistingSession();
  }, [router]);

  // Step 1: Submit Email and Password
  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setErrorMessage('Please enter your admin email address.');
      return;
    }
    if (!password) {
      setErrorMessage('Please enter your admin password.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email: trimmedEmail,
          password,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        if (data.requires2FA) {
          // 2FA challenge required (Spec v1.2)
          setTempToken(data.tempToken || '');
          setMaskedContact(data.maskedContact || '');
          if (data.devOtp) {
            setDevOtp(data.devOtp);
          }
          setStep('2FA');
        } else {
          // Direct login success
          router.replace('/admin/orders');
        }
      } else if (res.status === 429) {
        setErrorMessage(
          data.error || 'Too many failed login attempts. Please wait 15 minutes before trying again.'
        );
      } else {
        setErrorMessage(data.error || 'Invalid email or password.');
      }
    } catch (err) {
      setErrorMessage('Unable to connect to the server. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Submit 2FA Code
  const handle2FASubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const cleanOtp = twoFactorCode.trim().replace(/\D/g, '');
    if (cleanOtp.length !== 6) {
      setErrorMessage('Please enter the 6-digit verification code.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/auth/login/2fa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          tempToken,
          otp: cleanOtp,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        router.replace('/admin/orders');
      } else {
        setErrorMessage(data.error || 'Invalid or expired 2FA code. Please try again.');
      }
    } catch (err) {
      setErrorMessage('Verification failed. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-[#FEF9F1] flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-[#6B3A1E] border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-[#52443D] font-medium">Checking admin session...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FEF9F1] flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 text-[#1D1C17]">
      {/* Brand Header */}
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <Link href="/" className="inline-flex items-center gap-2 mb-4 group">
          <div className="w-12 h-12 rounded-2xl bg-[#FEBA49] flex items-center justify-center text-[#704B00] font-black text-2xl shadow-sm">
            P
          </div>
          <span className="text-2xl font-black text-[#50240A] tracking-tight">PlukIt</span>
        </Link>
        <div className="inline-block px-3 py-1 bg-[#F8F3EB] border border-[#D7C2B9] text-[#6B3A1E] text-xs font-bold rounded-full uppercase tracking-wider mb-2">
          Admin Portal
        </div>
        <h1 className="text-2xl font-extrabold text-[#50240A]">
          {step === 'CREDENTIALS' ? 'Sign in to Admin Dashboard' : 'Two-Factor Authentication'}
        </h1>
        <p className="mt-1 text-xs text-[#52443D]">
          {step === 'CREDENTIALS'
            ? 'Operations, order dispatch, payouts, and catalog control'
            : `Enter the 6-digit security code for ${email}`}
        </p>
      </div>

      {/* Login Card */}
      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 shadow-sm border border-[#D7C2B9] rounded-2xl sm:px-10">
          {errorMessage && (
            <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-[#B42318] text-xs font-semibold flex items-start gap-2.5">
              <span>⚠️</span>
              <div className="leading-relaxed">{errorMessage}</div>
            </div>
          )}

          {step === 'CREDENTIALS' ? (
            <form className="space-y-4" onSubmit={handleCredentialsSubmit}>
              <div>
                <label htmlFor="admin-email" className="block text-xs font-bold text-[#50240A] uppercase tracking-wider mb-1.5">
                  Admin Email
                </label>
                <input
                  id="admin-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@plukit.in"
                  className="block w-full px-4 py-3 min-h-[44px] rounded-xl bg-[#F8F3EB] border border-[#D7C2B9] text-[#1D1C17] text-sm font-semibold placeholder-[#52443D]/40 focus:outline-none focus:ring-2 focus:ring-[#FEBA49]"
                />
              </div>

              <div>
                <label htmlFor="admin-password" className="block text-xs font-bold text-[#50240A] uppercase tracking-wider mb-1.5">
                  Password
                </label>
                <div className="relative rounded-lg">
                  <input
                    id="admin-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="block w-full px-4 py-3 min-h-[44px] pr-14 rounded-xl bg-[#F8F3EB] border border-[#D7C2B9] text-[#1D1C17] text-sm font-semibold placeholder-[#52443D]/40 focus:outline-none focus:ring-2 focus:ring-[#FEBA49]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 px-3 flex items-center text-xs font-bold text-[#6B3A1E] hover:underline"
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center items-center py-3 px-4 min-h-[44px] rounded-xl shadow-sm text-sm font-extrabold text-white bg-[#6B3A1E] hover:bg-[#50240A] disabled:opacity-50 transition-all cursor-pointer mt-2"
              >
                {loading ? 'Verifying credentials...' : 'Continue to 2FA Verification'}
              </button>
            </form>
          ) : (
            <form className="space-y-4" onSubmit={handle2FASubmit}>
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label htmlFor="admin-otp" className="block text-xs font-bold text-[#50240A] uppercase tracking-wider">
                    Enter 6-Digit Code
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setStep('CREDENTIALS');
                      setTwoFactorCode('');
                      setErrorMessage(null);
                    }}
                    className="text-xs font-bold text-[#6B3A1E] hover:underline cursor-pointer"
                  >
                    Change Email
                  </button>
                </div>
                <input
                  id="admin-otp"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  autoFocus
                  required
                  value={twoFactorCode}
                  onChange={(e) => setTwoFactorCode(e.target.value)}
                  placeholder="123456"
                  className="block w-full px-4 py-3 min-h-[44px] rounded-xl bg-[#F8F3EB] border border-[#D7C2B9] text-center text-2xl font-black tracking-widest text-[#1D1C17] placeholder-[#52443D]/30 focus:outline-none focus:ring-2 focus:ring-[#FEBA49]"
                />

                <p className="text-[11px] text-[#52443D] mt-2 text-center">
                  Code sent to verified contact {maskedContact ? `(${maskedContact})` : ''}
                </p>

                <div className="mt-3 p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-center">
                  <span className="text-[11px] font-bold text-amber-800">
                    Dev Test Code: <span className="font-mono text-xs">{devOtp || '123456'}</span>
                  </span>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || twoFactorCode.trim().length !== 6}
                className="w-full flex justify-center items-center py-3 px-4 min-h-[44px] rounded-xl shadow-sm text-sm font-extrabold text-[#704B00] bg-[#FEBA49] hover:bg-[#efa630] disabled:opacity-50 transition-all cursor-pointer mt-2"
              >
                {loading ? 'Verifying 2FA...' : 'Verify & Enter Dashboard'}
              </button>
            </form>
          )}

          <div className="mt-6 border-t border-[#D7C2B9]/50 pt-4 text-center">
            <Link
              href="/"
              className="text-xs font-bold text-[#6B3A1E] hover:underline transition-colors"
            >
              ← Back to PlukIt Customer Store
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
