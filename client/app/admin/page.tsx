"use client";

import { useState } from "react";
import Link from "next/link";
import { BRAND_NAME, DELIVERY_ETA_TEXT } from "@/lib/brand";

export default function AdminDashboardPage() {
  const [lastRefreshed, setLastRefreshed] = useState<string>(
    new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
  );
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = () => {
    setRefreshing(true);
    setTimeout(() => {
      setLastRefreshed(
        new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
      );
      setRefreshing(false);
    }, 400);
  };

  // Section 4 Dashboard Cards: initial pilot readiness state
  const dashboardCards = [
    {
      title: "Today's Orders",
      value: "0",
      subtext: "₹0 total gross value today",
      href: "/admin/orders?filter=today",
      badge: "Today",
      badgeColor: "bg-blue-50 text-blue-700 border-blue-200",
      icon: (
        <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
        </svg>
      ),
    },
    {
      title: "Needs Action",
      value: "0",
      subtext: "Awaiting COD check, shop packing, or reply",
      href: "/admin/orders?filter=needs_action",
      badge: "Action Required",
      badgeColor: "bg-amber-50 text-amber-700 border-amber-200",
      icon: (
        <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      ),
    },
    {
      title: "Out for Delivery",
      value: "0",
      subtext: "With active delivery partners right now",
      href: "/admin/orders?filter=out_for_delivery",
      badge: "Live",
      badgeColor: "bg-emerald-50 text-emerald-700 border-emerald-200",
      icon: (
        <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      ),
    },
    {
      title: "Failed Deliveries",
      value: "0",
      subtext: "No issues reported today",
      href: "/admin/orders?filter=failed",
      badge: "Zero",
      badgeColor: "bg-gray-50 text-gray-700 border-gray-200",
      icon: (
        <svg className="w-5 h-5 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      title: "Cash with Partners",
      value: "₹0",
      subtext: "All COD collected handed over",
      href: "/admin/partners",
      badge: "Reconciled",
      badgeColor: "bg-emerald-50 text-emerald-700 border-emerald-200",
      icon: (
        <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
    },
    {
      title: "Shop Payouts Due",
      value: "₹0",
      subtext: "0 partner shops due in next 3 days",
      href: "/admin/payouts",
      badge: "Up to date",
      badgeColor: "bg-purple-50 text-purple-700 border-purple-200",
      icon: (
        <svg className="w-5 h-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      ),
    },
    {
      title: "Margin Today",
      value: "₹0",
      subtext: "Selling price minus buy price (delivered)",
      href: "/admin/reports?tab=margin",
      badge: "Gross Profit",
      badgeColor: "bg-emerald-50 text-emerald-700 border-emerald-200",
      icon: (
        <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
        </svg>
      ),
    },
    {
      title: "Warnings",
      value: "0",
      subtext: "All items within margin floor & in-stock",
      href: "/admin/products?warning=active",
      badge: "Normal",
      badgeColor: "bg-emerald-50 text-emerald-700 border-emerald-200",
      icon: (
        <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      title: "Serviceable Area",
      value: "411001",
      subtext: `Camp & surroundings • ${DELIVERY_ETA_TEXT}`,
      href: "/admin/settings?tab=pincodes",
      badge: "Active",
      badgeColor: "bg-blue-50 text-blue-700 border-blue-200",
      icon: (
        <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-gray-200">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-heading tracking-tight">
            Operations Dashboard
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
            Real-time delivery status, orders, margins &amp; rider oversight
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400 hidden sm:inline">
            Updated at {lastRefreshed}
          </span>

          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 hover:border-gray-300 shadow-xs transition-colors min-h-[44px]"
          >
            <svg
              className={`w-4 h-4 text-gray-500 ${refreshing ? "animate-spin text-emerald-600" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {/* Pilot Readiness Alert Banner */}
      <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200 flex items-start gap-3.5">
        <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0 text-sm font-bold shadow-xs">
          ✓
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-bold text-emerald-900 leading-snug">
            Admin Foundation Active (Phase B)
          </h2>
          <p className="text-xs text-emerald-700 mt-0.5">
            Two-factor login and secure 12-hour session management are engaged. Next: Phase C (Product Catalog) &amp; Phase D (Orders Board).
          </p>
        </div>
      </div>

      {/* Grid of 9 Cards (Section 4) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {dashboardCards.map((card) => (
          <Link
            key={card.title}
            href={card.href}
            className="group block p-5 rounded-2xl bg-white border border-gray-200 hover:border-emerald-300 hover:shadow-md transition-all relative overflow-hidden"
          >
            <div className="flex items-start justify-between">
              <div className="w-10 h-10 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center group-hover:scale-105 transition-transform">
                {card.icon}
              </div>
              <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${card.badgeColor}`}>
                {card.badge}
              </span>
            </div>

            <div className="mt-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                {card.title}
              </p>
              <p className="text-2xl font-black text-heading mt-1 group-hover:text-emerald-700 transition-colors">
                {card.value}
              </p>
              <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                {card.subtext}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

