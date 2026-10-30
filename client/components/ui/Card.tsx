import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'surface' | 'saffron';
}

export default function Card({
  children,
  variant = 'default',
  className = '',
  ...props
}: CardProps) {
  const variantStyles = {
    default: 'bg-card border border-border',
    surface: 'bg-surface border border-border',
    saffron: 'bg-saffron/15 border border-saffron/30',
  }[variant];

  return (
    <div
      className={`rounded-[16px] p-4 text-text ${variantStyles} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
