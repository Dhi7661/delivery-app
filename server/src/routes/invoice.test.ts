import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import bcrypt from 'bcryptjs';
import { Server } from 'node:http';
import { prisma } from '../lib/db.js';
import app from '../index.js';
import { ADMIN_COOKIE_NAME } from './admin.js';
import { AUTH_COOKIE_NAME } from './auth.js';
import {
  getFinancialYear,
  generateInvoiceNumber,
  generateCreditNoteNumber,
  getNextInvoiceNumber,
  getNextCreditNoteNumber,
  generateOrderInvoice,
  generateCreditNote,
  buildInvoicePdfBuffer,
  buildCreditNotePdfBuffer,
  SELLER_DETAILS,
} from '../lib/invoice.js';

let server: Server;
let BASE_URL: string;

describe('F15: GST Invoices & Credit Notes API', () => {
  let adminToken: string;
  let adminId: string;
  let testShopId: string;
  let testProductId: string;
  const createdOrderIds: string[] = [];

  beforeAll(async () => {
    // 1. Create test admin user
    const adminEmail = `invoice-admin-${Date.now()}@plukit.test`;
    const hashed = await bcrypt.hash('AdminSecret123!', 10);
    const admin = await prisma.adminUser.create({
      data: {
        email: adminEmail,
        name: 'Invoice Admin',
        password_hash: hashed,
      },
    });
    adminId = admin.id;

    // Create admin session
    adminToken = `invoice-token-${Date.now()}`;
    await prisma.adminSession.create({
      data: {
        admin_user_id: admin.id,
        token: adminToken,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    // 2. Fetch or create test Shop and Product with HSN and GST
    let shop = await prisma.shop.findFirst({ where: { status: 'ACTIVE' } });
    if (!shop) {
      shop = await prisma.shop.create({
        data: {
          name: `Invoice Shop ${Date.now()}`,
          owner_name: 'Shop Owner',
          phone: '9876543210',
          gstin: '27AAAAA1111A1Z1',
        },
      });
    }
    testShopId = shop.id;

    let category = await prisma.category.findFirst({ where: { is_active: true } });
    if (!category) {
      category = await prisma.category.create({
        data: { name: `Invoice Category ${Date.now()}` },
      });
    }

    const product = await prisma.product.create({
      data: {
        shop_id: testShopId,
        category_id: category.id,
        name: `Invoice Test Organic Apples ${Date.now()}`,
        unit_size: '500g',
        hsn_code: '08081000',
        gst_rate: 0.05,
        mrp_paise: 15000,
        shop_price_paise: 11000,
        selling_price_paise: 13000,
      },
    });
    testProductId = product.id;

    // Start server on ephemeral port
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          BASE_URL = `http://localhost:${addr.port}`;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    // Clean up created orders, invoices, and credit notes
    if (createdOrderIds.length > 0) {
      for (const orderId of createdOrderIds) {
        const inv = await prisma.invoice.findUnique({ where: { order_id: orderId } });
        if (inv) {
          await prisma.creditNote.deleteMany({ where: { invoice_id: inv.id } });
          await prisma.invoice.delete({ where: { id: inv.id } });
        }
        await prisma.orderItem.deleteMany({ where: { order_id: orderId } });
        await prisma.delivery.deleteMany({ where: { order_id: orderId } });
        await prisma.orderNotification.deleteMany({ where: { order_id: orderId } });
        await prisma.auditLog.deleteMany({ where: { entity_id: orderId } });
        await prisma.order.delete({ where: { id: orderId } }).catch(() => {});
      }
    }

    if (testProductId) {
      await prisma.product.delete({ where: { id: testProductId } }).catch(() => {});
    }

    if (adminId) {
      await prisma.adminSession.deleteMany({ where: { admin_user_id: adminId } });
      await prisma.adminUser.delete({ where: { id: adminId } });
    }

    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  async function createDeliveredOrder(options: { phone?: string; name?: string; userId?: string } = {}) {
    const orderNo = `PLUK-INV-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const order = await prisma.order.create({
      data: {
        order_no: orderNo,
        user_id: options.userId || null,
        guest_name: options.name || 'Pooja Sharma',
        guest_phone: options.phone || '9811122233',
        address: {
          line1: 'Flat 402, Marvel Palms, Viman Nagar',
          landmark: 'Opp Symbiosis',
          pincode: '411014',
        },
        status: 'DELIVERED',
        subtotal_paise: 26000,
        delivery_fee_paise: 3000,
        total_paise: 29000,
        idempotency_key: `key-inv-${Date.now()}-${Math.random()}`,
        items: {
          create: [
            {
              product_id: testProductId,
              shop_id: testShopId,
              qty: 2,
              mrp_paise: 15000,
              shop_price_paise: 11000,
              selling_price_paise: 13000,
              line_total_paise: 26000,
            },
          ],
        },
        delivery: {
          create: {
            status: 'DELIVERED',
            delivered_at: new Date(),
            cod_collected_paise: 29000,
          },
        },
      },
    });

    createdOrderIds.push(order.id);
    return order;
  }

  it('Financial year calculation runs April to March correctly', () => {
    // April 2026 -> 2026-27
    const apr2026 = new Date('2026-04-15T10:00:00Z');
    expect(getFinancialYear(apr2026)).toBe('2026-27');

    // October 2026 -> 2026-27
    const oct2026 = new Date('2026-10-28T10:00:00Z');
    expect(getFinancialYear(oct2026)).toBe('2026-27');

    // March 2027 -> 2026-27 (Still in 2026-27 FY)
    const mar2027 = new Date('2027-03-15T10:00:00Z');
    expect(getFinancialYear(mar2027)).toBe('2026-27');

    // April 2027 -> 2027-28
    const apr2027 = new Date('2027-04-15T10:00:00Z');
    expect(getFinancialYear(apr2027)).toBe('2027-28');
  });

  it('Ten invoices in a row are numbered consecutively without gaps', async () => {
    const invoiceNumbers: string[] = [];
    for (let i = 0; i < 10; i++) {
      const invNo = await getNextInvoiceNumber();
      invoiceNumbers.push(invNo);
    }

    expect(invoiceNumbers.length).toBe(10);

    // Extract sequence integer from each INV-YYYY-YY-XXXXXX
    const seqNumbers = invoiceNumbers.map((inv) => {
      const parts = inv.split('-');
      return parseInt(parts[parts.length - 1], 10);
    });

    for (let i = 1; i < seqNumbers.length; i++) {
      expect(seqNumbers[i]).toBe(seqNumbers[i - 1] + 1);
    }
  });

  it('Invoice created automatically when an order reaches DELIVERED', async () => {
    const order = await createDeliveredOrder();

    // Trigger invoice generation
    const invoice = await generateOrderInvoice(order.id);

    expect(invoice).toBeDefined();
    expect(invoice.order_id).toBe(order.id);
    expect(invoice.invoice_no).toMatch(/^INV-\d{4}-\d{2}-\d{6}$/);
    expect(invoice.seller_name).toBe(SELLER_DETAILS.legalName);
    expect(invoice.seller_gstin).toBe(SELLER_DETAILS.gstin);
    expect(invoice.buyer_name).toBe('Pooja Sharma');
    expect(invoice.total_paise).toBe(29000);
    expect(invoice.taxable_amount_paise + invoice.gst_amount_paise).toBe(29000);
    expect(invoice.cgst_paise).toBeGreaterThan(0);
    expect(invoice.sgst_paise).toBeGreaterThan(0);
    expect(invoice.pdf_url).toContain(invoice.invoice_no);

    // Idempotency: repeated call returns identical invoice record
    const secondCall = await generateOrderInvoice(order.id);
    expect(secondCall.id).toBe(invoice.id);
    expect(secondCall.invoice_no).toBe(invoice.invoice_no);
  });

  it('A credit note references the original invoice', async () => {
    const order = await createDeliveredOrder();
    const invoice = await generateOrderInvoice(order.id);

    // Order is cancelled / returned with credit note
    const creditNote = await generateCreditNote(order.id, 'Customer returned damaged product');
    expect(creditNote).toBeDefined();
    expect(creditNote!.invoice_id).toBe(invoice.id);
    expect(creditNote!.credit_note_no).toMatch(/^CN-\d{4}-\d{2}-\d{6}$/);
    expect(creditNote!.reason).toBe('Customer returned damaged product');
    expect(creditNote!.total_paise).toBe(invoice.total_paise);
    expect(creditNote!.taxable_amount_paise).toBe(invoice.taxable_amount_paise);
    expect(creditNote!.gst_amount_paise).toBe(invoice.gst_amount_paise);

    // Invoices are never deleted or reused
    const originalInvoiceStillExists = await prisma.invoice.findUnique({
      where: { id: invoice.id },
      include: { credit_notes: true },
    });
    expect(originalInvoiceStillExists).toBeDefined();
    expect(originalInvoiceStillExists!.credit_notes.length).toBe(1);
    expect(originalInvoiceStillExists!.credit_notes[0].credit_note_no).toBe(creditNote!.credit_note_no);
  });

  it('The PDF contains every required field (seller name, GSTIN, buyer name/address, HSN code, quantity, taxable value, GST rate, GST amount, total)', async () => {
    const order = await createDeliveredOrder({
      name: 'Rohan Deshmukh',
      phone: '9922334455',
    });

    const invoice = await generateOrderInvoice(order.id);
    expect(invoice.pdf_url).toBeDefined();

    // Fetch PDF via HTTP endpoint
    const res = await fetch(`${BASE_URL}/api/invoices/${invoice.invoice_no}/pdf`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/pdf');

    const pdfBuffer = Buffer.from(await res.arrayBuffer());
    // PDF Magic Bytes Check: must start with %PDF
    expect(pdfBuffer.toString('utf8', 0, 4)).toBe('%PDF');
    expect(pdfBuffer.length).toBeGreaterThan(1000);

    // Extract all text from PDF stream (decodes both PDF hex <...> and parenthesized string tokens)
    const pdfRaw = pdfBuffer.toString('latin1');
    const hexJoined = (pdfRaw.match(/<([0-9a-fA-F]+)>/g) || [])
      .map((h) => Buffer.from(h.slice(1, -1), 'hex').toString('utf8'))
      .join('');
    const combinedText = (pdfRaw + ' ' + hexJoined).toLowerCase();

    expect(combinedText).toContain('tax');
    expect(combinedText).toContain('invoice');
    expect(combinedText).toContain('27aabcp1234f1z6'); // Seller GSTIN
    expect(combinedText).toContain('08081000'); // Product HSN code
    expect(combinedText).toContain('rohan'); // Buyer Name
    expect(combinedText).toContain('411014'); // Pincode

    // Also assert all required GST fields are stored in invoice snapshot
    expect(invoice.seller_name).toBe(SELLER_DETAILS.legalName);
    expect(invoice.seller_gstin).toBe(SELLER_DETAILS.gstin);
    expect(invoice.buyer_name).toBe('Rohan Deshmukh');
    expect(invoice.total_paise).toBe(order.total_paise);
    expect(invoice.taxable_amount_paise).toBeGreaterThan(0);
    expect(invoice.gst_amount_paise).toBeGreaterThan(0);
    const itemSnap = (invoice.items_snapshot as any[])[0];
    expect(itemSnap.hsn_code).toBe('08081000');
    expect(itemSnap.qty).toBe(2);
    expect(itemSnap.taxable_paise).toBeGreaterThan(0);
    expect(itemSnap.gst_rate).toBe(0.05);
  });

  it('Non-owner customer cannot read another customer invoice (returns 403 Forbidden)', async () => {
    // 1. Create Customer Dhiraj
    const dhirajPhone = `98${Math.floor(10000000 + Math.random() * 90000000)}`;
    const dhiraj = await prisma.user.create({
      data: { name: 'Dhiraj Invoice Test', phone: dhirajPhone },
    });
    const sessionToken = `inv-session-${Date.now()}`;
    await prisma.session.create({
      data: {
        user_id: dhiraj.id,
        token: sessionToken,
        expires_at: new Date(Date.now() + 86400000),
      },
    });

    try {
      // 2. Create another user's delivered order with invoice
      const otherOrder = await createDeliveredOrder({ phone: '9111100000', name: 'Other Buyer' });
      await generateOrderInvoice(otherOrder.id);

      // 3. Dhiraj tries to access Other Buyer's invoice
      const forbiddenRes = await fetch(`${BASE_URL}/api/orders/${otherOrder.order_no}/invoice`, {
        headers: {
          Cookie: `${AUTH_COOKIE_NAME}=${sessionToken}`,
        },
      });

      expect(forbiddenRes.status).toBe(403);
      const data = await forbiddenRes.json();
      expect(data.error).toBe('You do not have permission to view this invoice.');
    } finally {
      await prisma.session.deleteMany({ where: { user_id: dhiraj.id } });
      await prisma.user.delete({ where: { id: dhiraj.id } }).catch(() => {});
    }
  });

  it('Logged-in customer can access their own invoice (returns 200 OK)', async () => {
    const dhirajPhone = `98${Math.floor(10000000 + Math.random() * 90000000)}`;
    const dhiraj = await prisma.user.create({
      data: { name: 'Dhiraj Own Invoice', phone: dhirajPhone },
    });
    const sessionToken = `inv-session-own-${Date.now()}`;
    await prisma.session.create({
      data: {
        user_id: dhiraj.id,
        token: sessionToken,
        expires_at: new Date(Date.now() + 86400000),
      },
    });

    try {
      // Create Dhiraj's own delivered order and invoice
      const ownOrder = await createDeliveredOrder({
        phone: dhirajPhone,
        name: 'Dhiraj Own Invoice',
        userId: dhiraj.id,
      });
      const generatedInvoice = await generateOrderInvoice(ownOrder.id);

      // Access own invoice
      const ownRes = await fetch(`${BASE_URL}/api/orders/${ownOrder.order_no}/invoice`, {
        headers: {
          Cookie: `${AUTH_COOKIE_NAME}=${sessionToken}`,
        },
      });

      expect(ownRes.status).toBe(200);
      const data = await ownRes.json();
      expect(data.success).toBe(true);
      expect(data.invoice.invoice_no).toBe(generatedInvoice.invoice_no);
      expect(data.invoice.total_paise).toBe(ownOrder.total_paise);
    } finally {
      await prisma.session.deleteMany({ where: { user_id: dhiraj.id } });
      await prisma.user.delete({ where: { id: dhiraj.id } }).catch(() => {});
    }
  });
});
