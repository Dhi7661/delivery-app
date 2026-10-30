'use client';

import React from 'react';
import Header from '@/components/ui/Header';
import Footer from '@/components/ui/Footer';
import BottomNav from '@/components/ui/BottomNav';
import { BRAND_NAME, DELIVERY_ETA_TEXT } from '@/lib/brand';

export default function DeliveryPolicyPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-text antialiased pb-24">
      <Header title="Delivery Policy" showBack />

      <main className="mx-auto w-full max-w-md flex-1 px-4 py-4 space-y-4">
        {/* Delivery Hero Banner */}
        <div className="rounded-[20px] border border-border bg-card p-4 shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-primary">
              Hyperlocal Pune
            </span>
            <span className="rounded-full bg-chip px-2.5 py-0.5 text-[10px] font-bold text-muted">
              Updated Oct 2026
            </span>
          </div>
          <h1 className="text-xl font-extrabold text-heading">Delivery Policy</h1>
          <p className="text-xs text-muted leading-relaxed">
            {BRAND_NAME} brings farm-fresh fruits, vegetables, and pantry essentials directly to your doorstep in Pune with our rapid {DELIVERY_ETA_TEXT} delivery service.
          </p>
        </div>

        {/* Section 1: Serviceable Pincodes */}
        <section className="rounded-[18px] border border-border bg-card p-4 shadow-2xs space-y-2.5 text-xs leading-relaxed">
          <h2 className="text-sm font-extrabold text-heading">1. Serviceable Pincodes in Pune</h2>
          <p className="text-muted">
            We currently deliver to the following high-density residential and commercial hubs across Pune:
          </p>
          <div className="grid grid-cols-3 gap-2 pt-1 font-mono text-[11px] font-bold text-heading">
            <span className="rounded-[10px] bg-chip p-2 text-center border border-border">411001 (Camp)</span>
            <span className="rounded-[10px] bg-chip p-2 text-center border border-border">411004 (Deccan)</span>
            <span className="rounded-[10px] bg-chip p-2 text-center border border-border">411007 (Aundh)</span>
            <span className="rounded-[10px] bg-chip p-2 text-center border border-border">411014 (Viman Ngr)</span>
            <span className="rounded-[10px] bg-chip p-2 text-center border border-border">411016 (Model Col)</span>
            <span className="rounded-[10px] bg-chip p-2 text-center border border-border">411028 (Hadapsar)</span>
            <span className="rounded-[10px] bg-chip p-2 text-center border border-border">411038 (Kothrud)</span>
            <span className="rounded-[10px] bg-chip p-2 text-center border border-border">411045 (Baner)</span>
            <span className="rounded-[10px] bg-chip p-2 text-center border border-border">411057 (Wakad)</span>
          </div>
          <p className="text-[11px] text-muted">
            Deliveries to pincodes outside our active grid will be politely rejected at checkout to ensure quality and speed guarantees.
          </p>
        </section>

        {/* Section 2: Delivery Windows & ETA */}
        <section className="rounded-[18px] border border-border bg-card p-4 shadow-2xs space-y-2.5 text-xs leading-relaxed">
          <h2 className="text-sm font-extrabold text-heading">2. Delivery Windows &amp; Hours</h2>
          <div className="space-y-2">
            <div className="rounded-[12px] bg-chip p-2.5">
              <strong className="text-heading block">Rapid Delivery (20-30 Minutes):</strong>
              <span className="text-muted">
                Orders placed between <strong className="text-text">6:00 AM and 10:00 PM</strong> are packed within 5&ndash;10 minutes at the closest neighbourhood shop and dispatched immediately.
              </span>
            </div>
            <div className="rounded-[12px] bg-chip p-2.5">
              <strong className="text-heading block">Weather &amp; Traffic Disruptions:</strong>
              <span className="text-muted">
                During severe monsoon showers, traffic congestion, or regional road closures, delivery times may be extended. Real-time ETA updates will be communicated via SMS/WhatsApp.
              </span>
            </div>
          </div>
        </section>

        {/* Section 3: Delivery Charges */}
        <section className="rounded-[18px] border border-border bg-card p-4 shadow-2xs space-y-2 text-xs leading-relaxed">
          <h2 className="text-sm font-extrabold text-heading">3. Delivery Fees &amp; Thresholds</h2>
          <p className="text-muted">
            Delivery fees are calculated transparently and displayed before you confirm checkout:
          </p>
          <ul className="list-disc pl-4 space-y-1 text-muted">
            <li><strong className="text-text">Orders above ₹499:</strong> Free Delivery across all active pincodes.</li>
            <li><strong className="text-text">Standard Orders:</strong> Nominal fee of ₹25 &ndash; ₹35 based on distance and weather conditions.</li>
            <li>No hidden platform charges or surge fees.</li>
          </ul>
        </section>

        {/* Section 4: Handover & Contactless Delivery */}
        <section className="rounded-[18px] border border-border bg-card p-4 shadow-2xs space-y-2 text-xs leading-relaxed">
          <h2 className="text-sm font-extrabold text-heading">4. Doorstep Handover &amp; Security</h2>
          <p className="text-muted">
            Our riders adhere to verified safety protocols:
          </p>
          <ul className="list-disc pl-4 space-y-1 text-muted">
            <li>Contactless delivery available upon request (leave at door or security gate).</li>
            <li>Fresh produce is transported in insulated crates to protect delicate items.</li>
            <li>Cash on Delivery requires exact change or instant QR code scan at doorstep.</li>
          </ul>
        </section>

        <Footer />
      </main>

      <BottomNav />
    </div>
  );
}
