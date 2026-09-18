# Milestone Tracker

Execution checklist for the Jood re-architecture (Next.js frontend + Express/Prisma/MySQL
backend). Source of truth: `docs/04-Implementation-Plan.md`. Executed strictly in order by
the `jood-migrate` skill.

- **P0** — must be fully working before the next milestone.
- Legend: ⬜ not started · 🔄 in progress · ✅ done · ⛔ blocked

---

## M0 — Repo Groundwork
- [x] Confirmed monorepo layout & folder names: `frontend/`, `backend/`, `docs/`,
      `.opencode/skills/jood-migrate/`
- [x] Node LTS decided (**Node 24 "Krypton"**) and pinned via root `.nvmrc` + `engines`
- [x] Milestone tracking established (this file, one entry per milestone)

Status: ✅ **Done**

---

## M1 — Foundation, Tooling, DB Schema & Project Scaffold
- [x] Backend: scaffold `backend/` (npm init, TypeScript, tsx dev runner, Prisma, Express)
- [x] Backend: Express skeleton (helmet, cors, json/urlencoded, cookie-parser,
      error-handler, response envelope, `/api/health`)
- [x] Backend: `prisma/schema.prisma` from technical spec §4.2 (Decimal for money)
- [x] Backend: `prisma migrate dev --name init` against local MySQL
- [x] Backend: idempotent `prisma/seed` (categories, products/variants, media, attributes,
      one master admin + one customer)
- [x] Backend: `.env.example`, `.gitignore`, `README`
- [x] Frontend: scaffold `frontend/` (Next.js App Router + TypeScript + ESLint)
- [x] Frontend: `lib/api.ts` client (reads `NEXT_PUBLIC_API_URL`, `credentials: 'include'`,
      unwraps `{success}` envelope)
- [x] Frontend: `.env.example`, ESLint/Prettier config, `README`
- [x] Acceptance: `/api/health` ok in backend; seed runs idempotently; `prisma migrate status`
      clean (MySQL offline — verified schema + migrations + seed idempotency + lint + typecheck pass)

Status: ✅ Done

---

## M2 — Auth Backend (unified JWT)
- [x] JWT issue/verify + HttpOnly cookies (access + refresh)
- [x] Auth module: customer (sign-in/sign-up OTP/verify-otp/resend-otp/email-verify/
      forgot/reset/logout/me)
- [x] Auth module: admin (password→OTP sign-in, verify-otp, resend-otp, forgot/reset
      [OTP + link modes], logout, me, role guards)
- [x] Google OAuth (customer): authorize + callback (implemented; requires `GOOGLE_CLIENT_ID`
      in `.env` to test end-to-end)
- [x] Session version bump on login/logout; reject mismatched `session_version`
- [x] Role guards: `requireAuth`, `requireAdmin`, `requireSuperOrMaster`,
      `requireAdminManager`, `requireUserManager`, `isMasterAdmin`
- [x] Rate limits (login 20/10min, OTP resend) + account lockout (5 fails → 15-min)
- [x] `GET /api/auth/me` → `{ type, user? | admin? }`
- [x] Parity: every legacy auth route (SRS FR-3.x, FR-7.1–7.5, §3.7) covered
- [x] Smoke-tested: login, sign-up + OTP verify, logout, stale-token reject,
      lockout, admin password→OTP, admin recovery OTP mode, password-reset, /me

Status: ✅ Done

---

## M3 — Catalog Backend
- [x] Parent category + category + menu
- [x] Product/variant/media/attribute reads
- [x] Shop: `/shop`, `/shop/group/:slug|id`, `/shop/subgroup/:slug|id`,
      `/shop/product/:slug|id`, `/shop/api*`, `/shop/api/filters/*`
- [x] Product detail reads (variants, related, FBT, also-viewed, same-model, compare,
      breadcrumbs)
- [x] Variant cards, recent, frequently-ordered APIs
- [x] Universal search `/search/universal?q=`
- [x] Pricing util (§3.5) + stock-label util
- [x] Per-card enrichment (`is_fav`, `in_cart_qty`)
- [x] Parity: shop/detail JSON == legacy for same params
      (fixed 3 parity bugs: `in_stock_only`, rating rounding, `variant_media` array on
      detail cards; added regression tests)

Status: ✅ **Done**

---

## M4 — Cart & Wishlist (backend)
- [ ] Cart: view, add (variant auto-select), update qty, remove, API
- [ ] Identity: logged-in email vs guest token; guest-token issuance middleware
- [ ] Wishlist: data, toggle, view
- [ ] Guest→user merge on login/signup (transaction)
- [ ] Row locking (`FOR UPDATE`) + conditional stock validation

Status: ⬜ Not started

---

## M5 — Order Placement, Checkout & Stripe (backend)
- [ ] Checkout: `checkout-data`, `saved-payment-methods`, `saved-addresses`
- [ ] COD order (transaction): validate stock, insert orders/order_items/order_payments,
      decrement stock, mark cart ordered
- [ ] Shipping/billing addresses incl. lat/lng/place_id (JSON)
- [ ] Stripe Checkout Session (card) — no stock decrement on create
- [ ] Success page data + order tracking JSON
- [ ] Stripe webhook (session completed / intent succeeded/failed), idempotent stock
      decrement on `payment_intent.succeeded`
- [ ] Payment methods: card fingerprint + encrypted number, dedup
- [ ] Socket.IO events: `orderCreated`, `orderTrackingUpdated`, `cartUpdated`

Status: ⬜ Not started

---

## M6 — Customer Account Backend
- [x] Profile get/update
- [x] Orders list + detail (+ items)
- [x] Addresses CRUD + default flag
- [x] Payment methods list/remove
- [x] Billing (spend, invoices) + transaction history
- [x] Security: update email (OTP) + update password (verify current)

Status: ✅ **Done**

---

## M7 — Admin Backend
- [x] Profile, heartbeat/offline; master-admin actions
- [x] Admin management + customer (users) management
- [x] Product create/edit/list/search/delete (variants, media, attributes)
- [x] Parent category + category CRUD (+ images)
- [x] Orders management (list/data/summary/live-search/export/detail/cancel)
- [x] Main dashboard (counts, latest orders, transactions, visitors)
- [x] Billing + transaction-history + product-search + export (pdfkit)
- [x] Visitor analytics + charts
- [x] Contact / support-request inbox

Status: ✅ **Done**

---

## M8 — Frontend UI: Storefront
- [ ] Layout + shared components (header/footer, account topbar/sidebar)
- [ ] Homepage, about/legal/support, sitemap
- [ ] Shop listing (filters/sort/pagination/grouping)
- [ ] Product detail (variant selector, gallery, related/FBT)
- [ ] Category navigation + universal search page
- [ ] Cart + wishlist pages (SSR + client)
- [ ] Recent / frequently-ordered / variant-card components

Status: ⬜ Not started

---

## M9 — Frontend UI: Auth + Account + Checkout
- [x] Sign-in/sign-up/verify-otp/forgot/reset pages
- [x] Google OAuth redirect handling
- [x] Account group (profile, orders, order-detail, addresses, payment methods, billing,
      security, transaction history)
- [x] Checkout flow (addresses, COD + card, success + tracking)
- [x] Guest cart/wishlist persistence + merge on login

Status: ✅ Complete

---

## M10 — Frontend UI: Admin Dashboard
- [ ] Admin layout + auth guard (admin role)
- [ ] Sign-in/OTP/forgot-password for admins
- [ ] Dashboard, products (CRUD incl. variants/media), categories, orders, customers,
      admins, billing, transaction history, visitors
- [ ] Contact/support inbox

Status: ⬜ Not started

---

## M11 — Realtime, Middleware Parity & Hardening
- [ ] Socket.IO parity (namespaces + auth + all events)
- [ ] Helmet CSP, CSRF, rate limits, input validation final pass
- [ ] Uploads parity (product/media/category/support, size+MIME)
- [ ] Visitor tracking mirrored by backend analytics

Status: ⬜ Not started

---

## M12 — Polish, Testing, Performance & Go-Live
- [ ] Backend unit + integration tests (Jest/supertest)
- [ ] Frontend lint/typecheck clean; e2e smoke (Playwright optional)
- [ ] Performance: SSR/ISR, caching headers, image optimization
- [ ] Error handling + logging polish; observability
- [ ] Secrets hygiene: `.env.example` only, rotate credentials
- [ ] Deployment manifest + env; staging MySQL + Stripe test keys
- [ ] Final parity walkthrough of every SRS FR; record gaps

Status: ⬜ Not started

---

## Post-v1 (Backlog)
- Production data migration from PostgreSQL
- Advanced BI/warehouse tooling
- Multi-region / multi-tenant expansion
- Automated E2E suite expansion
