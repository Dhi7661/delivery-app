'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import Header from '@/components/ui/Header';
import BottomNav from '@/components/ui/BottomNav';
import CartBar from '@/components/ui/CartBar';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import ImagePlaceholder from '@/components/ui/ImagePlaceholder';
import SegmentedTabs from '@/components/ui/SegmentedTabs';
import OrderCard from '@/components/ui/OrderCard';
import { useAuth } from '@/context/AuthContext';
import { API_BASE_URL, OrderData } from '@/lib/api';
import { formatPaise } from '@/lib/money';
import { getOrderStatusDisplay } from '@/lib/orderStatus';

const PAST_STATUSES = ['DELIVERED', 'CANCELLED', 'RETURNED', 'PAYMENT_FAILED'];

export default function OrdersPage() {
  const { user, loading: authLoading } = useAuth();
  const [orders, setOrders] = useState<OrderData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTab, setSelectedTab] = useState<'all' | 'active' | 'past'>('all');

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

  const activeOrders = orders.filter((o) => !PAST_STATUSES.includes(o.status));
  const pastOrders = orders.filter((o) => PAST_STATUSES.includes(o.status));

  const displayedOrders =
    selectedTab === 'active'
      ? activeOrders
      : selectedTab === 'past'
      ? pastOrders
      : orders;

  const tabs = [
    { id: 'all', label: `All Orders (${orders.length})` },
    { id: 'active', label: `Active (${activeOrders.length})` },
    { id: 'past', label: 'Past Orders' },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-background text-text antialiased pb-28">
      {/* Top Header */}
      <Header title="My Orders" showBack={false} />

      <main className="mx-auto w-full max-w-md flex-1 px-4 py-4 space-y-4">
        {/* Title row matching orders.png */}
        <div className="flex items-baseline justify-between">
          <h1 className="text-xl font-black text-heading">My Orders</h1>
          <span className="text-xs font-semibold text-muted">Showing all deliveries</span>
        </div>

        {authLoading || loading ? (
          <div className="flex min-h-[300px] flex-col items-center justify-center text-muted">
            <div className="h-8 w-8 animate-spin rounded-full border-3 border-primary border-t-transparent" />
            <span className="mt-3 text-sm font-semibold">Loading orders...</span>
          </div>
        ) : !user ? (
          /* Unauthenticated Prompt */
          <div className="flex min-h-[360px] flex-col items-center justify-center text-center px-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-chip text-primary">
              <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <h2 className="mt-4 text-lg font-black text-heading">
              Sign In to View Orders
            </h2>
            <p className="mt-1 text-xs font-medium text-muted max-w-xs leading-relaxed">
              Log in with your mobile number to view past orders and track current deliveries.
            </p>
            <div className="mt-6 w-full max-w-xs">
              <Link href="/account">
                <Button variant="primary" size="lg" fullWidth>
                  Sign In with Phone
                </Button>
              </Link>
            </div>
          </div>
        ) : orders.length === 0 ? (
          /* Empty Orders */
          <div className="flex min-h-[360px] flex-col items-center justify-center text-center px-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-chip text-primary">
              <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
            </div>
            <h2 className="mt-4 text-lg font-black text-heading">
              No orders yet
            </h2>
            <p className="mt-1 text-xs font-medium text-muted max-w-xs leading-relaxed">
              You haven&apos;t placed any orders yet. Explore your local partner shops!
            </p>
            <div className="mt-6 w-full max-w-xs">
              <Link href="/">
                <Button variant="primary" size="lg" fullWidth>
                  Start Shopping
                </Button>
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Filter Tabs matching orders.png */}
            <SegmentedTabs
              tabs={tabs}
              activeId={selectedTab}
              onChange={(id) => setSelectedTab(id as 'all' | 'active' | 'past')}
            />

            {/* If All is selected, show Active Delivery section then Past Orders section */}
            {selectedTab === 'all' && activeOrders.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-extrabold tracking-wider uppercase text-muted">
                  <span>Active Delivery</span>
                </div>
              </div>
            )}

            {/* Orders List */}
            <div className="space-y-3">
              {displayedOrders.length === 0 ? (
                <div className="rounded-[16px] border border-border bg-card p-6 text-center text-xs text-muted">
                  No {selectedTab} orders found.
                </div>
              ) : (
                displayedOrders.map((order) => (
                  <OrderCard key={order.id} order={order} />
                ))
              )}
            </div>
          </div>
        )}
      </main>

      <CartBar />
      <BottomNav />
    </div>
  );
}
