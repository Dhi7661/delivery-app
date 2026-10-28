import React from 'react';

export interface FilterChipProps {
  label: string;
  active?: boolean;
  onClick?: () => void;
  className?: string;
}

export default function FilterChip({
  label,
  active = false,
  onClick,
  className = '',
}: FilterChipProps) {
  const Component = onClick ? 'button' : 'div';

  return (
    <Component
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`inline-flex min-h-[36px] items-center justify-center rounded-full px-4 py-1.5 text-xs transition-colors select-none ${
        active
          ? 'bg-saffron text-on-saffron font-bold shadow-xs'
          : 'bg-chip text-muted border border-border/80 font-semibold hover:bg-surface'
      } ${onClick ? 'cursor-pointer active:scale-95' : ''} ${className}`}
    >
      {label}
    </Component>
  );
}
