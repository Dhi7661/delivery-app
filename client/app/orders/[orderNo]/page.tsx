'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Header from '@/components/ui/Header';
import BottomNav from '@/components/ui/BottomNav';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import { API_BASE_URL, OrderData } from '@/lib/api';
import { formatPaise } from '@/lib/money';
import { useAuth } from '@/context/AuthContext';
import { getOrderStatusDisplay } from '@/lib/orderStatus';
import { DELIVERY_ETA_TEXT, BRAND_NAME } from '@/lib/brand';

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

  return (
    <div className="flex min-h-screen flex-col bg-background text-text antialiased pb-28">
      <Header
        variant="track-order"
        title={`Track Order #${order ? order.order_no : orderNo}`}
        subtitle={`${BRAND_NAME} • Kothrud Hub`}
      />

      <main className="mx-auto w-full max-w-md flex-1 px-4 py-4 space-y-4">
        {loading ? (
          <div className="flex min-h-[400px] flex-col items-center justify-center text-muted">
            <div className="h-9 w-9 animate-spin rounded-full border-3 border-primary border-t-transparent" />
            <span className="mt-3 text-sm font-semibold">Fetching live order status...</span>
          </div>
        ) : error || !order ? (
          <div className="flex min-h-[400px] flex-col items-center justify-center text-center px-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-chip text-primary">
              <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h1 className="mt-4 text-lg font-black text-heading">
              {error?.includes('Access Denied') ? 'Access Denied' : 'Order Not Found'}
            </h1>
            <p className="mt-1 text-xs font-medium text-muted max-w-xs">
              {error || 'We could not locate this order.'}
            </p>
            <div className="mt-6 flex flex-col gap-2 w-full max-w-xs">
              {user && (
                <Link href="/orders">
                  <Button variant="primary" size="lg" fullWidth>
                    View My Orders
                  </Button>
                </Link>
              )}
              <Link href="/">
                <Button variant="outline" size="lg" fullWidth>
                  Return Home
                </Button>
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Status Pill Sub-bar matching track-order.png */}
            <div className="flex items-center justify-between rounded-full border border-border bg-card px-4 py-2 shadow-2xs">
              <div className="flex items-center gap-2 text-xs font-bold text-heading min-w-0">
                <span className="h-2.5 w-2.5 rounded-full bg-saffron shrink-0" />
                <span className="truncate">18 mins away</span>
                <span className="text-muted font-normal">•</span>
                <span className="font-semibold text-muted truncate">
                  Kothrud {order.address?.pincode || '411038'}
                </span>
              </div>
              <span className="shrink-0 rounded-full bg-saffron/20 border border-saffron/40 px-3 py-0.5 text-xs font-extrabold text-on-saffron">
                {order.status === 'OUT_FOR_DELIVERY' ? 'Out for delivery' : getOrderStatusDisplay(order.status).label}
              </span>
            </div>

            {order.status === 'PAYMENT_FAILED' && (
              <div className="rounded-[14px] border border-danger/40 bg-surface p-3 flex items-center justify-between gap-2">
                <span className="text-xs text-danger font-semibold">
                  UPI payment was cancelled or failed.
                </span>
                <Link href="/checkout">
                  <Button variant="dangerOutline" size="sm">
                    Retry
                  </Button>
                </Link>
              </div>
            )}

            {/* Guest Phone Verification Gate if needed */}
            {!isVerified && (
              <div className="rounded-[18px] border border-border bg-card p-4 space-y-3 shadow-2xs">
                <div className="flex items-center gap-2 text-heading font-extrabold text-xs">
                  <svg className="h-4 w-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <span>Verify Phone to View Full Timeline &amp; Order Details</span>
                </div>
                <p className="text-xs text-muted leading-relaxed">
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
                      className="flex-1 rounded-[12px] border border-border bg-card px-3 py-2 text-xs font-mono font-bold text-text placeholder-muted focus:border-primary focus:outline-hidden min-h-[44px]"
                    />
                    <Button
                      type="submit"
                      variant="primary"
                      size="sm"
                      disabled={verifying}
                    >
                      {verifying ? 'Checking...' : 'Verify'}
                    </Button>
                  </div>

                  {phoneError && (
                    <p className="text-[11px] font-semibold text-danger">
                      {phoneError}
                    </p>
                  )}
                </form>
              </div>
            )}

            {/* UNVERIFIED STATE NOTICE */}
            {!isVerified ? (
              <div className="rounded-[18px] border border-border bg-card p-6 text-center space-y-2 shadow-2xs">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-chip text-primary">
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <h3 className="text-sm font-bold text-heading">Order Protected</h3>
                <p className="text-xs text-muted max-w-xs mx-auto leading-relaxed">
                  For customer privacy and security, delivery address, items, and live tracking are hidden until phone ownership is confirmed.
                </p>
              </div>
            ) : (
              <>
                {/* 1. Live Transit Path Card matching track-order.png */}
                <div className="rounded-[20px] border border-border bg-card p-4 shadow-2xs space-y-3">
                  <div className="flex items-center justify-between border-b border-border/40 pb-2.5">
                    <div className="flex items-center gap-2 text-sm font-extrabold text-heading">
                      <svg className="h-4 w-4 text-primary shrink-0 -rotate-45" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                      </svg>
                      <span>Live Transit Path</span>
                    </div>
                    <span className="text-xs font-semibold text-muted">Paud Rd &rarr; Mayur Colony</span>
                  </div>

                  {/* Visual Map graphic matching track-order.png */}
                  <div className="relative h-44 w-full overflow-hidden rounded-[16px] border border-border/60 bg-surface">
                    <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox="0 0 400 180">
                      {/* Wide Road trace */}
                      <path
                        d="M 60 145 C 130 145, 170 105, 250 85 C 290 75, 320 65, 345 65"
                        fill="none"
                        stroke="var(--color-border)"
                        strokeWidth="28"
                        strokeLinecap="round"
                        opacity="0.45"
                      />
                      {/* Completed route line */}
                      <path
                        d="M 60 145 C 130 145, 170 105, 260 82"
                        fill="none"
                        stroke="var(--color-primary)"
                        strokeWidth="6"
                        strokeLinecap="round"
                      />
                      {/* Remaining dashed route line */}
                      <path
                        d="M 260 82 C 290 75, 320 65, 345 65"
                        fill="none"
                        stroke="var(--color-saffron)"
                        strokeWidth="6"
                        strokeDasharray="6 6"
                        strokeLinecap="round"
                      />
                    </svg>

                    {/* Origin Pin: Paud Road Hub */}
                    <div className="absolute left-3.5 top-24 z-10 flex items-center gap-2 rounded-[12px] border border-border bg-card px-2.5 py-1.5 shadow-xs">
                      <span className="h-2.5 w-2.5 rounded-full bg-primary shrink-0" />
                      <div className="flex flex-col">
                        <span className="text-[11px] font-extrabold text-heading leading-tight">Paud Road Hub</span>
                        <span className="text-[9px] font-semibold text-muted leading-tight">Dispatched 6:53 PM</span>
                      </div>
                    </div>

                    {/* Rider Pin on route */}
                    <div className="absolute left-[63%] top-[40%] -translate-x-1/2 -translate-y-1/2 z-20 flex h-10 w-10 items-center justify-center rounded-full border-2 border-card bg-primary text-card shadow-md">
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    </div>

                    {/* Destination Pin: Mayur Colony */}
                    <div className="absolute right-3.5 bottom-3 z-10 flex items-center gap-2 rounded-[12px] border border-border bg-card px-2.5 py-1.5 shadow-xs">
                      <svg className="h-3.5 w-3.5 text-primary shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <div className="flex flex-col">
                        <span className="text-[11px] font-extrabold text-heading leading-tight">
                          {order.address?.line1?.slice(0, 14) || 'Mayur Colony'}
                        </span>
                        <span className="text-[9px] font-semibold text-muted leading-tight">
                          {order.address?.landmark || 'Flat 402'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Stats Row */}
                  <div className="flex items-center justify-between text-xs font-semibold text-muted px-1 pt-1">
                    <span>Speed: ~22 km/h</span>
                    <span>Traffic on Karve Road: Mild</span>
                  </div>
                </div>

                {/* 2. Sachin Shinde Partner Card matching track-order.png */}
                <div className="flex items-center justify-between rounded-[20px] border border-border bg-card p-4 shadow-2xs">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] border border-border bg-surface text-primary">
                      <svg className="h-6 w-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card bg-primary" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-extrabold text-heading truncate">Sachin Shinde</h3>
                      <p className="text-xs font-medium text-muted truncate">Neighbourhood Partner</p>
                      <div className="flex items-center gap-1 text-xs font-bold text-heading mt-0.5 truncate">
                        <span className="text-primary font-black">4.9 &starf;</span>
                        <span className="text-muted font-normal">&bull;</span>
                        <span className="text-muted font-medium truncate">Verified local champion</span>
                      </div>
                    </div>
                  </div>
                  <a
                    href="tel:+919823045678"
                    className="flex min-h-[40px] items-center gap-1.5 rounded-full border border-border bg-card px-4 text-xs font-bold text-heading hover:bg-surface active:bg-chip shadow-2xs transition-colors shrink-0"
                  >
                    <svg className="h-4 w-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                    <span>Call</span>
                  </a>
                </div>

                {/* 3. Milestones Timeline matching track-order.png */}
                <div className="rounded-[20px] border border-border bg-card p-4 shadow-2xs space-y-4">
                  <div className="flex items-center justify-between border-b border-border/40 pb-2.5">
                    <h2 className="text-sm font-extrabold text-heading">Milestones</h2>
                    <span className="text-xs font-semibold text-muted">Updated real-time</span>
                  </div>

                  <div className="relative pl-7 space-y-4">
                    {/* Connecting vertical line */}
                    <div className="absolute left-[13px] top-3 bottom-3 w-0.5 bg-border" />

                    {/* Step 1: Order Placed */}
                    <div className="relative flex items-start justify-between gap-3">
                      <div className="absolute -left-[27px] top-0 flex h-7 w-7 items-center justify-center rounded-full border-2 border-card bg-card text-primary shadow-xs">
                        <svg className="h-4 w-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-extrabold text-heading block">Order Placed</span>
                        <span className="text-[11px] font-medium text-muted">Received &amp; sent to store queue</span>
                      </div>
                      <span className="text-xs font-medium text-muted shrink-0">6:42 PM</span>
                    </div>

                    {/* Step 2: Packed with Care */}
                    <div className="relative flex items-start justify-between gap-3">
                      <div className="absolute -left-[27px] top-0 flex h-7 w-7 items-center justify-center rounded-full border-2 border-card bg-card text-primary shadow-xs">
                        <svg className="h-4 w-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-extrabold text-heading block">Packed with Care</span>
                        <span className="text-[11px] font-medium text-muted">Quality verified by Ramesh Kirana</span>
                      </div>
                      <span className="text-xs font-medium text-muted shrink-0">6:49 PM</span>
                    </div>

                    {/* Step 3: Out for Delivery (Active) */}
                    <div className="relative">
                      <div className="flex items-start justify-between gap-3 rounded-[14px] border border-border/80 bg-surface/80 p-3">
                        <div className="absolute -left-[27px] top-3 flex h-7 w-7 items-center justify-center rounded-full border-2 border-card bg-saffron text-on-saffron shadow-xs">
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-extrabold text-heading">Out for Delivery</span>
                            <span className="rounded-full bg-saffron/30 px-2 py-0.2 text-[9px] font-extrabold text-on-saffron uppercase">Active</span>
                          </div>
                          <span className="text-[11px] font-medium text-muted mt-0.5 block">
                            Sachin is en route via Mayur Colony road
                          </span>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-xs font-extrabold text-heading block">6:53 PM</span>
                        </div>
                      </div>
                    </div>

                    {/* Step 4: Delivered */}
                    <div className="relative flex items-start justify-between gap-3">
                      <div className="absolute -left-[27px] top-0 flex h-7 w-7 items-center justify-center rounded-full border-2 border-card bg-card text-muted shadow-xs">
                        <span className="h-2.5 w-2.5 rounded-full bg-border" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-bold text-muted block">Delivered</span>
                        <span className="text-[11px] font-medium text-muted">Handover at doorstep</span>
                      </div>
                      <span className="text-xs font-medium text-muted shrink-0">Exp. 7:10 PM</span>
                    </div>
                  </div>
                </div>

                {/* 4. Delivery Address matching track-order.png */}
                <div className="rounded-[20px] border border-border bg-card p-4 shadow-2xs space-y-3">
                  <div className="flex items-start gap-2.5">
                    <svg className="h-4 w-4 text-primary shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-xs font-extrabold text-heading">Delivery Address</h3>
                      <p className="mt-1 text-xs font-bold text-heading leading-snug">
                        {order.address?.line1 || 'Flat 402, Mayur Colony, Kothrud'}
                      </p>
                      <p className="text-xs text-muted font-medium">
                        Pune, Maharashtra {order.address?.pincode || '411038'}
                      </p>
                    </div>
                  </div>

                  {/* Instruction for Partner Note Box */}
                  <div className="rounded-[12px] bg-surface p-3 border border-border/50 flex items-start gap-2">
                    <svg className="h-4 w-4 text-muted shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
                    </svg>
                    <div className="flex flex-col text-[11px] leading-relaxed">
                      <span className="font-bold text-heading">Instruction for Partner:</span>
                      <span className="text-muted font-medium">Leave with security at main gate if no answer.</span>
                    </div>
                  </div>
                </div>

                {/* 5. Summary Card matching track-order.png */}
                <div className="flex items-center justify-between rounded-[20px] border border-border bg-card p-4 shadow-2xs">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-sm font-extrabold text-heading">
                      <span>{order.items?.length || 3} items</span>
                      <span>&bull;</span>
                      <span>{formatPaise(order.total_paise)}</span>
                    </div>
                    <span className="text-[11px] font-medium text-muted block mt-0.5">
                      Paid via UPI ({order.payment_method === 'COD' ? 'Cash on Delivery' : 'Google Pay'})
                    </span>
                  </div>

                  {order.invoice ? (
                    <a
                      href={`${API_BASE_URL}/invoices/${order.invoice.invoice_no}/pdf`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex min-h-[40px] items-center gap-1 rounded-full border border-border bg-card px-4 text-xs font-bold text-heading hover:bg-surface active:bg-chip shadow-2xs transition-colors shrink-0"
                    >
                      <span>View Receipt</span>
                      <span className="text-primary">&rarr;</span>
                    </a>
                  ) : (
                    <Link
                      href="/orders"
                      className="flex min-h-[40px] items-center gap-1 rounded-full border border-border bg-card px-4 text-xs font-bold text-heading hover:bg-surface active:bg-chip shadow-2xs transition-colors shrink-0"
                    >
                      <span>View Receipt</span>
                      <span className="text-primary">&rarr;</span>
                    </Link>
                  )}
                </div>
              </>
            )}
          </div>
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
        <div className="flex min-h-screen items-center justify-center bg-background text-muted">
          <div className="h-8 w-8 animate-spin rounded-full border-3 border-primary border-t-transparent" />
        </div>
      }
    >
      <OrderTrackingContent />
    </Suspense>
  );
}
