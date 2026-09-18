# Business Requirements Document (BRD)
## Jood E-Commerce Re-architecture — Next.js Frontend + Express/Prisma/MySQL Backend

**Version:** 1.0
**Status:** Draft for approval
**Date:** 2026-09-02
**Owner:** Jood Platform Team

---

## 1. Executive Summary

Jood (`isagoodlife`) is a fully-functional monolith e-commerce application built with
Express 4 + EJS and PostgreSQL. The business currently runs on this proven codebase, but
it suffers from maintainability, performance, and scalability constraints typical of a
large server-rendered monolith:

- A single process serves both pages and APIs.
- Rendering, logic, and data access are tightly coupled.
- No build step, no tooling, and layered technical debt (duplicate auth, ad-hoc routes).

This project re-architects the platform into two cleanly separated applications:

1. **Frontend** — Next.js (React) /App Router, responsible for UI and user experience.
2. **Backend** — Express + Prisma ORM + MySQL, responsible for business logic and data.

The goal is a **feature-parity rewrite** that preserves all current customer and admin
functionality while modernizing the architecture and enabling faster future delivery.
Data is **not ported from production**; the new MySQL schema is created fresh and seeded
with sample/development data (see §9).

---

## 2. Business Objectives

| # | Objective | How this project delivers it |
|---|-----------|------------------------------|
| B1 | Modernize the stack | Move to Next.js (React) frontend + Express API + Prisma ORM + MySQL |
| B2 | Decouple frontend from backend | Separate `frontend/` and `backend/` apps with a REST API contract |
| B3 | Improve developer velocity | Clean folder boundaries, typed ORM, build tooling, reproducible migrations |
| B4 | Improve performance & SEO | Next.js SSR/ISR for storefront pages, API caching, image optimization |
| B5 | Retain feature parity | All current customer + admin features reproduced 1:1 |
| B6 | Unify authentication | Single JWT + HttpOnly cookie auth across admin and customer (replaces the current dual/manual session approach) |
| B7 | Enable scalability | Stateless API ready for horizontal scaling + shared DB |

---

## 3. Business Context & Market

Jood operates an online retail storefront (`telal-contracting.com`) with:

- A public customer catalog (products with variants, brands, categories).
- A shopping flow (cart, wishlist, checkout, payments).
- A customer account area.
- A full admin dashboard (products, categories, orders, customers, admins, billing,
  transactions, visitor analytics).

### Primary user roles
1. **Guest customer** — browses catalog, search, cart, wishlist.
2. **Registered customer** — everything a guest can do plus account, orders, addresses,
   payment methods, saved billing.
3. **Admin roles** — `master_admin`, `super_admin`, `admin`, `sub_admin`, `viewer`, with
   graded permissions, plus customer support management.
4. **Operations / BI** — dashboards, transaction history, billing, visitor analytics.

---

## 4. Stakeholders

| Stakeholder | Interests |
|-------------|-----------|
| End customers | Smooth browsing, fast page loads, easy checkout, reliable order tracking |
| Merchants / staff (admin) | Manage products/categories/orders/customers/billing efficiently |
| Platform owner | Modern, maintainable, scalable codebase; low operational risk |
| Engineering team | Clear architecture, reproducible builds, testable code, good DX |
| Payment partners (Stripe) | Reliable webhook handling, correct payment/stock semantics |

---

## 5. Scope

### 5.1 In scope
- New **Next.js frontend** (App Router) covering all storefront + admin UIs.
- New **Express + Prisma + MySQL backend** REST API.
- Authentication via **JWT in HttpOnly cookies** (single unified flow, admin + customer).
- **Fresh MySQL schema** with Prisma migrations + seed data (no production data port).
- File upload handling for products, categories, variant media, support attachments.
- Stripe payment integration with webhook.
- Socket.IO for real-time admin/customer notifications (parity).
- Visitor analytics tracking.

### 5.2 Out of scope (v1)
- Porting production PostgreSQL data to MySQL (decided: fresh schema + seed only).
- Multi-region / multi-tenant expansion.
- Native mobile apps.
- Advanced BI/data warehouse tooling (existing dashboards are covered).

### 5.3 Assumptions
- The current Express + EJS + PostgreSQL app remains as the **source of truth for
  behavior** during the rewrite and can be referenced for parity.
- A MySQL server (v8+) is available or can be provisioned.
- The team is comfortable with Next.js App Router, Express 4+, Prisma, MySQL.

---

## 6. Functional Requirements (Business View)

> Detailed per-route requirements are in the **SRS** (`docs/02-SRS.md`). This section
> summarizes at the business level.

### 6.1 Customer catalog & shopping
- Browse products by category tree (parent categories → subcategories) and groups.
- View product detail with variants, gallery, videos, attributes, pricing/VAT, stock.
- Filter, sort, paginate, and search the catalog (search, in-stock, price, brand, model,
  rating, attributes, color, size).
- Frequently-bought-together and cross-sell recommendations; recently viewed & frequently
  ordered products.
- Add to cart / wishlist, guest-cart merge on login.

### 6.2 Checkout & payments
- Cash on Delivery (COD) and Card (Stripe Checkout).
- Address collection (billing + shipping with lat/lng).
- Order placement with correct stock semantics:
  - COD stock decremented at placement.
  - Card stock decremented only on confirmed payment webhook.
- Order success tracking pages.

### 6.3 Customer account
- Register (OTP-verified), sign in, Google OAuth, password reset, email verification.
- Profile, orders, order details, addresses, payment methods, billing, security
  (email/password change).

### 6.4 Admin dashboard
- Auth with OTP + role-based access (master/super/admin/sub/viewer).
- Product & category CRUD, admin/user/member management.
- Orders management (list, search, filter, export, detail, cancel).
- Billing, transaction history, dashboards, visitor analytics.
- Contact/help-request inbox (from storefront forms).

---

## 7. Non-Functional Requirements (Business View)

| Category | Requirement |
|----------|-------------|
| Performance | Storefront pages load fast via SSR/ISR + caching; API responses within acceptable limits under normal load |
| Security | Helmet CSP, CSRF on mutation routes, rate limiting, secure cookies, hashed passwords, encrypted card data, input validation |
| Reliability | Atomic/transactional order placement; transactional stock updates; idempotent Stripe webhooks |
| Maintainability | Clear separation of concerns, ORM schema as single source of truth, reproducible migrations |
| Availability | Stateless API + server-rendered frontend; safe to scale horizontally |
| Compliance | GDPR-style privacy policy, terms, cookie policy, disclaimer pages preserved |
| Observability | Logging + visitor analytics retained |

---

## 8. Acceptance Criteria (High-Level)

The re-architecture is accepted when, with the **frontend** pointing at the **backend**:

1. A guest can browse, search, filter, add to cart, add to wishlist.
2. A customer can register (OTP), log in, log in via Google, reset password.
3. A customer can check out via COD and Card; stock updates correctly per method.
4. Orders are visible in customer account and admin dashboard.
5. An authenticated admin can manage products, categories, orders, customers, admins.
6. Admin billing, transaction history, and visitor dashboards render correctly.
7. Real-time (Socket.IO) notifications behave as in the legacy app.
8. All forms reject invalid/CSRF/rate-limited requests gracefully.

---

## 9. Data Migration Decision

**Decision:** Fresh MySQL schema + seed data only.

- The new MySQL database is created from Prisma schema migrations.
- **Production PostgreSQL data is NOT ported.** Existing orders/customers/products in the
  legacy DB remain legacy; the new system starts clean.
- Development/QA runs against seed data matching the legacy schema shape.
- A future data-migration project may port production data once the new system is proven.

### Rationale
- Avoids irreversible/uncertain type mappings (PostgreSQL JSONB → MySQL, numeric/precision
  differences, `id` convention conflicts).
- Reduces risk in the rewrite; teams can validate behavior with controlled seed data.
- Cleaner sequences/serial IDs.

---

## 10. Constraints

- Must preserve **feature parity** (no silent feature removal during v1).
- Keep the legacy app runnable as reference; do not delete it prematurely.
- MySQL 8+ with Prisma is the required backend database target.
- Adhere to the security baseline of the legacy app (Helmet, CSRF, rate limits).

---

## 11. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Feature-parity gaps | Medium | High | Milestone-by-milestone parity checklists referencing legacy routes |
| Payment/stock correctness regression | Medium | High | Re-test COD vs card stock timing in a dedicated milestone with Stripe test keys |
| JSONB→MySQL mapping issues | High | Medium | Model JSON columns as MySQL JSON type via Prisma; document mapping in spec |
| Auth migration breakage | Medium | High | Unified JWT approach defined up front; parity tests for all auth flows |
| Scope creep | Medium | Medium | Strict milestones; each milestone produces a shippable, testable slice |

---

## 12. Success Metrics

- `100%` of legacy customer routes covered by a new frontend route.
- `100%` of legacy admin routes covered by a new admin UI.
- Order placement + stock correctness verified against the legacy behavior for both COD
  and Card.
- Storefront LCP/CLS within industry-acceptable thresholds (baseline recorded post-build).
- All security controls (Helmet CSP, CSRF, rate limits) active in production config.

---

## 13. Approval

| Role | Name | Date | Status |
|------|------|------|--------|
| Business Owner | — | — | Pending |
| Engineering Lead | — | — | Pending |
| QA Lead | — | — | Pending |

---

*See also:* `docs/02-SRS.md` (functional requirements), `docs/03-Technical-Specification.md`
(architecture), `docs/04-Implementation-Plan.md` (milestones).
