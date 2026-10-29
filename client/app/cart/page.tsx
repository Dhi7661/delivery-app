'use client';

import React from 'react';
import Link from 'next/link';
import Header from '@/components/ui/Header';
import BottomNav from '@/components/ui/BottomNav';
import Button from '@/components/ui/Button';
import QuantityStepper from '@/components/ui/QuantityStepper';
import ImagePlaceholder from '@/components/ui/ImagePlaceholder';
import { useCart } from '@/context/CartContext';
import { formatPaise } from '@/lib/money';

export default function CartPage() {
  const { cart, loading, updateQty, removeItem } = useCart();

  const isFreeDelivery = cart && cart.delivery_fee_paise === 0 && cart.subtotal_paise > 0;
  const freeThreshold = cart?.free_delivery_threshold_paise || 30000;
  const progressPercent = cart
    ? Math.min(100, Math.round((cart.subtotal_paise / freeThreshold) * 100))
    : 0;

  return (
    <div className="flex min-h-screen flex-col bg-background text-text antialiased pb-32">
      {/* Top Header */}
      <Header
        showBack
        title="My Basket"
      />

      <main className="mx-auto w-full max-w-md flex-1 px-4 py-4 space-y-4">
        {loading ? (
          <div className="flex min-h-[300px] flex-col items-center justify-center text-muted">
            <div className="h-8 w-8 animate-spin rounded-full border-3 border-primary border-t-transparent" />
            <span className="mt-3 text-sm font-semibold">Loading your basket...</span>
          </div>
        ) : !cart || cart.items.length === 0 ? (
          <div className="flex min-h-[400px] flex-col items-center justify-center text-center px-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-chip text-primary">
              <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
            </div>
            <h1 className="mt-4 text-lg font-black text-heading">
              Your basket is empty
            </h1>
            <p className="mt-1.5 text-xs font-medium text-muted max-w-xs leading-relaxed">
              Explore daily essentials, fresh vegetables, dairy, snacks and more from your favourite local stores.
            </p>
            <div className="mt-6 w-full max-w-xs">
              <Link href="/">
                <Button variant="primary" size="lg" fullWidth>
                  Browse Categories
                </Button>
              </Link>
            </div>
          </div>
        ) : (
          <div className="flex flex-col space-y-4">
            {/* Delivering To Card */}
            <div className="flex items-center justify-between rounded-[16px] border border-border bg-card p-3.5 shadow-2xs">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-chip text-primary">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                  </svg>
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-bold text-heading truncate">Delivering to Pune</span>
                  <span className="text-[11px] font-medium text-muted truncate">Mayur Colony • 411038</span>
                </div>
              </div>
              <span className="shrink-0 rounded-full border border-border bg-chip px-2.5 py-0.5 text-[11px] font-bold text-heading">
                Pincode 411038
              </span>
            </div>

            {/* Free Delivery Banner & Progress Bar matching cart.png */}
            <div className="rounded-[16px] border border-border bg-card p-3.5 shadow-2xs space-y-2.5">
              <div className="flex items-center justify-between text-xs font-bold">
                <div className="flex items-center gap-1.5 text-heading">
                  <svg className="h-4 w-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1m-6 0a1 1 0 100-2 1 1 0 000 2zm10 0a1 1 0 100-2 1 1 0 000 2z" />
                  </svg>
                  <span>{cart.free_delivery_message}</span>
                </div>
                {isFreeDelivery ? (
                  <span className="rounded-[6px] bg-saffron px-2 py-0.5 text-[10px] font-extrabold text-on-saffron uppercase">
                    SAVED ₹40
                  </span>
                ) : (
                  <span className="text-[11px] font-semibold text-muted">
                    Goal: {formatPaise(freeThreshold)}
                  </span>
                )}
              </div>

              {/* Progress Bar with primary fill on chip bg */}
              <div className="h-2 w-full overflow-hidden rounded-full bg-chip">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              <p className="text-[11px] font-medium text-muted">
                {isFreeDelivery
                  ? 'You qualified for standard fresh delivery without extra fees.'
                  : `Add ${formatPaise(cart.free_delivery_gap_paise)} more of essentials to unlock free delivery.`}
              </p>
            </div>


            {/* Items in Cart Section Header */}
            <div className="flex items-center justify-between text-xs font-bold text-muted px-1">
              <span className="text-heading font-extrabold">
                Items in Cart ({cart.items.length})
              </span>
              <span>Prices inclusive of taxes</span>
            </div>

            {/* Cart Items List matching cart.png */}
            <div className="space-y-3">
              {cart.items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 rounded-[16px] border border-border bg-card p-3 shadow-2xs"
                >
                  {/* Left: Product Image */}
                  <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-[12px] border border-border/40 bg-surface">
                    <ImagePlaceholder
                      label={item.name.slice(0, 8)}
                      aspectRatio="1:1"
                      className="h-full w-full object-cover"
                    />
                  </div>

                  {/* Middle: Details */}
                  <div className="flex flex-col min-w-0 flex-1">
                    <h2 className="text-sm font-bold text-heading leading-tight truncate">
                      {item.name}
                    </h2>
                    <span className="mt-0.5 text-xs font-semibold text-muted truncate">
                      {item.unit_size} {item.brand && `• ${item.brand}`}
                    </span>
                    <div className="mt-1 flex items-baseline gap-1.5">
                      <span className="text-xs font-extrabold text-heading">
                        {formatPaise(item.selling_price_paise)}
                      </span>
                      {item.mrp_paise > item.selling_price_paise && (
                        <span className="text-[11px] text-muted line-through">
                          {formatPaise(item.mrp_paise)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right: Stepper and Remove Link */}
                  <div className="flex flex-col items-end justify-between gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => removeItem(item.product_id)}
                      aria-label={`Remove ${item.name}`}
                      className="text-[11px] font-semibold text-muted underline decoration-primary hover:text-primary transition-colors cursor-pointer py-1"
                    >
                      Remove
                    </button>

                    <div className="w-28">
                      <QuantityStepper
                        quantity={item.qty}
                        onIncrease={() => updateQty(item.product_id, item.qty + 1)}
                        onDecrease={() => updateQty(item.product_id, item.qty - 1)}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Delivery Instructions matching cart.png */}
            <div className="rounded-[16px] border border-border bg-card p-3.5 shadow-2xs space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-heading">
                <span className="text-sm">📝</span>
                <span>Delivery Instructions</span>
              </div>
              <div className="flex items-center gap-2.5 rounded-[12px] border border-border bg-surface px-3 py-2 text-xs text-muted">
                <svg className="h-4 w-4 text-primary shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
                <input
                  type="text"
                  placeholder="Add society gate note (e.g. Leave with security...)"
                  className="w-full bg-transparent text-xs text-text placeholder-muted focus:outline-hidden"
                />
              </div>
            </div>

            {/* Bill Summary matching cart.png */}
            <div className="rounded-[18px] border border-border bg-card p-4 shadow-2xs space-y-3">
              <h3 className="text-sm font-extrabold text-heading">
                Bill Summary
              </h3>

              <div className="space-y-2 text-xs font-semibold text-muted">
                <div className="flex justify-between">
                  <span>Items Total</span>
                  <span className="text-heading font-bold">
                    {formatPaise(cart.subtotal_paise)}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span>Delivery Partner Fee</span>
                  {cart.delivery_fee_paise === 0 ? (
                    <span className="font-extrabold text-primary">
                      <span className="text-muted line-through mr-1 font-normal">₹40</span>
                      FREE
                    </span>
                  ) : (
                    <span className="text-heading font-bold">
                      {formatPaise(cart.delivery_fee_paise)}
                    </span>
                  )}
                </div>

                <div className="border-t border-border/50 pt-2.5 flex items-baseline justify-between text-base font-black text-heading">
                  <div>
                    <span>Total Payable</span>
                  </div>
                  <span className="text-lg">
                    {formatPaise(cart.total_paise)}
                  </span>
                </div>
              </div>
            </div>

            {/* Sourcing Footer Note matching cart.png */}
            <div className="flex items-center gap-2.5 rounded-[14px] border border-border bg-surface p-3 text-xs text-muted shadow-2xs">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-card border border-border text-primary">
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <span className="leading-snug">
                Sourced directly from Gultekdi Market Yard &amp; local Pune dairies this morning.
              </span>
            </div>
          </div>
        )}
      </main>

      {/* Sticky Fixed Bottom Checkout Bar above BottomNav matching cart.png */}
      {cart && cart.items.length > 0 && (
        <div className="fixed bottom-16 left-0 right-0 z-40 border-t border-border bg-card/95 px-4 py-2.5 backdrop-blur-md">
          <div className="mx-auto flex max-w-md items-center justify-between gap-4">
            <div className="flex flex-col">
              <span className="text-[10px] font-extrabold uppercase text-muted">To Pay</span>
              <span className="text-base font-black text-heading">
                {formatPaise(cart.total_paise)}
              </span>
            </div>
            <div className="flex-1 max-w-[250px]">
              <Link href="/checkout">
                <Button variant="primary" size="md" fullWidth className="min-h-[44px]">
                  Proceed to Checkout &bull; {formatPaise(cart.total_paise)} &rarr;
                </Button>
              </Link>
            </div>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  );
}
