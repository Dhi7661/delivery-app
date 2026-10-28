# Website Plan: Local Delivery Service

Version 1.3. Working copy for development.
The full plan, with costs and the glossary, is in the Word document "Website Plan" version 1.2. Where the two differ, this file is correct.

## 1. Goal (v1)
Prove the model with real orders in one area, with 3 to 5 partner shops and a small set of categories.
Success in 60 days: 10 to 20 real orders in two weeks, some repeat customers by week four, every order delivered on time, every shop paid on schedule, and a margin recorded for every order.

## 2. Decisions made
| Area | Decision |
|---|---|
| Frontend | Next.js 16 (App Router), Tailwind CSS, TypeScript (strict) |
| Backend | Express.js, TypeScript (strict), Prisma ORM |
| Database | PostgreSQL |
| App type | Mobile-first website, installable as a PWA. Native app later, if needed. |
| Payments | Razorpay UPI payments (0% commission) and Cash on Delivery (COD) below limit. Cards disabled. |
| Orders | One shop per order in v1 |
| Checkout | Guest checkout in Phase 1 |
| Delivery | Founder delivers personally at first. Free delivery above a threshold. |
| Shop payouts | Every 15 days, as written in the shop agreement |
| Buying from shops | Only after the customer's order is confirmed. No stock is held. |

## 3. Open decisions
- Final brand name. PlukIt is a placeholder. Run the Indian trademark check before launch.
- Free-delivery threshold. Dummy value Rs 300 until shop margins are known. Use the formula: (delivery cost + amount to keep) divided by margin percentage.
- COD limit. Dummy value Rs 1,000.
- Business structure and GST registration. Confirm with a CA.
- Payout schedule. Every 15 days, as drafted.
- Delivery fee for orders below the threshold. Dummy value Rs 20.

## 4. Business rules
- Selling price never exceeds the printed MRP (Legal Metrology rules; confirm with a CA).
- Customers pay before anything is delivered. Nothing is delivered on credit.
- Free delivery above the threshold. Below it, the delivery fee applies.
- Each shop's sales and deductions are recorded in a ledger. Payouts are generated per period.
- Returns and damaged or expired goods are recorded with a reason code. The cost is deducted from the shop's ledger.
- Price changes apply going forward only. Each order stores the prices it was sold at.
- Serviceable pincodes only.
- GST invoice per order, with consecutive invoice numbers.

## 5. Money and pricing
- All amounts are integers in paise (Rs 1 = 100 paise). No floating-point math.
- Settings table: one row per setting, with key (unique), value_paise (integer), is_dummy (boolean), and updated_at. Keys: DELIVERY_FEE_PAISE, FREE_DELIVERY_THRESHOLD_PAISE, COD_LIMIT_PAISE.
- The server calculates totals. The browser only sends product IDs and quantities.

## 6. Phases and status
| Phase | Weeks | Scope | Exit check | Status |
|---|---|---|---|---|
| 0. Decisions | 1 | Name, pricing rules, pincode list, shop talks, shop agreement draft, domain | Margin and threshold filled with real shop numbers | In progress |
| 1. Core store | 2 to 3 | Category and product pages, cart, admin CSV upload, COD checkout, end-to-end test | Test order placed end to end | In progress |
| 2. Operations | 4 | OTP login, addresses, admin order board, status updates, SMS or email | Ten test orders through all statuses | Not started |
| 3. Payments and security | 5 to 6 | Gateway in test mode, webhooks, refunds, legal pages, security checklist | Payment, failure, refund, and duplicate-webhook tests pass | Not started |
| 4. Performance and launch prep | 7 | Lighthouse targets, real-phone tests, load test, backups, monitoring, domain | Launch checklist complete | Not started |
| 5. Soft launch | 8 to 10 | One area, 3 to 5 shops, 20 to 50 real orders | Repeat customers, on-time delivery, accurate payouts | Not started |
| 6. Payouts and reporting | After launch | Shop statements, daily COD reconciliation, margin reports | Payouts match the ledger for two periods | Not started |
| 7. App decision | When triggered | Review whether a native app is needed | Decision recorded with numbers | Not started |

## 7. Order lifecycle
PLACED, PAYMENT_PENDING, PAYMENT_FAILED, CONFIRMED, SENT_TO_SHOP, PACKED, OUT_FOR_DELIVERY, DELIVERED, FAILED_DELIVERY, CANCELLED, RETURNED.
Only the transitions in the Word plan are allowed. An order cannot skip payment or packing.

## 8. Data model
Current entities (19): Users, Addresses, Shops, Shop Bank Refs, Categories, Products, Price History, Serviceable Pincodes, Orders, Order Items, Payments, Refunds, Deliveries, Returns, Shop Ledger, Payouts, GST Invoices, Support Tickets, Audit Logs.
Planned for Phase 1: Settings, Cart, Cart Item.
Key rules: order items store the MRP, shop price, and selling price at purchase time. Payments have a unique gateway payment ID. Shop bank details are stored only as a payout reference.

## 9. Payments
- Flow: the browser sends the cart. The server recalculates the total and creates a pending order and a gateway order. The browser opens the gateway checkout. A signed webhook confirms payment. The success page only reads the status from the server.
- Refunds use the gateway's refund API and are recorded in the refunds table.
- Gateway fees come out of the margin. Include them in the threshold formula.
- Cash on delivery: below the COD limit only. The founder records the cash collected and reconciles it each day.
- Card numbers are never stored. Use the gateway's hosted checkout.
- Before live mode: business documents, a bank account, and published Terms, Privacy Policy, Refund and Cancellation Policy, Delivery Policy, and a grievance contact.

## 10. Security summary
- HTTPS everywhere. OTP login with attempt limits. Secure, httpOnly, SameSite cookies.
- Every endpoint checks the user's role and ownership of the record it returns.
- Zod validation on every request. Prisma for all queries.
- Rate limits on login, OTP, search, checkout, and webhooks. Bot protection on signup and checkout.
- Verify webhook signatures and process each event once.
- Admin accounts are separate, with 2FA where available. All admin actions are logged.
- Secrets live in .env, never in the repo. Separate test and live keys.
- Privacy: follow India's Digital Personal Data Protection Act, 2023. Collect only what is needed, publish a privacy policy, and name a grievance contact. Confirm details with a lawyer.

## 11. Performance targets
- Largest Contentful Paint under 2.5 s on a mid-range Android over 4G.
- Interaction to Next Paint under 200 ms. Cumulative Layout Shift under 0.1.
- JavaScript on first load under 200 KB compressed (target).
- Catalog API under 300 ms (95th percentile). Checkout API under 800 ms, excluding gateway time.
- Uptime 99.5% per month. Error rate under 1%.

## 12. Mobile-first design
- Every screen is designed at 360 px first.
- Bottom navigation: Home, Search, Cart, Orders, Account.
- Sticky cart bar on category and product pages.
- Touch targets at least 44 px. Body text at least 16 px.
- Correct keyboards and autofill for phone, OTP, and address fields.
- UPI app opens directly on Android where the gateway supports it.
- Installable as a PWA with a manifest, icons, and a service worker. No offline ordering in v1.

## 13. Launch checklist (summary)
- Every selling price is at or below MRP, checked in the database.
- Free-delivery threshold and COD limit tested with sample baskets.
- Payment success, failure, refund, and duplicate webhook tested.
- Two test customers cannot see each other's orders.
- Customer accounts cannot reach admin pages or APIs.
- HTTPS and security headers checked. Backups running, with one restore tested.
- Error tracking and uptime alerts working.
- Policies published, shop agreements signed, shop price lists checked against MRP.
- Checked on a real Android phone and an iPhone at 360 px.
- Support WhatsApp number and email working.
