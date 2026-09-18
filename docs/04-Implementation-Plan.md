# Implementation Plan (Milestone-wise)
## Jood Re-architecture — Next.js Frontend + Express/Prisma/MySQL Backend

**Version:** 1.0
**Date:** 2026-09-02
**How to use:** Execute strictly in order. Each milestone is independently shippable and
testable. The user issues commands milestone-by-milestone ("do milestone N"); the opencode
skill `jood-migrate` (`docs/../.opencode/skills/jood-migrate/SKILL.md`) drives each.

---

## Legend
- **P0** = must be fully working before the next milestone.
- **Parity check** = compare against the legacy app (`server.js`, `routes/**`) for the same
  input/output before marking complete.
- Do **not** modify legacy code (it stays as the behavioral reference).

---

## Repo Groundwork (Before Milestone 1 — "M0")
- Confirm the monorepo layout and folder names: `frontend/`, `backend/`, `docs/`,
  `.opencode/skills/jood-migrate/`.
- Decide Node version (LTS) and pin with `.nvmrc` / `engines`.
- Project board/ticking: create one issue per milestone.

---

## M1 — Foundation, Tooling, DB Schema & Project Scaffold
**Goal:** Reproducible skeleton for both apps + MySQL schema established.

**Backend**
1. Scaffold `backend/` (npm init, TypeScript, `ts-node`/`tsx` dev runner, `prisma`, express).
2. `express` app skeleton with: helmet, cors (frontend origin), `express.json`,
   `express.urlencoded`, cookie-parser, error-handler, response envelope, `/api/health`.
3. Create `backend/prisma/schema.prisma` from the spec (§4.2 of the technical spec).
   - Confirm every column/type against legacy SQL; use `Decimal` for money.
4. `prisma migrate dev --name init` against a local MySQL; record the generated migration.
5. `backend/prisma/seed` — seed: parent categories, categories, sample products/variants,
   media, attributes, one master admin + one customer (test credentials documented in
   `backend/README.md` / `.env.example` comments).
6. `.env.example`, `.gitignore`, `README`.

**Frontend**
7. Scaffold `frontend/` (Next.js App Router + TypeScript + ESLint).
8. Add API client `lib/api.ts` (reads `NEXT_PUBLIC_API_URL`, `credentials: 'include'`,
   unwraps the `{success}` envelope).
9. `.env.example`, ESLint/Prettier config, `README`.

**Parity / Acceptance (M1)**
- `npm run dev` in `backend/` → `/api/health` returns ok; `/admin`-style seed login works
  via seed data.
- `npm run dev` in `frontend/` → a minimal placeholder page can call `/api/health` through
  the client and render the result.
- `npx prisma migrate status` clean; seed idempotent.

---

## M2 — Auth Backend (unified JWT: customer + admin)
**Goal:** Full parity auth APIs with tests.

1. Implement JWT issue/verify + HttpOnly cookie handling (access + refresh).
2. Auth module (`backend/src/modules/auth`):
   - Customer: sign-in, sign-up (OTP), verify-otp, resend-otp, email-verify (+resend),
     forgot-password, reset-password, logout, `me`.
   - Admin: sign-in (password → OTP), verify-otp, resend-otp, forgot/reset password,
     logout, `me`, role access guards.
   - Google OAuth (customer): authorize + callback.
   - Session version: bump on login/logout; reject mismatched `session_version`.
3. Role guards: `requireAuth`, `requireAdmin`, `requireSuperOrMaster`,
   `requireAdminManager`, `requireUserManager`, `isMasterAdmin`.
4. Rate limits for login endpoints (20/10min), OTP (resend) limits.
5. Account lockout: 5 failed → 15-min lock (`lock_until`).
6. `GET /api/auth/me` returns `{ user? | admin?, role? }`.

**Parity check:** each legacy auth route (SRS FR-3.x, FR-7.1–7.5, §3.7) has a
corresponding new endpoint; flows behave identically (OTP expiry, attempt caps, email).

**Tests:** auth service unit + supertest integration.

---

## M3 — Catalog Backend (products, categories, shop/search)
**Goal:** All read APIs for browsing with filters/sort/pagination.

1. Catalog module:
   - Parent category + category + menu.
   - Product + variant + media + attributes reads.
2. Shop listing API: `GET /shop`, `/shop/group/:slug|id`, `/shop/subgroup/:slug|id`,
   `/shop/product/:slug|id`, `/shop/api*`, `/shop/api/filters/*`.
   - Implement filter/sort/pagination inputs (SRS FR-1.10) + grouping by parent category.
3. Product detail API: product, variants, selectedVariant, relatedProducts,
   frequentlyBoughtTogether, customersAlsoViewed, sameModelVariants, compareItems,
   breadcrumbs (FR-1.9).
4. Variant cards, recent, frequently-ordered APIs.
5. Universal search (`/search/universal?q=`).
6. Pricing util (spec §3.5) + stock-label util shared in checkout module.
7. Per-card enrichment (`is_fav`, `in_cart_qty`) — reads wishlist/cart identity.

**Parity check:** compare shop/detail JSON against legacy for the same params.

---

## M4 — Cart & Wishlist (backend)
1. Cart module: view, add (variant auto-select), update qty, remove, API.
2. Identity resolution: logged-in email vs guest token; guest token issuance middleware.
3. Wishlist module: data, toggle, view.
4. Guest→user merge on login/signup (transaction); email-keyed cart + numeric-id wishlist.
5. Row locking (`FOR UPDATE`) + conditional stock validation on add/update.

**Parity check:** cart/wishlist JSON and merge behavior match legacy.

---

## M5 — Order Placement, Checkout & Stripe (backend)
**Goal:** Correct order + stock semantics for COD and Card.

1. Checkout module: `checkout-data`, `saved-payment-methods`, `saved-addresses`.
2. Place COD order (transaction): validate stock, insert orders/order_items/order_payments,
   decrement stock (conditional), mark cart `ordered`.
3. Shipping/billing address collection incl. lat/lng/place_id (JSON).
4. Create Stripe Checkout Session (card) — no stock decrement; store session/intent in
   `order_payments.gateway_response`.
5. Success page data + order tracking JSON.
6. Stripe webhook module: session completed / intent succeeded / failed; idempotent stock
   decrement on `payment_intent.succeeded`.
7. Payment methods: store card fingerprint + encrypted number, dedup.
8. Emit Socket.IO events (`orderCreated`, `orderTrackingUpdated`, `cartUpdated`).

**Parity check:** verify with Stripe test keys that COD vs card stock timing is identical to legacy.


## M6 — Customer Account Backend (profile, orders, addresses, billing, security)
1. Profile get/update.
2. Orders list + order detail (+ order items).
3. Addresses CRUD + default flag.
4. Payment methods list/remove.
5. Billing (spend, invoices). Transaction history.
6. Security: update email (OTP) + update password (verify current).

**Parity check:** all FR-6.x endpoints behave like legacy.

---

## M7 — Admin Backend (management, products/categories CRUD, orders mgmt, analytics)
1. Admin profile, heartbeat/offline; master-admin actions (create/suspend/activate/
   force-logout/overview).
2. Admin management: admins, master-admins, super-admins; customer (users) management
   (list/create/update/block/freeze/delete).
3. Product create/edit/list/search/delete (variants, media, attributes) — port
   `add-product` logic.
4. Parent category + category CRUD (+ images).
5. Orders management: list/data/summary/live-search/export/detail/cancel + status options.
6. Main dashboard: counts, latest orders, transactions, visitors.
7. Billing + transaction-history + product-search + export (incl. PDF via pdfkit).
8. Visitor analytics + charts.
9. Contact / support-request inbox.

**Parity check:** every admin route in FR-7.x is reproduced.

---

## M8 — Frontend UI: Storefront (browse, product, cart, wishlist)
**Goal:** Next.js pages for the customer face, wired to the backend.

1. Layout + shared components (header/footer with category menu, account topbar/sidebar).
2. Homepage, about/legal/support pages, sitemap.
3. Shop listing (filters/sort/pagination/grouping) — SSR + client interactions.
4. Product detail page (variant selector, gallery, gallery/videos, related/FBT).
5. Category navigation + universal search page.
6. Cart page + wishlist page (SSR + client, `is_fav`/`in_cart_qty`).
7. Recent / frequently-ordered / variant-card components.

**Parity check:** visual + behavior equivalents of legacy storefront pages.

---

## M9 — Frontend UI: Auth + Account + Checkout
1. Sign-in/sign-up/verify-otp/forgot/reset pages (client calls auth APIs).
2. Google OAuth redirect handling.
3. Account group: profile, orders, order-detail, addresses, payment methods, billing,
   security (email/password), transaction history — gated by auth middleware.
4. Checkout flow: addresses, COD + card (redirect to Stripe), success + tracking pages.
5. Guest cart/wishlist persistence via guest token cookie; merge on login.

**Parity check:** full customer journey (register → browse → cart → checkout → order).

---

## M10 — Frontend UI: Admin Dashboard
1. Admin layout (Soft-UI-style) + auth guard (admin role).
2. Sign-in/OTP/forgot-password for admins.
3. Dashboard, products (CRUD incl. variants/media), categories, orders (list/detail/
   cancel/export), customers, admins, billing, transaction history, visitors.
4. Contact/support inbox.

**Parity check:** every admin FR-7.x page exists in the new UI.

---

## M11 — Realtime, Middleware Parity & Hardening
1. Socket.IO client/server parity: namespaces + auth + all events (cart, wishlist, order,
   product, categories, recent/frequent, discounts, page_visit, socket_test).
2. Helmet CSP, CSRF, rate limits, input validation final pass.
3. Uploads parity: product/media/category/support with size+MIME checks.
4. Visitor tracking mirrored by backend analytics.

**Acceptance:** security + realtime behavior equals legacy.

---

## M12 — Polish, Testing, Performance & Go-Live Prep
1. Backend: unit + integration tests; run with Jest/supertest.
2. Frontend: lint/typecheck clean; add e2e smoke (Playwright optional).
3. Performance: SSR/ISR revalidation for storefront; API caching headers; image
   optimization (next/image vs backend-hosted uploads).
4. Error handling + logging polish; observability hooks.
5. Secrets hygiene: `.env.example` only, rotate all credentials (do NOT reuse legacy).
6. Deployment manifest + env; run both apps against a staging MySQL + Stripe test keys.
7. Final parity walkthrough of every SRS FR; record known gaps.

**Definition of Done (v1):** All P0 FRs working end-to-end on staging with seed data;
security controls active; acceptance criteria in BRD §8 satisfied.

---


## Cross-Cutting Notes
- **Money:** use `Decimal` (MySQL `DECIMAL`), not float.
- **Idempotent seed** + migrations committed to `backend/prisma/migrations`.
- **Contract first:** define API shapes before building frontend pieces; keep
  `lib/api.ts` aligned with a generated/OpenAPI client if introduced.
- **Session/OTP constants:** use the values from the legacy code (OTP 10-min, 5 attempts,
  15-min lock; admin idle 4-min; strong-password policy) unless a product decision changes them.
- **Namespaces:** Socket.IO `/admin` and `/customer` mirror legacy.
