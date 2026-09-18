# 05 — Customer Account Spec
## Profile, Orders, Addresses, Payment Methods, Billing, Security, Transaction History

**Milestone:** M6 · **SRS:** FR-6.x · **Legacy ref:** `controllers/u/*.controller.js`,
`routes/u/*.routes.js`, `controllers/shop.controller.js` (enrichment)

---

## 1. Auth
All routes in this spec are `[auth: customer]` — the authenticated customer's own data only
(scope by `req.userId`; never allow cross-user access).

## 2. Routes (new → legacy)

| Method | New path | Legacy | Purpose |
|--------|----------|--------|---------|
| GET/PUT | `/api/account/profile` | `(u/profile)` | view/edit profile |
| GET | `/api/account/orders` | `(u/orders)` | orders list |
| GET | `/api/account/orders/:orderNumber` | `(u/order-details)` | order detail incl. items |
| GET | `/api/account/addresses` | `(u/addresses)` | list addresses |
| POST | `/api/account/addresses` | `(u/addresses)` | create address |
| PUT | `/api/account/addresses/:id` | `(u/addresses)` | update address |
| DELETE | `/api/account/addresses/:id` | `(u/addresses)` | delete address |
| POST | `/api/account/addresses/:id/default` | `(u/addresses)` | set default |
| GET | `/api/account/payment-methods` | `(u/account/payment-methods)` | list cards |
| DELETE | `/api/account/payment-methods/:id` | `(u/account/payment-methods)` | remove card |
| GET | `/api/account/billing` | `(u/account/billing)` | billing / spend / invoices |
| GET | `/api/account/transaction-history` | `(u/account/transaction-history)` | transaction history |
| POST | `/api/account/security/update-email` | `(u/security/updateEmail)` | change email (OTP) |
| POST | `/api/account/security/update-password` | `(u/security/updatePassword)` | change password (verify current) |

---

## 3. Per-area rules

### Profile
- Fields: `full_name, email, phone, bio?, address?, city?, country?` (match legacy
  `customer_accounts` shape). Update allowed fields; email change goes through security flow.

### Orders list / detail
- List: the customer's orders, most recent first, paginated.
- Detail: order header + `order_items` + `order_payments` (safe subset — never leak
  encrypted card data), statuses from the state machine in `04-checkout-payments.spec.md` §8.

### Addresses
- CRUD on `user_addresses`. `is_default` flag; setting one default unsets others for that
  user. Fields: `address_type, address, address_line1, landmark, city, emirate, country,
  postal_code, email?, is_default`.

### Payment methods
- List saved cards (masked: `brand **last4`, expiry). Remove by id. Dedup by
  `card_fingerprint`. Never return `card_number_enc` or full number to the client.

### Billing
- Per-user spend summary: total spent, paid orders, pending payments, refund total,
  this-month spend, last paid at, first order at (lateral aggregate over `orders`).

### Transaction history (customer)
- The customer's orders as transactions with item/product context; product names attached
  (add product search capability in the later admin spec).

### Security — update email
- Requires current password (or OTP to confirm). On success update `email`, bump
  `session_version` (invalidate other sessions), re-issue tokens. Reject if email already
  used in `customer_accounts` OR `admin_accounts`.

### Security — update password
- Requires current password verified (bcrypt). New password ≥8 (parity policy). On success
  update `password_hash`, bump `session_version`, re-issue tokens.

---

## 4. Data model
Reuses `customer_accounts`, `orders`, `order_items`, `order_payments`,
`user_addresses`, `customer_payment_methods` (see `02-catalog.spec.md` and
`04-checkout-payments.spec.md` for full shapes).

`user_addresses`: `id, user_id, email?, address_type, is_default, address, address_line1,
landmark, city, emirate, country, postal_code, created_at, updated_at`.

---

## 5. Acceptance checklist (M6)
- [ ] Users can only read/update their own data (IDOR-safe: every query scoped by `req.userId`).
- [ ] Profile updates persist; email change requires verification + bumps session.
- [ ] Orders list/detail match legacy; sensitive card fields never returned.
- [ ] Address CRUD + default handling work.
- [ ] Payment method dedup by fingerprint; masked display only.
- [ ] Billing + transaction history aggregates match legacy.
- [ ] Password change verifies current and invalidates other sessions.
