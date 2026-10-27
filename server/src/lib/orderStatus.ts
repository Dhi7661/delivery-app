import { OrderStatus } from '@prisma/client';

/**
 * F12: Admin Order Board and Status Rules
 * State Machine definition for Order Status Transitions
 *
 * Allowed transitions only:
 * - PLACED → PAYMENT_PENDING, CONFIRMED
 * - PAYMENT_PENDING → CONFIRMED, PAYMENT_FAILED
 * - PAYMENT_FAILED → PLACED, CANCELLED
 * - CONFIRMED → SENT_TO_SHOP, CANCELLED
 * - SENT_TO_SHOP → PACKED, CANCELLED
 * - PACKED → OUT_FOR_DELIVERY
 * - OUT_FOR_DELIVERY → DELIVERED, FAILED_DELIVERY
 * - FAILED_DELIVERY → OUT_FOR_DELIVERY, CANCELLED
 * - DELIVERED → RETURNED
 * - CANCELLED and RETURNED are final.
 */
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

/**
 * Returns whether a transition from one status to another is permitted by the state machine.
 */
export function isValidStatusTransition(from: OrderStatus, to: OrderStatus): boolean {
  if (from === to) return false;
  const allowed = ALLOWED_TRANSITIONS[from];
  return Array.isArray(allowed) && allowed.includes(to);
}

/**
 * Returns the list of next allowed statuses for a given status.
 */
export function getNextAllowedStatuses(status: OrderStatus): OrderStatus[] {
  const allowed = ALLOWED_TRANSITIONS[status];
  return allowed ? [...allowed] : [];
}

/**
 * Checks whether an order status is terminal/final.
 */
export function isFinalStatus(status: OrderStatus): boolean {
  return ALLOWED_TRANSITIONS[status]?.length === 0;
}

/**
 * Whether cancelling from the given status requires an explicit cancellation reason.
 * (e.g. FAILED_DELIVERY or after packing)
 */
export function requiresCancellationReason(from: OrderStatus, to: OrderStatus): boolean {
  return to === 'CANCELLED' && (from === 'FAILED_DELIVERY' || from === 'PACKED' || from === 'OUT_FOR_DELIVERY');
}

/**
 * User-friendly display label for each status.
 */
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

/**
 * Action button label for transitioning to the target status.
 */
export const STATUS_ACTION_LABELS: Record<OrderStatus, string> = {
  PLACED: 'Return to Placed',
  PAYMENT_PENDING: 'Mark Payment Pending',
  PAYMENT_FAILED: 'Mark Payment Failed',
  CONFIRMED: 'Confirm Order',
  SENT_TO_SHOP: 'Send to Shop',
  PACKED: 'Mark as Packed',
  OUT_FOR_DELIVERY: 'Dispatch Out for Delivery',
  DELIVERED: 'Mark as Delivered',
  FAILED_DELIVERY: 'Mark Delivery Failed',
  CANCELLED: 'Cancel Order',
  RETURNED: 'Mark as Returned',
  CLOSED: 'Close Order',
};
