# 07 — Realtime & Analytics Spec
## Socket.IO Events + Visitor Analytics Tracking

**Milestone:** M11 · **SRS:** §6 External Interfaces, NFR-1 · **Legacy ref:**
`server.js` (socket wiring), `middleware/visitorTracker.js`, `controllers/*` (emits)

---

## 1. Socket.IO

### 1.1 Namespaces & auth
- Global namespace (default) — no auth.
- `/admin` namespace — JWT-guarded (replace legacy manual admin session middleware;
  require valid admin JWT + role).
- `/customer` namespace — JWT-guarded (valid customer JWT).

Each namespace connection authenticates with the JWT (handshake auth or first message);
reject unauthenticated connects.

### 1.2 Events (parity — preserve names)

**Storefront/catalog:**
- `recentProductsUpdated`, `recentProductAdded`, `recentProductUpdated`,
  `recentProductDeleted`
- `frequentProductsUpdated`, `frequentProductAdded` (etc. — same pattern)
- `discountProductsUpdated`
- `product:created`, `product:updated`, `product:deleted`
- `categoryAddedOrUpdated`

**Commerce:**
- `cartUpdated`
- `wishlistUpdated`
- `orderCreated`
- `orderTrackingUpdated`

**Analytics:**
- `page_visit` (payload: id, visitorKey, url, method, ip, country, city, area,
  userAgent, visitedAt)

**Debug:**
- `socket_test` emitted every 3s (legacy debug — keep as opt-in behind env flag to avoid
  noise; `SERVER_EMIT_SOCKET_TEST=1`).

### 1.3 Delivery rules
- Admin-relevant events (product/category/order/admin) → `/admin` namespace.
- Customer-relevant events (cart/wishlist/order tracking) → `/customer` namespace,
  targeted to the owning user where feasible.
- Keep `app.set('io', io)`-style access so services can emit (mirror legacy pattern by
  attaching io to a shared lib/context).

---

## 2. Visitor Analytics (middleware parity)

Mirrors `middleware/visitorTracker.js` as a backend middleware on the API/frontend-driven
GETs. The frontend can either (a) let the backend instrument requests, or (b) POST page
views to an analytics endpoint — choose one consistent mechanism and document it.

### 2.1 What to skip (parity)
- `socket.io`, `/favicon.ico`, `/uploads`, static assets (css/js/img/fonts/map/txt/json).
- `/api/*` (including `/api/..`), cart (`/customer/cart`), wishlist (`/wishlist`,
  `/customer/wishlist`), `/customer/variant-product`, `/search`.

### 2.2 Geo enrichment (parity)
- Normalize IP (`::ffff:` prefix, brackets). Local IPs → `{ Unknown }` without lookup.
- Lookup: `https://ipwho.is/{ip}` first; fallback `http://ip-api.com/json/{ip}`;
  3s timeout each; unknown on failure.

### 2.3 Dedupe (parity)
- In-memory cache keyed `visitorKey|url`, window `RECENT_HIT_WINDOW_MS = 5000`.
- Ignore refresh when referer == current path.
- Cleanup interval 60s.

### 2.4 Persistence
```
INSERT INTO visitors (visitor_key, ip_address, country, city, area, last_visit, visit_count)
VALUES ... ON DUPLICATE KEY UPDATE last_visit/ip/country/city/area, visit_count = +1

INSERT INTO page_visits (visitor_key, url, method, user_agent, visited_at) ...
```
- `visitor_key` = md5(`${ip}|${user_agent}`).
- Normalize path (strip query, trailing slash).
- Non-fatal: errors are logged and swallowed (never break page load).
- Emit `page_visit` over Socket.IO after save.

### 2.5 Data model
`visitors`: `id, visitor_key (unique), ip_address, country, city, area, first_visit,
last_visit, visit_count`.

`page_visits`: `id, visitor_key, url, method, ip_address, user_agent, visited_at`
(index on `visitor_key`).

---

## 3. Rate-limit + caching parity (recheck)
Apply the SRS §4.1 matrix and `02-catalog.spec.md` cache headers here for the analytics
and realtime-facing HTTP endpoints.

---

## 4. Acceptance checklist (M11)
- [ ] `/admin` and `/customer` namespaces reject unauthenticated sockets.
- [ ] All parity events (list above) fire on the matching trigger.
- [ ] `socket_test` only when the env flag is enabled (clean production logs).
- [ ] Visitor rows upsert + page_visits insert with geo + dedupe as legacy.
- [ ] Visitor tracker never breaks page load (errors swallowed).
- [ ] `/page_visit` analytics dashboard (admin) shows parity data.
