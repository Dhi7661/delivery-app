"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BRAND_NAME } from "@/lib/brand";

export default function AdminLoginPage() {
  const router = useRouter();

  // Step state: 1 = credentials, 2 = 2FA code
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [tempToken, setTempToken] = useState("");
  const [phoneLast4, setPhoneLast4] = useState<string | null>(null);
  const [debugOtp, setDebugOtp] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1: Submit Credentials
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("http://localhost:4000/api/admin/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        credentials: "include",
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Login failed. Please check credentials.");
      }

      if (data.requiresTwoFactor) {
        setTempToken(data.tempToken);
        setPhoneLast4(data.phoneLast4 || null);
        if (data.debugOtp) {
          setDebugOtp(data.debugOtp);
          setCode(data.debugOtp); // Autofill for quick local developer testing
        }
        setStep(2);
      }
    } catch (err: any) {
      setError(err.message || "An error occurred during login.");
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Submit 2FA Code
  const handleVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("http://localhost:4000/api/admin/auth/verify-2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tempToken, code }),
        credentials: "include",
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Verification failed. Please try again.");
      }

      // Successful login!
      router.push("/admin");
      router.refresh();
    } catch (err: any) {
      setError(err.message || "Invalid verification code.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        {/* Brand Icon & Heading */}
        <div className="text-center">
          <div className="w-12 h-12 rounded-xl bg-emerald-600 flex items-center justify-center text-white font-black text-xl shadow-md mx-auto mb-3">
            {BRAND_NAME[0]}
          </div>
          <h1 className="text-2xl font-black text-heading tracking-tight">
            {BRAND_NAME} Operations
          </h1>
          <p className="mt-1 text-sm text-gray-500 font-medium">
            Administrative portal &bull; Owner &bull; Two-Factor Protected
          </p>
        </div>

        {/* Card Form */}
        <div className="mt-8 bg-white py-8 px-5 sm:px-10 shadow-sm border border-gray-200 rounded-2xl">
          {error && (
            <div className="mb-5 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm font-medium flex items-center gap-2">
              <svg className="w-5 h-5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          {step === 1 ? (
            /* Step 1: Email and Password */
            <form onSubmit={handleLoginSubmit} className="space-y-5">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                  Admin Email
                </label>
                <input
                  type="email"
                  required
                  autoFocus
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@plukit.in"
                  className="w-full px-3.5 py-3 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-base min-h-[44px]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                  Password
                </label>
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full px-3.5 py-3 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-base min-h-[44px]"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 px-4 rounded-xl font-bold text-base text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 transition-all min-h-[44px] flex items-center justify-center shadow-sm disabled:opacity-50"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  "Continue to 2FA &rarr;"
                )}
              </button>

              <div className="pt-2 text-center">
                <span className="text-[11px] text-gray-400">
                  Protected by automated IP &amp; email rate limiting
                </span>
              </div>
            </form>
          ) : (
            /* Step 2: Two-Factor Verification Code */
            <form onSubmit={handleVerifySubmit} className="space-y-5">
              <div className="text-center pb-2">
                <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto mb-2">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <h3 className="text-base font-bold text-gray-900">Enter Security Code</h3>
                <p className="text-xs text-gray-500 mt-1">
                  {phoneLast4
                    ? `A 6-digit code was sent to phone ending in •••• ${phoneLast4}.`
                    : `Enter the 6-digit authentication code.`}
                </p>
              </div>

              {/* Dev Helper Banner */}
              {debugOtp && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs">
                  <span className="font-bold">Development 2FA Code:</span>{" "}
                  <code className="font-mono bg-white px-1.5 py-0.5 rounded border border-amber-300 font-bold">
                    {debugOtp}
                  </code>
                </div>
              )}

              <div>
                <input
                  type="text"
                  required
                  autoFocus
                  maxLength={6}
                  pattern="\d{6}"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="000000"
                  className="w-full tracking-widest text-center text-2xl font-mono py-3 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent min-h-[48px]"
                />
              </div>

              <button
                type="submit"
                disabled={loading || code.length !== 6}
                className="w-full py-3.5 px-4 rounded-xl font-bold text-base text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 transition-all min-h-[44px] flex items-center justify-center shadow-sm disabled:opacity-50"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  "Verify &amp; Enter Dashboard"
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setStep(1);
                  setCode("");
                  setError(null);
                }}
                className="w-full py-2 text-center text-xs font-semibold text-gray-500 hover:text-gray-800 min-h-[44px] flex items-center justify-center"
              >
                &larr; Back to email &amp; password
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

