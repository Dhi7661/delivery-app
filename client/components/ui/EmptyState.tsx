import React from 'react';
import Link from 'next/link';
import Button from './Button';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
  className?: string;
}

export default function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
  className = '',
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-[16px] border border-border bg-card p-8 text-center ${className}`}
    >
      {icon && <div className="mb-3 text-muted">{icon}</div>}
      <h3 className="text-base font-extrabold text-heading">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-xs text-xs font-medium text-muted">
          {description}
        </p>
      )}

      {actionLabel && (
        <div className="mt-5">
          {actionHref ? (
            <Link href={actionHref}>
              <Button variant="saffron" size="sm">
                {actionLabel}
              </Button>
            </Link>
          ) : onAction ? (
            <Button variant="saffron" size="sm" onClick={onAction}>
              {actionLabel}
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}
