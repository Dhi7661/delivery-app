'use client';

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
      className="fixed bottom-16 left-0 right-0 z-40 px-3 pb-1"
    >
      <div className="mx-auto flex max-w-md items-center justify-between rounded-2xl bg-emerald-700 px-4 py-3 text-white shadow-lg backdrop-blur-md transition-all animate-slide-up">
        <div className="flex flex-col min-w-0">
          <span className="text-[11px] font-semibold text-emerald-200 uppercase tracking-wider">
            {cart.item_count} {cart.item_count === 1 ? 'item' : 'items'}
          </span>
          <span className="text-base font-extrabold tracking-tight">
            {formatPaise(cart.total_paise)}
          </span>
        </div>

        <Link
          href="/cart"
          className="flex min-h-[44px] items-center gap-1.5 rounded-xl bg-white px-4 py-2 font-bold text-sm text-emerald-800 shadow-xs hover:bg-emerald-50 active:scale-95 transition-transform"
        >
          <span>View Cart</span>
          <span aria-hidden="true">&rarr;</span>
        </Link>
      </div>
    </aside>
  );
}
