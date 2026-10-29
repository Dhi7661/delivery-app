'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Header from '@/components/ui/Header';
import BottomNav from '@/components/ui/BottomNav';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import { API_BASE_URL, OrderData } from '@/lib/api';
import { formatPaise } from '@/lib/money';
import { getOrderStatusDisplay } from '@/lib/orderStatus';
import { DELIVERY_ETA_TEXT } from '@/lib/brand';

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
        const res = await fetch(`${API_BASE_URL}/orders/${orderNo}`, {
          credentials: 'include',
        });
        if (!res.ok) {
          if (res.status === 404) {
            setError('Order not found. Please check your order number.');
          } else if (res.status === 403) {
            setError('Access Denied: This order does not belong to your account.');
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
      <div className="flex min-h-[400px] flex-col items-center justify-center text-muted">
        <div className="h-9 w-9 animate-spin rounded-full border-3 border-primary border-t-transparent" />
        <span className="mt-3 text-sm font-semibold">Fetching order status...</span>
      </div>
    );
  }

  if (error || !order) {
    const isAccessDenied = error?.includes('Access Denied');
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center text-center px-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-chip text-primary">
          <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h1 className="mt-4 text-lg font-black text-heading">
          {isAccessDenied ? 'Access Denied' : 'Order Not Found'}
        </h1>
        <p className="mt-1 text-xs font-medium text-muted max-w-xs">
          {error || 'We could not locate this order.'}
        </p>
        <div className="mt-6 w-full max-w-xs">
          <Link href={isAccessDenied ? '/orders' : '/'}>
            <Button variant="primary" size="lg" fullWidth>
              {isAccessDenied ? 'View My Orders' : 'Return Home'}
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const statusDisplay = getOrderStatusDisplay(order.status);

  return (
    <div className="flex flex-col space-y-4">
      {/* Hero Confirmation Card matching order-placed.png */}
      <div className="rounded-[20px] border border-border bg-card p-5 text-center shadow-2xs space-y-3">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-chip text-primary shadow-xs">
          {order.status === 'PAYMENT_PENDING' ? (
            <span className="text-2xl">⏳</span>
          ) : order.status === 'PAYMENT_FAILED' ? (
            <span className="text-2xl text-primary">✕</span>
          ) : (
            <svg className="h-8 w-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>

        <div>
          <Badge variant={statusDisplay.variant} className="px-3 py-1">
            &bull; {statusDisplay.label}
          </Badge>
        </div>

        <h1 className="text-xl font-black text-heading tracking-tight leading-snug">
          {order.status === 'PAYMENT_PENDING'
            ? `UPI Pending: Order #${order.order_no}`
            : order.status === 'PAYMENT_FAILED'
            ? `Payment Failed: Order #${order.order_no}`
            : `Aabhar! Order #${order.order_no} Placed`}
        </h1>

        <p className="text-xs font-medium text-muted max-w-xs mx-auto leading-relaxed">
          {order.status === 'PAYMENT_PENDING'
            ? 'Your UPI payment request has been received. Your order will be confirmed automatically once verified.'
            : order.status === 'PAYMENT_FAILED'
            ? 'Your payment was declined or cancelled. You can retry with UPI or Cash on Delivery.'
            : 'Your neighbourhood store has received your order and is packing fresh produce.'}
        </p>

        {/* Copy Order Number */}
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-chip px-3 py-1">
          <span className="text-xs font-mono font-bold text-heading">
            {order.order_no}
          </span>
          <button
            type="button"
            onClick={handleCopyOrderNo}
            className="text-[11px] font-bold text-primary hover:underline cursor-pointer"
          >
            {copied ? '✓ Copied' : 'Copy'}
          </button>
        </div>

        {/* 3-Step Simple Timeline matching order-placed.png */}
        <div className="pt-2 border-t border-border/40">
          <div className="flex items-center justify-between text-xs font-bold text-muted px-2">
            <div className="flex items-center gap-1 text-primary">
              <div className="h-3 w-3 rounded-full bg-primary" />
              <span>Confirmed</span>
            </div>
            <div className="h-0.5 flex-1 mx-2 bg-border" />
            <div className="flex items-center gap-1 text-muted">
              <div className="h-3 w-3 rounded-full bg-chip border border-border" />
              <span>Packing</span>
            </div>
            <div className="h-0.5 flex-1 mx-2 bg-border" />
            <div className="flex items-center gap-1 text-muted">
              <div className="h-3 w-3 rounded-full bg-chip border border-border" />
              <span>On the Way</span>
            </div>
          </div>
        </div>
      </div>

      {/* Delivery Details Card matching order-placed.png */}
      <div className="rounded-[18px] border border-border bg-card p-4 shadow-2xs space-y-3">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-chip text-primary">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="9" strokeWidth={2} />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 7v5l3 3" />
            </svg>
          </div>
          <div>
            <span className="text-[11px] font-bold uppercase text-muted block">Estimated Delivery</span>
            <span className="text-sm font-bold text-heading">
              {DELIVERY_ETA_TEXT} <span className="text-primary font-semibold">(On Schedule)</span>
            </span>
          </div>
        </div>

        <div className="border-t border-border/40 pt-2.5 flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-chip text-primary">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <div className="min-w-0 flex-1 text-xs">
            <span className="text-[11px] font-bold uppercase text-muted block">Delivering to</span>
            <span className="font-bold text-heading block">{order.guest_name}</span>
            <span className="text-muted block mt-0.5">
              {order.address.line1}
              {order.address.landmark && `, ${order.address.landmark}`}
            </span>
            <span className="text-primary font-semibold block mt-0.5">
              Pune, Maharashtra {order.address.pincode}
            </span>
          </div>
        </div>
      </div>

      {/* Order Summary Card matching order-placed.png */}
      <div className="rounded-[18px] border border-border bg-card p-4 shadow-2xs space-y-3">
        <div className="flex items-center justify-between border-b border-border/40 pb-2.5">
          <h2 className="text-xs font-extrabold uppercase tracking-wider text-muted">
            Order Summary
          </h2>
          <span className="rounded-full bg-chip px-2.5 py-0.5 text-[11px] font-bold text-heading">
            {order.items.length} {order.items.length === 1 ? 'Item' : 'Items'}
          </span>
        </div>

        <div className="divide-y divide-border/40 text-xs">
          {order.items.map((item) => (
            <div key={item.id} className="py-2.5 flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <span className="font-bold text-heading block truncate">
                  {item.product?.name || 'Item'}
                </span>
                <span className="text-muted text-[11px]">
                  {item.qty} &times; {formatPaise(item.selling_price_paise)}
                  {item.product?.unit_size && ` (${item.product.unit_size})`}
                </span>
              </div>
              <span className="font-black text-heading shrink-0">
                {formatPaise(item.line_total_paise)}
              </span>
            </div>
          ))}
        </div>

        {/* Total Line */}
        <div className="border-t border-border/50 pt-2.5 flex items-baseline justify-between text-xs">
          <div>
            <span className="font-bold text-heading block">
              {order.payment_method === 'COD' ? 'Total to Pay via Cash (COD)' : 'Total Paid via UPI'}
            </span>
            <span className="text-[10px] text-muted">
              {order.payment_method === 'COD' ? 'Keep exact cash ready' : 'Contactless doorstep delivery'}
            </span>
          </div>
          <span className="text-lg font-black text-heading">
            {formatPaise(order.total_paise)}
          </span>
        </div>

        {/* GST Invoice Section (F15) */}
        {order.invoice && (
          <div className="mt-3 pt-3 border-t border-border/40 flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-heading block">GST Tax Invoice</span>
              <span className="font-mono text-[11px] text-muted">{order.invoice.invoice_no}</span>
            </div>
            <a
              href={`${API_BASE_URL}/invoices/${order.invoice.invoice_no}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-[10px] border border-border bg-surface px-3 py-1.5 text-xs font-bold text-primary hover:bg-chip"
            >
              <span>📄</span>
              <span>Download PDF</span>
            </a>
          </div>
        )}
      </div>

      {/* Action Buttons matching order-placed.png */}
      <div className="space-y-2.5 pt-1">
        <Link href={`/orders/${order.order_no}`}>
          <Button variant="primary" size="lg" fullWidth>
            Track Order &rarr;
          </Button>
        </Link>
        <Link href="/">
          <Button variant="outline" size="lg" fullWidth>
            Continue Shopping
          </Button>
        </Link>
      </div>

      {/* Footer */}
      <div className="text-center pt-2 pb-4 space-y-0.5">
        <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-heading">
          <svg className="h-4 w-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
          <span>Direct delivery to your doorstep</span>
        </div>
      </div>
    </div>
  );
}

export default function OrderPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-text antialiased pb-28">
      <Header title="Order Placed" showBack={false} />
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-4">
        <Suspense
          fallback={
            <div className="flex min-h-[400px] flex-col items-center justify-center text-muted">
              <div className="h-9 w-9 animate-spin rounded-full border-3 border-primary border-t-transparent" />
              <span className="mt-3 text-sm font-semibold">Loading order details...</span>
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
