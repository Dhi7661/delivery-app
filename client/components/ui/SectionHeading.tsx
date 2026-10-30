import React from 'react';
import Link from 'next/link';

export interface SectionHeadingProps {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
  className?: string;
}

export default function SectionHeading({
  title,
  subtitle,
  actionLabel,
  actionHref,
  onAction,
  className = '',
}: SectionHeadingProps) {
  return (
    <div className={`flex items-baseline justify-between gap-2 ${className}`}>
      <div>
        <h2 className="text-base font-black tracking-tight text-heading sm:text-lg">
          {title}
        </h2>
        {subtitle && (
          <p className="mt-0.5 text-xs font-semibold text-muted">{subtitle}</p>
        )}
      </div>

      {actionLabel && (
        <div>
          {actionHref ? (
            <Link
              href={actionHref}
              className="text-xs font-bold text-primary hover:opacity-80 transition-opacity"
            >
              {actionLabel} &rarr;
            </Link>
          ) : onAction ? (
            <button
              type="button"
              onClick={onAction}
              className="text-xs font-bold text-primary hover:opacity-80 transition-opacity"
            >
              {actionLabel} &rarr;
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
