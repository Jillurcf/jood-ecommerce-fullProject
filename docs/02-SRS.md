# Software Requirements Specification (SRS)
## Jood E-Commerce Re-architecture — Next.js + Express/Prisma/MySQL

**Version:** 1.0
**Date:** 2026-09-02
**Traceability:** Derived from `docs/01-BRD.md`. Route inventory is mapped 1:1 from the
legacy Express + EJS app (see `server.js` route mounting and `routes/**`).

---

## 1. Introduction

### 1.1 Purpose
This document specifies the functional and non-functional requirements for re-architecting
Jood into a **Next.js frontend** + **Express + Prisma + MySQL backend**. It defines what the
new system must do, organized by functional area, with route-level detail for parity.

### 1.2 Scope
A feature-parity rewrite. All legacy customer + admin routes must be reproduced. Data is
**fresh MySQL + seed** (no production data port).

### 1.3 Definitions / Abbreviations
- **API** — REST backend exposed by Express.
- **FE / Frontend** — Next.js application.
- **SSR** — Server-Side Rendering; **ISR** — Incremental Static Regeneration.
- **JWT** — JSON Web Token (auth), delivered in HttpOnly cookie.
- **COD** — Cash on Delivery.
- **Card** — Stripe Checkout payment.
- **JSONB** — PostgreSQL JSON binary type (legacy; mapped to MySQL `JSON`).

### 1.4 References
- `docs/01-BRD.md` — business context.
- `docs/03-Technical-Specification.md` — architecture.
- `docs/04-Implementation-Plan.md` — milestones.
- Legacy codebase: `server.js`, `routes/**`, `controllers/**` (behavioral source of truth).

---

## 2. Overall Description

### 2.1 Product Perspective
Two cooperating applications:

```
[ Next.js Frontend (frontend/) ]  <--HTTPS/JSON-->  [ Express API (backend/) ]
                                                        |
                                                     [ MySQL via Prisma ]
                                                        |
                                                     [ Stripe / SMTP / Socket.IO ]
```

### 2.2 User Classes & Characteristics
- **Guest** — no account; can browse, search, cart, wishlist (guest token).
- **Customer** — registered; adds account/orders/addresses/payment/billing/security.
- **Admin roles** — `master_admin`, `super_admin`, `admin`, `sub_admin`, `viewer` with
  graded permissions.
- **System / Ops** — webhooks, schedulers, analytics.

### 2.3 Operating Environment
- Backend: Node.js (LTS), Express 4, Prisma ORM, MySQL 8+.
- Frontend: Next.js (App Router), React, TypeScript.
- Hosting: any Node-capable platform; stateless API scaling supported.

### 2.4 Design / Implementation Constraints
- JWT + HttpOnly cookie auth (single unified mechanism for admin + customer).
- Prisma schema is the single source of truth for the DB.
- MySQL 8+; JSON columns used where legacy used JSONB.
- Preserve Helmet CSP, CSRF, and rate-limit security baseline.

---

## 3. Functional Requirements

> Notation: **FR-x.y** = functional requirement; priority **P0** (must), **P1** (should).

### 3.1 Catalog & Browsing (storefront)

| ID | Requirement | Legacy route | Priority |
|----|-------------|--------------|----------|
| FR-1.1 | Homepage with discount products + brand info | `GET /customer/` | P0 |
| FR-1.2 | About us, contact, legal (privacy/terms/cookie/T&C/disclaimer) pages | `GET /customer/company/about-us`, `/customer/support-and-help/*`, `/customer/legal-and-compliance/*` | P0 |
| FR-1.3 | Help & support, FAQ, return policy, shipping policy, warranty pages | `GET /customer/support-and-help/*` | P0 |
| FR-1.4 | HTML sitemap page | `GET /customer/sitemap` | P1 |
| FR-1.5 | Shop listing with grouping by parent category | `GET /customer/shop/` | P0 |
| FR-1.6 | Products by parent category (slug + id) | `GET /customer/shop/group/:slug`, `/group/id/:id` | P0 |
| FR-1.7 | Products by subcategory (slug + id) | `GET /customer/shop/subgroup/:slug`, `/subgroup/id/:id` | P0 |
| FR-1.8 | Single product page (slug + id) | `GET /customer/shop/product/:slug`, `/product/id/:id` | P0 |
| FR-1.9 | Product detail page with variant auto-select | `GET /customer/product/product-details/:pid/:vid` (and `:pid` only) | P0 |
| FR-1.10 | Filter, sort, paginate catalog via API | `GET /customer/shop/api`, `/grouped`, group/subgroup/product variants, `/api/filters/*` | P0 |
| FR-1.11 | Category menu (HTML partial / component) | `GET /frontend/category/menu` | P0 |
| FR-1.12 | Universal search across parents, categories, products | `GET /search/universal?q=` | P0 |
| FR-1.13 | Variant cards, recent, frequently-ordered products APIs | `GET /customer/variant-product/api*`, `/recent-product/api`, `/frequent-products/api` | P1 |

**FR-1.10 detail — filtering/sorting/pagination inputs:**
- Pagination: `page`, `limit` (1–1000, default 24 for shop).
- Sort: `latest`, `oldest`, `price_asc`, `price_desc`, `name_asc`, `name_desc`,
  `rating_asc`, `rating_desc` (default `latest` by greatest created/updated).
- Filters: `in_stock_only` (default true), `price_min/max`, `weight_min/max`,
  `search`/`q`, `brand`/`brands`, `model`/`models`, `condition`/`conditions`,
  `rating`/`ratings`, `parent_category_id`/`parent_id`, `category_id`/`subgroup_id`,
  `attributes`/`attribute_filters`, `color`/`colors`, `attr_<name>`, `size`.
- Results grouped by `parent_category_name` as `{ heading, parent_category_id,
  parent_category_slug, items }`.

**FR-1.9 detail — product detail payload** must include: `product`, `variants`,
`selectedVariant`, `relatedProducts`, `frequentlyBoughtTogether`,
`customersAlsoViewed`, `sameModelVariants`, `compareItems`, `breadcrumbs`.
Per-card enrichment: `is_fav` (wishlist) and `in_cart_qty` (cart), non-fatal if unavailable.

### 3.2 Pricing, Variants & Product Data

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-2.1 | Model a **product** master row + **product variants** (SKU, price, stock) | P0 |
| FR-2.2 | Apply pricing: base price, discount (percent/fixed), sale price, VAT rate + `vat_included` flag | P0 |
| FR-2.3 | Final price formula: `afterDiscount - (afterDiscount * vat%)` when not included; preserve legacy logic | P0 |
| FR-2.4 | Stock status display: out-of-stock `/` limited (`<= low_stock_threshold`, default 5) `/` available | P0 |
| FR-2.5 | Variant media (per-variant images), product gallery, videos | P0 |
| FR-2.6 | Attributes & attribute values linked to variants (color, size, etc.) for filtering | P0 |
| FR-2.7 | Implicit discount when `sale_price` present but no explicit discount: `(price-sale)/price*100` | P1 |
| FR-2.8 | Frequently-bought-together + cross-sell relationships (fallback to same category/brand) | P1 |

### 3.3 Customer Account & Auth

| ID | Requirement | Legacy route | Priority |
|----|-------------|--------------|----------|
| FR-3.1 | Register with OTP verification (name/email/phone/password) | `POST /customer/sign/up`, `/verify-otp`, `/resend-otp` | P0 |
| FR-3.2 | Sign in (email+password) with lockout after 5 failed attempts (15-min) | `POST /customer/sign/in` | P0 |
| FR-3.3 | Google OAuth sign-in/up (new + existing) | `GET/POST /customer/auth/google*` | P0 |
| FR-3.4 | Forgot / reset password (token via email, 30-min expiry) | `POST /customer/forgot-password`, `/reset-password*` | P0 |
| FR-3.5 | Email verification (token, 24-h expiry) + resend | `GET/POST /customer/verify-email`, `/resend-verification` | P0 |
| FR-3.6 | Logout; invalidate session (bump `session_version`) | `GET /customer/logout` | P0 |
| FR-3.7 | Current-user / login-status JSON endpoints | `GET /customer/current`, `/check` | P0 |
| FR-3.8 | Identity for carts/wishlist: logged-in email or guest token; merge guest data on login/signup | (controller logic) | P0 |

**FR-3.x auth model (new):** single **JWT in HttpOnly cookie** for both admin and customer.
- Access token short-lived; optional refresh token (30-day, remember-me 30-day cookie).
- `session_version` concept retained: bumping version invalidates existing sessions.
- Login state exposed to the frontend via `GET /api/auth/me`.

### 3.4 Cart & Wishlist

| ID | Requirement | Legacy route | Priority |
|----|-------------|--------------|----------|
| FR-4.1 | View cart page | `GET /customer/cart/` | P0 |
| FR-4.2 | Add to cart (auto-select variant when unambiguous) | `POST /customer/cart/add` | P0 |
| FR-4.3 | Read cart JSON | `GET /customer/cart/api` | P0 |
| FR-4.4 | Update quantity (delete if < 1) | `POST /customer/cart/update` | P0 |
| FR-4.5 | Remove item | `POST /customer/cart/remove` | P0 |
| FR-4.6 | Wishlist view / data / toggle | `GET /wishlist/`, `/wishlist/data`, `POST /wishlist/toggle` | P0 |

**Cart identity rules:** cart `user_id` = customer **email** for logged-in; guest uses a
**guest token**. Wishlist `user_id` = numeric customer id (or `guest_id` = token).
All guest rows merged to the account on login/signup in a transaction. Row-locking
(`SELECT ... FOR UPDATE`) on variants during add/update to enforce stock.

### 3.5 Checkout & Payments

| ID | Requirement | Legacy route | Priority |
|----|-------------|--------------|----------|
| FR-5.1 | Checkout page (auth required) | `GET /customer/checkout/` | P0 |
| FR-5.2 | Checkout data / summary JSON (aliases) | `GET /customer/checkout/data`, `/summary`, `/model` | P0 |
| FR-5.3 | Place **COD** order (stock decremented at placement) | `POST /customer/checkout/` | P0 |
| FR-5.4 | Create **Stripe Checkout Session** (card; stock NOT decremented yet) | `POST /customer/checkout/create-payment-session` | P0 |
| FR-5.5 | Order success page + tracking JSON | `GET /customer/checkout/success/:order`, `/track/:order` | P0 |
| FR-5.6 | Load saved payment methods & addresses for autofill | `GET /customer/checkout/saved-payment-methods`, `/saved-addresses` | P1 |
| FR-5.7 | Handle Stripe webhook (session completed / intent succeeded / failed) | `POST /webhooks/stripe` | P0 |

**Stock semantics:**
- COD: decrement `product_variants.stock` inside the order transaction.
- Card: decrement **only** when `payment_intent.succeeded` webhook fires (idempotent).

**Order state machine (statuses):** `pending, initiated, pending_payment, processing,
ongoing, confirmed, completed, cancelled, refunded, partially_refunded`; payment status:
`pending, initiated, paid, failed`.

**Order fields:** `order_number` (ORD-…), `tracking_id`, `payment_reference` (PAY-…),
`currency` (AED), subtotal/discount/vat/grand totals, billing + shipping address (JSON,
incl. lat/lng/place_id), `gateway_provider`.

**Payment method persistence:** card fingerprint + AES-256-GCM encrypted number (if
`CARD_ENCRYPTION_KEY` set), dedup by fingerprint.

### 3.6 Customer Account Area

| ID | Requirement | Legacy route | Priority |
|----|-------------|--------------|----------|
| FR-6.1 | View/edit profile | (u/profile) | P0 |
| FR-6.2 | Orders list + order detail | (u/orders, u/order-details) | P0 |
| FR-6.3 | Addresses list/add/update/remove + default flag | (u/addresses) | P0 |
| FR-6.4 | Payment methods list/remove (card dedup) | (u/account/payment-methods) | P1 |
| FR-6.5 | Billing view (spend, invoices) | (u/account/billing) | P1 |
| FR-6.6 | Security: update email & password | (u/security/updateEmail, updatePassword) | P0 |
| FR-6.7 | Transaction history | (u/account/transaction-history) | P1 |

### 3.7 Admin Dashboard

| ID | Requirement | Legacy route base/mount | Priority |
|----|-------------|------------------------|----------|
| FR-7.1 | Admin sign-in (email+password → OTP → session), resend OTP | `/admin/a/sign/in`, `/login/verify-otp`, `/login/resend-otp` | P0 |
| FR-7.2 | Admin forgot-password (OTP + link) | `/admin/a/password` | P0 |
| FR-7.3 | Admin logout | `/admin/a/logout` | P0 |
| FR-7.4 | Master-admin: create/suspend/activate/force-logout admins; overview; current | `/admin/a/create`, `/suspend`, `/activate`, `/force-logout`, `/overview`, `/current` | P0 |
| FR-7.5 | Role-based access guards (super/master, admin-manager, user-manager) | (middleware) | P0 |
| FR-7.6 | Admin profile: view/update, heartbeat/offline | `/admin/a/profile/myprofile` | P0 |
| FR-7.7 | Create admin (super/master only, OTP-approved) | `/admin/a/profile/add-admin` | P0 |
| FR-7.8 | Customers (users) management: list/create/update/block/freeze/delete | `/admin/a/profile/users` | P0 |
| FR-7.9 | Admins / master-admins / super-admins management | `/admin/a/profile/{admins,master-admins,super-admins}` | P0 |
| FR-7.10 | Parent category CRUD (+image) | `/admin` → parent-category.routes | P0 |
| FR-7.11 | Category CRUD (+image, +remove-image) | `/admin` → category.routes | P0 |
| FR-7.12 | Product create/edit/list/search/delete (variants, media, attributes) | `/admin` → add-product.routes | P0 |
| FR-7.13 | Update admin email / password | `/admin/a/setting/updateEmail`, `/updatePassword` | P0 |
| FR-7.14 | Orders: list/data/summary/live-search/export/detail/cancel + status options | `/admin/a/orders` | P0 |
| FR-7.15 | Main dashboard (counts + latest orders + transactions + visitors) | `/admin/a/account/dashboard` | P0 |
| FR-7.16 | Billing: overview/chart/data/summary/detail + PDF export | `/admin/a/account/billing` | P1 |
| FR-7.17 | Transaction history + item detail + product search + export | `/admin/a/account/transaction-history` | P1 |
| FR-7.18 | Visitor analytics + chart | `/admin/a` (visitor.routes) | P1 |
| FR-7.19 | Contact / support-request inbox (from storefront forms) | (admin) | P1 |

**Admin OTP rules:** 6-digit OTP, 10-min expiry, max 5 attempts, 15-min lockout.
Strong-password policy: ≥8 chars, upper+lower+number+special (for reset).

### 3.8 Forms, Contact & Support

| ID | Requirement | Route | Priority |
|----|-------------|-------|----------|
| FR-8.1 | Contact form (name/email/subject/message) with validation, rate limit 5/15min, email to admins + confirm to user, persist `contact` | `POST /customer/support-and-help/contact-submit` | P0 |
| FR-8.2 | Help/support request (adds phone, orderNumber, category, preferredContact, optional file attachment) persist `support_requests`, rate limit 6/min | `POST /customer/support/submit` | P0 |

**Validation rules (port from legacy):**
- name: letters only, 2–150 chars; email valid; subject text 3–200; message 5–5000;
  reject HTML tags and URLs.
- Attachments: single file, stored to disk; deleted on validation/DB failure.

---

## 4. Non-Functional Requirements

| ID | Category | Requirement |
|----|----------|-------------|
| NFR-1 | Performance | Storefront pages render via SSR/ISR; API responses cached (`Cache-Control: public, max-age=60, s-maxage=60, stale-while-revalidate=30`); dynamic filter queries `no-store` |
| NFR-2 | Security | Helmet with strict CSP; CSRF on all mutation routes except `/api`/`/webhooks`; rate limiting (shop 60/min, variant/recent/frequent/search/category 30/min); HttpOnly+SameSite cookies; bcrypt(12) passwords; AES-256-GCM card encryption; input validation on every input |
| NFR-3 | Reliability | Order placement is a DB transaction; stock updates use conditional decrement (`WHERE stock >= qty`); Stripe webhook idempotent (guard by event id / order payment state) |
| NFR-4 | Maintainability | Prisma schema = single source of truth; migrations versioned in repo; clear `frontend/`/`backend/` separation |
| NFR-5 | Availability | Stateless backend (JWT) deployable horizontally; no in-memory data required for order correctness |
| NFR-6 | Usability | Parity in UX with legacy storefront + admin |
| NFR-7 | Compatibility | MySQL 8+; Node LTS; modern browsers |

### 4.1 Rate-Limit Matrix
| Scope | Limit |
|-------|-------|
| Shop APIs | 60 req/min |
| Variant / Recent / Frequent APIs | 30 req/min |
| Search | 30 req/min |
| Category menu | 30 req/min |
| Contact form | 5 req / 15 min |
| Help request | 6 req / min |
| Login (admin + customer) | 20 req / 10 min |

---

## 5. Security Requirements

1. **Auth:** JWT in HttpOnly cookie; `sameSite=lax`; access+refresh token pair (refresh in
   HttpOnly cookie, 30-day max, 30-day remember-me).
2. **Session versioning:** per-account `session_version` bumped on login; mismatch forces
   re-login (parity with legacy logout-everywhere).
3. **CSRF:** csurf (or equivalent) on all mutation routes except `/api*` and `/webhooks*`.
4. **Password storage:** bcrypt (12 rounds) — never plaintext.
5. **Secrets:** keep out of code; `.env` committed in legacy repo is for the legacy app
   only — new `backend/.env.example` and `frontend/.env.example` with placeholders.
6. **Uploads:** validate MIME + extension; size limits (admin images 2MB; product media
   60MB × 150 files; support attachment size limit); serve under whitelisted static path.
7. **Rate limiting:** per matrix in §4.1.
8. **Visitor tracker:** keep geolocation + dedupe behavior; personal data minimization.

---

## 6. External Interface Requirements

| Interface | Detail |
|-----------|--------|
| Stripe | Server-side SDK; Checkout Sessions; webhook at `/webhooks/stripe` (raw body, signature `constructEvent`) |
| SMTP (nodemailer) | OTP, verification, reset, contact/support notifications from `backend/` |
| Google OAuth | authorize + callback (Passport or manual OAuth2) |
| Google Translate | optional i18n helper (legacy `utils/translate.js`) |
| Socket.IO | global + `/admin` + `/customer` namespaces (session/JWT guard); events: `cartUpdated`, `wishlistUpdated`, `orderCreated`, `orderTrackingUpdated`, `product:*`, `categoryAddedOrUpdated`, `recentProducts*`, `frequentProducts*`, `discountProductsUpdated`, `page_visit`, `socket_test` |

---

## 7. Data Requirements (Summary)

Full Prisma schema lives in `docs/03-Technical-Specification.md`. Core entities:
`CustomerAccount, AdminAccount, Product, ProductVariant, VariantMedia,
Attribute, AttributeValue, ProductVariantAttribute, ParentCategory, Category,
Cart, Wishlist, Order, OrderItem, OrderPayment, CustomerPaymentMethod,
UserAddress, Contact, SupportRequest, Visitor, PageVisit, ProductCrossSell,
ProductFrequentlyBoughtTogether`.

**Legacy JSONB → MySQL mapping:** use MySQL `JSON` type for `gateway_response`,
`billing_address`, `shipping_address`, `product_videos`, `display_locations`,
`display_timing`, `meta`.

---

## 8. Validation & Acceptance

- Each milestone has a parity checklist (see `docs/04-Implementation-Plan.md`).
- Acceptance: run backend + frontend locally with seed data; walk all FR-x.y items above.
- Payment test with Stripe **test keys**: verify COD vs card stock timing, webhook failure
  handling, success page.

---

## 9. Traceability Matrix (High-Level)

| BRD Objective | SRS Functional Area |
|---------------|---------------------|
| B1–B4 (modernize/decode/perf/velocity) | §3 + Architectural design |
| B5 (feature parity) | §3 all FRs |
| B6 (unify auth) | §3.3, §5 |
| B7 (scalability) | §4 NFR-5 |

---

*Next:* `docs/03-Technical-Specification.md`.
