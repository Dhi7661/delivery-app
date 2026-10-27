'use client';

import Link from 'next/link';
import Header from '@/components/Header';
import BottomNav from '@/components/BottomNav';
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
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900 antialiased pb-24">
      <Header showBack title="My Cart" />

      <main className="mx-auto w-full max-w-md flex-1 px-3 py-3">
        {loading ? (
          <div className="flex min-h-[300px] flex-col items-center justify-center text-slate-400">
            <div className="h-8 w-8 animate-spin rounded-full border-3 border-emerald-600 border-t-transparent" />
            <span className="mt-3 text-sm font-medium">Loading your cart...</span>
          </div>
        ) : !cart || cart.items.length === 0 ? (
          <div className="flex min-h-[400px] flex-col items-center justify-center text-center px-4">
            <span className="text-6xl animate-bounce">🛍️</span>
            <h1 className="mt-4 text-lg font-bold text-slate-800">
              Your cart is empty
            </h1>
            <p className="mt-1.5 text-sm text-slate-500 max-w-xs">
              Explore daily essentials, groceries, snacks and more from your favourite local stores.
            </p>
            <Link
              href="/"
              className="mt-6 flex min-h-[48px] w-full max-w-xs items-center justify-center rounded-xl bg-emerald-600 font-bold text-sm text-white shadow-md hover:bg-emerald-700 active:scale-98 transition-transform"
            >
              Browse Categories
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {/* Free Delivery Banner & Progress Bar */}
            <div className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-2xs">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className={isFreeDelivery ? 'text-emerald-700 font-bold' : 'text-slate-700'}>
                  {cart.free_delivery_message}
                </span>
                <span className="text-slate-400 font-medium">
                  Goal: {formatPaise(freeThreshold)}
                </span>
              </div>
              {/* Progress Bar */}
              <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full transition-all duration-300 ${
                    isFreeDelivery ? 'bg-emerald-600' : 'bg-amber-500'
                  }`}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            {/* Shop info banner */}
            {cart.shop_name && (
              <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-800 border border-emerald-200">
                <span>🏪</span>
                <span className="truncate">
                  Ordering from: <strong>{cart.shop_name}</strong>
                </span>
              </div>
            )}

            {/* Cart Items List */}
            <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-2xs divide-y divide-slate-100">
              {cart.items.map((item) => (
                <div key={item.id} className="py-3 first:pt-1 last:pb-1 flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2 min-w-0">
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 truncate">
                        {item.brand} • {item.unit_size} {item.shop_name && `• ${item.shop_name}`}
                      </span>
                      <h2 className="text-sm font-bold text-slate-800 leading-snug truncate">
                        {item.name}
                      </h2>
                      <div className="mt-1 flex items-baseline gap-1.5">
                        <span className="text-xs font-bold text-slate-900">
                          {formatPaise(item.selling_price_paise)}
                        </span>
                        {item.mrp_paise > item.selling_price_paise && (
                          <span className="text-[11px] text-slate-400 line-through">
                            {formatPaise(item.mrp_paise)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Line total */}
                    <span className="text-sm font-extrabold text-slate-900 shrink-0">
                      {formatPaise(item.line_total_paise)}
                    </span>
                  </div>

                  {/* Stepper & Remove */}
                  <div className="flex items-center justify-between pt-1">
                    <button
                      type="button"
                      onClick={() => removeItem(item.product_id)}
                      className="text-xs font-semibold text-rose-600 hover:text-rose-700 active:underline py-1"
                    >
                      Remove
                    </button>

                    <div className="flex items-center rounded-xl border border-emerald-600 bg-emerald-50 font-bold text-emerald-900">
                      <button
                        type="button"
                        onClick={() => updateQty(item.product_id, item.qty - 1)}
                        aria-label={`Decrease ${item.name}`}
                        className="flex min-h-[40px] min-w-[38px] items-center justify-center text-lg text-emerald-800 hover:bg-emerald-100 active:scale-95"
                      >
                        -
                      </button>
                      <span className="px-2 text-xs font-black">{item.qty}</span>
                      <button
                        type="button"
                        onClick={() => updateQty(item.product_id, item.qty + 1)}
                        aria-label={`Increase ${item.name}`}
                        className="flex min-h-[40px] min-w-[38px] items-center justify-center text-lg text-emerald-800 hover:bg-emerald-100 active:scale-95"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Bill Summary */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Bill Summary
              </h3>

              <div className="mt-3 space-y-2 text-sm text-slate-600">
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

              {/* Checkout Button */}
              <Link
                href="/checkout"
                className="mt-5 flex min-h-[48px] w-full items-center justify-center rounded-xl bg-emerald-600 font-bold text-base text-white shadow-md hover:bg-emerald-700 active:scale-98 transition-transform"
              >
                Proceed to Checkout ({formatPaise(cart.total_paise)})
              </Link>
            </div>
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
