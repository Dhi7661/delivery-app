'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Header from '@/components/ui/Header';
import BottomNav from '@/components/ui/BottomNav';
import CartBar from '@/components/ui/CartBar';
import ImagePlaceholder from '@/components/ui/ImagePlaceholder';
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
  const discountPercent =
    product && hasDiscount
      ? Math.round(
          ((product.mrp_paise - product.selling_price_paise) /
            product.mrp_paise) *
            100
        )
      : 0;

  const savingsPaise =
    product && hasDiscount
      ? product.mrp_paise - product.selling_price_paise
      : 0;

  return (
    <div className="flex min-h-screen flex-col bg-background text-text antialiased pb-32">
      {/* Top Header matching product.png */}
      <Header
        variant="product"
        title={product?.name || 'Product Details'}
        onShare={() => {
          if (navigator.share && product) {
            navigator.share({
              title: product.name,
              text: `Check out ${product.name} on ${BRAND_NAME}`,
              url: window.location.href,
            }).catch(() => {});
          }
        }}
      />

      <main className="mx-auto w-full max-w-md flex-1 px-4 py-3 space-y-4">
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
          <div className="flex flex-col space-y-4 pb-20">
            {/* Hero Image Card matching product.png */}
            <div className="relative overflow-hidden rounded-[20px] border border-border bg-card p-3 shadow-2xs">
              <div className="relative aspect-4/3 w-full overflow-hidden rounded-[14px] bg-surface">
                <ImagePlaceholder
                  label={product.name}
                  aspectRatio="4:3"
                  className="h-full w-full object-cover"
                />

                {/* Badge top-left */}
                <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-card/90 px-2.5 py-1 text-[11px] font-bold text-heading shadow-xs backdrop-blur-2xs">
                  <span className="text-primary text-xs">🌿</span>
                  <span>100% Carbide-Free</span>
                </div>

                {!product.is_available && (
                  <div className="absolute inset-0 flex items-center justify-center bg-card/85 backdrop-blur-2xs">
                    <span className="rounded-full bg-primary px-3 py-1 text-xs font-bold text-card shadow-xs">
                      Out of stock
                    </span>
                  </div>
                )}
              </div>

              {/* Pagination Dots */}
              <div className="mt-2.5 flex items-center justify-center gap-1.5">
                <span className="h-1.5 w-5 rounded-full bg-primary" />
                <span className="h-1.5 w-1.5 rounded-full bg-border" />
                <span className="h-1.5 w-1.5 rounded-full bg-border" />
              </div>
            </div>

            {/* Badges Row matching product.png */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-saffron px-3 py-1 text-[11px] font-black text-on-saffron uppercase tracking-wider">
                GI TAGGED &bull; KONKAN
              </span>
              <span className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-[11px] font-bold text-heading">
                <svg className="h-3.5 w-3.5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                <span>Fresh Mandi Batch</span>
              </span>
            </div>

            {/* Product Title and Brand */}
            <div>
              <h1 className="text-xl font-black text-heading leading-snug">
                {product.name}
              </h1>
              <p className="mt-1 text-xs font-semibold text-muted leading-relaxed">
                Net Weight: Approx 2.8 - 3.2 kg (Box of 12) &bull; Single-origin Devgad
                {product.unit_size && ` (${product.unit_size})`}
              </p>
            </div>

            {/* Price Row */}
            <div className="flex items-baseline gap-2.5 py-0.5">
              <span className="text-2xl font-black text-heading">
                {formatPaise(product.selling_price_paise)}
              </span>
              {hasDiscount && (
                <>
                  <span className="text-sm font-semibold text-muted line-through">
                    {formatPaise(product.mrp_paise)}
                  </span>
                  <span className="rounded-[6px] border border-saffron/40 bg-saffron/20 px-2 py-0.5 text-xs font-extrabold text-on-saffron">
                    Save {formatPaise(savingsPaise)}
                  </span>
                </>
              )}
            </div>

            {/* Description matching product.png */}
            <p className="text-xs font-medium text-muted leading-relaxed">
              Hand-picked from Devgad orchards, naturally ripened in dry grass haystacks, 100% carbide-free with rich natural aroma.
            </p>

            {/* Select Box Size matching product.png */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-muted">
                <span className="text-heading font-extrabold">Select Box Size</span>
                <span>2 Options Available</span>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between rounded-[14px] border-2 border-primary bg-surface p-3 shadow-2xs">
                  <div className="flex items-center gap-3">
                    <div className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-primary bg-card">
                      <div className="h-2.5 w-2.5 rounded-full bg-primary" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-heading block">
                        12 Pcs Box (Selected)
                      </span>
                      <span className="text-[11px] font-medium text-muted">
                        Family Pack &bull; Approx 3.0 kg
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-black text-heading block">
                      {formatPaise(product.selling_price_paise)}
                    </span>
                    {hasDiscount && (
                      <span className="text-[10px] text-muted line-through">
                        {formatPaise(product.mrp_paise)}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-[14px] border border-border bg-card p-3 opacity-80">
                  <div className="flex items-center gap-3">
                    <div className="h-5 w-5 rounded-full border border-border bg-card" />
                    <div>
                      <span className="text-xs font-bold text-heading block">
                        6 Pcs Box
                      </span>
                      <span className="text-[11px] font-medium text-muted">
                        Sampler Pack &bull; Approx 1.5 kg
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-bold text-heading block">
                      {formatPaise(Math.round(product.selling_price_paise * 0.53))}
                    </span>
                    <span className="text-[10px] text-muted line-through">
                      {formatPaise(Math.round(product.mrp_paise * 0.58))}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Kirana Storage Tip matching product.png */}
            <div className="rounded-[16px] border border-border bg-surface p-3.5 shadow-2xs flex items-start gap-3">
              <span className="text-primary text-lg">💡</span>
              <div className="min-w-0 flex-1">
                <h3 className="text-xs font-bold text-heading">Kirana Storage Tip</h3>
                <p className="mt-0.5 text-[11px] font-medium text-muted leading-relaxed">
                  Keep at room temperature until fragrant before refrigerating. Never store raw mangoes in airtight plastic containers.
                </p>
              </div>
            </div>

            {/* Neighborhood Assurance Card matching product.png */}
            <div className="rounded-[18px] border border-border bg-card p-4 shadow-2xs space-y-3.5">
              <div className="flex items-center justify-between border-b border-border/40 pb-2.5">
                <span className="text-xs font-extrabold text-heading">Neighborhood Assurance</span>
                <span className="text-[11px] font-bold text-primary">🛡️ Farm Fresh</span>
              </div>

              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-chip text-primary">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-xs font-bold text-heading">100% Quality Guarantee</h3>
                  <p className="text-[11px] font-medium text-muted leading-tight mt-0.5">
                    Check firmness at your doorstep, return instantly if dissatisfied with no questions asked.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-chip text-primary">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-xs font-bold text-heading">Zero Plastic Packaging</h3>
                  <p className="text-[11px] font-medium text-muted leading-tight mt-0.5">
                    Delivered in breathable natural paper carton &amp; dry grass hay bedding.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-chip text-primary">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="9" strokeWidth={2} />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 7v5l3 3" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-xs font-bold text-heading">Trusted Pune Delivery</h3>
                  <p className="text-[11px] font-medium text-muted leading-tight mt-0.5">
                    Hand-delivered by our dedicated local delivery champion.
                  </p>
                </div>
              </div>
            </div>

            {/* Harvest Origin & Ripening Method Cards side-by-side matching product.png */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-[14px] border border-border bg-card p-3 shadow-2xs">
                <span className="text-[10px] font-extrabold uppercase text-muted block">
                  Harvest Origin
                </span>
                <span className="text-xs font-bold text-heading block mt-0.5">
                  Devgad, Maharashtra
                </span>
              </div>
              <div className="rounded-[14px] border border-border bg-card p-3 shadow-2xs">
                <span className="text-[10px] font-extrabold uppercase text-muted block">
                  Ripening Method
                </span>
                <span className="text-xs font-bold text-heading block mt-0.5">
                  Traditional Gawat (Hay)
                </span>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Fixed Sticky Bottom Action Bar matching product.png */}
      {product && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-card/95 px-4 py-3 backdrop-blur-md">
          <div className="mx-auto flex max-w-md items-center justify-between gap-4">
            <div className="flex flex-col">
              <span className="text-[11px] font-bold text-muted">
                Selected (12 Pcs)
              </span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-base font-black text-heading">
                  {formatPaise(product.selling_price_paise)}
                </span>
                {hasDiscount && (
                  <span className="text-xs font-semibold text-muted line-through">
                    {formatPaise(product.mrp_paise)}
                  </span>
                )}
              </div>
            </div>

            <div className="w-48">
              {!product.is_available ? (
                <Button variant="outline" size="md" fullWidth disabled>
                  Out of Stock
                </Button>
              ) : cartItem ? (
                <QuantityStepper
                  quantity={cartItem.qty}
                  onIncrease={() => updateQty(product.id, cartItem.qty + 1)}
                  onDecrease={() => updateQty(product.id, cartItem.qty - 1)}
                />
              ) : (
                <Button
                  variant="primary"
                  size="md"
                  fullWidth
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
