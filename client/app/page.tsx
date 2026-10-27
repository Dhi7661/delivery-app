'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Header from '@/components/Header';
import BottomNav from '@/components/BottomNav';
import { BRAND_TAGLINE } from '@/lib/brand';
import { API_BASE_URL, Category } from '@/lib/api';

const CATEGORY_ICONS: Record<string, string> = {
  Groceries: '🌾',
  Dairy: '🥛',
  Snacks: '🍪',
  Beverages: '🥤',
  'Personal Care': '🧼',
};

export default function Home() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadCategories() {
      try {
        const res = await fetch(`${API_BASE_URL}/categories`);
        if (res.ok) {
          const data = await res.json();
          setCategories(data.categories || []);
        }
      } catch (err) {
        console.error('Failed to fetch categories:', err);
      } finally {
        setLoading(false);
      }
    }

    loadCategories();
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900 antialiased pb-20">
      <Header />

      {/* Search Input Bar (leads to /search) */}
      <div className="w-full bg-white px-3 pb-3 border-b border-slate-100">
        <div className="mx-auto max-w-md">
          <Link
            href="/search"
            className="flex min-h-[44px] w-full items-center rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-sm text-slate-400 shadow-2xs hover:border-emerald-300"
          >
            <svg
              className="mr-2.5 h-4 w-4 text-slate-400 shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <span>Search groceries, milk, snacks...</span>
          </Link>
        </div>
      </div>

      {/* Main Content */}
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-4">
        {/* Hero Banner */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-700 p-5 text-white shadow-sm">
          <span className="inline-block rounded-md bg-emerald-500/30 px-2 py-0.5 text-xs font-semibold text-emerald-100">
            Local Partners
          </span>
          <h1 className="mt-2 text-lg font-bold leading-tight">
            {BRAND_TAGLINE}
          </h1>
          <p className="mt-1 text-xs text-emerald-100">
            Real prices directly from local neighbourhood shops. Customer price is never above printed MRP.
          </p>
        </div>

        {/* Categories Grid */}
        <section className="mt-6" aria-labelledby="categories-heading">
          <div className="flex items-center justify-between">
            <h2
              id="categories-heading"
              className="text-base font-bold text-slate-900"
            >
              Browse Categories
            </h2>
            <span className="text-xs font-medium text-emerald-700">
              {categories.length} categories
            </span>
          </div>

          {loading ? (
            <div className="mt-4 flex min-h-[140px] items-center justify-center text-slate-400">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
            </div>
          ) : (
            <div className="mt-3 grid grid-cols-2 gap-2.5 min-w-0">
              {categories.map((cat) => (
                <Link
                  key={cat.id}
                  href={`/category/${cat.id}`}
                  className="group flex min-h-[64px] min-w-0 items-center gap-2 rounded-2xl border border-slate-200 bg-white p-2.5 shadow-2xs transition-all hover:border-emerald-400 hover:shadow-xs active:scale-98"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-xl transition-transform group-hover:scale-110">
                    {CATEGORY_ICONS[cat.name] || '🛒'}
                  </span>
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-xs font-bold text-slate-800 group-hover:text-emerald-700 truncate">
                      {cat.name}
                    </span>
                    <span className="text-[10px] font-medium text-slate-400 truncate">
                      Explore &rarr;
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* Bottom Navigation */}
      <BottomNav />
    </div>
  );
}
