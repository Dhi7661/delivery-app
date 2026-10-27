'use client';

import { useState, useEffect } from 'react';
import Header from '@/components/Header';
import BottomNav from '@/components/BottomNav';
import ProductCard from '@/components/ProductCard';
import { API_BASE_URL, ProductSummary } from '@/lib/api';

export default function SearchPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const trimmed = searchTerm.trim();
    if (trimmed.length === 0) {
      setProducts([]);
      setErrorMessage(null);
      setHasSearched(false);
      return;
    }

    if (trimmed.length < 2) {
      setErrorMessage('Please type at least 2 characters to search.');
      setProducts([]);
      setHasSearched(false);
      return;
    }

    setErrorMessage(null);
    const timeout = setTimeout(async () => {
      try {
        setLoading(true);
        const res = await fetch(
          `${API_BASE_URL}/products/search?q=${encodeURIComponent(trimmed)}`
        );
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          setErrorMessage(
            errData.error || 'Failed to search products. Please try again.'
          );
          setProducts([]);
          return;
        }
        const data = await res.json();
        setProducts(data.products || []);
        setHasSearched(true);
      } catch (err) {
        console.error(err);
        setErrorMessage('Network error while searching.');
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => clearTimeout(timeout);
  }, [searchTerm]);

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900 antialiased pb-20">
      <Header showBack title="Search" />

      {/* Search Input Bar */}
      <div className="sticky top-[57px] z-30 w-full border-b border-slate-200 bg-white px-3 py-3 shadow-2xs">
        <div className="mx-auto max-w-md">
          <div className="relative flex items-center">
            <svg
              className="pointer-events-none absolute left-3.5 h-4 w-4 text-slate-400"
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
            <input
              type="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search products by name (min 2 chars)..."
              autoFocus
              className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-10 text-base text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                aria-label="Clear search"
                className="absolute right-2 flex min-h-[36px] min-w-[36px] items-center justify-center text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      <main className="mx-auto w-full max-w-md flex-1 px-3 py-4">
        {errorMessage ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-center">
            <p className="text-sm font-semibold text-amber-800">{errorMessage}</p>
          </div>
        ) : loading ? (
          <div className="flex min-h-[250px] flex-col items-center justify-center text-slate-400">
            <div className="h-8 w-8 animate-spin rounded-full border-3 border-emerald-600 border-t-transparent" />
            <span className="mt-3 text-sm font-medium">Searching products...</span>
          </div>
        ) : hasSearched && products.length === 0 ? (
          <div className="flex min-h-[250px] flex-col items-center justify-center text-center px-4">
            <span className="text-4xl">🔍</span>
            <h2 className="mt-3 text-base font-bold text-slate-800">
              No products found
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              No matching products found for &ldquo;{searchTerm}&rdquo;. Try another term.
            </p>
          </div>
        ) : products.length > 0 ? (
          <div>
            <div className="mb-3 px-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
              {products.length} {products.length === 1 ? 'result' : 'results'} for &ldquo;{searchTerm}&rdquo;
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {products.map((prod) => (
                <ProductCard key={prod.id} product={prod} />
              ))}
            </div>
          </div>
        ) : (
          <div className="flex min-h-[250px] flex-col items-center justify-center text-center px-4 text-slate-400">
            <span className="text-4xl">🥑</span>
            <p className="mt-2 text-sm">
              Type at least 2 characters to search groceries, dairy, snacks, and more.
            </p>
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
