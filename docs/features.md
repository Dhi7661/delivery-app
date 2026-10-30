# Feature Roadmap

Version 1.0. Save this file as `docs/features.md`.
Read it together with `AGENTS.md` (rules) and `docs/plan.md` (decisions and status).

## How to use this document

1. Build the features in the order listed. Do not skip ahead.
2. A feature is done only when every acceptance check is ticked and all tests pass.
3. The founder confirms each feature before the next one starts.
4. Each feature lists what it depends on. If a dependency is not done, stop and report it.
5. Dummy values (marked is_dummy) must be replaced with real values before launch. See Appendix A.

## Status overview

| ID | Feature | Phase | Depends on | Status |
|---|---|---|---|---|
| Foundation | Project structure, money helpers, MRP check, order number generator, PWA manifest, 360 px header, brand constants, 7 brand tests | Done | - | Done |
| F01 | Settings and pricing rules | 1 Core store | Foundation | Next |
| F02 | Catalog data (shops, categories, products) | 1 Core store | F01 | Planned |
| F03 | Catalog pages (home, category, product, search) | 1 Core store | F02 | Planned |
| F04 | Cart | 1 Core store | F03 | Planned |
| F05 | Order data model | 1 Core store | F04 | Planned |
| F06 | Guest checkout with cash on delivery | 1 Core store | F05 | Planned |
| F07 | Admin product CSV upload | 1 Core store | F02, F01 | Planned |
| F08 | Phase 1 end-to-end test and review | 1 Core store | F01 to F07 | Planned |
| F09 | Admin login | 2 Operations | F07 | Planned |
| F10 | Customer login with mobile OTP | 2 Operations | F06 | Planned |
| F11 | Saved addresses | 2 Operations | F10 | Planned |
| F12 | Admin order board and status rules | 2 Operations | F06, F09 | Planned |
| F13 | Delivery list and cash collection | 2 Operations | F12 | Planned |
| F14 | Order tracking and notifications | 2 Operations | F12 | Planned |
| F15 | GST invoices | 2 Operations | F12 | Planned |
| F16 | Online payment (test mode) | 3 Payments and security | F06, F10 | Planned |
| F17 | Payment webhooks and reconciliation | 3 Payments and security | F16 | Planned |
| F18 | Cancellations, refunds, and returns | 3 Payments and security | F12, F17 | Planned |
| F19 | Legal pages and security hardening | 3 Payments and security | F16 | Planned |
| F20 | Performance and monitoring | 4 Launch prep | F03 to F19 | Planned |
| F21 | Backups, deployment, and launch checklist | 4 Launch prep | F20 | Complete |
| F22 | Soft launch operations | 5 Soft launch | F21 | Planned |
| F23 | Shop ledger and payouts | 6 Payouts | F22 | Planned |
| F24 | Reporting dashboard | 6 Payouts | F23 | Planned |
| F25 | App decision review | 7 App decision | F24 | Planned |

---

## Foundation (done, for reference)

- Project split into client/ (Next.js 16) and server/ (Express, Prisma, PostgreSQL), both in TypeScript strict mode.
- Money helpers that store and format amounts as integer paise, shown in rupees with the ₹ sign.
- MRP check: a selling price above MRP is rejected.
- Order number generator (PLUK-YYYY-000001).
- PWA manifest for Add to Home Screen.
- 360 px homepage header with delivery timeline, pincode pill, and search bar.
- Brand constants in one place. Seven brand tests pass.

---

## Phase 1: Core store

### F01 Settings and pricing rules

**Goal:** Store the delivery fee, free-delivery threshold, and COD limit in the database, and apply the pricing rules in one place on the server.

**Depends on:** Foundation

**Scope**
- Settings table: key (unique text), value_paise (integer), is_dummy (boolean), updated_at.
- Seed three settings, all marked is_dummy: DELIVERY_FEE_PAISE = 2000 (₹20), FREE_DELIVERY_THRESHOLD_PAISE = 30000 (₹300), COD_LIMIT_PAISE = 100000 (₹1,000).
- Pricing functions in server/lib/pricing.ts: calculateDeliveryFee(subtotal_paise), isCodAllowed(total_paise), validateSellingPrice(mrp_paise, selling_paise), getSetting(key).

**Rules**
- Delivery fee is 0 when the subtotal is at or above the threshold. Otherwise the fee is DELIVERY_FEE_PAISE.
- COD is allowed when the total is at or below the COD limit.
- A selling price equal to MRP is allowed. A selling price above MRP is rejected.
- A missing setting throws an error. It must never fall back to a default silently.

**Tests**
- Subtotal below the threshold: fee applies.
- Subtotal exactly at the threshold: fee is zero.
- Total exactly at the COD limit: allowed. One paisa above: refused.
- Selling price equal to MRP: accepted. One paisa above MRP: rejected.
- Missing setting: throws an error.

**Acceptance**
- [ ] Settings table migrated. Migration is a new file.
- [ ] Three dummy settings seeded, each with is_dummy = true.
- [ ] All pricing tests pass. Test output is included in the report.
- [ ] No floating-point numbers appear in pricing code.

**Done when:** all acceptance checks pass and the founder confirms.

---

### F02 Catalog data

**Goal:** Load realistic dummy data so catalog pages can be built and tested.

**Depends on:** F01

**Scope**
- Two dummy shops, each with a name and a status of active.
- Five categories (for example: Groceries, Snacks, Beverages, Dairy, Personal Care).
- About 30 products across the shops. Each product has: shop, category, name, brand, unit size, MRP_paise, shop_price_paise, selling_price_paise, is_active, is_available.
- Seed script that can run more than once without creating duplicates.

**Rules**
- shop_price_paise is at or below MRP_paise. Seeding fails if any row breaks this.
- selling_price_paise equals MRP_paise for dummy data unless a discount is set.
- Every product must have an existing shop and category.
- Dummy shop names and product names must be marked as dummy in the seed file.

**Tests**
- Seed runs twice with the same result (no duplicates).
- A product with shop price above MRP makes the seed fail.
- Every product has a valid shop and category.

**Acceptance**
- [ ] Seed script runs cleanly.
- [ ] Running it a second time changes nothing.
- [ ] Tests pass.

**Done when:** the founder reviews the seed data and confirms it.

---

### F03 Catalog pages

**Goal:** Let a customer browse categories, see products, open a product, and search by name, on a 360 px phone.

**Depends on:** F02

**Screens**
- Home: category grid, pincode pill, search bar, bottom navigation (Home, Search, Cart, Orders, Account). Search, Orders, and Account can show "coming soon" until their features exist.
- Category page: two product cards per row, sorted by name, 20 products per page with a "Load more" button.
- Product page: name, brand, unit size, MRP (crossed out when higher than the selling price), selling price, availability, and an Add to cart button (wired up in F04).
- Search results page: products whose name contains the search text. Not case sensitive.

**API (server)**
- GET /api/categories
- GET /api/categories/:slug/products?cursor=&limit= (limit maximum 50, default 20)
- GET /api/products/:id
- GET /api/products/search?q= (q must be at least 2 characters)

**Rules**
- Only active products are returned. An inactive product returns 404 on its page.
- Products that are not available show "Out of stock," and the Add button is disabled.
- Money is returned as integers (paise). The client converts it for display.
- List responses return only the fields the screen needs.

**Tests**
- Inactive products never appear in lists or search.
- Limit above 50 is rejected or capped.
- Search with fewer than 2 characters returns a clear error.

**Acceptance**
- [ ] All screens render at 360 px with no horizontal scrolling.
- [ ] Touch targets are at least 44 px. Body text is at least 16 px.
- [ ] Images load lazily and have fixed dimensions, so the layout does not jump.
- [ ] An empty category shows a friendly message.
- [ ] Screenshots of the three pages at 360 px are included in the report.

**Done when:** the founder confirms the screens on a real phone or at 360 px.

---

### F04 Cart

**Goal:** Let a customer collect items before checkout. The server calculates every total.

**Depends on:** F03

**Data**
- Cart: id, token (stored in an httpOnly cookie), created_at, updated_at.
- CartItem: cart_id, product_id, qty (1 to 10), unique on (cart_id, product_id).

**API (server)**
- GET /api/cart: returns items, subtotal, delivery fee, total, and "₹X more for free delivery" when applicable.
- POST /api/cart/items: body is productId and qty.
- PATCH /api/cart/items/:productId: body is qty. Qty 0 removes the item.
- DELETE /api/cart/items/:productId

**Rules**
- A cart holds items from one shop only. Adding from a second shop returns a conflict error with the message "Your cart has items from another shop. Empty the cart?". The client asks the customer to confirm, then empties the cart first.
- Only active and available products can be added.
- Prices are read from the database on every request. The browser never sends a price.
- If a price changes after an item is added, the new price shows on the next read.

**Screens**
- Sticky cart bar at the bottom of category and product pages: item count, total, and a "View cart" link.
- Cart page: items with quantity stepper and remove button, totals, and a "Checkout" button that is disabled when the cart is empty.

**Tests**
- Cart total equals the sum of line totals plus the delivery fee.
- Adding from a second shop is refused with the conflict error.
- A price changed in the database appears on the next cart read.
- Browser-sent price fields are ignored.

**Acceptance**
- [ ] Cart survives a page reload.
- [ ] The free-delivery message is correct on both sides of the threshold.
- [ ] The cart bar does not cover content on a 360 px screen.
- [ ] Tests pass.

**Done when:** the founder confirms the cart flow on a phone.

---

### F05 Order data model

**Goal:** Create the database tables that hold orders. Checkout (F06) writes to them.

**Depends on:** F04

**Data**
- Order: id, order_no (unique), user_id (nullable, for guests), guest_name, guest_phone, address (JSON snapshot), status (enum from plan section 7), subtotal_paise, delivery_fee_paise, total_paise, payment_method, payment_status, idempotency_key (unique), created_at, updated_at.
- OrderItem: order_id, product_id, shop_id, qty, mrp_paise, shop_price_paise, selling_price_paise, line_total_paise.
- Delivery: order_id (unique), status, cod_collected_paise, delivered_at, failure_reason.

**Rules**
- Order numbers come from a database sequence, not from application memory. If the foundation generator counts in code, change it in this feature and say so in the report.
- total_paise equals subtotal_paise plus delivery_fee_paise.
- Prices are copied into OrderItem at creation. Later price changes never change an existing order.
- Every schema change is a new migration.

**Tests**
- Migration applies to an empty database and to a database with existing data.
- total_paise equals the sum of line totals plus the delivery fee.
- Two orders created at the same moment get different order numbers.
- Duplicate idempotency_key is rejected by the database.

**Acceptance**
- [ ] Tables and enum created by migration.
- [ ] Sequence-based order numbers confirmed.
- [ ] Tests pass.

**Done when:** the founder confirms the schema in schema.prisma.

---

### F06 Guest checkout with cash on delivery

**Goal:** A guest can place an order by paying cash on delivery, with no account needed.

**Depends on:** F05

**Screen: /checkout**
- Fields: name, phone (numeric keyboard), address line, landmark (optional), pincode (6 digits).
- Payment: "Cash on delivery" is the only option in this feature.
- Order summary with subtotal, delivery fee, and total.

**API (server)**
- POST /api/checkout: body contains name, phone, address, landmark, pincode, and idempotencyKey. The cart is read from the cookie. Prices are not sent.

**Server steps (one database transaction)**
1. Validate the body with Zod.
2. Check the pincode against serviceable_pincodes (must be active).
3. Read the cart and recalculate every price and total.
4. Check the total against the COD limit.
5. Create Order, OrderItems, Delivery (status PENDING), with status CONFIRMED and payment_status PENDING_COLLECTION.
6. Empty the cart.
7. Return the order number.

**Rules**
- A repeated request with the same idempotencyKey returns the same order. It never creates a second one.
- If any step fails, nothing is saved, and the cart is kept.
- If a product became unavailable since it was added, checkout stops and lists the affected items.
- Phone number is stored, but only shown in admin screens.

**Screen: confirmation**
- Order number, items, total, and "Pay ₹X in cash to the delivery person."

**Tests**
- Non-serviceable pincode: no order is created, and the message is shown.
- Total above the COD limit: no order is created, and the message is shown.
- A price changed in the browser has no effect on the total.
- Same idempotencyKey sent twice: one order exists.
- A failure in the middle of checkout leaves no partial order.

**Acceptance**
- [ ] Checkout works at 360 px.
- [ ] Confirmation page shows the correct order number and amount.
- [ ] All tests pass.

**Done when:** a test order placed on a phone appears in the database with the correct totals.

---

### F07 Admin product CSV upload

**Goal:** The founder can load or update shop products from a CSV file, with strict validation.

**Depends on:** F02, F01

**Temporary access:** a single password from ADMIN_PASSWORD in .env. This is replaced in F09.

**Screen: /admin/products/upload**
- File picker, Upload button, and a results table.
- Link to a sample CSV in docs/samples/.

**CSV columns:** shop_name, category, product_name, brand, unit_size, mrp_rupees, shop_price_rupees

**Rules**
- Convert rupee text to paise with integer math. Accept at most two decimal places. Reject anything else.
- shop_price above mrp is an error.
- A missing field, an unknown shop, or an unknown category is an error.
- Import is all or nothing. If any row has an error, nothing is saved, and every error is listed with its row number.
- A product is matched by shop, product_name, and unit_size. Matches are updated, and new rows are created.
- Each price change writes a row to price_history.
- Each successful upload writes one audit_logs entry with the file name and row count.

**Tests**
- "12.50" becomes 1250 paise. "12.5" becomes 1250. "12.505" is rejected.
- Shop price above MRP: upload is refused, and the row number is shown.
- A file with one bad row imports nothing.
- A valid file creates or updates the expected products.

**Acceptance**
- [ ] Sample CSV included in docs/samples/.
- [ ] Error run and success run both shown in the report.
- [ ] Page is usable at 360 px.

**Done when:** the founder uploads the sample file and sees the expected result.

---

### F08 Phase 1 end-to-end test and review

**Goal:** Prove the whole Phase 1 flow works, and review the code against the rules.

**Depends on:** F01 to F07

**Scope**
- Automated browser test (Playwright) at 360 px: open home, open a category, open a product, add two items, go to checkout, enter a serviceable pincode, place a COD order, see the order number.
- Second test: a non-serviceable pincode is blocked and no order is created.
- Code review against AGENTS.md and plan sections 4, 5, 7, and 8. List every rule broken, with file and line. Fix nothing in the review itself.

**Acceptance (matches plan Phase 1 exit check)**
- [ ] Test order placed end to end.
- [ ] Both browser tests pass. Output included.
- [ ] Review list produced. Each item is fixed or logged as an open question.
- [ ] Founder reviews the screenshots.

**Done when:** the founder confirms Phase 1 is complete. Phase 2 starts only after this.

---

## Phase 2: Operations

### F09 Admin login

**Goal:** Replace the temporary admin password with real admin accounts.

**Depends on:** F07

**Data:** AdminUser: id, email (unique), password_hash, is_active, last_login_at.

**Scope**
- Login page at /admin/login. Logout button.
- All /admin routes and admin APIs require an admin session.
- Passwords are hashed with bcrypt or argon2. Never stored in plain text.
- Session cookie: httpOnly, Secure, SameSite=Strict.
- Remove ADMIN_PASSWORD from the code and the .env example.

**Rules**
- Rate limit: 5 failed logins per 15 minutes per IP and per email.
- Login success and failure are written to audit_logs (no password in the log).
- The first admin account is created by a seed script that reads its password from .env.
- Two-factor authentication is planned before launch, but is not part of this feature.

**Tests**
- Wrong password is rejected.
- Customer session cannot open /admin or call admin APIs.
- Sixth failed attempt is blocked.
- Logout ends the session.

**Acceptance**
- [ ] ADMIN_PASSWORD no longer appears in the code.
- [ ] Tests pass.

**Done when:** the founder logs in and out successfully.

---

### F10 Customer login with mobile OTP

**Goal:** Customers can log in with a one-time code sent to their phone.

**Depends on:** F06

**Flow**
1. Customer enters a 10-digit mobile number.
2. Server sends a 6-digit code by SMS.
3. Customer enters the code.
4. Server creates or finds the user and starts a session.

**Rules**
- Codes expire after 5 minutes.
- At most 3 code requests per number in 10 minutes.
- At most 5 wrong attempts per code, then the code is cancelled.
- Codes are stored as hashes. They are never logged.
- Session cookie: httpOnly, Secure, SameSite=Lax. Logout ends the session.
- Guest orders whose phone number matches the verified number are linked to the account. The customer sees them in order history.

**Tests**
- Expired code is rejected.
- Fourth code request within 10 minutes is blocked.
- Sixth wrong attempt is blocked.
- Logged-out customer cannot reach /account.

**Acceptance**
- [ ] SMS provider chosen and configured in .env (test credentials only).
- [ ] Tests pass.

**Done when:** the founder logs in on a real phone with a real code.

---

### F11 Saved addresses

**Goal:** Logged-in customers can save addresses and reuse them at checkout.

**Depends on:** F10

**Scope**
- Address list at /account/addresses: add, edit, delete, set default.
- Maximum 5 addresses per customer.
- Checkout pre-fills the default address and lets the customer pick another.
- Pincode check runs when an address is saved.

**Rules**
- A customer can only see and change their own addresses (ownership check on every request).
- Orders copy the address into the order snapshot. Editing an address later does not change past orders.

**Tests**
- Customer B cannot read or edit Customer A's addresses.
- Non-serviceable pincode is refused when saving.
- Checkout uses the default address.

**Acceptance**
- [ ] Works at 360 px.
- [ ] Tests pass.

**Done when:** the founder saves two addresses and places an order with each.

---

### F12 Admin order board and status rules

**Goal:** The founder sees all orders, moves them through their stages, and the system blocks any move that the rules do not allow.

**Depends on:** F06, F09

**Scope**
- /admin/orders: lists orders grouped by status with counts, and filters by date.
- Order detail page with items, totals, address, phone, payment status, and history.
- Status buttons show only the next allowed states.

**State machine (lib/orderStatus.ts)**
Allowed transitions only:
- PLACED → PAYMENT_PENDING, CONFIRMED
- PAYMENT_PENDING → CONFIRMED, PAYMENT_FAILED
- PAYMENT_FAILED → PLACED, CANCELLED
- CONFIRMED → SENT_TO_SHOP, CANCELLED
- SENT_TO_SHOP → PACKED, CANCELLED
- PACKED → OUT_FOR_DELIVERY
- OUT_FOR_DELIVERY → DELIVERED, FAILED_DELIVERY
- FAILED_DELIVERY → OUT_FOR_DELIVERY, CANCELLED
- DELIVERED → RETURNED
- CANCELLED and RETURNED are final.

**Rules**
- Invalid transitions are refused on the server, even if the button is hidden.
- Every change writes to audit_logs with the old status, new status, and actor.
- Cancelling an order after it is packed requires a reason and goes through F18.

**Tests**
- Every allowed transition succeeds.
- Every other transition is refused.
- Audit log entry is created for each change.

**Acceptance**
- [ ] Board works at 360 px.
- [ ] State machine tests cover every state.

**Done when:** the founder moves a test order through all stages.

---

### F13 Delivery list and cash collection

**Goal:** The founder sees today's deliveries, marks each one, and records the cash collected.

**Depends on:** F12

**Scope**
- /admin/deliveries: today's orders in status SENT_TO_SHOP, PACKED, or OUT_FOR_DELIVERY, sorted by pincode and then by order time.
- Actions: Start delivery (PACKED → OUT_FOR_DELIVERY), Delivered, Failed (with a reason: no answer, refused, wrong address, other).
- For COD orders, the founder enters the cash collected. It must equal the order total.
- Daily COD summary: expected cash, collected cash, and difference.

**Rules**
- A delivery can be marked Delivered only from OUT_FOR_DELIVERY.
- Cash collected must equal the total. A difference requires a note.
- Single delivery person in v1 (the founder).

**Tests**
- Cash collected not equal to total is refused unless a note is added.
- Daily summary matches the sum of delivered COD orders.

**Acceptance**
- [ ] Usable one-handed on a phone.
- [ ] Tests pass.

**Done when:** the founder completes a full day of test deliveries and the cash summary matches.

---

### F14 Order tracking and notifications

**Goal:** Customers and shops are told what is happening with an order, without the founder having to message anyone manually.

**Depends on:** F12

**Scope**
- /orders/:orderNo: status timeline. Logged-in customers see it in their history. Guests enter order number and phone to view it.
- Customer messages (SMS) on: CONFIRMED, OUT_FOR_DELIVERY, DELIVERED, CANCELLED.
- Shop message on SENT_TO_SHOP: WhatsApp or email with the item list and quantities. Shops do not see customer names or phone numbers.
- In v1, shop messages can be sent as a WhatsApp link the founder taps. Automated WhatsApp needs approved templates, which come later.

**Rules**
- Each status change creates one notification record. Repeating a status does not send the message again.
- A failed send is retried once, then logged as failed for the founder to see.
- Messages contain no more personal data than needed.

**Tests**
- One status change creates one notification.
- Repeated status does not resend.
- Guest cannot see another guest's order with a wrong phone number.

**Acceptance**
- [ ] Timeline works at 360 px.
- [ ] Notification log visible in admin.
- [ ] Tests pass.

**Done when:** a test order produces the expected messages on a real phone.

---

### F15 GST invoices

**Goal:** Every delivered order has a GST invoice with a sequential number.

**Depends on:** F12

**Scope**
- Invoice created when an order reaches DELIVERED.
- Invoice number from a database sequence with the financial-year prefix (for example INV-2026-27-000001). Financial year runs April to March.
- Invoice PDF stored in object storage and linked from the order.
- Invoice shows: seller name and GSTIN, buyer name and address, invoice number and date, item name, HSN code, quantity, taxable value, GST rate, GST amount, and total.
- Cancelled or returned orders get a credit note. Invoices are never deleted or reused.

**Rules**
- Invoice numbers have no gaps caused by the app.
- Tax treatment (GST rates, CGST and SGST for in-state sales, and how the shop and seller are shown) must be confirmed by a CA before live use.

**Tests**
- Ten invoices in a row are numbered consecutively.
- A credit note references the original invoice.
- The PDF contains every required field.

**Acceptance**
- [ ] CA has reviewed a sample invoice.
- [ ] Tests pass.

**Done when:** the founder and the CA approve a sample invoice.

---

## Phase 3: Payments and security

### F16 Online payment (test mode)

**Goal:** Customers can pay online with UPI or cards, using test keys only.

**Depends on:** F06, F10

**Decision needed first:** choose Razorpay or Cashfree. Record the choice in docs/plan.md.

**Scope**
- Checkout offers "Pay online" next to "Cash on delivery."
- Server creates a gateway order with the total in paise and creates the Order with status PAYMENT_PENDING.
- Browser opens the gateway checkout with the gateway order ID.
- Success page reads the order status from the server only.

**Rules**
- The amount is recalculated on the server before the gateway order is created.
- Only test keys are used in this feature. Keys are read from .env.
- Card numbers are never stored or logged.
- The order is not marked CONFIRMED in this feature. That happens only through the webhook in F17.

**Tests**
- Gateway order amount equals the server total.
- Failed test payment leaves the order in PAYMENT_FAILED.
- Browser cannot mark an order as paid.

**Acceptance**
- [ ] Test payment succeeds in the gateway's test mode.
- [ ] Tests pass.

**Done when:** a test payment appears in the gateway dashboard and the order status is PAYMENT_PENDING until F17 is done.

---

### F17 Payment webhooks and reconciliation

**Goal:** Payments are confirmed only by the gateway's signed messages, and no payment is lost if a message is missed.

**Depends on:** F16

**Scope**
- Webhook endpoint that receives gateway events.
- Verify the signature with the webhook secret from .env. Reject unsigned or wrongly signed requests with 401.
- ProcessedEvent table with a unique event ID, so each event is handled once.
- Reconciliation job every 5 minutes checks PAYMENT_PENDING orders older than 10 minutes against the gateway and updates them.

**Rules**
- Captured payment with the correct amount: order becomes CONFIRMED.
- Captured payment with a different amount: order is flagged for review and is not confirmed.
- Duplicate event: ignored after the first.
- Payment records are never deleted.

**Tests**
- Valid signature: order confirmed.
- Invalid signature: refused.
- Same event twice: processed once.
- Amount mismatch: flagged, not confirmed.
- Missed webhook: recovered by reconciliation.

**Acceptance**
- [ ] Webhook URL set in the gateway's test dashboard.
- [ ] All five tests pass.

**Done when:** a test payment confirms an order without any manual step.

---

### F18 Cancellations, refunds, and returns

**Goal:** Orders can be cancelled or returned, with the correct refund and shop deduction.

**Depends on:** F12, F17

**Scope**
- Customer can cancel from the order page before the order is PACKED.
- Admin can cancel at any stage before DELIVERED, with a required reason.
- Refund through the gateway's refund API for online payments. COD cancellations need no refund.
- Partial refunds for returned items.
- Return record with a reason code: damaged, expired, wrong item, customer changed mind, other.
- Returns for damaged or expired goods create a shop ledger deduction (the ledger is built in F23).

**Rules**
- Total refunded never exceeds the amount paid.
- Each refund has a status (requested, processed, failed) and the gateway refund ID.
- Cancelled and returned orders keep their invoice, with a credit note (see F15).

**Tests**
- Full cancellation before packing refunds the full amount.
- Cancellation after packing is refused for the customer.
- Partial return refunds only the returned items.
- Refund cannot exceed the amount paid.

**Acceptance**
- [ ] Refund status visible to the admin.
- [ ] Tests pass.

**Done when:** the founder processes one test refund and one test return end to end.

---

### F19 Legal pages and security hardening

**Goal:** The site has the policies payment providers and the law expect, and the common web attacks are blocked.

**Depends on:** F16

**Legal pages (draft text, reviewed by a lawyer before launch)**
- Terms and Conditions
- Privacy Policy (India's Digital Personal Data Protection Act, 2023)
- Refund and Cancellation Policy
- Delivery Policy
- Contact and grievance page (named contact, email, WhatsApp number)
- Footer link on every page.

**Security hardening**
- Security headers (Helmet), Content-Security-Policy, and HSTS.
- CORS allowed only for the site's own domain.
- Rate limits on login, OTP, checkout, search, and the webhook.
- Bot protection (Cloudflare Turnstile or reCAPTCHA) on signup and checkout.
- CSRF protection on state-changing requests.
- Dependency audit (npm audit) in CI.
- Check that secrets are not in the repository.

**Tests**
- Every legal page is reachable from the footer.
- Customer cannot call admin APIs.
- Customer cannot read another customer's order (ownership check).
- Rate limit returns 429 after the limit.
- Security headers are present on every page.

**Acceptance**
- [ ] Lawyer has reviewed the policy text.
- [ ] Tests pass.

**Done when:** the security test suite passes and the lawyer's review is complete.

---

## Phase 4: Launch preparation

### F20 Performance and monitoring

**Goal:** Meet the performance targets in plan section 11, and know immediately when something breaks.

**Depends on:** F03 to F19

**Scope**
- Lighthouse mobile tests on home, category, product, cart, and checkout.
- Images in WebP or AVIF, sized for their container, lazy-loaded below the fold.
- Route-level code splitting. Admin code is not loaded for customers.
- Database indexes from plan section 5.5.
- Catalog caching for 1 to 5 minutes, cleared when a price changes.
- Error tracking (Sentry) on client and server.
- Uptime monitor on the site and the API.
- Load test with k6: 50 concurrent users for the soft launch, and an evening peak.

**Acceptance**
- [ ] Targets met, or each miss is logged with a plan.
- [ ] A test error appears in Sentry.
- [ ] An uptime alert is received when the site is stopped on purpose.
- [ ] Load test results recorded.

**Done when:** the founder reviews the results and confirms.

---

### F21 Backups, deployment, and launch checklist

**Goal:** The site runs on a production server with backups, and the launch checklist is complete.

**Depends on:** F20

**Scope**
- Production environment with its own database and keys (separate from test keys).
- Domain connected with HTTPS.
- Environment variables set on the host, never in the repository.
- Daily automated backups kept for 7 to 30 days.
- One full restore test on a copy of the database.
- Runbook at docs/runbook.md: how to disable payments, restore a backup, notify customers, and contact the people who need to know.
- Launch checklist from plan section 13, complete.

**Acceptance**
- [x] Restore test succeeded and is recorded.
- [x] Every launch checklist item ticked.
- [x] Runbook reviewed by the founder.

**Done when:** the founder signs off on the launch checklist.

---

## Phase 5: Soft launch

### F22 Soft launch operations

**Goal:** Run the first 20 to 50 real orders in one area, and learn from them.

**Depends on:** F21

**Daily routine**
- Shop price updates through the CSV upload (F07).
- Cash reconciliation (F13).
- Issues log: late deliveries, wrong items, refused orders, refunds.

**Weekly review**
- On-time delivery rate.
- Repeat customers.
- Refunds and returns.
- Margin per order (selling price minus shop price, plus delivery fee, minus delivery cost).

**Acceptance**
- [ ] 20 real orders completed.
- [ ] Ledger matches the orders (checked in F23).
- [ ] Weekly review written.

**Done when:** the founder confirms the first 20 orders are complete and the issues log is up to date.

---

## Phase 6: Payouts and reporting

### F23 Shop ledger and payouts

**Goal:** Track what each shop is owed and pay them every 15 days, with a statement they can check.

**Depends on:** F22

**Scope**
- Ledger entry created automatically when an order is DELIVERED (sale).
- Ledger entry for returns (deduction for damaged or expired goods, from F18).
- Payout run for each shop every 15 days, showing sales, deductions, and the net amount.
- Payout statement (table or PDF) shared with the shop.
- Bank transfer reference recorded when the payout is made.
- Shop bank details are stored only as a provider reference (shop_bank_refs).

**Rules**
- Only DELIVERED orders create sales. Cancelled orders create nothing.
- A payout period is locked once the payout is recorded. Locked entries cannot change. Corrections are new adjustment entries.

**Tests**
- Payout total equals the sum of the period's ledger entries.
- Locked period cannot be changed.
- Return deduction appears on the statement.

**Acceptance**
- [ ] Two payout periods reconcile with the bank transfers.

**Done when:** the founder pays one shop and the statement matches the transfer.

---

### F24 Reporting dashboard

**Goal:** One page shows whether the business is making money.

**Depends on:** F23

**Scope**
- Daily view: orders, revenue, average order value, refunds, COD due, failed deliveries.
- Margin per order and total margin, using the shop price and selling price, plus delivery fees, minus delivery cost.
- Delivery cost per order: recorded by the founder, or estimated from a fixed amount set in Settings.
- CSV export of orders and payouts for the CA.

**Acceptance**
- [ ] Dashboard numbers match a hand calculation on a set of test orders.
- [ ] CSV export opens correctly in a spreadsheet.

**Done when:** the founder checks one week's numbers against a manual count.

---

## Phase 7: App decision

### F25 App decision review

**Goal:** Decide, using real numbers, whether a native app is worth building.

**Depends on:** F24, and at least 60 days of order data

**Triggers to review (from plan)**
- 20 or more orders a day for two weeks, or
- The founder spends more than 3 hours a day copying orders.

**Scope**
- Write the decision in docs/decisions.md with the numbers behind it.
- No code is written in this feature unless the founder decides to build the app.

**Done when:** the decision is recorded and the founder has signed it.

---

## Appendix A: Dummy values to replace before launch

| Setting | Dummy value | Replace with |
|---|---|---|
| DELIVERY_FEE_PAISE | ₹20 | Fee decided with the founder |
| FREE_DELIVERY_THRESHOLD_PAISE | ₹300 | Threshold from the margin formula (plan section 2) |
| COD_LIMIT_PAISE | ₹1,000 | Limit decided by the founder |
| Shop names and product prices | Dummy | Real shop agreements and price lists |
| Support email | support@plukit.in (placeholder) | Confirmed email after brand decision |
| Brand name | PlukIt | Final name after trademark check |

## Appendix B: Rules that apply to every feature

- Money is stored as integer paise.
- The server calculates every price and total.
- Every migration is a new file.
- Every feature has tests, and the test output is included in the report.
- Every feature is checked at 360 px.
- No secrets in the repository.
- The brand name appears only in the brand constants.
- One feature per task. Stop and ask if a task grows beyond its scope.
