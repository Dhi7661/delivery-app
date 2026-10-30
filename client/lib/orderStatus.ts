export type OrderStatus =
  | 'PLACED'
  | 'PAYMENT_PENDING'
  | 'PAYMENT_FAILED'
  | 'CONFIRMED'
  | 'SENT_TO_SHOP'
  | 'PACKED'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'FAILED_DELIVERY'
  | 'CANCELLED'
  | 'RETURNED'
  | 'CLOSED';

export const ALLOWED_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  PLACED: ['PAYMENT_PENDING', 'CONFIRMED'],
  PAYMENT_PENDING: ['CONFIRMED', 'PAYMENT_FAILED'],
  PAYMENT_FAILED: ['PLACED', 'CANCELLED'],
  CONFIRMED: ['SENT_TO_SHOP', 'CANCELLED'],
  SENT_TO_SHOP: ['PACKED', 'CANCELLED'],
  PACKED: ['OUT_FOR_DELIVERY'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'FAILED_DELIVERY'],
  FAILED_DELIVERY: ['OUT_FOR_DELIVERY', 'CANCELLED'],
  DELIVERED: ['RETURNED'],
  CANCELLED: [],
  RETURNED: [],
  CLOSED: [],
} as const;

export function isValidStatusTransition(from: OrderStatus, to: OrderStatus): boolean {
  if (from === to) return false;
  const allowed = ALLOWED_TRANSITIONS[from];
  return Array.isArray(allowed) && allowed.includes(to);
}

export function getNextAllowedStatuses(status: OrderStatus): OrderStatus[] {
  const allowed = ALLOWED_TRANSITIONS[status];
  return allowed ? [...allowed] : [];
}

export function isFinalStatus(status: OrderStatus): boolean {
  return ALLOWED_TRANSITIONS[status]?.length === 0;
}

// Human-readable labels for customer and admin presentation
export const STATUS_LABELS: Record<OrderStatus, string> = {
  PLACED: 'Placed',
  PAYMENT_PENDING: 'Payment Pending',
  PAYMENT_FAILED: 'Payment Failed',
  CONFIRMED: 'Confirmed',
  SENT_TO_SHOP: 'Packing',
  PACKED: 'Packing',
  OUT_FOR_DELIVERY: 'On the way',
  DELIVERED: 'Delivered',
  FAILED_DELIVERY: 'Delivery Failed',
  CANCELLED: 'Cancelled',
  RETURNED: 'Returned',
  CLOSED: 'Closed',
};

export type BadgeVariant = 'saffron' | 'neutral' | 'primary';

// Badge variants per Warm Saffron specification:
// - saffron: active live/payment stages (OUT_FOR_DELIVERY, PAYMENT_PENDING)
// - primary: confirmed/packing preparation stages (CONFIRMED, SENT_TO_SHOP, PACKED, PLACED)
// - neutral: final/terminal stages (DELIVERED, CANCELLED, RETURNED, CLOSED, PAYMENT_FAILED, FAILED_DELIVERY)
export const STATUS_BADGE_VARIANTS: Record<OrderStatus, BadgeVariant> = {
  PLACED: 'primary',
  PAYMENT_PENDING: 'saffron',
  PAYMENT_FAILED: 'neutral',
  CONFIRMED: 'primary',
  SENT_TO_SHOP: 'primary',
  PACKED: 'primary',
  OUT_FOR_DELIVERY: 'saffron',
  DELIVERED: 'neutral',
  FAILED_DELIVERY: 'neutral',
  CANCELLED: 'neutral',
  RETURNED: 'neutral',
  CLOSED: 'neutral',
};

/**
 * Maps any raw status code to its human-readable label and Warm Saffron Badge variant.
 * Guarantees that raw status codes like PAYMENT_FAILED or OUT_FOR_DELIVERY are never rendered directly to users.
 */
export function getOrderStatusDisplay(status: string): { label: string; variant: BadgeVariant } {
  const s = status as OrderStatus;
  const label = STATUS_LABELS[s] || status.replace(/_/g, ' ');
  const variant = STATUS_BADGE_VARIANTS[s] || 'neutral';
  return { label, variant };
}

export const STATUS_ACTION_LABELS: Record<OrderStatus, string> = {
  PLACED: 'Return to Placed',
  PAYMENT_PENDING: 'Mark Payment Pending',
  PAYMENT_FAILED: 'Mark Payment Failed',
  CONFIRMED: 'Confirm Order',
  SENT_TO_SHOP: 'Send to Shop',
  PACKED: 'Mark as Packed',
  OUT_FOR_DELIVERY: 'Out for Delivery',
  DELIVERED: 'Mark Delivered',
  FAILED_DELIVERY: 'Delivery Failed',
  CANCELLED: 'Cancel Order',
  RETURNED: 'Mark Returned',
  CLOSED: 'Close Order',
};

// Pure Warm Saffron token classes for admin/order status color styling (zero palette classes)
export const STATUS_COLORS: Record<OrderStatus, { bg: string; text: string; border: string; badge: string }> = {
  PLACED: { bg: 'bg-surface', text: 'text-heading', border: 'border-border', badge: 'bg-chip text-primary border border-border/60' },
  PAYMENT_PENDING: { bg: 'bg-saffron/15', text: 'text-on-saffron', border: 'border-saffron/30', badge: 'bg-saffron text-on-saffron' },
  PAYMENT_FAILED: { bg: 'bg-surface', text: 'text-muted', border: 'border-border', badge: 'bg-surface text-muted border border-border/60' },
  CONFIRMED: { bg: 'bg-chip', text: 'text-primary', border: 'border-border', badge: 'bg-chip text-primary border border-border/60' },
  SENT_TO_SHOP: { bg: 'bg-chip', text: 'text-primary', border: 'border-border', badge: 'bg-chip text-primary border border-border/60' },
  PACKED: { bg: 'bg-chip', text: 'text-primary', border: 'border-border', badge: 'bg-chip text-primary border border-border/60' },
  OUT_FOR_DELIVERY: { bg: 'bg-saffron/15', text: 'text-on-saffron', border: 'border-saffron/30', badge: 'bg-saffron text-on-saffron' },
  DELIVERED: { bg: 'bg-surface', text: 'text-muted', border: 'border-border', badge: 'bg-surface text-muted border border-border/60' },
  FAILED_DELIVERY: { bg: 'bg-surface', text: 'text-muted', border: 'border-border', badge: 'bg-surface text-muted border border-border/60' },
  CANCELLED: { bg: 'bg-surface', text: 'text-muted', border: 'border-border', badge: 'bg-surface text-muted border border-border/60' },
  RETURNED: { bg: 'bg-surface', text: 'text-muted', border: 'border-border', badge: 'bg-surface text-muted border border-border/60' },
  CLOSED: { bg: 'bg-surface', text: 'text-muted', border: 'border-border', badge: 'bg-surface text-muted border border-border/60' },
};
