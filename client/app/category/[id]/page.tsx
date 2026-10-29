'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Header from '@/components/ui/Header';
import BottomNav from '@/components/ui/BottomNav';
import CartBar from '@/components/ui/CartBar';
import ProductCard from '@/components/ui/ProductCard';
import Button from '@/components/ui/Button';
import { API_BASE_URL, ProductSummary } from '@/lib/api';

interface CategoryData {
  id: string;
  name: string;
}

function CategoryContent() {
  const params = useParams();
  const categoryId = params?.id as string;

  const [category, setCategory] = useState<CategoryData | null>(null);
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!categoryId) return;

    async function fetchCategoryProducts() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(
          `${API_BASE_URL}/categories/${categoryId}/products?limit=20`
        );
        if (!res.ok) {
          if (res.status === 404) {
            setError('Category not found.');
          } else {
            setError('Failed to load products.');
          }
          return;
        }
        const data = await res.json();
        setCategory(data.category);
        setProducts(data.products || []);
        setNextCursor(data.nextCursor || null);
      } catch (err) {
        console.error(err);
        setError('Network error. Please try again.');
      } finally {
        setLoading(false);
      }
    }

    fetchCategoryProducts();
  }, [categoryId]);

  async function handleLoadMore() {
    if (!nextCursor || loadingMore || !categoryId) return;
    try {
      setLoadingMore(true);
      const res = await fetch(
        `${API_BASE_URL}/categories/${categoryId}/products?limit=20&cursor=${nextCursor}`
      );
      if (!res.ok) throw new Error('Failed to load more products');
      const data = await res.json();
      setProducts((prev) => [...prev, ...data.products]);
      setNextCursor(data.nextCursor || null);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background text-text antialiased pb-28">
      {/* Top Header matching category.png with 2-row layout */}
      <Header
        variant="category"
        title={category?.name || 'Fresh Vegetables'}
      />

      <main className="mx-auto w-full max-w-md flex-1 px-4 py-3 space-y-4">
        {loading ? (
          <div className="flex min-h-[300px] flex-col items-center justify-center text-muted">
            <div className="h-8 w-8 animate-spin rounded-full border-3 border-primary border-t-transparent" />
            <span className="mt-3 text-sm font-semibold">Loading essentials...</span>
          </div>
        ) : error ? (
          <div className="flex min-h-[300px] flex-col items-center justify-center text-center px-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-chip text-primary">
              <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <p className="mt-4 text-base font-bold text-heading">{error}</p>
          </div>
        ) : products.length === 0 ? (
          <div className="flex min-h-[300px] flex-col items-center justify-center text-center px-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-chip text-primary">
              <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
            </div>
            <h2 className="mt-4 text-base font-extrabold text-heading">
              No products found
            </h2>
            <p className="mt-1 text-xs font-medium text-muted">
              There are no products in this category right now. Please check back soon!
            </p>
          </div>
        ) : (
          <div>
            {/* Filter Pills row matching category.png */}
            <div className="mb-3.5 flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
              <button
                type="button"
                className="flex min-h-[34px] shrink-0 items-center rounded-full bg-primary px-4 py-1 text-xs font-bold text-card"
              >
                All ({products.length})
              </button>
              <button
                type="button"
                className="flex min-h-[34px] shrink-0 items-center rounded-full border border-border bg-card px-3.5 py-1 text-xs font-semibold text-muted hover:bg-surface"
              >
                Leafy Greens
              </button>
              <button
                type="button"
                className="flex min-h-[34px] shrink-0 items-center rounded-full border border-border bg-card px-3.5 py-1 text-xs font-semibold text-muted hover:bg-surface"
              >
                Root Veggies
              </button>
              <button
                type="button"
                className="flex min-h-[34px] shrink-0 items-center rounded-full border border-border bg-card px-3.5 py-1 text-xs font-semibold text-muted hover:bg-surface"
              >
                Local Gourds
              </button>
            </div>

            {/* Daily stock info banner */}
            <div className="mb-4 flex items-center justify-between rounded-[14px] border border-border bg-card px-3.5 py-2.5 text-xs shadow-2xs">
              <div className="flex items-center gap-2 text-heading font-bold min-w-0">
                <svg className="h-4 w-4 text-primary shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
                <span className="truncate">Fresh daily essentials from local partner stores</span>
              </div>
              <span className="text-[11px] font-bold text-muted shrink-0 ml-2">Daily Batch</span>
            </div>

            {/* 2 product cards per row layout */}
            <div className="grid grid-cols-2 gap-3 min-w-0">
              {products.map((prod) => (
                <ProductCard key={prod.id} product={prod} />
              ))}
            </div>

            {/* Load More Button */}
            {nextCursor && (
              <div className="mt-6 flex justify-center pb-2">
                <Button
                  variant="outline"
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  fullWidth
                >
                  {loadingMore ? 'Loading more...' : 'Load more products'}
                </Button>
              </div>
            )}

            {/* Custom note callout matching category.png */}
            <div className="mt-6 rounded-[14px] border border-border bg-surface p-3.5 text-center text-xs text-muted shadow-2xs">
              Need custom chopping or specific tenderness? Add note during checkout for our delivery partner.
            </div>
          </div>
        )}
      </main>

      <CartBar />
      <BottomNav />
    </div>
  );
}

export default function CategoryPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen flex-col bg-background text-text antialiased pb-28">
          <Header showBack title="Category" />
          <div className="flex min-h-[300px] flex-col items-center justify-center text-muted">
            <div className="h-8 w-8 animate-spin rounded-full border-3 border-primary border-t-transparent" />
            <span className="mt-3 text-sm font-semibold">Loading...</span>
          </div>
          <BottomNav />
        </div>
      }
    >
      <CategoryContent />
    </Suspense>
  );
}
