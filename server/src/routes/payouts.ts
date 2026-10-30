import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { requireAdminAuth } from './admin.js';
import {
  getShopUnbilledBalance,
  generate15DayPayout,
  recordPayoutTransfer,
  createShopAdjustment,
  getPayoutStatementData,
} from '../lib/ledger.js';
import { buildPayoutStatementPdfBuffer } from '../lib/payoutPdf.js';

export const payoutsRouter = Router();

// Validation Schemas
const GeneratePayoutSchema = z.object({
  shopId: z.string().min(1, 'Shop ID is required'),
  periodStart: z.string().refine((val) => !isNaN(Date.parse(val)), { message: 'Invalid start date' }),
  periodEnd: z.string().refine((val) => !isNaN(Date.parse(val)), { message: 'Invalid end date' }),
});

const RecordPaymentSchema = z.object({
  bankReference: z.string().min(4, 'Bank transfer reference must be at least 4 characters'),
  paidAt: z.string().optional().refine((val) => !val || !isNaN(Date.parse(val)), { message: 'Invalid date' }),
});

const CreateAdjustmentSchema = z.object({
  shopId: z.string().min(1, 'Shop ID is required'),
  amountPaise: z.number().int({ message: 'Amount must be an integer (in paise)' }),
  notes: z.string().min(4, 'Reason/Note must be at least 4 characters'),
});

const UpdateShopBankSchema = z.object({
  accountNumber: z.string().min(6, 'Account number must be at least 6 digits'),
  ifscCode: z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Invalid IFSC code format (e.g. HDFC0001234)'),
  bankName: z.string().min(2, 'Bank name is required'),
  accountName: z.string().min(2, 'Account holder name is required'),
});

/**
 * GET /api/admin/payouts
 * List all payouts with shop details, status, and summary metrics.
 */
payoutsRouter.get('/admin/payouts', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { status, shopId } = req.query;

    const where: any = {};
    if (status && status !== 'ALL') {
      where.status = status;
    }
    if (shopId && typeof shopId === 'string') {
      where.shop_id = shopId;
    }

    const payouts = await prisma.payout.findMany({
      where,
      include: {
        shop: {
          select: {
            id: true,
            name: true,
            address: true,
            phone: true,
            gstin: true,
            bank_ref: true,
          },
        },
        _count: {
          select: { ledger_entries: true },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    // Summary aggregates
    const allPayouts = await prisma.payout.findMany({
      select: { status: true, amount_paise: true },
    });

    let totalPaidPaise = 0;
    let scheduledPaise = 0;
    for (const p of allPayouts) {
      if (p.status === 'PAID') {
        totalPaidPaise += p.amount_paise;
      } else if (p.status === 'SCHEDULED') {
        scheduledPaise += p.amount_paise;
      }
    }

    res.status(200).json({
      success: true,
      payouts,
      summary: {
        totalPayoutsCount: allPayouts.length,
        totalPaidPaise,
        scheduledPaise,
      },
    });
  } catch (error: any) {
    console.error('Error fetching payouts:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch payouts' });
  }
});

/**
 * GET /api/admin/payouts/shops
 * List partner shops with unbilled balance, ledger count, and bank info.
 */
payoutsRouter.get('/admin/payouts/shops', requireAdminAuth, async (_req: Request, res: Response) => {
  try {
    const shops = await prisma.shop.findMany({
      where: { status: 'ACTIVE' },
      include: {
        bank_ref: true,
      },
      orderBy: { name: 'asc' },
    });

    const shopSummaries = await Promise.all(
      shops.map(async (shop) => {
        const balance = await getShopUnbilledBalance(shop.id);
        return {
          id: shop.id,
          name: shop.name,
          address: shop.address,
          phone: shop.phone,
          gstin: shop.gstin,
          fssai: shop.fssai_no,
          bankRef: shop.bank_ref,
          unbilledSalesPaise: balance.grossSalesPaise,
          unbilledDeductionsPaise: balance.deductionsPaise,
          unbilledAdjustmentsPaise: balance.adjustmentsPaise,
          netPayablePaise: balance.netPayablePaise,
          unbilledCount: balance.count,
        };
      })
    );

    res.status(200).json({
      success: true,
      shops: shopSummaries,
    });
  } catch (error: any) {
    console.error('Error fetching payout shops:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch shops' });
  }
});

/**
 * GET /api/admin/payouts/preview
 * Preview unbilled balance for a given shop and date range.
 */
payoutsRouter.get('/admin/payouts/preview', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { shopId, periodStart, periodEnd } = req.query;

    if (!shopId || typeof shopId !== 'string') {
      return res.status(400).json({ error: 'shopId is required' });
    }

    const shop = await prisma.shop.findUnique({
      where: { id: shopId },
      include: { bank_ref: true },
    });

    if (!shop) {
      return res.status(404).json({ error: 'Shop not found' });
    }

    const startDate = periodStart ? new Date(periodStart as string) : new Date(0);
    const endDate = periodEnd ? new Date(periodEnd as string) : new Date();

    const unbilled = await prisma.shopLedger.findMany({
      where: {
        shop_id: shopId,
        payout_id: null,
        created_at: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        order_item: {
          include: {
            product: { select: { name: true, unit_size: true } },
            order: { select: { order_no: true } },
          },
        },
      },
      orderBy: { created_at: 'asc' },
    });

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

    res.status(200).json({
      success: true,
      shop: {
        id: shop.id,
        name: shop.name,
        bankRef: shop.bank_ref,
      },
      entries: unbilled,
      grossSalesPaise,
      deductionsPaise,
      netAmountPaise,
      count: unbilled.length,
    });
  } catch (error: any) {
    console.error('Error previewing payout:', error);
    res.status(500).json({ error: error.message || 'Failed to preview payout' });
  }
});

/**
 * POST /api/admin/payouts/generate
 * Generates a 15-day payout run for a partner shop.
 */
payoutsRouter.post('/admin/payouts/generate', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const parseResult = GeneratePayoutSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: parseResult.error.errors[0]?.message });
    }

    const { shopId, periodStart, periodEnd } = parseResult.data;
    const adminUser = (req as any).adminUser;

    const payout = await generate15DayPayout({
      shopId,
      periodStart: new Date(periodStart),
      periodEnd: new Date(periodEnd),
      adminId: adminUser?.id,
      adminEmail: adminUser?.email,
    });

    res.status(201).json({
      success: true,
      message: 'Payout run generated successfully',
      payout,
    });
  } catch (error: any) {
    console.error('Error generating payout:', error);
    res.status(400).json({ error: error.message || 'Failed to generate payout' });
  }
});

/**
 * POST /api/admin/payouts/:id/pay
 * Records bank transfer UTR and marks payout as PAID (locking the period).
 */
payoutsRouter.post('/admin/payouts/:id/pay', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const parseResult = RecordPaymentSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: parseResult.error.errors[0]?.message });
    }

    const { bankReference, paidAt } = parseResult.data;
    const adminUser = (req as any).adminUser;

    const payout = await recordPayoutTransfer({
      payoutId: id,
      bankReference,
      paidAt: paidAt ? new Date(paidAt) : undefined,
      adminId: adminUser?.id,
    });

    res.status(200).json({
      success: true,
      message: `Payout marked as PAID. Bank reference ${payout.bank_reference} recorded and period is permanently locked.`,
      payout,
    });
  } catch (error: any) {
    console.error('Error recording payout payment:', error);
    res.status(400).json({ error: error.message || 'Failed to record payout transfer' });
  }
});

/**
 * POST /api/admin/payouts/adjustments
 * Records an adjustment entry for a shop (for post-payout corrections).
 */
payoutsRouter.post('/admin/payouts/adjustments', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const parseResult = CreateAdjustmentSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: parseResult.error.errors[0]?.message });
    }

    const { shopId, amountPaise, notes } = parseResult.data;
    const adminUser = (req as any).adminUser;

    const adjustment = await createShopAdjustment({
      shopId,
      amountPaise,
      notes,
      adminId: adminUser?.id,
    });

    res.status(201).json({
      success: true,
      message: 'Shop adjustment entry recorded successfully.',
      adjustment,
    });
  } catch (error: any) {
    console.error('Error creating adjustment:', error);
    res.status(400).json({ error: error.message || 'Failed to create adjustment' });
  }
});

/**
 * POST /api/admin/payouts/shops/:shopId/bank
 * Saves or updates bank details for a shop.
 */
payoutsRouter.post('/admin/payouts/shops/:shopId/bank', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { shopId } = req.params;
    const parseResult = UpdateShopBankSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: parseResult.error.errors[0]?.message });
    }

    const { accountNumber, ifscCode, bankName, accountName } = parseResult.data;

    const shop = await prisma.shop.findUnique({ where: { id: shopId } });
    if (!shop) {
      return res.status(404).json({ error: 'Shop not found' });
    }

    const bankRef = await prisma.shopBankRef.upsert({
      where: { shop_id: shopId },
      create: {
        shop_id: shopId,
        provider_ref: 'MANUAL',
        last4: accountNumber.trim().slice(-4),
        ifsc_code: ifscCode.toUpperCase().trim(),
        bank_name: bankName.trim(),
        account_name: accountName.trim(),
        verified_at: new Date(),
      },
      update: {
        last4: accountNumber.trim().slice(-4),
        ifsc_code: ifscCode.toUpperCase().trim(),
        bank_name: bankName.trim(),
        account_name: accountName.trim(),
        verified_at: new Date(),
      },
    });

    res.status(200).json({
      success: true,
      message: 'Bank account reference updated successfully',
      bankRef,
    });
  } catch (error: any) {
    console.error('Error updating shop bank details:', error);
    res.status(400).json({ error: error.message || 'Failed to update bank details' });
  }
});

/**
 * GET /api/admin/payouts/:id/statement
 * Detailed statement breakdown for a payout.
 */
payoutsRouter.get('/admin/payouts/:id/statement', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data = await getPayoutStatementData(id);

    res.status(200).json({
      success: true,
      ...data,
    });
  } catch (error: any) {
    console.error('Error fetching statement:', error);
    res.status(404).json({ error: error.message || 'Payout statement not found' });
  }
});

/**
 * GET /api/admin/payouts/:id/pdf
 * Generates and downloads the Payout Statement PDF.
 */
payoutsRouter.get('/admin/payouts/:id/pdf', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data = await getPayoutStatementData(id);

    const pdfBuffer = await buildPayoutStatementPdfBuffer({
      payoutId: data.payout.id,
      status: data.payout.status,
      periodStart: data.payout.period_start,
      periodEnd: data.payout.period_end,
      paidAt: data.payout.paid_at,
      bankReference: data.payout.bank_reference,
      grossSalesPaise: data.summary.grossSalesPaise,
      deductionsPaise: data.summary.deductionsPaise,
      amountPaise: data.summary.netAmountPaise,
      shop: {
        name: data.shop.name,
        address: data.shop.address,
        phone: data.shop.phone,
        gstin: data.shop.gstin,
        fssai: data.shop.fssai_no,
        bank_ref: data.bankRef,
      },
      ledgerEntries: data.payout.ledger_entries,
    });

    const filename = `Payout-Statement-${data.shop.name.replace(/\s+/g, '_')}-${data.payout.id.slice(0, 8)}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);

    res.end(pdfBuffer);
  } catch (error: any) {
    console.error('Error generating payout PDF:', error);
    res.status(404).json({ error: error.message || 'Failed to generate payout PDF' });
  }
});
