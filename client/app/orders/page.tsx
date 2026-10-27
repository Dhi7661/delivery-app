'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import Header from '@/components/Header';
import BottomNav from '@/components/BottomNav';
import { useAuth } from '@/context/AuthContext';
import { API_BASE_URL, OrderData } from '@/lib/api';
import { formatPaise } from '@/lib/money';

export default function OrdersPage() {
  const { user, loading: authLoading } = useAuth();
  const [orders, setOrders] = useState<OrderData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    async function fetchUserOrders() {
      try {
        setLoading(true);
        const res = await fetch(`${API_BASE_URL}/auth/orders`, {
          credentials: 'include',
        });
        if (res.ok) {
          const data = await res.json();
          setOrders(data.orders || []);
        }
      } catch (err) {
        console.error('Failed to fetch user orders:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchUserOrders();
  }, [user]);

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900 antialiased pb-24">
      <Header showBack title="My Orders" />

      <main className="mx-auto w-full max-w-md flex-1 px-3 py-4">
        {authLoading || loading ? (
          <div className="flex min-h-[300px] flex-col items-center justify-center text-slate-400">
            <div className="h-8 w-8 animate-spin rounded-full border-3 border-emerald-600 border-t-transparent" />
            <span className="mt-3 text-sm font-medium">Loading your orders...</span>
          </div>
        ) : !user ? (
          /* Unauthenticated Prompt */
          <div className="flex min-h-[360px] flex-col items-center justify-center text-center px-4">
            <span className="text-5xl">📦</span>
            <h1 className="mt-3 text-lg font-bold text-slate-800">
              Sign In to View Orders
            </h1>
            <p className="mt-1 text-sm text-slate-500 max-w-xs">
              Log in with your mobile number to view past orders and track current deliveries.
            </p>
            <Link
              href="/account"
              className="mt-5 flex min-h-[48px] w-full max-w-xs items-center justify-center rounded-xl bg-emerald-600 font-bold text-sm text-white shadow-md hover:bg-emerald-700 active:scale-98 transition-transform"
            >
              Sign In with Phone
            </Link>
          </div>
        ) : orders.length === 0 ? (
          /* Empty Orders */
          <div className="flex min-h-[360px] flex-col items-center justify-center text-center px-4">
            <span className="text-5xl">🛍️</span>
            <h1 className="mt-3 text-lg font-bold text-slate-800">
              No orders yet
            </h1>
            <p className="mt-1 text-sm text-slate-500 max-w-xs">
              You haven&apos;t placed any orders yet. Explore your local partner shops!
            </p>
            <Link
              href="/"
              className="mt-5 flex min-h-[48px] w-full max-w-xs items-center justify-center rounded-xl bg-emerald-600 font-bold text-sm text-white shadow-md hover:bg-emerald-700 active:scale-98"
            >
              Start Shopping
            </Link>
          </div>
        ) : (
          /* Orders List */
          <div className="flex flex-col gap-3">
            <h1 className="text-xs font-bold uppercase tracking-wider text-slate-400 px-1">
              Recent Orders ({orders.length})
            </h1>

            {orders.map((order) => (
              <div
                key={order.id}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs flex flex-col gap-2.5"
              >
                {/* Header */}
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-slate-800">
                    {order.order_no}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      order.status === 'CONFIRMED'
                        ? 'bg-emerald-100 text-emerald-800'
                        : order.status === 'DELIVERED'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {order.status}
                  </span>
                </div>

                {/* Items preview */}
                <div className="text-xs text-slate-600 space-y-1">
                  {order.items.slice(0, 2).map((item) => (
                    <div key={item.id} className="flex justify-between truncate">
                      <span className="truncate pr-2">
                        {item.product?.name || 'Item'} × {item.qty}
                      </span>
                      <span className="font-semibold text-slate-800 shrink-0">
                        {formatPaise(item.line_total_paise)}
                      </span>
                    </div>
                  ))}
                  {order.items.length > 2 && (
                    <span className="text-[11px] text-slate-400 block">
                      +{order.items.length - 2} more items
                    </span>
                  )}
                </div>

                {/* Total & Link */}
                <div className="border-t border-slate-100 pt-2.5 flex items-center justify-between">
                  <div>
                    <span className="text-[11px] text-slate-400 block">Total</span>
                    <span className="text-sm font-extrabold text-emerald-700">
                      {formatPaise(order.total_paise)}
                    </span>
                  </div>

                  <Link
                    href={`/orders/${order.order_no}`}
                    className="flex min-h-[36px] items-center rounded-lg bg-emerald-50 px-3 text-xs font-bold text-emerald-800 hover:bg-emerald-100 active:scale-95"
                  >
                    Track Order &rarr;
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
