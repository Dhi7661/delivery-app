import React from 'react';
import { formatPaise } from '@/lib/money';

export interface PriceLabelProps {
  sellingPricePaise: number;
  mrpPaise?: number;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export default function PriceLabel({
  sellingPricePaise,
  mrpPaise,
  size = 'md',
  className = '',
}: PriceLabelProps) {
  const hasDiscount = mrpPaise && mrpPaise > sellingPricePaise;

  const sizeStyles = {
    sm: {
      selling: 'text-xs font-extrabold',
      mrp: 'text-[10px]',
    },
    md: {
      selling: 'text-sm font-extrabold',
      mrp: 'text-xs',
    },
    lg: {
      selling: 'text-lg font-black',
      mrp: 'text-xs',
    },
  }[size];

  return (
    <div className={`inline-flex items-baseline gap-1.5 ${className}`}>
      <span className={`${sizeStyles.selling} text-heading`}>
        {formatPaise(sellingPricePaise)}
      </span>
      {hasDiscount && (
        <span className={`${sizeStyles.mrp} text-muted line-through font-normal`}>
          {formatPaise(mrpPaise)}
        </span>
      )}
    </div>
  );
}
