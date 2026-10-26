/**
 * Pricing rules and Indian Legal Metrology enforcement.
 * Rule: Customer selling price must NEVER exceed the printed MRP.
 */

export interface PricingCheckParams {
  mrp_paise: number;
  selling_price_paise: number;
  shop_price_paise: number;
}

export function validatePriceNotAboveMRP(params: PricingCheckParams): { valid: boolean; error?: string } {
  const { mrp_paise, selling_price_paise, shop_price_paise } = params;

  if (!Number.isInteger(mrp_paise) || mrp_paise <= 0) {
    return { valid: false, error: 'MRP must be a positive integer in paise.' };
  }

  if (!Number.isInteger(selling_price_paise) || selling_price_paise <= 0) {
    return { valid: false, error: 'Selling price must be a positive integer in paise.' };
  }

  if (selling_price_paise > mrp_paise) {
    return {
      valid: false,
      error: `Selling price (₹${selling_price_paise / 100}) cannot exceed printed MRP (₹${mrp_paise / 100}). Violation of Legal Metrology.`,
    };
  }

  if (shop_price_paise > mrp_paise) {
    return {
      valid: false,
      error: `Shop price cannot exceed printed MRP.`,
    };
  }

  return { valid: true };
}

export function calculateOrderTotals(params: {
  items: Array<{ selling_price_paise: number; qty: number }>;
  delivery_fee_paise: number;
  free_threshold_paise: number;
  discount_paise?: number;
}): {
  subtotal_paise: number;
  delivery_fee_paise: number;
  discount_paise: number;
  total_paise: number;
} {
  const subtotal_paise = params.items.reduce((acc, item) => acc + item.selling_price_paise * item.qty, 0);
  
  // Free delivery threshold check (server-evaluated only)
  const applied_delivery_fee = subtotal_paise >= params.free_threshold_paise ? 0 : params.delivery_fee_paise;
  const discount_paise = params.discount_paise || 0;
  const total_paise = subtotal_paise + applied_delivery_fee - discount_paise;

  return {
    subtotal_paise,
    delivery_fee_paise: applied_delivery_fee,
    discount_paise,
    total_paise: Math.max(0, total_paise),
  };
}
