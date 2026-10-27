'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AdminHeader from '@/components/AdminHeader';
import { API_BASE_URL } from '@/lib/api';

interface AdminProfile {
  id: string;
  email: string;
  name?: string;
}

interface UploadSuccessData {
  totalProcessed: number;
  createdCount: number;
  updatedCount: number;
  products: Array<{
    id: string;
    action: 'CREATED' | 'UPDATED';
    name: string;
    shopName: string;
    unitSize: string;
    mrpPaise: number;
    shopPricePaise: number;
  }>;
}

interface UploadErrorItem {
  row: number;
  error: string;
}

export default function AdminProductUploadPage() {
  const router = useRouter();
  const [admin, setAdmin] = useState<AdminProfile | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [csvContent, setCsvContent] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [successResult, setSuccessResult] = useState<UploadSuccessData | null>(null);
  const [errorList, setErrorList] = useState<UploadErrorItem[] | null>(null);
  const [generalError, setGeneralError] = useState<string | null>(null);

  // Check admin session on mount
  useEffect(() => {
    async function verifyAdminSession() {
      try {
        const res = await fetch(`${API_BASE_URL}/admin/auth/me`, {
          credentials: 'include',
        });
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.admin) {
            setAdmin(data.admin);
            setCheckingAuth(false);
            return;
          }
        }
        // Unauthenticated, redirect to admin login
        router.replace('/admin/login');
      } catch (err) {
        router.replace('/admin/login');
      }
    }

    verifyAdminSession();
  }, [router]);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await fetch(`${API_BASE_URL}/admin/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      router.replace('/admin/login');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    if (!selected.name.endsWith('.csv')) {
      setGeneralError('Please select a valid .csv file.');
      return;
    }

    setFile(selected);
    setGeneralError(null);
    setSuccessResult(null);
    setErrorList(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setCsvContent(text);
    };
    reader.readAsText(selected);
  };

  const handleLoadSample = async () => {
    try {
      const res = await fetch('/samples/sample_products.csv');
      if (!res.ok) throw new Error('Failed to load sample CSV');
      const text = await res.text();
      setCsvContent(text);
      setFile(new File([text], 'sample_products.csv', { type: 'text/csv' }));
      setGeneralError(null);
      setSuccessResult(null);
      setErrorList(null);
    } catch (err: any) {
      setGeneralError('Unable to load sample CSV: ' + err.message);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!csvContent.trim()) {
      setGeneralError('Please select or load a CSV file first.');
      return;
    }

    setUploading(true);
    setGeneralError(null);
    setSuccessResult(null);
    setErrorList(null);

    try {
      const res = await fetch(`${API_BASE_URL}/admin/products/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          csvContent,
          fileName: file?.name || 'products.csv',
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setSuccessResult({
          totalProcessed: data.totalProcessed,
          createdCount: data.createdCount,
          updatedCount: data.updatedCount,
          products: data.products || [],
        });
      } else if (res.status === 401) {
        setGeneralError('Your admin session has expired. Please sign in again.');
        setTimeout(() => router.push('/admin/login'), 1500);
      } else {
        if (data.errors && Array.isArray(data.errors)) {
          setErrorList(data.errors);
        } else {
          setGeneralError(data.error || 'Upload failed. Please check your file.');
        }
      }
    } catch (err: any) {
      console.error('Upload error:', err);
      setGeneralError('Network error while uploading. Please ensure server is running.');
    } finally {
      setUploading(false);
    }
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-500 font-medium">Verifying admin credentials...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900 antialiased pb-20">
      <AdminHeader adminEmail={admin?.email} activeTab="products" />

      <main className="mx-auto w-full max-w-lg flex-1 px-3 py-4 space-y-4">
        {/* Page Banner / Header */}
        <div className="rounded-2xl bg-white border border-slate-200 p-4 shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 text-xl font-bold">
              📦
            </div>
            <div>
              <h1 className="text-base font-extrabold text-slate-900">Upload Shop Products</h1>
              <p className="text-xs text-slate-500">
                Bulk create or update catalog items with strict all-or-nothing validation.
              </p>
            </div>
          </div>
        </div>

        {/* Upload Form */}
        <form onSubmit={handleUpload} className="rounded-2xl bg-white border border-slate-200 p-4 shadow-2xs space-y-4">
          {/* Sample CSV helper card */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-700">Need a format reference?</span>
              <div className="flex items-center gap-2">
                <a
                  href="/samples/sample_products.csv"
                  download
                  className="font-bold text-emerald-700 hover:underline cursor-pointer"
                >
                  Download CSV
                </a>
                <span className="text-slate-300">|</span>
                <button
                  type="button"
                  onClick={handleLoadSample}
                  className="font-bold text-emerald-700 hover:underline cursor-pointer"
                >
                  Load Sample
                </button>
              </div>
            </div>
            <p className="text-[11px] text-slate-500 font-mono overflow-x-auto whitespace-nowrap bg-white p-2 rounded-lg border border-slate-200">
              shop_name, category, product_name, brand, unit_size, mrp_rupees, shop_price_rupees
            </p>
          </div>

          {/* File Picker */}
          <div>
            <label htmlFor="csv-file-picker" className="block text-xs font-bold text-slate-700 mb-1">
              Select CSV File
            </label>
            <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 p-4 hover:bg-slate-100 transition-colors">
              <input
                id="csv-file-picker"
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileChange}
                className="w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-emerald-600 file:text-white file:cursor-pointer cursor-pointer"
              />
              {file && (
                <div className="mt-2 text-xs font-medium text-emerald-700 flex items-center gap-1.5 self-start">
                  <span>📄 {file.name}</span>
                  <span className="text-slate-400">({(file.size / 1024).toFixed(1)} KB)</span>
                </div>
              )}
            </div>
          </div>

          {/* General Error Banner */}
          {generalError && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 flex items-start gap-2 animate-fade-in">
              <span className="text-rose-600">⚠️</span>
              <span className="font-medium flex-1">{generalError}</span>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={uploading || !csvContent.trim()}
            className={`flex min-h-[48px] w-full items-center justify-center rounded-xl font-bold text-sm text-white shadow-md transition-all active:scale-98 ${
              uploading || !csvContent.trim()
                ? 'bg-slate-300 cursor-not-allowed text-slate-500'
                : 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 cursor-pointer'
            }`}
          >
            {uploading ? (
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                <span>Validating & Uploading...</span>
              </div>
            ) : (
              <span>Upload & Import CSV</span>
            )}
          </button>
        </form>

        {/* Validation Errors List (All-or-Nothing) */}
        {errorList && errorList.length > 0 && (
          <div className="rounded-2xl border border-rose-300 bg-white p-4 shadow-sm space-y-3 animate-fade-in">
            <div className="flex items-start gap-2">
              <span className="text-xl">❌</span>
              <div>
                <h2 className="text-sm font-extrabold text-rose-900">
                  Import Refused: {errorList.length} Error{errorList.length > 1 ? 's' : ''} Found
                </h2>
                <p className="text-xs text-rose-700 mt-0.5">
                  Import is all-or-nothing. No products were added or changed. Correct the rows below and re-upload.
                </p>
              </div>
            </div>

            <div className="max-h-72 overflow-y-auto divide-y divide-rose-100 rounded-xl border border-rose-200 bg-rose-50/50">
              {errorList.map((err, idx) => (
                <div key={idx} className="p-2.5 text-xs flex items-start gap-2">
                  <span className="inline-block rounded-md bg-rose-200 px-1.5 py-0.5 text-[10px] font-black text-rose-900 shrink-0">
                    Row {err.row}
                  </span>
                  <span className="text-rose-800 font-medium">{err.error}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Success Results Card */}
        {successResult && (
          <div className="rounded-2xl border border-emerald-300 bg-white p-4 shadow-sm space-y-3 animate-fade-in">
            <div className="flex items-start gap-2">
              <span className="text-xl">✅</span>
              <div>
                <h2 className="text-sm font-extrabold text-emerald-950">CSV Imported Successfully</h2>
                <p className="text-xs text-emerald-800 mt-0.5">
                  All rows passed validation and were committed to the database.
                </p>
              </div>
            </div>

            {/* Metrics Chips */}
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-2 text-center">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Total</span>
                <span className="text-base font-black text-slate-900">{successResult.totalProcessed}</span>
              </div>
              <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-2 text-center">
                <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block">Created</span>
                <span className="text-base font-black text-emerald-900">+{successResult.createdCount}</span>
              </div>
              <div className="rounded-xl bg-blue-50 border border-blue-200 p-2 text-center">
                <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider block">Updated</span>
                <span className="text-base font-black text-blue-900">{successResult.updatedCount}</span>
              </div>
            </div>

            {/* Itemized List */}
            <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 rounded-xl border border-slate-200 bg-slate-50">
              {successResult.products.map((item, idx) => (
                <div key={idx} className="p-2.5 text-xs flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <span className="font-bold text-slate-900 block truncate">{item.name}</span>
                    <span className="text-[10px] text-slate-500 block truncate">
                      {item.shopName} • {item.unitSize}
                    </span>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="font-mono font-bold text-slate-900 block text-xs">
                      ₹{(item.mrpPaise / 100).toFixed(2)}
                    </span>
                    <span
                      className={`inline-block rounded-md px-1.5 py-0.5 text-[9px] font-black uppercase ${
                        item.action === 'CREATED'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}
                    >
                      {item.action}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
