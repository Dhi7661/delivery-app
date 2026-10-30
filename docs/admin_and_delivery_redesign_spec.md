# PlukIt Admin Panel and Delivery Partner Spec

Version 1.2. Replaces version 1.1.
Status: Draft. Items marked **Open** need a founder decision before the feature is built.
Read together with AGENTS.md, docs/plan.md, docs/features.md, and docs/ui-redesign.md.

---

## 0. What changed from version 1.1

- The build order now starts with the rider and order flow, because the founder needs it for the pilot. The visual product editor moves later.
- COD orders must be confirmed with the customer before the shop packs them.
- "Mark Packed & Picked Up" is split into separate, logged steps that match the state machine in F12.
- The admin and rider screens use the Warm Saffron design tokens. The Dark Slate theme is removed.
- The payout cycle, refused-order costs, partial availability, and cash limits are listed as open decisions, not assumed.
- Missing rules have been added: partial availability, shop packing messages, rider login, customer data on the rider screen, offline actions, rider alerts, image upload safety, price safeguards, SKU and barcode fields, and admin two-factor login.

---

## 1. Scope and build order

### 1.1 Before soft launch (required for the pilot)

1. Admin login with two-factor authentication (F09).
2. Admin order board with the status rules in section 3 (F12).
3. Customer confirmation for COD orders (section 4).
4. Rider login by OTP (F10) and the rider order screen (section 7).
5. Daily cash handover (section 7.4).
6. Partial availability (section 5).
7. Shop payouts recorded by cash, UPI, or bank, with a lock once paid (section 9). CSV export only.
8. Catalog stays on the CSV upload (F07).

### 1.2 After soft launch

9. Visual product editor with photo upload and price safeguards (section 10).
10. Rider alerts through web push (section 7.6).
11. Multiple riders, with assignment on the order board.
12. Desktop layouts, filters, PDF statements, and the audit log viewer.

### 1.3 Out of scope for version 1

- Online payments for the rider flow. These stay behind the `ENABLE_ONLINE_PAYMENT` flag, which is off at launch.
- Rider location tracking.
- Shop login or a shop portal. Shops receive packing lists by WhatsApp.

---

## 2. Roles and access

| Role | Who | Can see | Cannot see |
|---|---|---|---|
| Customer | Shoppers | Own orders, addresses, cart | Other customers, admin screens |
| Rider | Delivery partner (the founder during the pilot) | Today's assigned orders, customer name, phone, and address for those orders only | Shop buy prices, margins, shop ledgers, payouts, revenue, other riders' cash |
| Admin | Founder and any trusted staff | Everything | Nothing is hidden, but every action is logged |

Every endpoint checks the role and the ownership of the record it returns (AGENTS.md security rules).

**Authentication**
- Admin: email, password, and two-factor login. Sessions end after 12 hours of inactivity.
- Rider: mobile OTP through F10. No PIN. Sessions end after 12 hours of inactivity.
- Both: rate limits on login and OTP requests, and every login is logged in audit_logs.

---

## 3. Order status rules used by admin and rider

These match the state machine in features.md F12. Each change writes one audit_logs entry with the old status, the new status, the actor, and the time.

| From | To | Who | Extra requirement |
|---|---|---|---|
| PLACED | CONFIRMED | System (online payment) | None |
| PLACED | CONFIRMED | Admin (COD) | Customer confirmed (section 4) |
| CONFIRMED | SENT_TO_SHOP | Admin | Packing list sent to the shop by WhatsApp |
| SENT_TO_SHOP | PACKED | Admin | Shop confirmed packed (WhatsApp reply recorded) |
| PACKED | OUT_FOR_DELIVERY | Rider | "Picked up" tapped on the rider screen |
| OUT_FOR_DELIVERY | DELIVERED | Rider | COD cash recorded (section 7.3) |
| OUT_FOR_DELIVERY | FAILED_DELIVERY | Rider | Reason chosen from the list |
| FAILED_DELIVERY | OUT_FOR_DELIVERY | Admin | Rescheduled for another attempt |
| FAILED_DELIVERY | CANCELLED | Admin | Reason recorded |
| DELIVERED | RETURNED | Admin | Return reason code recorded (F18) |

**Cancelling after packing** is not a simple status change. It goes through the refund and return flow in F18, with a reason.

**Removed from version 1.1:** "Mark Packed & Picked Up" as a single action. Packing and pickup are separate steps.

---

## 4. Customer confirmation for COD orders

Before an admin moves a COD order from CONFIRMED to SENT_TO_SHOP, the admin must confirm the order with the customer by phone or WhatsApp.

- The admin taps "Confirm with customer" and records the method and time.
- The confirmation includes the item list and the total.
- An order that stays unconfirmed for longer than the limit is flagged on the board. **Open:** the limit, proposed at 2 business hours.
- If the customer changes the order, section 5 applies.

Reason: COD orders can be refused at the door. Confirming first means the shop packs only orders that are likely to be collected.

---

## 5. Partial availability

Shops sometimes run out of an item after an order is placed.

1. The admin marks the item as unavailable on that order. The shop's reply is recorded.
2. The server recalculates the total from the database. The browser never sends a total.
3. The customer is told by WhatsApp or SMS: the missing item, the new total, and the choices (accept the change, or cancel the order).
4. The order is packed only after the customer accepts the change.
5. The shop is paid only for the items actually delivered.

**Open:** whether any change needs customer approval, or only changes above a set amount.

---

## 6. Refused or failed COD orders

When a customer refuses a COD order after it has been packed, someone bears the cost of the goods.

- If the order was refused before packing: no cost, because the shop was not paid.
- If the order was packed and refused: **Open.** Options:
  - A. The shop takes back undamaged goods (written in the shop agreement).
  - B. PlukIt bears the cost.
  - C. The cost is split by a fixed rule.

Whichever option is chosen must appear in the shop agreement and in the shop ledger logic (F23).

---

## 7. Rider portal (/delivery)

### 7.1 Screens

- **Login:** mobile number and OTP.
- **Today:** a count of active orders and cash to hand over, followed by the order list.
- **Order card:** a pickup step (shop name, items, "Open in Google Maps") and a drop step (customer name, address, "Call customer", "Open in Google Maps"), followed by the action buttons.

### 7.2 Actions

| Action | When | Result |
|---|---|---|
| Picked up | Order is PACKED | OUT_FOR_DELIVERY |
| Delivered | Order is OUT_FOR_DELIVERY | DELIVERED, with COD cash recorded |
| Delivery failed | Order is OUT_FOR_DELIVERY | FAILED_DELIVERY, with a reason from: no answer, wrong address, customer refused, other |

### 7.3 Cash on delivery

- For COD orders, the rider enters the cash collected. It must equal the order total.
- If it differs, the rider adds a note. **Open:** the maximum difference a rider can record without admin approval. Proposed: ₹50.
- For online-paid orders (only when the flag is on), the screen shows "Paid online. Do not collect cash." This is hidden at launch.

### 7.4 Daily cash handover

- The rider sees today's total cash collected.
- The rider confirms the handover. The admin confirms receipt.
- Any difference is recorded with a note.
- A cash handover is the only way a rider's cash balance returns to zero.

### 7.5 Customer data on the rider screen

- A customer's name, phone, and address appear only while the order is active.
- They are hidden after the order is DELIVERED, FAILED_DELIVERY, or CANCELLED.
- Phone numbers are shown as tap-to-call links. Masked calling can be added later.
- The rider never sees shop buy prices, margins, or other orders.

### 7.6 Alerts for new orders

- **Pilot:** the founder is alerted by WhatsApp or SMS, and checks the rider screen.
- **Later:** web push. On iPhone, Safari supports web push only for apps added to the Home Screen (iOS 16.4 or later). The app must ask for permission after the rider taps a button, so the prompt can't appear on its own. Android Chrome works without the Home Screen step.

### 7.7 Offline and poor network

- Actions taken without a connection are saved on the phone and sent when the connection returns.
- The screen shows "Pending sync" on any action not yet confirmed by the server.
- An order is shown as DELIVERED only after the server confirms it.
- Failed sends are retried, and the rider can see which actions are still pending.

### 7.8 Wireframe (version 1.2)

```
PlukIt Delivery                                  [Rider name]
Active orders: 2        Cash to hand over: ₹650
----------------------------------------------------------
ORDER PLUK-2026-1042                         [Out for pickup]

PICK UP
  Shop name, area
  Items: 3 (list)
  [Open in Google Maps]

DROP OFF
  Customer name
  [Call customer]
  Address
  [Open in Google Maps]

PAYMENT
  Collect cash: ₹450

[ Picked up ]   [ Delivered ]   [ Delivery failed ]
```

---

## 8. Admin panel

### 8.1 Screens

- **Order board:** orders grouped by status, with counts. Each card shows the next allowed action only (section 3).
- **Order detail:** items, totals, customer confirmation, shop packing messages, partial availability, cash recorded, and the audit history.
- **Delivery list:** today's orders with the assigned rider (one rider during the pilot).
- **Cash handover:** the daily total, the rider's confirmation, and the admin's confirmation.
- **Shop payouts:** section 9.
- **Catalog:** CSV upload at launch. The visual editor is in section 10.
- **Audit log:** searchable by order, user, and action. Read-only.

### 8.2 Layout

- Mobile first, because the founder works from a phone. Stacked cards with full-width buttons.
- Desktop uses the same components in wider grids and tables.
- Every button and input is at least 44 px high.

### 8.3 Admin security

- Two-factor login (F09).
- Rate limits on login.
- Session ends after 12 hours of inactivity.
- Every change to prices, settings, payouts, and order status is logged.

---

## 9. Shop payouts

### 9.1 Payment modes

| Mode | Reference that must be recorded |
|---|---|
| UPI | UPI transaction reference (12 digits) |
| Cash | Handover note with the date, amount, and the name of the person who received it |
| Bank transfer | UTR (bank reference number) |

A payout can't be saved without a reference. For UPI, the shop's saved UPI ID is shown to help the admin match the payment. The payment mode is stored with the payout and printed on the statement.

### 9.2 Payout cycle

**Open.** The shop agreement must match the chosen cycle.

- Option A (proposed): fixed fortnights, 1st to 15th and 16th to the end of the month. Easier for accounts.
- Option B: rolling 15 days from the start of the agreement.

### 9.3 What a payout includes

- Sum of the shop buy prices for orders DELIVERED in the period.
- Minus approved return deductions in the period, including damaged or expired goods.
- Minus or plus adjustments approved by the founder, each with a note.

### 9.4 Period lock

- Once a payout is marked PAID, the period is locked.
- Locked entries cannot be changed. Corrections are new adjustment entries.

### 9.5 Statements

- Version 1: CSV export with the payment mode and reference for each payout.
- Later: PDF statements.

---

## 10. Catalog and product management

### 10.1 At launch

The CSV upload in F07 stays. It is the fastest way to update prices for a few shops.

### 10.2 Visual editor (after soft launch)

**Fields:** name, brand, unit size, category, MRP, shop buy price, selling price, partner shop, SKU, barcode (optional, EAN-13), in stock, active, photo.

**Price rules (enforced on the server):**
- Shop buy price ≤ selling price ≤ MRP.
- A warning appears when the margin falls below a set level. **Open:** the level.
- A price change applies to new orders only. Orders already placed keep their prices (F05).
- Every price change is written to price_history.

**Photos:**
- Accept JPG, PNG, and WebP. Check the file type from its contents, not its extension.
- Reject SVG and any other type.
- Accept files up to 5 MB, because phone cameras produce large files. Reject larger files with a clear message.
- The server converts the photo to WebP at 800 × 800, removes location and other metadata, and stores it in object storage.
- The "fallback URL" option from version 1.1 is removed. The server never fetches a URL the admin types in, because that can be used to reach internal services. If an external image is needed, the browser loads it directly and the server only stores the link.
- Until a photo exists, the product shows ImagePlaceholder.

**Stock:** the in-stock toggle is for items the shop has run out of. It doesn't change orders already placed (section 5 handles those).

---

## 11. Design

- One design system for the customer app and the admin app: the Warm Saffron tokens in docs/design.md.
- Admin screens may be denser, but they use the same colours, fonts, radii, and button styles.
- Status badges use the existing palette: primary for delivered, saffron for in progress, and muted for cancelled or failed.
- No new colours without the founder's approval.
- Buttons and inputs are at least 44 px high.

---

## 12. Security and privacy

- Role checks and ownership checks on every endpoint.
- Rate limits on login, OTP, and any endpoint that sends messages.
- Two-factor login for admin.
- Audit log for all status changes, payouts, price changes, settings, rider actions, and logins.
- Rider data: name, mobile number, and the cash records. No identity documents in version 1. Riders receive a short privacy notice under the Digital Personal Data Protection Act, 2023.
- Logs never contain full phone numbers, OTPs, or addresses. Mask them.
- Secrets stay in .env, never in the repository.

---

## 13. Roadmap mapping and acceptance

### 13.1 Mapping to features.md

| Spec section | Feature | Status |
|---|---|---|
| 2 (admin login) | F09 | Existing |
| 2 (rider OTP) | F10 | Existing |
| 3 (order board) | F12 | Existing |
| 7 (rider screen) and 8.1 (delivery list) | F13 | Existing, expanded |
| 4 (customer confirmation) | F12 extension | Add to F12 |
| 5 (partial availability) | F12 extension | Add to F12 |
| 6 (refused COD) | F18 | Existing, add the decided rule |
| 7.4 (cash handover) | F13 extension | Add to F13 |
| 9 (shop payouts) | F23 | Existing, simplified for version 1 |
| 10.2 (visual editor) | F26 | New, add to features.md |
| 7.6 (web push for riders) | F27 | New, add to features.md |
| 2 (multiple riders) | F28 | New, add to features.md |

### 13.2 Acceptance tests

- A COD order cannot move to SENT_TO_SHOP without a customer confirmation.
- A rider can see only their assigned active orders.
- A rider cannot see shop buy prices, margins, or ledgers. Test with a rider account.
- A customer's phone number is hidden on the rider screen after delivery.
- Every status change writes one audit log entry.
- An invalid status transition is refused on the server.
- Cash recorded for a COD delivery must equal the total, or carry a note.
- A payout cannot be saved without a reference.
- A locked payout period cannot be changed.
- A photo upload with a wrong file type is rejected, even when the extension is correct.
- A selling price below the shop buy price is refused.
- A price change does not change an existing order.
- Offline actions are sent after reconnecting, and no order shows DELIVERED before the server confirms it.

---

## 14. Open decisions for the founder

| # | Decision | Options | Affects |
|---|---|---|---|
| 1 | Payout cycle | A: fixed fortnights (proposed). B: rolling 15 days | 9.2 and the shop agreement |
| 2 | Refused COD after packing | A: shop takes back. B: PlukIt bears it. C: split by a fixed rule | 6 and the shop agreement |
| 3 | Partial availability | Customer approval for every change, or only above a set amount | 5 |
| 4 | Maximum cash difference for a rider | Proposed ₹50, or another amount | 7.3 |
| 5 | COD confirmation time limit | Proposed 2 business hours | 4 |
| 6 | Minimum margin warning | Amount or percentage | 10.2 |
| 7 | Rider alerts for the pilot | WhatsApp or SMS manually, or wait for web push | 7.6 |

---

## Appendix A: Permissions summary

| Action | Customer | Rider | Admin |
|---|---|---|---|
| Place order | Yes | No | Yes (for a customer) |
| See own order | Yes | No | Yes |
| See assigned active orders | No | Yes | Yes |
| Confirm COD with customer | No | No | Yes |
| Send to shop | No | No | Yes |
| Picked up | No | Yes | No |
| Delivered with cash | No | Yes | No |
| Delivery failed | No | Yes | No |
| Cash handover (rider side) | No | Yes | No |
| Cash handover (receipt) | No | No | Yes |
| Record payout | No | No | Yes |
| Change prices | No | No | Yes |
| View audit log | No | No | Yes |
