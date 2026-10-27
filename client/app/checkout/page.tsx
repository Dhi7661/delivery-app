'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Header from '@/components/Header';
import BottomNav from '@/components/BottomNav';
import { useCart } from '@/context/CartContext';
import { formatPaise } from '@/lib/money';
import { API_BASE_URL } from '@/lib/api';

const SERVICEABLE_PINCODE = '411001';
const COD_MAX_LIMIT_PAISE = 100000; // ₹1,000

export default function CheckoutPage() {
  const router = useRouter();
  const { cart, loading, refreshCart } = useCart();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [landmark, setLandmark] = useState('');
  const [pincode, setPincode] = useState(SERVICEABLE_PINCODE);
  const [idempotencyKey, setIdempotencyKey] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Initialize unique idempotency key once on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const generated = window.crypto?.randomUUID
        ? window.crypto.randomUUID()
        : `pluk-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      setIdempotencyKey(generated);
    }
  }, []);

  const isOverCodLimit = cart && cart.total_paise > COD_MAX_LIMIT_PAISE;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    // Basic frontend validations
    if (!name.trim() || name.trim().length < 2) {
      setErrorMessage('Please enter your full name (minimum 2 characters).');
      return;
    }

    const cleanPhone = phone.trim().replace(/\D/g, '');
    if (!/^[6-9]\d{9}$/.test(cleanPhone)) {
      setErrorMessage('Please enter a valid 10-digit Indian mobile number starting with 6-9.');
      return;
    }

    if (!address.trim() || address.trim().length < 5) {
      setErrorMessage('Please enter complete delivery address (minimum 5 characters).');
      return;
    }

    if (pincode.trim() !== SERVICEABLE_PINCODE) {
      setErrorMessage(
        `Sorry, PlukIt currently only delivers to Pune Camp (pincode ${SERVICEABLE_PINCODE}). Please set pincode to ${SERVICEABLE_PINCODE}.`
      );
      return;
    }

    if (isOverCodLimit) {
      setErrorMessage('Order total exceeds the ₹1,000 Cash on Delivery limit. Please adjust items in cart.');
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch(`${API_BASE_URL}/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: name.trim(),
          phone: cleanPhone,
          address: address.trim(),
          landmark: landmark.trim() || undefined,
          pincode: pincode.trim(),
          idempotencyKey,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMessage(data.error || 'Failed to place order. Please try again.');
        setSubmitting(false);
        return;
      }

      // Success! Refresh cart state authority-side
      await refreshCart();

      // Navigate to order confirmation
      router.push(`/order/${data.orderNumber}`);
    } catch (err: any) {
      console.error('Checkout error:', err);
      setErrorMessage('Network error while placing order. Please check your connection.');
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900 antialiased pb-24">
      <Header showBack title="Guest Checkout" />

      <main className="mx-auto w-full max-w-md flex-1 px-3 py-3">
        {loading ? (
          <div className="flex min-h-[300px] flex-col items-center justify-center text-slate-400">
            <div className="h-8 w-8 animate-spin rounded-full border-3 border-emerald-600 border-t-transparent" />
            <span className="mt-3 text-sm font-medium">Loading checkout...</span>
          </div>
        ) : !cart || cart.items.length === 0 ? (
          <div className="flex min-h-[400px] flex-col items-center justify-center text-center px-4">
            <span className="text-6xl animate-bounce">🛒</span>
            <h1 className="mt-4 text-lg font-bold text-slate-800">
              Your cart is empty
            </h1>
            <p className="mt-1.5 text-sm text-slate-500 max-w-xs">
              Add some items from your local partner shops to proceed with checkout.
            </p>
            <Link
              href="/"
              className="mt-6 flex min-h-[48px] w-full max-w-xs items-center justify-center rounded-xl bg-emerald-600 font-bold text-sm text-white shadow-md hover:bg-emerald-700 active:scale-98 transition-transform"
            >
              Start Shopping
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            {/* Delivery Alert / Pincode Notice */}
            <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3.5 py-2.5 text-xs text-emerald-800 border border-emerald-200">
              <span className="text-base">📍</span>
              <div className="leading-snug">
                Delivering to: <strong>Pune Camp ({SERVICEABLE_PINCODE})</strong>
                <span className="block text-[11px] text-emerald-700">60-90 min hyper-local doorstep delivery</span>
              </div>
            </div>

            {/* Error Message Box */}
            {errorMessage && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 flex items-start gap-2 animate-fade-in">
                <span className="text-rose-600 text-sm">⚠️</span>
                <span className="flex-1 font-medium">{errorMessage}</span>
              </div>
            )}

            {/* COD Limit Warning */}
            {isOverCodLimit && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 flex flex-col gap-1.5">
                <div className="flex items-center gap-1.5 font-bold text-amber-800">
                  <span>⚠️</span>
                  <span>Cash on Delivery Limit Exceeded</span>
                </div>
                <p className="text-amber-700 leading-normal">
                  The maximum order limit for Cash on Delivery is {formatPaise(COD_MAX_LIMIT_PAISE)}. Your current total is{' '}
                  <strong>{formatPaise(cart.total_paise)}</strong>.
                </p>
                <Link
                  href="/cart"
                  className="font-bold text-amber-900 underline hover:text-amber-950 mt-1"
                >
                  Return to Cart to adjust items &rarr;
                </Link>
              </div>
            )}

            {/* Contact & Delivery Details */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5">
                <span>👤</span>
                <span>Delivery &amp; Contact Details</span>
              </h2>

              <div className="space-y-3.5">
                {/* Full Name */}
                <div>
                  <label htmlFor="guest-name" className="block text-xs font-bold text-slate-700 mb-1">
                    Full Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="guest-name"
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="E.g. Rahul Sharma"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-800 placeholder-slate-400 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 focus:outline-hidden min-h-[44px]"
                  />
                </div>

                {/* Mobile Phone */}
                <div>
                  <label htmlFor="guest-phone" className="block text-xs font-bold text-slate-700 mb-1">
                    Mobile Number <span className="text-rose-500">*</span>
                  </label>
                  <div className="flex rounded-xl border border-slate-200 overflow-hidden focus-within:border-emerald-600 focus-within:ring-1 focus-within:ring-emerald-600 min-h-[44px]">
                    <span className="flex items-center bg-slate-50 px-3 text-xs font-bold text-slate-500 border-r border-slate-200">
                      +91
                    </span>
                    <input
                      id="guest-phone"
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
                    We will SMS order tracking updates to this number.
                  </span>
                </div>

                {/* Address */}
                <div>
                  <label htmlFor="guest-address" className="block text-xs font-bold text-slate-700 mb-1">
                    Delivery Address <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    id="guest-address"
                    required
                    rows={2}
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Flat / House No., Building Name, Street"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-800 placeholder-slate-400 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 focus:outline-hidden"
                  />
                </div>

                {/* Landmark */}
                <div>
                  <label htmlFor="guest-landmark" className="block text-xs font-bold text-slate-700 mb-1">
                    Landmark <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    id="guest-landmark"
                    type="text"
                    value={landmark}
                    onChange={(e) => setLandmark(e.target.value)}
                    placeholder="E.g. Near Poona Club / Opposite Market"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-800 placeholder-slate-400 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 focus:outline-hidden min-h-[44px]"
                  />
                </div>

                {/* Pincode */}
                <div>
                  <label htmlFor="guest-pincode" className="block text-xs font-bold text-slate-700 mb-1">
                    Delivery Pincode <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="guest-pincode"
                    type="text"
                    inputMode="numeric"
                    required
                    maxLength={6}
                    value={pincode}
                    onChange={(e) => setPincode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="411001"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-800 placeholder-slate-400 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 focus:outline-hidden min-h-[44px]"
                  />
                  {pincode !== SERVICEABLE_PINCODE ? (
                    <span className="mt-1 block text-[11px] font-semibold text-rose-600">
                      ⚠️ PlukIt currently only delivers to pincode 411001.
                    </span>
                  ) : (
                    <span className="mt-1 block text-[11px] text-emerald-700">
                      ✓ Serviceable area: Pune Camp (411001)
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Payment Method Section */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5">
                <span>💳</span>
                <span>Payment Method</span>
              </h2>

              <div className="rounded-xl border-2 border-emerald-600 bg-emerald-50/60 p-3.5 flex items-start gap-3">
                <div className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-white shrink-0">
                  <span className="text-xs">✓</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-slate-900">
                      Cash on Delivery (COD)
                    </span>
                    <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-extrabold text-emerald-800 uppercase">
                      Default
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600 leading-normal">
                    Pay in cash directly to our delivery executive when your parcel arrives.
                  </p>
                  <div className="mt-2 text-[11px] text-slate-500 flex items-center gap-1">
                    <span>💵</span>
                    <span>Max limit ₹1,000 per order</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Order Summary */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Order Summary
                </h3>
                <span className="text-xs text-slate-500 font-medium">
                  {cart.items.length} {cart.items.length === 1 ? 'item' : 'items'}
                </span>
              </div>

              {/* Items List */}
              <div className="divide-y divide-slate-100 mb-3 max-h-48 overflow-y-auto pr-1">
                {cart.items.map((item) => (
                  <div key={item.id} className="py-2 flex items-center justify-between text-xs">
                    <div className="flex-1 min-w-0 pr-2">
                      <span className="font-semibold text-slate-800 truncate block">
                        {item.name}
                      </span>
                      <span className="text-slate-400 text-[11px]">
                        Qty: {item.qty} × {formatPaise(item.selling_price_paise)}
                      </span>
                    </div>
                    <span className="font-bold text-slate-900 shrink-0">
                      {formatPaise(item.line_total_paise)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="space-y-2 border-t border-slate-100 pt-3 text-sm text-slate-600">
                <div className="flex justify-between">
                  <span>Items Subtotal</span>
                  <span className="font-semibold text-slate-800">
                    {formatPaise(cart.subtotal_paise)}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span>Delivery Fee</span>
                  {cart.delivery_fee_paise === 0 ? (
                    <span className="font-bold text-emerald-600">FREE</span>
                  ) : (
                    <span className="font-semibold text-slate-800">
                      {formatPaise(cart.delivery_fee_paise)}
                    </span>
                  )}
                </div>

                <div className="border-t border-slate-100 pt-2.5 flex justify-between text-base font-black text-slate-900">
                  <span>Total Payable</span>
                  <span className="text-emerald-700">
                    {formatPaise(cart.total_paise)}
                  </span>
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={submitting || !!isOverCodLimit}
                className={`mt-4 flex min-h-[48px] w-full items-center justify-center rounded-xl font-bold text-base text-white shadow-md transition-all active:scale-98 ${
                  submitting || isOverCodLimit
                    ? 'bg-slate-300 cursor-not-allowed text-slate-500'
                    : 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 cursor-pointer'
                }`}
              >
                {submitting ? (
                  <div className="flex items-center gap-2">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    <span>Placing Order...</span>
                  </div>
                ) : (
                  <span>Place COD Order ({formatPaise(cart.total_paise)})</span>
                )}
              </button>

              <p className="mt-2.5 text-center text-[11px] text-slate-400">
                By placing your order, you agree to PlukIt terms of service.
              </p>
            </div>
          </form>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
