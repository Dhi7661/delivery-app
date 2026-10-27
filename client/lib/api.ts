export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

export interface Category {
  id: string;
  name: string;
  sort_order: number;
}

export interface ProductSummary {
  id: string;
  shop_id: string;
  category_id: string;
  name: string;
  brand: string;
  unit_size: string;
  mrp_paise: number;
  selling_price_paise: number;
  is_available: boolean;
}

export interface ProductDetail extends ProductSummary {
  is_active: boolean;
  shop?: {
    id: string;
    name: string;
  };
  category?: {
    id: string;
    name: string;
  };
}

export interface CartItemData {
  id: string;
  product_id: string;
  qty: number;
  name: string;
  brand: string;
  unit_size: string;
  mrp_paise: number;
  selling_price_paise: number;
  line_total_paise: number;
  is_available: boolean;
  shop_id: string;
  shop_name: string;
}

export interface CartData {
  id: string;
  shop_id: string | null;
  shop_name: string | null;
  items: CartItemData[];
  item_count: number;
  subtotal_paise: number;
  delivery_fee_paise: number;
  free_delivery_threshold_paise: number;
  free_delivery_gap_paise: number;
  free_delivery_message: string;
  total_paise: number;
}

export interface OrderItemData {
  id: string;
  order_id: string;
  product_id: string;
  shop_id: string;
  qty: number;
  mrp_paise: number;
  selling_price_paise: number;
  line_total_paise: number;
  product?: {
    id: string;
    name: string;
    brand: string | null;
    unit_size: string;
  };
  shop?: {
    id: string;
    name: string;
  };
}

export interface DeliveryData {
  id: string;
  order_id: string;
  status: 'PENDING' | 'ACCEPTED' | 'PICKED_UP' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'FAILED';
  cod_collected_paise: number;
}

export interface OrderData {
  id: string;
  order_no: string;
  user_id: string | null;
  guest_name: string;
  guest_phone: string;
  address: {
    line1: string;
    landmark?: string | null;
    pincode: string;
  };
  status: 'PLACED' | 'CONFIRMED' | 'PACKED' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'CANCELLED';
  subtotal_paise: number;
  delivery_fee_paise: number;
  total_paise: number;
  payment_method: 'COD';
  payment_status: 'PENDING' | 'PENDING_COLLECTION' | 'PAID' | 'REFUNDED';
  idempotency_key: string;
  created_at: string;
  items: OrderItemData[];
  delivery?: DeliveryData | null;
}

export interface UserData {
  id: string;
  name: string | null;
  phone: string;
  email?: string | null;
  role: string;
}


