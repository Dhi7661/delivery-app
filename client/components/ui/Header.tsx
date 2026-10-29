'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BRAND_NAME, DELIVERY_ETA_TEXT } from '@/lib/brand';

export interface HeaderProps {
  showBack?: boolean;
  title?: string;
  subtitle?: string;
  pincode?: string;
  locationLabel?: string;
  showChips?: boolean;
  rightElement?: React.ReactNode;
  variant?:
    | 'default'
    | 'category'
    | 'product'
    | 'orders'
    | 'account'
    | 'checkout'
    | 'order-placed'
    | 'track-order';
  onShare?: () => void;
}

export default function Header({
  showBack = false,
  title,
  subtitle,
  pincode = '411038',
  locationLabel = 'Kothrud, Pune',
  showChips = true,
  rightElement,
  variant = 'default',
  onShare,
}: HeaderProps) {
  const router = useRouter();

  // Location pill component
  const locationPill = (
    <div className="flex min-h-[34px] items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs font-bold text-heading shadow-2xs min-w-0">
      <svg
        className="h-3.5 w-3.5 text-primary shrink-0"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
        />
      </svg>
      <span className="truncate">
        {locationLabel} &bull; {pincode}
      </span>
      <svg
        className="h-3 w-3 text-muted shrink-0 ml-0.5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2.5}
          d="M19 9l-7 7-7-7"
        />
      </svg>
    </div>
  );

  // ETA pill component
  const etaPill = (
    <div className="flex min-h-[34px] shrink-0 items-center gap-1.5 rounded-full border border-border bg-chip px-2.5 py-1 text-xs font-bold text-heading">
      <svg
        className="h-3.5 w-3.5 text-primary shrink-0"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <circle cx="12" cy="12" r="9" strokeWidth={2} />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 7v5l3 3"
        />
      </svg>
      <span className="whitespace-nowrap">{DELIVERY_ETA_TEXT}</span>
    </div>
  );

  // 1. Category Variant matching category.png
  if (variant === 'category') {
    return (
      <header className="sticky top-0 z-40 w-full border-b border-border bg-background/95 px-3.5 py-2.5 backdrop-blur-md space-y-2">
        <div className="mx-auto flex max-w-md items-center justify-between gap-2">
          <div className="flex min-h-[32px] items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-0.5 text-xs font-bold text-heading shadow-2xs">
            <svg
              className="h-3.5 w-3.5 text-primary shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            <span>{pincode} Kothrud</span>
          </div>
          {etaPill}
        </div>

        <div className="mx-auto flex max-w-md items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <button
              type="button"
              onClick={() => router.back()}
              aria-label="Go back"
              className="flex min-h-[40px] min-w-[36px] shrink-0 items-center justify-center rounded-[10px] text-heading hover:bg-surface active:bg-chip transition-colors"
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
            <h1 className="text-lg font-black text-heading truncate">
              {title || 'Category'}
            </h1>
          </div>

          <Link
            href="/search"
            aria-label="Search essentials"
            className="flex min-h-[40px] min-w-[36px] shrink-0 items-center justify-center rounded-[10px] text-heading hover:bg-surface active:bg-chip transition-colors"
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
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </Link>
        </div>
      </header>
    );
  }

  // 2. Product Detail Variant matching product.png
  if (variant === 'product') {
    return (
      <header className="sticky top-0 z-40 w-full border-b border-border bg-background/95 px-3.5 py-2.5 backdrop-blur-md">
        <div className="mx-auto flex max-w-md items-center justify-between gap-2 min-w-0">
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="Go back"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-card text-heading shadow-2xs hover:bg-surface active:bg-chip transition-colors"
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

          <div className="flex items-center gap-2 min-w-0">
            <div className="flex min-h-[32px] items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-0.5 text-xs font-bold text-heading shadow-2xs">
              <svg
                className="h-3.5 w-3.5 text-primary shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                />
              </svg>
              <span>Kothrud {pincode}</span>
            </div>
            {etaPill}
          </div>

          <button
            type="button"
            onClick={onShare}
            aria-label="Share product"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-card text-heading shadow-2xs hover:bg-surface active:bg-chip transition-colors"
          >
            <svg
              className="h-4 w-4 text-heading"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
              />
            </svg>
          </button>
        </div>
      </header>
    );
  }

  // 3. Orders Variant matching orders.png
  if (variant === 'orders') {
    return (
      <header className="sticky top-0 z-40 w-full border-b border-border bg-background/95 px-3.5 py-2.5 backdrop-blur-md space-y-2">
        <div className="mx-auto flex max-w-md items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <svg
              className="h-5 w-5 shrink-0 text-primary"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
              />
            </svg>
            <span className="text-base font-extrabold text-heading">
              {BRAND_NAME}
            </span>
          </div>
          {etaPill}
        </div>

        <div className="mx-auto max-w-md">
          {locationPill}
        </div>
      </header>
    );
  }

  // 4. Account Variant matching account.png
  if (variant === 'account') {
    return (
      <header className="sticky top-0 z-40 w-full border-b border-border bg-background/95 px-3.5 py-2.5 backdrop-blur-md">
        <div className="mx-auto flex max-w-md items-center justify-between gap-2 min-w-0">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <svg
              className="h-5 w-5 shrink-0 text-primary"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
              />
            </svg>
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-extrabold text-heading leading-tight truncate">
                {BRAND_NAME}
              </span>
              <span className="text-[11px] font-semibold text-muted leading-tight truncate">
                {locationLabel} &bull; {pincode}
              </span>
            </div>
          </div>
          {etaPill}
        </div>
      </header>
    );
  }

  // 5. Checkout Variant matching checkout.png
  if (variant === 'checkout') {
    return (
      <header className="sticky top-0 z-40 w-full border-b border-border bg-background/95 px-3.5 py-2.5 backdrop-blur-md">
        <div className="mx-auto flex max-w-md items-center justify-between gap-2 min-w-0">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <button
              type="button"
              onClick={() => router.back()}
              aria-label="Go back"
              className="flex min-h-[40px] min-w-[36px] shrink-0 items-center justify-center rounded-[10px] text-heading hover:bg-surface active:bg-chip transition-colors"
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
            <div className="flex flex-col min-w-0 flex-1">
              <h1 className="text-base font-extrabold leading-tight text-heading truncate">
                Review &amp; Checkout
              </h1>
              <div className="flex items-center gap-1 text-[11px] font-semibold text-muted leading-tight truncate">
                <svg
                  className="h-3 w-3 text-primary shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                  />
                </svg>
                <span className="truncate">{locationLabel} &bull; {pincode}</span>
              </div>
            </div>
          </div>
          {etaPill}
        </div>
      </header>
    );
  }

  // 6. Track Order Variant matching track-order.png
  if (variant === 'track-order') {
    return (
      <header className="sticky top-0 z-40 w-full border-b border-border bg-background/95 px-3.5 py-2.5 backdrop-blur-md">
        <div className="mx-auto flex max-w-md items-center justify-between gap-2 min-w-0">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <button
              type="button"
              onClick={() => router.back()}
              aria-label="Go back"
              className="flex min-h-[40px] min-w-[36px] shrink-0 items-center justify-center rounded-[10px] text-heading hover:bg-surface active:bg-chip transition-colors"
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
            <div className="flex flex-col min-w-0 flex-1">
              <h1 className="text-base font-extrabold leading-tight text-heading truncate">
                {title || 'Track Order'}
              </h1>
              <span className="text-[11px] font-semibold text-muted leading-tight truncate">
                {subtitle || `${BRAND_NAME} \u2022 Kothrud Hub`}
              </span>
            </div>
          </div>

          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-card text-heading shadow-2xs">
            <svg
              className="h-4 w-4 text-muted"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
        </div>
      </header>
    );
  }

  // 7. Order Placed Variant matching order-placed.png
  if (variant === 'order-placed') {
    return (
      <header className="sticky top-0 z-40 w-full border-b border-border bg-background/95 px-3.5 py-2.5 backdrop-blur-md">
        <div className="mx-auto flex max-w-md items-center justify-between gap-2 min-w-0">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <svg
              className="h-5 w-5 shrink-0 text-primary"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
              />
            </svg>
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-extrabold text-heading leading-tight truncate">
                {BRAND_NAME}
              </span>
              <span className="text-[11px] font-semibold text-muted leading-tight truncate">
                {locationLabel} &bull; {pincode}
              </span>
            </div>
          </div>
          {etaPill}
        </div>
      </header>
    );
  }

  // Default Variant (Home, Search, or generic with/without back)
  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/95 px-3.5 py-2.5 backdrop-blur-md">
      <div className="mx-auto flex max-w-md items-center justify-between gap-2 min-w-0">
        {showBack ? (
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <button
              type="button"
              onClick={() => router.back()}
              aria-label="Go back"
              className="flex min-h-[40px] min-w-[36px] shrink-0 items-center justify-center rounded-[10px] text-heading hover:bg-surface active:bg-chip transition-colors"
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
            <div className="flex flex-col min-w-0 flex-1">
              <h1 className="text-base font-extrabold leading-tight text-heading truncate">
                {title || BRAND_NAME}
              </h1>
              {subtitle && (
                <span className="text-[11px] font-semibold text-muted leading-tight truncate">
                  {subtitle}
                </span>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {/* Storefront Icon */}
            <svg
              className="h-5 w-5 shrink-0 text-primary"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-label={BRAND_NAME}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
              />
            </svg>

            {/* Location Pill */}
            {locationPill}
          </div>
        )}

        {/* Right element or Delivery ETA Pill */}
        {rightElement ? (
          <div className="shrink-0">{rightElement}</div>
        ) : showChips ? (
          etaPill
        ) : null}
      </div>
    </header>
  );
}
