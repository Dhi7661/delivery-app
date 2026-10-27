'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Header from '@/components/Header';
import BottomNav from '@/components/BottomNav';
import { API_BASE_URL, OrderData } from '@/lib/api';
import { formatPaise } from '@/lib/money';

function OrderDetailsContent() {
  const params = useParams();
  const orderNo = params?.orderNo as string;

  const [order, setOrder] = useState<OrderData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!orderNo) return;

    async function fetchOrder() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`${API_BASE_URL}/orders/${orderNo}`);
        if (!res.ok) {
          if (res.status === 404) {
            setError('Order not found. Please check your order number.');
          } else {
            setError('Failed to load order details.');
          }
          return;
        }
        const data = await res.json();
        setOrder(data.order);
      } catch (err) {
        console.error('Error fetching order:', err);
        setError('Network error while retrieving order details.');
      } finally {
        setLoading(false);
      }
    }

    fetchOrder();
  }, [orderNo]);

  const handleCopyOrderNo = () => {
    if (!order) return;
    navigator.clipboard?.writeText(order.order_no);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center text-slate-400">
        <div className="h-9 w-9 animate-spin rounded-full border-3 border-emerald-600 border-t-transparent" />
        <span className="mt-3 text-sm font-medium">Fetching order status...</span>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center text-center px-4">
        <span className="text-5xl">🔍</span>
        <h1 className="mt-3 text-lg font-bold text-slate-800">Order Not Found</h1>
        <p className="mt-1 text-sm text-slate-500 max-w-xs">
          {error || 'We could not locate this order.'}
        </p>
        <Link
          href="/"
          className="mt-5 flex min-h-[48px] items-center justify-center rounded-xl bg-emerald-600 px-6 font-bold text-sm text-white shadow-md hover:bg-emerald-700 active:scale-98"
        >
          Return Home
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Celebratory Confirmation Banner */}
      <div className="rounded-2xl border border-emerald-200 bg-linear-to-b from-emerald-50 to-white p-5 text-center shadow-xs">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-white shadow-md">
          <svg
            className="h-8 w-8"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="3"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="mt-3 text-xl font-black text-slate-900 tracking-tight">
          Order Confirmed!
        </h1>
        <p className="mt-1 text-xs text-slate-600">
          Thank you for ordering with PlukIt. Your order has been placed.
        </p>

        {/* Order Number & Copy */}
        <div className="mt-3.5 inline-flex items-center gap-2 rounded-xl bg-slate-100 px-3.5 py-1.5 border border-slate-200">
          <span className="text-xs font-mono font-bold text-slate-800">
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

        <div className="mt-2 flex items-center justify-center gap-1.5">
          <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
            Status: {order.status}
          </span>
        </div>
      </div>

      {/* PROMINENT CASH ON DELIVERY CALLOUT */}
      <div className="rounded-2xl border-2 border-emerald-600 bg-emerald-50/80 p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="text-2xl mt-0.5 shrink-0">💵</div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-extrabold text-slate-900 leading-snug break-words">
              Pay {formatPaise(order.total_paise)} in cash to the delivery person.
            </h2>
            <p className="mt-1 text-xs text-slate-700 leading-normal">
              Payment mode is <strong>Cash on Delivery (COD)</strong>. Please keep the exact amount ready upon delivery for quick handover.
            </p>
          </div>
        </div>
      </div>

      {/* Delivery & Customer Info */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5">
          <span>📍</span>
          <span>Delivery Details</span>
        </h3>

        <div className="text-xs text-slate-700 space-y-1">
          <div className="font-bold text-slate-900 text-sm">
            {order.guest_name}
          </div>
          <div className="text-slate-500 font-medium">
            +91 {order.guest_phone}
          </div>
          <div className="text-slate-800 mt-1">
            {order.address.line1}
            {order.address.landmark && `, ${order.address.landmark}`}
          </div>
          <div className="font-medium text-emerald-700">
            Pune Camp - {order.address.pincode}
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2 rounded-xl bg-slate-50 p-2.5 text-xs text-slate-600 border border-slate-100">
          <span>⏱️</span>
          <span>Estimated delivery: <strong>60-90 minutes</strong></span>
        </div>
      </div>

      {/* Items Breakdown */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
          Items Ordered ({order.items.length})
        </h3>

        <div className="divide-y divide-slate-100 text-xs">
          {order.items.map((item) => (
            <div key={item.id} className="py-2.5 flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                {item.product?.brand && (
                  <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                    {item.product.brand}
                  </span>
                )}
                <span className="font-bold text-slate-800 block truncate">
                  {item.product?.name || 'Product Item'}
                </span>
                <span className="text-slate-500 text-[11px]">
                  Qty: {item.qty} × {formatPaise(item.selling_price_paise)}
                  {item.product?.unit_size && ` (${item.product.unit_size})`}
                </span>
              </div>
              <span className="font-black text-slate-900 shrink-0">
                {formatPaise(item.line_total_paise)}
              </span>
            </div>
          ))}
        </div>

        {/* Totals */}
        <div className="border-t border-slate-100 pt-3 space-y-1.5 text-xs text-slate-600">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span className="font-semibold text-slate-800">
              {formatPaise(order.subtotal_paise)}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Delivery Fee</span>
            {order.delivery_fee_paise === 0 ? (
              <span className="font-bold text-emerald-600">FREE</span>
            ) : (
              <span className="font-semibold text-slate-800">
                {formatPaise(order.delivery_fee_paise)}
              </span>
            )}
          </div>
          <div className="border-t border-slate-100 pt-2 flex justify-between text-base font-black text-slate-900">
            <span>Total Payable</span>
            <span className="text-emerald-700">
              {formatPaise(order.total_paise)}
            </span>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="pt-2">
        <Link
          href="/"
          className="flex min-h-[48px] w-full items-center justify-center rounded-xl bg-emerald-600 font-bold text-base text-white shadow-md hover:bg-emerald-700 active:scale-98 transition-transform"
        >
          Continue Shopping
        </Link>
      </div>
    </div>
  );
}

export default function OrderPage() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900 antialiased pb-24">
      <Header showBack title="Order Details" />
      <main className="mx-auto w-full max-w-md flex-1 px-3 py-3">
        <Suspense
          fallback={
            <div className="flex min-h-[400px] flex-col items-center justify-center text-slate-400">
              <div className="h-9 w-9 animate-spin rounded-full border-3 border-emerald-600 border-t-transparent" />
              <span className="mt-3 text-sm font-medium">Loading order details...</span>
            </div>
          }
        >
          <OrderDetailsContent />
        </Suspense>
      </main>
      <BottomNav />
    </div>
  );
}
