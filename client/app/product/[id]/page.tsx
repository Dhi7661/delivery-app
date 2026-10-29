'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Header from '@/components/ui/Header';
import BottomNav from '@/components/ui/BottomNav';
import ImagePlaceholder from '@/components/ui/ImagePlaceholder';
import PriceLabel from '@/components/ui/PriceLabel';
import Button from '@/components/ui/Button';
import QuantityStepper from '@/components/ui/QuantityStepper';
import { API_BASE_URL, ProductDetail } from '@/lib/api';
import { formatPaise } from '@/lib/money';
import { BRAND_NAME } from '@/lib/brand';
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
  const savingsPaise =
    product && hasDiscount
      ? product.mrp_paise - product.selling_price_paise
      : 0;

  return (
    <div className="flex min-h-screen flex-col bg-background text-text antialiased pb-32">
      {/* Top Header */}
      <Header
        title={product?.name || 'Product Details'}
        showBack
      />

      <main className="mx-auto w-full max-w-md flex-1 px-4 py-4 space-y-4">
        {loading ? (
          <div className="flex min-h-[300px] flex-col items-center justify-center text-muted">
            <div className="h-8 w-8 animate-spin rounded-full border-3 border-primary border-t-transparent" />
            <span className="mt-3 text-sm font-semibold">Loading product...</span>
          </div>
        ) : error || !product ? (
          <div className="flex min-h-[300px] flex-col items-center justify-center text-center px-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-chip text-primary">
              <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h2 className="mt-4 text-base font-extrabold text-heading">
              Product Not Available
            </h2>
            <p className="mt-1 text-xs font-medium text-muted">
              {error || 'The product you are looking for does not exist.'}
            </p>
          </div>
        ) : (
          <div className="flex flex-col space-y-4">
            {/* Hero Image Card */}
            <div className="relative overflow-hidden rounded-[20px] border border-border bg-card p-3 shadow-2xs">
              <div className="relative aspect-4/3 w-full overflow-hidden rounded-[14px] bg-surface">
                <ImagePlaceholder
                  label={product.name}
                  aspectRatio="4:3"
                  className="h-full w-full object-cover"
                />

                {!product.is_available && (
                  <div className="absolute inset-0 flex items-center justify-center bg-card/85 backdrop-blur-2xs">
                    <span className="rounded-full bg-primary px-3 py-1 text-xs font-bold text-card shadow-xs">
                      Out of stock
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Product Meta: Category / Brand */}
            <div className="space-y-1">
              {product.category?.name && (
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-primary">
                  {product.category.name}
                </span>
              )}
              <h1 className="text-xl font-black text-heading leading-snug">
                {product.name}
              </h1>
              <p className="text-xs font-bold text-muted">
                {product.brand}
                {product.unit_size && ` • ${product.unit_size}`}
              </p>
            </div>

            {/* Price Row */}
            <div className="flex items-center gap-3 py-1">
              <PriceLabel
                sellingPricePaise={product.selling_price_paise}
                mrpPaise={product.mrp_paise}
                size="lg"
              />
              {hasDiscount && (
                <span className="rounded-[6px] border border-saffron/40 bg-saffron/20 px-2 py-0.5 text-xs font-extrabold text-on-saffron">
                  Save {formatPaise(savingsPaise)}
                </span>
              )}
            </div>

            {/* Availability */}
            <div className="pt-1">
              {product.is_available ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-heading">
                  <span className="h-2 w-2 rounded-full bg-primary" />
                  In Stock
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-danger">
                  <span className="h-2 w-2 rounded-full bg-danger" />
                  Currently Out of Stock
                </span>
              )}
            </div>

            {/* Action Button on Page */}
            <div className="pt-2">
              {!product.is_available ? (
                <Button variant="outline" size="md" fullWidth disabled className="min-h-[44px]">
                  Out of Stock
                </Button>
              ) : cartItem ? (
                <QuantityStepper
                  quantity={cartItem.qty}
                  onIncrease={() => updateQty(product.id, cartItem.qty + 1)}
                  onDecrease={() => updateQty(product.id, cartItem.qty - 1)}
                  className="min-h-[44px] w-full justify-between"
                />
              ) : (
                <Button
                  variant="primary"
                  size="md"
                  fullWidth
                  className="min-h-[44px]"
                  onClick={() => addItem(product.id, 1)}
                >
                  <svg className="mr-1.5 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                  </svg>
                  + Add to Cart
                </Button>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Fixed Sticky Bottom Action Bar */}
      {product && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-card/95 px-4 py-3 backdrop-blur-md">
          <div className="mx-auto flex max-w-md items-center justify-between gap-4">
            <div className="flex flex-col">
              <span className="text-[11px] font-bold text-muted">
                {product.unit_size || product.brand}
              </span>
              <PriceLabel
                sellingPricePaise={product.selling_price_paise}
                mrpPaise={product.mrp_paise}
                size="md"
              />
            </div>

            <div className="w-48">
              {!product.is_available ? (
                <Button variant="outline" size="md" fullWidth disabled className="min-h-[44px]">
                  Out of Stock
                </Button>
              ) : cartItem ? (
                <QuantityStepper
                  quantity={cartItem.qty}
                  onIncrease={() => updateQty(product.id, cartItem.qty + 1)}
                  onDecrease={() => updateQty(product.id, cartItem.qty - 1)}
                  className="min-h-[44px] w-full justify-between"
                />
              ) : (
                <Button
                  variant="primary"
                  size="md"
                  fullWidth
                  className="min-h-[44px]"
                  onClick={() => addItem(product.id, 1)}
                >
                  <svg className="mr-1.5 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                  </svg>
                  + Add to Cart
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProductPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen flex-col bg-background text-text antialiased pb-28">
          <Header showBack title="Product Details" />
          <div className="flex min-h-[300px] flex-col items-center justify-center text-muted">
            <div className="h-8 w-8 animate-spin rounded-full border-3 border-primary border-t-transparent" />
            <span className="mt-3 text-sm font-semibold">Loading...</span>
          </div>
          <BottomNav />
        </div>
      }
    >
      <ProductContent />
    </Suspense>
  );
}
