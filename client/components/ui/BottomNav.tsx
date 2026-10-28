'use client';

import React, { Suspense } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface Tab {
  name: string;
  href: string;
  icon: (active: boolean) => React.ReactNode;
}

const TABS: Tab[] = [
  {
    name: 'Home',
    href: '/',
    icon: (active) => (
      <svg
        className={`h-5 w-5 ${active ? 'text-primary' : 'text-muted'}`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={active ? 2.5 : 1.75}
          d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
        />
      </svg>
    ),
  },
  {
    name: 'Search',
    href: '/search',
    icon: (active) => (
      <svg
        className={`h-5 w-5 ${active ? 'text-primary' : 'text-muted'}`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={active ? 2.5 : 1.75}
          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
        />
      </svg>
    ),
  },
  {
    name: 'Cart',
    href: '/cart',
    icon: (active) => (
      <svg
        className={`h-5 w-5 ${active ? 'text-primary' : 'text-muted'}`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={active ? 2.5 : 1.75}
          d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
        />
      </svg>
    ),
  },
  {
    name: 'Orders',
    href: '/orders',
    icon: (active) => (
      <svg
        className={`h-5 w-5 ${active ? 'text-primary' : 'text-muted'}`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={active ? 2.5 : 1.75}
          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
        />
      </svg>
    ),
  },
  {
    name: 'Account',
    href: '/account',
    icon: (active) => (
      <svg
        className={`h-5 w-5 ${active ? 'text-primary' : 'text-muted'}`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={active ? 2.5 : 1.75}
          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
        />
      </svg>
    ),
  },
];

function NavLinks() {
  const pathname = usePathname();

  return (
    <div className="mx-auto grid h-16 max-w-md grid-cols-5 items-center px-2">
      {TABS.map((tab) => {
        const isActive =
          tab.href === '/'
            ? pathname === '/'
            : Boolean(pathname && pathname.startsWith(tab.href));

        return (
          <Link
            key={tab.name}
            href={tab.href}
            className={`flex min-h-[48px] w-full flex-col items-center justify-center rounded-[10px] py-1 transition-colors ${
              isActive
                ? 'text-primary font-bold'
                : 'text-muted hover:text-heading font-medium'
            }`}
          >
            {tab.icon(isActive)}
            <span className="mt-1 text-[11px] leading-tight truncate">
              {tab.name}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

export default function BottomNav() {
  return (
    <nav
      aria-label="Bottom navigation"
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 backdrop-blur-md"
    >
      <Suspense
        fallback={
          <div className="mx-auto grid h-16 max-w-md grid-cols-5 items-center px-2" />
        }
      >
        <NavLinks />
      </Suspense>
    </nav>
  );
}
