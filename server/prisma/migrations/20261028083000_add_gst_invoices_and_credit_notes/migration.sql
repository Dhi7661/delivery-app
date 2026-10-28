-- Create database sequence for atomic, sequential GST invoice numbers
CREATE SEQUENCE IF NOT EXISTS invoice_number_seq START WITH 1 INCREMENT BY 1;

-- Create database sequence for atomic, sequential Credit Note numbers
CREATE SEQUENCE IF NOT EXISTS credit_note_number_seq START WITH 1 INCREMENT BY 1;

-- AlterTable invoices to include comprehensive GST details
ALTER TABLE "invoices"
ADD COLUMN IF NOT EXISTS "seller_name" TEXT NOT NULL DEFAULT 'PlukIt Quick Commerce Private Limited',
ADD COLUMN IF NOT EXISTS "seller_gstin" TEXT NOT NULL DEFAULT '27AABCP1234F1Z6',
ADD COLUMN IF NOT EXISTS "seller_fssai" TEXT DEFAULT '11526000000000',
ADD COLUMN IF NOT EXISTS "buyer_name" TEXT NOT NULL DEFAULT '',
ADD COLUMN IF NOT EXISTS "buyer_phone" TEXT,
ADD COLUMN IF NOT EXISTS "buyer_address" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN IF NOT EXISTS "delivery_fee_paise" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "total_paise" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "cgst_paise" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "sgst_paise" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "igst_paise" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "items_snapshot" JSONB NOT NULL DEFAULT '[]';

-- CreateTable credit_notes
CREATE TABLE IF NOT EXISTS "credit_notes" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "credit_note_no" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "taxable_amount_paise" INTEGER NOT NULL,
    "gst_amount_paise" INTEGER NOT NULL,
    "total_paise" INTEGER NOT NULL,
    "pdf_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "credit_notes_credit_note_no_key" ON "credit_notes"("credit_note_no");
CREATE INDEX IF NOT EXISTS "credit_notes_invoice_id_idx" ON "credit_notes"("invoice_id");

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
