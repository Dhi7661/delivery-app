'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminHeader from '@/components/AdminHeader';
import { API_BASE_URL } from '@/lib/api';
import { formatPaise } from '@/lib/money';

interface OperationsSummary {
  targetProgress: {
    completed: number;
    target: number;
    maxTarget: number;
    percentage: number;
    isTargetMet: boolean;
  };
  onTimeDelivery: {
    onTimeOrders: number;
    totalDelivered: number;
    onTimeRatePercent: number;
    targetMinutes: number;
    avgDeliveryMinutes: number;
  };
  repeatCustomers: {
    uniqueCustomers: number;
    repeatCustomers: number;
    repeatCustomerRatePercent: number;
    totalRegisteredCustomers: number;
  };
  unitEconomics: {
    totalSellingPricePaise: number;
    totalShopPricePaise: number;
    retailMarkUpPaise: number;
    totalDeliveryFeePaise: number;
    totalDeliveryCostPaise: number;
    grossMarginPaise: number;
    avgMarginPerOrderPaise: number;
    deliveryCostPerOrderPaise: number;
  };
  refundsAndReturns: {
    refundsCount: number;
    totalRefundsPaise: number;
    returnsCount: number;
  };
  issues: {
    total: number;
    open: number;
    resolved: number;
  };
}

interface CashReconciliationItem {
  id: string | null;
  date: string;
  riderName: string;
  ordersCount: number;
  expectedCashPaise: number;
  collectedCashPaise: number;
  variancePaise: number;
  status: string;
  notes: string | null;
  reconciledBy: string | null;
  orderNumbers: string[];
}

interface OperationalIssueItem {
  id: string;
  order_id: string | null;
  order_no: string | null;
  shop_id: string | null;
  category: string;
  severity: string;
  status: string;
  description: string;
  root_cause: string | null;
  resolution_notes: string | null;
  reported_by: string;
  created_at: string;
  resolved_at: string | null;
  shop?: { id: string; name: string } | null;
  order?: { id: string; order_no: string; total_paise: number; status: string } | null;
}

export default function AdminOperationsPage() {
  const router = useRouter();
  const [adminEmail, setAdminEmail] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'cash' | 'issues' | 'review'>('overview');

  // Data states
  const [summary, setSummary] = useState<OperationsSummary | null>(null);
  const [reconciliations, setReconciliations] = useState<CashReconciliationItem[]>([]);
  const [issues, setIssues] = useState<OperationalIssueItem[]>([]);
  const [issueFilter, setIssueFilter] = useState<string>('ALL');

  // Form states: New Issue Modal
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [newOrderNo, setNewOrderNo] = useState('');
  const [newCategory, setNewCategory] = useState('LATE_DELIVERY');
  const [newSeverity, setNewSeverity] = useState('MEDIUM');
  const [newDescription, setNewDescription] = useState('');
  const [submittingIssue, setSubmittingIssue] = useState(false);

  // Form states: Reconcile Cash Modal
  const [reconcileModalItem, setReconcileModalItem] = useState<CashReconciliationItem | null>(null);
  const [cashCollectedInput, setCashCollectedInput] = useState<number>(0);
  const [reconcileNotes, setReconcileNotes] = useState<string>('');
  const [submittingCash, setSubmittingCash] = useState(false);

  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      // 1. Auth check
      const authRes = await fetch(`${API_BASE_URL}/admin/auth/me`, { credentials: 'include' });
      if (!authRes.ok) {
        router.replace('/admin/login');
        return;
      }
      const authData = await authRes.json();
      setAdminEmail(authData.admin?.email || '');

      // 2. Load summary
      const sumRes = await fetch(`${API_BASE_URL}/admin/operations/summary`, { credentials: 'include' });
      if (sumRes.ok) {
        const sumData = await sumRes.json();
        setSummary(sumData);
      }

      // 3. Load cash reconciliation
      const cashRes = await fetch(`${API_BASE_URL}/admin/operations/cash-reconciliation`, { credentials: 'include' });
      if (cashRes.ok) {
        const cashData = await cashRes.json();
        setReconciliations(cashData.reconciliations || []);
      }

      // 4. Load issues
      const issuesUrl =
        issueFilter === 'ALL'
          ? `${API_BASE_URL}/admin/operations/issues`
          : `${API_BASE_URL}/admin/operations/issues?status=${issueFilter}`;
      const issuesRes = await fetch(issuesUrl, { credentials: 'include' });
      if (issuesRes.ok) {
        const issuesData = await issuesRes.json();
        setIssues(issuesData.issues || []);
      }
    } catch (err) {
      console.error('Failed to load operational data', err);
      setActionMessage({ type: 'error', text: 'Error connecting to operations server' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [issueFilter]);

  // Handle Log Issue
  const handleCreateIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDescription.trim()) return;

    setSubmittingIssue(true);
    setActionMessage(null);

    try {
      const res = await fetch(`${API_BASE_URL}/admin/operations/issues`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          orderNo: newOrderNo.trim() || undefined,
          category: newCategory,
          severity: newSeverity,
          description: newDescription.trim(),
          reportedBy: 'ADMIN',
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setActionMessage({ type: 'error', text: data.error || 'Failed to record issue' });
      } else {
        setActionMessage({ type: 'success', text: 'Operational issue recorded successfully' });
        setShowIssueModal(false);
        setNewOrderNo('');
        setNewDescription('');
        await fetchData();
      }
    } catch (err) {
      console.error('Failed to create issue', err);
      setActionMessage({ type: 'error', text: 'Network error submitting issue' });
    } finally {
      setSubmittingIssue(false);
    }
  };

  // Handle Update Issue Status
  const handleUpdateIssueStatus = async (id: string, newStatus: string) => {
    setActionMessage(null);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/operations/issues/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          status: newStatus,
          resolutionNotes: newStatus === 'RESOLVED' ? 'Marked resolved by operator' : undefined,
        }),
      });

      if (res.ok) {
        setActionMessage({ type: 'success', text: `Issue status updated to ${newStatus}` });
        await fetchData();
      } else {
        const data = await res.json();
        setActionMessage({ type: 'error', text: data.error || 'Failed to update issue status' });
      }
    } catch (err) {
      console.error('Failed to update issue', err);
      setActionMessage({ type: 'error', text: 'Network error updating issue' });
    }
  };

  // Handle Submit Cash Reconciliation
  const handleSubmitReconciliation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reconcileModalItem) return;

    setSubmittingCash(true);
    setActionMessage(null);

    try {
      const res = await fetch(`${API_BASE_URL}/admin/operations/cash-reconciliation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          date: reconcileModalItem.date,
          riderName: reconcileModalItem.riderName,
          collectedCashPaise: Math.round(cashCollectedInput * 100),
          notes: reconcileNotes.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setActionMessage({ type: 'error', text: data.error || 'Failed to record cash reconciliation' });
      } else {
        setActionMessage({ type: 'success', text: data.message || 'Cash reconciled successfully' });
        setReconcileModalItem(null);
        await fetchData();
      }
    } catch (err) {
      console.error('Failed to reconcile cash', err);
      setActionMessage({ type: 'error', text: 'Network error submitting reconciliation' });
    } finally {
      setSubmittingCash(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans pb-16">
      <AdminHeader adminEmail={adminEmail} activeTab="operations" />

      <main className="mx-auto w-full max-w-5xl px-4 py-6 space-y-6">
        {/* Page Title & Refresh */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <h1 className="text-xl font-black text-white flex items-center gap-2">
              <span>📊</span> Soft Launch Operations (Phase 5)
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Pune Camp (411001) pilot: Progress toward 20-50 real orders, daily COD cash, and unit economics.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowIssueModal(true)}
              className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-lg shadow-sm transition-colors cursor-pointer"
            >
              + Log Issue
            </button>
            <button
              onClick={fetchData}
              disabled={loading}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg border border-slate-700 transition-colors cursor-pointer"
            >
              {loading ? 'Refreshing...' : '🔄 Refresh'}
            </button>
          </div>
        </div>

        {/* Action Message Alert */}
        {actionMessage && (
          <div
            className={`p-3.5 rounded-xl border text-xs font-semibold flex items-center justify-between ${
              actionMessage.type === 'success'
                ? 'bg-emerald-950/70 border-emerald-700 text-emerald-300'
                : 'bg-rose-950/70 border-rose-700 text-rose-300'
            }`}
          >
            <span>{actionMessage.text}</span>
            <button
              onClick={() => setActionMessage(null)}
              className="text-[11px] underline ml-2 opacity-80 hover:opacity-100"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Top 4 KPI Cards (Scorecard) */}
        {summary && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Card 1: Completed Orders vs Target */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Pilot Orders
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                    summary.targetProgress.isTargetMet
                      ? 'bg-emerald-900/60 text-emerald-300 border border-emerald-700'
                      : 'bg-amber-900/60 text-amber-300 border border-amber-700'
                  }`}
                >
                  {summary.targetProgress.isTargetMet ? 'Goal Achieved' : 'In Progress'}
                </span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-black text-white">
                  {summary.targetProgress.completed}
                </span>
                <span className="text-xs text-slate-400">/ {summary.targetProgress.target} target</span>
              </div>
              {/* Progress bar */}
              <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-primary h-full transition-all"
                  style={{ width: `${summary.targetProgress.percentage}%` }}
                />
              </div>
              <p className="text-[10px] text-slate-400">
                Phase 5 target: 20-50 real orders in Pune Camp
              </p>
            </div>

            {/* Card 2: On-Time Delivery Rate */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  On-Time Delivery
                </span>
                <span className="text-sm">⏱️</span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-black text-white">
                  {summary.onTimeDelivery.onTimeRatePercent}%
                </span>
                <span className="text-xs text-emerald-400 font-semibold">
                  ({summary.onTimeDelivery.onTimeOrders}/{summary.onTimeDelivery.totalDelivered})
                </span>
              </div>
              <p className="text-[10px] text-slate-400">
                Target: &le; {summary.onTimeDelivery.targetMinutes}m | Avg: {summary.onTimeDelivery.avgDeliveryMinutes}m
              </p>
            </div>

            {/* Card 3: Repeat Customer Rate */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Repeat Customers
                </span>
                <span className="text-sm">🔄</span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-black text-white">
                  {summary.repeatCustomers.repeatCustomerRatePercent}%
                </span>
                <span className="text-xs text-slate-400">
                  ({summary.repeatCustomers.repeatCustomers} repeats)
                </span>
              </div>
              <p className="text-[10px] text-slate-400">
                {summary.repeatCustomers.uniqueCustomers} unique ordering customers
              </p>
            </div>

            {/* Card 4: Gross Margin per Order */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Net Margin / Order
                </span>
                <span className="text-sm">💰</span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span
                  className={`text-2xl font-black ${
                    summary.unitEconomics.avgMarginPerOrderPaise >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {formatPaise(summary.unitEconomics.avgMarginPerOrderPaise)}
                </span>
                <span className="text-xs text-slate-400">/ order</span>
              </div>
              <p className="text-[10px] text-slate-400">
                Total gross margin: {formatPaise(summary.unitEconomics.grossMarginPaise)}
              </p>
            </div>
          </div>
        )}

        {/* Sub-Navigation Tabs */}
        <div className="flex border-b border-slate-800 text-xs font-bold gap-2">
          <button
            onClick={() => setActiveTab('overview')}
            className={`py-2 px-3 border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'overview'
                ? 'border-saffron text-saffron'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>📈</span>
            <span>Unit Economics &amp; Margin</span>
          </button>
          <button
            onClick={() => setActiveTab('cash')}
            className={`py-2 px-3 border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'cash'
                ? 'border-saffron text-saffron'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>💵</span>
            <span>Daily Cash Reconciliation</span>
          </button>
          <button
            onClick={() => setActiveTab('issues')}
            className={`py-2 px-3 border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'issues'
                ? 'border-saffron text-saffron'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>⚠️</span>
            <span>Issues Log ({summary?.issues.open || 0} Open)</span>
          </button>
          <button
            onClick={() => setActiveTab('review')}
            className={`py-2 px-3 border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'review'
                ? 'border-saffron text-saffron'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>📋</span>
            <span>Weekly Soft Launch Review</span>
          </button>
        </div>

        {/* TAB 1: UNIT ECONOMICS & MARGIN */}
        {activeTab === 'overview' && summary && (
          <div className="space-y-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
              <h2 className="text-sm font-extrabold text-white flex items-center gap-2">
                <span>🧮</span> Unit Economics Breakdown
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                {/* Revenue side */}
                <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                  <span className="font-bold text-slate-300">Revenue Components</span>
                  <div className="divide-y divide-slate-800 space-y-1.5 pt-1">
                    <div className="flex justify-between py-1">
                      <span className="text-slate-400">Total Customer Selling Price</span>
                      <span className="font-mono font-bold text-white">
                        {formatPaise(summary.unitEconomics.totalSellingPricePaise)}
                      </span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-slate-400">Customer Delivery Fees Collected</span>
                      <span className="font-mono font-bold text-emerald-400">
                        +{formatPaise(summary.unitEconomics.totalDeliveryFeePaise)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Cost side */}
                <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                  <span className="font-bold text-slate-300">Cost Components</span>
                  <div className="divide-y divide-slate-800 space-y-1.5 pt-1">
                    <div className="flex justify-between py-1">
                      <span className="text-slate-400">Shop Purchase Price (Cost of Goods)</span>
                      <span className="font-mono font-bold text-rose-400">
                        -{formatPaise(summary.unitEconomics.totalShopPricePaise)}
                      </span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-slate-400">Delivery Partner Payouts (₹40/order)</span>
                      <span className="font-mono font-bold text-rose-400">
                        -{formatPaise(summary.unitEconomics.totalDeliveryCostPaise)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Net Result Formula */}
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                <span className="font-bold text-slate-300">Unit Economics Formula Result:</span>
                <p className="font-mono text-xs text-slate-400">
                  Net Margin = (Retail Mark-Up: {formatPaise(summary.unitEconomics.retailMarkUpPaise)}) + (Delivery Fees: {formatPaise(summary.unitEconomics.totalDeliveryFeePaise)}) - (Rider Pay: {formatPaise(summary.unitEconomics.totalDeliveryCostPaise)})
                </p>
                <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                  <span className="text-sm font-bold text-white">Total Gross Profit / Margin:</span>
                  <span className="text-base font-black text-emerald-400 font-mono">
                    {formatPaise(summary.unitEconomics.grossMarginPaise)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: DAILY CASH RECONCILIATION */}
        {activeTab === 'cash' && (
          <div className="space-y-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-extrabold text-white flex items-center gap-2">
                    <span>💵</span> Daily Cash on Delivery (COD) Reconciliation
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Reconcile cash collected by delivery champions against completed COD orders daily.
                  </p>
                </div>
              </div>

              {reconciliations.length === 0 ? (
                <p className="text-xs text-slate-500 py-6 text-center">
                  No Cash on Delivery orders recorded yet.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-800">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-950 text-[11px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800">
                      <tr>
                        <th className="p-3">Date</th>
                        <th className="p-3">Rider</th>
                        <th className="p-3 text-right">Orders</th>
                        <th className="p-3 text-right">Expected Cash</th>
                        <th className="p-3 text-right">Turned-in Cash</th>
                        <th className="p-3 text-right">Variance</th>
                        <th className="p-3 text-center">Status</th>
                        <th className="p-3 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 font-mono">
                      {reconciliations.map((rec, i) => {
                        const isShort = rec.variancePaise < 0;
                        const isBalanced = rec.variancePaise === 0;

                        return (
                          <tr key={i} className="hover:bg-slate-950/40 transition-colors">
                            <td className="p-3 font-semibold text-white">{rec.date}</td>
                            <td className="p-3 font-sans font-medium text-slate-200">{rec.riderName}</td>
                            <td className="p-3 text-right">{rec.ordersCount}</td>
                            <td className="p-3 text-right text-slate-300 font-bold">
                              {formatPaise(rec.expectedCashPaise)}
                            </td>
                            <td className="p-3 text-right text-emerald-400 font-bold">
                              {formatPaise(rec.collectedCashPaise)}
                            </td>
                            <td
                              className={`p-3 text-right font-black ${
                                isShort ? 'text-rose-400' : isBalanced ? 'text-slate-400' : 'text-emerald-400'
                              }`}
                            >
                              {isShort ? '-' : isBalanced ? '' : '+'}
                              {formatPaise(Math.abs(rec.variancePaise))}
                            </td>
                            <td className="p-3 text-center">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                  rec.status === 'BALANCED'
                                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                                    : rec.status === 'SHORTAGE'
                                    ? 'bg-rose-950 text-rose-300 border border-rose-700'
                                    : 'bg-amber-950 text-amber-300 border border-amber-700'
                                }`}
                              >
                                {rec.status}
                              </span>
                            </td>
                            <td className="p-3 text-center font-sans">
                              <button
                                onClick={() => {
                                  setReconcileModalItem(rec);
                                  setCashCollectedInput(rec.collectedCashPaise / 100);
                                  setReconcileNotes(rec.notes || '');
                                }}
                                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-semibold rounded-lg border border-slate-700 transition-colors cursor-pointer"
                              >
                                Reconcile
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: ISSUES LOG */}
        {activeTab === 'issues' && (
          <div className="space-y-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <h2 className="text-sm font-extrabold text-white flex items-center gap-2">
                    <span>⚠️</span> Operational Issues &amp; Complaints Log
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Track late deliveries, damaged items, customer refusals, and resolutions.
                  </p>
                </div>
                {/* Filter status */}
                <div className="flex items-center gap-1.5 text-xs">
                  {['ALL', 'OPEN', 'INVESTIGATING', 'RESOLVED'].map((st) => (
                    <button
                      key={st}
                      onClick={() => setIssueFilter(st)}
                      className={`px-2.5 py-1 rounded-lg font-bold transition-colors cursor-pointer ${
                        issueFilter === st
                          ? 'bg-primary text-white'
                          : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>

              {issues.length === 0 ? (
                <p className="text-xs text-slate-500 py-6 text-center">
                  No operational issues matching filter.
                </p>
              ) : (
                <div className="space-y-3">
                  {issues.map((iss) => (
                    <div
                      key={iss.id}
                      className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white bg-slate-800 px-2 py-0.5 rounded-sm">
                            {iss.category.replace('_', ' ')}
                          </span>
                          {iss.order_no && (
                            <span className="font-mono text-primary font-bold">
                              #{iss.order_no}
                            </span>
                          )}
                          <span
                            className={`px-1.5 py-0.5 rounded-sm text-[10px] font-bold uppercase ${
                              iss.severity === 'CRITICAL' || iss.severity === 'HIGH'
                                ? 'bg-rose-950 text-rose-300 border border-rose-800'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {iss.severity}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                              iss.status === 'RESOLVED'
                                ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                                : iss.status === 'INVESTIGATING'
                                ? 'bg-amber-950 text-amber-300 border border-amber-700'
                                : 'bg-rose-950 text-rose-300 border border-rose-700'
                            }`}
                          >
                            {iss.status}
                          </span>
                          {iss.status !== 'RESOLVED' && (
                            <button
                              onClick={() => handleUpdateIssueStatus(iss.id, 'RESOLVED')}
                              className="px-2 py-0.5 bg-emerald-900/60 hover:bg-emerald-800 text-emerald-200 rounded-md font-bold text-[10px] border border-emerald-700 cursor-pointer"
                            >
                              Mark Resolved
                            </button>
                          )}
                        </div>
                      </div>

                      <p className="text-slate-300">{iss.description}</p>

                      {iss.resolution_notes && (
                        <div className="p-2.5 bg-slate-900/80 rounded-lg text-slate-400 text-[11px] border border-slate-800">
                          <span className="font-bold text-emerald-400">Resolution: </span>
                          {iss.resolution_notes}
                        </div>
                      )}

                      <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1">
                        <span>Reported by: {iss.reported_by}</span>
                        <span>
                          {new Date(iss.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 4: WEEKLY REVIEW GENERATOR */}
        {activeTab === 'review' && summary && (
          <div className="space-y-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4 text-xs">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-extrabold text-white flex items-center gap-2">
                    <span>📋</span> Weekly Soft Launch Review (Founder Report)
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Formatted operational summary for the first 20-50 orders in Pune Camp.
                  </p>
                </div>
              </div>

              <div className="p-5 bg-slate-950 border border-slate-800 rounded-xl space-y-3 font-sans leading-relaxed">
                <h3 className="text-sm font-black text-primary">PlukIt Soft Launch Weekly Review</h3>
                <p className="text-slate-300">
                  <strong>Serviceable Pincode:</strong> 411001 (Pune Camp) | <strong>Pilot Target:</strong> 20 to 50 real orders
                </p>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-2 border-y border-slate-800">
                  <div>
                    <span className="text-slate-500 text-[10px] block">Completed Orders</span>
                    <strong className="text-base text-white">{summary.targetProgress.completed}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 text-[10px] block">On-Time Rate (&le;45m)</span>
                    <strong className="text-base text-emerald-400">{summary.onTimeDelivery.onTimeRatePercent}%</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 text-[10px] block">Repeat Customer Rate</span>
                    <strong className="text-base text-white">{summary.repeatCustomers.repeatCustomerRatePercent}%</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 text-[10px] block">Net Margin per Order</span>
                    <strong className="text-base text-emerald-400">{formatPaise(summary.unitEconomics.avgMarginPerOrderPaise)}</strong>
                  </div>
                </div>

                <div className="space-y-1 text-slate-300">
                  <p><strong>1. On-Time Delivery:</strong> {summary.onTimeDelivery.onTimeOrders} of {summary.onTimeDelivery.totalDelivered} delivered within 45 minutes (average delivery time: {summary.onTimeDelivery.avgDeliveryMinutes} minutes).</p>
                  <p><strong>2. Customer Retention:</strong> {summary.repeatCustomers.repeatCustomers} repeat customers out of {summary.repeatCustomers.uniqueCustomers} unique buyers.</p>
                  <p><strong>3. Returns &amp; Refunds:</strong> {summary.refundsAndReturns.refundsCount} refund(s) totaling {formatPaise(summary.refundsAndReturns.totalRefundsPaise)}.</p>
                  <p><strong>4. Unit Economics:</strong> Generated gross margin of {formatPaise(summary.unitEconomics.grossMarginPaise)} after accounting for partner shop prices and delivery wages ({formatPaise(summary.unitEconomics.totalDeliveryCostPaise)}).</p>
                  <p><strong>5. Operational Issues:</strong> {summary.issues.total} issue(s) logged ({summary.issues.open} open, {summary.issues.resolved} resolved).</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* MODAL 1: LOG NEW OPERATIONAL ISSUE */}
      {showIssueModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-extrabold text-sm text-white">Log Operational Issue</h3>
              <button
                onClick={() => setShowIssueModal(false)}
                className="text-slate-400 hover:text-white text-xs cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateIssue} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Order Number (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. PLUK-2026-000945"
                  value={newOrderNo}
                  onChange={(e) => setNewOrderNo(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono placeholder-slate-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Category</label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-2 text-white"
                  >
                    <option value="LATE_DELIVERY">Late Delivery</option>
                    <option value="WRONG_ITEM">Wrong Item</option>
                    <option value="REFUSED_ORDER">Refused Order</option>
                    <option value="DAMAGED_ITEM">Damaged Item</option>
                    <option value="REFUND_DISPUTE">Refund Dispute</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Severity</label>
                  <select
                    value={newSeverity}
                    onChange={(e) => setNewSeverity(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-2 text-white"
                  >
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="CRITICAL">Critical</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Description *</label>
                <textarea
                  required
                  rows={3}
                  placeholder="Describe the complaint or incident..."
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowIssueModal(false)}
                  className="px-3 py-2 bg-slate-800 text-slate-300 rounded-lg font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingIssue}
                  className="px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-lg font-bold cursor-pointer disabled:opacity-50"
                >
                  {submittingIssue ? 'Saving...' : 'Record Issue'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: CASH RECONCILIATION */}
      {reconcileModalItem && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-extrabold text-sm text-white">Daily Cash Reconciliation</h3>
              <button
                onClick={() => setReconcileModalItem(null)}
                className="text-slate-400 hover:text-white text-xs cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitReconciliation} className="space-y-3 text-xs">
              <div className="p-3 bg-slate-950 rounded-xl space-y-1 font-mono">
                <div className="flex justify-between text-slate-400">
                  <span>Date:</span>
                  <span className="text-white font-bold">{reconcileModalItem.date}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Rider:</span>
                  <span className="text-white font-bold">{reconcileModalItem.riderName}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Expected Cash (COD):</span>
                  <span className="text-white font-bold">{formatPaise(reconcileModalItem.expectedCashPaise)}</span>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Cash Turned In by Rider (in Rupees) *
                </label>
                <input
                  type="number"
                  step="1"
                  required
                  value={cashCollectedInput}
                  onChange={(e) => setCashCollectedInput(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono font-bold text-sm"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Notes / Discrepancy Reason</label>
                <input
                  type="text"
                  placeholder="e.g. Full amount verified and deposited"
                  value={reconcileNotes}
                  onChange={(e) => setReconcileNotes(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setReconcileModalItem(null)}
                  className="px-3 py-2 bg-slate-800 text-slate-300 rounded-lg font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingCash}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold cursor-pointer disabled:opacity-50"
                >
                  {submittingCash ? 'Recording...' : 'Confirm Cash'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
