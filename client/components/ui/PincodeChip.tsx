import React from 'react';

export interface PincodeChipProps {
  pincode?: string;
  label?: string;
  onClick?: () => void;
  className?: string;
}

export default function PincodeChip({
  pincode = '411001',
  label = 'Pin',
  onClick,
  className = '',
}: PincodeChipProps) {
  const Component = onClick ? 'button' : 'div';

  return (
    <Component
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-border bg-chip px-3 py-1 text-xs font-semibold text-heading transition-colors ${
        onClick ? 'hover:bg-surface active:scale-98 cursor-pointer' : ''
      } ${className}`}
    >
      <svg
        className="h-3.5 w-3.5 text-primary shrink-0"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
        />
      </svg>
      <span className="whitespace-nowrap text-[11px]">
        {label}: <strong className="font-bold">{pincode}</strong>
      </span>
    </Component>
  );
}
