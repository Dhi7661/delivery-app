'use client';

import React from 'react';

export interface StatusTimelineProps {
  currentStatus: string;
  createdAt?: string;
  className?: string;
}

interface Step {
  id: string;
  label: string;
  matches: string[];
}

const STEPS: Step[] = [
  { id: 'confirmed', label: 'Confirmed', matches: ['CONFIRMED'] },
  { id: 'packing', label: 'Packing', matches: ['SENT_TO_SHOP', 'PACKED'] },
  { id: 'on_the_way', label: 'On the way', matches: ['OUT_FOR_DELIVERY'] },
  { id: 'delivered', label: 'Delivered', matches: ['DELIVERED'] },
];

export default function StatusTimeline({
  currentStatus,
  className = '',
}: StatusTimelineProps) {
  // Determine current active step index (0-based)
  let activeStepIndex = 0;
  if (currentStatus === 'CONFIRMED' || currentStatus === 'PAYMENT_PENDING') {
    activeStepIndex = 0;
  } else if (currentStatus === 'SENT_TO_SHOP' || currentStatus === 'PACKED') {
    activeStepIndex = 1;
  } else if (currentStatus === 'OUT_FOR_DELIVERY') {
    activeStepIndex = 2;
  } else if (currentStatus === 'DELIVERED') {
    activeStepIndex = 3;
  } else if (currentStatus === 'CANCELLED' || currentStatus === 'DELIVERY_FAILED') {
    activeStepIndex = -1; // special state
  }

  const isFailedOrCancelled = activeStepIndex === -1;

  if (isFailedOrCancelled) {
    return (
      <div className={`rounded-[16px] border border-border bg-surface p-4 text-center ${className}`}>
        <span className="inline-block rounded-full bg-primary px-3 py-1 text-xs font-bold text-background">
          {currentStatus === 'CANCELLED' ? 'Order Cancelled' : 'Delivery Failed'}
        </span>
      </div>
    );
  }

  return (
    <div className={`rounded-[16px] border border-border bg-card p-4 ${className}`}>
      <div className="flex items-center justify-between">
        {STEPS.map((step, index) => {
          const isDone = index < activeStepIndex;
          const isCurrent = index === activeStepIndex;
          const isPending = index > activeStepIndex;

          return (
            <React.Fragment key={step.id}>
              {/* Step indicator */}
              <div className="flex flex-col items-center text-center">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-extrabold transition-colors ${
                    isDone || isCurrent
                      ? 'bg-saffron text-on-saffron shadow-xs'
                      : 'bg-chip text-muted border border-border/60'
                  }`}
                >
                  {isDone ? (
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <span>{index + 1}</span>
                  )}
                </div>
                <span
                  className={`mt-1.5 text-[11px] font-bold leading-tight ${
                    isCurrent ? 'text-heading font-black' : isDone ? 'text-primary' : 'text-muted'
                  }`}
                >
                  {step.label}
                </span>
              </div>

              {/* Connecting line between steps */}
              {index < STEPS.length - 1 && (
                <div
                  className={`h-0.5 flex-1 mx-1.5 mb-4 rounded-full transition-colors ${
                    index < activeStepIndex ? 'bg-saffron' : 'bg-border/60'
                  }`}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
