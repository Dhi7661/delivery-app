'use client';

import React from 'react';

export interface SegmentedTabsProps {
  tabs: string[];
  activeTab: string;
  onChange: (tab: string) => void;
  className?: string;
}

export default function SegmentedTabs({
  tabs,
  activeTab,
  onChange,
  className = '',
}: SegmentedTabsProps) {
  return (
    <div
      role="tablist"
      className={`flex items-center gap-1 rounded-[12px] border border-border bg-surface p-1 ${className}`}
    >
      {tabs.map((tab) => {
        const isActive = tab === activeTab;
        return (
          <button
            key={tab}
            role="tab"
            aria-selected={isActive}
            type="button"
            onClick={() => onChange(tab)}
            className={`flex min-h-[40px] flex-1 items-center justify-center rounded-[8px] px-3 text-xs transition-all ${
              isActive
                ? 'bg-card text-heading font-extrabold shadow-2xs'
                : 'text-muted hover:text-heading font-semibold'
            }`}
          >
            {tab}
          </button>
        );
      })}
    </div>
  );
}
