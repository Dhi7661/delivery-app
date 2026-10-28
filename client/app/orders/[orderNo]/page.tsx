'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Header from '@/components/Header';
import BottomNav from '@/components/BottomNav';
import { API_BASE_URL, OrderData } from '@/lib/api';
import { formatPaise } from '@/lib/money';
import { useAuth } from '@/context/AuthContext';

interface TimelineStep {
  status: string;
  label: string;
  description: string;
  timestamp: string | null;
  completed: boolean;
  current: boolean;
}

function OrderTrackingContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const orderNo = params?.orderNo as string;
  const initialPhoneQuery = searchParams?.get('phone') || '';

  const { user } = useAuth();

  const [order, setOrder] = useState<OrderData | null>(null);
  const [timeline, setTimeline] = useState<TimelineStep[]>([]);
  const [isVerified, setIsVerified] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Guest phone verification state
  const [inputPhone, setInputPhone] = useState(initialPhoneQuery);
  const [verifying, setVerifying] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Load phone from sessionStorage if available
  useEffect(() => {
    if (!initialPhoneQuery && typeof window !== 'undefined') {
      const stored = sessionStorage.getItem(`track_phone_${orderNo}`);
      if (stored) {
        setInputPhone(stored);
      }
    }
  }, [orderNo, initialPhoneQuery]);

  const fetchTracking = async (phoneToVerify?: string) => {
    if (!orderNo) return;
    try {
      setLoading(true);
      setError(null);
      setPhoneError(null);

      const phoneParam = phoneToVerify !== undefined ? phoneToVerify : inputPhone;
      let url = `${API_BASE_URL}/orders/${orderNo}`;
      if (phoneParam) {
        url += `?phone=${encodeURIComponent(phoneParam.trim())}`;
      }

      const res = await fetch(url, { credentials: 'include' });
      if (res.status === 404) {
        setError('Order not found. Please verify your order number.');
        return;
      }
      if (res.status === 403) {
        const errData = await res.json().catch(() => ({}));
        if (user) {
          setError('Access Denied: This order does not belong to your account.');
        } else {
          setPhoneError(errData.error || 'Phone number does not match this order. Please enter the number used during checkout.');
        }
        setIsVerified(false);
        return;
      }
      if (!res.ok) {
        setError('Failed to retrieve order tracking details.');
        return;
      }

      const data = await res.json();
      setOrder(data.order);
      setTimeline(data.timeline || []);
      setIsVerified(Boolean(data.isVerified));

      if (phoneParam && data.isVerified && typeof window !== 'undefined') {
        sessionStorage.setItem(`track_phone_${orderNo}`, phoneParam.trim());
      }
    } catch (err) {
      console.error('Error fetching order tracking:', err);
      setError('Network error while retrieving tracking details.');
    } finally {
      setLoading(false);
      setVerifying(false);
    }
  };

  useEffect(() => {
    fetchTracking();
  }, [orderNo]);

  const handleVerifyPhone = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputPhone || inputPhone.trim().length < 10) {
      setPhoneError('Please enter a valid 10-digit mobile number.');
      return;
    }
    setVerifying(true);
    fetchTracking(inputPhone.trim());
  };

  const handleCopyOrderNo = () => {
    if (!order) return;
    navigator.clipboard?.writeText(order.order_no);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getStepIcon = (status: string, completed: boolean, current: boolean) => {
    if (status === 'CANCELLED') return '✕';
    if (status === 'FAILED_DELIVERY') return '⚠️';
    if (completed) return '✓';
    if (current) return '●';
    return '○';
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900 antialiased pb-24">
      <Header showBack title="Order Tracking" />

      <main className="mx-auto w-full max-w-md flex-1 px-3 py-4 space-y-3">
        {loading ? (
          <div className="flex min-h-[400px] flex-col items-center justify-center text-slate-400">
            <div className="h-9 w-9 animate-spin rounded-full border-3 border-emerald-600 border-t-transparent" />
            <span className="mt-3 text-sm font-medium">Fetching live order status...</span>
          </div>
        ) : error || !order ? (
          <div className="flex min-h-[400px] flex-col items-center justify-center text-center px-4">
            <span className="text-5xl">{error?.includes('Access Denied') ? '🔒' : '🔍'}</span>
            <h1 className="mt-3 text-lg font-bold text-slate-800">
              {error?.includes('Access Denied') ? 'Access Denied' : 'Order Not Found'}
            </h1>
            <p className="mt-1 text-sm text-slate-500 max-w-xs">
              {error || 'We could not locate this order.'}
            </p>
            <div className="mt-5 flex gap-2">
              {user && (
                <Link
                  href="/orders"
                  className="flex min-h-[48px] items-center justify-center rounded-xl bg-emerald-600 px-6 font-bold text-sm text-white shadow-md hover:bg-emerald-700 active:scale-98"
                >
                  View My Orders
                </Link>
              )}
              <Link
                href="/"
                className="flex min-h-[48px] items-center justify-center rounded-xl bg-slate-100 px-6 font-bold text-sm text-slate-700 hover:bg-slate-200 active:scale-98"
              >
                Return Home
              </Link>
            </div>
          </div>
        ) : (
          <>
            {/* Top Order Status Card */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                    Order Tracking
                  </span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-base font-mono font-extrabold text-slate-900">
                      {order.order_no}
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyOrderNo}
                      className="text-[11px] font-bold text-emerald-700 hover:text-emerald-800 cursor-pointer"
                    >
                      {copied ? '✓ Copied' : 'Copy'}
                    </button>
                  </div>
                </div>

                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-black tracking-wide ${
                    order.status === 'DELIVERED'
                      ? 'bg-blue-100 text-blue-800 border border-blue-200'
                      : order.status === 'OUT_FOR_DELIVERY'
                      ? 'bg-amber-100 text-amber-900 border border-amber-200 animate-pulse'
                      : order.status === 'CANCELLED'
                      ? 'bg-rose-100 text-rose-800 border border-rose-200'
                      : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                  }`}
                >
                  {order.status.replace(/_/g, ' ')}
                </span>
              </div>

              {/* Guest Phone Verification Gate */}
              {!isVerified && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 space-y-2">
                  <div className="flex items-center gap-2 text-amber-900 font-bold text-xs">
                    <span>🔒</span>
                    <span>Verify Phone to View Full Timeline &amp; Order Details</span>
                  </div>
                  <p className="text-[11px] text-amber-800 leading-normal">
                    Enter the 10-digit mobile number used when placing this order to view real-time delivery status and order details.
                  </p>

                  <form onSubmit={handleVerifyPhone} className="space-y-2 pt-1">
                    <div className="flex gap-2">
                      <input
                        type="tel"
                        maxLength={10}
                        placeholder="10-digit mobile number"
                        value={inputPhone}
                        onChange={(e) => {
                          setInputPhone(e.target.value.replace(/\D/g, ''));
                          setPhoneError(null);
                        }}
                        className="flex-1 rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs font-mono font-bold text-slate-900 placeholder-slate-400 focus:border-emerald-600 focus:outline-hidden min-h-[44px]"
                      />
                      <button
                        type="submit"
                        disabled={verifying}
                        className="rounded-xl bg-emerald-600 px-4 text-xs font-bold text-white hover:bg-emerald-700 active:scale-95 transition-transform min-h-[44px] cursor-pointer disabled:opacity-50 shrink-0"
                      >
                        {verifying ? 'Checking...' : 'Verify & Track'}
                      </button>
                    </div>

                    {phoneError && (
                      <p className="text-[11px] font-semibold text-rose-600">
                        {phoneError}
                      </p>
                    )}
                  </form>
                </div>
              )}
            </div>

            {/* UNVERIFIED STATE NOTICE */}
            {!isVerified ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center space-y-2 shadow-2xs">
                <span className="text-3xl">🛡️</span>
                <h3 className="text-sm font-bold text-slate-800">Order Protected</h3>
                <p className="text-xs text-slate-500 max-w-xs mx-auto leading-relaxed">
                  For customer privacy and security, delivery address, items, and live tracking are hidden until phone ownership is confirmed.
                </p>
              </div>
            ) : (
              <>
                {/* INTERACTIVE STATUS TIMELINE */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <span>📍</span>
                  <span>Delivery Status Timeline</span>
                </h2>
                <button
                  type="button"
                  onClick={() => fetchTracking()}
                  className="text-[11px] font-bold text-emerald-700 hover:text-emerald-800 cursor-pointer"
                >
                  ↻ Refresh
                </button>
              </div>

              <div className="relative pl-6 space-y-6">
                {timeline.map((step, idx) => {
                  const isLast = idx === timeline.length - 1;
                  const isCurrent = step.current;
                  const isCompleted = step.completed;
                  const isCancelled = step.status === 'CANCELLED';
                  const isFailed = step.status === 'FAILED_DELIVERY';

                  return (
                    <div key={step.status} className="relative">
                      {/* Vertical Connecting Line */}
                      {!isLast && (
                        <div
                          className={`absolute -left-[17px] top-6 w-0.5 h-full ${
                            isCompleted ? 'bg-emerald-500' : 'bg-slate-200'
                          }`}
                        />
                      )}

                      {/* Timeline Icon Node */}
                      <div
                        className={`absolute -left-[26px] top-0.5 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-black shadow-xs transition-all ${
                          isCancelled
                            ? 'bg-rose-600 text-white'
                            : isFailed
                            ? 'bg-amber-600 text-white'
                            : isCurrent
                            ? 'bg-emerald-600 text-white ring-4 ring-emerald-100 scale-110'
                            : isCompleted
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-100 text-slate-400 border border-slate-300'
                        }`}
                      >
                        {getStepIcon(step.status, isCompleted, isCurrent)}
                      </div>

                      {/* Content */}
                      <div className="flex flex-col">
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`text-xs font-extrabold ${
                              isCurrent
                                ? 'text-emerald-700'
                                : isCompleted
                                ? 'text-slate-800'
                                : 'text-slate-400'
                            }`}
                          >
                            {step.label}
                          </span>

                          {step.timestamp && (
                            <span className="text-[10px] font-medium text-slate-400 shrink-0">
                              {new Date(step.timestamp).toLocaleTimeString('en-IN', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          )}
                        </div>

                        <p
                          className={`mt-0.5 text-[11px] leading-relaxed ${
                            isCurrent
                              ? 'text-slate-600 font-medium'
                              : 'text-slate-400'
                          }`}
                        >
                          {step.description}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* CASH ON DELIVERY REMINDER CARD */}
            {order.payment_method === 'COD' && order.status !== 'DELIVERED' && order.status !== 'CANCELLED' && (
              <div className="rounded-2xl border-2 border-emerald-600 bg-emerald-50/80 p-4 shadow-xs">
                <div className="flex items-start gap-3">
                  <div className="text-2xl mt-0.5 shrink-0">💵</div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-black text-slate-900 leading-snug break-words">
                      Pay {formatPaise(order.total_paise)} in cash upon delivery.
                    </h3>
                    <p className="mt-1 text-xs text-slate-700 leading-normal">
                      Payment method: <strong>Cash on Delivery (COD)</strong>. Please keep exact change ready for smooth delivery handover.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Delivery Address & Customer Details */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <span>📍</span>
                <span>Delivery Address</span>
              </h3>

              <div className="text-xs text-slate-700 space-y-1">
                <div className="font-bold text-slate-900">
                  {order.guest_name}
                </div>
                <div className="text-slate-600">
                  {order.address?.line1}
                  {order.address?.landmark && `, ${order.address.landmark}`}
                </div>
                <div className="font-mono text-slate-500">
                  Pincode: {order.address?.pincode}
                </div>
              </div>
            </div>

            {/* Items Summary */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs space-y-2.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <span>🛍️</span>
                <span>Items ({order.items?.length || 0})</span>
              </h3>

              <div className="divide-y divide-slate-100 text-xs">
                {order.items?.map((item) => (
                  <div key={item.id} className="py-2 flex items-center justify-between">
                    <div className="flex-1 pr-2 truncate">
                      <p className="font-bold text-slate-800 truncate">
                        {item.product?.name || 'Product'}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        Qty: {item.qty} × {formatPaise(item.selling_price_paise)}
                      </p>
                    </div>
                    <span className="font-extrabold text-slate-900 shrink-0">
                      {formatPaise(item.line_total_paise)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="border-t border-slate-100 pt-2 flex items-center justify-between font-extrabold text-sm">
                <span>Total Amount</span>
                <span className="text-emerald-700">{formatPaise(order.total_paise)}</span>
              </div>
            </div>

            {/* GST Tax Invoice & Credit Notes Card (F15) */}
            {order.invoice && (
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-700">
                    <span>🧾</span>
                    <span>GST Tax Invoice</span>
                  </div>
                  <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
                    Compliant
                  </span>
                </div>

                <div className="rounded-xl bg-slate-50 p-3 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Invoice Number:</span>
                    <span className="font-mono font-bold text-slate-900">{order.invoice.invoice_no}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Invoice Date:</span>
                    <span className="text-slate-700 font-medium">
                      {new Date(order.invoice.invoice_date).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Seller GSTIN:</span>
                    <span className="font-mono text-slate-700">{order.invoice.seller_gstin}</span>
                  </div>
                  <div className="border-t border-slate-200 pt-1.5 flex items-center justify-between text-[11px] text-slate-500">
                    <span>Taxable: {formatPaise(order.invoice.taxable_amount_paise)}</span>
                    <span>CGST+SGST: {formatPaise(order.invoice.gst_amount_paise)}</span>
                  </div>
                </div>

                <a
                  href={`${API_BASE_URL}/invoices/${order.invoice.invoice_no}/pdf`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 active:scale-98 transition-all"
                >
                  <span>📄</span>
                  <span>Download Tax Invoice (PDF)</span>
                </a>

                {/* Credit Notes if order was returned/cancelled */}
                {order.invoice.credit_notes && order.invoice.credit_notes.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-rose-800">
                      <span>↩️</span>
                      <span>Credit Note Issued</span>
                    </div>
                    {order.invoice.credit_notes.map((cn) => (
                      <div key={cn.id} className="rounded-xl bg-rose-50/70 border border-rose-200 p-2.5 space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-mono font-bold text-rose-900">{cn.credit_note_no}</span>
                          <span className="font-bold text-rose-700">{formatPaise(cn.total_paise)}</span>
                        </div>
                        <p className="text-[11px] text-rose-600">Reason: {cn.reason}</p>
                        <a
                          href={`${API_BASE_URL}/credit-notes/${cn.credit_note_no}/pdf`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex min-h-[38px] w-full items-center justify-center gap-2 rounded-lg bg-rose-600 px-3 text-[11px] font-bold text-white shadow-xs hover:bg-rose-700 active:scale-98"
                        >
                          <span>📄</span>
                          <span>Download Credit Note (PDF)</span>
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Help / Support Link */}
            <div className="p-3 text-center text-xs text-slate-400">
              Need help with this order? PlukIt support is ready to assist.
            </div>
              </>
            )}
          </>
        )}
      </main>

      <BottomNav />
    </div>
  );
}

export default function OrderTrackingPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-400">
          <div className="h-8 w-8 animate-spin rounded-full border-3 border-emerald-600 border-t-transparent" />
        </div>
      }
    >
      <OrderTrackingContent />
    </Suspense>
  );
}
