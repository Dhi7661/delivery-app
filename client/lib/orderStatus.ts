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

export const STATUS_LABELS: Record<OrderStatus, string> = {
  PLACED: 'Placed',
  PAYMENT_PENDING: 'Payment Pending',
  PAYMENT_FAILED: 'Payment Failed',
  CONFIRMED: 'Confirmed',
  SENT_TO_SHOP: 'Sent to Shop',
  PACKED: 'Packed',
  OUT_FOR_DELIVERY: 'Out for Delivery',
  DELIVERED: 'Delivered',
  FAILED_DELIVERY: 'Delivery Failed',
  CANCELLED: 'Cancelled',
  RETURNED: 'Returned',
  CLOSED: 'Closed',
};

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

export const STATUS_COLORS: Record<OrderStatus, { bg: string; text: string; border: string; badge: string }> = {
  PLACED: { bg: 'bg-blue-50', text: 'text-blue-800', border: 'border-blue-200', badge: 'bg-blue-100 text-blue-800' },
  PAYMENT_PENDING: { bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200', badge: 'bg-amber-100 text-amber-800' },
  PAYMENT_FAILED: { bg: 'bg-rose-50', text: 'text-rose-800', border: 'border-rose-200', badge: 'bg-rose-100 text-rose-800' },
  CONFIRMED: { bg: 'bg-indigo-50', text: 'text-indigo-800', border: 'border-indigo-200', badge: 'bg-indigo-100 text-indigo-800' },
  SENT_TO_SHOP: { bg: 'bg-purple-50', text: 'text-purple-800', border: 'border-purple-200', badge: 'bg-purple-100 text-purple-800' },
  PACKED: { bg: 'bg-cyan-50', text: 'text-cyan-800', border: 'border-cyan-200', badge: 'bg-cyan-100 text-cyan-800' },
  OUT_FOR_DELIVERY: { bg: 'bg-orange-50', text: 'text-orange-800', border: 'border-orange-200', badge: 'bg-orange-100 text-orange-800' },
  DELIVERED: { bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-200', badge: 'bg-emerald-100 text-emerald-800' },
  FAILED_DELIVERY: { bg: 'bg-red-50', text: 'text-red-800', border: 'border-red-200', badge: 'bg-red-100 text-red-800' },
  CANCELLED: { bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-300', badge: 'bg-slate-200 text-slate-700' },
  RETURNED: { bg: 'bg-zinc-100', text: 'text-zinc-700', border: 'border-zinc-300', badge: 'bg-zinc-200 text-zinc-700' },
  CLOSED: { bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-300', badge: 'bg-slate-200 text-slate-700' },
};
