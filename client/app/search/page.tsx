'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Header from '@/components/ui/Header';
import BottomNav from '@/components/ui/BottomNav';
import CartBar from '@/components/ui/CartBar';
import ImagePlaceholder from '@/components/ui/ImagePlaceholder';
import PriceLabel from '@/components/ui/PriceLabel';
import Button from '@/components/ui/Button';
import QuantityStepper from '@/components/ui/QuantityStepper';
import { useCart } from '@/context/CartContext';
import { API_BASE_URL, ProductSummary } from '@/lib/api';

const TRENDING_SEARCHES = [
  'Alphonso Mangoes',
  'Chitale Cow Milk',
  'Fresh Kothimbir',
  'Kolhapuri Jaggery',
];

export default function SearchPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { cart, addItem, updateQty } = useCart();

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
    <div className="flex min-h-screen flex-col bg-background text-text antialiased pb-28">
      {/* Top Header with store icon, location pill, and ETA chip */}
      <Header />

      {/* Search Bar matching search.png */}
      <div className="sticky top-[57px] z-30 w-full border-b border-border bg-background/95 px-4 py-3 backdrop-blur-md">
        <div className="mx-auto max-w-md">
          <div className="relative flex items-center">
            <svg
              className="pointer-events-none absolute left-3.5 h-4 w-4 text-muted"
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
              placeholder="Search vegetables, atta, milk, spices..."
              autoFocus
              className="h-[48px] w-full rounded-[14px] border border-border bg-card pl-10 pr-10 text-sm text-text placeholder-muted focus:border-primary focus:outline-hidden shadow-2xs"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                aria-label="Clear search"
                className="absolute right-2.5 flex min-h-[36px] min-w-[36px] items-center justify-center rounded-full text-muted hover:text-heading"
              >
                ✕
              </button>
            )}
          </div>

          {/* Filter Pills matching search.png */}
          <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
            <button
              type="button"
              className="flex min-h-[34px] shrink-0 items-center rounded-full bg-primary px-3.5 py-1 text-xs font-bold text-card"
            >
              All ({products.length > 0 ? products.length : 3})
            </button>
            <button
              type="button"
              className="flex min-h-[34px] shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1 text-xs font-semibold text-muted hover:bg-surface"
            >
              <svg className="h-3.5 w-3.5 text-primary shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
              <span>In Stock Nearby</span>
            </button>
            <button
              type="button"
              className="flex min-h-[34px] shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1 text-xs font-semibold text-muted hover:bg-surface"
            >
              <svg className="h-3.5 w-3.5 text-primary shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              <span>Fresh Farm Batch</span>
            </button>
          </div>
        </div>
      </div>

      <main className="mx-auto w-full max-w-md flex-1 px-4 py-4 space-y-5">
        {errorMessage ? (
          <div className="rounded-[14px] border border-border bg-chip p-4 text-center">
            <p className="text-sm font-bold text-heading">{errorMessage}</p>
          </div>
        ) : loading ? (
          <div className="flex min-h-[220px] flex-col items-center justify-center text-muted">
            <div className="h-8 w-8 animate-spin rounded-full border-3 border-primary border-t-transparent" />
            <span className="mt-3 text-sm font-semibold">Searching kirana inventory...</span>
          </div>
        ) : hasSearched && products.length === 0 ? (
          <div className="flex min-h-[200px] flex-col items-center justify-center text-center px-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-chip text-primary">
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <h2 className="mt-3 text-base font-extrabold text-heading">
              No matching essentials found
            </h2>
            <p className="mt-1 text-xs font-medium text-muted max-w-xs">
              We couldn&apos;t find &ldquo;{searchTerm}&rdquo;. Try checking spelling or select from trending below.
            </p>
          </div>
        ) : products.length > 0 ? (
          <div>
            <div className="mb-3 flex items-center justify-between text-xs font-bold text-muted">
              <span className="text-heading font-extrabold">Matching Results</span>
              <span>Saswad &amp; Pune Kirana hub</span>
            </div>

            {/* Horizontal Result Cards matching search.png */}
            <div className="space-y-3">
              {products.map((prod) => {
                const cartItem = cart?.items.find((i) => i.product_id === prod.id);
                const hasDiscount = prod.mrp_paise > prod.selling_price_paise;
                const discountPercent = hasDiscount
                  ? Math.round(((prod.mrp_paise - prod.selling_price_paise) / prod.mrp_paise) * 100)
                  : 0;

                return (
                  <div
                    key={prod.id}
                    className="flex items-center justify-between gap-3 rounded-[16px] border border-border bg-card p-3 shadow-2xs"
                  >
                    {/* Left: Product Image */}
                    <Link
                      href={`/product/${prod.id}`}
                      className="relative h-20 w-20 shrink-0 overflow-hidden rounded-[12px] border border-border/40 bg-surface"
                    >
                      <ImagePlaceholder
                        label={prod.name.slice(0, 10)}
                        aspectRatio="1:1"
                        className="h-full w-full object-cover"
                      />
                    </Link>

                    {/* Middle: Info */}
                    <div className="flex flex-col min-w-0 flex-1">
                      <Link
                        href={`/product/${prod.id}`}
                        className="text-sm font-bold text-heading hover:text-primary leading-snug truncate"
                      >
                        {prod.name}
                      </Link>
                      <span className="text-xs font-semibold text-muted truncate">
                        {prod.unit_size || prod.brand || 'Fresh Batch'}
                      </span>
                      <div className="mt-1">
                        <PriceLabel
                          sellingPricePaise={prod.selling_price_paise}
                          mrpPaise={prod.mrp_paise}
                          size="sm"
                        />
                      </div>
                    </div>

                    {/* Right: Add Button or Stepper (outline primary 44px) */}
                    <div className="shrink-0 w-28">
                      {!prod.is_available ? (
                        <span className="inline-block w-full text-center text-xs font-bold text-muted">
                          Unavailable
                        </span>
                      ) : cartItem ? (
                        <QuantityStepper
                          qty={cartItem.qty}
                          onIncrease={() => updateQty(prod.id, cartItem.qty + 1)}
                          onDecrease={() => updateQty(prod.id, cartItem.qty - 1)}
                        />
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          fullWidth
                          onClick={() => addItem(prod.id, 1)}
                        >
                          + Add
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* Trending Section */}
        <div className="space-y-4 pt-1">
          <div>
            <div className="flex items-center gap-1.5 text-heading">
              <svg className="h-4 w-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
              <h2 className="text-sm font-extrabold">Trending Searches</h2>
            </div>
            <p className="mt-0.5 text-xs font-medium text-muted">
              Frequently ordered daily essentials
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              {TRENDING_SEARCHES.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setSearchTerm(item)}
                  className="flex min-h-[38px] items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1 text-xs font-bold text-heading shadow-2xs hover:border-primary/40 active:bg-chip transition-colors"
                >
                  <svg className="h-3 w-3 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="9" strokeWidth={2} />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 7v5l3 3" />
                  </svg>
                  <span>{item}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Quality Standard Card matching search.png */}
          <div className="flex items-start gap-3 rounded-[16px] border border-border bg-surface p-3.5 shadow-2xs">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-card border border-border text-primary">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-bold text-heading">Uncut, Sorted Kirana Standard</span>
              <span className="mt-0.5 text-[11px] font-medium text-muted">
                Inspected at early 5 AM arrival from Saswad &amp; Junnar mandis.
              </span>
            </div>
          </div>
        </div>
      </main>

      {/* Floating Cart Bar above BottomNav */}
      <CartBar />

      <BottomNav />
    </div>
  );
}
