import { Router, Request, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../lib/db.js';
import { getAuthenticatedUser } from './auth.js';
import { normalizePhone } from '../lib/notifications.js';
import {
  generateOrderInvoice,
  generateCreditNote,
  buildInvoicePdfBuffer,
  buildCreditNotePdfBuffer,
  InvoiceItemSnapshot,
} from '../lib/invoice.js';

export const invoiceRouter = Router();

/**
 * GET /api/orders/:orderNo/invoice
 * Returns invoice JSON and metadata for an order.
 * Ownership and authorization rules:
 * - Logged-in customer can view their own order.
 * - Guest with matching phone query parameter can view.
 * - Other users receive 403 Forbidden.
 */
invoiceRouter.get('/orders/:orderNo/invoice', async (req: Request, res: Response) => {
  try {
    const { orderNo } = req.params;
    const queryPhone = req.query.phone as string | undefined;

    const order = await prisma.order.findUnique({
      where: { order_no: orderNo },
      include: {
        invoice: {
          include: {
            credit_notes: {
              orderBy: { created_at: 'asc' },
            },
          },
        },
        user: true,
      },
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Customer & Guest Authorization check
    const authUser = await getAuthenticatedUser(req);
    const orderPhone = normalizePhone(order.guest_phone || order.user?.phone || '');

    if (authUser) {
      const isOwner =
        (order.user_id && order.user_id === authUser.id) ||
        (orderPhone && normalizePhone(authUser.phone) === orderPhone);
      if (!isOwner) {
        return res.status(403).json({ error: 'You do not have permission to view this invoice.' });
      }
    } else if (queryPhone) {
      if (normalizePhone(queryPhone) !== orderPhone) {
        return res.status(403).json({ error: 'Phone number does not match this order.' });
      }
    } else {
      return res.status(403).json({ error: 'Authentication or phone verification required to view invoice.' });
    }

    if (!order.invoice) {
      return res.status(404).json({
        error: 'Invoice not yet generated. Invoices are generated once an order is DELIVERED.',
      });
    }

    res.status(200).json({
      success: true,
      invoice: order.invoice,
      creditNotes: order.invoice.credit_notes,
    });
  } catch (error: any) {
    console.error('Error fetching order invoice:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch invoice' });
  }
});

/**
 * GET /api/invoices/:invoiceNo/pdf
 * Serves the PDF for a GST Tax Invoice.
 */
invoiceRouter.get('/invoices/:invoiceNo/pdf', async (req: Request, res: Response) => {
  try {
    const { invoiceNo } = req.params;

    const invoice = await prisma.invoice.findUnique({
      where: { invoice_no: invoiceNo },
      include: {
        order: {
          include: {
            items: {
              include: {
                product: true,
                shop: true,
              },
            },
          },
        },
      },
    });

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    // Check if on disk
    const diskPath = path.join(process.cwd(), 'public', 'invoices', `${invoiceNo}.pdf`);
    if (fs.existsSync(diskPath)) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${invoiceNo}.pdf"`);
      return fs.createReadStream(diskPath).pipe(res);
    }

    // If file is missing from disk, regenerate dynamically from database snapshot
    const items = (invoice.items_snapshot as any) as InvoiceItemSnapshot[];
    const pdfBuffer = await buildInvoicePdfBuffer({
      invoiceNo: invoice.invoice_no,
      invoiceDate: invoice.invoice_date,
      orderNo: invoice.order.order_no,
      orderDate: invoice.order.created_at,
      paymentMethod: invoice.order.payment_method,
      buyerName: invoice.buyer_name,
      buyerPhone: invoice.buyer_phone || '',
      buyerAddress: invoice.buyer_address,
      items,
      deliveryFeePaise: invoice.delivery_fee_paise,
      taxableAmountPaise: invoice.taxable_amount_paise,
      cgstPaise: invoice.cgst_paise,
      sgstPaise: invoice.sgst_paise,
      totalGstPaise: invoice.gst_amount_paise,
      totalPaise: invoice.total_paise,
    });

    // Save to disk for future fast access
    const publicDir = path.join(process.cwd(), 'public', 'invoices');
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }
    fs.writeFileSync(diskPath, pdfBuffer);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${invoiceNo}.pdf"`);
    res.send(pdfBuffer);
  } catch (error: any) {
    console.error('Error serving invoice PDF:', error);
    res.status(500).json({ error: error.message || 'Failed to serve invoice PDF' });
  }
});

/**
 * GET /api/credit-notes/:creditNoteNo/pdf
 * Serves the PDF for a Credit Note.
 */
invoiceRouter.get('/credit-notes/:creditNoteNo/pdf', async (req: Request, res: Response) => {
  try {
    const { creditNoteNo } = req.params;

    const creditNote = await prisma.creditNote.findUnique({
      where: { credit_note_no: creditNoteNo },
      include: {
        invoice: {
          include: {
            order: true,
          },
        },
      },
    });

    if (!creditNote) {
      return res.status(404).json({ error: 'Credit Note not found' });
    }

    const diskPath = path.join(process.cwd(), 'public', 'invoices', `${creditNoteNo}.pdf`);
    if (fs.existsSync(diskPath)) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${creditNoteNo}.pdf"`);
      return fs.createReadStream(diskPath).pipe(res);
    }

    const pdfBuffer = await buildCreditNotePdfBuffer({
      creditNoteNo: creditNote.credit_note_no,
      creditNoteDate: creditNote.created_at,
      invoiceNo: creditNote.invoice.invoice_no,
      invoiceDate: creditNote.invoice.invoice_date,
      orderNo: creditNote.invoice.order.order_no,
      reason: creditNote.reason,
      buyerName: creditNote.invoice.buyer_name,
      buyerPhone: creditNote.invoice.buyer_phone || '',
      taxableAmountPaise: creditNote.taxable_amount_paise,
      gstAmountPaise: creditNote.gst_amount_paise,
      totalPaise: creditNote.total_paise,
    });

    const publicDir = path.join(process.cwd(), 'public', 'invoices');
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }
    fs.writeFileSync(diskPath, pdfBuffer);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${creditNoteNo}.pdf"`);
    res.send(pdfBuffer);
  } catch (error: any) {
    console.error('Error serving credit note PDF:', error);
    res.status(500).json({ error: error.message || 'Failed to serve credit note PDF' });
  }
});
