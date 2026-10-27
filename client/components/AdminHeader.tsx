'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { API_BASE_URL } from '@/lib/api';

interface AdminHeaderProps {
  adminEmail?: string;
  activeTab?: 'orders' | 'deliveries' | 'products';
}

export default function AdminHeader({ adminEmail, activeTab }: AdminHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [loggingOut, setLoggingOut] = useState(false);

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

  const currentTab =
    activeTab ||
    (pathname?.includes('/admin/deliveries')
      ? 'deliveries'
      : pathname?.includes('/admin/products')
      ? 'products'
      : 'orders');

  return (
    <header className="sticky top-0 z-30 bg-slate-900 text-white border-b border-slate-800 shadow-md">
      {/* Top Bar */}
      <div className="mx-auto max-w-lg px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link href="/admin/orders" className="flex items-center gap-2">
            <span className="w-7 h-7 bg-emerald-500 rounded-lg flex items-center justify-center font-black text-white text-sm">
              P
            </span>
            <span className="font-extrabold text-base tracking-tight text-white">PlukIt</span>
          </Link>
          <span className="px-2 py-0.5 bg-emerald-950 text-emerald-400 border border-emerald-800 rounded-full text-[10px] font-black uppercase tracking-wider">
            Admin
          </span>
        </div>

        <div className="flex items-center gap-2">
          {adminEmail && (
            <span className="text-[11px] text-slate-400 font-medium hidden sm:inline-block truncate max-w-[140px]">
              {adminEmail}
            </span>
          )}
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="px-2.5 py-1.5 min-h-[36px] bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg transition-colors border border-slate-700 active:scale-95 cursor-pointer"
          >
            {loggingOut ? 'Signing out...' : 'Sign Out'}
          </button>
        </div>
      </div>

      {/* Admin Navigation Tabs */}
      <div className="mx-auto max-w-lg px-3 flex gap-1 border-t border-slate-800/80 text-xs font-bold overflow-x-auto scrollbar-none">
        <Link
          href="/admin/orders"
          className={`py-2.5 px-2.5 border-b-2 flex items-center gap-1.5 transition-colors whitespace-nowrap min-h-[42px] ${
            currentTab === 'orders'
              ? 'border-emerald-500 text-emerald-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <span>📦</span>
          <span>Orders</span>
        </Link>

        <Link
          href="/admin/deliveries"
          className={`py-2.5 px-2.5 border-b-2 flex items-center gap-1.5 transition-colors whitespace-nowrap min-h-[42px] ${
            currentTab === 'deliveries'
              ? 'border-emerald-500 text-emerald-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <span>🛵</span>
          <span>Deliveries &amp; Cash</span>
        </Link>

        <Link
          href="/admin/products/upload"
          className={`py-2.5 px-2.5 border-b-2 flex items-center gap-1.5 transition-colors whitespace-nowrap min-h-[42px] ${
            currentTab === 'products'
              ? 'border-emerald-500 text-emerald-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <span>📄</span>
          <span>CSV Upload</span>
        </Link>
      </div>
    </header>
  );
}
