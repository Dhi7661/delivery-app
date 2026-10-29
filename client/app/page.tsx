'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import Header from '@/components/ui/Header';
import BottomNav from '@/components/ui/BottomNav';
import CartBar from '@/components/ui/CartBar';
import CategoryTile from '@/components/ui/CategoryTile';
import ProductCard from '@/components/ui/ProductCard';
import SectionHeading from '@/components/ui/SectionHeading';
import { API_BASE_URL, Category, ProductSummary } from '@/lib/api';

export default function Home() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        // 1. Fetch categories
        const catRes = await fetch(`${API_BASE_URL}/categories`);
        if (catRes.ok) {
          const catData = await catRes.json();
          const fetchedCategories: Category[] = catData.categories || [];
          setCategories(fetchedCategories);

          // 2. Fetch popular products from first category or multiple categories
          if (fetchedCategories.length > 0) {
            const prodRes = await fetch(
              `${API_BASE_URL}/categories/${fetchedCategories[0].id}/products?limit=6`
            );
            if (prodRes.ok) {
              const prodData = await prodRes.json();
              setProducts(prodData.products || []);
            }
          }
        }
      } catch (err) {
        console.error('Failed to fetch home data:', err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-background text-text antialiased pb-24">
      {/* Header with store icon, location chip, and 20-25 mins delivery ETA chip */}
      <Header />

      {/* Search Input Bar with mic icon matching home.png */}
      <div className="w-full bg-background px-4 pt-3 pb-1">
        <div className="mx-auto max-w-md">
          <Link
            href="/search"
            className="flex h-[48px] w-full items-center justify-between rounded-[14px] border border-border bg-card px-3.5 text-sm text-muted shadow-2xs hover:border-primary/40 transition-colors"
          >
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <svg
                className="h-4 w-4 text-muted shrink-0"
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
              <span className="truncate">Search vegetables, atta, milk, spices...</span>
            </div>

            <svg
              className="h-4 w-4 text-muted shrink-0 ml-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
              />
            </svg>
          </Link>
        </div>
      </div>

      {/* Main Content */}
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-3 space-y-5">
        {/* Fresh Morning Batch Announcement matching home.png */}
        <Link
          href="/search"
          className="flex items-center justify-between rounded-[16px] border border-border bg-card p-3 shadow-2xs hover:bg-surface transition-colors"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-chip text-primary">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
                />
              </svg>
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-heading">Fresh Morning Batch</h2>
              <p className="text-xs text-muted truncate">
                Sourced directly from Saswad &amp; Junnar farms today
              </p>
            </div>
          </div>
          <svg
            className="h-5 w-5 text-muted shrink-0 ml-2"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2.5}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </Link>
        {/* Categories Section: 3 columns, 12px gap, ImagePlaceholder, No emoji */}
        <section aria-labelledby="categories-heading">
          <SectionHeading
            title="Categories"
            actionLabel="View All"
            actionHref="/search"
            className="mb-3"
          />

          {loading && categories.length === 0 ? (
            <div className="grid grid-cols-3 gap-3">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <div
                  key={n}
                  className="h-28 rounded-[16px] border border-border/50 bg-card/60 animate-pulse"
                />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3 min-w-0">
              {categories.map((cat) => (
                <CategoryTile key={cat.id} id={cat.id} name={cat.name} />
              ))}
            </div>
          )}
        </section>

        {/* Popular Products Section: 2 columns, 12px gap, ProductCard with ImagePlaceholder & Add button */}
        <section aria-labelledby="popular-heading">
          <div className="mb-3">
            <h2
              id="popular-heading"
              className="text-base font-black tracking-tight text-heading sm:text-lg"
            >
              Popular in Kothrud
            </h2>
            <p className="mt-0.5 text-xs font-semibold text-muted">
              Top pantry staples ordered near Paud Road &amp; Dahanukar
            </p>
          </div>

          {loading && products.length === 0 ? (
            <div className="grid grid-cols-2 gap-3">
              {[1, 2, 3, 4].map((n) => (
                <div
                  key={n}
                  className="h-64 rounded-[16px] border border-border/50 bg-card/60 animate-pulse"
                />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 min-w-0">
              {products.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}
        </section>
      </main>

      {/* Sticky Cart Summary Bar above Bottom Navigation */}
      <CartBar />

      {/* Bottom Navigation */}
      <BottomNav />
    </div>
  );
}
