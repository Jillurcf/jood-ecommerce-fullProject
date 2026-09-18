# 06 — Admin Spec
## Roles, Auth, Product/Category CRUD, Account & Order Management, Dashboards, Analytics

**Milestone:** M7 · **SRS:** FR-7.x · **Legacy ref:** `controllers/a/**`,
`controllers/add-product.controller.js`, `controllers/parent-category.controller.js`,
`controllers/category.controller.js`, `controllers/discount.controller.js`,
`middleware/*`

---

## 1. Admin roles & guards (see `01-auth.spec.md` §6)
`master_admin, super_admin, admin, sub_admin, viewer`; statuses
`active, inactive, blocked, deleted`. Guards: `requireAdmin`, `requireSuperOrMaster`,
`requireAdminManager`, `requireUserManager`, `isMasterAdmin`.

---

## 2. Admin auth & profile routes

| Method | New path | Legacy | Auth |
|--------|----------|--------|------|
| (auth flows) | `/api/auth/admin/*` | `(/admin/a/sign/*, login/*, password)` | see 01-auth |
| GET/PUT | `/api/admin/profile` | `(/admin/a/profile/myprofile)` | admin |
| POST | `/api/admin/heartbeat` | (myprofile heartbeat) | admin |
| POST | `/api/admin/offline` | (myprofile offline) | admin |
| POST | `/api/admin/update-email` | `(/admin/a/setting/updateEmail)` | admin |
| POST | `/api/admin/update-password` | `(/admin/a/setting/updatePassword)` | admin |

### Admin profile / activity parity
- Update editable fields; heartbeat keeps `is_online`, idle > 4 min destroys session
  (activity middleware).

---

## 3. Admin account management routes

| Method | New path | Legacy | Auth |
|--------|----------|--------|------|
| POST | `/api/admin/create` | `POST /admin/a/create` | ADMIN: MASTER |
| POST | `/api/admin/suspend` | `POST /admin/a/suspend` | ADMIN: MASTER |
| POST | `/api/admin/activate` | `POST /admin/a/activate` | ADMIN: MASTER |
| POST | `/api/admin/force-logout` | `POST /admin/a/force-logout` | ADMIN: MASTER |
| GET | `/api/admin/overview` | `GET /admin/a/overview` | ADMIN: MASTER |
| GET | `/api/admin/me` | `GET /admin/a/current` | admin |
| GET/POST | `/api/admin/admins` | `(/admin/a/profile/add-admin, admins)` | ADMIN: ADMIN_MANAGER |
| POST | `/api/admin/admins/:id/approve` | (add-admin OTP approval) | ADMIN: SUPER\|MASTER |
| GET/POST | `/api/admin/master-admins` | `(/admin/a/profile/master-admins)` | ADMIN: SUPER\|MASTER |
| GET/POST | `/api/admin/super-admins` | `(/admin/a/profile/super-admins)` | ADMIN: SUPER (list/view) |
| GET/POST | `/api/admin/users` | `(/admin/a/profile/users)` | ADMIN: USER_MANAGER |
| POST | `/api/admin/users/:id/block\|freeze\|delete` | (users controller) | ADMIN: SUPER\|MASTER |

### Create-admin rules
- Max 1 `master_admin` (enforce). Roles assignable: `master_admin, admin, sub_admin,
  viewer` (master creates). New-admin creation is OTP-approved (parity).
- Suspend → `status=blocked` + bump `session_version` (kills all sessions).
- Force-logout → bump `session_version` + offline.

### Users (customer accounts) management
- list/create/update; block/freeze/delete. Destructive ops need SUPER|MASTER.
- Edit `customer_accounts` fields; block sets `status='blocked'` (or `deleted`), bump
  `session_version`.

---

## 4. Product management routes (CRUD incl. variants/media/attributes)

| Method | New path | Legacy | Auth |
|--------|----------|--------|------|
| GET | `/api/admin/products` | `(admin add-product list/search)` | admin |
| GET | `/api/admin/products/search` | `(searchProduct)` | admin |
| GET | `/api/admin/products/:id` | `(getProductById)` | admin |
| POST | `/api/admin/products` | `POST /admin/add-product` | admin |
| PUT | `/api/admin/products/:id` | `(updateProduct)` | admin |
| DELETE | `/api/admin/products/:id` | `(deleteProduct)` | admin |

### Create/update payload & persistence
- Product master fields (see `02-catalog.spec.md` §1) + **variants array** each with
  pricing/stock/weight/dimensions, **media** (per-variant images + gallery + videos),
  **attributes** (assign attribute values).
- Persistence is transactional: upsert product, sync variants (insert/update/delete),
  variant_media, attributes, product_variant_attributes.
- Generate `product_id` (`PROD…/PART…` sequence), `slug` unique.
- `variant_media_map`, `gallery`, `product_videos` stored as JSON (parity of legacy
  `add-product` bootstrap shape).

### Uploads
- Product media → 60MB × 150 files, image+video (`multeraddProduct` limits).

---

## 5. Category management routes

| Method | New path | Legacy | Auth |
|--------|----------|--------|------|
| GET/POST | `/api/admin/parent-categories` | `(/admin parent-category)` | admin |
| PUT/DELETE | `/api/admin/parent-categories/:id` | `(parent-category)` | admin |
| DELETE | `/api/admin/parent-categories/:id/image` | `(remove image)` | admin |
| GET/POST | `/api/admin/categories` | `(/admin category)` | admin |
| PUT/DELETE | `/api/admin/categories/:id` | `(category)` | admin |
| DELETE | `/api/admin/categories/:id/image` | `(remove-image)` | admin |

- Parent categories: `name, slug, display_order, status, meta_title, meta_description,
  image`. Categories: `parent_id, name, slug, description, status, image`.
- Category images → 2MB images only; store filename; serve from uploads.

---

## 6. Orders management (admin)

| Method | New path | Legacy | Auth |
|--------|----------|--------|------|
| GET | `/api/admin/orders` | `GET /admin/a/orders` | admin |
| GET | `/api/admin/orders/data` | `/data` | admin |
| GET | `/api/admin/orders/summary` | `/summary` | admin |
| GET | `/api/admin/orders/live-search` | `/live-search` | admin |
| GET | `/api/admin/orders/export` | `/export` | admin |
| GET | `/api/admin/orders/:orderNumber` | `/:orderNumber` | admin |
| POST | `/api/admin/orders/:id/cancel` | `POST /orders/:id/cancel` | admin |
| GET | `/api/admin/orders/status-options` | `/orders-status-options` | admin |

- Pagination (default 20, max 100; export 1000), filters: status bucket
  (paid/pending/refunded/cancelled), payment_method, gateway_provider, order_status,
  date from/to, `q`, order_number, tracking_id, payment_reference, customer, email,
  phone, type (weekly/today/month). Summary cards + breakdowns + monthly/weekly series.
- Export formats per legacy (CSV + PDF export handled).

---

## 7. Dashboards, billing & transaction history

| Method | New path | Legacy | Auth |
|--------|----------|--------|------|
| GET | `/api/admin/dashboard` | `(/admin/a/account/dashboard)` | admin |
| GET | `/api/admin/billing` | `(/admin/a/account/billing)` | admin |
| GET | `/api/admin/billing/chart` | `/chart` | admin |
| GET | `/api/admin/billing/detail/:id` | `/detail/:id` | admin |
| GET | `/api/admin/billing/export/pdf` | `/export/pdf` | admin |
| GET | `/api/admin/transactions` | `(/admin/a/account/transaction-history)` | admin |
| GET | `/api/admin/transactions/summary` → `/summary` | admin |
| GET | `/api/admin/transactions/item/:type/:id` | `/item/:item_type/:item_id` | admin |
| POST | `/api/admin/transactions/export` | `/export` | admin |
| GET | `/api/admin/transactions/chart` | `/chart` | admin |
| GET | `/api/admin/transactions/product-search` | (product search) | admin |

### Billing overview (parity)
- totalUsers, usersWithOrders, paidUsers, totalRevenue, totalRefunds, pendingPayments,
  totalOrders, totalAddresses, thisMonthRevenue (from `customer_accounts` + `orders` +
  `user_addresses`). Monthly revenue 12-mo chart; breakdown by status and method; per-user
  lateral aggregates (total_spent, total_orders_paid, pending_payments, refund_total,
  this_month_spent, last_paid_at, first_order_at) + last order + addresses agg.

### Transactions + product search
- Orders LEFT JOIN customers; item detail; **product search** returns
  `{product_id, product_name, transaction_count, amount, currency, last_order_at}`
  aggregated from `order_items` JOIN `products`.

### Dashboard counts
- total users (`customer_accounts`), total products (`products`), plus visitors, orders,
  income, items, latest 10 orders, transaction data, visitor pagination.

---

## 8. Visitor analytics routes

| Method | New path | Legacy | Auth |
|--------|----------|--------|------|
| GET | `/api/admin/visitors` | `(/admin/a visitors)` | admin |
| GET | `/api/admin/visitors/chart` | `/api/visitors/chart` | admin |
| GET | `/api/admin/visitors/:visitorKey/visits` | `/visitors/:key/visits` | admin |

- Range buckets: hour/day/week/month/year. Parities of visitor tracking in
  `07-realtime-analytics.spec.md`.

---

## 9. Contact / support inbox (admin)

| Method | New path | Legacy | Purpose |
|--------|----------|--------|---------|
| GET | `/api/admin/support` | (contact/support inbox) | list contact + support requests |
| GET | `/api/admin/support/:id` | | detail one |
| POST | `/api/admin/support/:id/status` | | update status (e.g. close) |

---

## 10. Acceptance checklist (M7)
- [ ] Only authorized roles reach each endpoint (403 otherwise).
- [ ] Master-admin unique; suspend/activate/force-logout bump `session_version`.
- [ ] Product create/edit persists variants, media, attributes transactionally; parity of
  `variant_media_map`.
- [ ] Parent category + category CRUD + image upload/remove work.
- [ ] Orders list/filter/export/detail/cancel match legacy; cancel is role-guarded.
- [ ] Billing + transaction + product-search aggregates match legacy numbers.
- [ ] Dashboard counts and visitor analytics render.
- [ ] Users (customers) management CRUD + block/freeze/delete.
