# 04 — Checkout & Payments Spec
## Order Placement (COD + Stripe Card), Stock Semantics, Webhook

**Milestone:** M5 · **SRS:** FR-5.x · **Legacy ref:** `controllers/checkout.controller.js`,
`controllers/stripeWebhook.controller.js`, `routes/webhooks.routes.js`

---

## 1. Auth
All checkout routes require an authenticated **customer** (`[auth: customer]`).
Unauthenticated → 401 → frontend redirects to sign-in.

## 2. Routes (new → legacy)

| Method | New path | Legacy | Auth |
|--------|----------|--------|------|
| GET | `/api/checkout` | `GET /customer/checkout/` | customer |
| GET | `/api/checkout/data` (+ `/summary`, `/model` aliases) | `GET /customer/checkout/data` | customer |
| POST | `/api/checkout` (COD) | `POST /customer/checkout/` | customer |
| POST | `/api/checkout/create-payment-session` (Card) | `POST /customer/checkout/create-payment-session` | customer |
| GET | `/api/checkout/success/:orderNumber` | `GET /customer/checkout/success/:order` | customer |
| GET | `/api/checkout/track/:orderNumber` | `GET /customer/checkout/track/:order` | customer |
| GET | `/api/checkout/saved-payment-methods` | `GET /customer/checkout/saved-payment-methods` | customer |
| GET | `/api/checkout/saved-addresses` | `GET /customer/checkout/saved-addresses` | customer |
| POST | `/webhooks/stripe` | `POST /webhooks/stripe` | public (webhook signature) |

`/webhooks/stripe` uses `express.raw({ type: 'application/json' })`, and is excluded from
body-parser and CSRF (like legacy).

---

## 3. Stock semantics (non-negotiable parity)

| Payment method | When stock is decremented |
|----------------|---------------------------|
| **COD** | During order placement, inside the same transaction. |
| **Card** | **Only** on `payment_intent.succeeded` webhook (NOT at Checkout Session creation). |

Conditional decrement everywhere:
```
UPDATE product_variants SET stock = stock - ? WHERE id = ? AND stock >= ?
```
affectedRows === 0 ⇒ throw `INSUFFICIENT_STOCK`.

---

## 4. Addresses
`billing_address` / `shipping_address` stored as JSON with:
`country, emirate, city, address_line1 (+ optional lines), landmark, postal_code,
latitude, longitude, google_place_id, formatted_address, location_label, location_source`.

Validation (COD + Card): `country, emirate, city, address_line1` required.

---

## 5. COD order placement (`POST /api/checkout`)
1. Validate `payment_method === 'cod'`. If `'card'` posted here → error telling user to use
   the Stripe button (parity with legacy).
2. Resolve identity: `userId` (numeric) + `cartUserId` (email).
3. In a transaction:
   - Claim guest cart rows (`user_id = email WHERE guest_token = token`).
   - Fetch + lock cart rows (`FOR UPDATE`).
   - For each cart row: lock variant, validate `quantity <= stock`.
   - Compute line totals (pricing util) → subtotal/discount/vat/grand.
   - Insert `orders` (`order_status='placed'`, `payment_status='pending'`, `currency='AED'`).
   - Insert `order_items` (one per cart row).
   - **Decrement stock** (conditional).
   - Insert `order_payments` (`status='pending'`).
   - Mark cart rows `status='ordered', order_id`.
   - Optionally save address/payment method for autofill.
4. Emit `orderCreated`, `orderTrackingUpdated`, `cartUpdated`.

Generated IDs: `order_number = ORD-YYYYMMDD-XXXXXXXX`, `tracking_id = TRK-...`,
`payment_reference = PAY-...`.

---

## 6. Stripe Card (`POST /api/checkout/create-payment-session`)
1. Validate `payment_method='card'`, `gateway_provider='stripe'`; same address/customer validation.
2. In a transaction:
   - Same cart/variant/stock validation (does **not** decrement stock).
   - Insert `orders` (`order_status='pending_payment'`, `payment_status='initiated'`).
   - Insert `order_items`, `order_payments` (`status='initiated'`).
   - Mark cart rows ordered.
   - `stripe.checkout.sessions.create`:
     - `mode:'payment'`, `payment_method_types:['card']`, `currency:'aed'`,
       `metadata:{order_id, order_number, user_id}`,
       `success_url: .../success/{order_number}?session_id={CHECKOUT_SESSION_ID}`,
       `cancel_url: .../checkout`.
   - Store `stripe_session_id`, `stripe_payment_intent_id`, `stripe_checkout_url` in
     `order_payments.gateway_response`.
3. Return the Stripe Checkout URL to the frontend (frontend redirects to Stripe).

---

## 7. Webhook handler (`/webhooks/stripe`)
Verify with `stripe.webhooks.constructEvent(signature)`. Guard by event ID / no replay.

| Event | Action |
|-------|--------|
| `checkout.session.completed` | Record session/payment-intent IDs into `gateway_response`. **No stock change.** |
| `payment_intent.succeeded` | **Idempotent:** if payment already `paid`, skip. Else decrement stock via `order_items`; set `orders.payment_status='paid'`, `order_status='confirmed'`; set `order_payments.status='paid'`. |
| `payment_intent.payment_failed` | Set `orders.payment_status='failed'`, `order_status='payment_failed'`; `order_payments.status='failed'`. |

---

## 8. Order state machine (parity)
- **order_status** values: `pending, initiated, pending_payment, processing, ongoing,
  confirmed, completed, cancelled, refunded, partially_refunded`.
- **payment_status** values: `pending, initiated, paid, failed`.
- **PAID** bucket: `paid, completed, captured, successful, success`.
- **PENDING** bucket: `pending, initiated, pending_payment, processing, ongoing`.
- **REFUNDED** bucket: `refunded, refund, partially_refunded`.
- **CANCELLED** bucket: `cancelled, canceled`.

---

## 9. Delays/failure handling
- If `payment_intent.succeeded` fires but an `order_items` row references a variant,
  decrement each; guard so double webhook delivery is a no-op.
- Notify frontend via `orderTrackingUpdated` socket event on webhook state change.

---

## 10. Data model
`orders`: `id, user_id, guest_token, order_number, tracking_id, payment_reference,
customer_name, email, phone, currency, subtotal_amount, discount_amount, vat_amount,
grand_total, payment_method, payment_status, order_status, gateway_provider,
billing_address (JSON), shipping_address (JSON), notes, created_at, updated_at`.

`order_items`: `id, order_id, cart_id, product_id, variant_id, product_name, variant_name,
sku, quantity, unit_price, discount_amount, vat_amount, line_total, created_at`.

`order_payments`: `id, order_id, provider, payment_method, transaction_reference, amount,
currency, status, gateway_response (JSON), created_at, updated_at`.

`customer_payment_methods`: `id, user_id, method_type, provider, cardholder_name, card_brand,
card_last4, card_fingerprint, card_number_enc (AES-256-GCM if CARD_ENCRYPTION_KEY set),
expiry_month, expiry_year, display_name, account_email, is_default, meta (JSON), created_at,
updated_at`.

---

## 11. Acceptance checklist (M5)
- [ ] COD: order + items + payment rows created; stock decremented in same transaction.
- [ ] Card: session created; **no** stock decrement until webhook.
- [ ] Webhook `payment_intent.succeeded` decrements stock exactly once (replays no-op).
- [ ] Webhook `payment_failed` marks order failed without stock change.
- [ ] Conditional decrement throws `INSUFFICIENT_STOCK` on oversell; transaction rolls back.
- [ ] Success + tracking endpoints return parity data.
- [ ] Saved payment methods/addresses load for autofill.
- [ ] Tested with Stripe **test** keys for COD vs Card timing parity.
