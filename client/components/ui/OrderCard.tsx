'use client';

import React from 'react';
import Link from 'next/link';
import Badge from './Badge';
import Button from './Button';
import ImagePlaceholder from './ImagePlaceholder';
import { formatPaise } from '@/lib/money';
import { getOrderStatusDisplay } from '@/lib/orderStatus';

export interface OrderCardItem {
  id: string;
  qty: number;
  selling_price_paise?: number;
  line_total_paise?: number;
  product?: {
    name: string;
    unit_size?: string;
  };
}

export interface OrderCardData {
  id: string;
  order_no: string;
  status: string;
  total_paise: number;
  created_at: string;
  items: OrderCardItem[];
}

const PAST_STATUSES = ['DELIVERED', 'FAILED_DELIVERY', 'CANCELLED', 'RETURNED', 'PAYMENT_FAILED', 'CLOSED'];

export default function OrderCard({ order }: { order: OrderCardData }) {
  const statusInfo = getOrderStatusDisplay(order.status);
  const isActive = !PAST_STATUSES.includes(order.status);

  const itemNames = order.items
    .map((i) => i.product?.name || 'Item')
    .slice(0, 3)
    .join(', ');

  const itemCountText = `${order.items.length} ${order.items.length === 1 ? 'item' : 'items'}`;

  return (
    <div className="rounded-[18px] border border-border bg-card p-4 shadow-2xs space-y-3">
      {/* 1. Order number with saffron dot for active orders, and human Status Badge */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-xs font-bold text-heading">
              Order #{order.order_no}
            </span>
            {isActive && (
              <span className="flex h-2 w-2 rounded-full bg-saffron" />
            )}
          </div>
          <span className="text-[11px] font-medium text-muted">
            {new Date(order.created_at).toLocaleDateString('en-IN', {
              day: 'numeric',
              month: 'short',
              hour: 'numeric',
              minute: '2-digit',
            })}
          </span>
        </div>
        <Badge variant={statusInfo.variant}>
          {statusInfo.label}
        </Badge>
      </div>

      {/* 2. Item preview: Image + Item name line + Item count line */}
      <div className="flex items-center gap-3">
        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-[12px] bg-surface border border-border/40">
          <ImagePlaceholder
            label={order.items[0]?.product?.name?.slice(0, 8) || 'Kirana'}
            aspectRatio="1:1"
            className="h-full w-full object-cover"
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-heading leading-tight truncate">
            {itemNames}
          </p>
          <p className="text-[11px] font-medium text-muted mt-0.5 truncate">
            {itemCountText}
          </p>
        </div>
      </div>

      {/* 3. Divider, Total Bill, and Solid Primary Track Order Button */}
      <div className="border-t border-border/40 pt-2.5 flex items-center justify-between">
        <div>
          <span className="text-[10px] font-bold uppercase text-muted block">
            Total Bill
          </span>
          <span className="text-sm font-black text-heading">
            {formatPaise(order.total_paise)}
          </span>
        </div>

        <Link href={`/orders/${order.order_no}`}>
          <Button
            variant="primary"
            size="sm"
            className="min-h-[44px] px-4 font-bold"
          >
            Track Order &rarr;
          </Button>
        </Link>
      </div>
    </div>
  );
}
