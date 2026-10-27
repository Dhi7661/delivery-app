'use client';

import React, { Suspense, useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
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

interface OrderDetailData {
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
  idempotency_key: string;
  created_at: string;
  updated_at: string;
  allowedTransitions: OrderStatus[];
  items: Array<{
    id: string;
    qty: number;
    mrp_paise: number;
    selling_price_paise: number;
    line_total_paise: number;
    product: {
      name: string;
      brand: string | null;
      unit_size: string;
    };
    shop: {
      name: string;
      phone?: string;
    };
  }>;
  delivery?: {
    id: string;
    status: string;
    cod_collected_paise?: number;
    failure_reason?: string | null;
    delivered_at?: string | null;
  } | null;
  user?: {
    name: string | null;
    phone: string;
    email?: string | null;
  } | null;
}

interface AuditLogEntry {
  id: string;
  actor_id: string;
  action: string;
  old_value: { status?: string } | null;
  new_value: { status?: string; reason?: string | null } | null;
  created_at: string;
}

function AdminOrderDetailContent() {
  const router = useRouter();
  const params = useParams();
  const orderId = params?.id as string;

  const [adminEmail, setAdminEmail] = useState('');
  const [checkingAuth, setCheckingAuth] = useState(true);

  const [order, setOrder] = useState<OrderDetailData | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Transition & Modal state
  const [updating, setUpdating] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

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

  // 2. Fetch order detail
  const fetchOrderDetail = useCallback(async () => {
    if (checkingAuth || !orderId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/orders/${orderId}`, {
        credentials: 'include',
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to fetch order details');
        return;
      }

      setOrder(data.order);
      setAuditLogs(data.auditLogs || []);
    } catch (err) {
      console.error('Fetch order detail error:', err);
      setError('Network error while loading order details.');
    } finally {
      setLoading(false);
    }
  }, [checkingAuth, orderId]);

  useEffect(() => {
    fetchOrderDetail();
  }, [fetchOrderDetail]);

  // 3. Status transition handler
  const handleStatusChange = async (targetStatus: OrderStatus, reason?: string) => {
    if (!order) return;
    setUpdating(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/orders/${order.id}/status`, {
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
        setError(data.error || 'Failed to update order status');
        return;
      }

      // Refresh order detail and history
      await fetchOrderDetail();
      setShowCancelModal(false);
      setCancelReason('');
    } catch (err) {
      console.error('Status update error:', err);
      setError('Network error while updating order status.');
    } finally {
      setUpdating(false);
    }
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-500 font-medium">Verifying admin access...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900 antialiased pb-20">
      <AdminHeader adminEmail={adminEmail} activeTab="orders" />

      <main className="mx-auto w-full max-w-lg flex-1 px-3 py-3 space-y-3">
        {/* Back Link & Navigation */}
        <div className="flex items-center justify-between">
          <Link
            href="/admin/orders"
            className="flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 bg-white border border-slate-200 px-3 py-2 rounded-xl min-h-[40px] shadow-2xs"
          >
            <span>&larr;</span>
            <span>Back to Orders Board</span>
          </Link>
          <button
            onClick={() => fetchOrderDetail()}
            className="text-xs font-bold text-slate-600 hover:text-slate-900 bg-white border border-slate-200 px-3 py-2 rounded-xl min-h-[40px] shadow-2xs"
          >
            🔄 Refresh
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 flex items-start gap-2 animate-fade-in">
            <span className="text-rose-600 font-bold">⚠️</span>
            <span className="flex-1 font-medium">{error}</span>
            <button onClick={() => setError(null)} className="font-bold text-rose-700">
              ✕
            </button>
          </div>
        )}

        {loading || !order ? (
          <div className="flex min-h-[300px] flex-col items-center justify-center text-slate-400">
            <div className="h-8 w-8 animate-spin rounded-full border-3 border-emerald-600 border-t-transparent" />
            <span className="mt-3 text-xs font-medium">Loading order details...</span>
          </div>
        ) : (
          <>
            {/* Status & Lifecycle Action Card */}
            {(() => {
              const statusCfg = STATUS_COLORS[order.status] || STATUS_COLORS.PLACED;
              return (
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                        Order Number
                      </span>
                      <h1 className="text-lg font-black text-slate-900 tracking-tight">
                        {order.order_no}
                      </h1>
                      <span className="text-xs text-slate-400 mt-0.5 block">
                        Placed on{' '}
                        {new Date(order.created_at).toLocaleString('en-IN', {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </span>
                    </div>

                    <div className="text-right">
                      <span
                        className={`inline-block rounded-full px-3 py-1 text-xs font-black uppercase tracking-wider ${statusCfg.badge}`}
                      >
                        {STATUS_LABELS[order.status] || order.status}
                      </span>
                      <span className="block text-[11px] font-bold text-slate-400 uppercase mt-1">
                        {order.payment_method} &bull; {order.payment_status}
                      </span>
                    </div>
                  </div>

                  {/* Status Action Buttons Bar */}
                  <div className="border-t border-slate-100 pt-3 space-y-2">
                    <span className="text-xs font-bold text-slate-600 block">
                      Next Allowed Stage Actions:
                    </span>

                    {order.allowedTransitions && order.allowedTransitions.length > 0 ? (
                      <div className="flex items-center gap-2 flex-wrap">
                        {order.allowedTransitions.map((target) => {
                          const isCancel = target === 'CANCELLED';
                          return (
                            <button
                              key={target}
                              disabled={updating}
                              onClick={() => {
                                if (isCancel) {
                                  setShowCancelModal(true);
                                  setCancelReason('');
                                } else {
                                  handleStatusChange(target);
                                }
                              }}
                              className={`rounded-xl px-3.5 py-2.5 text-xs font-bold transition-all min-h-[44px] flex items-center gap-1.5 shadow-2xs active:scale-95 cursor-pointer ${
                                isCancel
                                  ? 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100'
                                  : 'bg-emerald-600 text-white hover:bg-emerald-700'
                              } ${updating ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                              <span>{isCancel ? '✕' : '➜'}</span>
                              <span>{STATUS_ACTION_LABELS[target] || target}</span>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="rounded-xl bg-slate-50 p-2.5 text-xs font-medium text-slate-500 border border-slate-100">
                        🔒 Order is in terminal state ({STATUS_LABELS[order.status] || order.status}). No further transitions allowed.
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Customer & Delivery Address Card */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs space-y-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <span>👤</span>
                <span>Customer &amp; Delivery Destination</span>
              </h2>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-slate-400 block text-[11px]">Customer Name</span>
                  <span className="font-bold text-slate-800 text-sm">
                    {order.user?.name || order.guest_name || 'Guest Customer'}
                  </span>
                </div>

                <div>
                  <span className="text-slate-400 block text-[11px]">Phone Number</span>
                  {order.guest_phone || order.user?.phone ? (
                    <a
                      href={`tel:${order.guest_phone || order.user?.phone}`}
                      className="font-bold text-emerald-700 hover:underline text-sm inline-flex items-center gap-1"
                    >
                      <span>📞</span>
                      <span>{order.guest_phone || order.user?.phone}</span>
                    </a>
                  ) : (
                    <span className="text-slate-500 font-medium">Not provided</span>
                  )}
                </div>
              </div>

              {/* Delivery Address Snapshot */}
              <div className="rounded-xl bg-slate-50 p-3 text-xs space-y-1 border border-slate-100">
                <span className="font-bold text-slate-600 block">Delivery Address (Snapshot):</span>
                <p className="text-slate-800 font-medium leading-relaxed">
                  {order.address.line1}
                </p>
                {order.address.landmark && (
                  <p className="text-slate-500 text-[11px]">
                    Landmark: {order.address.landmark}
                  </p>
                )}
                <p className="font-bold text-emerald-800 text-[11px]">
                  Pune Camp — Pincode {order.address.pincode}
                </p>
              </div>

              {/* Delivery Record Info */}
              {order.delivery && (
                <div className="rounded-xl bg-blue-50/70 p-2.5 text-xs border border-blue-100 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-blue-900 block">
                      Delivery Tracking: {order.delivery.status}
                    </span>
                    {order.delivery.failure_reason && (
                      <span className="text-[11px] text-rose-700 block">
                        Reason: {order.delivery.failure_reason}
                      </span>
                    )}
                  </div>
                  {order.delivery.delivered_at && (
                    <span className="text-[11px] text-emerald-700 font-semibold">
                      Delivered: {new Date(order.delivery.delivered_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Order Items Card */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <span>🛍️</span>
                  <span>Order Items ({order.items.length})</span>
                </h2>
              </div>

              <div className="divide-y divide-slate-100">
                {order.items.map((item) => (
                  <div key={item.id} className="py-2.5 flex items-center justify-between text-xs gap-2">
                    <div className="flex-1 min-w-0">
                      <span className="font-bold text-slate-800 block truncate">
                        {item.product.name}
                      </span>
                      <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                        <span>{item.product.unit_size}</span>
                        <span>&bull;</span>
                        <span className="text-emerald-700 font-medium">{item.shop.name}</span>
                      </div>
                      <span className="text-[11px] text-slate-400">
                        {item.qty} × {formatPaise(item.selling_price_paise)}
                      </span>
                    </div>

                    <span className="font-bold text-slate-900 shrink-0 text-sm">
                      {formatPaise(item.line_total_paise)}
                    </span>
                  </div>
                ))}
              </div>

              {/* Financial Breakdown */}
              <div className="border-t border-slate-100 pt-3 space-y-2 text-xs text-slate-600">
                <div className="flex justify-between">
                  <span>Items Subtotal</span>
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

            {/* Audit & Transition History Card */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs space-y-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <span>📜</span>
                <span>Audit &amp; Transition History</span>
              </h2>

              {auditLogs.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No status transitions recorded yet.</p>
              ) : (
                <div className="relative pl-4 space-y-3 border-l-2 border-emerald-500/30">
                  {auditLogs.map((log) => {
                    const oldStatus = log.old_value?.status || 'INITIAL';
                    const newStatus = log.new_value?.status || 'UPDATED';
                    const reason = log.new_value?.reason;

                    return (
                      <div key={log.id} className="relative text-xs space-y-1">
                        <div className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-emerald-500 border-2 border-white" />

                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-slate-800">
                            {oldStatus} &rarr; <span className="text-emerald-700">{newStatus}</span>
                          </span>
                          <span className="text-[10px] text-slate-400 shrink-0">
                            {new Date(log.created_at).toLocaleTimeString('en-IN', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>

                        {reason && (
                          <p className="text-[11px] text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-100">
                            Reason: <em>&ldquo;{reason}&rdquo;</em>
                          </p>
                        )}

                        <span className="text-[10px] text-slate-400 block">
                          Actor: {log.actor_id}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </main>

      {/* Cancel Order Modal */}
      {showCancelModal && order && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl border border-slate-200 space-y-3 animate-fade-in">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">
                Cancel Order {order.order_no}
              </h3>
              <button
                onClick={() => setShowCancelModal(false)}
                className="text-slate-400 hover:text-slate-600 text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Please enter the reason for cancellation. This will be permanently recorded in the order audit log.
            </p>

            <textarea
              required
              rows={3}
              placeholder="E.g. Customer cancelled via phone / unreachable / out of stock"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              className="w-full rounded-xl border border-slate-200 p-2.5 text-xs font-medium text-slate-800 placeholder-slate-400 focus:border-rose-500 focus:outline-hidden"
            />

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowCancelModal(false)}
                className="rounded-xl px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 min-h-[40px]"
              >
                Keep Order
              </button>
              <button
                type="button"
                disabled={updating}
                onClick={() => handleStatusChange('CANCELLED', cancelReason)}
                className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-rose-700 min-h-[40px] flex items-center justify-center active:scale-95 cursor-pointer"
              >
                {updating ? 'Cancelling...' : 'Confirm Cancellation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminOrderDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-slate-500 font-medium">Loading order details...</p>
          </div>
        </div>
      }
    >
      <AdminOrderDetailContent />
    </Suspense>
  );
}
