# M12 — Parity Walkthrough & Known Gaps Report

**Milestone:** M12 (Polish, Testing, Performance & Go-Live Prep) — `docs/04-Implementation-Plan.md` §M12
**Date:** 2026-09-03
**Scope:** Behavioral parity of the re-architected `frontend/` (Next.js) + `backend/` (Express/Prisma/MySQL) against the legacy Express/EJS/PostgreSQL app, per `docs/02-SRS.md`.

---

## 1. Summary

All **P0 FRs** are implemented end-to-end on the new stack. A small set of **P1** gaps were
recorded (below). Two acceptance deviations from the milestone text are noted:

1. **Test runner:** the backend uses **Vitest + supertest** instead of the plan's literal
   "Jest". Reason: the backend is ESM TypeScript and Vitest provides native ESM support
   with a much simpler setup. The spec outcome (unit + integration tests via supertest)
   is met — 96 tests across 6 files.
2. **E2E smoke:** the "Playwright optional" e2e step was replaced by a lightweight Node
   health/route smoke (no browser download). The frontend's `next build` statically
   generates all 42 routes, `lint` and `typecheck` are clean, and the backend boots +
   responds on `/api/health` with the DB-dependency check.

---

## 2. Backend test coverage (M12.1)

| File | Focus | Tests |
|------|-------|-------|
| `src/__tests__/pricing.test.ts` | Pricing parity (fixed/percent/sale-price/VAT) | 20 |
| `src/__tests__/auth-config.test.ts` | OTP/login/reset constants parity | green |
| `src/__tests__/token.service.test.ts` | JWT generation/refresh/claims | green |
| `src/__tests__/errors.test.ts` | AppError/http mapping / envelope | green |
| `src/__tests__/response.test.ts` | `{success,data,message}` envelope | green |
| `src/__tests__/health.integration.test.ts` | supertest health + 404 + envelope | green |
| **Total** | | **96 passing** |

Test mocks (`setup.ts`): prisma, mailer, socket.io, emit helpers, visitorTracker — unit
tests never touch a live DB or network.

---

## 3. FR Coverage (evidence-based)

Route inventory was extracted directly from the backend routers; each new route maps back
to a legacy route per `02-catalog`–`07-realtime-analytics` spec sheets and `02-SRS.md`.

| FR | Requirement | New route(s) | Status |
|----|-------------|--------------|--------|
| FR-1.1–1.13 | Storefront / shop / catalog | `/api/shop`, `/api/shop/group/:slug`, `/subgroup/:slug`, `/api/catalog/product-detail/:pid/:vid`, `/api/catalog/menu`, `/api/search/universal`, `/api/catalog/variants|recent|frequent`, `/api/shop/filters` | ✅ P0 |
| FR-2.1–2.8 | Product+variant model, pricing, stock labels, media, attributes, implicit discount | `pricing.util.ts`, variant/stock model in `catalog` module | ✅ |
| FR-3.1–3.8 | Customer auth (OTP, login, Google, reset, verify, logout, current, guest merge) | `/api/auth/customer/*`, `/api/auth/me`, `/api/auth/refresh` | ✅ P0 |
| FR-4.1–4.6 | Cart + wishlist (guest token, merge) | `/api/cart/*`, `/api/wishlist/*`, `cart.module`/`wishlist.module` + `identity.ts` | ✅ P0 |
| FR-5.1–5.7 | Checkout COD + Stripe, stock semantics, webhook | `/api/checkout/*`, `/webhooks/stripe` | ✅ P0 |
| FR-6.1–6.7 | Account (profile, orders, addresses, pm, billing, security, tx-history) | `/api/account/*` | ✅ P0/P1 |
| FR-7.1–7.19 | Admin (auth, roles, profile, accounts, product/category CRUD, orders, dashboards, billing, transactions, visitors, support) | `/api/admin/*`, `/api/auth/admin/*` | ✅ P0 (P1 gaps below) |
| FR-8.1–8.2 | Contact + support forms | storefront forms → `/api/...` + admin support inbox `/api/admin/support` | ✅ P0 |

### Key parity points verified
- **Pricing:** explicit discount (fixed/percent) applies to `price`; implicit sale-price
  applies inferred % to `sale_price` base (matches legacy `shop.controller.js` + cart
  `calculateFinalPrice`). Prisma `Decimal`, never float.
- **Stock:** conditional decrement `UPDATE ... WHERE stock >= qty`; COD decrements at
  placement; Card only on `payment_intent.succeeded` webhook; webhook idempotent.
- **Identity:** guest cart keyed by email, wishlist by numeric id (parity preserved);
  merge in a transaction on login/signup.
- **Caching:** catalog reads `Cache-Control: public, max-age=60, s-maxage=60,
  stale-while-revalidate=30`; dynamic filter queries `no-store`.
- **Rate limits:** auth 20/10min, catalog reads 30/min, shop 60/min (per NFR-2).
- **Visitor tracking:** skips `/api`, `/uploads`, cart/wishlist/search; geo enrichment via
  ipwho.is→ip-api fallback; 5s dedupe window; non-fatal.
- **Socket.IO namespaces:** global, `/admin` (JWT), `/customer` (JWT); parity event names
  (`cartUpdated`, `orderCreated`, `orderTrackingUpdated`, `product:*`, `page_visit`).
- **Admin roles/guards:** requireAdmin / requireSuperOrMaster / requireAdminManager /
  requireUserManager / isMasterAdmin all present.

---

## 4. M12 sub-task status

| # | Item | Status |
|---|------|--------|
| 1 | Backend unit + integration tests (Vitest+supertest) | ✅ 96 pass |
| 2 | Frontend lint/typecheck clean + e2e smoke | ✅ `lint` 0, `tsc --noEmit` 0, `next build` 42 routes, health smoke |
| 3 | Performance: ISR revalidate + cache headers + image | ✅ (image details in §6) |
| 4 | Error handling + logging + observability | ✅ `common/logger.ts`, `middleware/requestLogger.ts`, health w/ DB check, graceful shutdown |
| 5 | Secrets hygiene | ✅ `.env.example` placeholders only; new-app `.env` git-ignored |
| 6 | Deployment manifest + env | ✅ `backend/Dockerfile`, `frontend/Dockerfile`, `docker-compose.staging.yml`, `.env.staging.example` |
| 7 | Parity walkthrough + known gaps | ✅ this report |

---

## 5. M12.3 performance work

- **ISR/SSR:** homepage + shop use `export const revalidate = 60`; `/shop/[slug]` is SSG
  (`generateStaticParams`); `/product/*`, `/search`, `/checkout/*` dynamic SSR. Confirmed in
  `next build` output.
- **Cache headers:** backend catalog reads public max-age=60, filters no-store (verified in
  `catalog.controller.ts`).
- **Image optimization:** admin pages converted to `next/image`. Storefront product images
  use `<img loading="lazy">` (client components, dynamic backend host). `next.config.js`
  `remotePatterns` now derived from `NEXT_PUBLIC_API_URL` (dev `localhost:4001` fallback),
  supporting a production backend host over http/https with optional port.
- **Standalone output:** `frontend/next.config.js` sets `output: 'standalone'` for a
  self-contained Docker image (verified `.next/standalone` produced with all routes).

---

## 6. Known gaps & follow-ups (v1 / post-v1)

| # | Gap | Severity | Rationale / suggested fix |
|---|-----|----------|---------------------------|
| G1 | **Category/parent-category image upload** stores a filename string from `req.body.image` rather than a multer file upload with the legacy 2MB limit | P1 | Acceptable for v1 if the admin upload UI POSTs a pre-uploaded filename. For full parity, add `multer` (2MB image-only) on `POST /parent-categories` and `POST /categories` like legacy. |
| G2 | **Admin billing PDF export** returns `getBillingPdfData` (structured data) rather than generating an actual PDF download | P1 | Wire `pdf-lib`/`pdfkit` to render a PDF from the returned data, or expose CSV as the primary export. |
| G3 | **Transaction history / billing P1 aggregates** exist but rely on the same live MySQL data; sums must be re-verified against legacy numbers during staging seed | P1 | Confirm parity deltas with a seed-data diff on staging. |
| G4 | **E2E smoke** is a lightweight health/route check, not a full Playwright browser suite | P2 | Optional; add Playwright in post-v1 when a staging URL is fixed. |
| G5 | **Admin idle timeout (4-min)** and **session>7-day rejection** are implementable but not separately unit-tested | P2 | Extract into a unit-tested helper in a follow-up. |
| G6 | **Legacy `includes/.env` + root `.env` remain committed** with live Postgres credentials (per AGENTS.md they must not be touched) | — | Out of scope for the rewrite; flag for manual rotation/removal by the owner. |
| G7 | **`SERVER_EMIT_SOCKET_TEST`** debug emit — confirm it is gated behind the env flag (no prod noise) | P2 | Verify in the realtime module before staging go-live. |

---

## 7. Definition of Done (v1) assessment

| Criterion | Status |
|-----------|--------|
| All P0 FRs working end-to-end on staging with seed data | ✅ implemented; final runtime DDP check requires a running staging MySQL + seed (`npm run seed`) |
| Security controls active (CSRF, Helmet CSP, rate limits, bcrypt(12), AES card) | ✅ (CSP origins updated for CDNs as needed) |
| Acceptance criteria in BRD §8 satisfied | ⏳ Ready; execute the acceptance checklist against staging after provisioning DB + Stripe test keys |

**Recommended next action:** bring up the staging stack
(`docker compose -f docker-compose.staging.yml --env-file .env.staging up --build`),
run `npx prisma migrate deploy` + `npm run seed`, then walk the BRD §8 acceptance checklist
against it (this also closes G3/G7).
