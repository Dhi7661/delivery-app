import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { requireAdminAuth } from './admin.js';

export const operationsRouter = Router();

// Standard delivery champion cost per order: ₹40 (4,000 paise)
export const DEFAULT_DELIVERY_COST_PAISE = 4000;
// Target on-time delivery duration window: 45 minutes
export const ON_TIME_TARGET_MINUTES = 45;

/**
 * 1. GET /api/admin/operations/summary
 * Soft launch operational scorecard: completed orders, on-time rate, repeat customers, margin economics.
 */
operationsRouter.get('/admin/operations/summary', requireAdminAuth, async (_req: Request, res: Response) => {
  try {
    // 1. Fetch all non-cancelled orders with deliveries and items
    const [allOrders, deliveredOrders, refunds, returns, issues, totalCustomers] = await Promise.all([
      prisma.order.findMany({
        where: { status: { not: 'CANCELLED' } },
        select: { id: true, status: true, total_paise: true, user_id: true },
      }),
      prisma.order.findMany({
        where: { status: 'DELIVERED' },
        include: {
          items: true,
          delivery: true,
        },
        orderBy: { created_at: 'desc' },
      }),
      prisma.refund.findMany({
        select: { id: true, amount_paise: true },
      }),
      prisma.return.findMany({
        select: { id: true, shop_cost_paise: true },
      }),
      prisma.operationalIssue.findMany({
        select: { id: true, status: true, severity: true, category: true },
      }),
      prisma.user.count({
        where: { role: 'CUSTOMER' },
      }),
    ]);

    const completedCount = deliveredOrders.length;
    const targetOrders = 20;
    const maxTargetOrders = 50;
    const targetProgressPercent = Math.min(100, Math.round((completedCount / targetOrders) * 100));

    // 2. On-Time Delivery Rate Calculation
    let onTimeOrdersCount = 0;
    let totalDeliveryMinutes = 0;
    let ordersWithDeliveryTime = 0;

    for (const order of deliveredOrders) {
      if (order.delivery?.delivered_at) {
        const orderTime = new Date(order.created_at).getTime();
        const deliveryTime = new Date(order.delivery.delivered_at).getTime();
        const durationMinutes = Math.max(0, Math.round((deliveryTime - orderTime) / (60 * 1000)));

        totalDeliveryMinutes += durationMinutes;
        ordersWithDeliveryTime++;

        if (durationMinutes <= ON_TIME_TARGET_MINUTES) {
          onTimeOrdersCount++;
        }
      }
    }

    const onTimeRatePercent =
      completedCount > 0 ? Math.round((onTimeOrdersCount / completedCount) * 1000) / 10 : 100.0;
    const avgDeliveryMinutes =
      ordersWithDeliveryTime > 0 ? Math.round(totalDeliveryMinutes / ordersWithDeliveryTime) : 0;

    // 3. Repeat Customer Rate Calculation
    const customerOrderCounts = new Map<string, number>();
    for (const order of deliveredOrders) {
      if (order.user_id) {
        const current = customerOrderCounts.get(order.user_id) || 0;
        customerOrderCounts.set(order.user_id, current + 1);
      }
    }

    const uniqueDeliveredCustomers = customerOrderCounts.size;
    let repeatCustomersCount = 0;
    for (const count of customerOrderCounts.values()) {
      if (count >= 2) {
        repeatCustomersCount++;
      }
    }

    const repeatCustomerRatePercent =
      uniqueDeliveredCustomers > 0
        ? Math.round((repeatCustomersCount / uniqueDeliveredCustomers) * 1000) / 10
        : 0.0;

    // 4. Unit Economics & Gross Margin Calculation
    // Margin = (Customer Selling Price - Shop Price) + Delivery Fee Collected - Delivery Driver Cost
    let totalSellingPricePaise = 0;
    let totalShopPricePaise = 0;
    let totalDeliveryFeePaise = 0;

    for (const order of deliveredOrders) {
      totalDeliveryFeePaise += order.delivery_fee_paise;
      for (const item of order.items) {
        totalSellingPricePaise += item.line_total_paise;
        totalShopPricePaise += item.shop_price_paise * item.qty;
      }
    }

    const totalDeliveryCostPaise = completedCount * DEFAULT_DELIVERY_COST_PAISE;
    const retailMarkUpPaise = totalSellingPricePaise - totalShopPricePaise;
    const grossMarginPaise = retailMarkUpPaise + totalDeliveryFeePaise - totalDeliveryCostPaise;
    const avgMarginPerOrderPaise = completedCount > 0 ? Math.round(grossMarginPaise / completedCount) : 0;

    // 5. Refunds & Returns
    const totalRefundsPaise = refunds.reduce((sum, r) => sum + r.amount_paise, 0);
    const refundsCount = refunds.length;
    const returnsCount = returns.length;

    // 6. Issues Overview
    const totalIssuesCount = issues.length;
    const openIssuesCount = issues.filter((i) => i.status !== 'RESOLVED').length;
    const resolvedIssuesCount = issues.filter((i) => i.status === 'RESOLVED').length;

    res.status(200).json({
      targetProgress: {
        completed: completedCount,
        target: targetOrders,
        maxTarget: maxTargetOrders,
        percentage: targetProgressPercent,
        isTargetMet: completedCount >= targetOrders,
      },
      onTimeDelivery: {
        onTimeOrders: onTimeOrdersCount,
        totalDelivered: completedCount,
        onTimeRatePercent,
        targetMinutes: ON_TIME_TARGET_MINUTES,
        avgDeliveryMinutes,
      },
      repeatCustomers: {
        uniqueCustomers: uniqueDeliveredCustomers,
        repeatCustomers: repeatCustomersCount,
        repeatCustomerRatePercent,
        totalRegisteredCustomers: totalCustomers,
      },
      unitEconomics: {
        totalSellingPricePaise,
        totalShopPricePaise,
        retailMarkUpPaise,
        totalDeliveryFeePaise,
        totalDeliveryCostPaise,
        grossMarginPaise,
        avgMarginPerOrderPaise,
        deliveryCostPerOrderPaise: DEFAULT_DELIVERY_COST_PAISE,
      },
      refundsAndReturns: {
        refundsCount,
        totalRefundsPaise,
        returnsCount,
      },
      issues: {
        total: totalIssuesCount,
        open: openIssuesCount,
        resolved: resolvedIssuesCount,
      },
    });
  } catch (error: any) {
    console.error('[Operations] Failed to get operations summary:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch operations summary' });
  }
});

/**
 * 2. GET /api/admin/operations/cash-reconciliation
 * Daily Cash on Delivery (COD) reconciliation list per rider and date.
 */
operationsRouter.get('/admin/operations/cash-reconciliation', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const targetDate = typeof req.query.date === 'string' ? req.query.date : undefined;

    // Fetch COD deliveries that are marked DELIVERED
    const codDeliveries = await prisma.delivery.findMany({
      where: {
        order: {
          payment_method: 'COD',
          status: 'DELIVERED',
        },
      },
      include: {
        order: {
          select: {
            order_no: true,
            total_paise: true,
            created_at: true,
          },
        },
      },
      orderBy: { delivered_at: 'desc' },
    });

    // Group deliveries by YYYY-MM-DD and rider name
    const grouped = new Map<string, {
      date: string;
      riderName: string;
      ordersCount: number;
      expectedCashPaise: number;
      orderNumbers: string[];
    }>();

    for (const d of codDeliveries) {
      const dateStr = d.delivered_at
        ? new Date(d.delivered_at).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0];

      if (targetDate && dateStr !== targetDate) continue;

      const rider = d.assigned_to?.trim() || 'Unassigned Rider';
      const key = `${dateStr}__${rider}`;

      const existing = grouped.get(key) || {
        date: dateStr,
        riderName: rider,
        ordersCount: 0,
        expectedCashPaise: 0,
        orderNumbers: [],
      };

      existing.ordersCount++;
      existing.expectedCashPaise += d.order.total_paise;
      existing.orderNumbers.push(d.order.order_no);
      grouped.set(key, existing);
    }

    // Fetch existing reconciliation records
    const storedReconciliations = await prisma.cashReconciliation.findMany({
      orderBy: { date: 'desc' },
    });

    const storedMap = new Map<string, any>();
    for (const rec of storedReconciliations) {
      storedMap.set(`${rec.date}__${rec.rider_name}`, rec);
    }

    // Combine into unified response
    const results = Array.from(grouped.values()).map((g) => {
      const rec = storedMap.get(`${g.date}__${g.riderName}`);
      const collected = rec ? rec.collected_cash_paise : g.expectedCashPaise; // Defaults to expected if recorded
      const variance = rec ? rec.variance_paise : 0;
      const status = rec ? rec.status : 'PENDING_CONFIRMATION';

      return {
        id: rec?.id || null,
        date: g.date,
        riderName: g.riderName,
        ordersCount: g.ordersCount,
        expectedCashPaise: g.expectedCashPaise,
        collectedCashPaise: collected,
        variancePaise: variance,
        status: rec ? rec.status : (g.expectedCashPaise === 0 ? 'BALANCED' : 'PENDING'),
        notes: rec?.notes || null,
        reconciledBy: rec?.reconciled_by || null,
        orderNumbers: g.orderNumbers,
      };
    });

    // Also include recorded reconciliations that had 0 orders on that day
    for (const rec of storedReconciliations) {
      const key = `${rec.date}__${rec.rider_name}`;
      if (!grouped.has(key)) {
        results.push({
          id: rec.id,
          date: rec.date,
          riderName: rec.rider_name,
          ordersCount: rec.orders_count,
          expectedCashPaise: rec.expected_cash_paise,
          collectedCashPaise: rec.collected_cash_paise,
          variancePaise: rec.variance_paise,
          status: rec.status,
          notes: rec.notes,
          reconciledBy: rec.reconciled_by,
          orderNumbers: [],
        });
      }
    }

    results.sort((a, b) => b.date.localeCompare(a.date));

    res.status(200).json({ reconciliations: results });
  } catch (error: any) {
    console.error('[Operations] Failed to get cash reconciliation:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch cash reconciliation' });
  }
});

const ReconcileSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  riderName: z.string().min(1, 'Rider name is required'),
  collectedCashPaise: z.number().int().min(0, 'Collected cash must be non-negative integer'),
  notes: z.string().optional(),
});

/**
 * 3. POST /api/admin/operations/cash-reconciliation
 * Submit or confirm daily cash reconciliation for a rider.
 */
operationsRouter.post('/admin/operations/cash-reconciliation', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const parseResult = ReconcileSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: parseResult.error.errors[0]?.message });
    }

    const { date, riderName, collectedCashPaise, notes } = parseResult.data;
    const adminUser = (req as any).adminUser;

    // Calculate expected cash from database
    const codDeliveries = await prisma.delivery.findMany({
      where: {
        assigned_to: riderName,
        order: {
          payment_method: 'COD',
          status: 'DELIVERED',
        },
      },
      include: {
        order: { select: { total_paise: true, created_at: true } },
      },
    });

    const matchingDeliveries = codDeliveries.filter((d) => {
      const dDate = d.delivered_at
        ? new Date(d.delivered_at).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0];
      return dDate === date;
    });

    const ordersCount = matchingDeliveries.length;
    const expectedCashPaise = matchingDeliveries.reduce((sum, d) => sum + d.order.total_paise, 0);
    const variancePaise = collectedCashPaise - expectedCashPaise;
    const status = variancePaise === 0 ? 'BALANCED' : (variancePaise < 0 ? 'SHORTAGE' : 'SURPLUS');

    const record = await prisma.cashReconciliation.upsert({
      where: {
        date_rider_name: {
          date,
          rider_name: riderName,
        },
      },
      update: {
        orders_count: ordersCount,
        expected_cash_paise: expectedCashPaise,
        collected_cash_paise: collectedCashPaise,
        variance_paise: variancePaise,
        status,
        notes: notes || undefined,
        reconciled_by: adminUser?.email || 'admin',
      },
      create: {
        date,
        rider_name: riderName,
        orders_count: ordersCount,
        expected_cash_paise: expectedCashPaise,
        collected_cash_paise: collectedCashPaise,
        variance_paise: variancePaise,
        status,
        notes: notes || undefined,
        reconciled_by: adminUser?.email || 'admin',
      },
    });

    // Record audit log
    await prisma.auditLog.create({
      data: {
        actor_id: adminUser?.id || 'admin',
        action: 'CASH_RECONCILIATION_SUBMIT',
        entity: 'cash_reconciliation',
        entity_id: record.id,
        new_value: {
          date,
          riderName,
          ordersCount,
          expectedCashPaise,
          collectedCashPaise,
          variancePaise,
          status,
        },
      },
    });

    res.status(200).json({
      success: true,
      reconciliation: record,
      message: `Cash reconciliation for ${riderName} on ${date} saved as ${status}.`,
    });
  } catch (error: any) {
    console.error('[Operations] Failed to submit cash reconciliation:', error);
    res.status(500).json({ error: error.message || 'Failed to submit cash reconciliation' });
  }
});

/**
 * 4. GET /api/admin/operations/issues
 * List operational issues with optional filtering by status, category, or severity.
 */
operationsRouter.get('/admin/operations/issues', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { status, category, severity } = req.query;

    const where: any = {};
    if (typeof status === 'string' && status !== 'ALL') {
      where.status = status;
    }
    if (typeof category === 'string' && category !== 'ALL') {
      where.category = category;
    }
    if (typeof severity === 'string' && severity !== 'ALL') {
      where.severity = severity;
    }

    const issues = await prisma.operationalIssue.findMany({
      where,
      include: {
        shop: { select: { id: true, name: true } },
        order: { select: { id: true, order_no: true, total_paise: true, status: true } },
      },
      orderBy: [{ status: 'asc' }, { created_at: 'desc' }],
    });

    res.status(200).json({ issues });
  } catch (error: any) {
    console.error('[Operations] Failed to get operational issues:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch operational issues' });
  }
});

const CreateIssueSchema = z.object({
  orderNo: z.string().optional(),
  shopId: z.string().optional(),
  category: z.enum([
    'LATE_DELIVERY',
    'WRONG_ITEM',
    'REFUSED_ORDER',
    'DAMAGED_ITEM',
    'REFUND_DISPUTE',
    'OTHER',
  ]),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
  description: z.string().min(5, 'Description must be at least 5 characters'),
  reportedBy: z.string().default('ADMIN'),
});

/**
 * 5. POST /api/admin/operations/issues
 * Log a new operational issue.
 */
operationsRouter.post('/admin/operations/issues', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const parseResult = CreateIssueSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: parseResult.error.errors[0]?.message });
    }

    const { orderNo, shopId, category, severity, description, reportedBy } = parseResult.data;
    const adminUser = (req as any).adminUser;

    let orderId: string | undefined = undefined;
    if (orderNo) {
      const order = await prisma.order.findUnique({
        where: { order_no: orderNo.trim() },
        select: { id: true },
      });
      if (order) {
        orderId = order.id;
      }
    }

    const issue = await prisma.operationalIssue.create({
      data: {
        order_id: orderId,
        order_no: orderNo ? orderNo.trim() : undefined,
        shop_id: shopId || undefined,
        category,
        severity,
        status: 'OPEN',
        description: description.trim(),
        reported_by: reportedBy || 'ADMIN',
      },
    });

    await prisma.auditLog.create({
      data: {
        actor_id: adminUser?.id || 'admin',
        action: 'OPERATIONAL_ISSUE_CREATED',
        entity: 'operational_issue',
        entity_id: issue.id,
        new_value: { category, severity, orderNo, description },
      },
    });

    res.status(201).json({
      success: true,
      issue,
      message: 'Operational issue logged successfully.',
    });
  } catch (error: any) {
    console.error('[Operations] Failed to create operational issue:', error);
    res.status(500).json({ error: error.message || 'Failed to create operational issue' });
  }
});

const UpdateIssueSchema = z.object({
  status: z.enum(['OPEN', 'INVESTIGATING', 'RESOLVED']).optional(),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  rootCause: z.string().optional(),
  resolutionNotes: z.string().optional(),
});

/**
 * 6. PATCH /api/admin/operations/issues/:id
 * Update status, root cause, or resolution notes of an operational issue.
 */
operationsRouter.patch('/admin/operations/issues/:id', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const parseResult = UpdateIssueSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: parseResult.error.errors[0]?.message });
    }

    const { status, severity, rootCause, resolutionNotes } = parseResult.data;
    const adminUser = (req as any).adminUser;

    const existing = await prisma.operationalIssue.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Operational issue not found.' });
    }

    const updateData: any = {};
    if (status) {
      updateData.status = status;
      if (status === 'RESOLVED') {
        updateData.resolved_at = new Date();
      }
    }
    if (severity) updateData.severity = severity;
    if (rootCause !== undefined) updateData.root_cause = rootCause.trim();
    if (resolutionNotes !== undefined) updateData.resolution_notes = resolutionNotes.trim();

    const updated = await prisma.operationalIssue.update({
      where: { id },
      data: updateData,
    });

    await prisma.auditLog.create({
      data: {
        actor_id: adminUser?.id || 'admin',
        action: 'OPERATIONAL_ISSUE_UPDATED',
        entity: 'operational_issue',
        entity_id: id,
        old_value: { status: existing.status, severity: existing.severity },
        new_value: updateData,
      },
    });

    res.status(200).json({
      success: true,
      issue: updated,
      message: 'Operational issue updated successfully.',
    });
  } catch (error: any) {
    console.error('[Operations] Failed to update operational issue:', error);
    res.status(500).json({ error: error.message || 'Failed to update operational issue' });
  }
});
