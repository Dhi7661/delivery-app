'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BRAND_NAME, DELIVERY_ETA_TEXT } from '@/lib/brand';
import PincodeChip from './PincodeChip';

export interface HeaderProps {
  showBack?: boolean;
  title?: string;
  pincode?: string;
  showChips?: boolean;
}

export default function Header({
  showBack,
  title,
  pincode = '411001',
  showChips = true,
}: HeaderProps) {
  const router = useRouter();

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/95 px-4 py-2.5 backdrop-blur-md">
      <div className="mx-auto flex max-w-md items-center justify-between gap-2 min-w-0">
        {showBack ? (
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <button
              type="button"
              onClick={() => router.back()}
              aria-label="Go back"
              className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-[12px] text-heading hover:bg-surface active:bg-chip transition-colors"
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
            <h1 className="text-base font-extrabold text-heading truncate min-w-0">
              {title || BRAND_NAME}
            </h1>
          </div>
        ) : (
          <Link href="/" className="flex items-center gap-2 min-w-0 flex-1">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-saffron font-black text-on-saffron shadow-xs text-base">
              {BRAND_NAME.charAt(0)}
            </span>
            <div className="flex flex-col min-w-0">
              <span className="text-lg font-black tracking-tight text-heading leading-tight">
                {BRAND_NAME}
              </span>
              <span className="text-[11px] font-semibold text-muted leading-tight">
                {DELIVERY_ETA_TEXT}
              </span>
            </div>
          </Link>
        )}

        {showChips && (
          <div className="flex items-center gap-1.5 shrink-0">
            <PincodeChip pincode={pincode} />
          </div>
        )}
      </div>
    </header>
  );
}
