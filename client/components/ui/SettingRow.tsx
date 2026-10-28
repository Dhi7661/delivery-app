import React from 'react';
import Link from 'next/link';

export interface SettingRowProps {
  icon?: React.ReactNode;
  label: string;
  value?: string;
  onClick?: () => void;
  href?: string;
  isDestructive?: boolean;
  className?: string;
}

export default function SettingRow({
  icon,
  label,
  value,
  onClick,
  href,
  isDestructive = false,
  className = '',
}: SettingRowProps) {
  const content = (
    <div
      className={`flex min-h-[48px] w-full items-center justify-between px-4 py-3 transition-colors ${
        isDestructive
          ? 'text-primary hover:bg-surface font-bold'
          : 'text-heading hover:bg-surface font-semibold'
      } ${className}`}
    >
      <div className="flex items-center gap-3 min-w-0">
        {icon && <span className="text-muted shrink-0">{icon}</span>}
        <span className="text-sm truncate">{label}</span>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {value && <span className="text-xs text-muted font-normal">{value}</span>}
        {!isDestructive && (
          <svg
            className="h-4 w-4 text-muted"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        )}
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block w-full border-b border-border/50 last:border-b-0">
        {content}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full text-left border-b border-border/50 last:border-b-0"
    >
      {content}
    </button>
  );
}
