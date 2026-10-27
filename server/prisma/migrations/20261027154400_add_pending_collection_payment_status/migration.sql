-- AlterEnum
ALTER TYPE "PaymentStatus" ADD VALUE 'PENDING_COLLECTION';

-- Seed serviceable pincode 411001
INSERT INTO "serviceable_pincodes" ("pincode", "is_active", "delivery_fee_paise", "free_threshold_paise")
VALUES ('411001', true, 2000, 30000)
ON CONFLICT ("pincode") DO NOTHING;
