import React from 'react';
import Link from 'next/link';
import ImagePlaceholder from './ImagePlaceholder';

export interface CategoryTileProps {
  id: string;
  name: string;
  icon?: string;
  href?: string;
  className?: string;
}

export default function CategoryTile({
  id,
  name,
  icon,
  href,
  className = '',
}: CategoryTileProps) {
  const targetHref = href || `/category/${id}`;

  return (
    <Link
      href={targetHref}
      className={`group flex flex-col items-center rounded-[16px] border border-border bg-card p-2.5 transition-all hover:bg-surface hover:shadow-xs active:scale-[0.98] ${className}`}
    >
      <div className="w-full">
        <ImagePlaceholder
          alt={name}
          icon={icon}
          aspectRatio="square"
          className="group-hover:border-saffron/50 transition-colors"
        />
      </div>
      <span className="mt-2 text-center text-xs font-bold leading-tight text-heading line-clamp-2">
        {name}
      </span>
    </Link>
  );
}
