'use client';

import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'outline' | 'dangerOutline' | 'danger' | 'saffron' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  loading?: boolean;
}

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  loading = false,
  disabled,
  className = '',
  ...props
}: ButtonProps) {
  const baseStyles =
    'inline-flex items-center justify-center font-bold transition-colors select-none focus:outline-hidden disabled:opacity-50 disabled:cursor-not-allowed rounded-[12px] active:scale-[0.98]';

  // Minimum height is 44px per spec for interactive buttons
  const sizeStyles = {
    sm: 'min-h-[44px] px-3 text-xs',
    md: 'min-h-[44px] px-4 text-sm',
    lg: 'min-h-[48px] px-6 text-base',
  }[size];

  const variantStyles = {
    // primary: solid primary token with card/white text
    primary: 'bg-primary text-card hover:opacity-90',
    // outline: card background with primary border and text
    outline: 'bg-card text-primary border border-primary hover:bg-surface',
    // danger outline: mapped to primary outline style per Figma design (no red)
    dangerOutline: 'bg-card text-primary border border-primary hover:bg-surface',
    danger: 'bg-card text-primary border border-primary hover:bg-surface',
    saffron: 'bg-saffron text-on-saffron hover:opacity-90',
    secondary: 'bg-surface text-heading border border-border hover:bg-chip',
    ghost: 'bg-transparent text-primary hover:bg-surface',
  }[variant];

  const widthStyle = fullWidth ? 'w-full' : '';

  return (
    <button
      disabled={disabled || loading}
      className={`${baseStyles} ${sizeStyles} ${variantStyles} ${widthStyle} ${className}`}
      {...props}
    >
      {loading ? (
        <span className="flex items-center gap-2">
          <svg
            className="h-4 w-4 animate-spin text-current"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <span>Loading...</span>
        </span>
      ) : (
        children
      )}
    </button>
  );
}
