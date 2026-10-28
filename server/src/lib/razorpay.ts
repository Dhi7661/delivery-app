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
