import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { requireRiderAuth } from './riderAuth.js';
import { requireAdminAuth } from './admin.js';
import { maskPhone, sanitizeForLogging } from '../lib/sanitizer.js';

export const cashHandoverRouter = Router();

/**
 * GET /api/delivery/cash/summary
 * Spec Section 7.4: Rider sees today's total cash collected and outstanding handover.
 */
cashHandoverRouter.get('/delivery/cash/summary', requireRiderAuth, async (req: Request, res: Response) => {
  try {
    const rider = (req as any).rider;
    const todayStr = new Date().toISOString().split('T')[0];
    const startOfDay = new Date(`${todayStr}T00:00:00.000Z`);
    const endOfDay = new Date(`${todayStr}T23:59:59.999Z`);

    // Fetch today's delivered COD orders assigned to this rider
    const deliveredCodOrders = await prisma.order.findMany({
      where: {
        created_at: { gte: startOfDay, lte: endOfDay },
        status: 'DELIVERED',
        payment_method: 'COD',
        delivery: { assigned_to: rider.id },
      },
      include: { delivery: true },
    });

    const totalCollectedPaise = deliveredCodOrders.reduce((sum, ord) => {
      return sum + (ord.delivery?.cod_collected_paise || ord.total_paise);
    }, 0);

    // Fetch existing handovers for today
    const handovers = await prisma.cashHandover.findMany({
      where: {
        rider_id: rider.id,
        handover_date: todayStr,
      },
      orderBy: { created_at: 'desc' },
    });

    const confirmedHandoverPaise = handovers
      .filter((h) => h.admin_confirmed_at !== null)
      .reduce((sum, h) => sum + h.actual_amount_paise, 0);

    const pendingHandover = handovers.find(
      (h) => h.rider_confirmed_at !== null && h.admin_confirmed_at === null
    );

    const cashToHandOverPaise = Math.max(0, totalCollectedPaise - confirmedHandoverPaise);

    res.status(200).json({
      success: true,
      today: todayStr,
      rider: {
        id: rider.id,
        name: rider.name || 'Delivery Partner',
      },
      summary: {
        deliveredOrdersCount: deliveredCodOrders.length,
        totalCollectedPaise,
        confirmedHandoverPaise,
        cashToHandOverPaise,
        pendingHandover: pendingHandover
          ? {
              id: pendingHandover.id,
              actualAmountPaise: pendingHandover.actual_amount_paise,
              differenceNote: pendingHandover.difference_note,
              submittedAt: pendingHandover.rider_confirmed_at,
              status: 'PENDING_ADMIN_ACKNOWLEDGMENT',
            }
          : null,
      },
    });
  } catch (error: any) {
    console.error('Error fetching rider cash summary:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch cash summary' });
  }
});

const RiderHandoverSchema = z.object({
  actualAmountPaise: z.number().int().min(0, 'Handover amount must be non-negative'),
  differenceNote: z.string().trim().optional(),
});

/**
 * POST /api/delivery/cash/confirm
 * Spec Section 7.4: Rider submits daily cash handover.
 */
cashHandoverRouter.post('/delivery/cash/confirm', requireRiderAuth, async (req: Request, res: Response) => {
  try {
    const rider = (req as any).rider;
    const parseResult = RiderHandoverSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: parseResult.error.errors[0]?.message });
    }

    const { actualAmountPaise, differenceNote } = parseResult.data;
    const todayStr = new Date().toISOString().split('T')[0];
    const startOfDay = new Date(`${todayStr}T00:00:00.000Z`);
    const endOfDay = new Date(`${todayStr}T23:59:59.999Z`);

    // Recalculate expected COD cash for today assigned to this rider
    const deliveredCodOrders = await prisma.order.findMany({
      where: {
        created_at: { gte: startOfDay, lte: endOfDay },
        status: 'DELIVERED',
        payment_method: 'COD',
        delivery: { assigned_to: rider.id },
      },
      include: { delivery: true },
    });

    const expectedCashPaise = deliveredCodOrders.reduce((sum, ord) => {
      return sum + (ord.delivery?.cod_collected_paise || ord.total_paise);
    }, 0);

    const diffPaise = actualAmountPaise - expectedCashPaise;
    if (diffPaise !== 0 && (!differenceNote || differenceNote.length === 0)) {
      return res.status(400).json({
        error: `Handover amount differs from collected cash (₹${actualAmountPaise / 100} vs expected ₹${expectedCashPaise / 100}). A note explaining the difference is required.`,
      });
    }

    const handover = await prisma.cashHandover.create({
      data: {
        rider_id: rider.id,
        handover_date: todayStr,
        expected_amount_paise: expectedCashPaise,
        actual_amount_paise: actualAmountPaise,
        difference_note: differenceNote || null,
        rider_confirmed_at: new Date(),
      },
    });

    // Write audit log
    await prisma.auditLog.create({
      data: {
        actor_id: rider.id,
        action: 'RIDER_CASH_HANDOVER_SUBMITTED',
        entity: 'cash_handovers',
        entity_id: handover.id,
        new_value: sanitizeForLogging({
          handover_date: todayStr,
          expected_amount_paise: expectedCashPaise,
          actual_amount_paise: actualAmountPaise,
          difference_note: differenceNote || null,
        }),
      },
    });

    res.status(200).json({
      success: true,
      message: 'Cash handover submitted successfully. Awaiting admin acknowledgment.',
      handover,
    });
  } catch (error: any) {
    console.error('Rider handover confirm error:', error);
    res.status(500).json({ error: error.message || 'Failed to submit cash handover' });
  }
});

/**
 * GET /api/admin/cash-handovers
 * Spec Section 7.4 & 8.1: Admin view of daily cash handovers.
 */
cashHandoverRouter.get('/admin/cash-handovers', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { date } = req.query;
    const targetDate = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
      ? date
      : new Date().toISOString().split('T')[0];

    const handovers = await prisma.cashHandover.findMany({
      where: { handover_date: targetDate },
      include: {
        rider: {
          select: {
            id: true,
            name: true,
            phone: true,
          },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    const safeHandovers = handovers.map((h) => ({
      ...h,
      rider: {
        ...h.rider,
        phone: maskPhone(h.rider.phone),
      },
    }));

    res.status(200).json({
      success: true,
      date: targetDate,
      handovers: safeHandovers,
    });
  } catch (error: any) {
    console.error('Error fetching admin cash handovers:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch cash handovers' });
  }
});

/**
 * POST /api/admin/cash-handovers/:id/acknowledge
 * Spec Section 7.4: Admin confirms receipt of rider cash handover.
 * Balances reset to zero only after admin confirms.
 */
cashHandoverRouter.post('/admin/cash-handovers/:id/acknowledge', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const adminUser = (req as any).adminUser;

    const handover = await prisma.cashHandover.findUnique({
      where: { id },
      include: { rider: true },
    });

    if (!handover) {
      return res.status(404).json({ error: 'Cash handover record not found' });
    }

    if (handover.admin_confirmed_at !== null) {
      return res.status(400).json({ error: 'Cash handover has already been acknowledged' });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const ack = await tx.cashHandover.update({
        where: { id: handover.id },
        data: { admin_confirmed_at: new Date() },
      });

      // Write audit log
      await tx.auditLog.create({
        data: {
          actor_id: adminUser?.id || 'admin',
          action: 'ADMIN_CASH_HANDOVER_ACKNOWLEDGED',
          entity: 'cash_handovers',
          entity_id: handover.id,
          new_value: sanitizeForLogging({
            handover_id: handover.id,
            rider_id: handover.rider_id,
            actual_amount_paise: handover.actual_amount_paise,
            acknowledged_at: ack.admin_confirmed_at,
          }),
        },
      });

      // Also upsert CashReconciliation for F22 operations reporting
      await tx.cashReconciliation.upsert({
        where: {
          date_rider_name: {
            date: handover.handover_date,
            rider_name: handover.rider?.name || 'Delivery Partner',
          },
        },
        create: {
          date: handover.handover_date,
          rider_name: handover.rider?.name || 'Delivery Partner',
          expected_cash_paise: handover.expected_amount_paise,
          collected_cash_paise: handover.actual_amount_paise,
          variance_paise: handover.actual_amount_paise - handover.expected_amount_paise,
          status: handover.actual_amount_paise === handover.expected_amount_paise ? 'BALANCED' : 'DISCREPANCY',
          notes: handover.difference_note,
          reconciled_by: adminUser?.email || 'admin',
        },
        update: {
          expected_cash_paise: handover.expected_amount_paise,
          collected_cash_paise: handover.actual_amount_paise,
          variance_paise: handover.actual_amount_paise - handover.expected_amount_paise,
          status: handover.actual_amount_paise === handover.expected_amount_paise ? 'BALANCED' : 'DISCREPANCY',
          notes: handover.difference_note,
          reconciled_by: adminUser?.email || 'admin',
        },
      });

      return ack;
    });

    res.status(200).json({
      success: true,
      message: `Cash handover of ₹${handover.actual_amount_paise / 100} successfully acknowledged. Rider balance updated.`,
      handover: updated,
    });
  } catch (error: any) {
    console.error('Admin cash handover acknowledge error:', error);
    res.status(500).json({ error: error.message || 'Failed to acknowledge cash handover' });
  }
});

