'use client';

import { Suspense, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Header from '@/components/Header';
import BottomNav from '@/components/BottomNav';
import CartBar from '@/components/CartBar';
import { API_BASE_URL, ProductDetail } from '@/lib/api';
import { formatPaise } from '@/lib/money';
import { useCart } from '@/context/CartContext';

function ProductContent() {
  const params = useParams();
  const productId = params?.id as string;

  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { cart, addItem, updateQty } = useCart();
  const cartItem = cart?.items.find((i) => i.product_id === productId);

  useEffect(() => {
    if (!productId) return;

    async function fetchProduct() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`${API_BASE_URL}/products/${productId}`);
        if (!res.ok) {
          if (res.status === 404) {
            setError('Product not found or currently inactive.');
          } else {
            setError('Failed to load product details.');
          }
          return;
        }
        const data = await res.json();
        setProduct(data.product);
      } catch (err) {
        console.error(err);
        setError('Network error. Please try again.');
      } finally {
        setLoading(false);
      }
    }

    fetchProduct();
  }, [productId]);

  const hasDiscount =
    product && product.mrp_paise > product.selling_price_paise;
  const discountPercent =
    product && hasDiscount
      ? Math.round(
          ((product.mrp_paise - product.selling_price_paise) /
            product.mrp_paise) *
            100
        )
      : 0;

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900 antialiased pb-32">
      <Header showBack title={product?.name || 'Product Details'} />

      <main className="mx-auto w-full max-w-md flex-1 px-3 py-3">
        {loading ? (
          <div className="flex min-h-[300px] flex-col items-center justify-center text-slate-400">
            <div className="h-8 w-8 animate-spin rounded-full border-3 border-emerald-600 border-t-transparent" />
            <span className="mt-3 text-sm font-medium">Loading product...</span>
          </div>
        ) : error || !product ? (
          <div className="flex min-h-[300px] flex-col items-center justify-center text-center px-4">
            <span className="text-4xl">🔍</span>
            <h2 className="mt-3 text-base font-bold text-slate-800">
              Product Not Available
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {error || 'The product you are looking for does not exist.'}
            </p>
          </div>
        ) : (
          <div className="flex flex-col min-w-0">
            {/* Fixed Aspect Ratio Product Image Container */}
            <div className="relative flex aspect-4/3 w-full items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xs">
              <span className="text-6xl">📦</span>
              {!product.is_available && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/80 backdrop-blur-2xs">
                  <span className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs">
                    Out of stock
                  </span>
                </div>
              )}
              {hasDiscount && product.is_available && (
                <span className="absolute left-2.5 top-2.5 rounded-lg bg-emerald-600 px-2 py-0.5 text-xs font-bold text-white shadow-2xs">
                  {discountPercent}% OFF
                </span>
              )}
            </div>

            {/* Details Section */}
            <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-2xs">
              {/* Brand & Unit Size */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
                  {product.brand}
                </span>
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">
                  {product.unit_size}
                </span>
              </div>

              {/* Title */}
              <h1 className="mt-1.5 text-base font-bold leading-snug text-slate-900">
                {product.name}
              </h1>

              {/* Shop info */}
              {product.shop && (
                <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
                  <svg
                    className="h-3.5 w-3.5 text-emerald-600 shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                    />
                  </svg>
                  <span className="truncate">
                    Sold by: <strong>{product.shop.name}</strong>
                  </span>
                </div>
              )}

              {/* Price section */}
              <div className="mt-3 flex items-baseline gap-2 border-t border-slate-100 pt-3">
                <span className="text-2xl font-black text-slate-900">
                  {formatPaise(product.selling_price_paise)}
                </span>
                {hasDiscount && (
                  <div className="flex items-baseline gap-1">
                    <span className="text-xs text-slate-400">MRP:</span>
                    <span className="text-xs text-slate-400 line-through">
                      {formatPaise(product.mrp_paise)}
                    </span>
                  </div>
                )}
              </div>

              {/* Availability Indicator */}
              <div className="mt-2.5 flex items-center gap-2">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    product.is_available ? 'bg-emerald-500' : 'bg-rose-500'
                  }`}
                />
                <span className="text-xs font-semibold text-slate-700">
                  {product.is_available ? 'In Stock' : 'Out of stock'}
                </span>
              </div>

              {/* Add to Cart or Quantity Stepper */}
              <div className="mt-4 pt-3 border-t border-slate-100">
                {!product.is_available ? (
                  <button
                    type="button"
                    disabled
                    className="flex min-h-[48px] w-full items-center justify-center rounded-xl bg-slate-100 font-bold text-base text-slate-400 border border-slate-200 cursor-not-allowed"
                  >
                    Out of stock
                  </button>
                ) : cartItem ? (
                  <div className="flex min-h-[48px] w-full items-center justify-between rounded-xl border border-emerald-600 bg-emerald-50 px-4 font-bold text-emerald-900">
                    <button
                      type="button"
                      onClick={() => updateQty(product.id, cartItem.qty - 1)}
                      aria-label="Decrease quantity"
                      className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-xl text-emerald-800 hover:bg-emerald-200 active:scale-95"
                    >
                      -
                    </button>
                    <span className="text-base font-black">
                      {cartItem.qty} in cart
                    </span>
                    <button
                      type="button"
                      onClick={() => updateQty(product.id, cartItem.qty + 1)}
                      aria-label="Increase quantity"
                      className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-xl text-emerald-800 hover:bg-emerald-200 active:scale-95"
                    >
                      +
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => addItem(product.id, 1)}
                    className="flex min-h-[48px] w-full items-center justify-center rounded-xl bg-emerald-600 font-bold text-base text-white shadow-md hover:bg-emerald-700 active:scale-98 transition-colors"
                  >
                    Add to Cart
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      <CartBar />
      <BottomNav />
    </div>
  );
}

export default function ProductPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900 antialiased pb-20">
          <Header showBack title="Product Details" />
          <div className="flex min-h-[300px] flex-col items-center justify-center text-slate-400">
            <div className="h-8 w-8 animate-spin rounded-full border-3 border-emerald-600 border-t-transparent" />
            <span className="mt-3 text-sm font-medium">Loading...</span>
          </div>
          <BottomNav />
        </div>
      }
    >
      <ProductContent />
    </Suspense>
  );
}
