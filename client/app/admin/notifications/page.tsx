'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AdminHeader from '@/components/AdminHeader';
import { API_BASE_URL } from '@/lib/api';

interface NotificationRecord {
  id: string;
  order_id: string;
  order_status: string;
  recipient_type: string;
  recipient: string;
  channel: 'SMS' | 'WHATSAPP' | 'EMAIL';
  message: string;
  status: 'PENDING' | 'SENT' | 'FAILED';
  attempts: number;
  last_error: string | null;
  metadata?: {
    shop_id?: string;
    shop_name?: string;
    whatsapp_url?: string;
  } | null;
  created_at: string;
  updated_at: string;
  order?: {
    id: string;
    order_no: string;
    guest_name: string | null;
    total_paise: number;
    payment_method: string;
  } | null;
}

export default function AdminNotificationsPage() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'FAILED' | 'SENT' | 'PENDING'>('ALL');
  const [adminEmail, setAdminEmail] = useState<string>('');
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // Check admin auth and fetch notifications
  const fetchNotifications = async () => {
    try {
      setLoading(true);
      // Auth check
      const authRes = await fetch(`${API_BASE_URL}/admin/auth/me`, { credentials: 'include' });
      if (!authRes.ok) {
        router.replace('/admin/login');
        return;
      }
      const authData = await authRes.json();
      setAdminEmail(authData.admin?.email || '');

      // Notifications query
      const url = filterStatus === 'ALL'
        ? `${API_BASE_URL}/admin/notifications`
        : `${API_BASE_URL}/admin/notifications?status=${filterStatus}`;

      const res = await fetch(url, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
      }
    } catch (err) {
      console.error('Error fetching notifications:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, [filterStatus]);

  const handleRetry = async (id: string) => {
    setRetryingId(id);
    setActionMessage(null);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/notifications/${id}/retry`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (res.ok) {
        setActionMessage('Notification retried successfully!');
        // Update in place
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, ...data.notification } : n))
        );
      } else {
        setActionMessage(data.error || 'Failed to retry notification');
      }
    } catch (err) {
      setActionMessage('Network error while retrying notification');
    } finally {
      setRetryingId(null);
    }
  };

  const failedCount = notifications.filter((n) => n.status === 'FAILED').length;

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col antialiased">
      <AdminHeader adminEmail={adminEmail} activeTab="notifications" />

      <main className="flex-1 mx-auto w-full max-w-lg p-3 sm:p-4 space-y-4">
        {/* Title Bar */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-black tracking-tight text-white flex items-center gap-2">
              <span>🔔 Notification Log</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-bold">
                {notifications.length}
              </span>
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Automated customer SMS &amp; shop WhatsApp dispatch history
            </p>
          </div>

          <button
            onClick={() => fetchNotifications()}
            disabled={loading}
            className="flex items-center justify-center min-h-[38px] px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-lg border border-slate-700 active:scale-95 transition-transform cursor-pointer"
          >
            ↻ Refresh
          </button>
        </div>

        {/* Action Message Banner */}
        {actionMessage && (
          <div className="p-3 rounded-xl bg-emerald-950 border border-emerald-800 text-emerald-300 text-xs font-semibold flex items-center justify-between">
            <span>{actionMessage}</span>
            <button
              onClick={() => setActionMessage(null)}
              className="text-emerald-400 hover:text-white font-bold ml-2 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* Filter Pills */}
        <div className="flex gap-1.5 overflow-x-auto scrollbar-none pb-1">
          {(['ALL', 'FAILED', 'SENT', 'PENDING'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setFilterStatus(st)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors min-h-[36px] flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                filterStatus === st
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700'
              }`}
            >
              <span>{st}</span>
              {st === 'FAILED' && failedCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-red-600 text-white text-[10px]">
                  {failedCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Notification List */}
        {loading ? (
          <div className="flex min-h-[250px] flex-col items-center justify-center text-slate-400">
            <div className="h-8 w-8 animate-spin rounded-full border-3 border-emerald-500 border-t-transparent" />
            <span className="mt-3 text-xs font-medium">Loading notifications...</span>
          </div>
        ) : notifications.length === 0 ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-800/40 p-8 text-center text-slate-400">
            <div className="text-3xl mb-2">📭</div>
            <p className="text-sm font-bold text-slate-300">No notifications found</p>
            <p className="text-xs text-slate-500 mt-1">
              {filterStatus === 'ALL'
                ? 'No notifications have been triggered yet.'
                : `No notifications in ${filterStatus} status.`}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {notifications.map((item) => {
              const isShop = item.recipient_type === 'SHOP';
              const isWhatsApp = item.channel === 'WHATSAPP';
              const isFailed = item.status === 'FAILED';

              return (
                <div
                  key={item.id}
                  className={`rounded-2xl border p-4 space-y-2.5 transition-all ${
                    isFailed
                      ? 'border-red-900/80 bg-red-950/20 shadow-xs'
                      : 'border-slate-800 bg-slate-800/60 shadow-xs'
                  }`}
                >
                  {/* Top Bar: Recipient & Status Badges */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Recipient Type Pill */}
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                          isShop
                            ? 'bg-amber-950 text-amber-300 border border-amber-800'
                            : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                        }`}
                      >
                        {item.recipient_type}
                      </span>

                      {/* Channel Pill */}
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-700 text-slate-200 border border-slate-600 flex items-center gap-1">
                        <span>{isWhatsApp ? '💬' : '📱'}</span>
                        <span>{item.channel}</span>
                      </span>

                      {/* Order Status Trigger Pill */}
                      <span className="text-[11px] font-mono text-slate-400">
                        {item.order_status}
                      </span>
                    </div>

                    {/* Status Badge */}
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        item.status === 'SENT'
                          ? 'bg-emerald-900/60 text-emerald-300 border border-emerald-700'
                          : item.status === 'FAILED'
                          ? 'bg-red-900/80 text-red-200 border border-red-700'
                          : 'bg-amber-900/60 text-amber-300 border border-amber-700'
                      }`}
                    >
                      {item.status} ({item.attempts} {item.attempts === 1 ? 'try' : 'tries'})
                    </span>
                  </div>

                  {/* Destination & Order Reference */}
                  <div className="flex items-center justify-between text-xs text-slate-300">
                    <div>
                      <span className="text-slate-400">To: </span>
                      <span className="font-mono font-bold text-white">
                        {item.recipient}
                      </span>
                      {item.metadata?.shop_name && (
                        <span className="text-slate-400 ml-1">
                          ({item.metadata.shop_name})
                        </span>
                      )}
                    </div>

                    {item.order && (
                      <Link
                        href={`/admin/orders/${item.order.id}`}
                        className="font-mono text-emerald-400 hover:underline font-bold text-[11px]"
                      >
                        #{item.order.order_no} &rarr;
                      </Link>
                    )}
                  </div>

                  {/* Message Preview Box */}
                  <div className="rounded-xl bg-slate-900/80 p-2.5 text-xs text-slate-300 font-mono whitespace-pre-line border border-slate-800/80 break-words leading-relaxed">
                    {item.message}
                  </div>

                  {/* Error Box if Failed */}
                  {isFailed && item.last_error && (
                    <div className="rounded-lg bg-red-950/40 p-2 text-[11px] text-red-300 border border-red-900/50">
                      <strong>Failure Reason: </strong> {item.last_error}
                    </div>
                  )}

                  {/* Action Bar */}
                  <div className="flex items-center justify-between pt-1 text-[11px] text-slate-400">
                    <span>{new Date(item.created_at).toLocaleString('en-IN')}</span>

                    <div className="flex items-center gap-2">
                      {/* WhatsApp Tap Button for Shop Orders */}
                      {isWhatsApp && item.metadata?.whatsapp_url && (
                        <a
                          href={item.metadata.whatsapp_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] bg-green-700 hover:bg-green-600 text-white font-bold rounded-lg text-xs shadow-xs active:scale-95 transition-all cursor-pointer"
                        >
                          <span>💬</span>
                          <span>Send WhatsApp</span>
                        </a>
                      )}

                      {/* Retry Button for Failed */}
                      {isFailed && (
                        <button
                          onClick={() => handleRetry(item.id)}
                          disabled={retryingId === item.id}
                          className="flex items-center gap-1 px-3 py-1.5 min-h-[36px] bg-red-700 hover:bg-red-600 text-white font-bold rounded-lg text-xs shadow-xs active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                        >
                          <span>↻</span>
                          <span>{retryingId === item.id ? 'Retrying...' : 'Retry'}</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
