/**
 * Realistic Dummy Catalog Seed Data for PlukIt (F02)
 *
 * Rules:
 * - 2 dummy shops with status ACTIVE
 * - 5 categories
 * - 30 realistic products distributed across shops
 * - shop_price_paise <= mrp_paise
 * - selling_price_paise <= mrp_paise (equal to mrp_paise unless discounted)
 * - Dummy shops and products clearly marked with [DUMMY]
 */

export interface DummyShop {
  name: string;
  owner_name: string;
  phone: string;
  status: 'ACTIVE' | 'INACTIVE';
  commission_rate: number;
}

export interface DummyCategory {
  name: string;
  sort_order: number;
}

export interface DummyProduct {
  shopName: string;
  categoryName: string;
  name: string;
  brand: string;
  unit_size: string;
  mrp_paise: number;
  shop_price_paise: number;
  selling_price_paise: number;
  is_active: boolean;
  is_available: boolean;
}

export const DUMMY_SHOPS: DummyShop[] = [
  {
    name: '[DUMMY] Green Valley Supermarket',
    owner_name: 'Ramesh Sharma',
    phone: '+919876543210',
    status: 'ACTIVE',
    commission_rate: 0.1,
  },
  {
    name: '[DUMMY] Daily Fresh Essentials',
    owner_name: 'Suresh Patel',
    phone: '+919876543211',
    status: 'ACTIVE',
    commission_rate: 0.1,
  },
];

export const DUMMY_CATEGORIES: DummyCategory[] = [
  { name: 'Groceries', sort_order: 1 },
  { name: 'Dairy', sort_order: 2 },
  { name: 'Snacks', sort_order: 3 },
  { name: 'Beverages', sort_order: 4 },
  { name: 'Personal Care', sort_order: 5 },
];

export const DUMMY_PRODUCTS: DummyProduct[] = [
  // Shop 1: Green Valley Supermarket (15 products)
  // Groceries
  {
    shopName: '[DUMMY] Green Valley Supermarket',
    categoryName: 'Groceries',
    name: '[DUMMY] Aashirvaad Shudh Chakki Atta',
    brand: 'Aashirvaad',
    unit_size: '5 kg',
    mrp_paise: 27500, // ₹275
    shop_price_paise: 24000,
    selling_price_paise: 26500, // ₹265 (discounted)
    is_active: true,
    is_available: true,
  },
  {
    shopName: '[DUMMY] Green Valley Supermarket',
    categoryName: 'Groceries',
    name: '[DUMMY] Tata Salt Iodized',
    brand: 'Tata',
    unit_size: '1 kg',
    mrp_paise: 2800, // ₹28
    shop_price_paise: 2400,
    selling_price_paise: 2800,
    is_active: true,
    is_available: true,
  },
  {
    shopName: '[DUMMY] Green Valley Supermarket',
    categoryName: 'Groceries',
    name: '[DUMMY] Fortune Sunlite Refined Sunflower Oil',
    brand: 'Fortune',
    unit_size: '1 L',
    mrp_paise: 16500, // ₹165
    shop_price_paise: 14500,
    selling_price_paise: 16000,
    is_active: true,
    is_available: true,
  },
  {
    shopName: '[DUMMY] Green Valley Supermarket',
    categoryName: 'Groceries',
    name: '[DUMMY] Tata Sampann Unpolished Toor Dal',
    brand: 'Tata Sampann',
    unit_size: '1 kg',
    mrp_paise: 19500, // ₹195
    shop_price_paise: 17000,
    selling_price_paise: 19500,
    is_active: true,
    is_available: true,
  },
  // Dairy
  {
    shopName: '[DUMMY] Green Valley Supermarket',
    categoryName: 'Dairy',
    name: '[DUMMY] Amul Taaza Homogenised Toned Milk',
    brand: 'Amul',
    unit_size: '1 L',
    mrp_paise: 7400, // ₹74
    shop_price_paise: 6800,
    selling_price_paise: 7400,
    is_active: true,
    is_available: true,
  },
  {
    shopName: '[DUMMY] Green Valley Supermarket',
    categoryName: 'Dairy',
    name: '[DUMMY] Amul Butter Pasteurized',
    brand: 'Amul',
    unit_size: '500 g',
    mrp_paise: 27500, // ₹275
    shop_price_paise: 25000,
    selling_price_paise: 27500,
    is_active: true,
    is_available: true,
  },
  {
    shopName: '[DUMMY] Green Valley Supermarket',
    categoryName: 'Dairy',
    name: '[DUMMY] Mother Dairy Classic Dahi',
    brand: 'Mother Dairy',
    unit_size: '400 g',
    mrp_paise: 3500, // ₹35
    shop_price_paise: 3000,
    selling_price_paise: 3500,
    is_active: true,
    is_available: true,
  },
  // Snacks
  {
    shopName: '[DUMMY] Green Valley Supermarket',
    categoryName: 'Snacks',
    name: '[DUMMY] Haldiram Nagpur Aloo Bhujia',
    brand: 'Haldiram',
    unit_size: '400 g',
    mrp_paise: 11500, // ₹115
    shop_price_paise: 9500,
    selling_price_paise: 11000,
    is_active: true,
    is_available: true,
  },
  {
    shopName: '[DUMMY] Green Valley Supermarket',
    categoryName: 'Snacks',
    name: '[DUMMY] Parle-G Gold Biscuits',
    brand: 'Parle',
    unit_size: '1 kg',
    mrp_paise: 14000, // ₹140
    shop_price_paise: 12000,
    selling_price_paise: 14000,
    is_active: true,
    is_available: true,
  },
  {
    shopName: '[DUMMY] Green Valley Supermarket',
    categoryName: 'Snacks',
    name: '[DUMMY] Lay\'s India\'s Magic Masala Chips',
    brand: 'Lay\'s',
    unit_size: '90 g',
    mrp_paise: 4000, // ₹40
    shop_price_paise: 3400,
    selling_price_paise: 4000,
    is_active: true,
    is_available: true,
  },
  // Beverages
  {
    shopName: '[DUMMY] Green Valley Supermarket',
    categoryName: 'Beverages',
    name: '[DUMMY] Taj Mahal Tea Rich Flavoured Leaves',
    brand: 'Taj Mahal',
    unit_size: '500 g',
    mrp_paise: 36000, // ₹360
    shop_price_paise: 31000,
    selling_price_paise: 35000,
    is_active: true,
    is_available: true,
  },
  {
    shopName: '[DUMMY] Green Valley Supermarket',
    categoryName: 'Beverages',
    name: '[DUMMY] Nescafe Classic Instant Coffee Jar',
    brand: 'Nescafe',
    unit_size: '100 g',
    mrp_paise: 35000, // ₹350
    shop_price_paise: 30000,
    selling_price_paise: 35000,
    is_active: true,
    is_available: true,
  },
  // Personal Care
  {
    shopName: '[DUMMY] Green Valley Supermarket',
    categoryName: 'Personal Care',
    name: '[DUMMY] Dettol Original Liquid Handwash Refill',
    brand: 'Dettol',
    unit_size: '675 ml',
    mrp_paise: 11900, // ₹119
    shop_price_paise: 9900,
    selling_price_paise: 11500,
    is_active: true,
    is_available: true,
  },
  {
    shopName: '[DUMMY] Green Valley Supermarket',
    categoryName: 'Personal Care',
    name: '[DUMMY] Colgate Strong Teeth Toothpaste',
    brand: 'Colgate',
    unit_size: '300 g',
    mrp_paise: 16500, // ₹165
    shop_price_paise: 14000,
    selling_price_paise: 16500,
    is_active: true,
    is_available: true,
  },
  {
    shopName: '[DUMMY] Green Valley Supermarket',
    categoryName: 'Personal Care',
    name: '[DUMMY] Dove Cream Beauty Bathing Bar (Pack of 3)',
    brand: 'Dove',
    unit_size: '3 x 100 g',
    mrp_paise: 21000, // ₹210
    shop_price_paise: 18000,
    selling_price_paise: 20500,
    is_active: true,
    is_available: true,
  },

  // Shop 2: Daily Fresh Essentials (15 products)
  // Groceries
  {
    shopName: '[DUMMY] Daily Fresh Essentials',
    categoryName: 'Groceries',
    name: '[DUMMY] Daawat Rozana Super Basmati Rice',
    brand: 'Daawat',
    unit_size: '5 kg',
    mrp_paise: 42500, // ₹425
    shop_price_paise: 36000,
    selling_price_paise: 41000,
    is_active: true,
    is_available: true,
  },
  {
    shopName: '[DUMMY] Daily Fresh Essentials',
    categoryName: 'Groceries',
    name: '[DUMMY] Saffola Gold Pro Healthy Lifestyle Oil',
    brand: 'Saffola',
    unit_size: '1 L',
    mrp_paise: 18000, // ₹180
    shop_price_paise: 15500,
    selling_price_paise: 17500,
    is_active: true,
    is_available: true,
  },
  {
    shopName: '[DUMMY] Daily Fresh Essentials',
    categoryName: 'Groceries',
    name: '[DUMMY] Tata Sampann Moong Dal Split',
    brand: 'Tata Sampann',
    unit_size: '500 g',
    mrp_paise: 9500, // ₹95
    shop_price_paise: 8000,
    selling_price_paise: 9500,
    is_active: true,
    is_available: true,
  },
  {
    shopName: '[DUMMY] Daily Fresh Essentials',
    categoryName: 'Groceries',
    name: '[DUMMY] Catch Turmeric Powder (Haldi)',
    brand: 'Catch',
    unit_size: '200 g',
    mrp_paise: 6500, // ₹65
    shop_price_paise: 5200,
    selling_price_paise: 6500,
    is_active: true,
    is_available: true,
  },
  // Dairy
  {
    shopName: '[DUMMY] Daily Fresh Essentials',
    categoryName: 'Dairy',
    name: '[DUMMY] Amul Malai Fresh Paneer',
    brand: 'Amul',
    unit_size: '200 g',
    mrp_paise: 9500, // ₹95
    shop_price_paise: 8200,
    selling_price_paise: 9500,
    is_active: true,
    is_available: true,
  },
  {
    shopName: '[DUMMY] Daily Fresh Essentials',
    categoryName: 'Dairy',
    name: '[DUMMY] Amul Pure Ghee Pouch',
    brand: 'Amul',
    unit_size: '1 L',
    mrp_paise: 65000, // ₹650
    shop_price_paise: 59000,
    selling_price_paise: 64000,
    is_active: true,
    is_available: true,
  },
  {
    shopName: '[DUMMY] Daily Fresh Essentials',
    categoryName: 'Dairy',
    name: '[DUMMY] Epigamia Greek Yogurt Natural',
    brand: 'Epigamia',
    unit_size: '100 g',
    mrp_paise: 5000, // ₹50
    shop_price_paise: 4200,
    selling_price_paise: 5000,
    is_active: true,
    is_available: true,
  },
  // Snacks
  {
    shopName: '[DUMMY] Daily Fresh Essentials',
    categoryName: 'Snacks',
    name: '[DUMMY] Maggi 2-Minute Masala Noodles (Pack of 4)',
    brand: 'Maggi',
    unit_size: '280 g',
    mrp_paise: 5600, // ₹56
    shop_price_paise: 4800,
    selling_price_paise: 5600,
    is_active: true,
    is_available: true,
  },
  {
    shopName: '[DUMMY] Daily Fresh Essentials',
    categoryName: 'Snacks',
    name: '[DUMMY] Britannia Good Day Cashew Cookies',
    brand: 'Britannia',
    unit_size: '200 g',
    mrp_paise: 4500, // ₹45
    shop_price_paise: 3800,
    selling_price_paise: 4500,
    is_active: true,
    is_available: true,
  },
  {
    shopName: '[DUMMY] Daily Fresh Essentials',
    categoryName: 'Snacks',
    name: '[DUMMY] Kurkure Masala Munch Crisps',
    brand: 'Kurkure',
    unit_size: '82 g',
    mrp_paise: 2000, // ₹20
    shop_price_paise: 1650,
    selling_price_paise: 2000,
    is_active: true,
    is_available: true,
  },
  // Beverages
  {
    shopName: '[DUMMY] Daily Fresh Essentials',
    categoryName: 'Beverages',
    name: '[DUMMY] Real Fruit Power Mixed Fruit Juice',
    brand: 'Real',
    unit_size: '1 L',
    mrp_paise: 13000, // ₹130
    shop_price_paise: 11000,
    selling_price_paise: 12500,
    is_active: true,
    is_available: true,
  },
  {
    shopName: '[DUMMY] Daily Fresh Essentials',
    categoryName: 'Beverages',
    name: '[DUMMY] Red Bull Energy Drink Can',
    brand: 'Red Bull',
    unit_size: '250 ml',
    mrp_paise: 12500, // ₹125
    shop_price_paise: 10500,
    selling_price_paise: 12500,
    is_active: true,
    is_available: true,
  },
  // Personal Care
  {
    shopName: '[DUMMY] Daily Fresh Essentials',
    categoryName: 'Personal Care',
    name: '[DUMMY] Head & Shoulders Anti-Dandruff Shampoo',
    brand: 'Head & Shoulders',
    unit_size: '340 ml',
    mrp_paise: 34000, // ₹340
    shop_price_paise: 28500,
    selling_price_paise: 33000,
    is_active: true,
    is_available: true,
  },
  {
    shopName: '[DUMMY] Daily Fresh Essentials',
    categoryName: 'Personal Care',
    name: '[DUMMY] Lifebuoy Total 10 Germ Protection Soap (Pack of 4)',
    brand: 'Lifebuoy',
    unit_size: '4 x 125 g',
    mrp_paise: 16000, // ₹160
    shop_price_paise: 13500,
    selling_price_paise: 15500,
    is_active: true,
    is_available: true,
  },
  {
    shopName: '[DUMMY] Daily Fresh Essentials',
    categoryName: 'Personal Care',
    name: '[DUMMY] Vaseline Intensive Care Deep Moisture Body Lotion',
    brand: 'Vaseline',
    unit_size: '400 ml',
    mrp_paise: 32500, // ₹325
    shop_price_paise: 27000,
    selling_price_paise: 31500,
    is_active: true,
    is_available: true,
  },
];
