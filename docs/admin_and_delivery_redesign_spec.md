# PlukIt System Redesign Specification: Admin Panel & Delivery Boy Portal

**Version:** 1.1  
**Target:** Admin Operations & Delivery Fleet  
**Scope:** Mobile & Desktop Responsive Design, Live Product Management with WebP Image Upload, Flexible Payouts, and Founder-as-Rider Mobile Operations.

---

## 1. Executive Summary & Core Objectives

The current system relies heavily on developer-oriented workflows (CSV uploads for catalog changes, bank-only settlement UTRs, and a single shared admin dashboard). 

This redesign transforms the platform into an **end-to-end operational software suite** tailored to everyday Indian quick-commerce ground realities:
1. **Responsive & Consistent UI**: Fully usable on mobile phones (for on-the-move operations and delivery riders) and desktops (for admin back-office management) with a cohesive design system.
2. **Interactive Catalog & Live Pricing (with WebP standard)**: Add, edit, photo-upload, and price products directly from a visual interface without ever needing to touch a CSV file.
3. **Flexible Settlement Modes**: Record partner shop payouts via **Cash**, **Direct UPI (GPay/PhonePe)**, or **Bank Transfer**.
4. **Dedicated Delivery Boy (Rider) Role with Founder Pilot Mode**: Complete role-based access control (RBAC). In the first month of pilot testing, the founder delivers personally, using a dedicated mobile-first rider screen to accept orders, notify the shop to pack, navigate, and collect cash.

---

## 2. System 1: Live Product & Inventory Management (Visual UI)

Replaces CSV-only catalog management with a full-fledged web interface.

### 2.1 High-Performance WebP Image Standard
- **Why WebP**: Industry standard for modern e-commerce. WebP produces images **25%–35% smaller** than JPEG or PNG with identical clarity, ensuring lightning-fast mobile loading on Indian 4G/5G networks and zero scroll lag.
- **Image Upload Support**:
  - Direct file upload supporting `.webp`, `.png`, `.jpg`, `.jpeg`.
  - **On Mobile**: 1-tap button to open camera and snap a photo of the product directly, or pick from gallery.
  - **On Desktop**: Drag-and-drop file upload with instant visual preview.
  - Optional fallback URL input if external CDN images are used.

### 2.2 Product Creation Form ("Add Product")
Allows the Admin to list new products on the fly directly from their mobile phone or desktop:
- **Product Details**:
  - Name (e.g. *Aashirvaad Superior MP Shudh Chakki Atta*)
  - Brand (e.g. *Aashirvaad*)
  - Unit / Pack Size (e.g. *5 kg*, *1 L*, *500 g*)
  - Category (Dropdown: Dairy, Staples, Snacks, Produce, etc.)
  - Description / Highlights (optional)
  - WebP Photo upload
- **Dual Pricing Structure (The Core Business Economics)**:
  - **MRP (₹)**: Official Maximum Retail Price (shown strikethrough to customer).
  - **Shop Buy Price (₹)**: What PlukIt pays the partner shopkeeper. This exact figure flows automatically into the **Shop Ledger** for payouts.
  - **Customer Selling Price (₹)**: What the customer pays on the PlukIt app ($\le \text{MRP}$).
  - *Live Margin Preview*: Displays the gross margin $\text{Selling Price} - \text{Buy Price}$ in real time while typing.
- **Partner Shop Association**: Dropdown to select which partner shop supplies this item.
- **Stock & Active Status**: Instant toggle (`In Stock` / `Out of Stock`, `Active` / `Hidden`).

### 2.3 Live Product Catalog & Quick-Edit Drawer
- Search by product name, brand, or barcode/SKU.
- Filter by Category, Partner Shop, or Stock Status.
- **1-Click Actions**:
  - Toggle stock on/off in 1 tap when a shop runs out.
  - Edit prices (Shop Buy Price or Selling Price) anytime with an instant slide-over drawer.
  - Replace product photo without recreating the product.

---

## 3. System 2: Flexible Shop Payouts (Cash, UPI & Bank)

Local Indian kirana partnerships rarely run on bank NEFT transfers alone. The payout system adapts to all three settlement workflows:

| Mode | Real-World Scenario | Reference Captured in System |
| :--- | :--- | :--- |
| **📱 Direct UPI** | Admin scans the shopkeeper’s PhonePe / Google Pay / Paytm QR code | 12-digit UPI Reference Number / Transaction ID |
| **💵 Cash Handover** | Cash given directly to the shopkeeper from day’s COD cash collected | Voucher / Handover Note (e.g. *“Cash given to shop owner Ramesh”*) |
| **🏦 Bank Transfer** | Direct IMPS / NEFT / RTGS transfer via net banking | Bank UTR Reference Number |

### 3.1 Payout Workflow
1. **15-Day Payout Run**: Generated fortnightly (1st–15th or 16th–end of month) summing gross sales minus damaged returns.
2. **Settlement Modal**:
   - Admin picks **Payment Mode**: `[UPI]`, `[CASH]`, or `[BANK]`.
   - If UPI is picked: Shows the shop’s saved UPI ID for quick QR scanning.
   - Enters the transaction reference or cash handover receipt.
3. **Period Locking**: Once recorded as `PAID`, the period is locked permanently to prevent balance tampering.
4. **Statement PDF**: Generates an itemized statement showing the exact payment mode, reference, and order items.

---

## 4. System 3: Dedicated Delivery Boy (Rider) Portal

### 4.1 Role-Based Access Control (RBAC) & Security Isolation
- **Separate Route**: `/delivery/login` and `/delivery` dashboard.
- **Credentials**: Simple mobile authentication (Phone Number + PIN / Password).
- **Strict Data Concealment**:
  - ❌ **Cannot see**: Wholesale shop prices, platform profit margins, shop ledgers, revenue scorecards, customer credit notes, or other riders' collections.
  - ✅ **Can only see**: Orders assigned for pickup and delivery today.

### 4.2 Founder-Led Pilot Order Flow (First Month Testing)
Since the founder is personally handling deliveries during the first month pilot, the mobile order lifecycle is streamlined for fast action on a phone:

```
[Customer Places Order: PLACED]
            │
            ▼
[Rider Phone: /delivery] ──▶ 🔔 "Accept & Confirm Order"
            │
            ▼
(Order status transitions PLACED ➔ CONFIRMED ➔ SENT TO SHOP)
            │
            ▼
[Drive to Shop] ──▶ Shop receives packing list and packs items
            │
            ▼
[Rider Phone: /delivery] ──▶ 📦 "Mark Packed & Picked Up"
            │
            ▼
(Order status transitions SENT TO SHOP ➔ PACKED ➔ OUT FOR DELIVERY)
            │
            ▼
[Drive to Customer] ──▶ 1-tap Google Maps & Call Customer
            │
            ▼
[Check Payment Instruction] ──▶ 🟡 COD: Collect ₹XXX  OR  🟢 Online Paid (Do Not Collect)
            │
            ▼
[Rider Phone: /delivery] ──▶ ✅ "Mark Delivered" (Confirm Cash)
```

### 4.3 Mobile-First Rider Interface Wireframe

```
┌──────────────────────────────────────────────┐
│ 🛵 PlukIt Delivery Partner       [Ramesh ▼]  │
├──────────────────────────────────────────────┤
│ 📦 2 Active Deliveries | 💰 Cash to Handover: ₹650
├──────────────────────────────────────────────┤
│ ORDER #PLUK-2026-1042        [CONFIRMED]     │
│ ───────────────────────────────────────────  │
│ 🏪 STEP 1: PICK UP AT SHOP                   │
│    Green Valley Supermarket, Viman Nagar     │
│    [📍 Open in Google Maps]                  │
│    Items to Pick (3):                        │
│    - Amul Taaza Milk 500ml x 2               │
│    - Britannia Brown Bread 400g x 1          │
│                                              │
│ 🏠 STEP 2: DELIVER TO CUSTOMER               │
│    Pooja Sharma (📞 Tap to Call)             │
│    Flat 402, Rohan Mithila, Pune - 411014    │
│    [📍 Open in Google Maps]                  │
│                                              │
│ 💳 STEP 3: PAYMENT INSTRUCTION               │
│    🟡 COLLECT CASH: ₹450                     │
│    (or 🟢 ONLINE PAID - DO NOT COLLECT CASH) │
│                                              │
│ [ 📦 Mark Picked Up ]  [ ✅ Mark Delivered ] │
│ [ ⚠️ Delivery Failed / Problem ]             │
└──────────────────────────────────────────────┘
```

### 4.4 Rider Action Buttons
1. **`Accept & Confirm Order`**: Tapped when order is placed; immediately triggers `CONFIRMED` and `SENT_TO_SHOP` so shopkeeper packs immediately.
2. **`Mark Picked Up`**: Indicates rider has verified items and collected the packed grocery bag from the shop.
3. **`Mark Delivered`**:
   - For COD: Prompts rider to confirm cash collected (exact amount or custom note if change short).
   - Automatically marks order `DELIVERED`, dispatches customer SMS, and triggers GST invoice.
4. **`Delivery Failed`**: Quick reasons (Customer not answering, Wrong address, Customer refused).
5. **`Daily Cash Handover`**: End-of-day summary showing total COD cash collected to deposit with Admin.

---

## 5. System 4: Unified Admin Panel Architecture

A clean, responsive dashboard that adapts smoothly between smartphone screens and desktop monitors.

```
                      ┌─────────────────────────────────┐
                      │    PlukIt Unified Operations    │
                      └────────────────┬────────────────┘
                                       │
     ┌───────────────────┬─────────────┴───────┬────────────────────┐
     ▼                   ▼                     ▼                    ▼
📦 Orders Board    🛍️ Catalog & Prices    🛵 Delivery Fleet    💰 Shop Payouts
- Live Pipeline    - Add Product (WebP)   - Assign Riders      - Cash / UPI / Bank
- Status Machine   - Live Buy/Sell Price  - Active Routes      - Period Locking
- Cancel/Refund    - Stock On/Off Toggle  - Cash Handover Reconcile - PDF Statements
```

---

## 6. System 5: Responsive & Consistent UI Design Language

To ensure the app feels like a single, high-quality, professional product on both mobile and desktop:

| Design Element | Specification | Mobile Behavior | Desktop Behavior |
| :--- | :--- | :--- | :--- |
| **Theme / Colors** | Dark Slate Theme: Background `slate-950`, Cards `slate-900`, Accent `saffron (#FF9933)` | Immersive, battery-efficient | High-contrast, clean elevation |
| **Navigation** | Sticky header with active tab indicator | Horizontal swipeable pill bar or bottom bar | Full horizontal top navigation bar |
| **Touch Targets** | Minimum **44 × 44 px** for all buttons & inputs | Large touch targets for riders on bikes | Compact, keyboard-friendly |
| **Data Displays** | Metric cards and action buttons | Stacked full-width cards | Multi-column responsive grids |
| **Forms & Drawers** | Modal sheets with dark backdrop | Full-screen or bottom slide-up sheets | Centered modals / right slide-over drawers |
| **Order Cards** | Clear color badges (Paid = Green, COD = Amber) | Single-column expandable cards | Filterable tables with slide-over inspection |

---

## 7. Implementation Roadmap

1. **Step 1: Admin Product Management UI with WebP Uploads & Dual Pricing**:
   - Build `/admin/products` page with live product list, search/filter, and instant stock toggles.
   - Build visual **Add Product** and **Edit Product** forms with dual pricing (Shop Buy Price vs Customer Sell Price) and direct WebP/PNG/JPG photo upload.
2. **Step 2: Multi-Mode Shop Payouts (Cash, Direct UPI, Bank Transfer)**:
   - Update settlement modal to support **Direct UPI**, **Cash Handover**, and **Bank Transfer (UTR)**.
   - Reflect selected payment mode in audit logs and PDF settlement advice.
3. **Step 3: Dedicated Delivery Boy (Rider) Portal with Founder Pilot Flow**:
   - Create Rider mobile authentication (`/delivery/login`).
   - Create Rider mobile dashboard (`/delivery`) with:
     * Incoming order accept & confirm button (`CONFIRMED` ➔ `SENT_TO_SHOP`).
     * Shop pickup card & customer drop-off card.
     * Cash collection indicators and delivery completion actions.
4. **Step 4: Admin Fleet & Cash Reconcile**:
   - Add Rider assignment dropdown on Admin Orders Board.
   - Real-time daily COD cash handover confirmation between rider and admin.
