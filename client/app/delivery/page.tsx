'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import RiderHeader from '@/components/RiderHeader';
import { API_BASE_URL } from '@/lib/api';

interface OrderItem {
  id: string;
  name: string;
  brand: string | null;
  unitSize: string;
  qty: number;
  sellingPricePaise: number;
  lineTotalPaise: number;
}

interface RiderOrder {
  id: string;
  orderNo: string;
  status: 'PACKED' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'FAILED_DELIVERY';
  isActive: boolean;
  createdAt: string;
  shop: {
    id: string;
    name: string;
    mapUrl: string;
  };
  items: OrderItem[];
  itemsCount: number;
  customer: {
    name: string;
    phone: string;
    phoneTel: string | null;
    address: string;
    mapUrl: string | null;
  };
  payment: {
    method: string;
    isCod: boolean;
    totalPaise: number;
    label: string;
    cashCollectedPaise: number | null;
  };
  actions: {
    canPickup: boolean;
    canDeliver: boolean;
    canFail: boolean;
  };
}

interface PendingSyncAction {
  id: string;
  orderId: string;
  action: 'pickup' | 'delivered' | 'failed';
  payload?: any;
  timestamp: number;
}

const STORAGE_QUEUE_KEY = 'plukit_rider_offline_queue';

export default function RiderDashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rider, setRider] = useState<{ id: string; name: string } | null>(null);
  const [summary, setSummary] = useState({
    activeOrdersCount: 0,
    cashToHandOverPaise: 0,
    totalCashCollectedPaise: 0,
    handedOverPaise: 0,
  });
  const [orders, setOrders] = useState<RiderOrder[]>([]);
  const [isOnline, setIsOnline] = useState(true);
  const [offlineQueue, setOfflineQueue] = useState<PendingSyncAction[]>([]);

  // Action Modals
  const [deliverModalOrder, setDeliverModalOrder] = useState<RiderOrder | null>(null);
  const [cashCollectedPaise, setCashCollectedPaise] = useState<number>(0);
  const [cashNote, setCashNote] = useState('');

  const [failModalOrder, setFailModalOrder] = useState<RiderOrder | null>(null);
  const [failReason, setFailReason] = useState<'no answer' | 'refused' | 'wrong address' | 'other'>('no answer');
  const [failNote, setFailNote] = useState('');

  const [handoverModalOpen, setHandoverModalOpen] = useState(false);
  const [handoverAmountPaise, setHandoverAmountPaise] = useState<number>(0);
  const [handoverNote, setHandoverNote] = useState('');

  const [actionLoading, setActionLoading] = useState(false);

  // Load offline queue from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_QUEUE_KEY);
      if (saved) {
        setOfflineQueue(JSON.parse(saved));
      }
    } catch {
      // Ignore storage errors
    }
  }, []);

  const saveQueue = (queue: PendingSyncAction[]) => {
    setOfflineQueue(queue);
    try {
      localStorage.setItem(STORAGE_QUEUE_KEY, JSON.stringify(queue));
    } catch (err) {
      console.error('Failed to save offline queue:', err);
    }
  };

  // Fetch orders from API
  const fetchOrders = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/delivery/orders`, {
        credentials: 'include',
      });

      if (res.status === 401) {
        router.replace('/delivery/login');
        return;
      }

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to load orders');
      }

      setRider(data.rider);
      setSummary(data.summary);
      setOrders(data.orders || []);
      setError(null);
    } catch (err: any) {
      if (!navigator.onLine) {
        setIsOnline(false);
      } else {
        setError(err.message || 'Failed to load deliveries');
      }
    } finally {
      setLoading(false);
    }
  }, [router]);

  // Network listener & sync queue processor
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      processOfflineQueue();
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    fetchOrders();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [fetchOrders]);

  // Process queued actions when connection restores (Spec Section 7.7)
  const processOfflineQueue = async () => {
    const saved = localStorage.getItem(STORAGE_QUEUE_KEY);
    if (!saved) return;

    let queue: PendingSyncAction[] = [];
    try {
      queue = JSON.parse(saved);
    } catch {
      return;
    }

    if (queue.length === 0) return;

    const remainingQueue: PendingSyncAction[] = [];
    for (const item of queue) {
      try {
        const endpoint =
          item.action === 'pickup'
            ? `${API_BASE_URL}/delivery/orders/${item.orderId}/pickup`
            : item.action === 'delivered'
            ? `${API_BASE_URL}/delivery/orders/${item.orderId}/delivered`
            : `${API_BASE_URL}/delivery/orders/${item.orderId}/failed`;

        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item.payload || {}),
          credentials: 'include',
        });

        if (!res.ok) {
          // If server rejects, keep in queue or handle
          console.warn(`Sync action ${item.id} failed with ${res.status}`);
          remainingQueue.push(item);
        }
      } catch (err) {
        console.error('Failed to sync action:', err);
        remainingQueue.push(item);
      }
    }

    saveQueue(remainingQueue);
    fetchOrders();
  };

  // 1. Picked up action
  const handlePickup = async (orderId: string) => {
    if (!navigator.onLine) {
      // Queue action offline
      const newAction: PendingSyncAction = {
        id: `sync-${Date.now()}`,
        orderId,
        action: 'pickup',
        timestamp: Date.now(),
      };
      saveQueue([...offlineQueue, newAction]);
      alert('Action saved offline. Will sync automatically when network returns.');
      return;
    }

    setActionLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/delivery/orders/${orderId}/pickup`, {
        method: 'POST',
        credentials: 'include',
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to record pickup');
      }

      await fetchOrders();
    } catch (err: any) {
      alert(err.message || 'Error recording pickup');
    } finally {
      setActionLoading(false);
    }
  };

  // 2. Delivered modal opener
  const openDeliverModal = (order: RiderOrder) => {
    setDeliverModalOrder(order);
    setCashCollectedPaise(order.payment.totalPaise);
    setCashNote('');
  };

  const handleConfirmDeliver = async () => {
    if (!deliverModalOrder) return;

    if (!navigator.onLine) {
      const newAction: PendingSyncAction = {
        id: `sync-${Date.now()}`,
        orderId: deliverModalOrder.id,
        action: 'delivered',
        payload: { cashCollectedPaise, cashNote },
        timestamp: Date.now(),
      };
      saveQueue([...offlineQueue, newAction]);
      setDeliverModalOrder(null);
      alert('Delivery marked offline. Will sync with server when network reconnects.');
      return;
    }

    setActionLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/delivery/orders/${deliverModalOrder.id}/delivered`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cashCollectedPaise, cashNote }),
        credentials: 'include',
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to record delivery');
      }

      setDeliverModalOrder(null);
      await fetchOrders();
    } catch (err: any) {
      alert(err.message || 'Error recording delivery');
    } finally {
      setActionLoading(false);
    }
  };

  // 3. Failed delivery modal opener
  const openFailModal = (order: RiderOrder) => {
    setFailModalOrder(order);
    setFailReason('no answer');
    setFailNote('');
  };

  const handleConfirmFail = async () => {
    if (!failModalOrder) return;

    if (!navigator.onLine) {
      const newAction: PendingSyncAction = {
        id: `sync-${Date.now()}`,
        orderId: failModalOrder.id,
        action: 'failed',
        payload: { reason: failReason, note: failNote },
        timestamp: Date.now(),
      };
      saveQueue([...offlineQueue, newAction]);
      setFailModalOrder(null);
      alert('Delivery failure recorded offline. Will sync with server when reconnected.');
      return;
    }

    setActionLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/delivery/orders/${failModalOrder.id}/failed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: failReason, note: failNote }),
        credentials: 'include',
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to record failed delivery');
      }

      setFailModalOrder(null);
      await fetchOrders();
    } catch (err: any) {
      alert(err.message || 'Error recording failed delivery');
    } finally {
      setActionLoading(false);
    }
  };

  // 4. Cash Handover confirm
  const openHandoverModal = () => {
    setHandoverAmountPaise(summary.cashToHandOverPaise);
    setHandoverNote('');
    setHandoverModalOpen(true);
  };

  const handleConfirmHandover = async () => {
    setActionLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/delivery/cash/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actualAmountPaise: handoverAmountPaise,
          differenceNote: handoverNote,
        }),
        credentials: 'include',
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit cash handover');
      }

      alert('Cash handover submitted! Awaiting admin acknowledgment.');
      setHandoverModalOpen(false);
      await fetchOrders();
    } catch (err: any) {
      alert(err.message || 'Error submitting cash handover');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FEF9F1] flex items-center justify-center p-4">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-[#6B3A1E] border-t-[#FEBA49] rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-sm font-bold text-[#50240A]">Loading deliveries...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FEF9F1] text-[#1D1C17] pb-24">
      {/* Header */}
      <RiderHeader
        riderName={rider?.name || 'Delivery Partner'}
        isOnline={isOnline}
        pendingSyncCount={offlineQueue.length}
      />

      <main className="mx-auto max-w-lg px-4 pt-4 space-y-4">
        {/* Wireframe Top Summary Bar (Spec Section 7.8) */}
        <div className="bg-white rounded-2xl border border-[#D7C2B9] shadow-sm p-4 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-[#52443D] uppercase tracking-wider block">
              Active Orders
            </span>
            <span className="text-2xl font-black text-[#50240A]">
              {summary.activeOrdersCount}
            </span>
          </div>

          <div className="text-right">
            <span className="text-[11px] font-bold text-[#52443D] uppercase tracking-wider block">
              Cash to Hand Over
            </span>
            <div className="flex items-center justify-end gap-2">
              <span className="text-2xl font-black text-[#704B00]">
                ₹{(summary.cashToHandOverPaise / 100).toFixed(0)}
              </span>
              {summary.cashToHandOverPaise > 0 && (
                <button
                  onClick={openHandoverModal}
                  className="px-2.5 py-1.5 min-h-[36px] bg-[#6B3A1E] text-white text-[11px] font-bold rounded-lg shadow-sm hover:bg-[#50240A] active:scale-95 cursor-pointer"
                >
                  Hand Over
                </button>
              )}
            </div>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 text-[#B42318] text-xs font-semibold rounded-xl">
            {error}
          </div>
        )}

        {/* Offline sync alert if actions are queued */}
        {offlineQueue.length > 0 && (
          <div className="p-3 bg-amber-50 border border-amber-300 text-amber-900 rounded-xl text-xs flex items-center justify-between">
            <div>
              <strong>{offlineQueue.length} action(s) pending sync.</strong>
              <p className="text-[11px] text-amber-800">
                They will be submitted as soon as your device reconnects.
              </p>
            </div>
            {isOnline && (
              <button
                onClick={processOfflineQueue}
                className="px-2.5 py-1.5 bg-[#FEBA49] text-[#704B00] font-bold text-xs rounded-lg active:scale-95"
              >
                Sync Now
              </button>
            )}
          </div>
        )}

        {/* Order Cards List matching Wireframe Section 7.8 */}
        {orders.length === 0 ? (
          <div className="bg-white rounded-2xl border border-[#D7C2B9] p-8 text-center">
            <span className="text-4xl mb-2 block">🛵</span>
            <h2 className="text-base font-extrabold text-[#50240A]">No Deliveries Assigned</h2>
            <p className="text-xs text-[#52443D] mt-1">
              New orders will appear here automatically when the shop confirms packing.
            </p>
            <button
              onClick={fetchOrders}
              className="mt-4 px-4 py-2 min-h-[44px] bg-[#F8F3EB] text-[#50240A] border border-[#D7C2B9] font-bold text-xs rounded-xl"
            >
              Refresh Orders
            </button>
          </div>
        ) : (
          orders.map((order) => {
            const hasPendingAction = offlineQueue.some((a) => a.orderId === order.id);

            return (
              <div
                key={order.id}
                className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-all ${
                  order.isActive
                    ? 'border-[#FEBA49] ring-2 ring-[#FEBA49]/20'
                    : 'border-[#D7C2B9] opacity-80'
                }`}
              >
                {/* Order Card Header */}
                <div className="bg-[#F8F3EB] px-4 py-3 border-b border-[#D7C2B9]/60 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-mono font-black text-[#50240A]">
                      ORDER {order.orderNo}
                    </span>
                    {hasPendingAction && (
                      <span className="ml-2 px-2 py-0.5 bg-amber-500 text-white rounded text-[10px] font-bold">
                        Pending sync
                      </span>
                    )}
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                      order.status === 'PACKED'
                        ? 'bg-amber-100 text-amber-800'
                        : order.status === 'OUT_FOR_DELIVERY'
                        ? 'bg-[#FEBA49] text-[#704B00]'
                        : order.status === 'DELIVERED'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {order.status === 'PACKED'
                      ? 'Ready for Pickup'
                      : order.status === 'OUT_FOR_DELIVERY'
                      ? 'Out for Delivery'
                      : order.status}
                  </span>
                </div>

                <div className="p-4 space-y-4">
                  {/* PICK UP Section */}
                  <div className="border-l-2 border-[#FEBA49] pl-3">
                    <span className="text-[10px] font-black text-[#704B00] uppercase tracking-wider block">
                      PICK UP
                    </span>
                    <h3 className="text-sm font-extrabold text-[#50240A]">
                      {order.shop.name}
                    </h3>
                    <p className="text-xs text-[#52443D] mt-0.5">
                      Items: {order.itemsCount} ({order.items.map((i) => `${i.qty}x ${i.name}`).join(', ')})
                    </p>
                    <a
                      href={order.shop.mapUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-bold text-[#6B3A1E] hover:underline mt-1.5"
                    >
                      <span>📍</span>
                      <span>Open in Google Maps</span>
                    </a>
                  </div>

                  {/* DROP OFF Section (Customer Data isolation §7.5) */}
                  <div className="border-l-2 border-[#6B3A1E] pl-3">
                    <span className="text-[10px] font-black text-[#50240A] uppercase tracking-wider block">
                      DROP OFF
                    </span>
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-extrabold text-[#1D1C17]">
                        {order.customer.name}
                      </h3>
                      {order.customer.phoneTel && (
                        <a
                          href={order.customer.phoneTel}
                          className="px-3 py-1.5 min-h-[44px] inline-flex items-center gap-1 bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-extrabold rounded-xl active:scale-95 cursor-pointer"
                        >
                          <span>📞</span>
                          <span>Call ({order.customer.phone})</span>
                        </a>
                      )}
                    </div>
                    <p className="text-xs text-[#52443D] mt-1 leading-relaxed">
                      {order.customer.address}
                    </p>
                    {order.customer.mapUrl && (
                      <a
                        href={order.customer.mapUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-bold text-[#6B3A1E] hover:underline mt-1.5"
                      >
                        <span>📍</span>
                        <span>Open in Google Maps</span>
                      </a>
                    )}
                  </div>

                  {/* PAYMENT Section */}
                  <div className="bg-[#F8F3EB] rounded-xl p-3 flex items-center justify-between">
                    <span className="text-xs font-extrabold text-[#50240A] uppercase tracking-wider">
                      Payment
                    </span>
                    <span
                      className={`text-xs font-black px-2.5 py-1 rounded-lg ${
                        order.payment.isCod
                          ? 'bg-[#FEBA49]/40 text-[#704B00]'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {order.payment.label}
                    </span>
                  </div>

                  {/* ACTION BUTTONS (Contextual, minimum 44px touch targets) */}
                  {order.isActive && (
                    <div className="pt-2 flex gap-2">
                      {order.actions.canPickup && (
                        <button
                          onClick={() => handlePickup(order.id)}
                          disabled={actionLoading}
                          className="w-full min-h-[44px] py-3 bg-[#6B3A1E] hover:bg-[#50240A] text-white font-extrabold text-xs uppercase tracking-wider rounded-xl shadow-sm transition-all active:scale-[0.98] cursor-pointer"
                        >
                          📦 Picked Up from Shop
                        </button>
                      )}

                      {order.actions.canDeliver && (
                        <>
                          <button
                            onClick={() => openDeliverModal(order)}
                            disabled={actionLoading}
                            className="flex-1 min-h-[44px] py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl shadow-sm transition-all active:scale-[0.98] cursor-pointer"
                          >
                            ✅ Delivered
                          </button>

                          <button
                            onClick={() => openFailModal(order)}
                            disabled={actionLoading}
                            className="px-3 min-h-[44px] py-3 bg-red-100 hover:bg-red-200 text-red-800 font-extrabold text-xs rounded-xl transition-all active:scale-[0.98] cursor-pointer"
                          >
                            ❌ Failed
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </main>

      {/* MODAL 1: Confirm COD Cash & Mark Delivered */}
      {deliverModalOrder && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in">
          <div className="bg-white w-full max-w-sm rounded-t-2xl sm:rounded-2xl p-5 space-y-4 shadow-xl">
            <div className="flex justify-between items-center border-b border-[#D7C2B9]/60 pb-3">
              <h3 className="font-extrabold text-base text-[#50240A]">
                Confirm Delivery
              </h3>
              <button
                onClick={() => setDeliverModalOrder(null)}
                className="text-gray-400 hover:text-gray-600 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <div>
              <p className="text-xs text-[#52443D] mb-1">
                Order <strong>{deliverModalOrder.orderNo}</strong>
              </p>
              <div className="bg-[#F8F3EB] p-3 rounded-xl mb-4">
                <span className="text-[11px] font-bold text-[#52443D] block">
                  Expected Cash
                </span>
                <span className="text-2xl font-black text-[#50240A]">
                  ₹{(deliverModalOrder.payment.totalPaise / 100).toFixed(0)}
                </span>
              </div>

              {deliverModalOrder.payment.isCod && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-[#50240A] mb-1">
                      Cash Collected (₹)
                    </label>
                    <input
                      type="number"
                      value={cashCollectedPaise / 100}
                      onChange={(e) =>
                        setCashCollectedPaise(Math.round(parseFloat(e.target.value || '0') * 100))
                      }
                      className="w-full px-3 py-2.5 min-h-[44px] bg-[#F8F3EB] border border-[#D7C2B9] rounded-xl text-base font-black text-[#1D1C17] focus:ring-2 focus:ring-[#FEBA49]"
                    />
                  </div>

                  {cashCollectedPaise !== deliverModalOrder.payment.totalPaise && (
                    <div>
                      <label className="block text-xs font-bold text-[#B42318] mb-1">
                        Difference Note (Required)
                      </label>
                      <input
                        type="text"
                        placeholder="Reason for difference (e.g. ₹5 short given change)"
                        value={cashNote}
                        onChange={(e) => setCashNote(e.target.value)}
                        className="w-full px-3 py-2 min-h-[44px] bg-red-50 border border-red-300 rounded-xl text-xs text-[#1D1C17]"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setDeliverModalOrder(null)}
                className="flex-1 py-3 min-h-[44px] bg-[#F8F3EB] font-bold text-xs rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDeliver}
                disabled={
                  actionLoading ||
                  (deliverModalOrder.payment.isCod &&
                    cashCollectedPaise !== deliverModalOrder.payment.totalPaise &&
                    cashNote.trim().length === 0)
                }
                className="flex-1 py-3 min-h-[44px] bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-extrabold text-xs rounded-xl shadow-sm"
              >
                {actionLoading ? 'Recording...' : 'Confirm Delivery'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Record Failed Delivery */}
      {failModalOrder && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in">
          <div className="bg-white w-full max-w-sm rounded-t-2xl sm:rounded-2xl p-5 space-y-4 shadow-xl">
            <div className="flex justify-between items-center border-b border-[#D7C2B9]/60 pb-3">
              <h3 className="font-extrabold text-base text-[#B42318]">
                Report Delivery Failure
              </h3>
              <button
                onClick={() => setFailModalOrder(null)}
                className="text-gray-400 hover:text-gray-600 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-[#50240A] mb-1">
                  Reason for Failure
                </label>
                <select
                  value={failReason}
                  onChange={(e: any) => setFailReason(e.target.value)}
                  className="w-full px-3 py-2.5 min-h-[44px] bg-[#F8F3EB] border border-[#D7C2B9] rounded-xl text-xs font-bold text-[#1D1C17]"
                >
                  <option value="no answer">Customer Not Answering Phone</option>
                  <option value="wrong address">Incorrect / Incomplete Address</option>
                  <option value="customer refused">Customer Refused at Door</option>
                  <option value="other">Other Issue</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#50240A] mb-1">
                  Additional Note
                </label>
                <textarea
                  rows={2}
                  placeholder="Details (e.g. called 3 times, gate locked)"
                  value={failNote}
                  onChange={(e) => setFailNote(e.target.value)}
                  className="w-full px-3 py-2 bg-[#F8F3EB] border border-[#D7C2B9] rounded-xl text-xs text-[#1D1C17]"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setFailModalOrder(null)}
                className="flex-1 py-3 min-h-[44px] bg-[#F8F3EB] font-bold text-xs rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmFail}
                disabled={actionLoading}
                className="flex-1 py-3 min-h-[44px] bg-[#B42318] hover:bg-red-800 disabled:opacity-50 text-white font-extrabold text-xs rounded-xl shadow-sm"
              >
                {actionLoading ? 'Recording...' : 'Mark Failed'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Submit Cash Handover */}
      {handoverModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in">
          <div className="bg-white w-full max-w-sm rounded-t-2xl sm:rounded-2xl p-5 space-y-4 shadow-xl">
            <div className="flex justify-between items-center border-b border-[#D7C2B9]/60 pb-3">
              <h3 className="font-extrabold text-base text-[#50240A]">
                Submit Cash Handover
              </h3>
              <button
                onClick={() => setHandoverModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div className="bg-[#F8F3EB] p-3 rounded-xl">
                <span className="text-[11px] font-bold text-[#52443D] block">
                  Expected Handover Amount
                </span>
                <span className="text-2xl font-black text-[#50240A]">
                  ₹{(summary.cashToHandOverPaise / 100).toFixed(0)}
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#50240A] mb-1">
                  Actual Cash Handing Over (₹)
                </label>
                <input
                  type="number"
                  value={handoverAmountPaise / 100}
                  onChange={(e) =>
                    setHandoverAmountPaise(Math.round(parseFloat(e.target.value || '0') * 100))
                  }
                  className="w-full px-3 py-2.5 min-h-[44px] bg-[#F8F3EB] border border-[#D7C2B9] rounded-xl text-base font-black text-[#1D1C17]"
                />
              </div>

              {handoverAmountPaise !== summary.cashToHandOverPaise && (
                <div>
                  <label className="block text-xs font-bold text-[#B42318] mb-1">
                    Difference Note (Required)
                  </label>
                  <input
                    type="text"
                    placeholder="Explanation for difference"
                    value={handoverNote}
                    onChange={(e) => setHandoverNote(e.target.value)}
                    className="w-full px-3 py-2 min-h-[44px] bg-red-50 border border-red-300 rounded-xl text-xs text-[#1D1C17]"
                  />
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setHandoverModalOpen(false)}
                className="flex-1 py-3 min-h-[44px] bg-[#F8F3EB] font-bold text-xs rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmHandover}
                disabled={
                  actionLoading ||
                  (handoverAmountPaise !== summary.cashToHandOverPaise &&
                    handoverNote.trim().length === 0)
                }
                className="flex-1 py-3 min-h-[44px] bg-[#6B3A1E] hover:bg-[#50240A] disabled:opacity-50 text-white font-extrabold text-xs rounded-xl shadow-sm"
              >
                {actionLoading ? 'Submitting...' : 'Submit Handover'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

