import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { requireAuth } from './auth.js';

export const addressRouter = Router();

const CreateAddressSchema = z.object({
  line1: z.string().trim().min(5, 'Address line must be at least 5 characters'),
  landmark: z.string().trim().optional(),
  pincode: z.string().trim().regex(/^\d{6}$/, 'Pincode must be exactly 6 digits'),
  is_default: z.boolean().optional(),
});

const UpdateAddressSchema = z.object({
  line1: z.string().trim().min(5, 'Address line must be at least 5 characters').optional(),
  landmark: z.string().trim().optional(),
  pincode: z.string().trim().regex(/^\d{6}$/, 'Pincode must be exactly 6 digits').optional(),
  is_default: z.boolean().optional(),
});

/**
 * GET /api/addresses
 * List all saved addresses for the authenticated customer.
 */
addressRouter.get('/addresses', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const addresses = await prisma.address.findMany({
      where: { user_id: user.id },
      orderBy: [{ is_default: 'desc' }, { created_at: 'desc' }],
    });

    res.status(200).json({ success: true, addresses });
  } catch (error) {
    console.error('Fetch addresses error:', error);
    res.status(500).json({ error: 'Failed to fetch addresses' });
  }
});

/**
 * POST /api/addresses
 * Save a new delivery address for the authenticated customer.
 * Rules:
 * - Maximum 5 addresses per customer.
 * - Pincode must be active and serviceable.
 * - First address is automatically marked default.
 */
addressRouter.post('/addresses', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const parseResult = CreateAddressSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: parseResult.error.errors[0]?.message });
    }

    const { line1, landmark, pincode, is_default } = parseResult.data;

    // 1. Max 5 addresses check
    const currentCount = await prisma.address.count({ where: { user_id: user.id } });
    if (currentCount >= 5) {
      return res.status(400).json({ error: 'You can save a maximum of 5 delivery addresses.' });
    }

    // 2. Serviceable pincode check
    const serviceable = await prisma.serviceablePincode.findUnique({
      where: { pincode },
    });
    if (!serviceable || !serviceable.is_active) {
      return res.status(400).json({
        error: `Sorry, we do not deliver to pincode ${pincode} yet. PlukIt is currently serving pincode 411001.`,
      });
    }

    // 3. Determine default state (first address is default, or if explicitly requested)
    const shouldBeDefault = is_default === true || currentCount === 0;

    const address = await prisma.$transaction(async (tx) => {
      if (shouldBeDefault) {
        await tx.address.updateMany({
          where: { user_id: user.id },
          data: { is_default: false },
        });
      }

      return tx.address.create({
        data: {
          user_id: user.id,
          line1,
          landmark: landmark || null,
          pincode,
          is_default: shouldBeDefault,
        },
      });
    });

    res.status(201).json({ success: true, address });
  } catch (error) {
    console.error('Create address error:', error);
    res.status(500).json({ error: 'Failed to save address' });
  }
});

/**
 * PUT /api/addresses/:id
 * Update an existing delivery address.
 * Ownership check strictly enforced.
 */
addressRouter.put('/addresses/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { id } = req.params;

    const existing = await prisma.address.findUnique({ where: { id } });
    if (!existing || existing.user_id !== user.id) {
      return res.status(404).json({ error: 'Address not found or unauthorized' });
    }

    const parseResult = UpdateAddressSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: parseResult.error.errors[0]?.message });
    }

    const { line1, landmark, pincode, is_default } = parseResult.data;

    // Serviceable pincode check if pincode updated
    if (pincode && pincode !== existing.pincode) {
      const serviceable = await prisma.serviceablePincode.findUnique({
        where: { pincode },
      });
      if (!serviceable || !serviceable.is_active) {
        return res.status(400).json({
          error: `Sorry, we do not deliver to pincode ${pincode} yet. PlukIt is currently serving pincode 411001.`,
        });
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (is_default === true) {
        await tx.address.updateMany({
          where: { user_id: user.id },
          data: { is_default: false },
        });
      }

      return tx.address.update({
        where: { id },
        data: {
          line1: line1 ?? existing.line1,
          landmark: landmark !== undefined ? landmark || null : existing.landmark,
          pincode: pincode ?? existing.pincode,
          is_default: is_default !== undefined ? is_default : existing.is_default,
        },
      });
    });

    res.status(200).json({ success: true, address: updated });
  } catch (error) {
    console.error('Update address error:', error);
    res.status(500).json({ error: 'Failed to update address' });
  }
});

/**
 * DELETE /api/addresses/:id
 * Delete an address with ownership check.
 * If deleted address was default, sets the next most recent address as default.
 */
addressRouter.delete('/addresses/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { id } = req.params;

    const existing = await prisma.address.findUnique({ where: { id } });
    if (!existing || existing.user_id !== user.id) {
      return res.status(404).json({ error: 'Address not found or unauthorized' });
    }

    await prisma.$transaction(async (tx) => {
      await tx.address.delete({ where: { id } });

      if (existing.is_default) {
        const nextDefault = await tx.address.findFirst({
          where: { user_id: user.id },
          orderBy: { created_at: 'desc' },
        });
        if (nextDefault) {
          await tx.address.update({
            where: { id: nextDefault.id },
            data: { is_default: true },
          });
        }
      }
    });

    res.status(200).json({ success: true, message: 'Address deleted successfully' });
  } catch (error) {
    console.error('Delete address error:', error);
    res.status(500).json({ error: 'Failed to delete address' });
  }
});

/**
 * PATCH /api/addresses/:id/default
 * Sets the specified address as the default delivery address.
 */
addressRouter.patch('/addresses/:id/default', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { id } = req.params;

    const existing = await prisma.address.findUnique({ where: { id } });
    if (!existing || existing.user_id !== user.id) {
      return res.status(404).json({ error: 'Address not found or unauthorized' });
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.address.updateMany({
        where: { user_id: user.id },
        data: { is_default: false },
      });

      return tx.address.update({
        where: { id },
        data: { is_default: true },
      });
    });

    res.status(200).json({ success: true, address: updated });
  } catch (error) {
    console.error('Set default address error:', error);
    res.status(500).json({ error: 'Failed to set default address' });
  }
});
