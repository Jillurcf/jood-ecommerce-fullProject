# AGENTS.md

## Stack
- Node + **Express 4** + **EJS** views. No build step, no TypeScript, no test/lint/typecheck runner configured.
- Database is **PostgreSQL** via raw SQL through the `pg` pool in `includes/conn.js` (`export { pool, query }`). Schema uses `snake_case` and JSONB columns (e.g. `gateway_response`, `variant_media_map`).
- **Mongoose is installed but NOT used anywhere** — don't add mongo code. `views/admin` has its own vendored `package.json` (Creative Tim "Soft UI Dashboard" template) — ignore it; it is bundled static assets, not part of the app build.
- Models are ad-hoc SQL, not ORM. When adding tables/queries, follow existing inline-SQL style.

## Commands
- `npm start` — run server (`node server.js`)
- `npm run dev` — nodemon
- There is no test/lint/build command. Verify by running the server and hitting routes.

## Environment (important)
- `.env` is **committed** and holds live credentials. Never commit new secrets; never remove or "fix" existing ones. The app will not boot without `PG_*`, `ADMIN_SESSION_SECRET`, `USER_SESSION_SECRET`.
- `.env` sets `NODE_ENV=production`, so default dev runs enable **Stripe prod-ish rate limits** and disable the `/test-translate` dev route. `APP_URL` appears twice (last wins).
- `includes/.env` also exists (separate from root `.env`).

## Route mounting — read `server.js` before adding routes
Routes are **not** auto-loaded; each router is explicitly `app.use(...)`-mounted in `server.js` (server.js:355–426). Mount paths are ad-hoc and sometimes aliased (e.g. `wishlistRoutes` mounted at both `/customer/wishlist/products` and `/customer/u/wishlist/products`, plus a 301 for the old path). A new feature = create `routes/<x>.routes.js` + `controllers/<x>.controller.js` and register it in `server.js`. `/admin/sign-in`-style base paths are defined **here**, not inside the router.

## Auth model (manual sessions — do NOT add passport.session)
- Two separate session stores: `admin_session` under `/admin`, `user_session` under `/customer` (server.js:185–215). Identified via `req.session.admin` (with `.id`, `.role`) and `req.session.user` / `req.session.userId`.
- Auth guards are duplicated/cheap across routers (`middleware/auth.js`, `middleware/adminAuth.js`, local `requireAdmin` in routers). Respect the established pattern; note there are two admin-id conventions (`req.session.admin.id` vs `req.session.adminId`).
- `res.locals` in server.js:218–247 exposes `user`, `admin`, `userId`, `adminId`, and `csrfToken` to every EJS view — use these in views, don't re-derive from `req.session` in templates.

## Middleware order / gotchas
- **CSRF** (`csurf`): applied to all routes EXCEPT `/api*` and `/webhooks*` (server.js:317–320). Add `res.locals.csrfToken` hidden field to every POST form or it will 403 (EBADCSRFTOKEN).
- **Helmet CSP** is strict (server.js:83–143). Frontend script/style/font added from a CDN will be blocked until you add the origin to the matching `*-src` directive.
- **Uploads**: multer disk storage into `public/uploads/...`, served at `/uploads`. Limits differ per uploader — admin images 2MB (`middleware/multer.js`), products 60MB × up to 150 files (`middleware/multeraddProduct.js`).
- **Visitor tracking** middleware (`middleware/visitorTracker.js`) records page hits to `visitors`/`page_visits` on every GET; it intentionally skips `/api`, `/uploads`, static assets, cart/wishlist, `/search`.

## Payments
- Stripe (card) + webhook at `/webhooks/stripe`, mounted with raw body and excluded from CSRF/body-parsers (server.js:37, webhooks.routes.js). Stock is decremented only when the webhook confirms payment.

## Socket.IO
- Three namespaces: global, `/admin`, `/customer`; each manual session middleware is attached in server.js:263–283. Server emits a `socket_test` every 3s (debug — server.js:461).

## Frontend conventions
- Views: `views/customer/**` (storefront), `views/admin/**` (dashboard), shared partials in `views/partials/`. Reusable admin account header/sidebar in `views/admin/includes/`, customer equivalents in `views/customer/includes/` — prefer editing these over duplicating chrome in each page.

## Active re-architecture (do NOT touch legacy for this work)
- This repo is being re-architected into a **monorepo**: `backend/` (Express + **Prisma + MySQL**) and `frontend/` (**Next.js** App Router). Everything above this line describes the **legacy Express/EJS/PostgreSQL app**, which stays in place purely as the **behavioral reference** — never modify `server.js`, `routes/`, `controllers/`, `views/`, `includes/`, `middleware/`, `public/` for the rewrite.
- Requirements & plan live in `docs/`: `01-BRD.md`, `02-SRS.md`, `03-Technical-Specification.md`, `04-Implementation-Plan.md`. Per-area implementation specs live in `.opencode/specs/` (`00-index.spec.md` … `07-realtime-analytics.spec.md`) — these are auto-loaded via `opencode.json` `instructions` and are the working spec sheets for each milestone. The opencode skill `.opencode/skills/jood-migrate/SKILL.md` drives milestone execution — load it when the user says "do milestone N" / "implement the plan" / "start M1".
- Key decisions: unified **JWT + HttpOnly cookie** auth (admin + customer); **fresh MySQL schema + seed only** (no production data port); `frontend/` + `backend/` separated inside this repo.
- New apps use `backend/.env.example` / `frontend/.env.example` — do NOT copy legacy `.env` secrets.
