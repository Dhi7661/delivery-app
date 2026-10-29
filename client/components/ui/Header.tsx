'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BRAND_NAME } from '@/lib/brand';
import PincodeChip from './PincodeChip';

export interface HeaderProps {
  title?: string;
  showBack?: boolean;
  showLocation?: boolean;
}

export default function Header({
  title,
  showBack = false,
  showLocation = true,
}: HeaderProps) {
  const router = useRouter();
  const [savedPincode, setSavedPincode] = useState('411038');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('plukit_pincode');
      if (stored) setSavedPincode(stored);
    }
  }, []);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-surface shadow-2xs">
      <div className="mx-auto flex h-14 max-w-md items-center justify-between px-4 pt-[env(safe-area-inset-top,0px)]">
        {/* Left: Back button (44px touch target) + Title/Brand */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {showBack && (
            <button
              type="button"
              onClick={() => router.back()}
              aria-label="Go back"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-primary hover:bg-chip/70 active:scale-95 transition-all -ml-2"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2.5}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>
          )}

          <h1 className="text-base font-extrabold text-heading truncate">
            {title || BRAND_NAME}
          </h1>
        </div>

        {/* Right: Location chip */}
        {showLocation && (
          <div className="shrink-0 pl-2">
            <PincodeChip pincode={savedPincode} label="Pune" />
          </div>
        )}
      </div>
    </header>
  );
}
