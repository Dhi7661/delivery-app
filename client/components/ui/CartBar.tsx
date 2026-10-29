'use client';

import React from 'react';
import Link from 'next/link';
import { useCart } from '@/context/CartContext';
import { formatPaise } from '@/lib/money';

export default function CartBar() {
  const { cart } = useCart();

  if (!cart || cart.item_count === 0) {
    return null;
  }

  return (
    <aside
      aria-label="Current cart summary"
      className="fixed bottom-16 left-0 right-0 z-40 px-4 pb-2"
    >
      <div className="mx-auto flex max-w-md items-center justify-between rounded-[16px] bg-saffron p-3 text-on-saffron shadow-lg transition-all animate-slide-up border border-border/40">
        <div className="flex items-center gap-3 min-w-0">
          {/* White icon badge */}
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-card text-primary shadow-2xs">
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
              />
            </svg>
          </div>

          <div className="flex flex-col min-w-0">
            <span className="text-sm font-black tracking-tight text-heading truncate">
              {cart.item_count} {cart.item_count === 1 ? 'item' : 'items'} • {formatPaise(cart.total_paise)}
            </span>
            <span className="text-[11px] font-bold text-on-saffron truncate">
              Delivery free above ₹499
            </span>
          </div>
        </div>

        <Link
          href="/cart"
          className="flex min-h-[44px] shrink-0 items-center gap-1 rounded-[12px] bg-primary px-4 py-2 font-black text-xs text-card shadow-xs hover:opacity-95 active:scale-95 transition-transform"
        >
          <span>View cart</span>
          <span aria-hidden="true">&rarr;</span>
        </Link>
      </div>
    </aside>
  );
}
