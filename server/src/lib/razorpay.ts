import crypto from 'crypto';
import Razorpay from 'razorpay';

export interface CreateGatewayOrderParams {
  amountPaise: number;
  orderNo: string;
  notes?: Record<string, string>;
}

export interface GatewayOrderResult {
  id: string;
  amount: number;
  currency: string;
  receipt: string;
  status: string;
  isSimulated?: boolean;
}

export interface GatewayPaymentEntity {
  id: string;
  order_id: string;
  amount: number;
  currency: string;
  status: 'captured' | 'failed' | 'authorized' | 'refunded';
  method: string;
  notes?: Record<string, string>;
}

const key_id = process.env.RAZORPAY_KEY_ID || 'rzp_test_dummy_key_id';
const key_secret = process.env.RAZORPAY_KEY_SECRET || 'rzp_test_dummy_key_secret';

let razorpayClient: Razorpay | null = null;

export function getRazorpayClient(): Razorpay {
  if (!razorpayClient) {
    razorpayClient = new Razorpay({
      key_id,
      key_secret,
    });
  }
  return razorpayClient;
}

export function getRazorpayKeyId(): string {
  return process.env.RAZORPAY_KEY_ID || 'rzp_test_dummy_key_id';
}

export function getRazorpayWebhookSecret(): string {
  return process.env.RAZORPAY_WEBHOOK_SECRET || 'rzp_test_webhook_secret';
}

/**
 * In-memory registry for simulated gateway payments (used in test mode / Vitest).
 * Key: gateway_order_id, Value: GatewayPaymentEntity[]
 */
const simulatedGatewayPayments = new Map<string, GatewayPaymentEntity[]>();

export function registerSimulatedGatewayPayment(payment: GatewayPaymentEntity) {
  const list = simulatedGatewayPayments.get(payment.order_id) || [];
  list.push(payment);
  simulatedGatewayPayments.set(payment.order_id, list);
}

export function getSimulatedGatewayPayments(orderId: string): GatewayPaymentEntity[] {
  return simulatedGatewayPayments.get(orderId) || [];
}

export function clearSimulatedGatewayPayments() {
  simulatedGatewayPayments.clear();
}

/**
 * Creates a gateway order with Razorpay in paise.
 * If credentials are dummy/offline, falls back cleanly to a simulated test order.
 */
export async function createRazorpayGatewayOrder(
  params: CreateGatewayOrderParams
): Promise<GatewayOrderResult> {
  const { amountPaise, orderNo, notes = {} } = params;

  // Don't call external API if keys are obvious placeholders
  const isDummyKey =
    !process.env.RAZORPAY_KEY_ID ||
    process.env.RAZORPAY_KEY_ID.includes('dummy') ||
    process.env.RAZORPAY_KEY_ID.includes('placeholder') ||
    process.env.NODE_ENV === 'test';

  if (!isDummyKey) {
    try {
      const client = getRazorpayClient();
      const order = await client.orders.create({
        amount: amountPaise,
        currency: 'INR',
        receipt: orderNo,
        notes: {
          order_no: orderNo,
          app: 'PlukIt',
          ...notes,
        },
      });

      return {
        id: order.id,
        amount: Number(order.amount),
        currency: order.currency,
        receipt: order.receipt || orderNo,
        status: order.status,
      };
    } catch (err: any) {
      console.warn('[Razorpay] Gateway order creation through API failed, falling back to test simulation:', err.message);
    }
  }

  // Simulated gateway order for local test mode / tests
  const simulatedId = `order_test_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  return {
    id: simulatedId,
    amount: amountPaise,
    currency: 'INR',
    receipt: orderNo,
    status: 'created',
    isSimulated: true,
  };
}

/**
 * Verifies Razorpay webhook HMAC-SHA256 signature against webhook secret.
 * Rejects unsigned or wrongly signed requests.
 */
export function verifyRazorpayWebhookSignature(
  rawBody: string | Buffer,
  signature: string,
  secret?: string
): boolean {
  if (!signature || !rawBody) {
    return false;
  }

  const webhookSecret = secret || getRazorpayWebhookSecret();
  const bodyString = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf-8');

  try {
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(bodyString)
      .digest('hex');

    const expectedBuf = Buffer.from(expectedSignature, 'utf-8');
    const signatureBuf = Buffer.from(signature, 'utf-8');

    if (expectedBuf.length !== signatureBuf.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuf, signatureBuf);
  } catch (err) {
    console.error('[Razorpay] Signature verification error:', err);
    return false;
  }
}

/**
 * Generates valid HMAC-SHA256 signature for a webhook payload (used for testing and webhook signing).
 */
export function generateRazorpayWebhookSignature(
  payload: string | Buffer | object,
  secret?: string
): string {
  const webhookSecret = secret || getRazorpayWebhookSecret();
  const bodyString =
    typeof payload === 'string'
      ? payload
      : Buffer.isBuffer(payload)
      ? payload.toString('utf-8')
      : JSON.stringify(payload);

  return crypto.createHmac('sha256', webhookSecret).update(bodyString).digest('hex');
}

/**
 * Fetches payments associated with a gateway order.
 * Queries live Razorpay client if configured, otherwise falls back to simulated registry.
 */
export async function fetchGatewayPaymentsForOrder(
  gatewayOrderId: string
): Promise<GatewayPaymentEntity[]> {
  const isDummyKey =
    !process.env.RAZORPAY_KEY_ID ||
    process.env.RAZORPAY_KEY_ID.includes('dummy') ||
    process.env.RAZORPAY_KEY_ID.includes('placeholder') ||
    process.env.NODE_ENV === 'test';

  if (!isDummyKey) {
    try {
      const client = getRazorpayClient();
      const response: any = await client.orders.fetchPayments(gatewayOrderId);
      if (response && Array.isArray(response.items)) {
        return response.items.map((p: any) => ({
          id: p.id,
          order_id: p.order_id,
          amount: Number(p.amount),
          currency: p.currency,
          status: p.status,
          method: p.method || 'upi',
          notes: p.notes,
        }));
      }
    } catch (err: any) {
      console.warn(`[Razorpay] Failed to fetch payments for order ${gatewayOrderId} from API:`, err.message);
    }
  }

  // Simulated fallback
  return getSimulatedGatewayPayments(gatewayOrderId);
}
