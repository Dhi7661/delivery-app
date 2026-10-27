# Website Plan: Local Delivery Service (PlukIt)

Requirements, database, tech stack, security, payments, and performance.
Document version 1.2 | Status: Draft for review | Scope: mobile-first website first, native app later.

## 1. Overview
This document describes the website for a local delivery service that sells products from partner shops. A customer places an order online, the order is sent to the shop, and the founder delivers it. The website is built first and designed for phones from the start. A native store app is planned only after order volume justifies it.

### 1.1 Goal of version 1 (v1)
Prove the model with real orders in one area, with 3 to 5 partner shops and a small set of categories. v1 is a learning and validation product, not a full marketplace.

### 1.2 Success criteria for the first 60 days
- **Orders:** 10 to 20 real orders in the first two weeks, and some repeat customers by week four.
- **Delivery:** Orders delivered within the promised window, with failed deliveries tracked.
- **Shops:** Every shop paid on schedule, with a statement that matches the order records.
- **Margins:** Margin recorded for every order, so the free-delivery threshold can be checked against real numbers.

### 1.3 Out of scope for v1
Native store app (Play Store or App Store), live stock sync with shop systems, 10-minute delivery promise, subscriptions, customer reviews, multi-city operations, shop self-onboarding, and automated driver assignment. Each of these can be added once the basics work.

### 1.4 Assumptions
- One service area defined by a list of serviceable pincodes.
- The founder handles deliveries personally at first.
- Products are bought from a shop only after the customer order is confirmed (order-first buying).
- Customers pay through a payment gateway (UPI, cards) or cash on delivery (COD).

---

## 2. Business Rules the Software Must Enforce
- **Customer price never above MRP:** Server rejects any shop price or order price above MRP.
- **Buy from shop only after order confirmation:** Order moves to "Sent to Shop" only after payment success or COD confirmation.
- **Free delivery above threshold:** Threshold is a setting; the server applies it, never the browser.
- **Shop payouts every 15 days:** Ledger records every sale and deduction.
- **Returns & damage:** Each return has a reason code; cost deducted from shop ledger.
- **Price changes apply forward:** Order stores purchase-time prices.
- **Serviceable pincodes:** Checkout blocked outside pincode list.
- **Consecutive GST invoice numbers:** Sequence generated from DB, never reused.

---

## 3. Order Lifecycle
1. `Placed`: Submitted cart.
2. `Payment Pending`: Awaiting gateway confirmation.
3. `Payment Failed`: No money captured.
4. `Confirmed`: Paid or COD accepted.
5. `Sent to Shop`: Shop has order.
6. `Packed`: Shop packed order.
7. `Out for Delivery`: On the way with founder.
8. `Delivered`: Customer received order.
9. `Failed Delivery`: Delivery attempt failed (with reason).
10. `Cancelled`: Cancelled before packing (auto-refund if paid).
11. `Returned`: Returned after delivery (refunded; shop ledger adjusted).

---

## 4. Money Rule
Store every amount as an integer number of paise (₹1 = 100 paise). Field names end in `_paise`. Never use floating-point numbers.
