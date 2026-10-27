'use client';

import Link from 'next/link';
import { ProductSummary } from '@/lib/api';
import { formatPaise } from '@/lib/money';

interface ProductCardProps {
  product: ProductSummary;
}

export default function ProductCard({ product }: ProductCardProps) {
  const hasDiscount = product.mrp_paise > product.selling_price_paise;
  const discountPercent = hasDiscount
    ? Math.round(
        ((product.mrp_paise - product.selling_price_paise) /
          product.mrp_paise) *
          100
      )
    : 0;

  return (
    <div className="flex min-w-0 flex-col justify-between overflow-hidden rounded-2xl border border-slate-200 bg-white p-2.5 shadow-2xs transition-shadow hover:shadow-xs">
      <Link
        href={`/product/${product.id}`}
        className="group block focus:outline-hidden min-w-0"
      >
        {/* Fixed aspect-ratio image container to prevent layout jump */}
        <div className="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl bg-slate-100">
          {/* Product Icon / Placeholder */}
          <span className="text-3xl transition-transform duration-200 group-hover:scale-110">
            📦
          </span>

          {/* Out of Stock overlay or Discount tag */}
          {!product.is_available ? (
            <div className="absolute inset-0 flex items-center justify-center bg-white/80 backdrop-blur-2xs">
              <span className="rounded-md bg-rose-600 px-1.5 py-0.5 text-[11px] font-bold text-white shadow-xs">
                Out of stock
              </span>
            </div>
          ) : hasDiscount ? (
            <span className="absolute left-1.5 top-1.5 rounded-md bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
              {discountPercent}% OFF
            </span>
          ) : null}
        </div>

        {/* Brand & Unit Size */}
        <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500 min-w-0">
          <span className="truncate font-medium min-w-0">{product.brand}</span>
          <span className="shrink-0 rounded-sm bg-slate-100 px-1 py-0.2 font-semibold text-slate-600 ml-1">
            {product.unit_size}
          </span>
        </div>

        {/* Product Title */}
        <h3 className="mt-1 line-clamp-2 text-xs font-semibold leading-snug text-slate-900 group-hover:text-emerald-700 min-w-0">
          {product.name}
        </h3>
      </Link>

      {/* Pricing and Action row */}
      <div className="mt-2.5 pt-2 border-t border-slate-100">
        <div className="flex items-baseline gap-1 min-w-0">
          <span className="text-sm font-extrabold text-slate-900">
            {formatPaise(product.selling_price_paise)}
          </span>
          {hasDiscount && (
            <span className="text-[11px] text-slate-400 line-through truncate">
              {formatPaise(product.mrp_paise)}
            </span>
          )}
        </div>

        {/* Add button with min 44px tap target */}
        <button
          type="button"
          disabled={!product.is_available}
          className={`mt-2 flex min-h-[44px] w-full items-center justify-center rounded-xl font-bold text-xs transition-colors ${
            product.is_available
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-300 hover:bg-emerald-600 hover:text-white active:scale-95'
              : 'cursor-not-allowed bg-slate-100 text-slate-400 border border-slate-200'
          }`}
        >
          {product.is_available ? 'Add' : 'Unavailable'}
        </button>
      </div>
    </div>
  );
}
