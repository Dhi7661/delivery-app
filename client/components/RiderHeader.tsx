'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { API_BASE_URL } from '@/lib/api';

interface RiderHeaderProps {
  riderName?: string;
  isOnline?: boolean;
  pendingSyncCount?: number;
}

/**
 * Rider Portal Header (Spec Section 7 & 11)
 * Styled with Warm Saffron tokens, 44px min touch targets.
 * Includes offline sync status indicator.
 */
export default function RiderHeader({
  riderName = 'Delivery Partner',
  isOnline = true,
  pendingSyncCount = 0,
}: RiderHeaderProps) {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await fetch(`${API_BASE_URL}/delivery/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch (err) {
      console.error('Rider logout error:', err);
    } finally {
      router.replace('/delivery/login');
    }
  };

  return (
    <header className="sticky top-0 z-30 bg-[#6B3A1E] text-[#FEF9F1] border-b border-[#50240A] shadow-sm">
      <div className="mx-auto max-w-lg px-4 py-2.5 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center gap-2">
          <Link href="/delivery" className="flex items-center gap-2 min-h-[44px]">
            <span className="w-8 h-8 bg-[#FEBA49] text-[#704B00] rounded-xl flex items-center justify-center font-black text-base shadow-sm">
              P
            </span>
            <div className="leading-tight">
              <span className="font-extrabold text-base tracking-tight text-[#FEF9F1] block">
                PlukIt Delivery
              </span>
              <span className="text-[10px] text-[#FEBA49] font-bold uppercase tracking-wider block">
                Pilot Portal
              </span>
            </div>
          </Link>
        </div>

        {/* Right side status and controls */}
        <div className="flex items-center gap-2">
          {/* Offline / Pending Sync Badge (Spec Section 7.7) */}
          {!isOnline ? (
            <span className="px-2.5 py-1 bg-[#B42318] text-white rounded-lg text-xs font-bold animate-pulse flex items-center gap-1">
              <span>⚠️</span>
              <span>Offline</span>
            </span>
          ) : pendingSyncCount > 0 ? (
            <span className="px-2.5 py-1 bg-[#FEBA49] text-[#704B00] rounded-lg text-xs font-bold flex items-center gap-1">
              <span className="animate-spin">🔄</span>
              <span>Syncing ({pendingSyncCount})</span>
            </span>
          ) : (
            <span className="px-2.5 py-1 bg-[#50240A] text-[#FEBA49] rounded-lg text-xs font-bold hidden sm:inline-flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              <span>Online</span>
            </span>
          )}

          <div className="text-right hidden xs:block">
            <span className="text-xs font-bold text-[#FEF9F1] block truncate max-w-[110px]">
              {riderName}
            </span>
          </div>

          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="px-3 py-2 min-h-[44px] bg-[#50240A] hover:bg-[#401c07] text-[#FEF9F1] text-xs font-bold rounded-xl transition-colors border border-[#FEBA49]/20 active:scale-95 cursor-pointer"
          >
            {loggingOut ? '...' : 'Sign Out'}
          </button>
        </div>
      </div>
    </header>
  );
}

