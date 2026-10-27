-- Create database sequence for atomic, concurrent order numbering
CREATE SEQUENCE IF NOT EXISTS order_number_seq START WITH 1 INCREMENT BY 1;

-- DropForeignKey
ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_user_id_fkey";

-- AlterTable
ALTER TABLE "deliveries" ALTER COLUMN "status" SET DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "orders" DROP COLUMN IF EXISTS "address_snapshot",
DROP COLUMN IF EXISTS "discount_paise",
ADD COLUMN "address" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN "guest_name" TEXT,
ADD COLUMN "guest_phone" TEXT,
ADD COLUMN "idempotency_key" TEXT NOT NULL,
ALTER COLUMN "user_id" DROP NOT NULL;

-- Remove default on address after existing row backfill
ALTER TABLE "orders" ALTER COLUMN "address" DROP DEFAULT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "orders_idempotency_key_key" ON "orders"("idempotency_key");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
