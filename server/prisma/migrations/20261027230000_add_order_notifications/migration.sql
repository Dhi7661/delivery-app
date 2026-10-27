-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('SMS', 'WHATSAPP', 'EMAIL');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "order_notifications" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "order_status" "OrderStatus" NOT NULL,
    "recipient_type" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL DEFAULT 'SMS',
    "message" TEXT NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "order_notifications_order_id_idx" ON "order_notifications"("order_id");

-- CreateIndex
CREATE INDEX "order_notifications_status_created_at_idx" ON "order_notifications"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "order_notifications_order_id_order_status_recipient_type_re_key" ON "order_notifications"("order_id", "order_status", "recipient_type", "recipient", "channel");

-- AddForeignKey
ALTER TABLE "order_notifications" ADD CONSTRAINT "order_notifications_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
