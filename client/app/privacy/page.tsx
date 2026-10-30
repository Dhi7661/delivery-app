'use client';

import React from 'react';
import Header from '@/components/ui/Header';
import Footer from '@/components/ui/Footer';
import BottomNav from '@/components/ui/BottomNav';
import { BRAND_NAME } from '@/lib/brand';

export default function PrivacyPolicyPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-text antialiased pb-24">
      <Header title="Privacy Policy" showBack />

      <main className="mx-auto w-full max-w-md flex-1 px-4 py-4 space-y-4">
        {/* Compliance Hero Banner */}
        <div className="rounded-[20px] border border-border bg-card p-4 shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-primary">
              DPDP Act 2023 Compliant
            </span>
            <span className="rounded-full bg-chip px-2.5 py-0.5 text-[10px] font-bold text-muted">
              Updated Oct 2026
            </span>
          </div>
          <h1 className="text-xl font-extrabold text-heading">Privacy Policy</h1>
          <p className="text-xs text-muted leading-relaxed">
            PlukIt Technologies Pvt. Ltd. is committed to protecting your privacy in full compliance
            with the <strong className="text-text">Digital Personal Data Protection Act, 2023 (DPDP Act)</strong> and the Information Technology Rules, 2011.
          </p>
        </div>

        {/* Commitment: Zero Third-Party Selling */}
        <div className="rounded-[18px] border border-primary/30 bg-primary/5 p-3.5 flex items-start gap-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-card font-bold text-xs">
            ✓
          </span>
          <div className="text-xs space-y-1">
            <span className="font-extrabold text-heading block">
              Zero Third-Party Data Selling Guarantee
            </span>
            <p className="text-muted leading-relaxed">
              We do not sell, rent, monetize, or trade your personal data, phone number, location, or purchase history to third-party advertisers, data brokers, or marketing networks. Ever.
            </p>
          </div>
        </div>

        {/* Section 1: Data We Collect & Purpose Limitation */}
        <section className="rounded-[18px] border border-border bg-card p-4 shadow-2xs space-y-2.5 text-xs leading-relaxed">
          <h2 className="text-sm font-extrabold text-heading">1. Purpose Limitation &amp; Data Collected</h2>
          <p className="text-muted">
            In accordance with the DPDP Act 2023, we collect only the minimum personal data strictly necessary to provide our hyperlocal services:
          </p>
          <ul className="list-disc pl-4 space-y-1 text-muted">
            <li>
              <strong className="text-text">Identity &amp; Contact:</strong> Mobile number, optional name, and email for OTP authentication and SMS/WhatsApp order updates.
            </li>
            <li>
              <strong className="text-text">Delivery Coordinates:</strong> Delivery address, landmark, and Pune pincode to route orders to local shops and dispatch delivery riders.
            </li>
            <li>
              <strong className="text-text">Transactional Records:</strong> Order line items, payment status, GST invoices, and credit notes required for accounting compliance.
            </li>
          </ul>
        </section>

        {/* Section 2: Data Principal Rights */}
        <section className="rounded-[18px] border border-border bg-card p-4 shadow-2xs space-y-2.5 text-xs leading-relaxed">
          <h2 className="text-sm font-extrabold text-heading">2. Your Rights as a Data Principal</h2>
          <p className="text-muted">
            Under Chapter III of the DPDP Act 2023, you enjoy statutory rights regarding your personal data:
          </p>
          <div className="space-y-2 pt-1">
            <div className="rounded-[12px] bg-chip p-2.5 space-y-0.5">
              <strong className="text-heading block">Right to Access Information:</strong>
              <span className="text-muted">
                You may request a summary of personal data being processed and the identities of data processors (such as delivery partners or payment gateway).
              </span>
            </div>
            <div className="rounded-[12px] bg-chip p-2.5 space-y-0.5">
              <strong className="text-heading block">Right to Correction &amp; Erasure:</strong>
              <span className="text-muted">
                You may request updating inaccurate addresses or erasure of your customer profile, subject to statutory tax retention periods.
              </span>
            </div>
            <div className="rounded-[12px] bg-chip p-2.5 space-y-0.5">
              <strong className="text-heading block">Right of Grievance Redressal:</strong>
              <span className="text-muted">
                You have the right to readily accessible grievance redressal provided by our Data Protection &amp; Grievance Officer.
              </span>
            </div>
            <div className="rounded-[12px] bg-chip p-2.5 space-y-0.5">
              <strong className="text-heading block">Right to Nominate:</strong>
              <span className="text-muted">
                You have the right to nominate an individual to exercise your rights in event of incapacity.
              </span>
            </div>
          </div>
        </section>

        {/* Section 3: Data Security & Technical Measures */}
        <section className="rounded-[18px] border border-border bg-card p-4 shadow-2xs space-y-2 text-xs leading-relaxed">
          <h2 className="text-sm font-extrabold text-heading">3. Security Hardening &amp; Storage</h2>
          <p className="text-muted">
            All user data is stored securely in encrypted databases hosted within India. We enforce:
          </p>
          <ul className="list-disc pl-4 space-y-1 text-muted">
            <li>Strict Transport Security (HSTS) and modern TLS 1.3 encryption.</li>
            <li>Content Security Policy (CSP) and cross-origin resource isolation.</li>
            <li>Rate limiting on authentication, checkout, and search endpoints.</li>
            <li>Encrypted session tokens using `HttpOnly`, `SameSite=Strict` cookies.</li>
            <li>Role-based access controls isolating customer data from administrative panels.</li>
          </ul>
        </section>

        {/* Section 4: Grievance Officer & Redressal */}
        <section className="rounded-[18px] border border-border bg-card p-4 shadow-2xs space-y-2 text-xs leading-relaxed">
          <h2 className="text-sm font-extrabold text-heading">4. Data Protection &amp; Grievance Officer</h2>
          <p className="text-muted">
            If you have questions, exercise of rights under DPDP Act 2023, or grievances regarding personal data handling, contact our designated officer:
          </p>
          <div className="rounded-[14px] border border-border bg-chip p-3 space-y-1 text-[11px]">
            <div><strong>Officer:</strong> Rohit Deshmukh (Senior Grievance Officer)</div>
            <div><strong>Email:</strong> <a href="mailto:grievance@plukit.in" className="text-primary underline">grievance@plukit.in</a></div>
            <div><strong>Phone / WhatsApp:</strong> +91 98220 12345</div>
            <div><strong>Address:</strong> Level 4, Tech Park Pune, Shivaji Nagar, Pune 411005, India</div>
            <div className="text-muted pt-1">
              Statutory acknowledgement within 24 hours; resolution within 7 working days.
            </div>
          </div>
        </section>

        <Footer />
      </main>

      <BottomNav />
    </div>
  );
}
