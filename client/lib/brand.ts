/**
 * Global brand constants for PlukIt frontend.
 * Never hardcode brand names in UI components; import from this file.
 */

export const BRAND_NAME = 'PlukIt';
export const BRAND_PREFIX = 'PLUK';
export const SUPPORT_EMAIL = 'support@plukit.in';
export const BRAND_TAGLINE = 'Fresh & fast from your local neighbourhood shops';
export const BRAND_DESCRIPTION = 'Order everyday essentials and groceries from trusted local partner stores with personal, fast delivery.';

// Delivery ETA text (set to "20-25 mins" per Warm Saffron spec)
export const DELIVERY_ETA_TEXT = '20-25 mins';

// Feature flags for UI redesign (all set to false per Warm Saffron spec)
// 1. Debit and credit card payment option (cards are disabled)
export const SHOW_CARDS_PAYMENT = false;
// 2. Scheduled morning delivery
export const SHOW_SCHEDULED_DELIVERY = false;
// 3. Live map, delivery partner name, rating, and call button (keep status timeline)
export const SHOW_LIVE_MAP_PARTNER = false;
// 4. Kirana Pass, seasonal savings, total saved, and refund totals
export const SHOW_PASS_AND_SAVINGS = false;
// 5. Store savings discount, handling fee, and pepper bag fee lines
export const SHOW_FEE_BREAKDOWN_LINES = false;
// 6. Language selector
export const SHOW_LANGUAGE_SELECTOR = false;
// 7. Reorder and "Reorder in 1-click" buttons
export const SHOW_REORDER_BUTTONS = false;
// 8. Trending and Popular sections
export const SHOW_POPULAR_SECTION = false;
// 9. Product claims and badges (Direct, Stone ground, Chemical free, quality guarantee, zero pesticide, trusted farm, sourcing footers)
export const SHOW_PRODUCT_CLAIMS = false;
// 10. Announcement banners
export const SHOW_ANNOUNCEMENT = false;
// 11. Delivery instructions text box
export const SHOW_DELIVERY_INSTRUCTIONS = false;
// 12. Track Live Delivery button
export const SHOW_TRACK_LIVE_BUTTON = false;
// 13. Filter chips other than "All"
export const SHOW_EXTRA_FILTER_CHIPS = false;

// Theme color tokens (Warm Saffron)
export const THEME_TOKENS = {
  background: '#FEF9F1',
  card: '#FFFFFF',
  border: '#D7C2B9',
  surface: '#F8F3EB',
  chip: '#F2EDE5',
  primary: '#6B3A1E',
  heading: '#50240A',
  text: '#1D1C17',
  muted: '#52443D',
  saffron: '#FEBA49',
  onSaffron: '#704B00',
  danger: '#B42318',
} as const;
