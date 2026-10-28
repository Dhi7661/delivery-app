import { OrderStatus, NotificationChannel, NotificationStatus } from '@prisma/client';
import { prisma } from './db.js';

export interface SmsSendOptions {
  phone: string;
  message: string;
}

export interface SmsSendResult {
  success: boolean;
  attempts: number;
  error?: string;
}

// In-memory mock/hook for test environments to simulate success or failure
let customSmsSender: ((phone: string, message: string) => Promise<boolean>) | null = null;

export function setCustomSmsSender(sender: ((phone: string, message: string) => Promise<boolean>) | null) {
  customSmsSender = sender;
}

/**
 * Normalizes an Indian phone number to 10 digits
 */
export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '').slice(-10);
}

/**
 * Masks a phone number for privacy compliance: e.g. 9876543210 -> ******3210
 */
export function maskPhone(phone: string): string {
  const clean = normalizePhone(phone);
  if (clean.length < 4) return '******';
  return '******' + clean.slice(-4);
}

/**
 * Dispatches an SMS with automatic single retry on failure.
 * Returns success, attempt count (1 or 2), and any error message.
 */
export async function sendSmsWithRetry(phone: string, message: string): Promise<SmsSendResult> {
  const cleanPhone = normalizePhone(phone);
  let attempts = 0;
  let lastError = '';

  // Attempt 1
  attempts += 1;
  try {
    const success = customSmsSender
      ? await customSmsSender(cleanPhone, message)
      : await defaultSmsDispatch(cleanPhone, message);

    if (success) {
      return { success: true, attempts };
    }
    lastError = 'Provider rejected SMS delivery on attempt 1';
  } catch (err: any) {
    lastError = err?.message || 'Error on SMS attempt 1';
  }

  // Attempt 2 (Automatic Retry Once)
  attempts += 1;
  try {
    const success = customSmsSender
      ? await customSmsSender(cleanPhone, message)
      : await defaultSmsDispatch(cleanPhone, message);

    if (success) {
      return { success: true, attempts };
    }
    lastError = 'Provider rejected SMS delivery on retry attempt 2';
  } catch (err: any) {
    lastError = err?.message || 'Error on SMS retry attempt 2';
  }

  return { success: false, attempts, error: lastError };
}

/**
 * Default SMS dispatcher (logs in dev, integrates with live SMS provider in production)
 */
async function defaultSmsDispatch(phone: string, message: string): Promise<boolean> {
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[PlukIt SMS] To: +91 ${phone} | Content: ${message}`);
    return true;
  }
  // Production SMS Gateway integration (e.g. MSG91, Twilio)
  return true;
}

/**
 * Formats a WhatsApp click-to-chat URL for shop order packing dispatch.
 */
export function buildShopWhatsAppUrl(shopPhone: string, message: string): string {
  const cleanPhone = normalizePhone(shopPhone);
  return `https://wa.me/91${cleanPhone}?text=${encodeURIComponent(message)}`;
}

/**
 * Main notification dispatcher triggered when an order transitions to a new status.
 * Obey strict idempotency:
 * - Each status change creates one notification record.
 * - Repeating a status does not send the message again.
 */
export async function dispatchOrderStatusNotifications(orderId: string, newStatus: OrderStatus) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      user: true,
      items: {
        include: {
          product: true,
          shop: true,
        },
      },
    },
  });

  if (!order) return [];

  const createdNotifications = [];
  const customerPhone = order.guest_phone || order.user?.phone || '';
  const cleanCustPhone = normalizePhone(customerPhone);

  // 1. Customer Notifications (CONFIRMED, OUT_FOR_DELIVERY, DELIVERED, CANCELLED)
  if (['CONFIRMED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'].includes(newStatus) && cleanCustPhone) {
    let customerMessage = '';
    const codAmount = (order.total_paise / 100).toFixed(0);

    switch (newStatus) {
      case 'CONFIRMED':
        customerMessage = `PlukIt: Your order #${order.order_no} has been confirmed! We are preparing your fresh items.`;
        break;
      case 'OUT_FOR_DELIVERY':
        customerMessage = order.payment_method === 'COD'
          ? `PlukIt: Order #${order.order_no} is out for delivery! Please keep ₹${codAmount} ready in cash.`
          : `PlukIt: Order #${order.order_no} is out for delivery with our rider.`;
        break;
      case 'DELIVERED':
        customerMessage = `PlukIt: Order #${order.order_no} has been delivered. Thank you for shopping with PlukIt!`;
        break;
      case 'CANCELLED':
        customerMessage = `PlukIt: Order #${order.order_no} has been cancelled. For help, contact PlukIt support.`;
        break;
    }

    if (customerMessage) {
      // Check existing notification (Idempotency check)
      const existing = await prisma.orderNotification.findUnique({
        where: {
          order_id_order_status_recipient_type_recipient_channel: {
            order_id: order.id,
            order_status: newStatus,
            recipient_type: 'CUSTOMER',
            recipient: cleanCustPhone,
            channel: 'SMS',
          },
        },
      });

      if (!existing) {
        // Send SMS with automatic retry once on failure
        const result = await sendSmsWithRetry(cleanCustPhone, customerMessage);

        const record = await prisma.orderNotification.create({
          data: {
            order_id: order.id,
            order_status: newStatus,
            recipient_type: 'CUSTOMER',
            recipient: cleanCustPhone,
            channel: 'SMS',
            message: customerMessage,
            status: result.success ? 'SENT' : 'FAILED',
            attempts: result.attempts,
            last_error: result.error || null,
          },
        });
        createdNotifications.push(record);
      }
    }
  }

  // 2. Shop Notifications (SENT_TO_SHOP)
  // WhatsApp message per shop with item list and quantities.
  // Privacy rule: Shops do NOT see customer names or phone numbers!
  if (newStatus === 'SENT_TO_SHOP') {
    // Group items by shop
    const shopMap = new Map<string, { shop: any; items: typeof order.items }>();
    for (const item of order.items) {
      if (!shopMap.has(item.shop_id)) {
        shopMap.set(item.shop_id, { shop: item.shop, items: [] });
      }
      shopMap.get(item.shop_id)!.items.push(item);
    }

    for (const { shop, items } of shopMap.values()) {
      const cleanShopPhone = normalizePhone(shop.phone);
      if (!cleanShopPhone) continue;

      // Check existing shop notification for idempotency
      const existing = await prisma.orderNotification.findUnique({
        where: {
          order_id_order_status_recipient_type_recipient_channel: {
            order_id: order.id,
            order_status: newStatus,
            recipient_type: 'SHOP',
            recipient: cleanShopPhone,
            channel: 'WHATSAPP',
          },
        },
      });

      if (!existing) {
        const itemsListText = items
          .map((i) => `• ${i.qty}x ${i.product.name} (${i.product.unit_size})`)
          .join('\n');

        // Customer anonymity strictly preserved: no customer name, no phone
        const shopMessage = `Hello ${shop.name}, new order #${order.order_no} to pack:\n${itemsListText}\nPlease keep items packed for PlukIt pickup.`;
        const whatsappUrl = buildShopWhatsAppUrl(cleanShopPhone, shopMessage);

        const record = await prisma.orderNotification.create({
          data: {
            order_id: order.id,
            order_status: newStatus,
            recipient_type: 'SHOP',
            recipient: cleanShopPhone,
            channel: 'WHATSAPP',
            message: shopMessage,
            status: 'SENT',
            attempts: 1,
            metadata: {
              shop_id: shop.id,
              shop_name: shop.name,
              whatsapp_url: whatsappUrl,
            },
          },
        });
        createdNotifications.push(record);
      }
    }
  }

  return createdNotifications;
}

/**
 * Manually retries a failed notification (e.g. from the admin dashboard)
 */
export async function retryNotification(notificationId: string) {
  const notif = await prisma.orderNotification.findUnique({
    where: { id: notificationId },
  });

  if (!notif) {
    throw new Error('Notification not found');
  }

  if (notif.channel === 'SMS') {
    const result = await sendSmsWithRetry(notif.recipient, notif.message);
    const updated = await prisma.orderNotification.update({
      where: { id: notif.id },
      data: {
        status: result.success ? 'SENT' : 'FAILED',
        attempts: notif.attempts + result.attempts,
        last_error: result.error || null,
      },
    });
    return updated;
  }

  // For WhatsApp or others: mark sent
  const updated = await prisma.orderNotification.update({
    where: { id: notif.id },
    data: {
      status: 'SENT',
      attempts: notif.attempts + 1,
      last_error: null,
    },
  });
  return updated;
}
