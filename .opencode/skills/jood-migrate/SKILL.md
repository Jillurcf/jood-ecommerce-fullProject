---
name: jood-migrate
description: Use ONLY when executing the Jood re-architecture from Express/EJS/PostgreSQL to Next.js frontend + Express/Prisma/MySQL backend, driven milestone-by-milestone. Trigger on user commands like "do milestone N", "start M5", "implement the plan milestonewise", or "build the frontend/backend split". Routes the agent through docs/01-BRD.md, docs/02-SRS.md, docs/03-Technical-Specification.md, docs/04-Implementation-Plan.md and enforces the milestone checklist.
---

# Jood Re-architecture — Milestone Execution

This skill drives the migration of the Jood monolith to two separated apps:
`frontend/` (Next.js) + `backend/` (Express + Prisma + MySQL). It is an
**execution harness** — the source of truth for behavior is the legacy
Express/EJS app; the target contract is the docs in `docs/`.

## When to use
- The user says variations of: "do milestone N", "start M1", "implement the
  plan", "build the frontend/backend split", "continue the migration".
- Only use this skill for THIS migration project, not unrelated work.

## Source-of-truth files (read before coding)
1. `docs/01-BRD.md` — business objectives & acceptance criteria
2. `docs/02-SRS.md` — functional requirements (FR-*, route parity)
3. `docs/03-Technical-Specification.md` — architecture, Prisma schema, auth, API contract
4. `docs/04-Implementation-Plan.md` — the milestone checklist you execute
5. `.opencode/specs/00-index.spec.md` — index; then the matching per-area `.spec.md`
   (`01-auth`, `02-catalog`, `03-cart-wishlist`, `04-checkout-payments`, `05-account`,
   `06-admin`, `07-realtime-analytics`) for route-level detail of the milestone's area
6. **Legacy app** (`server.js`, `routes/**`, `controllers/**`) — behavioral reference; do NOT modify it

## Hard rules
- **Never modify anything under the legacy app's own files** (`server.js`,
  `routes/`, `controllers/`, `views/`, `includes/`, `middleware/`, `public/`).
  It stays as the parity reference.
- Write new code ONLY under `frontend/` and `backend/` unless a doc explicitly
  says otherwise.
- **Do NOT copy legacy secrets values** into the new apps. New apps use
  `backend/.env.example` / `frontend/.env.example` with placeholders only.
- Money uses Prisma `Decimal` (MySQL `DECIMAL`), not float.
- Preserve parity for every SRS FR for the milestone being executed.
- Execute milestones strictly in order (M1 → … → M12). Do not jump ahead.

## Execution flow for one milestone
1. **Confirm** which milestone the user wants (e.g. "M5"). If not given, report
   which milestones are complete and ask.
2. **Load** the relevant docs (§ SRS FRs + spec modules + the plan section).
3. **Read the legacy behavior** for that area (route/controller) to capture exact
   business rules, column names, and edge cases.
4. **Implement** backend modules first (where the milestone has backend work),
   then the frontend. Keep the API contract (`{ success, data?, message?,
   error_code? }`) consistent.
5. **Write migrations/seed** idempotently under `backend/prisma/`.
6. **Verify** with the nearest available command (see below); run the parity
   check list from the plan for that milestone.
7. **Summarize** what was delivered, the acceptance results, and any deviations.

## Verification commands (no CI configured in this repo — verify by running)
- Backend: `cd backend && npm run dev` (and hit `/api/health`, relevant routes)
- Prisma: `cd backend && npx prisma migrate status` / `npx prisma migrate dev`
- Seed: `cd backend && npm run seed` (if defined) — must be idempotent
- Frontend: `cd frontend && npm run dev`
- Typecheck (frontend): `cd frontend && npm run lint && npm run typecheck` (if defined)
- Backend tests: `cd backend && npm test` (Jest, once introduced in M12)

## Layer ordering within a milestone
Backend → API contract → Frontend. Within backend: module → route → controller →
service(Prisma) → validation(zod) → tests. Never let the frontend reach the DB.

## Common pitfalls to avoid
- Forgetting CSRF on mutation routes (skip only `/api*` and `/webhooks*`).
- Forgetting Helmet CSP directive origins when adding CDN assets.
- COD vs Card stock timing: decrement at placement (COD) vs only on
  `payment_intent.succeeded` (Card) — do not unify them.
- Cart identity: cart keyed by customer **email** + guest token; wishlist keyed
  by numeric id + guest id. Merge on login/signup inside a transaction.
- Admin id conventions vary in legacy (`admin_id` vs `id` vs `session.adminId`);
  unify in the new auth.
- Socket.IO namespaces `/admin` and `/customer` with auth guard, not just global.

## Milestone at-a-glance (from docs/04-Implementation-Plan.md)
- **M0** repo groundwork (folders, node version)
- **M1** scaffold + MySQL schema + seed
- **M2** auth backend (JWT, customer+admin)
- **M3** catalog backend (shop/search/detail)
- **M4** cart & wishlist backend
- **M5** checkout + Stripe + stock semantics
- **M6** customer account backend
- **M7** admin backend (CRUD + analytics)
- **M8** frontend storefront UI
- **M9** frontend auth + account + checkout
- **M10** frontend admin dashboard
- **M11** realtime + middleware parity + hardening
- **M12** polish, tests, performance, go-live prep
