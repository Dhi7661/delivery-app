'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BRAND_NAME } from '@/lib/brand';

interface HeaderProps {
  showBack?: boolean;
  title?: string;
}

export default function Header({ showBack, title }: HeaderProps) {
  const router = useRouter();

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200 bg-white/95 px-3 py-2 shadow-2xs backdrop-blur-md">
      <div className="mx-auto flex max-w-md items-center justify-between gap-1.5 min-w-0">
        {showBack ? (
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <button
              type="button"
              onClick={() => router.back()}
              aria-label="Go back"
              className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl text-slate-700 hover:bg-slate-100 active:bg-slate-200"
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
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>
            <h1 className="text-sm font-bold text-slate-900 truncate min-w-0">
              {title || BRAND_NAME}
            </h1>
          </div>
        ) : (
          <Link href="/" className="flex items-center gap-1.5 min-w-0 flex-1">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-600 font-bold text-white shadow-xs">
              {BRAND_NAME.charAt(0)}
            </span>
            <div className="flex flex-col min-w-0">
              <span className="text-lg font-black tracking-tight text-emerald-950 leading-none">
                {BRAND_NAME}
              </span>
              <span className="text-[10px] font-medium text-slate-500 leading-tight">
                15-45 mins
              </span>
            </div>
          </Link>
        )}

        {/* Serviceable Pincode Selector */}
        <div className="flex min-h-[36px] shrink-0 items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
          <svg
            className="h-3.5 w-3.5 text-emerald-600 shrink-0"
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
          <span className="text-[11px] whitespace-nowrap">
            Pin: <strong>411001</strong>
          </span>
        </div>
      </div>
    </header>
  );
}
