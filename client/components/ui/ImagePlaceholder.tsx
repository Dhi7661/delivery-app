import React from 'react';

export interface ImagePlaceholderProps {
  alt?: string;
  label?: string;
  aspectRatio?: 'square' | 'video' | 'portrait' | '1:1' | '4:3' | '16:9';
  icon?: string;
  className?: string;
}

export default function ImagePlaceholder({
  alt = 'Image placeholder',
  label,
  aspectRatio = 'square',
  icon,
  className = '',
}: ImagePlaceholderProps) {
  const aspectClass = {
    square: 'aspect-square',
    '1:1': 'aspect-square',
    video: 'aspect-video',
    '16:9': 'aspect-video',
    portrait: 'aspect-4/5',
    '4:3': 'aspect-4/3',
  }[aspectRatio] || 'aspect-square';

  return (
    <div
      role="img"
      aria-label={alt}
      className={`relative flex w-full items-center justify-center overflow-hidden rounded-[12px] border border-border/40 bg-surface text-muted transition-colors select-none ${aspectClass} ${className}`}
    >
      {icon ? (
        <span className="text-3xl">{icon}</span>
      ) : (
        <svg
          className="h-10 w-10 text-border"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
      )}
    </div>
  );
}
