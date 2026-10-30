'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminHeader from '@/components/AdminHeader';
import { API_BASE_URL } from '@/lib/api';
import { formatPaise } from '@/lib/money';

interface BankRef {
  id: string;
  account_number: string;
  ifsc_code: string;
  bank_name?: string | null;
  account_name?: string | null;
}

interface Shop {
  id: string;
  name: string;
  address?: string | null;
  phone?: string | null;
  gstin?: string | null;
  fssai?: string | null;
  bankRef?: BankRef | null;
  unbilledSalesPaise: number;
  unbilledDeductionsPaise: number;
  unbilledAdjustmentsPaise: number;
  netPayablePaise: number;
  unbilledCount: number;
}

interface PayoutItem {
  id: string;
  shop_id: string;
  period_start: string;
  period_end: string;
  gross_sales_paise: number;
  deductions_paise: number;
  amount_paise: number;
  status: 'SCHEDULED' | 'PAID' | 'CANCELLED';
  bank_reference?: string | null;
  paid_at?: string | null;
  pdf_url?: string | null;
  created_at: string;
  shop: {
    id: string;
    name: string;
    address?: string | null;
    phone?: string | null;
    gstin?: string | null;
    bank_ref?: BankRef | null;
  };
  _count?: {
    ledger_entries: number;
  };
}

interface PayoutSummary {
  totalPayoutsCount: number;
  totalPaidPaise: number;
  scheduledPaise: number;
}

export default function AdminPayoutsPage() {
  const router = useRouter();
  const [adminEmail, setAdminEmail] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'runs' | 'shops'>('runs');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Data states
  const [payouts, setPayouts] = useState<PayoutItem[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [summary, setSummary] = useState<PayoutSummary>({
    totalPayoutsCount: 0,
    totalPaidPaise: 0,
    scheduledPaise: 0,
  });

  // Action message banner
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Modal: Generate Payout
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [selectedShopId, setSelectedShopId] = useState<string>('');
  const [periodStart, setPeriodStart] = useState<string>('');
  const [periodEnd, setPeriodEnd] = useState<string>('');
  const [previewData, setPreviewData] = useState<any>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [generatingPayout, setGeneratingPayout] = useState(false);

  // Modal: Record Bank Transfer
  const [transferModalPayout, setTransferModalPayout] = useState<PayoutItem | null>(null);
  const [bankRefInput, setBankRefInput] = useState<string>('');
  const [submittingTransfer, setSubmittingTransfer] = useState(false);

  // Modal: View Statement
  const [statementModalId, setStatementModalId] = useState<string | null>(null);
  const [statementData, setStatementData] = useState<any>(null);
  const [statementLoading, setStatementLoading] = useState(false);

  // Modal: Edit Bank Details
  const [editBankShop, setEditBankShop] = useState<Shop | null>(null);
  const [bankAcctInput, setBankAcctInput] = useState<string>('');
  const [bankIfscInput, setBankIfscInput] = useState<string>('');
  const [bankNameInput, setBankNameInput] = useState<string>('');
  const [bankHolderInput, setBankHolderInput] = useState<string>('');
  const [submittingBank, setSubmittingBank] = useState(false);

  // Modal: Create Adjustment
  const [adjShop, setAdjShop] = useState<Shop | null>(null);
  const [adjAmountRupees, setAdjAmountRupees] = useState<string>('');
  const [adjNotes, setAdjNotes] = useState<string>('');
  const [submittingAdj, setSubmittingAdj] = useState(false);

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

      // 2. Load Payouts
      const payoutsUrl =
        statusFilter === 'ALL'
          ? `${API_BASE_URL}/admin/payouts`
          : `${API_BASE_URL}/admin/payouts?status=${statusFilter}`;
      const pRes = await fetch(payoutsUrl, { credentials: 'include' });
      if (pRes.ok) {
        const pData = await pRes.json();
        setPayouts(pData.payouts || []);
        if (pData.summary) setSummary(pData.summary);
      }

      // 3. Load Shops & Unbilled Balances
      const sRes = await fetch(`${API_BASE_URL}/admin/payouts/shops`, { credentials: 'include' });
      if (sRes.ok) {
        const sData = await sRes.json();
        setShops(sData.shops || []);
      }
    } catch (err) {
      console.error('Failed to load payouts data', err);
      setActionMessage({ type: 'error', text: 'Error connecting to payouts server' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [statusFilter]);

  // Set default dates for 15-day periods
  const openGenerateModalForShop = (shopId?: string) => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = now.getDate();

    // If day <= 15, default period is previous month 16-end or current month 1-15
    if (day > 15) {
      setPeriodStart(`${year}-${month}-01`);
      setPeriodEnd(`${year}-${month}-15`);
    } else {
      // Previous month
      const prevMonth = now.getMonth() === 0 ? 12 : now.getMonth();
      const prevYear = now.getMonth() === 0 ? year - 1 : year;
      const prevMonthStr = String(prevMonth).padStart(2, '0');
      const lastDayPrev = new Date(prevYear, prevMonth, 0).getDate();
      setPeriodStart(`${prevYear}-${prevMonthStr}-16`);
      setPeriodEnd(`${prevYear}-${prevMonthStr}-${lastDayPrev}`);
    }

    if (shopId) setSelectedShopId(shopId);
    else if (shops.length > 0) setSelectedShopId(shops[0].id);

    setPreviewData(null);
    setShowGenerateModal(true);
  };

  // Live preview for generate payout
  useEffect(() => {
    if (!showGenerateModal || !selectedShopId || !periodStart || !periodEnd) return;

    let isCancelled = false;
    const fetchPreview = async () => {
      try {
        setPreviewLoading(true);
        const res = await fetch(
          `${API_BASE_URL}/admin/payouts/preview?shopId=${selectedShopId}&periodStart=${periodStart}&periodEnd=${periodEnd}`,
          { credentials: 'include' }
        );
        if (res.ok && !isCancelled) {
          const data = await res.json();
          setPreviewData(data);
        }
      } catch (err) {
        console.error('Preview error', err);
      } finally {
        if (!isCancelled) setPreviewLoading(false);
      }
    };

    fetchPreview();
    return () => {
      isCancelled = true;
    };
  }, [showGenerateModal, selectedShopId, periodStart, periodEnd]);

  // Handle Generate Payout Submit
  const handleGeneratePayout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedShopId || !periodStart || !periodEnd) return;

    try {
      setGeneratingPayout(true);
      setActionMessage(null);

      const res = await fetch(`${API_BASE_URL}/admin/payouts/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          shopId: selectedShopId,
          periodStart: new Date(`${periodStart}T00:00:00Z`).toISOString(),
          periodEnd: new Date(`${periodEnd}T23:59:59Z`).toISOString(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate payout');
      }

      setActionMessage({ type: 'success', text: `Payout scheduled for ₹${(data.payout.amount_paise / 100).toFixed(2)}!` });
      setShowGenerateModal(false);
      fetchData();
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message || 'Error generating payout' });
    } finally {
      setGeneratingPayout(false);
    }
  };

  // Handle Record Bank Transfer Submit
  const handleRecordTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferModalPayout || !bankRefInput.trim()) return;

    try {
      setSubmittingTransfer(true);
      setActionMessage(null);

      const res = await fetch(`${API_BASE_URL}/admin/payouts/${transferModalPayout.id}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          bankReference: bankRefInput.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to record bank transfer');
      }

      setActionMessage({
        type: 'success',
        text: `Payout settled! Bank Ref: ${data.payout.bank_reference}. Period is now permanently locked.`,
      });
      setTransferModalPayout(null);
      setBankRefInput('');
      fetchData();
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message || 'Error recording bank transfer' });
    } finally {
      setSubmittingTransfer(false);
    }
  };

  // View Statement
  const openStatementModal = async (payoutId: string) => {
    setStatementModalId(payoutId);
    setStatementData(null);
    setStatementLoading(true);

    try {
      const res = await fetch(`${API_BASE_URL}/admin/payouts/${payoutId}/statement`, {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setStatementData(data);
      } else {
        setActionMessage({ type: 'error', text: 'Could not load statement' });
      }
    } catch (err) {
      console.error(err);
      setActionMessage({ type: 'error', text: 'Failed to load statement' });
    } finally {
      setStatementLoading(false);
    }
  };

  // Handle Save Bank Account Details
  const handleSaveBank = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editBankShop) return;

    try {
      setSubmittingBank(true);
      setActionMessage(null);

      const res = await fetch(`${API_BASE_URL}/admin/payouts/shops/${editBankShop.id}/bank`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          accountNumber: bankAcctInput.trim(),
          ifscCode: bankIfscInput.trim().toUpperCase(),
          bankName: bankNameInput.trim(),
          accountName: bankHolderInput.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save bank details');

      setActionMessage({ type: 'success', text: `Bank details updated for ${editBankShop.name}!` });
      setEditBankShop(null);
      fetchData();
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message || 'Error updating bank details' });
    } finally {
      setSubmittingBank(false);
    }
  };

  // Handle Create Adjustment
  const handleCreateAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjShop) return;

    const amountNum = parseFloat(adjAmountRupees);
    if (isNaN(amountNum) || amountNum === 0) {
      setActionMessage({ type: 'error', text: 'Please enter a valid non-zero adjustment amount.' });
      return;
    }

    try {
      setSubmittingAdj(true);
      setActionMessage(null);

      const amountPaise = Math.round(amountNum * 100);

      const res = await fetch(`${API_BASE_URL}/admin/payouts/adjustments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          shopId: adjShop.id,
          amountPaise,
          notes: adjNotes.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to record adjustment');

      setActionMessage({ type: 'success', text: `Adjustment of ₹${amountNum.toFixed(2)} recorded for ${adjShop.name}!` });
      setAdjShop(null);
      setAdjAmountRupees('');
      setAdjNotes('');
      fetchData();
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message || 'Error creating adjustment' });
    } finally {
      setSubmittingAdj(false);
    }
  };

  const formatDate = (isoString: string) => {
    if (!isoString) return '-';
    return new Date(isoString).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const maskAcct = (num?: string | null) => {
    if (!num) return 'Not Configured';
    if (num.length <= 4) return num;
    return `•••• ${num.slice(-4)}`;
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans pb-16">
      <AdminHeader adminEmail={adminEmail} activeTab="payouts" />

      {/* Main Container */}
      <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-6">
        {/* Banner Alert */}
        {actionMessage && (
          <div
            className={`mb-6 p-4 rounded-xl border text-sm font-semibold flex items-center justify-between shadow-lg ${
              actionMessage.type === 'success'
                ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-300'
                : 'bg-rose-950/80 border-rose-500/50 text-rose-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <span>{actionMessage.type === 'success' ? '✅' : '⚠️'}</span>
              <span>{actionMessage.text}</span>
            </div>
            <button onClick={() => setActionMessage(null)} className="text-xs opacity-75 hover:opacity-100">
              ✕
            </button>
          </div>
        )}

        {/* Top Header & Action */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
              <span>💰</span> Shop Ledger &amp; Fortnightly Payouts
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              F23 Partner Settlements: 15-day cycle runs, immutable locked periods, UTR references &amp; GST statements
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => openGenerateModalForShop()}
              className="px-4 py-2.5 bg-saffron hover:bg-saffron/90 text-slate-950 font-black text-xs rounded-xl shadow-lg transition-transform active:scale-95 flex items-center gap-1.5 cursor-pointer"
            >
              <span>➕</span>
              <span>Generate 15-Day Payout</span>
            </button>
            <button
              onClick={fetchData}
              disabled={loading}
              className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl border border-slate-700 text-xs font-bold transition-all"
              title="Refresh Data"
            >
              🔄
            </button>
          </div>
        </div>

        {/* Overview Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
              <span>Total Settled (Paid)</span>
              <span>🔒</span>
            </div>
            <div className="text-2xl font-black text-emerald-400 mt-1">
              {formatPaise(summary.totalPaidPaise)}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">Permanently locked payout periods</div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
              <span>Pending / Scheduled</span>
              <span>⏳</span>
            </div>
            <div className="text-2xl font-black text-amber-400 mt-1">
              {formatPaise(summary.scheduledPaise)}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">Awaiting bank transfer reference</div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
              <span>Partner Shops</span>
              <span>🏪</span>
            </div>
            <div className="text-2xl font-black text-cyan-400 mt-1">
              {shops.length}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              {shops.reduce((acc, s) => acc + s.unbilledCount, 0)} unbilled ledger entries
            </div>
          </div>
        </div>

        {/* Section Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-800 mb-6">
          <button
            onClick={() => setActiveTab('runs')}
            className={`py-3 px-4 font-bold text-xs border-b-2 flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'runs'
                ? 'border-saffron text-saffron'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>📜 Payout Runs ({payouts.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('shops')}
            className={`py-3 px-4 font-bold text-xs border-b-2 flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'shops'
                ? 'border-saffron text-saffron'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>🏪 Partner Shops &amp; Unbilled Ledger ({shops.length})</span>
          </button>
        </div>

        {/* TAB 1: Payout Runs */}
        {activeTab === 'runs' && (
          <div>
            {/* Filter Sub-bar */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-slate-400 font-semibold mr-1">Status:</span>
                {['ALL', 'SCHEDULED', 'PAID'].map((st) => (
                  <button
                    key={st}
                    onClick={() => setStatusFilter(st)}
                    className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-colors ${
                      statusFilter === st
                        ? 'bg-slate-800 text-saffron border border-slate-700'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <div className="text-center py-16 text-slate-500 font-medium">Loading payout runs...</div>
            ) : payouts.length === 0 ? (
              <div className="text-center py-16 bg-slate-900 border border-slate-800 rounded-2xl">
                <p className="text-slate-400 font-semibold text-sm">No payout runs found.</p>
                <p className="text-xs text-slate-500 mt-1">Generate a 15-day payout run to settle partner balances.</p>
                <button
                  onClick={() => openGenerateModalForShop()}
                  className="mt-4 px-4 py-2 bg-saffron text-slate-950 font-bold text-xs rounded-xl hover:bg-saffron/90 cursor-pointer"
                >
                  ➕ Generate First Payout
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {payouts.map((payout) => (
                  <div
                    key={payout.id}
                    className="bg-slate-900 border border-slate-800 rounded-2xl p-4 transition-all hover:border-slate-700 flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    {/* Left: Info */}
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-black text-white">{payout.shop.name}</span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                            payout.status === 'PAID'
                              ? 'bg-emerald-950 border border-emerald-600/50 text-emerald-400'
                              : 'bg-amber-950 border border-amber-600/50 text-amber-400'
                          }`}
                        >
                          {payout.status === 'PAID' ? '🔒 PAID & LOCKED' : '⏳ SCHEDULED'}
                        </span>
                      </div>

                      <div className="text-xs text-slate-400 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span>
                          📅 Period: <strong className="text-slate-300">{formatDate(payout.period_start)}</strong> to{' '}
                          <strong className="text-slate-300">{formatDate(payout.period_end)}</strong>
                        </span>
                        <span>•</span>
                        <span>
                          Entries: <strong className="text-slate-300">{payout._count?.ledger_entries || 0}</strong>
                        </span>
                      </div>

                      {payout.status === 'PAID' && (
                        <div className="text-xs text-emerald-400/90 font-mono mt-1">
                          Bank UTR Ref: <span className="font-bold underline">{payout.bank_reference}</span>
                          {payout.paid_at && ` (Paid ${formatDate(payout.paid_at)})`}
                        </div>
                      )}
                    </div>

                    {/* Middle: Financials */}
                    <div className="flex items-center gap-6 border-t md:border-t-0 md:border-l border-slate-800 pt-3 md:pt-0 md:pl-6">
                      <div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase">Gross Sales</div>
                        <div className="text-xs font-semibold text-slate-300">
                          {formatPaise(payout.gross_sales_paise)}
                        </div>
                      </div>

                      <div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase">Deductions</div>
                        <div className="text-xs font-semibold text-rose-400">
                          -{formatPaise(payout.deductions_paise)}
                        </div>
                      </div>

                      <div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase">Net Settlement</div>
                        <div className="text-base font-black text-emerald-400">
                          {formatPaise(payout.amount_paise)}
                        </div>
                      </div>
                    </div>

                    {/* Right: Actions */}
                    <div className="flex items-center gap-2 border-t md:border-t-0 border-slate-800 pt-3 md:pt-0 justify-end">
                      {payout.status === 'SCHEDULED' && (
                        <button
                          onClick={() => {
                            setTransferModalPayout(payout);
                            setBankRefInput('');
                          }}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                        >
                          <span>🏦</span>
                          <span>Record Transfer</span>
                        </button>
                      )}

                      <button
                        onClick={() => openStatementModal(payout.id)}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-lg border border-slate-700 transition-colors cursor-pointer"
                      >
                        👁️ Statement
                      </button>

                      <a
                        href={`${API_BASE_URL}/admin/payouts/${payout.id}/pdf`}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-saffron font-bold text-xs rounded-lg border border-slate-700 transition-colors flex items-center gap-1"
                        title="Download Statement PDF"
                      >
                        <span>📄</span>
                        <span>PDF</span>
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: Partner Shops & Unbilled Ledger */}
        {activeTab === 'shops' && (
          <div className="space-y-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 text-xs text-slate-400 flex items-center justify-between">
              <div>
                <strong className="text-slate-200">Continuous Shop Ledger:</strong> Sales are credited automatically upon order DELIVERED. Damaged/expired returns are debited. Once ready, generate a 15-day settlement run.
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {shops.map((shop) => (
                <div
                  key={shop.id}
                  className="bg-slate-900 border border-slate-800 rounded-2xl p-5 hover:border-slate-700 transition-all flex flex-col justify-between"
                >
                  {/* Shop Info */}
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="text-base font-black text-white">{shop.name}</h3>
                        <p className="text-xs text-slate-400 mt-0.5">{shop.address || 'Local Pune Hub'}</p>
                        <p className="text-[11px] text-slate-500">
                          GSTIN: {shop.gstin || 'Unregistered'} | Phone: {shop.phone || '-'}
                        </p>
                      </div>

                      <button
                        onClick={() => {
                          setEditBankShop(shop);
                          setBankAcctInput(shop.bankRef?.account_number || '');
                          setBankIfscInput(shop.bankRef?.ifsc_code || '');
                          setBankNameInput(shop.bankRef?.bank_name || '');
                          setBankHolderInput(shop.bankRef?.account_name || '');
                        }}
                        className="px-2.5 py-1 text-[11px] font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 cursor-pointer"
                        title="Configure Bank Account"
                      >
                        🏦 Bank Details
                      </button>
                    </div>

                    {/* Bank Info Pill */}
                    <div className="mt-3 p-2.5 bg-slate-950/70 border border-slate-800/80 rounded-xl text-xs flex items-center justify-between font-mono">
                      <span className="text-slate-400">Acct: {maskAcct(shop.bankRef?.account_number)}</span>
                      <span className="text-slate-400">IFSC: {shop.bankRef?.ifsc_code || 'N/A'}</span>
                    </div>

                    {/* Balance Breakdown */}
                    <div className="mt-4 grid grid-cols-3 gap-2 bg-slate-950/40 p-3 rounded-xl border border-slate-800">
                      <div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase">Unbilled Sales</div>
                        <div className="text-xs font-semibold text-emerald-400 mt-0.5">
                          {formatPaise(shop.unbilledSalesPaise)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase">Deductions</div>
                        <div className="text-xs font-semibold text-rose-400 mt-0.5">
                          -{formatPaise(shop.unbilledDeductionsPaise)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase">Net Unbilled</div>
                        <div className="text-sm font-black text-cyan-400 mt-0.5">
                          {formatPaise(shop.netPayablePaise)}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="mt-5 pt-3 border-t border-slate-800 flex items-center justify-between gap-2">
                    <button
                      onClick={() => {
                        setAdjShop(shop);
                        setAdjAmountRupees('');
                        setAdjNotes('');
                      }}
                      className="text-xs font-bold text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                    >
                      ⚖️ Add Adjustment
                    </button>

                    <button
                      onClick={() => openGenerateModalForShop(shop.id)}
                      disabled={shop.unbilledCount === 0}
                      className={`px-3 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                        shop.unbilledCount > 0
                          ? 'bg-saffron text-slate-950 hover:bg-saffron/90 font-black'
                          : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                      }`}
                    >
                      <span>➕ Generate Payout ({shop.unbilledCount})</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* ============================================================ */}
      {/* MODAL 1: Generate 15-Day Payout Run                          */}
      {/* ============================================================ */}
      {showGenerateModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg p-6 shadow-2xl relative">
            <button
              onClick={() => setShowGenerateModal(false)}
              className="absolute top-5 right-5 text-slate-400 hover:text-white font-bold"
            >
              ✕
            </button>

            <h3 className="text-lg font-black text-white flex items-center gap-2">
              <span>🗓️</span> Generate 15-Day Payout Run
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Select shop and period range. Unbilled ledger entries will be linked to this payout.
            </p>

            <form onSubmit={handleGeneratePayout} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Partner Shop</label>
                <select
                  value={selectedShopId}
                  onChange={(e) => setSelectedShopId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 font-medium focus:outline-none focus:border-saffron"
                >
                  {shops.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.unbilledCount} unbilled entries — {formatPaise(s.netPayablePaise)})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Period Start</label>
                  <input
                    type="date"
                    value={periodStart}
                    onChange={(e) => setPeriodStart(e.target.value)}
                    required
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-saffron"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Period End</label>
                  <input
                    type="date"
                    value={periodEnd}
                    onChange={(e) => setPeriodEnd(e.target.value)}
                    required
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-saffron"
                  />
                </div>
              </div>

              {/* Preview Box */}
              <div className="p-3.5 bg-slate-950 rounded-2xl border border-slate-800">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                  Period Ledger Preview
                </div>
                {previewLoading ? (
                  <div className="text-xs text-slate-500 py-2">Computing unbilled balance...</div>
                ) : previewData ? (
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Matched Entries:</span>
                      <strong className="text-slate-200">{previewData.count} items</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Gross Sales:</span>
                      <span className="text-emerald-400 font-semibold">{formatPaise(previewData.grossSalesPaise)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Returns/Deductions:</span>
                      <span className="text-rose-400 font-semibold">-{formatPaise(previewData.deductionsPaise)}</span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-slate-800 font-black text-sm">
                      <span className="text-white">Net Payout Amount:</span>
                      <span className="text-emerald-400">{formatPaise(previewData.netAmountPaise)}</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-slate-500">Pick shop and dates to preview total.</div>
                )}
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowGenerateModal(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-slate-200 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={generatingPayout || !previewData || previewData.count === 0}
                  className="px-5 py-2.5 bg-saffron hover:bg-saffron/90 text-slate-950 font-black text-xs rounded-xl shadow-lg cursor-pointer disabled:opacity-50"
                >
                  {generatingPayout ? 'Generating...' : 'Confirm & Schedule Payout'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL 2: Record Bank Transfer (Lock Period)                  */}
      {/* ============================================================ */}
      {transferModalPayout && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-6 shadow-2xl relative">
            <button
              onClick={() => setTransferModalPayout(null)}
              className="absolute top-5 right-5 text-slate-400 hover:text-white font-bold"
            >
              ✕
            </button>

            <h3 className="text-lg font-black text-white flex items-center gap-2">
              <span>🏦</span> Record Bank Transfer
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Mark payout as PAID by recording the official UTR / IMPS reference.
            </p>

            <div className="mt-4 p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-400">Shop:</span>
                <strong className="text-slate-200">{transferModalPayout.shop.name}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Net Amount to Pay:</span>
                <strong className="text-emerald-400 font-bold text-sm">
                  {formatPaise(transferModalPayout.amount_paise)}
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Beneficiary Account:</span>
                <span className="text-slate-200 font-mono">
                  {transferModalPayout.shop.bank_ref?.account_number || 'N/A'} (
                  {transferModalPayout.shop.bank_ref?.ifsc_code || 'N/A'})
                </span>
              </div>
            </div>

            <form onSubmit={handleRecordTransfer} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Bank Transfer Reference (UTR / IMPS / NEFT) *
                </label>
                <input
                  type="text"
                  value={bankRefInput}
                  onChange={(e) => setBankRefInput(e.target.value)}
                  placeholder="e.g. UTR20261030018894"
                  required
                  minLength={4}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* F23 Rule Warning */}
              <div className="p-3 bg-amber-950/40 border border-amber-600/40 rounded-xl text-[11px] text-amber-300 leading-relaxed">
                ⚠️ <strong>F23 Period Locking Rule:</strong> Once marked PAID, this payout period is permanently locked and cannot be edited. Any future adjustments must appear as new entries in future periods.
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setTransferModalPayout(null)}
                  className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-slate-200 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingTransfer || !bankRefInput.trim()}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs rounded-xl shadow-lg cursor-pointer disabled:opacity-50"
                >
                  {submittingTransfer ? 'Recording & Locking...' : 'Lock Period & Mark Paid'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL 3: Itemized Payout Statement                           */}
      {/* ============================================================ */}
      {statementModalId && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl p-6 shadow-2xl relative my-8">
            <button
              onClick={() => setStatementModalId(null)}
              className="absolute top-5 right-5 text-slate-400 hover:text-white font-bold"
            >
              ✕
            </button>

            <div className="flex items-center justify-between pr-8">
              <div>
                <h3 className="text-lg font-black text-white flex items-center gap-2">
                  <span>📜</span> Partner Payout Statement
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  ID: <span className="font-mono text-slate-300">{statementModalId}</span>
                </p>
              </div>

              <a
                href={`${API_BASE_URL}/admin/payouts/${statementModalId}/pdf`}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 bg-saffron hover:bg-saffron/90 text-slate-950 font-black text-xs rounded-xl shadow transition-transform active:scale-95 flex items-center gap-1"
              >
                <span>📄</span>
                <span>Download PDF</span>
              </a>
            </div>

            {statementLoading ? (
              <div className="text-center py-12 text-slate-500 font-medium">Loading statement details...</div>
            ) : statementData ? (
              <div className="mt-5 space-y-4">
                {/* Meta Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs bg-slate-950 p-3.5 rounded-2xl border border-slate-800">
                  <div>
                    <div className="text-[10px] text-slate-500 uppercase font-bold">Shop</div>
                    <div className="font-bold text-white mt-0.5">{statementData.shop?.name}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500 uppercase font-bold">Status</div>
                    <div
                      className={`font-bold mt-0.5 ${
                        statementData.summary?.status === 'PAID' ? 'text-emerald-400' : 'text-amber-400'
                      }`}
                    >
                      {statementData.summary?.status === 'PAID' ? 'PAID & LOCKED' : 'SCHEDULED'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500 uppercase font-bold">Bank UTR</div>
                    <div className="font-mono text-slate-300 mt-0.5">
                      {statementData.summary?.bankReference || 'Pending'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500 uppercase font-bold">Net Settlement</div>
                    <div className="font-black text-emerald-400 mt-0.5">
                      {formatPaise(statementData.summary?.netAmountPaise)}
                    </div>
                  </div>
                </div>

                {/* Itemized Table */}
                <div className="border border-slate-800 rounded-xl overflow-hidden max-h-72 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950 text-slate-400 text-[10px] uppercase font-bold tracking-wider sticky top-0">
                      <tr>
                        <th className="py-2.5 px-3">Date</th>
                        <th className="py-2.5 px-3">Type</th>
                        <th className="py-2.5 px-3">Description / Item</th>
                        <th className="py-2.5 px-3 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 text-slate-300">
                      {statementData.payout?.ledger_entries?.map((entry: any) => (
                        <tr key={entry.id} className="hover:bg-slate-800/40">
                          <td className="py-2 px-3 whitespace-nowrap text-slate-400">{formatDate(entry.created_at)}</td>
                          <td className="py-2 px-3">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                entry.entry_type === 'SALE'
                                  ? 'bg-emerald-950 text-emerald-400'
                                  : entry.entry_type === 'RETURN_DEDUCTION'
                                  ? 'bg-rose-950 text-rose-400'
                                  : 'bg-indigo-950 text-indigo-400'
                              }`}
                            >
                              {entry.entry_type}
                            </span>
                          </td>
                          <td className="py-2 px-3">
                            {entry.order_item?.order?.order_no ? (
                              <span>
                                Order #{entry.order_item.order.order_no} ({entry.order_item.product?.name || 'Item'})
                              </span>
                            ) : (
                              <span>{entry.notes || '-'}</span>
                            )}
                          </td>
                          <td
                            className={`py-2 px-3 text-right font-bold ${
                              entry.entry_type === 'RETURN_DEDUCTION' || entry.amount_paise < 0
                                ? 'text-rose-400'
                                : 'text-emerald-400'
                            }`}
                          >
                            {entry.entry_type === 'RETURN_DEDUCTION' || entry.amount_paise < 0 ? '-' : '+'}
                            {formatPaise(Math.abs(entry.amount_paise))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    onClick={() => setStatementModalId(null)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL 4: Edit Bank Account Details                           */}
      {/* ============================================================ */}
      {editBankShop && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-6 shadow-2xl relative">
            <button
              onClick={() => setEditBankShop(null)}
              className="absolute top-5 right-5 text-slate-400 hover:text-white font-bold"
            >
              ✕
            </button>

            <h3 className="text-lg font-black text-white flex items-center gap-2">
              <span>🏦</span> Configure Bank Account
            </h3>
            <p className="text-xs text-slate-400 mt-1">For {editBankShop.name}</p>

            <form onSubmit={handleSaveBank} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Account Holder Name *</label>
                <input
                  type="text"
                  value={bankHolderInput}
                  onChange={(e) => setBankHolderInput(e.target.value)}
                  placeholder="e.g. Ramesh Enterprises"
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-saffron"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Bank Name *</label>
                <input
                  type="text"
                  value={bankNameInput}
                  onChange={(e) => setBankNameInput(e.target.value)}
                  placeholder="e.g. HDFC Bank, Kothrud Branch"
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-saffron"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Bank Account Number *</label>
                <input
                  type="text"
                  value={bankAcctInput}
                  onChange={(e) => setBankAcctInput(e.target.value)}
                  placeholder="e.g. 50100234567890"
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-saffron"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">IFSC Code *</label>
                <input
                  type="text"
                  value={bankIfscInput}
                  onChange={(e) => setBankIfscInput(e.target.value)}
                  placeholder="e.g. HDFC0001234"
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 font-mono uppercase focus:outline-none focus:border-saffron"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditBankShop(null)}
                  className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-slate-200 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingBank}
                  className="px-5 py-2.5 bg-saffron hover:bg-saffron/90 text-slate-950 font-black text-xs rounded-xl shadow-lg cursor-pointer disabled:opacity-50"
                >
                  {submittingBank ? 'Saving...' : 'Save Bank Details'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL 5: Create Adjustment Entry                             */}
      {/* ============================================================ */}
      {adjShop && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-6 shadow-2xl relative">
            <button
              onClick={() => setAdjShop(null)}
              className="absolute top-5 right-5 text-slate-400 hover:text-white font-bold"
            >
              ✕
            </button>

            <h3 className="text-lg font-black text-white flex items-center gap-2">
              <span>⚖️</span> Record Ledger Adjustment
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Per F23: Used for corrections to past locked periods. Appears in the next settlement run.
            </p>

            <form onSubmit={handleCreateAdjustment} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Adjustment Amount in ₹ (positive for credit, negative for debit) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={adjAmountRupees}
                  onChange={(e) => setAdjAmountRupees(e.target.value)}
                  placeholder="e.g. 150 or -50"
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-saffron"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Reason / Notes *</label>
                <textarea
                  value={adjNotes}
                  onChange={(e) => setAdjNotes(e.target.value)}
                  placeholder="Explain why this adjustment is being made (e.g. Reconciliation correction for order #10042)"
                  required
                  rows={3}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-saffron"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAdjShop(null)}
                  className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-slate-200 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingAdj}
                  className="px-5 py-2.5 bg-saffron hover:bg-saffron/90 text-slate-950 font-black text-xs rounded-xl shadow-lg cursor-pointer disabled:opacity-50"
                >
                  {submittingAdj ? 'Recording...' : 'Record Adjustment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
