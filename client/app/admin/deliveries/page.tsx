'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AdminHeader from '@/components/AdminHeader';
import { API_BASE_URL } from '@/lib/api';
import { formatPaise } from '@/lib/money';
import { OrderStatus, STATUS_LABELS, STATUS_COLORS } from '@/lib/orderStatus';

interface DeliveryOrder {
  id: string;
  order_no: string;
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
    id: string;
    status: string;
    cod_collected_paise: number;
    failure_reason?: string | null;
    delivered_at?: string | null;
    cash_note?: string | null;
  } | null;
  user?: {
    name: string | null;
    phone: string;
  } | null;
}

interface DailySummary {
  expectedCashPaise: number;
  collectedCashPaise: number;
  differencePaise: number;
  pendingCashPaise: number;
  deliveredCount: number;
  pendingDeliveryCount: number;
  totalTodayOrders: number;
}

const FAILED_REASONS = [
  { id: 'no answer', label: '📞 No answer / Unreachable' },
  { id: 'refused', label: '🙅 Customer refused order' },
  { id: 'wrong address', label: '📍 Wrong / Incomplete address' },
  { id: 'other', label: '❓ Other reason' },
];

export default function AdminDeliveriesPage() {
  const router = useRouter();
  const [adminEmail, setAdminEmail] = useState('');
  const [checkingAuth, setCheckingAuth] = useState(true);

  // Filter & State
  const [dateFilter, setDateFilter] = useState('');
  const [filterTab, setFilterTab] = useState<'ACTIVE' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'ALL'>('ACTIVE');
  const [deliveries, setDeliveries] = useState<DeliveryOrder[]>([]);
  const [summary, setSummary] = useState<DailySummary>({
    expectedCashPaise: 0,
    collectedCashPaise: 0,
    differencePaise: 0,
    pendingCashPaise: 0,
    deliveredCount: 0,
    pendingDeliveryCount: 0,
    totalTodayOrders: 0,
  });
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);

  // Modals & Action State
  const [activeActionOrderId, setActiveActionOrderId] = useState<string | null>(null);

  // Delivered / Cash Modal
  const [cashModalOrder, setCashModalOrder] = useState<DeliveryOrder | null>(null);
  const [cashAmountRupees, setCashAmountRupees] = useState('');
  const [cashDifferenceNote, setCashDifferenceNote] = useState('');
  const [submittingDelivery, setSubmittingDelivery] = useState(false);

  // Failed Delivery Modal
  const [failedModalOrder, setFailedModalOrder] = useState<DeliveryOrder | null>(null);
  const [failedReason, setFailedReason] = useState<string>('no answer');
  const [failedNote, setFailedNote] = useState('');
  const [submittingFailed, setSubmittingFailed] = useState(false);
  const [handovers, setHandovers] = useState<any[]>([]);
  const [acknowledgingId, setAcknowledgingId] = useState<string | null>(null);


  const fetchHandovers = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/admin/cash-handovers`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setHandovers(data.handovers || []);
      }
    } catch (err) {
      console.error('Error fetching handovers:', err);
    }
  }, []);

  const handleAcknowledgeHandover = async (id: string) => {
    setAcknowledgingId(id);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/cash-handovers/${id}/acknowledge`, {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        await fetchHandovers();
        await fetchDeliveries();
      }
    } catch (err) {
      console.error('Error acknowledging handover:', err);
    } finally {
      setAcknowledgingId(null);
    }
  };

  // 1. Check admin authentication
  useEffect(() => {
    async function verifyAuth() {
      try {
        const res = await fetch(`${API_BASE_URL}/admin/auth/me`, { credentials: 'include' });
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

  // 2. Fetch deliveries & daily COD summary
  const fetchDeliveries = useCallback(async () => {
    if (checkingAuth) return;
    setLoading(true);
    setActionError(null);
    try {
      const params = new URLSearchParams();
      if (dateFilter) params.append('date', dateFilter);
      if (filterTab) params.append('status', filterTab);

      const res = await fetch(`${API_BASE_URL}/admin/deliveries?${params.toString()}`, {
        credentials: 'include',
      });
      const data = await res.json();

      if (res.ok) {
        setDeliveries(data.deliveries || []);
        if (data.summary) setSummary(data.summary);
      } else {
        setActionError(data.error || 'Failed to load deliveries');
      }
    } catch (err) {
      console.error('Failed to load deliveries:', err);
      setActionError('Network error while loading deliveries');
    } finally {
      setLoading(false);
    }
  }, [checkingAuth, dateFilter, filterTab]);

  useEffect(() => {
    fetchDeliveries();
    fetchHandovers();
  }, [fetchDeliveries, fetchHandovers]);

  // 3. Action: Start Delivery (PACKED -> OUT_FOR_DELIVERY)
  const handleStartDelivery = async (orderId: string) => {
    setActiveActionOrderId(orderId);
    setActionError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/deliveries/${orderId}/start`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();

      if (!res.ok) {
        setActionError(data.error || 'Failed to start delivery');
        return;
      }
      await fetchDeliveries();
    } catch (err) {
      console.error('Error starting delivery:', err);
      setActionError('Network error while starting delivery');
    } finally {
      setActiveActionOrderId(null);
    }
  };

  // 4. Open Cash / Delivered Modal
  const openDeliveredModal = (order: DeliveryOrder) => {
    setCashModalOrder(order);
    // Pre-fill with exact total in rupees
    setCashAmountRupees((order.total_paise / 100).toString());
    setCashDifferenceNote('');
    setActionError(null);
  };

  // 5. Submit Delivered & Cash Collection
  const handleConfirmDelivered = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cashModalOrder) return;

    const cashEntered = parseFloat(cashAmountRupees);
    if (isNaN(cashEntered) || cashEntered < 0) {
      setActionError('Please enter a valid cash amount in ₹');
      return;
    }

    const collectedPaise = Math.round(cashEntered * 100);
    const diff = collectedPaise - cashModalOrder.total_paise;

    if (diff !== 0 && (!cashDifferenceNote || cashDifferenceNote.trim().length === 0)) {
      setActionError('Cash collected does not match order total. A note is required explaining the difference.');
      return;
    }

    setSubmittingDelivery(true);
    setActionError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/deliveries/${cashModalOrder.id}/delivered`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          cashCollectedPaise: collectedPaise,
          cashNote: cashDifferenceNote.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error || 'Failed to mark delivery as delivered');
        setSubmittingDelivery(false);
        return;
      }

      setCashModalOrder(null);
      await fetchDeliveries();
      await fetchHandovers();
    } catch (err) {
      console.error('Error delivering order:', err);
      setActionError('Network error while submitting delivery status');
    } finally {
      setSubmittingDelivery(false);
    }
  };

  // 6. Submit Failed Delivery
  const handleConfirmFailed = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!failedModalOrder) return;

    setSubmittingFailed(true);
    setActionError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/deliveries/${failedModalOrder.id}/failed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          reason: failedReason,
          note: failedNote.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error || 'Failed to record failed delivery');
        setSubmittingFailed(false);
        return;
      }

      setFailedModalOrder(null);
      await fetchDeliveries();
    } catch (err) {
      console.error('Error recording delivery failure:', err);
      setActionError('Network error while recording failed delivery');
    } finally {
      setSubmittingFailed(false);
    }
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-500 font-medium">Verifying delivery credentials...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900 antialiased pb-24">
      <AdminHeader adminEmail={adminEmail} activeTab="deliveries" />

      <main className="mx-auto w-full max-w-lg flex-1 px-3 py-3 space-y-3">
        {/* Daily COD Cash Summary Card */}
        <div className="rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 text-white p-4 shadow-md space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">💵</span>
              <div>
                <h1 className="text-sm font-black tracking-tight text-white">Daily Cash &amp; Deliveries</h1>
                <p className="text-[11px] text-slate-300">
                  {summary.deliveredCount} delivered &bull; {summary.pendingDeliveryCount} pending
                </p>
              </div>
            </div>
            <button
              onClick={() => fetchDeliveries()}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-bold border border-slate-700 min-h-[36px] flex items-center gap-1 active:scale-95 cursor-pointer"
              title="Refresh"
            >
              <span>🔄</span>
              <span>Sync</span>
            </button>
          </div>

          {/* 3-Pillar Cash Breakdown */}
          <div className="grid grid-cols-3 gap-2 border-t border-slate-700/80 pt-3 text-center">
            <div className="rounded-xl bg-slate-800/80 p-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Expected
              </span>
              <span className="text-sm font-black text-slate-100 block mt-0.5">
                {formatPaise(summary.expectedCashPaise)}
              </span>
            </div>

            <div className="rounded-xl bg-primary/70 border border-primary/60 p-2">
              <span className="text-[10px] font-bold text-primary uppercase tracking-wider block">
                Collected
              </span>
              <span className="text-sm font-black text-primary block mt-0.5">
                {formatPaise(summary.collectedCashPaise)}
              </span>
            </div>

            <div
              className={`rounded-xl p-2 border ${
                summary.differencePaise === 0
                  ? 'bg-slate-800/80 border-slate-700 text-slate-200'
                  : summary.differencePaise > 0
                  ? 'bg-primary/80 border-primary text-primary'
                  : 'bg-surface border-border text-primary'
              }`}
            >
              <span className="text-[10px] font-bold uppercase tracking-wider block opacity-80">
                Difference
              </span>
              <span className="text-sm font-black block mt-0.5">
                {summary.differencePaise === 0
                  ? '₹0'
                  : `${summary.differencePaise > 0 ? '+' : ''}${formatPaise(summary.differencePaise)}`}
              </span>
            </div>
          </div>
        </div>

        {/* Date Filter & Status Segmented Buttons */}
        <div className="space-y-2">
          {/* Date Selector */}
          <div className="flex items-center justify-between gap-2 bg-white rounded-xl border border-slate-200 p-2 shadow-2xs">
            <div className="flex items-center gap-1.5 flex-1">
              <span className="text-xs text-slate-400">📅</span>
              <input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="w-full text-xs font-bold text-slate-700 bg-transparent focus:outline-hidden"
                title="Delivery Date"
              />
            </div>
            {dateFilter && (
              <button
                onClick={() => setDateFilter('')}
                className="text-[11px] font-bold text-primary hover:underline px-1"
              >
                Today
              </button>
            )}
          </div>

          {/* 4 Quick Segmented Filter Tabs */}
          <div className="grid grid-cols-4 gap-1.5">
            {[
              { id: 'ACTIVE', label: 'Active', icon: '⚡' },
              { id: 'OUT_FOR_DELIVERY', label: 'Out (Out)', icon: '🛵' },
              { id: 'DELIVERED', label: 'Delivered', icon: '✅' },
              { id: 'ALL', label: 'All Today', icon: '📋' },
            ].map((tab) => {
              const isSelected = filterTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setFilterTab(tab.id as any)}
                  className={`flex flex-col items-center justify-center rounded-xl py-2 px-1 text-center transition-all min-h-[46px] border cursor-pointer ${
                    isSelected
                      ? 'bg-primary text-white border-primary shadow-xs ring-2 ring-primary'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <span className="text-xs">{tab.icon}</span>
                  <span className="text-[11px] font-bold leading-tight mt-0.5">
                    {tab.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Global Error Banner */}
        
        {/* Spec Section 7.4: Daily Cash Handover Acknowledgment */}
        {handovers.length > 0 && (
          <div className="rounded-2xl border border-amber-300 bg-amber-50/70 p-3.5 space-y-2.5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-amber-950 uppercase tracking-wider flex items-center gap-1.5">
                <span>🤝</span> Rider Cash Handovers
              </span>
              <span className="text-[10px] font-bold text-amber-800 bg-amber-200/60 px-2 py-0.5 rounded-full">
                Spec §7.4
              </span>
            </div>

            <div className="space-y-2">
              {handovers.map((h: any) => {
                const isPending = !h.admin_confirmed_at;
                return (
                  <div
                    key={h.id}
                    className="bg-white rounded-xl border border-amber-200/80 p-2.5 flex items-center justify-between gap-2 shadow-2xs"
                  >
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-extrabold text-[#50240A]">
                          {h.rider?.name || 'Rider'}
                        </span>
                        <span className="text-[10px] text-gray-500 font-mono">
                          ({h.rider?.phone})
                        </span>
                      </div>
                      <div className="text-xs font-black text-emerald-700 mt-0.5">
                        Handing Over: ₹{(h.actual_amount_paise / 100).toFixed(0)}
                        {h.expected_amount_paise !== h.actual_amount_paise && (
                          <span className="text-[10px] text-red-600 font-normal ml-1">
                            (Expected: ₹{(h.expected_amount_paise / 100).toFixed(0)})
                          </span>
                        )}
                      </div>
                      {h.difference_note && (
                        <p className="text-[10px] text-gray-600 italic mt-0.5">
                          Note: {h.difference_note}
                        </p>
                      )}
                    </div>

                    <div>
                      {isPending ? (
                        <button
                          onClick={() => handleAcknowledgeHandover(h.id)}
                          disabled={acknowledgingId === h.id}
                          className="px-3 py-2 min-h-[44px] bg-[#6B3A1E] hover:bg-[#50240A] text-white font-extrabold text-xs rounded-xl shadow-xs active:scale-95 cursor-pointer disabled:opacity-50"
                        >
                          {acknowledgingId === h.id ? 'Saving...' : 'Acknowledge Receipt'}
                        </button>
                      ) : (
                        <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase rounded-lg">
                          ✓ Acknowledged
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {actionError && (
          <div className="rounded-xl border border-border bg-surface p-3 text-xs text-heading flex items-start gap-2 animate-fade-in">
            <span className="text-primary font-bold">⚠️</span>
            <span className="flex-1 font-medium">{actionError}</span>
            <button onClick={() => setActionError(null)} className="font-bold text-primary">
              ✕
            </button>
          </div>
        )}

        {/* Deliveries List */}
        {loading ? (
          <div className="flex min-h-[260px] flex-col items-center justify-center text-slate-400">
            <div className="h-8 w-8 animate-spin rounded-full border-3 border-primary border-t-transparent" />
            <span className="mt-3 text-xs font-medium">Loading deliveries...</span>
          </div>
        ) : deliveries.length === 0 ? (
          <div className="rounded-2xl bg-white border border-slate-200 p-8 text-center shadow-2xs">
            <span className="text-4xl">🛵</span>
            <h3 className="mt-2 text-sm font-bold text-slate-800">No deliveries in this stage</h3>
            <p className="mt-1 text-xs text-slate-500">
              {filterTab === 'ACTIVE'
                ? "No active deliveries pending. Check 'All Today' or 'Delivered' tabs."
                : 'No orders match the selected filter.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {deliveries.map((order, idx) => {
              const customerName = order.user?.name || order.guest_name || 'Customer';
              const customerPhone = order.user?.phone || order.guest_phone || '';
              const isActioning = activeActionOrderId === order.id;
              const statusCfg = STATUS_COLORS[order.status] || STATUS_COLORS.PLACED;
              const pincode = order.address.pincode || '411001';

              return (
                <div
                  key={order.id}
                  className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-2xs space-y-3 transition-all hover:border-slate-300"
                >
                  {/* Delivery Order Header */}
                  <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-xs font-black text-slate-600">
                        {idx + 1}
                      </span>
                      <div>
                        <Link
                          href={`/admin/orders/${order.id}`}
                          className="font-black text-sm text-slate-900 hover:text-primary underline"
                        >
                          {order.order_no}
                        </Link>
                        <span className="text-[11px] text-slate-400 block">
                          {new Date(order.created_at).toLocaleTimeString('en-IN', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-sm font-black text-slate-900 block">
                        {formatPaise(order.total_paise)}
                      </span>
                      <span
                        className={`inline-block rounded-full px-2 py-0.2 text-[10px] font-black uppercase tracking-wider ${statusCfg.badge}`}
                      >
                        {STATUS_LABELS[order.status] || order.status}
                      </span>
                    </div>
                  </div>

                  {/* Address & Pincode Pill */}
                  <div className="rounded-xl bg-chip/70 border border-primary/80 p-2.5 text-xs text-slate-800 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-extrabold uppercase text-primary flex items-center gap-1">
                        <span>📍</span>
                        <span>Pune Camp ({pincode})</span>
                      </span>
                      <span className="text-[10px] font-bold text-slate-500 bg-white px-2 py-0.5 rounded-full border border-slate-200">
                        {order.items.length} {order.items.length === 1 ? 'item' : 'items'}
                      </span>
                    </div>
                    <p className="font-semibold leading-snug">{order.address.line1}</p>
                    {order.address.landmark && (
                      <p className="text-[11px] text-slate-500">
                        Landmark: {order.address.landmark}
                      </p>
                    )}
                  </div>

                  {/* One-Handed Big Touch Phone Dial Button */}
                  {customerPhone ? (
                    <a
                      href={`tel:${customerPhone}`}
                      className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold border border-slate-200 transition-colors active:scale-98"
                    >
                      <span className="text-base">📞</span>
                      <span>Call {customerName} (+91 {customerPhone})</span>
                    </a>
                  ) : (
                    <div className="text-xs text-slate-400 italic">No phone number recorded</div>
                  )}

                  {/* Order Stage Actions (Built for single-thumb mobile use) */}
                  <div className="pt-1">
                    {order.status === 'PACKED' && (
                      <button
                        onClick={() => handleStartDelivery(order.id)}
                        disabled={isActioning}
                        className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-primary hover:bg-primary text-white font-extrabold text-sm shadow-md transition-all active:scale-98 cursor-pointer"
                      >
                        <span>🛵</span>
                        <span>{isActioning ? 'Starting...' : 'Start Delivery (Dispatch)'}</span>
                      </button>
                    )}

                    {order.status === 'OUT_FOR_DELIVERY' && (
                      <div className="flex flex-col gap-2">
                        <button
                          onClick={() => openDeliveredModal(order)}
                          className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-primary hover:bg-primary text-white font-black text-sm shadow-md transition-all active:scale-98 cursor-pointer"
                        >
                          <span>✅</span>
                          <span>Delivered &bull; Collect {formatPaise(order.total_paise)}</span>
                        </button>

                        <button
                          onClick={() => {
                            setFailedModalOrder(order);
                            setFailedReason('no answer');
                            setFailedNote('');
                          }}
                          className="flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-xl bg-surface hover:bg-chip text-primary font-bold text-xs border border-border transition-all cursor-pointer"
                        >
                          <span>⚠️</span>
                          <span>Mark Delivery Failed</span>
                        </button>
                      </div>
                    )}

                    {order.status === 'SENT_TO_SHOP' && (
                      <div className="flex items-center justify-between rounded-xl bg-purple-50 p-2.5 text-xs text-purple-900 border border-purple-200">
                        <div className="flex items-center gap-1.5 font-medium">
                          <span>🏬</span>
                          <span>Waiting for shop to pack items</span>
                        </div>
                        <Link
                          href={`/admin/orders/${order.id}`}
                          className="font-bold underline text-purple-800"
                        >
                          Details &rarr;
                        </Link>
                      </div>
                    )}

                    {order.status === 'DELIVERED' && (
                      <div className="rounded-xl bg-chip p-2.5 text-xs text-primary border border-primary space-y-1">
                        <div className="flex items-center justify-between font-bold">
                          <span>✓ Delivered successfully</span>
                          <span className="text-primary">
                            Cash: {formatPaise(order.delivery?.cod_collected_paise || order.total_paise)}
                          </span>
                        </div>
                        {order.delivery?.cash_note && (
                          <p className="text-[11px] text-primary italic">
                            Note: &ldquo;{order.delivery.cash_note}&rdquo;
                          </p>
                        )}
                      </div>
                    )}

                    {order.status === 'FAILED_DELIVERY' && (
                      <div className="rounded-xl bg-surface p-2.5 text-xs text-heading border border-border">
                        <span className="font-bold block">Delivery Failed</span>
                        <span className="text-[11px] text-primary">
                          {order.delivery?.failure_reason || 'Attempt failed'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Delivered & Cash Collection Modal */}
      {cashModalOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <form
            onSubmit={handleConfirmDelivered}
            className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl border border-slate-200 space-y-3.5 animate-fade-in"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="text-sm font-black text-slate-900">
                Confirm Delivery &bull; {cashModalOrder.order_no}
              </h3>
              <button
                type="button"
                onClick={() => setCashModalOrder(null)}
                className="text-slate-400 hover:text-slate-600 text-xs font-bold"
              >
                ✕
              </button>
            </div>

            {/* Expected Amount Callout */}
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-center">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                Total Amount Due (COD)
              </span>
              <span className="text-2xl font-black text-primary block mt-0.5">
                {formatPaise(cashModalOrder.total_paise)}
              </span>
            </div>

            {/* Cash Collected Input */}
            <div>
              <label htmlFor="cash-collected" className="block text-xs font-bold text-slate-700 mb-1">
                Cash Amount Collected (₹) <span className="text-primary">*</span>
              </label>
              <div className="flex rounded-xl border border-slate-200 overflow-hidden focus-within:border-primary focus-within:ring-1 focus-within:ring-primary min-h-[48px]">
                <span className="flex items-center bg-slate-50 px-3 text-sm font-bold text-slate-500 border-r border-slate-200">
                  ₹
                </span>
                <input
                  id="cash-collected"
                  type="number"
                  step="0.01"
                  required
                  min="0"
                  value={cashAmountRupees}
                  onChange={(e) => setCashAmountRupees(e.target.value)}
                  className="w-full px-3 py-2 text-base font-black text-slate-900 focus:outline-hidden"
                />
              </div>
            </div>

            {/* Discrepancy Alert & Mandatory Note Field */}
            {(() => {
              const entered = parseFloat(cashAmountRupees);
              const diffPaise = !isNaN(entered) ? Math.round(entered * 100) - cashModalOrder.total_paise : 0;
              if (diffPaise !== 0) {
                return (
                  <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 space-y-2 animate-fade-in">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900">
                      <span>⚠️</span>
                      <span>
                        Cash difference: {diffPaise > 0 ? '+' : ''}{diffPaise / 100} ₹
                      </span>
                    </div>
                    <label htmlFor="cash-diff-note" className="block text-[11px] font-bold text-amber-800">
                      Explanation Note <span className="text-primary">* Required</span>
                    </label>
                    <textarea
                      id="cash-diff-note"
                      required
                      rows={2}
                      placeholder="E.g. Customer did not have exact change / tip included / partial cash"
                      value={cashDifferenceNote}
                      onChange={(e) => setCashDifferenceNote(e.target.value)}
                      className="w-full rounded-lg border border-amber-300 p-2 text-xs font-medium text-slate-900 focus:outline-hidden bg-white"
                    />
                  </div>
                );
              }
              return (
                <p className="text-[11px] text-primary font-medium">
                  ✓ Collected amount matches exact order total.
                </p>
              );
            })()}

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setCashModalOrder(null)}
                className="rounded-xl px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 min-h-[44px]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submittingDelivery}
                className="flex-1 rounded-xl bg-primary px-4 py-2 text-xs font-black text-white shadow-md hover:bg-primary min-h-[48px] flex items-center justify-center active:scale-98 cursor-pointer"
              >
                {submittingDelivery ? 'Recording...' : 'Confirm Delivery & Cash'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Failed Delivery Modal */}
      {failedModalOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <form
            onSubmit={handleConfirmFailed}
            className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl border border-slate-200 space-y-3.5 animate-fade-in"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="text-sm font-black text-slate-900">
                Mark Delivery Failed &bull; {failedModalOrder.order_no}
              </h3>
              <button
                type="button"
                onClick={() => setFailedModalOrder(null)}
                className="text-slate-400 hover:text-slate-600 text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Please choose the failure reason. The order status will transition to <strong>FAILED_DELIVERY</strong>.
            </p>

            <div className="space-y-1.5">
              {FAILED_REASONS.map((r) => (
                <label
                  key={r.id}
                  className={`flex items-center gap-2.5 rounded-xl border p-2.5 text-xs font-bold transition-colors cursor-pointer min-h-[44px] ${
                    failedReason === r.id
                      ? 'border-border bg-surface text-heading'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="failedReason"
                    value={r.id}
                    checked={failedReason === r.id}
                    onChange={(e) => setFailedReason(e.target.value)}
                    className="h-4 w-4 text-primary focus:ring-primary"
                  />
                  <span>{r.label}</span>
                </label>
              ))}
            </div>

            <div>
              <label htmlFor="failed-note" className="block text-[11px] font-bold text-slate-700 mb-1">
                Additional Note <span className="text-slate-400 font-normal">(Optional)</span>
              </label>
              <textarea
                id="failed-note"
                rows={2}
                placeholder="E.g. Called twice at 2:15 PM and 2:30 PM, no response at gate"
                value={failedNote}
                onChange={(e) => setFailedNote(e.target.value)}
                className="w-full rounded-xl border border-slate-200 p-2 text-xs font-medium text-slate-800 placeholder-slate-400 focus:border-border focus:outline-hidden"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setFailedModalOrder(null)}
                className="rounded-xl px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 min-h-[44px]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submittingFailed}
                className="flex-1 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-primary min-h-[48px] flex items-center justify-center active:scale-98 cursor-pointer"
              >
                {submittingFailed ? 'Submitting...' : 'Submit Delivery Failure'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
