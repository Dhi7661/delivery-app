'use client';

import React from 'react';
import Header from '@/components/ui/Header';
import Footer from '@/components/ui/Footer';
import BottomNav from '@/components/ui/BottomNav';
import { BRAND_NAME } from '@/lib/brand';

export default function TermsPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-text antialiased pb-24">
      <Header title="Terms & Conditions" showBack />

      <main className="mx-auto w-full max-w-md flex-1 px-4 py-4 space-y-4">
        {/* Header summary card */}
        <div className="rounded-[20px] border border-border bg-card p-4 shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-primary">
              Legal Agreement
            </span>
            <span className="rounded-full bg-chip px-2.5 py-0.5 text-[10px] font-bold text-muted">
              Updated Oct 2026
            </span>
          </div>
          <h1 className="text-xl font-extrabold text-heading">Terms &amp; Conditions</h1>
          <p className="text-xs text-muted leading-relaxed">
            Please read these Terms and Conditions carefully before using the {BRAND_NAME} platform,
            mobile application, and doorstep grocery delivery services.
          </p>
        </div>

        {/* Section 1: Introduction */}
        <section className="rounded-[18px] border border-border bg-card p-4 shadow-2xs space-y-2 text-xs leading-relaxed">
          <h2 className="text-sm font-extrabold text-heading">1. Introduction &amp; Acceptance</h2>
          <p className="text-muted">
            These Terms &amp; Conditions govern your use of the {BRAND_NAME} platform, operated by{' '}
            <strong className="text-text">PlukIt Technologies Private Limited</strong> (&ldquo;Company&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;). By accessing our application, registering an account, or placing an order, you agree to be bound by these Terms and our Privacy Policy.
          </p>
        </section>

        {/* Section 2: Services & Hyperlocal Scope */}
        <section className="rounded-[18px] border border-border bg-card p-4 shadow-2xs space-y-2 text-xs leading-relaxed">
          <h2 className="text-sm font-extrabold text-heading">2. Services &amp; Hyperlocal Scope</h2>
          <p className="text-muted">
            {BRAND_NAME} provides an on-demand hyperlocal delivery service connecting local partner shops, farm hubs, and customers across designated serviceable pincodes in Pune, Maharashtra. Delivery timelines (target 20-30 minutes) are estimates subject to traffic, weather, and peak order volumes.
          </p>
        </section>

        {/* Section 3: Customer Account & Phone Verification */}
        <section className="rounded-[18px] border border-border bg-card p-4 shadow-2xs space-y-2 text-xs leading-relaxed">
          <h2 className="text-sm font-extrabold text-heading">3. Accounts &amp; Authentication</h2>
          <p className="text-muted">
            You must provide a valid Indian mobile number to register or place orders. Authentication is conducted via One-Time Password (OTP) verification. You are responsible for safeguarding your device and session. Guest checkouts are supported, subject to phone verification upon order tracking and cancellation.
          </p>
        </section>

        {/* Section 4: Authority Pricing & Order Acceptance */}
        <section className="rounded-[18px] border border-border bg-card p-4 shadow-2xs space-y-2 text-xs leading-relaxed">
          <h2 className="text-sm font-extrabold text-heading">4. Authority Pricing &amp; Order Acceptance</h2>
          <p className="text-muted">
            All prices are shown in Indian Rupees (₹) inclusive of applicable GST. Prices are calculated authority-side in our database at the exact moment of order submission; client-cached prices do not bind {BRAND_NAME}. We reserve the right to cancel or adjust orders in the event of demonstrable inventory stockouts or technical pricing glitches.
          </p>
        </section>

        {/* Section 5: Payments */}
        <section className="rounded-[18px] border border-border bg-card p-4 shadow-2xs space-y-2 text-xs leading-relaxed">
          <h2 className="text-sm font-extrabold text-heading">5. Payment Methods &amp; Settlements</h2>
          <p className="text-muted">
            We support online payments (UPI, Cards, NetBanking via licensed payment aggregator Razorpay) and Cash on Delivery (COD up to allowable order limits). Orders paid via UPI require signed webhook confirmation before being dispatched. COD orders require payment in full upon doorstep handover.
          </p>
        </section>

        {/* Section 6: Cancellations & Returns */}
        <section className="rounded-[18px] border border-border bg-card p-4 shadow-2xs space-y-2 text-xs leading-relaxed">
          <h2 className="text-sm font-extrabold text-heading">6. Cancellations &amp; Refunds</h2>
          <p className="text-muted">
            Customers may cancel orders free of charge prior to item packing (status `CONFIRMED` or `SENT_TO_SHOP`). Once packed or dispatched, cancellations must be directed to Customer Support. Refunds for online payments are processed through Razorpay to the original payment source within 5&ndash;7 business days.
          </p>
        </section>

        {/* Section 7: Governing Law & Jurisdiction */}
        <section className="rounded-[18px] border border-border bg-card p-4 shadow-2xs space-y-2 text-xs leading-relaxed">
          <h2 className="text-sm font-extrabold text-heading">7. Governing Law &amp; Jurisdiction</h2>
          <p className="text-muted">
            These Terms are governed by the laws of India. Any disputes, controversies, or claims arising out of or in connection with these Terms or your use of {BRAND_NAME} shall be subject to the exclusive jurisdiction of the competent courts located in <strong className="text-text">Pune, Maharashtra, India</strong>.
          </p>
        </section>

        {/* Section 8: Legal Notices */}
        <section className="rounded-[18px] border border-border bg-card p-4 shadow-2xs space-y-2 text-xs leading-relaxed">
          <h2 className="text-sm font-extrabold text-heading">8. Legal Notices &amp; Grievances</h2>
          <p className="text-muted">
            Formal legal notices and statutory grievances should be addressed to our designated Grievance Officer:
          </p>
          <div className="rounded-[12px] bg-chip p-2.5 font-medium text-heading space-y-0.5 text-[11px]">
            <div><strong>Grievance Officer:</strong> Rohit Deshmukh</div>
            <div><strong>Email:</strong> legal@plukit.in &bull; grievance@plukit.in</div>
            <div><strong>Address:</strong> Level 4, Tech Park Pune, Shivaji Nagar, Pune 411005</div>
          </div>
        </section>

        <Footer />
      </main>

      <BottomNav />
    </div>
  );
}
