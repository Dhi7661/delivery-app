'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { API_BASE_URL } from '@/lib/api';

interface AdminHeaderProps {
  adminEmail?: string;
  activeTab?: 'orders' | 'deliveries' | 'products' | 'notifications' | 'settings' | 'operations' | 'payouts';
}

/**
 * Admin Navigation Header (Spec Version 1.2)
 * Styled using Warm Saffron Design Tokens (Dark Slate theme removed per Spec Section 0 & 11)
 * Minimum 44px touch targets.
 */
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
      : pathname?.includes('/admin/payouts')
      ? 'payouts'
      : pathname?.includes('/admin/notifications')
      ? 'notifications'
      : pathname?.includes('/admin/operations')
      ? 'operations'
      : pathname?.includes('/admin/settings')
      ? 'settings'
      : 'orders');

  return (
    <nav aria-label="Admin Navigation" className="sticky top-0 z-30 bg-[#6B3A1E] text-[#FEF9F1] border-b border-[#50240A] shadow-md">
      {/* Top Bar */}
      <div className="mx-auto max-w-5xl px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link href="/admin/orders" className="flex items-center gap-2 min-h-[44px]">
            <span className="w-8 h-8 bg-[#FEBA49] text-[#704B00] rounded-xl flex items-center justify-center font-black text-base shadow-sm">
              P
            </span>
            <span className="font-extrabold text-lg tracking-tight text-[#FEF9F1]">PlukIt</span>
          </Link>
          <span className="px-2.5 py-1 bg-[#50240A] text-[#FEBA49] border border-[#FEBA49]/30 rounded-full text-[10px] font-black uppercase tracking-wider">
            Admin
          </span>
        </div>

        <div className="flex items-center gap-2">
          {adminEmail && (
            <span className="text-xs text-[#FEF9F1]/80 font-medium hidden sm:inline-block truncate max-w-[160px]">
              {adminEmail}
            </span>
          )}
          <Link
            href="/delivery"
            className="px-3 py-2 min-h-[44px] inline-flex items-center gap-1.5 bg-[#FEBA49]/20 hover:bg-[#FEBA49]/30 text-[#FEBA49] text-xs font-bold rounded-xl transition-all border border-[#FEBA49]/40 active:scale-95 cursor-pointer"
            title="Open Rider Delivery Portal"
          >
            <span>🛵</span>
            <span className="hidden xs:inline">Rider View</span>
          </Link>
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="px-3 py-2 min-h-[44px] bg-[#50240A] hover:bg-[#401c07] text-[#FEF9F1] text-xs font-bold rounded-xl transition-colors border border-[#FEBA49]/20 active:scale-95 cursor-pointer"
          >
            {loggingOut ? 'Signing out...' : 'Sign Out'}
          </button>
        </div>
      </div>

      {/* Admin Navigation Tabs - Minimum 44px touch targets */}
      <div className="mx-auto max-w-5xl px-3 flex gap-1 border-t border-[#50240A]/60 text-xs font-bold overflow-x-auto scrollbar-none">
        <Link
          href="/admin/orders"
          className={`py-2.5 px-3 border-b-2 flex items-center gap-1.5 transition-colors whitespace-nowrap min-h-[44px] ${
            currentTab === 'orders'
              ? 'border-[#FEBA49] text-[#FEBA49] bg-[#50240A]/40'
              : 'border-transparent text-[#FEF9F1]/70 hover:text-[#FEF9F1] hover:bg-[#50240A]/20'
          }`}
        >
          <span>📦</span>
          <span>Orders</span>
        </Link>

        <Link
          href="/admin/deliveries"
          className={`py-2.5 px-3 border-b-2 flex items-center gap-1.5 transition-colors whitespace-nowrap min-h-[44px] ${
            currentTab === 'deliveries'
              ? 'border-[#FEBA49] text-[#FEBA49] bg-[#50240A]/40'
              : 'border-transparent text-[#FEF9F1]/70 hover:text-[#FEF9F1] hover:bg-[#50240A]/20'
          }`}
        >
          <span>🛵</span>
          <span>Deliveries &amp; Cash</span>
        </Link>

        <Link
          href="/admin/payouts"
          className={`py-2.5 px-3 border-b-2 flex items-center gap-1.5 transition-colors whitespace-nowrap min-h-[44px] ${
            currentTab === 'payouts'
              ? 'border-[#FEBA49] text-[#FEBA49] bg-[#50240A]/40'
              : 'border-transparent text-[#FEF9F1]/70 hover:text-[#FEF9F1] hover:bg-[#50240A]/20'
          }`}
        >
          <span>💰</span>
          <span>Payouts</span>
        </Link>

        <Link
          href="/admin/products/upload"
          className={`py-2.5 px-3 border-b-2 flex items-center gap-1.5 transition-colors whitespace-nowrap min-h-[44px] ${
            currentTab === 'products'
              ? 'border-[#FEBA49] text-[#FEBA49] bg-[#50240A]/40'
              : 'border-transparent text-[#FEF9F1]/70 hover:text-[#FEF9F1] hover:bg-[#50240A]/20'
          }`}
        >
          <span>📄</span>
          <span>CSV Upload</span>
        </Link>

        <Link
          href="/admin/notifications"
          className={`py-2.5 px-3 border-b-2 flex items-center gap-1.5 transition-colors whitespace-nowrap min-h-[44px] ${
            currentTab === 'notifications'
              ? 'border-[#FEBA49] text-[#FEBA49] bg-[#50240A]/40'
              : 'border-transparent text-[#FEF9F1]/70 hover:text-[#FEF9F1] hover:bg-[#50240A]/20'
          }`}
        >
          <span>🔔</span>
          <span>Notifications</span>
        </Link>

        <Link
          href="/admin/operations"
          className={`py-2.5 px-3 border-b-2 flex items-center gap-1.5 transition-colors whitespace-nowrap min-h-[44px] ${
            currentTab === 'operations'
              ? 'border-[#FEBA49] text-[#FEBA49] bg-[#50240A]/40'
              : 'border-transparent text-[#FEF9F1]/70 hover:text-[#FEF9F1] hover:bg-[#50240A]/20'
          }`}
        >
          <span>📊</span>
          <span>Operations</span>
        </Link>

        <Link
          href="/admin/settings"
          className={`py-2.5 px-3 border-b-2 flex items-center gap-1.5 transition-colors whitespace-nowrap min-h-[44px] ${
            currentTab === 'settings'
              ? 'border-[#FEBA49] text-[#FEBA49] bg-[#50240A]/40'
              : 'border-transparent text-[#FEF9F1]/70 hover:text-[#FEF9F1] hover:bg-[#50240A]/20'
          }`}
        >
          <span>⚙️</span>
          <span>Settings</span>
        </Link>
      </div>
    </nav>
  );
}
