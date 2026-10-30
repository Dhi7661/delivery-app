'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AdminHeader from '@/components/AdminHeader';
import { API_BASE_URL } from '@/lib/api';
import { formatPaise } from '@/lib/money';
import {
  OrderStatus,
  STATUS_LABELS,
  STATUS_ACTION_LABELS,
  STATUS_COLORS,
} from '@/lib/orderStatus';

interface AdminOrderSummary {
  id: string;
  order_no: string;
  user_id: string | null;
  guest_name: string | null;
  guest_phone: string | null;
  address: {
    line1?: string;
    landmark?: string;
    pincode?: string;
  };
  status: OrderStatus;
  subtotal_paise: number;
  delivery_fee_paise: number;
  total_paise: number;
  payment_method: string;
  payment_status: string;
  created_at: string;
  allowedTransitions: OrderStatus[];
  items: Array<{
    id: string;
    qty: number;
    selling_price_paise: number;
    line_total_paise: number;
    product: {
      name: string;
      brand: string | null;
      unit_size: string;
    };
    shop: {
      name: string;
    };
  }>;
  delivery?: {
    status: string;
  } | null;
  user?: {
    name: string | null;
    phone: string;
  } | null;
}

const FILTER_TABS: Array<{ id: string; label: string; icon: string }> = [
  { id: 'ALL', label: 'All', icon: '📋' },
  { id: 'CONFIRMED', label: 'Confirmed', icon: '✅' },
  { id: 'SENT_TO_SHOP', label: 'In Shop', icon: '🏬' },
  { id: 'PACKED', label: 'Packed', icon: '📦' },
  { id: 'OUT_FOR_DELIVERY', label: 'Out', icon: '🛵' },
  { id: 'DELIVERED', label: 'Delivered', icon: '🎉' },
  { id: 'CANCELLED', label: 'Cancelled', icon: '❌' },
  { id: 'RETURNED', label: 'Returned', icon: '↩️' },
];

export default function AdminOrdersPage() {
  const router = useRouter();
  const [adminEmail, setAdminEmail] = useState<string>('');
  const [checkingAuth, setCheckingAuth] = useState(true);

  // Filters & State
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [dateFilter, setDateFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [orders, setOrders] = useState<AdminOrderSummary[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  // Action / Transition State
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);
  const [cancelModalOrder, setCancelModalOrder] = useState<AdminOrderSummary | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  // 1. Verify admin session
  useEffect(() => {
    async function verifyAuth() {
      try {
        const res = await fetch(`${API_BASE_URL}/admin/auth/me`, {
          credentials: 'include',
        });
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.admin) {
            setAdminEmail(data.admin.email);
            setCheckingAuth(false);
            return;
          }
        }
        router.replace('/admin/login');
      } catch {
        router.replace('/admin/login');
      }
    }
    verifyAuth();
  }, [router]);

  // 2. Fetch orders
  const fetchOrders = useCallback(async () => {
    if (checkingAuth) return;
    setLoading(true);
    setActionError(null);
    try {
      const params = new URLSearchParams();
      if (selectedStatus && selectedStatus !== 'ALL') {
        params.append('status', selectedStatus);
      }
      if (dateFilter) {
        params.append('date', dateFilter);
      }
      if (searchQuery.trim()) {
        params.append('search', searchQuery.trim());
      }

      const res = await fetch(`${API_BASE_URL}/admin/orders?${params.toString()}`, {
        credentials: 'include',
      });

      if (res.ok) {
        const data = await res.json();
        setOrders(data.orders || []);
        setCounts(data.counts || {});
      } else {
        setActionError('Failed to load orders. Please refresh.');
      }
    } catch (err) {
      console.error('Failed to load admin orders:', err);
      setActionError('Network error while loading orders.');
    } finally {
      setLoading(false);
    }
  }, [checkingAuth, selectedStatus, dateFilter, searchQuery]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // 3. Handle Status Transition
  const handleTransition = async (orderId: string, targetStatus: OrderStatus, reason?: string) => {
    setUpdatingOrderId(orderId);
    setActionError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          status: targetStatus,
          reason: reason || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error || 'Failed to update order status');
        return;
      }

      // Refresh list to update counts and state
      await fetchOrders();
      setCancelModalOrder(null);
      setCancelReason('');
    } catch (err) {
      console.error('Transition error:', err);
      setActionError('Network error while updating status.');
    } finally {
      setUpdatingOrderId(null);
    }
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-500 font-medium">Verifying admin access...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900 antialiased pb-20">
      <AdminHeader adminEmail={adminEmail} activeTab="orders" />

      <main className="mx-auto w-full max-w-lg flex-1 px-3 py-3 space-y-3">
        {/* Page Title & Search Bar */}
        <div className="rounded-2xl bg-white border border-slate-200 p-3.5 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-base font-extrabold text-slate-900">Orders Board</h1>
              <p className="text-xs text-slate-400">
                {counts.total || 0} total orders &bull; Pune Camp
              </p>
            </div>
            <button
              onClick={() => fetchOrders()}
              className="px-3 py-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg min-h-[36px] flex items-center gap-1 transition-colors cursor-pointer"
              title="Refresh Orders"
            >
              <span>🔄</span>
              <span>Refresh</span>
            </button>
          </div>

          {/* Search Input */}
          <div className="relative">
            <input
              type="text"
              placeholder="Search order #, customer phone, name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-800 placeholder-slate-400 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-hidden min-h-[40px]"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2.5 text-xs text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            )}
          </div>

          {/* Date Filter & Status Dropdown Controls */}
          <div className="flex items-center gap-2">
            <div className="flex-1 flex items-center gap-1.5 rounded-xl border border-slate-200 px-2.5 py-1 bg-slate-50 min-h-[40px]">
              <span className="text-xs text-slate-400">📅</span>
              <input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="w-full bg-transparent text-xs font-medium text-slate-700 focus:outline-hidden"
                title="Filter by order date"
              />
            </div>
            {dateFilter && (
              <button
                onClick={() => setDateFilter('')}
                className="px-2.5 py-1.5 text-xs font-bold text-primary hover:bg-surface rounded-xl min-h-[40px] border border-border"
                title="Clear date filter"
              >
                Clear Date
              </button>
            )}
          </div>
        </div>

        {/* Status Filter Tabs - 2-row Responsive Grid so all 8 stages are 100% visible on screen */}
        <div className="rounded-2xl bg-white border border-slate-200 p-2.5 shadow-2xs space-y-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Filter By Stage
            </span>
            {selectedStatus !== 'ALL' && (
              <button
                onClick={() => setSelectedStatus('ALL')}
                className="text-[11px] font-bold text-primary hover:underline"
              >
                Show All ({counts.total || 0})
              </button>
            )}
          </div>

          <div className="grid grid-cols-4 gap-1.5">
            {FILTER_TABS.map((tab) => {
              const isSelected = selectedStatus === tab.id;
              const count = tab.id === 'ALL' ? counts.total || 0 : counts[tab.id] || 0;
              return (
                <button
                  key={tab.id}
                  onClick={() => setSelectedStatus(tab.id)}
                  className={`flex flex-col items-center justify-center rounded-xl py-2 px-1 text-center transition-all min-h-[50px] cursor-pointer border ${
                    isSelected
                      ? 'bg-primary text-white border-primary shadow-xs ring-2 ring-primary'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-1">
                    <span className="text-xs">{tab.icon}</span>
                    <span className="text-[11px] font-bold leading-tight">
                      {tab.label}
                    </span>
                  </div>
                  <span
                    className={`mt-1 rounded-full px-2 py-0.2 text-[10px] font-black ${
                      isSelected ? 'bg-primary text-primary' : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>


        {/* Global Error Banner */}
        {actionError && (
          <div className="rounded-xl border border-border bg-surface p-3 text-xs text-heading flex items-start gap-2 animate-fade-in">
            <span className="text-primary font-bold">⚠️</span>
            <span className="flex-1 font-medium">{actionError}</span>
            <button
              onClick={() => setActionError(null)}
              className="text-xs font-bold text-primary hover:text-heading"
            >
              ✕
            </button>
          </div>
        )}

        {/* Orders List */}
        {loading ? (
          <div className="flex min-h-[260px] flex-col items-center justify-center text-slate-400">
            <div className="h-8 w-8 animate-spin rounded-full border-3 border-primary border-t-transparent" />
            <span className="mt-3 text-xs font-medium">Loading orders...</span>
          </div>
        ) : orders.length === 0 ? (
          <div className="rounded-2xl bg-white border border-slate-200 p-8 text-center shadow-2xs">
            <span className="text-4xl">📭</span>
            <h3 className="mt-2 text-sm font-bold text-slate-800">No orders found</h3>
            <p className="mt-1 text-xs text-slate-500">
              {selectedStatus !== 'ALL' || dateFilter || searchQuery
                ? 'Try adjusting your filters or search terms.'
                : 'New orders will appear here as customers place them.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {orders.map((order) => {
              const customerName = order.user?.name || order.guest_name || 'Customer';
              const customerPhone = order.user?.phone || order.guest_phone || '';
              const statusCfg = STATUS_COLORS[order.status] || STATUS_COLORS.PLACED;
              const isUpdating = updatingOrderId === order.id;

              return (
                <div
                  key={order.id}
                  className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-2xs space-y-3 transition-all hover:border-slate-300"
                >
                  {/* Order Card Header */}
                  <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2.5">
                    <div>
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/admin/orders/${order.id}`}
                          className="font-black text-sm text-slate-900 hover:text-primary underline"
                        >
                          {order.order_no}
                        </Link>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${statusCfg.badge}`}
                        >
                          {STATUS_LABELS[order.status] || order.status}
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-400 block mt-0.5">
                        {new Date(order.created_at).toLocaleString('en-IN', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="text-sm font-black text-slate-900 block">
                        {formatPaise(order.total_paise)}
                      </span>
                      <span className="text-[10px] font-bold text-slate-400 uppercase">
                        {order.payment_method} ({order.payment_status})
                      </span>
                    </div>
                  </div>

                  {/* Customer & Location Snippet */}
                  <div className="flex items-start justify-between text-xs text-slate-600 gap-2">
                    <div>
                      <span className="font-bold text-slate-800">{customerName}</span>
                      {customerPhone && (
                        <a
                          href={`tel:${customerPhone}`}
                          className="text-primary hover:underline block text-[11px] font-medium"
                        >
                          📞 {customerPhone}
                        </a>
                      )}
                    </div>
                    <div className="text-right text-[11px] text-slate-500 max-w-[180px] truncate">
                      <span>📍 {order.address.line1 || 'Pune Camp'}</span>
                      <span className="block font-semibold text-primary">
                        {order.address.pincode || '411001'}
                      </span>
                    </div>
                  </div>

                  {/* Order Items Summary */}
                  <div className="rounded-xl bg-slate-50 p-2 text-xs space-y-1">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                      {order.items.length} {order.items.length === 1 ? 'item' : 'items'}:
                    </span>
                    {order.items.slice(0, 3).map((item) => (
                      <div key={item.id} className="flex justify-between text-[11px] text-slate-700">
                        <span className="truncate flex-1 pr-2">
                          {item.qty}× {item.product.name} ({item.product.unit_size})
                        </span>
                        <span className="font-medium text-slate-500 shrink-0">
                          {item.shop.name}
                        </span>
                      </div>
                    ))}
                    {order.items.length > 3 && (
                      <span className="text-[10px] text-slate-400 italic block">
                        +{order.items.length - 3} more items...
                      </span>
                    )}
                  </div>

                  {/* Allowed Status Actions Bar */}
                  <div className="pt-1 flex items-center justify-between gap-2 flex-wrap border-t border-slate-100">
                    <Link
                      href={`/admin/orders/${order.id}`}
                      className="text-xs font-bold text-primary hover:text-primary underline py-1"
                    >
                      View Details &rarr;
                    </Link>

                    {/* Transition Action Buttons */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {order.allowedTransitions && order.allowedTransitions.length > 0 ? (
                        order.allowedTransitions.map((target) => {
                          const isCancel = target === 'CANCELLED';
                          return (
                            <button
                              key={target}
                              disabled={isUpdating}
                              onClick={() => {
                                if (isCancel) {
                                  setCancelModalOrder(order);
                                  setCancelReason('');
                                } else {
                                  handleTransition(order.id, target);
                                }
                              }}
                              className={`rounded-lg px-2.5 py-1.5 text-xs font-bold transition-all min-h-[36px] flex items-center gap-1 active:scale-95 cursor-pointer ${
                                isCancel
                                  ? 'bg-surface text-primary border border-border hover:bg-chip'
                                  : 'bg-primary text-white shadow-2xs hover:bg-primary'
                              } ${isUpdating ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                              <span>{isCancel ? '✕' : '➜'}</span>
                              <span>{STATUS_ACTION_LABELS[target] || target}</span>
                            </button>
                          );
                        })
                      ) : (
                        <span className="text-[11px] font-bold text-slate-400 italic">
                          No further actions (Final)
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Cancellation Reason Modal */}
      {cancelModalOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl border border-slate-200 space-y-3 animate-fade-in">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">
                Cancel Order {cancelModalOrder.order_no}
              </h3>
              <button
                onClick={() => setCancelModalOrder(null)}
                className="text-slate-400 hover:text-slate-600 text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Please enter the reason for cancelling this order. This will be recorded permanently in the audit log.
            </p>

            <textarea
              required
              rows={3}
              placeholder="E.g. Customer requested cancellation / unreachable / out of stock"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              className="w-full rounded-xl border border-slate-200 p-2.5 text-xs font-medium text-slate-800 placeholder-slate-400 focus:border-border focus:outline-hidden"
            />

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setCancelModalOrder(null)}
                className="rounded-xl px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 min-h-[40px]"
              >
                Keep Order
              </button>
              <button
                type="button"
                disabled={updatingOrderId === cancelModalOrder.id}
                onClick={() => handleTransition(cancelModalOrder.id, 'CANCELLED', cancelReason)}
                className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-primary min-h-[40px] flex items-center justify-center active:scale-95 cursor-pointer"
              >
                {updatingOrderId === cancelModalOrder.id ? 'Cancelling...' : 'Confirm Cancellation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
