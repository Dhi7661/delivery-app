'use client';

import { Suspense, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Header from '@/components/Header';
import BottomNav from '@/components/BottomNav';
import CartBar from '@/components/CartBar';
import ProductCard from '@/components/ProductCard';
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
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900 antialiased pb-32">
      <Header showBack title={category?.name || 'Category'} />

      <main className="mx-auto w-full max-w-md flex-1 px-3 py-4">
        {loading ? (
          <div className="flex min-h-[300px] flex-col items-center justify-center text-slate-400">
            <div className="h-8 w-8 animate-spin rounded-full border-3 border-emerald-600 border-t-transparent" />
            <span className="mt-3 text-sm font-medium">Loading products...</span>
          </div>
        ) : error ? (
          <div className="flex min-h-[300px] flex-col items-center justify-center text-center px-4">
            <span className="text-4xl">⚠️</span>
            <p className="mt-2 text-base font-bold text-slate-700">{error}</p>
          </div>
        ) : products.length === 0 ? (
          <div className="flex min-h-[300px] flex-col items-center justify-center text-center px-4">
            <span className="text-4xl">🛒</span>
            <h2 className="mt-3 text-base font-bold text-slate-800">
              No products found
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              There are no products in this category right now. Please check back soon!
            </p>
          </div>
        ) : (
          <div>
            <div className="mb-3 flex items-center justify-between px-1">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                {products.length} {products.length === 1 ? 'item' : 'items'}
              </span>
            </div>

            {/* 2 product cards per row layout */}
            <div className="grid grid-cols-2 gap-2.5">
              {products.map((prod) => (
                <ProductCard key={prod.id} product={prod} />
              ))}
            </div>

            {/* Load More Button */}
            {nextCursor && (
              <div className="mt-6 flex justify-center pb-4">
                <button
                  type="button"
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="flex min-h-[44px] w-full items-center justify-center rounded-xl border border-slate-300 bg-white font-bold text-sm text-slate-700 shadow-2xs hover:bg-slate-50 active:bg-slate-100 disabled:opacity-50"
                >
                  {loadingMore ? 'Loading more...' : 'Load more products'}
                </button>
              </div>
            )}
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
        <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900 antialiased pb-20">
          <Header showBack title="Category" />
          <div className="flex min-h-[300px] flex-col items-center justify-center text-slate-400">
            <div className="h-8 w-8 animate-spin rounded-full border-3 border-emerald-600 border-t-transparent" />
            <span className="mt-3 text-sm font-medium">Loading...</span>
          </div>
          <BottomNav />
        </div>
      }
    >
      <CategoryContent />
    </Suspense>
  );
}
