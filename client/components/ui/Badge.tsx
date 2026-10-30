import React from 'react';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'saffron' | 'neutral' | 'primary';
}

export default function Badge({
  children,
  variant = 'neutral',
  className = '',
  ...props
}: BadgeProps) {
  const variantStyles = {
    // saffron: saffron background, on-saffron text
    saffron: 'bg-saffron text-on-saffron font-bold',
    // neutral: surface background, muted text
    neutral: 'bg-surface text-muted border border-border/60 font-semibold',
    // primary: chip background, primary text
    primary: 'bg-chip text-primary border border-border/60 font-bold',
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
