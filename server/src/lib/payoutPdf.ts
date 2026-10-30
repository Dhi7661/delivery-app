import PDFDocument from 'pdfkit';
import { BRAND_NAME, SUPPORT_EMAIL } from './brand.js';
import { paiseToRupees, SELLER_DETAILS } from './invoice.js';

export interface PayoutPdfStatementData {
  payoutId: string;
  status: string;
  periodStart: Date;
  periodEnd: Date;
  paidAt?: Date | null;
  bankReference?: string | null;
  grossSalesPaise: number;
  deductionsPaise: number;
  amountPaise: number;
  shop: {
    name: string;
    address?: string | null;
    phone?: string | null;
    gstin?: string | null;
    fssai?: string | null;
    bank_ref?: {
      account_number?: string | null;
      last4?: string | null;
      ifsc_code?: string | null;
      bank_name?: string | null;
      account_name?: string | null;
    } | null;
  };
  ledgerEntries: Array<{
    id: string;
    created_at: Date;
    entry_type: string;
    amount_paise: number;
    notes?: string | null;
    order_item?: {
      order?: { order_no: string } | null;
      product?: { name: string; unit_size?: string | null } | null;
    } | null;
  }>;
}

/**
 * Mask bank account number showing only last 4 digits (e.g., •••• 1234).
 */
function maskAccountNumber(accountNo?: string | null, last4?: string | null): string {
  if (last4) return `•••• •••• ${last4}`;
  if (!accountNo) return 'N/A';
  const clean = accountNo.trim();
  if (clean.length <= 4) return clean;
  return `•••• •••• ${clean.slice(-4)}`;
}

/**
 * Formats a Date to DD MMM YYYY.
 */
function formatDate(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Generates a clean, professional Payout Statement PDF using PDFKit.
 */
export async function buildPayoutStatementPdfBuffer(data: PayoutPdfStatementData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4', compress: false });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', (err) => reject(err));

    // Header Title
    doc.fontSize(18).font('Helvetica-Bold').fillColor('#0f172a').text(`${BRAND_NAME} PARTNER PAYOUT STATEMENT`, { align: 'center' });
    doc.moveDown(0.2);
    doc.fontSize(9).font('Helvetica').fillColor('#64748b').text('Fortnightly Partner Settlement Statement (15-Day Cycle)', { align: 'center' });
    doc.moveDown(0.8);

    const startY = doc.y;

    // Platform / Issuer Box (Left)
    doc.rect(40, startY, 250, 90).stroke('#cbd5e1');
    doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#0f172a').text('ISSUED BY:', 48, startY + 8);
    doc.font('Helvetica-Bold').fontSize(8).text(SELLER_DETAILS.legalName, 48, startY + 20);
    doc.font('Helvetica').fontSize(8).fillColor('#475569')
      .text(SELLER_DETAILS.address, 48, startY + 32, { width: 235 })
      .text(`GSTIN: ${SELLER_DETAILS.gstin} | Support: ${SUPPORT_EMAIL}`, 48, startY + 68);

    // Shop Partner Box (Right)
    doc.rect(305, startY, 250, 90).stroke('#cbd5e1');
    doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#0f172a').text('PARTNER SHOP DETAILS:', 313, startY + 8);
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#1e40af').text(data.shop.name, 313, startY + 20);
    doc.font('Helvetica').fontSize(8).fillColor('#475569')
      .text(data.shop.address || 'Local Partner Outlet', 313, startY + 32, { width: 235 })
      .text(`Phone: ${data.shop.phone || 'N/A'} | FSSAI: ${data.shop.fssai || 'N/A'}`, 313, startY + 56)
      .text(`GSTIN: ${data.shop.gstin || 'Unregistered / Composition'}`, 313, startY + 68);

    doc.y = startY + 98;

    // Settlement Info & Bank Reference Box
    const metaY = doc.y;
    doc.rect(40, metaY, 515, 68).fillAndStroke('#f8fafc', '#cbd5e1');

    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(8.5);
    doc.text('Payout Statement ID:', 48, metaY + 8);
    doc.font('Helvetica').text(data.payoutId, 160, metaY + 8);

    doc.font('Helvetica-Bold').text('Settlement Period:', 48, metaY + 22);
    doc.font('Helvetica').text(`${formatDate(data.periodStart)}  to  ${formatDate(data.periodEnd)}`, 160, metaY + 22);

    doc.font('Helvetica-Bold').text('Settlement Status:', 48, metaY + 36);
    doc.font('Helvetica-Bold').fillColor(data.status === 'PAID' ? '#15803d' : '#b45309')
      .text(data.status === 'PAID' ? 'PAID / LOCKED' : 'SCHEDULED', 160, metaY + 36);

    doc.fillColor('#0f172a').font('Helvetica-Bold').text('Bank Account:', 313, metaY + 8);
    const bankAcct = maskAccountNumber(data.shop.bank_ref?.account_number, data.shop.bank_ref?.last4);
    const ifsc = data.shop.bank_ref?.ifsc_code || 'N/A';
    doc.font('Helvetica').text(`${bankAcct} (${ifsc})`, 410, metaY + 8);

    doc.font('Helvetica-Bold').text('Bank / Beneficiary:', 313, metaY + 22);
    doc.font('Helvetica').text(`${data.shop.bank_ref?.bank_name || 'Bank'} / ${data.shop.bank_ref?.account_name || data.shop.name}`, 410, metaY + 22, { width: 140 });

    doc.font('Helvetica-Bold').text('Bank Transfer Ref (UTR):', 313, metaY + 36);
    doc.font('Helvetica').text(data.bankReference || 'Pending Transfer', 430, metaY + 36);

    doc.font('Helvetica-Bold').text('Paid At:', 313, metaY + 50);
    doc.font('Helvetica').text(data.paidAt ? formatDate(data.paidAt) : 'Pending Transfer', 430, metaY + 50);

    doc.y = metaY + 78;

    // Itemized Ledger Entries Header
    let currentY = doc.y;
    doc.rect(40, currentY, 515, 20).fillAndStroke('#0f172a', '#0f172a');
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8);
    doc.text('Date', 48, currentY + 6);
    doc.text('Type', 115, currentY + 6);
    doc.text('Order / Description', 185, currentY + 6);
    doc.text('Amount (₹)', 485, currentY + 6, { align: 'right', width: 62 });

    currentY += 20;

    // Rows
    const maxRowsPerPage = 18;
    const entriesToShow = data.ledgerEntries.slice(0, 40); // show up to 40 entries

    let rowIndex = 0;
    for (const entry of entriesToShow) {
      if (currentY > 680) {
        doc.addPage();
        currentY = 40;
        // Repeat table header on new page
        doc.rect(40, currentY, 515, 20).fillAndStroke('#0f172a', '#0f172a');
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8);
        doc.text('Date', 48, currentY + 6);
        doc.text('Type', 115, currentY + 6);
        doc.text('Order / Description', 185, currentY + 6);
        doc.text('Amount (₹)', 485, currentY + 6, { align: 'right', width: 62 });
        currentY += 20;
      }

      const isEven = rowIndex % 2 === 0;
      doc.rect(40, currentY, 515, 18).fillAndStroke(isEven ? '#ffffff' : '#f8fafc', '#e2e8f0');

      doc.font('Helvetica').fontSize(7.5).fillColor('#334155');
      doc.text(formatDate(entry.created_at), 48, currentY + 5);

      const typeLabel =
        entry.entry_type === 'SALE'
          ? 'SALE (+)'
          : entry.entry_type === 'RETURN_DEDUCTION'
          ? 'RETURN (-)'
          : 'ADJUSTMENT';
      const typeColor =
        entry.entry_type === 'SALE'
          ? '#15803d'
          : entry.entry_type === 'RETURN_DEDUCTION'
          ? '#b91c1c'
          : '#4338ca';

      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(typeColor).text(typeLabel, 115, currentY + 5);

      let desc = entry.notes || '';
      if (entry.order_item?.order?.order_no) {
        desc = `Order #${entry.order_item.order.order_no}: ${entry.order_item.product?.name || 'Item'}`;
      }
      doc.font('Helvetica').fontSize(7.5).fillColor('#334155').text(desc, 185, currentY + 5, {
        width: 290,
        ellipsis: true,
      });

      const formattedAmount =
        entry.entry_type === 'RETURN_DEDUCTION' || entry.amount_paise < 0
          ? `-₹${paiseToRupees(Math.abs(entry.amount_paise))}`
          : `+₹${paiseToRupees(entry.amount_paise)}`;

      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(typeColor)
        .text(formattedAmount, 485, currentY + 5, { align: 'right', width: 62 });

      currentY += 18;
      rowIndex++;
    }

    if (data.ledgerEntries.length > entriesToShow.length) {
      doc.rect(40, currentY, 515, 16).fillAndStroke('#f1f5f9', '#e2e8f0');
      doc.font('Helvetica-Oblique').fontSize(7.5).fillColor('#64748b')
        .text(`... and ${data.ledgerEntries.length - entriesToShow.length} more entries recorded in this payout period.`, 48, currentY + 4);
      currentY += 16;
    }

    // Totals Box
    if (currentY > 640) {
      doc.addPage();
      currentY = 40;
    }

    currentY += 8;
    doc.rect(40, currentY, 515, 68).fillAndStroke('#f8fafc', '#cbd5e1');

    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(8.5);
    doc.text('Gross Item Sales Credit:', 48, currentY + 8);
    doc.text(`+₹${paiseToRupees(data.grossSalesPaise)}`, 430, currentY + 8, { align: 'right', width: 115 });

    doc.text('Returns & Damaged Goods Deductions:', 48, currentY + 22);
    doc.text(`-₹${paiseToRupees(data.deductionsPaise)}`, 430, currentY + 22, { align: 'right', width: 115 });

    doc.rect(48, currentY + 36, 497, 1).stroke('#94a3b8');

    doc.fontSize(10).fillColor('#0f172a').font('Helvetica-Bold');
    doc.text('NET SETTLEMENT AMOUNT:', 48, currentY + 46);
    doc.fillColor('#15803d').text(`₹${paiseToRupees(data.amountPaise)}`, 400, currentY + 46, { align: 'right', width: 145 });

    currentY += 76;

    // Settlement Terms & Signatory
    doc.rect(40, currentY, 340, 50).stroke('#cbd5e1');
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#0f172a').text('Settlement Terms & Period Locking Policy:', 48, currentY + 6);
    doc.font('Helvetica').fontSize(7).fillColor('#64748b')
      .text('1. In accordance with F23 policy, once marked PAID, this payout period is permanently locked.', 48, currentY + 16)
      .text('2. Past locked periods cannot be edited. Any subsequent corrections appear as adjustment entries in the next period.', 48, currentY + 26)
      .text('3. This statement is computer-generated and serves as official settlement advice for your accounting.', 48, currentY + 36);

    doc.rect(385, currentY, 170, 50).stroke('#cbd5e1');
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#0f172a')
      .text(`For ${BRAND_NAME} Operations`, 393, currentY + 6, { align: 'center', width: 154 });
    doc.font('Helvetica-Oblique').fontSize(7).fillColor('#15803d')
      .text(data.status === 'PAID' ? '[Electronically Settled]' : '[Pending Settlement]', 393, currentY + 22, { align: 'center', width: 154 });
    doc.font('Helvetica').fontSize(7).fillColor('#64748b')
      .text('Finance & Accounts', 393, currentY + 36, { align: 'center', width: 154 });

    doc.end();
  });
}
