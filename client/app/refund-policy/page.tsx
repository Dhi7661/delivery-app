'use client';

import React from 'react';
import Header from '@/components/ui/Header';
import Footer from '@/components/ui/Footer';
import BottomNav from '@/components/ui/BottomNav';
import { BRAND_NAME } from '@/lib/brand';

export default function RefundPolicyPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-text antialiased pb-24">
      <Header title="Refund & Cancellation" showBack />

      <main className="mx-auto w-full max-w-md flex-1 px-4 py-4 space-y-4">
        {/* Policy Summary Banner */}
        <div className="rounded-[20px] border border-border bg-card p-4 shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-primary">
              Customer Guarantee
            </span>
            <span className="rounded-full bg-chip px-2.5 py-0.5 text-[10px] font-bold text-muted">
              Updated Oct 2026
            </span>
          </div>
          <h1 className="text-xl font-extrabold text-heading">Refund &amp; Cancellation Policy</h1>
          <p className="text-xs text-muted leading-relaxed">
            At {BRAND_NAME}, we prioritize farm-fresh quality. If your order doesn&apos;t meet expectations or your plans change, our transparent cancellation and refund policy protects your purchase.
          </p>
        </div>

        {/* Section 1: Cancellation Rules */}
        <section className="rounded-[18px] border border-border bg-card p-4 shadow-2xs space-y-2.5 text-xs leading-relaxed">
          <h2 className="text-sm font-extrabold text-heading">1. Order Cancellation Windows</h2>
          <div className="space-y-2">
            <div className="rounded-[12px] bg-chip p-2.5 border-l-4 border-primary">
              <strong className="text-heading block">Before Packing (Instant &amp; Free):</strong>
              <span className="text-muted">
                You can cancel your order directly from the order tracking screen without penalty while the order status is <code className="text-primary font-bold">CONFIRMED</code> or <code className="text-primary font-bold">SENT_TO_SHOP</code>.
              </span>
            </div>
            <div className="rounded-[12px] bg-chip p-2.5 border-l-4 border-muted">
              <strong className="text-heading block">After Packing or Dispatch:</strong>
              <span className="text-muted">
                Once items are packed (<code className="font-bold">PACKED</code>) or out with the delivery partner (<code className="font-bold">OUT_FOR_DELIVERY</code>), orders cannot be cancelled self-serve. Please contact customer support for emergency address corrections.
              </span>
            </div>
          </div>
        </section>

        {/* Section 2: Refund Processing & Gateway Timelines */}
        <section className="rounded-[18px] border border-border bg-card p-4 shadow-2xs space-y-2.5 text-xs leading-relaxed">
          <h2 className="text-sm font-extrabold text-heading">2. Refund Processing Timelines</h2>
          <p className="text-muted">
            Refunds are calculated and initiated automatically upon cancellation:
          </p>
          <div className="space-y-2">
            <div className="rounded-[12px] bg-chip p-2.5">
              <strong className="text-heading block">UPI &amp; Online Payments:</strong>
              <span className="text-muted">
                Refunds are routed through our authorized payment gateway (Razorpay) back to your original source account (UPI ID or bank account) within <strong className="text-text">5 to 7 business days</strong>.
              </span>
            </div>
            <div className="rounded-[12px] bg-chip p-2.5">
              <strong className="text-heading block">Cash on Delivery (COD):</strong>
              <span className="text-muted">
                No financial refund is required. The order total is zeroed out and no payment is collected at doorstep.
              </span>
            </div>
          </div>
        </section>

        {/* Section 3: Returns for Fresh Produce & Groceries */}
        <section className="rounded-[18px] border border-border bg-card p-4 shadow-2xs space-y-2.5 text-xs leading-relaxed">
          <h2 className="text-sm font-extrabold text-heading">3. Returns &amp; Replacement Criteria</h2>
          <p className="text-muted">
            We encourage doorstep verification upon delivery. You may initiate a return or replacement for the following qualifying reasons:
          </p>
          <ul className="list-disc pl-4 space-y-1 text-muted">
            <li><strong className="text-text">Damaged Goods:</strong> Items bruised, crushed, or compromised during transit.</li>
            <li><strong className="text-text">Expired Items:</strong> Packaged goods received beyond stated best-before date.</li>
            <li><strong className="text-text">Incorrect Item:</strong> Product delivered does not match your ordered SKU or quantity.</li>
            <li><strong className="text-text">Spoiled Quality:</strong> Produce showing defects not conforming to PlukIt fresh standards.</li>
          </ul>
          <p className="text-muted pt-1">
            Upon return approval by our support or shop partner, a statutory GST Credit Note is issued against your original tax invoice, and credit is applied.
          </p>
        </section>

        {/* Section 4: Assistance */}
        <section className="rounded-[18px] border border-border bg-card p-4 shadow-2xs space-y-2 text-xs leading-relaxed">
          <h2 className="text-sm font-extrabold text-heading">4. Need Help with a Cancellation or Return?</h2>
          <p className="text-muted">
            Reach out directly with your Order Number (e.g., <code className="text-primary font-bold">PLK-20261030-XXXX</code>):
          </p>
          <div className="rounded-[12px] bg-chip p-3 font-medium text-heading space-y-1 text-[11px]">
            <div><strong>WhatsApp / Call:</strong> +91 98220 12345</div>
            <div><strong>Email:</strong> support@plukit.in &bull; grievance@plukit.in</div>
            <div><strong>Hours:</strong> 6:00 AM &ndash; 10:00 PM (All 7 Days)</div>
          </div>
        </section>

        <Footer />
      </main>

      <BottomNav />
    </div>
  );
}
