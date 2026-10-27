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
