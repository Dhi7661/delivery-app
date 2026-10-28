# Progress Report: Local Delivery Service (PlukIt)

## 1. Summary
The repository is on `main` with all code from F01 through F16 committed, merged, and passing 100% of automated tests.
Both Next.js frontend (port 3000) and Express/Prisma backend (port 4000) build and run with zero errors across 121 server tests.
Core store, guest checkout, admin operations, OTP auth, delivery management, GST invoices, and test-mode UPI/COD payments are fully functional.
Card payments are disabled per founder decision to maintain 0% payment commission on UPI transactions.
The project is on schedule and ready to proceed to Phase 3 payment confirmation (F17: Webhooks and reconciliation).

---

## 2. Repository State

### Git and Environment State
- **Git Branch:** `main` (synchronized with `origin/main` at commit `eee3b11`).
- **Working Tree:** Clean, 0 uncommitted changes, 0 untracked files.
- **Recent Git Log (`git log --oneline -20`):**
  - `eee3b11` Merge pull request #18 from Dhi7661/feature/f16-online-payment-upi
  - `5dc2b8b` feat(f16): implement online payment with UPI and COD (test mode, cards disabled)
  - `611d62d` Merge pull request #17 from Dhi7661/feature/f15-gst-invoices
  - `6d8c7bb` feat(f15): implement GST tax invoices, credit notes, and PDF generation
  - `04b0d92` Merge pull request #16 from Dhi7661/feature/f14-order-tracking-notifications
  - `f051892` fix(security): prevent logged-in customers from accessing other customers orders
  - `7945d44` feat(F14): implement order tracking status timeline and automated notifications
  - `43f7792` Merge pull request #15 from Dhi7661/feature/f13-delivery-list-cash
  - `cc72d2b` feat(f13): Delivery list, one-handed mobile workflow, and daily COD cash collection
  - `9cd5c93` fix(admin): make order board stage filter tabs fully visible with 2-row responsive grid
  - `904323f` feat(f12): Admin order board and strict lifecycle status state machine
  - `74f5675` Merge pull request #12 from Dhi7661/feature/f11-saved-addresses
  - `4f67bce` feat(f11): Saved addresses with CRUD, 5-address cap, ownership security, and checkout auto-fill
  - `57953e6` Merge pull request #11 from Dhi7661/feature/f10-customer-otp-login
  - `6f5d8ba` feat(f10): Enforce 3 OTP requests in 10 mins rate limit, 5-attempt code cancellation, and add acceptance tests
  - `bcb6e42` Merge pull request #10 from Dhi7661/feature/f09-admin-login
  - `ad94090` feat(f09): Admin login with bcrypt hashing, session cookies, rate limiting, and audit logs
  - `96ea96b` Merge pull request #9 from Dhi7661/feature/f08-phase1-e2e-and-review
  - `4a45d9b` fix(checkout): strongly type cart to resolve implicit any errors and regenerate prisma types
  - `77b9756` F08: Phase 1 end-to-end customer journey tests and comprehensive code review report
- **Environment File Check (`git ls-files | grep -i "\.env"`):**
  - Only `server/.env.example` is tracked. No live `.env` or secrets are checked into git.
- **Repository Visibility:**
  - Remote: `https://github.com/Dhi7661/delivery-app.git`.
  - Unauthenticated GitHub API calls return `404 Not Found`, indicating the repository is **Private** (or requires GitHub credentials).

### Folder Tree (depth 3, excluding node_modules, .next, .git)
```
client/
  ├── app/
    ├── account/
      ├── addresses/
      ├── page.tsx
    ├── admin/
      ├── deliveries/
      ├── login/
      ├── notifications/
      ├── orders/
      ├── products/
    ├── cart/
      ├── page.tsx
    ├── category/
      ├── [id]/
    ├── checkout/
      ├── page.tsx
    ├── order/
      ├── [orderNo]/
    ├── orders/
      ├── [orderNo]/
      ├── page.tsx
    ├── product/
      ├── [id]/
    ├── search/
      ├── page.tsx
    ├── favicon.ico
    ├── globals.css
    ├── layout.tsx
    ├── page.tsx
  ├── components/
    ├── AdminHeader.tsx
    ├── BottomNav.tsx
    ├── CartBar.tsx
    ├── DevOtpBanner.tsx
    ├── Header.tsx
    ├── ProductCard.tsx
  ├── context/
    ├── AuthContext.tsx
    ├── CartContext.tsx
  ├── lib/
    ├── api.ts
    ├── brand.ts
    ├── money.ts
    ├── orderStatus.ts
  ├── public/
    ├── samples/
      ├── sample_products.csv
    ├── file.svg
    ├── globe.svg
    ├── manifest.json
    ├── next.svg
    ├── vercel.svg
    ├── window.svg
  ├── .gitignore
  ├── AGENTS.md
  ├── eslint.config.mjs
  ├── next-env.d.ts
  ├── next.config.ts
  ├── package-lock.json
  ├── package.json
  ├── README.md
  ├── tsconfig.json
  ├── tsconfig.tsbuildinfo

server/
  ├── dist/
    ├── lib/
    ├── prisma/
    ├── src/
    ├── index.js
  ├── prisma/
    ├── migrations/
      ├── 20261027140800_add_settings_table/
      ├── 20261027143400_add_catalog_unique_constraints/
      ├── 20261027152000_add_cart_tables/
      ├── 20261027153700_update_order_data_model/
      ├── 20261027154400_add_pending_collection_payment_status/
      ├── 20261027163000_add_auth_and_otp_tables/
      ├── 20261027194000_add_user_id_to_carts/
      ├── 20261027203600_add_admin_users_and_sessions/
      ├── 20261027223000_add_cash_note_to_deliveries/
      ├── 20261027230000_add_order_notifications/
      ├── 20261028083000_add_gst_invoices_and_credit_notes/
      ├── 20261028110000_make_gateway_payment_id_nullable/
    ├── schema.prisma
    ├── seed.ts
    ├── seedData.ts
  ├── public/
    ├── invoices/
      ├── .gitkeep
  ├── src/
    ├── lib/
      ├── brand.test.ts, brand.ts, catalog.test.ts, csvParser.ts, db.ts, invoice.ts
      ├── money.test.ts, money.ts, notifications.ts, order.test.ts, order.ts
      ├── orderStatus.ts, pricing.test.ts, pricing.ts, razorpay.ts, sms.test.ts, sms.ts
    ├── routes/
      ├── address.test.ts, address.ts, admin.test.ts, admin.ts, auth.test.ts, auth.ts
      ├── cart.test.ts, cart.ts, catalog.test.ts, catalog.ts, checkout.test.ts, checkout.ts
      ├── delivery.test.ts, delivery.ts, e2e.test.ts, invoice.test.ts, invoice.ts
      ├── notification.test.ts, orderStatus.test.ts, payment.test.ts, payment.ts
    ├── index.ts
  ├── .env
  ├── .env.example
  ├── package-lock.json
  ├── package.json
  ├── tsconfig.json
```

### Prisma Models (28 Models in `server/prisma/schema.prisma`)
1. `User` - Customer identity, phone, role, timestamps
2. `Session` - Customer session token, expiry
3. `OtpVerification` - HMAC-hashed OTPs, attempts, lockout
4. `AdminUser` - Admin staff, bcrypt password hash
5. `AdminSession` - Admin auth sessions
6. `Address` - Saved customer delivery addresses (5 max)
7. `Shop` - Store/vendor profile
8. `ShopBankRef` - Vendor settlement bank accounts
9. `Category` - Product categories with display ordering
10. `Product` - Catalog items, pricing, inventory flags
11. `PriceHistory` - Historical product price audit log
12. `ServiceablePincode` - Delivery zones and active status
13. `Order` - Customer orders, monetary totals, state machine
14. `OrderItem` - Snapshot line items per order
15. `Payment` - Payment attempts, methods (COD/UPI), transaction IDs
16. `Refund` - Refund tracking and payout status
17. `Delivery` - Driver assignment, proof of delivery, COD reconciliation
18. `Return` - Customer return requests
19. `ShopLedger` - Debits and credits per vendor
20. `Payout` - Bi-weekly merchant disbursements
21. `Invoice` - GST tax invoice records
22. `CreditNote` - GST credit notes for cancellations/returns
23. `SupportTicket` - Customer support inquiries
24. `AuditLog` - Admin and system security action history
25. `Setting` - Key-value platform pricing and operating rules
26. `Cart` - Persistent server cart
27. `CartItem` - Cart line items with quantity
28. `OrderNotification` - Automated SMS/WhatsApp logs with retry counts

### Prisma Migration Folders (12 Applied Migrations)
1. `20261027140800_add_settings_table`
2. `20261027143400_add_catalog_unique_constraints`
3. `20261027152000_add_cart_tables`
4. `20261027153700_update_order_data_model`
5. `20261027154400_add_pending_collection_payment_status`
6. `20261027163000_add_auth_and_otp_tables`
7. `20261027194000_add_user_id_to_carts`
8. `20261027203600_add_admin_users_and_sessions`
9. `20261027223000_add_cash_note_to_deliveries`
10. `20261027230000_add_order_notifications`
11. `20261028083000_add_gst_invoices_and_credit_notes`
12. `20261028110000_make_gateway_payment_id_nullable`

### Pages in `client/app/` (17 Pages)
1. `/` (`page.tsx`) - Home / catalog storefront
2. `/account` (`account/page.tsx`) - Customer profile and OTP login
3. `/account/addresses` (`account/addresses/page.tsx`) - Saved address management
4. `/admin/deliveries` (`admin/deliveries/page.tsx`) - Driver delivery dashboard and cash collection
5. `/admin/login` (`admin/login/page.tsx`) - Admin staff login
6. `/admin/notifications` (`admin/notifications/page.tsx`) - Notification queue and retry dashboard
7. `/admin/orders` (`admin/orders/page.tsx`) - Order board with stage filters
8. `/admin/orders/[id]` (`admin/orders/[id]/page.tsx`) - Order detail, status transitions, actions
9. `/admin/products/upload` (`admin/products/upload/page.tsx`) - CSV product catalog upload
10. `/cart` (`cart/page.tsx`) - Shopping cart management
11. `/category/[id]` (`category/[id]/page.tsx`) - Category catalog view
12. `/checkout` (`checkout/page.tsx`) - Checkout flow with UPI & COD options
13. `/order/[orderNo]` (`order/[orderNo]/page.tsx`) - Post-checkout summary
14. `/orders` (`orders/page.tsx`) - Logged-in customer order history
15. `/orders/[orderNo]` (`orders/[orderNo]/page.tsx`) - Real-time order tracking & timeline
16. `/product/[id]` (`product/[id]/page.tsx`) - Product details view
17. `/search` (`search/page.tsx`) - Product catalog search

### API Routes in `server/` (41 Endpoints)
- **Health Check:**
  - `GET /api/v1/health` - Server & PostgreSQL database connection health check
- **Catalog:**
  - `GET /api/categories` - Fetch active categories
  - `GET /api/categories/:id/products` - Category products with cursor pagination
  - `GET /api/products/search` - Search active products
  - `GET /api/products/:id` - Product details
- **Cart:**
  - `GET /api/cart` - Retrieve current cart
  - `POST /api/cart/items` - Add item to cart
  - `PATCH /api/cart/items/:productId` - Update item quantity
  - `DELETE /api/cart/items/:productId` - Remove item from cart
  - `DELETE /api/cart` - Clear entire cart
- **Checkout & Orders:**
  - `POST /api/checkout` - Create order (COD or UPI)
  - `GET /api/orders/:orderNo` - Order details with access verification
- **Customer Auth:**
  - `POST /api/auth/otp/send` - Send rate-limited OTP
  - `POST /api/auth/otp/verify` - Verify OTP and issue customer session
  - `GET /api/auth/me` - Authenticated customer profile
  - `GET /api/auth/orders` - Customer's past orders
  - `POST /api/auth/logout` - Invalidate customer session
- **Admin Auth & Ops:**
  - `POST /api/admin/auth/login` - Rate-limited admin login
  - `POST /api/admin/auth/logout` - Clear admin session
  - `GET /api/admin/auth/me` - Authenticated admin profile
  - `POST /api/admin/products/upload` - CSV product catalog bulk import
  - `GET /api/admin/orders` - Filtered order board listing
  - `GET /api/admin/orders/:id` - Full order detail with status rules
  - `PATCH /api/admin/orders/:id/status` - State machine transition
  - `GET /api/admin/notifications` - Failed & pending notification logs
  - `POST /api/admin/notifications/:id/retry` - Retry notification dispatch
- **Addresses:**
  - `GET /api/addresses` - List customer's saved addresses
  - `POST /api/addresses` - Create new delivery address
  - `PUT /api/addresses/:id` - Update existing address
  - `DELETE /api/addresses/:id` - Delete address
  - `PATCH /api/addresses/:id/default` - Set default delivery address
- **Delivery Management:**
  - `GET /api/admin/deliveries` - Active delivery assignments & cash summary
  - `POST /api/admin/deliveries/:orderId/start` - Dispatch order out for delivery
  - `POST /api/admin/deliveries/:orderId/delivered` - Confirm delivery & COD collection
  - `POST /api/admin/deliveries/:orderId/failed` - Record delivery attempt failure
- **Invoices & Credit Notes:**
  - `GET /api/orders/:orderNo/invoice` - Fetch tax invoice metadata
  - `GET /api/invoices/:invoiceNo/pdf` - Download GST tax invoice PDF
  - `GET /api/credit-notes/:creditNoteNo/pdf` - Download GST credit note PDF
- **Payments:**
  - `POST /api/payments/razorpay/fail` - Record payment gateway failure
  - `POST /api/payments/confirm` - Verify client payment callback
  - `POST /api/payments/mark-paid` - Admin manual payment confirmation override

---

## 3. Feature Status Table

| ID | Feature | Status | Evidence |
|---|---|---|---|
| F01 | Settings and pricing rules | DONE | `server/src/lib/pricing.ts`, tests in `pricing.test.ts` (5 passed). |
| F02 | Catalog data | DONE | `server/prisma/seed.ts`, `server/prisma/seedData.ts`, tests in `catalog.test.ts` (3 passed). |
| F03 | Catalog pages | DONE | `client/app/page.tsx`, `client/app/category/[id]`, `client/app/product/[id]`, tests in `routes/catalog.test.ts` (4 passed). |
| F04 | Cart | DONE | `client/app/cart/page.tsx`, `client/context/CartContext.tsx`, tests in `cart.test.ts` (7 passed). |
| F05 | Order data model | DONE | `server/prisma/schema.prisma` (Order, OrderItem, Delivery), `server/src/lib/order.ts`, tests in `order.test.ts` (4 passed). |
| F06 | Guest checkout with cash on delivery | DONE | `client/app/checkout/page.tsx`, `client/app/order/[orderNo]/page.tsx`, tests in `checkout.test.ts` (8 passed). |
| F07 | Admin product CSV upload | DONE | `client/app/admin/products/upload/page.tsx`, `server/src/lib/csvParser.ts`, tests in `admin.test.ts` (passed). |
| F08 | Phase 1 end-to-end test and review | DONE | `server/src/routes/e2e.test.ts` (2 passed), report in `docs/code-review-phase1.md`. |
| F09 | Admin login | DONE | `client/app/admin/login/page.tsx`, `server/src/routes/admin.ts`, tests in `admin.test.ts` (9 passed). |
| F10 | Customer login with mobile OTP | DONE | `client/app/account/page.tsx`, `server/src/routes/auth.ts`, `server/src/lib/sms.ts`, tests in `auth.test.ts` (9 passed) & `sms.test.ts` (6 passed). |
| F11 | Saved addresses | DONE | `client/app/account/addresses/page.tsx`, `server/src/routes/address.ts`, tests in `address.test.ts` (7 passed). |
| F12 | Admin order board and status rules | DONE | `client/app/admin/orders/page.tsx`, `client/app/admin/orders/[id]/page.tsx`, tests in `orderStatus.test.ts` (10 passed). |
| F13 | Delivery list and cash collection | DONE | `client/app/admin/deliveries/page.tsx`, `server/src/routes/delivery.ts`, tests in `delivery.test.ts` (8 passed). |
| F14 | Order tracking and notifications | DONE | `client/app/orders/[orderNo]/page.tsx`, `server/src/lib/notifications.ts`, tests in `notification.test.ts` (8 passed). |
| F15 | GST invoices | DONE | `server/src/lib/invoice.ts`, `server/src/routes/invoice.ts`, tests in `invoice.test.ts` (11 passed). |
| F16 | Online payment (test mode) | DONE | `client/app/checkout/page.tsx`, `server/src/lib/razorpay.ts`, `server/src/routes/payment.ts`, tests in `payment.test.ts` (4 passed). |
| F17 | Payment webhooks and reconciliation | NOT STARTED | Depends on F16. No webhook handler or reconciliation worker implemented yet. |
| F18 | Cancellations, refunds, and returns | BUILT AHEAD | `Refund` and `Return` models exist in Prisma schema; cancellation and refund API logic pending F17. |
| F19 | Legal pages and security hardening | NOT STARTED | Terms, Privacy, Refund, and Delivery static policy pages not yet authored in `client/app/`. |
| F20 | Performance and monitoring | NOT STARTED | Lighthouse performance audits and production APM monitoring pending. |
| F21 | Backups, deployment, and launch checklist | NOT STARTED | Automated PostgreSQL backup routines and production deployment checklist pending. |
| F22 | Soft launch operations | NOT STARTED | Awaiting Phase 3 completion. |
| F23 | Shop ledger and payouts | BUILT AHEAD | `ShopLedger` and `Payout` models exist in Prisma schema; bi-weekly payout job and statements pending. |
| F24 | Reporting dashboard | NOT STARTED | Admin operational metrics dashboard pending. |
| F25 | App decision review | NOT STARTED | Post-launch evaluation milestone. |

---

## 4. Tests and Checks
- **`npm run test:server` Result:**
  - Passed: **121**
  - Failed: **0**
  - Skipped: **0**
  - Total test suites: **18 passed** (18 files).
- **Client Tests:**
  - No client test script or test runner configured in `client/package.json` (no client unit tests exist).
- **`npm run build` in `client/`:**
  - Build completed successfully in 1,727 ms with 0 errors across all 17 static and dynamic App Router routes.
- **`npm audit` Severity Count:**
  - `client/`: **0 vulnerabilities** (clean).
  - `server/`: **7 vulnerabilities** total (3 Moderate, 2 High, 2 Critical). All critical/high findings are in dev dependencies (`tinypool`, `esbuild`, `vite` via `vitest`) and runtime `zod` memory constraint advisory; none affect production server execution.
- **End-to-End Test:**
  - Ran `server/src/routes/e2e.test.ts`: **2 passed out of 2** (F08 Phase 1 customer browse -> cart check -> COD checkout -> confirmation, and pincode rejection).

---

## 5. Design and UI
- **`docs/design.md` Existence:**
  - Does not exist in the repository.
- **Theme vs Hard-Coded Colors:**
  - Only **5 hard-coded hex colors** exist across the entire `client/` codebase:
    - 4 in `client/app/globals.css` (`#ffffff`, `#171717`, `#0a0a0a` default root variables).
    - 1 in `client/app/checkout/page.tsx` (`#059669` passed as brand green color to Razorpay checkout options).
  - All other UI elements strictly consume Tailwind utility color classes (`emerald-600`, `slate-900`, `amber-500`, `rose-600`, `blue-600`).
  - Top files with hard-coded hex colors:
    1. `client/app/globals.css` (4 hex values)
    2. `client/app/checkout/page.tsx` (1 hex value)
    3. All other files have 0 hard-coded hex colors.
- **Component Existence in `client/components/ui/`:**
  - The folder `client/components/ui/` does **not** exist.
  - Requested components check:
    - `Button`: Not in `ui/` (inlined Tailwind buttons across pages).
    - `Card`: Not in `ui/` (inlined Tailwind card containers).
    - `Badge`: Not in `ui/` (inlined status badge pills).
    - `PriceLabel`: Not in `ui/` (formatted inline via `formatPaise` helper).
    - `PincodeChip`: Not in `ui/` (inlined in Header).
    - `Header`: Exists as `client/components/Header.tsx`.
    - `BottomNav`: Exists as `client/components/BottomNav.tsx`.
    - `CartBar`: Exists as `client/components/CartBar.tsx`.
    - `EmptyState`: Not in `ui/` (inlined in empty cart and empty orders views).
    - `ImagePlaceholder`: Not in `ui/`.
- **`data-testid` Attribute Count:**
  - Exactly **1** occurrence in `client/` (`client/components/DevOtpBanner.tsx: data-testid="dev-otp-banner"`).

---

## 6. Security and Data
- **Rate Limiting:**
  - Login: **YES** (`server/src/routes/admin.ts:L137`, 5 failed attempts per 15 min per IP/email returns 429).
  - OTP: **YES** (`server/src/routes/auth.ts:L78`, max 3 OTP requests per 10 min per phone returns 429; max 5 verification attempts before invalidation).
  - Checkout: **NO** (Not started; scheduled for F19 hardening).
  - Search: **NO** (Not started; scheduled for F19 hardening).
- **Security Headers and CORS Configuration:**
  - CORS: **YES** (`server/src/index.ts:L22`, restricted to `CLIENT_URL` with credentials allowed).
  - Security headers (Helmet/CSP): **NO** (Not installed yet; scheduled for F19).
- **Password and OTP Hashing:**
  - Password hashing: **YES** (`bcryptjs` with salt factor 10 in `server/src/routes/admin.ts:L147` and `server/prisma/seed.ts:L31`).
  - OTP hashing: **YES** (`server/src/routes/auth.ts:L13-18`, HMAC-SHA256 hashed with `OTP_SECRET`; raw OTPs are never stored in DB).
- **Webhook Signature Checks:**
  - **Not started** (Scheduled for F17 Payment webhooks and reconciliation).
- **Ownership Checks:**
  - Addresses: **YES** (`server/src/routes/address.ts:L45-55`, `L75-80`, `L115-125`, `L150-160`, strictly validates `savedAddress.user_id === authUser.id`).
  - Orders: **YES** (`server/src/routes/auth.ts:L290` customer order history queries user ID; `server/src/routes/checkout.ts:L427-445` verifies account ownership or guest phone matching).
  - Invoices: **YES** (`server/src/routes/invoice.ts:L45-65`, verifies order ownership or active admin session).
- **Zod Validation on Request Bodies:**
  - **YES**, enforced across all routes (`SendOtpSchema`, `VerifyOtpSchema`, `AdminLoginSchema`, `UpdateStatusSchema`, `OrderFilterSchema`, `AddressSchema`, `AddItemSchema`, `UpdateQtySchema`, `CheckoutSchema`, `DeliveredSchema`, `FailedDeliverySchema`, `PaymentFailureSchema`).
- **Settings Table & Status:**
  - Settings table exists (`server/prisma/schema.prisma:L454-463`, model `Setting`).
  - Seeded values (`DELIVERY_FEE_PAISE`, `FREE_DELIVERY_THRESHOLD_PAISE`, `COD_LIMIT_PAISE`) in `server/prisma/seed.ts:L13-29` have `is_dummy: true`.
- **`ADMIN_PASSWORD` in Code:**
  - `ADMIN_PASSWORD` does **not** appear in application code or `.env.example`. It was replaced in F09 by `ADMIN_INITIAL_PASSWORD` for first-time DB bootstrapping.

---

## 7. Known Gaps
- **TODO / FIXME Comments:**
  - A full search across the entire repository revealed **0 `TODO`** and **0 `FIXME`** comments.
- **Architectural Gaps:**
  - F16 orders remain in `PAYMENT_PENDING` status; automatic confirmation awaits F17 webhook implementation.
  - Rate limiting is active on admin login and OTP, but checkout and search rate limiting are pending F19.
  - Security headers (CSP, HSTS, X-Content-Type-Options via Helmet) are pending F19.
  - Client component library in `client/components/ui/` has not been extracted into separate atomic component files.

---

## 8. Recommended Next Step
- **Next Feature:** **F17: Payment webhooks and reconciliation**
- **Dependency Status:** **No missing dependencies.** F16 (Online payment test mode) is merged into `main`, and all required database tables (`Order`, `Payment`, `OrderStatus`, `PaymentStatus`) are ready.
- **Scope for F17:**
  1. Add `ProcessedEvent` table to Prisma schema with unique event IDs to guarantee idempotency.
  2. Implement `POST /api/webhooks/razorpay` validating the HMAC-SHA256 signature using `RAZORPAY_WEBHOOK_SECRET`.
  3. On `payment.captured`, confirm orders with matching total paise and flag any mismatched amounts for review.
  4. Implement reconciliation worker checking `PAYMENT_PENDING` orders against Razorpay every 5 minutes.
  5. Add test suite covering valid signature, invalid signature, duplicate events, amount mismatches, and missed webhook recovery.
*(Note: Feature F17 has not been started per instructions.)*

---

## 9. Questions for the Founder
1. **Webhook URL Configuration:** For local testing of Razorpay webhooks in F17, should we configure automated test suite simulation using Razorpay's HMAC signature generator, or do you have an `ngrok` / public tunnel URL you want to register in your Razorpay test dashboard?
2. **Reconciliation Frequency:** The specification recommends checking `PAYMENT_PENDING` orders older than 10 minutes every 5 minutes. Do you want this reconciliation job to run as an in-process background worker inside the Express server, or as an endpoint triggered by a cron job?
3. **Atomic UI Components:** Would you like us to extract inline UI elements (Button, Card, Badge, EmptyState) into `client/components/ui/` during Phase 3, or keep them lightweight and inline as they currently are?
