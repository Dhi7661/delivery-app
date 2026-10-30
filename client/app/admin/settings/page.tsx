'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminHeader from '@/components/AdminHeader';
import { API_BASE_URL } from '@/lib/api';

interface AuditLogEntry {
  id: string;
  admin_id: string;
  action: string;
  target_type: string;
  target_id: string | null;
  changes: any;
  created_at: string;
}

export default function AdminSettingsPage() {
  const router = useRouter();
  const [adminEmail, setAdminEmail] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [onlinePaymentsEnabled, setOnlinePaymentsEnabled] = useState<boolean>(true);
  const [reason, setReason] = useState<string>('');
  const [rawSettings, setRawSettings] = useState<Record<string, string>>({});
  const [recentLogs, setRecentLogs] = useState<AuditLogEntry[]>([]);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const authRes = await fetch(`${API_BASE_URL}/admin/auth/me`, { credentials: 'include' });
      if (!authRes.ok) {
        router.replace('/admin/login');
        return;
      }
      const authData = await authRes.json();
      setAdminEmail(authData.admin?.email || '');

      const res = await fetch(`${API_BASE_URL}/admin/settings`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setOnlinePaymentsEnabled(data.onlinePaymentsEnabled);
        setRawSettings(data.settings || {});
        setRecentLogs(data.recentLogs || []);
      }
    } catch (err) {
      console.error('Failed to load admin settings', err);
      setStatusMessage({ type: 'error', text: 'Failed to load system settings' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleTogglePayments = async () => {
    const nextState = !onlinePaymentsEnabled;
    const confirmText = nextState
      ? 'Are you sure you want to RE-ENABLE Online Payments (UPI)? Customers will be able to pay via UPI.'
      : 'EMERGENCY ACTION: Are you sure you want to DISABLE Online Payments (UPI)?\nAll incoming checkouts will be restricted to Cash on Delivery (COD) only.';

    if (!window.confirm(confirmText)) {
      return;
    }

    setToggling(true);
    setStatusMessage(null);

    try {
      const res = await fetch(`${API_BASE_URL}/admin/settings/payments`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          enabled: nextState,
          reason: reason.trim() || (nextState ? 'Admin resumed online payments' : 'Emergency payment pause'),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setStatusMessage({ type: 'error', text: data.error || 'Failed to update payment settings' });
      } else {
        setOnlinePaymentsEnabled(data.onlinePaymentsEnabled);
        setStatusMessage({
          type: 'success',
          text: `Online payments successfully ${data.onlinePaymentsEnabled ? 'enabled' : 'disabled'}. Kill-switch state updated.`,
        });
        setReason('');
        await fetchSettings();
      }
    } catch (err: any) {
      console.error('Error toggling payment switch', err);
      setStatusMessage({ type: 'error', text: 'Network error communicating with server' });
    } finally {
      setToggling(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans pb-16">
      <AdminHeader adminEmail={adminEmail} activeTab="settings" />

      <main className="mx-auto w-full max-w-4xl px-4 py-6 space-y-6">
        {/* Title */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <h1 className="text-xl font-black text-white flex items-center gap-2">
              <span>⚙️</span> System Controls &amp; Launch Readiness
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Production kill-switches, maintenance controls, and launch verification (F21).
            </p>
          </div>
          <button
            onClick={fetchSettings}
            disabled={loading}
            className="self-start sm:self-auto px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg border border-slate-700 transition-colors"
          >
            {loading ? 'Refreshing...' : '🔄 Refresh Status'}
          </button>
        </div>

        {/* Status Alert Banner */}
        {statusMessage && (
          <div
            className={`p-4 rounded-xl border text-sm font-semibold flex items-center justify-between ${
              statusMessage.type === 'success'
                ? 'bg-emerald-950/60 border-emerald-700 text-emerald-300'
                : 'bg-rose-950/60 border-rose-700 text-rose-300'
            }`}
          >
            <span>{statusMessage.text}</span>
            <button
              onClick={() => setStatusMessage(null)}
              className="text-xs underline ml-3 opacity-80 hover:opacity-100"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* 1. Payment Kill-Switch Control */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h2 className="text-base font-extrabold text-white flex items-center gap-2">
                <span>⚡</span> Payment Gateway Kill-Switch
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Disable UPI / Razorpay gateway immediately during downstream gateway outages or disputes.
              </p>
            </div>
            <div
              className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider border ${
                onlinePaymentsEnabled
                  ? 'bg-emerald-900/40 text-emerald-300 border-emerald-700'
                  : 'bg-rose-900/40 text-rose-300 border-rose-700'
              }`}
            >
              {onlinePaymentsEnabled ? '● Online Payments Active' : '■ Kill-Switch Engaged (COD Only)'}
            </div>
          </div>

          <div
            className={`p-4 rounded-xl border text-xs ${
              onlinePaymentsEnabled
                ? 'bg-slate-800/60 border-slate-700 text-slate-300'
                : 'bg-amber-950/40 border-amber-700 text-amber-200'
            }`}
          >
            {onlinePaymentsEnabled ? (
              <p>
                UPI and online payments via Razorpay are currently <strong>active and accepting payments</strong>. Orders above ₹1,000 can complete normally via UPI.
              </p>
            ) : (
              <p>
                <strong>⚠️ Emergency Mode Active:</strong> Online payments are disabled. All customers attempting to select UPI will be blocked and instructed to use Cash on Delivery (COD). Cart items above ₹1,000 cannot be checked out until normal operations resume.
              </p>
            )}
          </div>

          {/* Action form */}
          <div className="space-y-3 pt-2">
            <div>
              <label htmlFor="reason" className="block text-xs font-semibold text-slate-300 mb-1">
                Reason for state change (stored in audit log):
              </label>
              <input
                id="reason"
                type="text"
                placeholder={onlinePaymentsEnabled ? 'e.g. Razorpay UPI gateway degraded' : 'e.g. Gateway restored'}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-primary"
              />
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleTogglePayments}
                disabled={toggling}
                className={`px-4 py-2.5 rounded-xl font-bold text-xs transition-colors shadow-sm flex items-center gap-2 ${
                  onlinePaymentsEnabled
                    ? 'bg-rose-600 hover:bg-rose-500 text-white'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                } ${toggling ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer active:scale-98'}`}
              >
                {toggling ? (
                  'Updating status...'
                ) : onlinePaymentsEnabled ? (
                  <>
                    <span>🛑</span> Engage Kill-Switch (Disable UPI)
                  </>
                ) : (
                  <>
                    <span>✅</span> Resume Online Payments (Enable UPI)
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* 2. System Status & Config Key-Values */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
          <h2 className="text-base font-extrabold text-white flex items-center gap-2">
            <span>📋</span> Current System Settings
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
              <span className="text-slate-400 font-semibold">Serviceable Pincode</span>
              <p className="font-mono font-bold text-emerald-400">411001 (Pune Camp)</p>
            </div>
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
              <span className="text-slate-400 font-semibold">COD Max Limit</span>
              <p className="font-mono font-bold text-slate-200">₹1,000 (100,000 paise)</p>
            </div>
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
              <span className="text-slate-400 font-semibold">Database Key: ONLINE_PAYMENTS_ENABLED</span>
              <p className="font-mono font-bold text-slate-200">
                {rawSettings['ONLINE_PAYMENTS_ENABLED'] || '1 (Default)'}
              </p>
            </div>
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
              <span className="text-slate-400 font-semibold">Environment Override (DISABLE_ONLINE_PAYMENTS)</span>
              <p className="font-mono font-bold text-slate-200">
                {process.env.NEXT_PUBLIC_DISABLE_ONLINE_PAYMENTS || 'false'}
              </p>
            </div>
          </div>
        </div>

        {/* 3. Emergency Runbook & Quick Procedures */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
          <h2 className="text-base font-extrabold text-white flex items-center gap-2">
            <span>📖</span> Emergency Runbook &amp; Incident Protocols
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
              <span className="font-bold text-rose-400">P1: Gateway Outage</span>
              <p className="text-slate-400">
                1. Engage Payment Kill-Switch above.<br />
                2. Verify checkout defaults to COD.<br />
                3. Check Razorpay Status Dashboard.
              </p>
            </div>
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
              <span className="font-bold text-amber-400">P2: Database Backup &amp; Restore</span>
              <p className="text-slate-400">
                1. Run <code>scripts/backup_db.ps1</code><br />
                2. Verify <code>backups/db_*.sql</code> created.<br />
                3. Restore via <code>scripts/restore_db.ps1</code>.
              </p>
            </div>
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
              <span className="font-bold text-blue-400">P3: Customer Incident Notice</span>
              <p className="text-slate-400">
                1. Trigger Msg91 incident template.<br />
                2. Notify affected customers via SMS/WhatsApp.<br />
                3. Post announcement banner.
              </p>
            </div>
          </div>
        </div>

        {/* 4. Recent Admin Audit Logs */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-3">
          <h2 className="text-base font-extrabold text-white flex items-center gap-2">
            <span>🛡️</span> Recent System Action Audit Trail
          </h2>
          {recentLogs.length === 0 ? (
            <p className="text-xs text-slate-500 py-3">No system audit logs found.</p>
          ) : (
            <div className="divide-y divide-slate-800 overflow-hidden rounded-xl border border-slate-800">
              {recentLogs.map((log) => (
                <div key={log.id} className="p-3 bg-slate-950/60 flex items-start justify-between gap-3 text-xs">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-200">{log.action}</span>
                      <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded-sm">
                        {log.target_type}
                      </span>
                    </div>
                    {log.changes && (
                      <p className="text-[11px] text-slate-400 font-mono mt-1 break-all">
                        {JSON.stringify(log.changes)}
                      </p>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-500 shrink-0">
                    {new Date(log.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
