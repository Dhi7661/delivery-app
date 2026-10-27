'use client';

import Link from 'next/link';
import { ProductSummary } from '@/lib/api';
import { formatPaise } from '@/lib/money';
import { useCart } from '@/context/CartContext';

interface ProductCardProps {
  product: ProductSummary;
}

export default function ProductCard({ product }: ProductCardProps) {
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

        {/* Action button: Stepper if in cart, Add button if not */}
        {!product.is_available ? (
          <button
            type="button"
            disabled
            className="mt-2 flex min-h-[44px] w-full items-center justify-center rounded-xl bg-slate-100 font-bold text-xs text-slate-400 border border-slate-200 cursor-not-allowed"
          >
            Unavailable
          </button>
        ) : cartItem ? (
          <div className="mt-2 flex min-h-[44px] w-full items-center justify-between rounded-xl border border-emerald-600 bg-emerald-50 px-2 font-bold text-emerald-800">
            <button
              type="button"
              onClick={() => updateQty(product.id, cartItem.qty - 1)}
              aria-label="Decrease quantity"
              className="flex min-h-[40px] min-w-[36px] items-center justify-center rounded-lg text-base text-emerald-800 hover:bg-emerald-200 active:scale-95"
            >
              -
            </button>
            <span className="text-sm font-black">{cartItem.qty}</span>
            <button
              type="button"
              onClick={() => updateQty(product.id, cartItem.qty + 1)}
              aria-label="Increase quantity"
              className="flex min-h-[40px] min-w-[36px] items-center justify-center rounded-lg text-base text-emerald-800 hover:bg-emerald-200 active:scale-95"
            >
              +
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => addItem(product.id, 1)}
            className="mt-2 flex min-h-[44px] w-full items-center justify-center rounded-xl bg-emerald-50 font-bold text-xs text-emerald-700 border border-emerald-300 hover:bg-emerald-600 hover:text-white active:scale-95 transition-colors"
          >
            Add
          </button>
        )}
      </div>
    </div>
  );
}
