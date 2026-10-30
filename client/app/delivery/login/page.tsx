'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { API_BASE_URL } from '@/lib/api';

export default function RiderLoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'PHONE' | 'OTP'>('PHONE');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debugOtp, setDebugOtp] = useState<string | null>(null);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanPhone = phone.trim().replace(/\D/g, '');
    if (cleanPhone.length !== 10) {
      setError('Please enter a valid 10-digit Indian mobile number.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/delivery/auth/otp/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: cleanPhone }),
        credentials: 'include',
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to send OTP');
      }

      setStep('OTP');
      if (data.debugOtp) {
        setDebugOtp(data.debugOtp);
      }
    } catch (err: any) {
      setError(err.message || 'Network error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanOtp = otp.trim().replace(/\D/g, '');
    if (cleanOtp.length !== 6) {
      setError('Please enter the 6-digit OTP.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/delivery/auth/otp/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: phone.trim().replace(/\D/g, ''),
          otp: cleanOtp,
        }),
        credentials: 'include',
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Invalid OTP');
      }

      router.replace('/delivery');
    } catch (err: any) {
      setError(err.message || 'Failed to verify OTP');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FEF9F1] text-[#1D1C17] flex flex-col justify-between p-4">
      <div className="w-full max-w-sm mx-auto my-auto pt-6">
        {/* Brand Banner */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-[#FEBA49] text-[#704B00] rounded-2xl shadow-sm mb-3">
            <span className="text-2xl font-black">P</span>
          </div>
          <h1 className="text-2xl font-extrabold text-[#50240A] tracking-tight">
            PlukIt Delivery
          </h1>
          <p className="text-xs text-[#52443D] mt-1 font-medium">
            Delivery Partner Pilot Portal
          </p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl border border-[#D7C2B9] shadow-sm p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-[#B42318] text-xs font-semibold rounded-xl">
              {error}
            </div>
          )}

          {step === 'PHONE' ? (
            <form onSubmit={handleSendOtp} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#50240A] uppercase tracking-wider mb-2">
                  Mobile Number
                </label>
                <div className="relative flex items-center">
                  <span className="absolute left-3.5 text-sm font-bold text-[#52443D]">
                    +91
                  </span>
                  <input
                    type="tel"
                    inputMode="numeric"
                    maxLength={10}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="98765 43210"
                    disabled={loading}
                    className="w-full pl-13 pr-4 py-3 min-h-[44px] bg-[#F8F3EB] border border-[#D7C2B9] rounded-xl text-base font-bold text-[#1D1C17] placeholder:text-[#52443D]/50 focus:outline-none focus:ring-2 focus:ring-[#FEBA49]"
                    autoFocus
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || phone.trim().length !== 10}
                className="w-full min-h-[44px] py-3 px-4 bg-[#6B3A1E] hover:bg-[#50240A] disabled:opacity-50 text-white font-extrabold text-sm rounded-xl shadow-sm transition-all active:scale-[0.99] cursor-pointer"
              >
                {loading ? 'Sending OTP...' : 'Send Login OTP'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-xs font-bold text-[#50240A] uppercase tracking-wider">
                    Enter 6-Digit OTP
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setStep('PHONE');
                      setOtp('');
                      setError(null);
                    }}
                    className="text-xs text-[#6B3A1E] font-bold hover:underline"
                  >
                    Change Phone
                  </button>
                </div>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  placeholder="123456"
                  disabled={loading}
                  className="w-full px-4 py-3 min-h-[44px] bg-[#F8F3EB] border border-[#D7C2B9] rounded-xl text-center text-xl font-black tracking-widest text-[#1D1C17] placeholder:text-[#52443D]/40 focus:outline-none focus:ring-2 focus:ring-[#FEBA49]"
                  autoFocus
                />
                {debugOtp && (
                  <p className="text-[11px] text-amber-700 bg-amber-50 rounded-lg p-2 mt-2 font-mono text-center">
                    Dev Test Code: <strong>{debugOtp}</strong>
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={loading || otp.trim().length !== 6}
                className="w-full min-h-[44px] py-3 px-4 bg-[#FEBA49] hover:bg-[#efa630] disabled:opacity-50 text-[#704B00] font-extrabold text-sm rounded-xl shadow-sm transition-all active:scale-[0.99] cursor-pointer"
              >
                {loading ? 'Verifying...' : 'Verify & Start Delivering'}
              </button>
            </form>
          )}
        </div>

        {/* DPDP Act 2023 Statutory Privacy Notice (Spec Section 12) */}
        <div className="mt-6 p-3.5 bg-[#F8F3EB] border border-[#D7C2B9]/60 rounded-xl text-[11px] leading-relaxed text-[#52443D]">
          <p className="font-bold text-[#50240A] mb-1">
            ⚖️ Privacy Notice (DPDP Act, 2023)
          </p>
          <p>
            PlukIt collects your mobile number, name, and cash collection logs solely
            for hyper-local delivery fulfillment, payout computation, and financial auditing.
            Customer contact details are automatically hidden after delivery completion.
          </p>
        </div>
      </div>

      {/* Footer */}
      <footer className="text-center text-xs text-[#52443D] py-4">
        PlukIt Quick Commerce &copy; 2026
      </footer>
    </div>
  );
}
