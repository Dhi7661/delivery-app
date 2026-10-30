'use client';

import React, { useState } from 'react';
import Header from '@/components/ui/Header';
import Footer from '@/components/ui/Footer';
import BottomNav from '@/components/ui/BottomNav';
import Button from '@/components/ui/Button';
import { BRAND_NAME } from '@/lib/brand';

export default function ContactPage() {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [category, setCategory] = useState('ORDER');
  const [message, setMessage] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone || !message) return;
    setSubmitted(true);
  };

  return (
    <div className="flex min-h-screen flex-col bg-background text-text antialiased pb-24">
      <Header title="Contact & Grievances" showBack />

      <main className="mx-auto w-full max-w-md flex-1 px-4 py-4 space-y-4">
        {/* Header Hero */}
        <div className="rounded-[20px] border border-border bg-card p-4 shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-primary">
              We&apos;re Here to Help
            </span>
            <span className="rounded-full bg-chip px-2.5 py-0.5 text-[10px] font-bold text-muted">
              Pune HQ
            </span>
          </div>
          <h1 className="text-xl font-extrabold text-heading">Contact &amp; Grievances</h1>
          <p className="text-xs text-muted leading-relaxed">
            Have a question about an active order, item return, or personal data request under DPDP Act 2023? Reach out to our dedicated support and grievance desk.
          </p>
        </div>

        {/* Statutory Grievance Redressal Card */}
        <div className="rounded-[18px] border-2 border-primary/40 bg-card p-4 shadow-2xs space-y-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-card font-black text-xs">
              §
            </span>
            <div>
              <h2 className="text-sm font-extrabold text-heading">Designated Grievance Officer</h2>
              <span className="text-[10px] font-bold uppercase tracking-wider text-primary block">
                Statutory Redressal &bull; DPDP Act 2023
              </span>
            </div>
          </div>

          <p className="text-xs text-muted leading-relaxed">
            In compliance with the Digital Personal Data Protection Act, 2023 and Consumer Protection (E-Commerce) Rules, 2020:
          </p>

          <div className="rounded-[14px] bg-chip p-3.5 space-y-2 text-xs">
            <div className="flex items-center justify-between border-b border-border/50 pb-1.5">
              <span className="text-muted font-medium">Name:</span>
              <span className="font-extrabold text-heading">Rohit Deshmukh</span>
            </div>
            <div className="flex items-center justify-between border-b border-border/50 pb-1.5">
              <span className="text-muted font-medium">Designation:</span>
              <span className="font-semibold text-heading">Senior Grievance &amp; Compliance Officer</span>
            </div>
            <div className="flex items-center justify-between border-b border-border/50 pb-1.5">
              <span className="text-muted font-medium">Official Email:</span>
              <a href="mailto:grievance@plukit.in" className="font-bold text-primary underline">
                grievance@plukit.in
              </a>
            </div>
            <div className="flex items-center justify-between border-b border-border/50 pb-1.5">
              <span className="text-muted font-medium">WhatsApp / Helpline:</span>
              <a href="tel:+919822012345" className="font-bold text-heading">
                +91 98220 12345
              </a>
            </div>
            <div className="pt-1 text-[11px] text-muted">
              <span className="font-semibold text-heading block">Registered Office:</span>
              PlukIt Technologies Private Limited, Level 4, Tech Park Pune, Shivaji Nagar, Pune 411005, Maharashtra, India.
            </div>
          </div>

          <div className="rounded-[10px] bg-surface p-2.5 text-[11px] text-muted space-y-1 border border-border">
            <div className="font-bold text-heading flex items-center gap-1.5">
              <span>⏱ Response SLA Timeline</span>
            </div>
            <p>
              &bull; Acknowledgement within <strong>24 hours</strong>.<br />
              &bull; Investigation and formal redressal within <strong>7 to 15 business days</strong>.
            </p>
          </div>
        </div>

        {/* Quick Contact Form */}
        <div className="rounded-[18px] border border-border bg-card p-4 shadow-2xs space-y-3">
          <h2 className="text-sm font-extrabold text-heading">Send a Direct Message</h2>
          {submitted ? (
            <div className="rounded-[14px] bg-chip p-4 text-center space-y-2">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-primary text-card font-black text-sm">
                ✓
              </div>
              <h3 className="text-xs font-bold text-heading">Ticket Created Successfully</h3>
              <p className="text-[11px] text-muted">
                Your message has been assigned Ticket ID <strong>#PLK-GRV-{Date.now().toString().slice(-4)}</strong>. Our grievance team will contact +91 {phone} within 24 hours.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSubmitted(false);
                  setMessage('');
                }}
              >
                Send Another Inquiry
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-heading mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="E.g. Sneha Kulkarni"
                  className="w-full rounded-[12px] border border-border bg-card px-3 py-2 text-xs font-medium focus:border-primary focus:outline-hidden min-h-[40px]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-heading mb-1">
                  Mobile Number <span className="text-primary">*</span>
                </label>
                <div className="flex rounded-[12px] border border-border overflow-hidden focus-within:border-primary min-h-[40px]">
                  <span className="flex items-center bg-chip px-3 text-xs font-bold text-muted border-r border-border">
                    +91
                  </span>
                  <input
                    type="tel"
                    required
                    maxLength={10}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    placeholder="10-digit phone number"
                    className="w-full bg-card px-3 py-2 text-xs font-medium focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-heading mb-1">
                  Inquiry Category
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full rounded-[12px] border border-border bg-card px-3 py-2 text-xs font-medium focus:border-primary focus:outline-hidden min-h-[40px]"
                >
                  <option value="ORDER">Order &amp; Delivery Query</option>
                  <option value="REFUND">Refund &amp; Return Assistance</option>
                  <option value="PRIVACY">DPDP Act 2023 / Privacy Rights</option>
                  <option value="GRIEVANCE">Formal Grievance Complaint</option>
                  <option value="PARTNER">Shop / Farm Partner Inquiry</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-heading mb-1">
                  Message / Grievance Details <span className="text-primary">*</span>
                </label>
                <textarea
                  required
                  rows={3}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Describe your issue or order number..."
                  className="w-full rounded-[12px] border border-border bg-card px-3 py-2 text-xs font-medium focus:border-primary focus:outline-hidden"
                />
              </div>

              <Button type="submit" variant="primary" size="md" fullWidth>
                Submit Grievance / Inquiry
              </Button>
            </form>
          )}
        </div>

        <Footer />
      </main>

      <BottomNav />
    </div>
  );
}
