import React from 'react';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'saffron' | 'chip' | 'surface' | 'primary' | 'muted';
}

export default function Badge({
  children,
  variant = 'chip',
  className = '',
  ...props
}: BadgeProps) {
  const variantStyles = {
    saffron: 'bg-saffron text-on-saffron font-bold',
    chip: 'bg-chip text-heading border border-border/60 font-semibold',
    surface: 'bg-surface text-muted border border-border font-medium',
    primary: 'bg-primary text-background font-bold',
    muted: 'bg-chip text-muted font-normal',
  }[variant];

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] leading-tight ${variantStyles} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
}
