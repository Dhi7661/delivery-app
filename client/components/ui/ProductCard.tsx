'use client';

import React from 'react';
import Link from 'next/link';
import { ProductSummary } from '@/lib/api';
import { useCart } from '@/context/CartContext';
import PriceLabel from './PriceLabel';
import QuantityStepper from './QuantityStepper';
import Button from './Button';
import ImagePlaceholder from './ImagePlaceholder';

export interface ProductCardProps {
  product: ProductSummary;
  className?: string;
}

export default function ProductCard({ product, className = '' }: ProductCardProps) {
  const { cart, addItem, updateQty } = useCart();
  const cartItem = cart?.items.find((i) => i.product_id === product.id);

  const hasDiscount = product.mrp_paise > product.selling_price_paise;
  const discountPercent = hasDiscount
    ? Math.round(
        ((product.mrp_paise - product.selling_price_paise) /
          product.mrp_paise) *
          100
      )
    : 0;

  return (
    <div
      className={`flex min-w-0 flex-col justify-between overflow-hidden rounded-[16px] border border-border bg-card p-3 shadow-2xs transition-shadow hover:shadow-xs ${className}`}
    >
      <Link
        href={`/product/${product.id}`}
        className="group block focus:outline-hidden min-w-0"
      >
        {/* Product image container using ImagePlaceholder */}
        <div className="relative">
          <ImagePlaceholder
            alt={product.name}
            aspectRatio="square"
            className="group-hover:border-saffron/50 transition-colors"
          />

          {/* Out of Stock overlay or Discount tag */}
          {!product.is_available ? (
            <div className="absolute inset-0 flex items-center justify-center rounded-[12px] bg-card/85 backdrop-blur-2xs">
              <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-card shadow-xs">
                Out of stock
              </span>
            </div>
          ) : hasDiscount ? (
            <span className="absolute left-2 top-2 rounded-[6px] bg-saffron px-2 py-0.5 text-[10px] font-extrabold text-on-saffron shadow-xs uppercase tracking-wide">
              {discountPercent}% OFF
            </span>
          ) : null}
        </div>

        {/* Unit Size */}
        <div className="mt-2 text-xs font-semibold text-muted min-w-0 truncate">
          {product.unit_size || product.brand}
        </div>

        {/* Product Title */}
        <h3 className="mt-1 line-clamp-2 text-sm font-bold leading-snug text-heading group-hover:text-primary min-w-0 min-h-[38px]">
          {product.name}
        </h3>
      </Link>

      {/* Pricing and Action row */}
      <div className="mt-2.5 pt-2 border-t border-border/40">
        <PriceLabel
          sellingPricePaise={product.selling_price_paise}
          mrpPaise={product.mrp_paise}
          size="md"
        />

        {/* Action button: outline button '+ Add' or QuantityStepper if in cart */}
        <div className="mt-2.5">
          {!product.is_available ? (
            <Button variant="outline" size="sm" fullWidth disabled>
              Unavailable
            </Button>
          ) : cartItem ? (
            <QuantityStepper
              qty={cartItem.qty}
              onIncrease={() => updateQty(product.id, cartItem.qty + 1)}
              onDecrease={() => updateQty(product.id, cartItem.qty - 1)}
            />
          ) : (
            <Button
              variant="outline"
              size="sm"
              fullWidth
              onClick={() => addItem(product.id, 1)}
            >
              + Add
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
