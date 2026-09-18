# Spec Index
## Jood Re-architecture — Per-Functional-Area Spec Sheets

**Folder:** `.opencode/specs/`
**Purpose:** Detailed, implementation-oriented specs per functional area. These are the
"working" specs that milestone execution follows. They complement (not replace) the SRS.

## Reading order & coverage

| File | Functional area | Milestones | Key SRS FRs |
|------|-----------------|------------|-------------|
| `00-index.spec.md` | This index + traceability | all | — |
| `01-auth.spec.md` | Customer + admin auth (OTP, JWT, Google, password) | M2 | FR-3.x, FR-7.1–7.5 |
| `02-catalog.spec.md` | Products, variants, categories, shop, search, detail | M3 | FR-1.x, FR-2.x |
| `03-cart-wishlist.spec.md` | Cart + wishlist (guest identity + merge) | M4 | FR-4.x |
| `04-checkout-payments.spec.md` | COD + Stripe, stock semantics, orders | M5 | FR-5.x |
| `05-account.spec.md` | Customer profile, orders, addresses, billing, security, tx-history | M6 | FR-6.x |
| `06-admin.spec.md` | Roles, product/category CRUD, order mgmt, dashboards, users/admins | M7 | FR-7.x |
| `07-realtime-analytics.spec.md` | Socket.IO events + visitor analytics | M11 | NFR-1, §6 External Interfaces |

## Conventions used in every spec sheet
- **Route notation:** `METHOD /path` (new API) → `legacy: <legacy route>`.
- **Auth annotation on routes:**
  - `[public]` — no auth
  - `[auth: customer]` — any authenticated customer
  - `[auth: admin]` — any admin role
  - `[auth: admin: SUPER|MASTER]`, `[auth: admin: ADMIN_MANAGER]`,
    `[auth: admin: USER_MANAGER]` — role-gated
- **Envelope:** all API responses use `{ success: boolean, data?, message?,
  error_code? }`.
- **Parity =** behavior identical to the legacy app for the same input.
- **Money:** Prisma `Decimal` (MySQL `DECIMAL`), never float.

## Golden rules applied across all specs
1. CSRF on all mutation routes except `/api*` and `/webhooks*`.
2. Helmet CSP origins must allow any new CDN script/style/font.
3. Never read the DB from the frontend — always through the backend API.
4. Do not modify legacy code; it is the parity reference.
