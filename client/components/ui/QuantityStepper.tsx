'use client';

import React from 'react';

export interface QuantityStepperProps {
  qty?: number;
  quantity?: number;
  onIncrease: () => void;
  onDecrease: () => void;
  disabled?: boolean;
  className?: string;
}

export default function QuantityStepper({
  qty,
  quantity,
  onIncrease,
  onDecrease,
  disabled = false,
  className = '',
}: QuantityStepperProps) {
  const displayQty = qty ?? quantity ?? 1;
  return (
    <div
      className={`inline-flex min-h-[44px] w-full items-center justify-between rounded-[12px] border border-primary bg-chip px-2 font-bold text-primary ${className}`}
    >
      <button
        type="button"
        onClick={onDecrease}
        disabled={disabled}
        aria-label="Decrease quantity"
        className="flex min-h-[44px] min-w-[40px] items-center justify-center rounded-[8px] text-lg font-black text-primary hover:bg-surface active:scale-95 transition-all disabled:opacity-50"
      >
        &minus;
      </button>
      <span className="text-sm font-extrabold text-heading px-2">{displayQty}</span>
      <button
        type="button"
        onClick={onIncrease}
        disabled={disabled}
        aria-label="Increase quantity"
        className="flex min-h-[44px] min-w-[40px] items-center justify-center rounded-[8px] text-lg font-black text-primary hover:bg-surface active:scale-95 transition-all disabled:opacity-50"
      >
        &#43;
      </button>
    </div>
  );
}
