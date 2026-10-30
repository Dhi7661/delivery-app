'use client';

import React from 'react';
import Link from 'next/link';
import { BRAND_NAME } from '@/lib/brand';

export default function Footer() {
  return (
    <footer className="w-full border-t border-border/60 bg-surface/50 text-text mt-8 pb-12 pt-6">
      <div className="mx-auto max-w-md px-4 space-y-4">
        {/* Brand & Slogan */}
        <div className="flex items-center justify-between">
          <div>
            <span className="text-base font-black tracking-tight text-heading">
              {BRAND_NAME}
            </span>
            <p className="text-[11px] font-semibold text-muted">
              Hyperlocal Pune Groceries &bull; Farm Fresh in 20-30 Mins
            </p>
          </div>
          <span className="rounded-[10px] border border-border bg-chip px-2.5 py-1 text-[10px] font-bold text-primary">
            DPDP 2023 Compliant
          </span>
        </div>

        {/* Legal & Policy Navigation Links */}
        <div className="rounded-[16px] border border-border bg-card p-3 shadow-2xs">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted block mb-2">
            Legal, Policies &amp; Governance
          </span>
          <div className="grid grid-cols-2 gap-y-2 gap-x-3 text-xs font-bold text-heading">
            <Link
              href="/terms"
              className="hover:text-primary transition-colors flex items-center gap-1.5"
            >
              <span className="text-muted">&bull;</span> Terms &amp; Conditions
            </Link>
            <Link
              href="/privacy"
              className="hover:text-primary transition-colors flex items-center gap-1.5"
            >
              <span className="text-muted">&bull;</span> Privacy Policy
            </Link>
            <Link
              href="/refund-policy"
              className="hover:text-primary transition-colors flex items-center gap-1.5"
            >
              <span className="text-muted">&bull;</span> Refund &amp; Cancellation
            </Link>
            <Link
              href="/delivery-policy"
              className="hover:text-primary transition-colors flex items-center gap-1.5"
            >
              <span className="text-muted">&bull;</span> Delivery Policy
            </Link>
            <Link
              href="/contact"
              className="hover:text-primary transition-colors flex items-center gap-1.5 col-span-2"
            >
              <span className="text-muted">&bull;</span> Contact &amp; Grievance Officer
            </Link>
          </div>
        </div>

        {/* DPDP Act 2023 Notice & Grievance Redressal */}
        <div className="rounded-[14px] border border-border/80 bg-chip/60 p-3 text-[11px] space-y-1.5 text-muted">
          <p className="font-semibold text-heading flex items-center gap-1.5">
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
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
              />
            </svg>
            <span>DPDP Act 2023 Data Protection Guarantee</span>
          </p>
          <p className="leading-relaxed">
            Your personal data is strictly protected under India&apos;s Digital Personal Data Protection
            Act 2023. We never sell, rent, or trade your data.
          </p>
          <div className="pt-1 border-t border-border/50 text-[10px]">
            <span className="font-bold text-heading">Grievance Officer:</span> Rohit Deshmukh &bull;{' '}
            <a href="mailto:grievance@plukit.in" className="text-primary underline">
              grievance@plukit.in
            </a>{' '}
            &bull; +91 98220 12345
          </div>
        </div>

        {/* Copyright */}
        <div className="text-center text-[10px] font-semibold text-muted pt-1">
          &copy; 2026 {BRAND_NAME} Technologies Pvt. Ltd. Pune, MH, India. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
