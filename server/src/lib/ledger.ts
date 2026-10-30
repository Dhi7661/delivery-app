import { prisma } from './db.js';

/**
 * 1. Automatically records SALE ledger entries for a DELIVERED order (F23).
 * Only DELIVERED orders create sales. Cancelled orders create nothing.
 */
export async function recordOrderDeliveredLedger(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });

  if (!order || order.status !== 'DELIVERED') {
    return;
  }

  for (const item of order.items) {
    // Idempotency check: Ensure sale credit is never duplicated for the same order item
    const existing = await prisma.shopLedger.findFirst({
      where: {
        order_item_id: item.id,
        entry_type: 'SALE',
      },
    });

    if (!existing) {
      const saleAmountPaise = item.shop_price_paise * item.qty;
      await prisma.shopLedger.create({
        data: {
          shop_id: item.shop_id,
          order_item_id: item.id,
          amount_paise: saleAmountPaise,
          entry_type: 'SALE',
          notes: `Sale credit for item on order #${order.order_no}`,
        },
      });
    }
  }
}

/**
 * 2. Computes unbilled ledger balance for a shop (entries where payout_id is null).
 */
export async function getShopUnbilledBalance(shopId: string, beforeDate?: Date) {
  const whereClause: any = {
    shop_id: shopId,
    payout_id: null,
  };
  if (beforeDate) {
    whereClause.created_at = { lte: beforeDate };
  }

  const entries = await prisma.shopLedger.findMany({
    where: whereClause,
    include: {
      order_item: {
        include: {
          product: { select: { name: true, unit_size: true } },
          order: { select: { order_no: true, created_at: true } },
        },
      },
    },
    orderBy: { created_at: 'asc' },
  });

  let grossSalesPaise = 0;
  let deductionsPaise = 0;
  let adjustmentsPaise = 0;

  for (const entry of entries) {
    if (entry.entry_type === 'SALE') {
      grossSalesPaise += entry.amount_paise;
    } else if (entry.entry_type === 'RETURN_DEDUCTION') {
      deductionsPaise += entry.amount_paise;
    } else if (entry.entry_type === 'ADJUSTMENT') {
      adjustmentsPaise += entry.amount_paise;
    }
  }

  const netPayablePaise = grossSalesPaise - deductionsPaise + adjustmentsPaise;

  return {
    entries,
    grossSalesPaise,
    deductionsPaise,
    adjustmentsPaise,
    netPayablePaise,
    count: entries.length,
  };
}

/**
 * 3. Generates a 15-day payout run for a shop, locking all matching ledger entries.
 */
export async function generate15DayPayout(params: {
  shopId: string;
  periodStart: Date;
  periodEnd: Date;
  adminId?: string;
  adminEmail?: string;
}) {
  const { shopId, periodStart, periodEnd, adminId, adminEmail } = params;

  // Verify shop exists
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    include: { bank_ref: true },
  });
  if (!shop) throw new Error('Shop not found');

  // Prevent overlapping payouts for the same period
  const existingPayout = await prisma.payout.findFirst({
    where: {
      shop_id: shopId,
      period_start: { lte: periodEnd },
      period_end: { gte: periodStart },
      status: { not: 'CANCELLED' },
    },
  });
  if (existingPayout) {
    throw new Error(
      `A payout period already exists for this shop between ${periodStart.toISOString().split('T')[0]} and ${periodEnd.toISOString().split('T')[0]}`
    );
  }

  // Find all unbilled ledger entries up to periodEnd
  const unbilled = await prisma.shopLedger.findMany({
    where: {
      shop_id: shopId,
      payout_id: null,
      created_at: {
        gte: periodStart,
        lte: periodEnd,
      },
    },
  });

  if (unbilled.length === 0) {
    throw new Error('No unbilled ledger entries found for this shop in the specified period.');
  }

  let grossSalesPaise = 0;
  let deductionsPaise = 0;

  for (const e of unbilled) {
    if (e.entry_type === 'SALE') {
      grossSalesPaise += e.amount_paise;
    } else if (e.entry_type === 'RETURN_DEDUCTION') {
      deductionsPaise += e.amount_paise;
    } else if (e.entry_type === 'ADJUSTMENT') {
      if (e.amount_paise >= 0) {
        grossSalesPaise += e.amount_paise;
      } else {
        deductionsPaise += Math.abs(e.amount_paise);
      }
    }
  }

  const netAmountPaise = grossSalesPaise - deductionsPaise;

  // Atomic transaction: Create Payout and link ledger entries
  return await prisma.$transaction(async (tx) => {
    const payout = await tx.payout.create({
      data: {
        shop_id: shopId,
        period_start: periodStart,
        period_end: periodEnd,
        gross_sales_paise: grossSalesPaise,
        deductions_paise: deductionsPaise,
        amount_paise: netAmountPaise,
        status: 'SCHEDULED',
      },
    });

    // Link all ledger entries to this payout
    await tx.shopLedger.updateMany({
      where: {
        id: { in: unbilled.map((e) => e.id) },
      },
      data: {
        payout_id: payout.id,
      },
    });

    // Record audit log
    await tx.auditLog.create({
      data: {
        actor_id: adminId || 'admin',
        action: 'PAYOUT_GENERATED',
        entity: 'payout',
        entity_id: payout.id,
        new_value: {
          shopId,
          shopName: shop.name,
          periodStart,
          periodEnd,
          grossSalesPaise,
          deductionsPaise,
          amountPaise: netAmountPaise,
          entriesCount: unbilled.length,
          generatedBy: adminEmail || 'admin',
        },
      },
    });

    return payout;
  });
}

/**
 * 4. Records bank transfer for a payout and locks the period permanently (F23 Rule: locked period cannot change).
 */
export async function recordPayoutTransfer(params: {
  payoutId: string;
  bankReference: string;
  paidAt?: Date;
  adminId?: string;
}) {
  const { payoutId, bankReference, paidAt, adminId } = params;

  if (!bankReference || bankReference.trim().length < 4) {
    throw new Error('Valid bank transfer reference (UTR / IMPS / NEFT) is required.');
  }

  const payout = await prisma.payout.findUnique({
    where: { id: payoutId },
    include: { shop: true },
  });

  if (!payout) {
    throw new Error('Payout not found.');
  }

  if (payout.status === 'PAID') {
    throw new Error('This payout period has already been paid and locked.');
  }

  const transferDate = paidAt || new Date();

  const updated = await prisma.payout.update({
    where: { id: payoutId },
    data: {
      status: 'PAID',
      bank_reference: bankReference.trim(),
      paid_at: transferDate,
    },
  });

  await prisma.auditLog.create({
    data: {
      actor_id: adminId || 'admin',
      action: 'PAYOUT_MARKED_PAID',
      entity: 'payout',
      entity_id: payout.id,
      new_value: {
        shopName: payout.shop.name,
        amountPaise: payout.amount_paise,
        bankReference: bankReference.trim(),
        paidAt: transferDate,
      },
    },
  });

  return updated;
}

/**
 * 5. Creates a manual adjustment entry.
 * Per F23: Corrections to past locked periods are created as new adjustment entries.
 */
export async function createShopAdjustment(params: {
  shopId: string;
  amountPaise: number;
  notes: string;
  adminId?: string;
}) {
  const { shopId, amountPaise, notes, adminId } = params;

  if (!notes || notes.trim().length < 4) {
    throw new Error('Adjustment reason/note is required (minimum 4 characters).');
  }

  const shop = await prisma.shop.findUnique({ where: { id: shopId } });
  if (!shop) throw new Error('Shop not found.');

  const entry = await prisma.shopLedger.create({
    data: {
      shop_id: shopId,
      amount_paise: amountPaise,
      entry_type: 'ADJUSTMENT',
      notes: notes.trim(),
    },
  });

  await prisma.auditLog.create({
    data: {
      actor_id: adminId || 'admin',
      action: 'SHOP_LEDGER_ADJUSTMENT',
      entity: 'shop_ledger',
      entity_id: entry.id,
      new_value: { shopId, amountPaise, notes: notes.trim() },
    },
  });

  return entry;
}

/**
 * 6. Retrieves full payout statement data for a given payout.
 */
export async function getPayoutStatementData(payoutId: string) {
  const payout = await prisma.payout.findUnique({
    where: { id: payoutId },
    include: {
      shop: {
        include: { bank_ref: true },
      },
      ledger_entries: {
        include: {
          order_item: {
            include: {
              product: { select: { name: true, unit_size: true } },
              order: { select: { order_no: true, created_at: true } },
            },
          },
        },
        orderBy: { created_at: 'asc' },
      },
    },
  });

  if (!payout) throw new Error('Payout not found.');

  const salesEntries = payout.ledger_entries.filter((e) => e.entry_type === 'SALE');
  const returnEntries = payout.ledger_entries.filter((e) => e.entry_type === 'RETURN_DEDUCTION');
  const adjustmentEntries = payout.ledger_entries.filter((e) => e.entry_type === 'ADJUSTMENT');

  return {
    payout,
    shop: payout.shop,
    bankRef: payout.shop.bank_ref,
    salesEntries,
    returnEntries,
    adjustmentEntries,
    summary: {
      grossSalesPaise: payout.gross_sales_paise,
      deductionsPaise: payout.deductions_paise,
      netAmountPaise: payout.amount_paise,
      status: payout.status,
      bankReference: payout.bank_reference,
      paidAt: payout.paid_at,
    },
  };
}
