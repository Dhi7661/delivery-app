'use client';

import React from 'react';

export interface QuantityStepperProps {
  qty: number;
  onIncrease: () => void;
  onDecrease: () => void;
  disabled?: boolean;
  className?: string;
}

export default function QuantityStepper({
  qty,
  onIncrease,
  onDecrease,
  disabled = false,
  className = '',
}: QuantityStepperProps) {
  return (
    <div
      className={`inline-flex min-h-[44px] w-full items-center justify-between rounded-[12px] border border-saffron/40 bg-saffron/20 px-2 font-bold text-heading ${className}`}
    >
      <button
        type="button"
        onClick={onDecrease}
        disabled={disabled}
        aria-label="Decrease quantity"
        className="flex min-h-[44px] min-w-[40px] items-center justify-center rounded-[8px] text-lg font-black text-heading hover:bg-saffron/30 active:scale-95 transition-all disabled:opacity-50"
      >
        &minus;
      </button>
      <span className="text-sm font-extrabold text-heading px-2">{qty}</span>
      <button
        type="button"
        onClick={onIncrease}
        disabled={disabled}
        aria-label="Increase quantity"
        className="flex min-h-[44px] min-w-[40px] items-center justify-center rounded-[8px] text-lg font-black text-heading hover:bg-saffron/30 active:scale-95 transition-all disabled:opacity-50"
      >
        &#43;
      </button>
    </div>
  );
}
