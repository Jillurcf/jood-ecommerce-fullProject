# 03 — Cart & Wishlist Spec
## Shopping Cart + Wishlist (Guest Identity + Merge on Login)

**Milestone:** M4 · **SRS:** FR-4.x · **Legacy ref:** `controllers/cart.controller.js`,
`controllers/u/wishlist.controller.js`, `middleware/guestToken.middleware.js`

---

## 1. Identity model (parity — CRITICAL)

| Entity | Logged-in key | Guest key |
|--------|---------------|-----------|
| **Cart** | `cart.user_id` = customer **email** (lowercased) | `cart.guest_token` = UUID |
| **Wishlist** | `wishlist.user_id` = **numeric** customer id | `wishlist.guest_id` = UUID |

> Cart and wishlist use **different** user keys on purpose. Preserve this — do not
> normalize them into one. Guest rows merge to the account on login/signup.

### Guest token middleware (global)
- Source priority: `x-guest-token` header > `body.guest_token` > `query.guest_token` >
  `cookie.guest_token` > session token.
- If absent, generate `crypto.randomUUID()`, set `x-guest-token` response header, attach
  `req.guestToken`, persist.
- New backend: expose token in an HttpOnly cookie for the frontend to send back.

---

## 2. Cart routes (new → legacy)

| Method | New path | Legacy | Auth |
|--------|----------|--------|------|
| GET | `/api/cart` | `GET /customer/cart/` + `/api` | public (guest or customer) |
| POST | `/api/cart/add` | `POST /customer/cart/add` | public |
| POST | `/api/cart/update` | `POST /customer/cart/update` | public |
| POST | `/api/cart/remove` | `POST /customer/cart/remove` | public |

### Add/update business rules
- Always resolves to a **`product_variants` row**:
  - 0 variants for product → `PRODUCT_NOT_FOUND`.
  - 1 variant → auto-select it.
  - >1 variants + `AUTO_SELECT_VARIANT=true` → `is_default` variant, else lowest price.
  - >1 variants + `AUTO_SELECT_VARIANT=false` → return available variants, ask frontend.
- Locking: transaction + `SELECT ... FOR UPDATE` on the variant row.
- Same `tracking_id + variant_id` already in cart → increment quantity (additive); else insert.
- Validate `quantity <= stock`; stock is the binding constraint.
- One `tracking_id` groups a cart owner's items.

### Read rules
- Join `cart → product_variants → products → variant_media`.
- Recalculate price from variant's `price/discount_type/discount_value/vat_rate` (pricing
  util in `02-catalog.spec.md` §2).

### Remove
- By `variant_id` only.

### Events
- Emit `cartUpdated` over Socket.IO after add/update/remove.

---

## 3. Wishlist routes (new → legacy)

| Method | New path | Legacy | Auth |
|--------|----------|--------|------|
| GET | `/api/wishlist` | `GET /wishlist/` + `/wishlist/data` | customer or guest |
| POST | `/api/wishlist/toggle` | `POST /wishlist/toggle` | customer or guest |

### Toggle
- Input: `variant_id`.
- If row exists for (variant_id + identity) → delete (action `removed`); else insert
  (action `added`). Use `FOR UPDATE` to prevent races.
- Emit `wishlistUpdated`.

### Read
- Join `wishlist → product_variants → products → variant_media`; return variant IDs +
  full items.

---

## 4. Guest → user merge (parity)

Run **within a single transaction** on login (and after OTP-verified signup):

1. Cart: `UPDATE cart SET user_id = :email WHERE user_id = '' AND guest_token = :token AND status='active'`.
2. Wishlist: `UPDATE wishlist SET user_id = :numericId WHERE guest_id = :token`.
3. Normalize any cart rows keyed by other/old identifiers to the canonical email
   (re-consolidation).
4. Handle conflicts: prefer most recent / desired identity deterministically (document
   the chosen rule; match legacy where observed).

---

## 5. Data model
`cart`: `id, tracking_id, user_id (email), guest_token, product_id, variant_id, quantity,
price, status ('active'|'ordered'), order_id, ordered_at, created_at, updated_at`.

`wishlist`: `id, variant_id, user_id (numeric), guest_id (token), updated_at`.
UNIQUE `(variant_id, user_id)` (nullable handling for guests — index accordingly).

---

## 6. Acceptance checklist (M4)
- [ ] Add auto-selects the single/default/lowest variant as legacy.
- [ ] Quantity additive per `tracking_id + variant_id`; capped by stock.
- [ ] Update with quantity < 1 removes the row.
- [ ] Remove by variant_id works.
- [ ] Guest cart/wishlist survives across requests via token.
- [ ] Login/signup merges guest cart (email key) + wishlist (numeric key) in a transaction.
- [ ] `SELECT ... FOR UPDATE` prevents oversell on concurrent adds.
- [ ] `cartUpdated` / `wishlistUpdated` Socket.IO events fire.
