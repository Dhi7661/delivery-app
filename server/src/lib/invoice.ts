import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import { prisma } from './db.js';
import { BRAND_NAME, SUPPORT_EMAIL } from './brand.js';

export const SELLER_DETAILS = {
  legalName: `${BRAND_NAME} Quick Commerce Private Limited`,
  gstin: '27AABCP1234F1Z6',
  fssai: '11526000000000',
  address: 'Shop 4, Phoenix Marketcity, Viman Nagar, Pune - 411014, Maharashtra',
  state: 'Maharashtra',
  stateCode: '27',
  supportEmail: SUPPORT_EMAIL,
};

/**
 * Determine Indian Financial Year from date (runs April 1 to March 31).
 * Example: October 2026 -> "2026-27"
 * Example: February 2027 -> "2026-27"
 * Example: April 2027 -> "2027-28"
 */
export function getFinancialYear(date: Date = new Date()): string {
  const month = date.getMonth(); // 0-indexed: Jan=0, Feb=1, Mar=2, Apr=3
  const year = date.getFullYear();

  if (month >= 3) {
    // April to December
    const nextYearTwoDigit = String((year + 1) % 100).padStart(2, '0');
    return `${year}-${nextYearTwoDigit}`;
  } else {
    // January to March
    const currentYearTwoDigit = String(year % 100).padStart(2, '0');
    return `${year - 1}-${currentYearTwoDigit}`;
  }
}

/**
 * Generate formatted sequential invoice number.
 * Example: INV-2026-27-000001
 */
export function generateInvoiceNumber(sequence: number, date: Date = new Date()): string {
  if (!Number.isInteger(sequence) || sequence <= 0) {
    throw new Error(`Invoice sequence must be a positive integer, received: ${sequence}`);
  }
  const fy = getFinancialYear(date);
  const padded = String(sequence).padStart(6, '0');
  return `INV-${fy}-${padded}`;
}

/**
 * Generate formatted sequential credit note number.
 * Example: CN-2026-27-000001
 */
export function generateCreditNoteNumber(sequence: number, date: Date = new Date()): string {
  if (!Number.isInteger(sequence) || sequence <= 0) {
    throw new Error(`Credit note sequence must be a positive integer, received: ${sequence}`);
  }
  const fy = getFinancialYear(date);
  const padded = String(sequence).padStart(6, '0');
  return `CN-${fy}-${padded}`;
}

/**
 * Retrieve next atomic invoice number from database sequence.
 */
export async function getNextInvoiceNumber(date: Date = new Date()): Promise<string> {
  const result = await prisma.$queryRaw<Array<{ nextval: bigint }>>`
    SELECT nextval('invoice_number_seq') AS nextval
  `;
  const seq = Number(result[0].nextval);
  return generateInvoiceNumber(seq, date);
}

/**
 * Retrieve next atomic credit note number from database sequence.
 */
export async function getNextCreditNoteNumber(date: Date = new Date()): Promise<string> {
  const result = await prisma.$queryRaw<Array<{ nextval: bigint }>>`
    SELECT nextval('credit_note_number_seq') AS nextval
  `;
  const seq = Number(result[0].nextval);
  return generateCreditNoteNumber(seq, date);
}

/**
 * Convert paise to Rupees with 2 decimal places.
 */
export function paiseToRupees(paise: number): string {
  return (paise / 100).toFixed(2);
}

/**
 * Helper to convert integer number to Indian English words.
 */
export function numberToWords(amountInRupees: number): string {
  const units = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function convertChunk(num: number): string {
    if (num === 0) return '';
    if (num < 20) return units[num] + ' ';
    if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 !== 0 ? ' ' + units[num % 10] : '') + ' ';
    return units[Math.floor(num / 100)] + ' Hundred ' + (num % 100 !== 0 ? convertChunk(num % 100) : '');
  }

  if (amountInRupees === 0) return 'Zero Rupees Only';

  let remaining = Math.floor(amountInRupees);
  let words = '';

  const crore = Math.floor(remaining / 10000000);
  remaining %= 10000000;
  if (crore > 0) words += convertChunk(crore) + 'Crore ';

  const lakh = Math.floor(remaining / 100000);
  remaining %= 100000;
  if (lakh > 0) words += convertChunk(lakh) + 'Lakh ';

  const thousand = Math.floor(remaining / 1000);
  remaining %= 1000;
  if (thousand > 0) words += convertChunk(thousand) + 'Thousand ';

  const hundred = remaining;
  if (hundred > 0) words += convertChunk(hundred);

  return `Rupees ${words.trim()} Only`;
}

export interface InvoiceItemSnapshot {
  name: string;
  hsn_code: string;
  qty: number;
  unit_size: string;
  mrp_paise: number;
  selling_price_paise: number;
  line_total_paise: number;
  taxable_paise: number;
  gst_rate: number;
  gst_amount_paise: number;
  cgst_paise: number;
  sgst_paise: number;
}

/**
 * Build a GST Tax Invoice PDF using PDFKit and return it as a Buffer.
 */
export async function buildInvoicePdfBuffer(data: {
  invoiceNo: string;
  invoiceDate: Date;
  orderNo: string;
  orderDate: Date;
  paymentMethod: string;
  buyerName: string;
  buyerPhone: string;
  buyerAddress: any;
  items: InvoiceItemSnapshot[];
  deliveryFeePaise: number;
  taxableAmountPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  totalGstPaise: number;
  totalPaise: number;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4', compress: false });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', (err) => reject(err));

    // Header Title
    doc.fontSize(16).font('Helvetica-Bold').text('TAX INVOICE', { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(8).font('Helvetica').text('(Issued in accordance with Section 31 of CGST Act, 2017)', { align: 'center' });
    doc.moveDown(0.8);

    const startY = doc.y;

    // Seller Details Box (Left)
    doc.rect(40, startY, 250, 110).stroke('#cbd5e1');
    doc.fontSize(9).font('Helvetica-Bold').text('SELLER DETAILS:', 48, startY + 8);
    doc.font('Helvetica-Bold').fontSize(8).text(SELLER_DETAILS.legalName, 48, startY + 22);
    doc.font('Helvetica').fontSize(8)
      .text(SELLER_DETAILS.address, 48, startY + 34, { width: 235 })
      .text(`GSTIN: ${SELLER_DETAILS.gstin}`, 48, startY + 62)
      .text(`FSSAI Lic. No: ${SELLER_DETAILS.fssai}`, 48, startY + 74)
      .text(`State / Code: ${SELLER_DETAILS.state} (${SELLER_DETAILS.stateCode})`, 48, startY + 86)
      .text(`Email: ${SELLER_DETAILS.supportEmail}`, 48, startY + 98);

    // Invoice & Buyer Details Box (Right)
    doc.rect(300, startY, 255, 110).stroke('#cbd5e1');
    doc.fontSize(9).font('Helvetica-Bold').text('INVOICE & BUYER DETAILS:', 308, startY + 8);
    doc.font('Helvetica').fontSize(8)
      .text(`Invoice No: `, 308, startY + 22, { continued: true }).font('Helvetica-Bold').text(data.invoiceNo)
      .font('Helvetica').text(`Invoice Date: ${data.invoiceDate.toLocaleDateString('en-IN')}`)
      .text(`Order No: `, { continued: true }).font('Helvetica-Bold').text(data.orderNo)
      .font('Helvetica').text(`Order Date: ${data.orderDate.toLocaleDateString('en-IN')}`)
      .text(`Payment: ${data.paymentMethod === 'COD' ? 'Cash on Delivery' : 'Paid Online'}`)
      .moveDown(0.2)
      .font('Helvetica-Bold').text(`Bill To / Ship To: ${data.buyerName || 'Valued Customer'}`)
      .font('Helvetica').text(`Phone: ${data.buyerPhone || 'N/A'}`)
      .text(`Address: ${data.buyerAddress?.line1 || data.buyerAddress?.address || 'Pune'}, Pin: ${data.buyerAddress?.pincode || '411001'}`, { width: 240 });

    doc.y = startY + 120;

    // Items Table Header
    const tableTop = doc.y;
    doc.rect(40, tableTop, 515, 20).fillAndStroke('#f1f5f9', '#94a3b8');
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(7.5);
    doc.text('#', 45, tableTop + 6, { width: 15 });
    doc.text('Item Description', 62, tableTop + 6, { width: 140 });
    doc.text('HSN', 205, tableTop + 6, { width: 35 });
    doc.text('Qty', 242, tableTop + 6, { width: 22, align: 'center' });
    doc.text('Rate', 266, tableTop + 6, { width: 45, align: 'right' });
    doc.text('Taxable', 313, tableTop + 6, { width: 50, align: 'right' });
    doc.text('CGST', 365, tableTop + 6, { width: 42, align: 'right' });
    doc.text('SGST', 409, tableTop + 6, { width: 42, align: 'right' });
    doc.text('Total', 453, tableTop + 6, { width: 95, align: 'right' });

    let currentY = tableTop + 20;

    // Item Rows
    doc.font('Helvetica').fontSize(7.5).fillColor('#1e293b');
    data.items.forEach((item, index) => {
      const rowHeight = 18;
      if (index % 2 === 1) {
        doc.rect(40, currentY, 515, rowHeight).fill('#f8fafc');
      }
      doc.rect(40, currentY, 515, rowHeight).stroke('#e2e8f0');
      doc.fillColor('#1e293b');

      doc.text(String(index + 1), 45, currentY + 5, { width: 15 });
      doc.text(`${item.name} (${item.unit_size})`, 62, currentY + 5, { width: 140, ellipsis: true });
      doc.text(item.hsn_code || '0804', 205, currentY + 5, { width: 35 });
      doc.text(String(item.qty), 242, currentY + 5, { width: 22, align: 'center' });
      doc.text(`₹${paiseToRupees(item.selling_price_paise)}`, 266, currentY + 5, { width: 45, align: 'right' });
      doc.text(`₹${paiseToRupees(item.taxable_paise)}`, 313, currentY + 5, { width: 50, align: 'right' });
      doc.text(`₹${paiseToRupees(item.cgst_paise)}`, 365, currentY + 5, { width: 42, align: 'right' });
      doc.text(`₹${paiseToRupees(item.sgst_paise)}`, 409, currentY + 5, { width: 42, align: 'right' });
      doc.text(`₹${paiseToRupees(item.line_total_paise)}`, 453, currentY + 5, { width: 95, align: 'right' });

      currentY += rowHeight;
    });

    // Delivery Charge Row if applicable
    if (data.deliveryFeePaise > 0) {
      const taxableDelivery = Math.round(data.deliveryFeePaise / 1.18);
      const deliveryGst = data.deliveryFeePaise - taxableDelivery;
      const cgstDelivery = Math.floor(deliveryGst / 2);
      const sgstDelivery = deliveryGst - cgstDelivery;

      doc.rect(40, currentY, 515, 18).stroke('#e2e8f0');
      doc.fillColor('#1e293b');
      doc.text(String(data.items.length + 1), 45, currentY + 5, { width: 15 });
      doc.text('Local Delivery & Convenience Services', 62, currentY + 5, { width: 140 });
      doc.text('996812', 205, currentY + 5, { width: 35 });
      doc.text('1', 242, currentY + 5, { width: 22, align: 'center' });
      doc.text(`₹${paiseToRupees(data.deliveryFeePaise)}`, 266, currentY + 5, { width: 45, align: 'right' });
      doc.text(`₹${paiseToRupees(taxableDelivery)}`, 313, currentY + 5, { width: 50, align: 'right' });
      doc.text(`₹${paiseToRupees(cgstDelivery)}`, 365, currentY + 5, { width: 42, align: 'right' });
      doc.text(`₹${paiseToRupees(sgstDelivery)}`, 409, currentY + 5, { width: 42, align: 'right' });
      doc.text(`₹${paiseToRupees(data.deliveryFeePaise)}`, 453, currentY + 5, { width: 95, align: 'right' });

      currentY += 18;
    }

    // Totals Table Footer
    doc.rect(40, currentY, 515, 24).fillAndStroke('#f8fafc', '#94a3b8');
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(8);
    doc.text('Total Invoice Value:', 62, currentY + 7);
    doc.text(`₹${paiseToRupees(data.taxableAmountPaise)}`, 313, currentY + 7, { width: 50, align: 'right' });
    doc.text(`₹${paiseToRupees(data.cgstPaise)}`, 365, currentY + 7, { width: 42, align: 'right' });
    doc.text(`₹${paiseToRupees(data.sgstPaise)}`, 409, currentY + 7, { width: 42, align: 'right' });
    doc.text(`₹${paiseToRupees(data.totalPaise)}`, 453, currentY + 7, { width: 95, align: 'right' });

    currentY += 34;

    // Summary & Amount in Words
    doc.rect(40, currentY, 515, 45).stroke('#cbd5e1');
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#0f172a')
      .text('Amount in Words: ', 48, currentY + 10, { continued: true })
      .font('Helvetica').text(numberToWords(Math.round(data.totalPaise / 100)));

    doc.font('Helvetica').fontSize(8).fillColor('#475569')
      .text(`Total Tax Amount: ₹${paiseToRupees(data.totalGstPaise)} (CGST: ₹${paiseToRupees(data.cgstPaise)}, SGST: ₹${paiseToRupees(data.sgstPaise)})`, 48, currentY + 26);

    currentY += 55;

    // Tax Declaration & Signatory
    doc.rect(40, currentY, 320, 55).stroke('#cbd5e1');
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#0f172a').text('Tax Declaration:', 48, currentY + 8);
    doc.font('Helvetica').fontSize(7).fillColor('#64748b')
      .text('1. All supplies are intra-state within the State of Maharashtra (Code: 27).', 48, currentY + 20)
      .text('2. Goods once sold are subject to PlukIt return and cancellation policy.', 48, currentY + 30)
      .text('3. This is a computer-generated tax invoice and requires no physical signature.', 48, currentY + 40);

    doc.rect(365, currentY, 190, 55).stroke('#cbd5e1');
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#0f172a')
      .text(`For ${SELLER_DETAILS.legalName}`, 373, currentY + 8, { align: 'center', width: 174 });
    doc.font('Helvetica-Oblique').fontSize(7).fillColor('#059669')
      .text('[Digitally Verified]', 373, currentY + 28, { align: 'center', width: 174 });
    doc.font('Helvetica').fontSize(7).fillColor('#64748b')
      .text('Authorized Signatory', 373, currentY + 42, { align: 'center', width: 174 });

    doc.end();
  });
}

/**
 * Build a Credit Note PDF using PDFKit and return it as a Buffer.
 */
export async function buildCreditNotePdfBuffer(data: {
  creditNoteNo: string;
  creditNoteDate: Date;
  invoiceNo: string;
  invoiceDate: Date;
  orderNo: string;
  reason: string;
  buyerName: string;
  buyerPhone: string;
  taxableAmountPaise: number;
  gstAmountPaise: number;
  totalPaise: number;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4', compress: false });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', (err) => reject(err));

    // Header Title
    doc.fontSize(16).font('Helvetica-Bold').fillColor('#b91c1c').text('CREDIT NOTE', { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(8).font('Helvetica').fillColor('#475569').text('(Issued in accordance with Section 34 of CGST Act, 2017)', { align: 'center' });
    doc.moveDown(0.8);

    const startY = doc.y;

    // Seller Details Box (Left)
    doc.rect(40, startY, 250, 95).stroke('#cbd5e1');
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#0f172a').text('ISSUER DETAILS:', 48, startY + 8);
    doc.font('Helvetica-Bold').fontSize(8).text(SELLER_DETAILS.legalName, 48, startY + 22);
    doc.font('Helvetica').fontSize(8)
      .text(SELLER_DETAILS.address, 48, startY + 34, { width: 235 })
      .text(`GSTIN: ${SELLER_DETAILS.gstin}`, 48, startY + 62)
      .text(`State / Code: ${SELLER_DETAILS.state} (${SELLER_DETAILS.stateCode})`, 48, startY + 76);

    // Credit Note Details Box (Right)
    doc.rect(300, startY, 255, 95).stroke('#cbd5e1');
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#0f172a').text('CREDIT NOTE DETAILS:', 308, startY + 8);
    doc.font('Helvetica').fontSize(8)
      .text(`Credit Note No: `, 308, startY + 22, { continued: true }).font('Helvetica-Bold').fillColor('#b91c1c').text(data.creditNoteNo)
      .font('Helvetica').fillColor('#0f172a').text(`Credit Note Date: ${data.creditNoteDate.toLocaleDateString('en-IN')}`)
      .text(`Original Invoice No: `, { continued: true }).font('Helvetica-Bold').text(data.invoiceNo)
      .font('Helvetica').text(`Original Invoice Date: ${data.invoiceDate.toLocaleDateString('en-IN')}`)
      .text(`Referenced Order No: ${data.orderNo}`)
      .text(`Customer Name: ${data.buyerName || 'Valued Customer'}`);

    doc.y = startY + 110;

    // Reason & Explanation Box
    doc.rect(40, doc.y, 515, 45).fillAndStroke('#fef2f2', '#fca5a5');
    doc.fillColor('#991b1b').font('Helvetica-Bold').fontSize(8.5).text('Reason for Credit Note / Adjustment:', 48, doc.y + 8);
    doc.font('Helvetica').fontSize(8).fillColor('#7f1d1d')
      .text(`Reason: ${data.reason}`, 48, doc.y + 20)
      .text('Adjustment type: Full refund / cancellation of original delivered supplies.', 48, doc.y + 30);

    doc.y += 55;

    // Adjustment Table
    const tableTop = doc.y;
    doc.rect(40, tableTop, 515, 20).fillAndStroke('#f1f5f9', '#94a3b8');
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(8);
    doc.text('Description of Adjustment', 48, tableTop + 6, { width: 230 });
    doc.text('Original Invoice No', 280, tableTop + 6, { width: 100 });
    doc.text('Taxable Value', 385, tableTop + 6, { width: 80, align: 'right' });
    doc.text('Total Credit (₹)', 470, tableTop + 6, { width: 80, align: 'right' });

    const rowY = tableTop + 20;
    doc.rect(40, rowY, 515, 25).stroke('#cbd5e1');
    doc.font('Helvetica').fontSize(8).fillColor('#1e293b');
    doc.text(`Credit reversal for cancelled / returned order #${data.orderNo}`, 48, rowY + 8, { width: 230 });
    doc.text(data.invoiceNo, 280, rowY + 8, { width: 100 });
    doc.text(`₹${paiseToRupees(data.taxableAmountPaise)}`, 385, rowY + 8, { width: 80, align: 'right' });
    doc.font('Helvetica-Bold').fillColor('#b91c1c').text(`₹${paiseToRupees(data.totalPaise)}`, 470, rowY + 8, { width: 80, align: 'right' });

    const sumY = rowY + 35;
    doc.rect(40, sumY, 515, 40).stroke('#cbd5e1');
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#0f172a')
      .text('Total Amount Credited: ', 48, sumY + 8, { continued: true })
      .font('Helvetica').text(numberToWords(Math.round(data.totalPaise / 100)));
    doc.font('Helvetica').fontSize(8).fillColor('#475569')
      .text(`Includes Tax Adjustment: ₹${paiseToRupees(data.gstAmountPaise)} (CGST + SGST)`, 48, sumY + 22);

    doc.end();
  });
}

/**
 * Saves a buffer to storage and returns local public URL.
 */
export function saveInvoicePdfToDisk(fileName: string, buffer: Buffer): string {
  const publicDir = path.join(process.cwd(), 'public', 'invoices');
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }
  const filePath = path.join(publicDir, fileName);
  fs.writeFileSync(filePath, buffer);
  return `/api/invoices/${fileName.replace('.pdf', '')}/pdf`;
}

/**
 * Saves a credit note buffer to storage.
 */
export function saveCreditNotePdfToDisk(fileName: string, buffer: Buffer): string {
  const publicDir = path.join(process.cwd(), 'public', 'invoices');
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }
  const filePath = path.join(publicDir, fileName);
  fs.writeFileSync(filePath, buffer);
  return `/api/credit-notes/${fileName.replace('.pdf', '')}/pdf`;
}

/**
 * Generate a GST Tax Invoice when an order reaches DELIVERED (F15).
 * Idempotent: If an invoice already exists for this order, returns the existing record.
 */
export async function generateOrderInvoice(orderId: string) {
  // 1. Check existing invoice
  const existing = await prisma.invoice.findUnique({
    where: { order_id: orderId },
    include: { credit_notes: true },
  });
  if (existing) {
    return existing;
  }

  // 2. Fetch order details
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: {
        include: {
          product: true,
          shop: true,
        },
      },
      delivery: true,
      user: true,
    },
  });

  if (!order) {
    throw new Error(`Order ${orderId} not found`);
  }

  const invoiceNo = await getNextInvoiceNumber(new Date());

  // 3. Calculate line-item GST and tax details
  let totalItemsTaxablePaise = 0;
  let totalItemsGstPaise = 0;
  let totalItemsCgstPaise = 0;
  let totalItemsSgstPaise = 0;

  const itemsSnapshot: InvoiceItemSnapshot[] = order.items.map((item) => {
    const gstRate = item.product.gst_rate || 0.05; // default 5% for groceries if unset
    const lineTotal = item.line_total_paise;
    const taxable = Math.round(lineTotal / (1 + gstRate));
    const gstAmount = lineTotal - taxable;
    const cgst = Math.floor(gstAmount / 2);
    const sgst = gstAmount - cgst;

    totalItemsTaxablePaise += taxable;
    totalItemsGstPaise += gstAmount;
    totalItemsCgstPaise += cgst;
    totalItemsSgstPaise += sgst;

    return {
      name: item.product.name,
      hsn_code: item.product.hsn_code || '0804',
      qty: item.qty,
      unit_size: item.product.unit_size,
      mrp_paise: item.mrp_paise,
      selling_price_paise: item.selling_price_paise,
      line_total_paise: lineTotal,
      taxable_paise: taxable,
      gst_rate: gstRate,
      gst_amount_paise: gstAmount,
      cgst_paise: cgst,
      sgst_paise: sgst,
    };
  });

  // Delivery fee tax calculation (SAC 996812 at 18% GST)
  let deliveryTaxablePaise = 0;
  let deliveryGstPaise = 0;
  let deliveryCgstPaise = 0;
  let deliverySgstPaise = 0;

  if (order.delivery_fee_paise > 0) {
    deliveryTaxablePaise = Math.round(order.delivery_fee_paise / 1.18);
    deliveryGstPaise = order.delivery_fee_paise - deliveryTaxablePaise;
    deliveryCgstPaise = Math.floor(deliveryGstPaise / 2);
    deliverySgstPaise = deliveryGstPaise - deliveryCgstPaise;
  }

  const taxableAmountPaise = totalItemsTaxablePaise + deliveryTaxablePaise;
  const totalGstPaise = totalItemsGstPaise + deliveryGstPaise;
  const totalCgstPaise = totalItemsCgstPaise + deliveryCgstPaise;
  const totalSgstPaise = totalItemsSgstPaise + deliverySgstPaise;
  const totalPaise = order.total_paise;

  const buyerAddress = order.address as any;
  const buyerName = order.guest_name || order.user?.name || 'Valued Customer';
  const buyerPhone = order.guest_phone || order.user?.phone || '';

  // 4. Build PDF buffer
  const invoiceDate = new Date();
  const pdfBuffer = await buildInvoicePdfBuffer({
    invoiceNo,
    invoiceDate,
    orderNo: order.order_no,
    orderDate: order.created_at,
    paymentMethod: order.payment_method,
    buyerName,
    buyerPhone,
    buyerAddress,
    items: itemsSnapshot,
    deliveryFeePaise: order.delivery_fee_paise,
    taxableAmountPaise,
    cgstPaise: totalCgstPaise,
    sgstPaise: totalSgstPaise,
    totalGstPaise,
    totalPaise,
  });

  const pdfFileName = `${invoiceNo}.pdf`;
  const pdfUrl = saveInvoicePdfToDisk(pdfFileName, pdfBuffer);

  // 5. Store invoice in database
  const invoice = await prisma.invoice.create({
    data: {
      order_id: order.id,
      invoice_no: invoiceNo,
      invoice_date: invoiceDate,
      seller_name: SELLER_DETAILS.legalName,
      seller_gstin: SELLER_DETAILS.gstin,
      seller_fssai: SELLER_DETAILS.fssai,
      buyer_name: buyerName,
      buyer_phone: buyerPhone,
      buyer_address: buyerAddress,
      delivery_fee_paise: order.delivery_fee_paise,
      taxable_amount_paise: taxableAmountPaise,
      gst_amount_paise: totalGstPaise,
      total_paise: totalPaise,
      cgst_paise: totalCgstPaise,
      sgst_paise: totalSgstPaise,
      igst_paise: 0,
      items_snapshot: itemsSnapshot as any,
      pdf_url: pdfUrl,
    },
    include: {
      credit_notes: true,
    },
  });

  return invoice;
}

/**
 * Generate a Credit Note for a cancelled or returned order that has an invoice.
 * Rule: Cancelled or returned orders get a credit note. Invoices are never deleted or reused.
 */
export async function generateCreditNote(orderId: string, reason: string) {
  // Check if order has an existing invoice
  const invoice = await prisma.invoice.findUnique({
    where: { order_id: orderId },
    include: {
      order: true,
      credit_notes: true,
    },
  });

  if (!invoice) {
    // If no invoice was issued for this order (e.g. cancelled before delivery), no credit note is needed.
    return null;
  }

  // Idempotency: If credit note for this invoice already exists
  if (invoice.credit_notes.length > 0) {
    return invoice.credit_notes[0];
  }

  const creditNoteNo = await getNextCreditNoteNumber(new Date());
  const creditNoteDate = new Date();

  // Build Credit Note PDF buffer
  const pdfBuffer = await buildCreditNotePdfBuffer({
    creditNoteNo,
    creditNoteDate,
    invoiceNo: invoice.invoice_no,
    invoiceDate: invoice.invoice_date,
    orderNo: invoice.order.order_no,
    reason,
    buyerName: invoice.buyer_name,
    buyerPhone: invoice.buyer_phone || '',
    taxableAmountPaise: invoice.taxable_amount_paise,
    gstAmountPaise: invoice.gst_amount_paise,
    totalPaise: invoice.total_paise,
  });

  const pdfFileName = `${creditNoteNo}.pdf`;
  const pdfUrl = saveCreditNotePdfToDisk(pdfFileName, pdfBuffer);

  // Store in database
  const creditNote = await prisma.creditNote.create({
    data: {
      invoice_id: invoice.id,
      credit_note_no: creditNoteNo,
      reason,
      taxable_amount_paise: invoice.taxable_amount_paise,
      gst_amount_paise: invoice.gst_amount_paise,
      total_paise: invoice.total_paise,
      pdf_url: pdfUrl,
    },
  });

  return creditNote;
}
