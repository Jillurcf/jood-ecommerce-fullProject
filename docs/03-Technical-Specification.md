# Technical Specification
## Jood Re-architecture — Next.js Frontend + Express/Prisma/MySQL Backend

**Version:** 1.0
**Date:** 2026-09-02
**Scope:** Architecture, folder structure, Prisma schema, API contract, auth design,
tech decisions, and per-area technical guidance. Companion to `docs/02-SRS.md`.

---

## 1. System Architecture

### 1.1 High-Level Topology

```
┌──────────────────────────────┐
│   Next.js Frontend (frontend/)│
│   App Router · React · TS    │
│   SSR / ISR / Client         │
└───────────┬──────────────────┘
            │  HTTPS / REST JSON (fetch) · JWT in HttpOnly cookie
┌───────────▼──────────────────┐
│   Express API (backend/)      │
│   REST · Middleware · Auth    │
│   Services · Socket.IO        │
└───────────┬──────────────────┘
            │  Prisma Client
     ┌──────▼───────┐      ┌──────────────┐
     │   MySQL 8+   │      │ Stripe/SMTP  │
     └──────────────┘      │ Google OAuth │
                           └──────────────┘
```

- **Frontend** never touches MySQL directly — it calls the backend API only.
- **Backend** owns all data access, business rules, auth, payments, email, and realtime.
- Both apps share an **API contract** (OpenAPI-style types in a shared package or a
  generated client) to avoid drift (optional in v1, recommended in a later milestone).

### 1.2 Repo Layout (Monorepo in this repo)

```
C:\jood_fullProject\
├── server.js, routes/, controllers/, views/, ...   # LEGACY app (kept as reference — do not modify)
├── includes/, middleware/, public/, utils/
├── docs/                                            # THIS documentation set
│   ├── 01-BRD.md
│   ├── 02-SRS.md
│   ├── 03-Technical-Specification.md
│   └── 04-Implementation-Plan.md
├── frontend/                                        # NEW Next.js app (created by milestones)
│   ├── package.json
│   ├── next.config.js
│   ├── tsconfig.json
│   ├── .env.example
│   ├── app/                    # App Router: (storefront), (auth), (account), (admin)
│   ├── components/
│   ├── lib/                    # api client, auth helpers, hooks
│   ├── styles/
│   └── public/
├── backend/                                         # NEW Express + Prisma app (created by milestones)
│   ├── package.json
│   ├── src/
│   │   ├── server.js
│   │   ├── app.js
│   │   ├── config/
│   │   ├── common/            # errors, response helpers, validation
│   │   ├── middleware/        # auth, csrf, rate-limit, upload, error-handler
│   │   ├── modules/           # feature modules (see §3)
│   │   ├── lib/               # prisma, stripe, mail, socket
│   │   └── utils/
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── seed/              # seed scripts
│   ├── .env.example
│   └── uploads/               # file storage (products, categories, variants, support)
└── .opencode/skills/jood-migrate/   # skill for executing this migration
```

---

## 2. Technology Stack & Decisions

| Concern | Decision | Rationale |
|---------|----------|-----------|
| Frontend framework | **Next.js (App Router) + React + TypeScript** | SSR/ISR for SEO + performance; modern DX |
| Backend framework | **Express 4** | Parity with legacy skills; stable, well-known |
| ORM | **Prisma** | Type-safe, migrations, single source of truth |
| Database | **MySQL 8+** | Decided target; JSON type for legacy JSONB data |
| Auth | **JWT + HttpOnly cookies** (unified admin+customer) | Stateless, scalable; replaces dual manual sessions |
| Validation | **zod** (shared with frontend via types) | Runtime validation + TS types |
| Payments | **Stripe** (Checkout Sessions + webhook) | Parity with legacy |
| Email | **nodemailer** (SMTP) | Parity |
| Realtime | **socket.io** (namespaces) | Parity |
| File upload | **multer** disk storage | Parity |
| Testing | **Jest** (backend unit) + optional **Playwright** (E2E) later | Introduces minimal testing where legacy had none |

> All decisions match the existing dependency set where possible to reduce risk and
> preserve behavior.

---

## 3. Backend Design

### 3.1 Feature Modules (`backend/src/modules/`)

Each module owns its route, controller/services, and validation. Recommended layout:

```
modules/
├── auth/            # customer + admin sign-in/up, OTP, password, google, session-version
├── admin/           # admin profile, role guards, admin/user/member management
├── catalog/         # categories, parent-categories, products, variants, media, attributes
├── shop/            # shop listing/filter/sort/paginate, product detail, search
├── cart/            # cart CRUD + guest-token identity + merge
├── wishlist/        # wishlist toggle/data + guest merge
├── checkout/        # COD + Stripe session, orders, tracking, saved data
├── payments/        # Stripe webhook, payment methods, stock-on-payment
├── account/         # customer profile, orders, addresses, billing, security, tx-history
├── support/         # contact + support requests
├── analytics/       # visitor + page_visits tracking and dashboards
└── realtime/        # socket.io wiring + event emission helpers
```

### 3.2 Request Flow

```
HTTP → response-format middleware → (auth) → (csrf on mutations) → (rate-limit)
     → route → controller(validate zod) → service(prisma/transactions) → response
     → error-handler (centralized, JSON)
```

### 3.3 Centralized Error Format

```json
{ "success": false, "message": "Human-readable", "error_code": "INSUFFICIENT_STOCK" }
```

Map internal error codes to HTTP statuses in the error handler (400/401/403/404/409/422/500).

### 3.4 Prisma Schema Design

> Placeholder for MySQL. Column names use snake_case to mirror legacy. JSONB → MySQL `Json`.
> Full `.prisma` file is produced in **Milestone 1** from this spec.

Key models (fields are illustrative of the legacy schema; confirm each against legacy SQL):

```
model CustomerAccount {
  id                    Int      @id @default(autoincrement())
  userId                String   @unique @map("user_id")
  fullName              String   @map("full_name")
  email                 String   @unique
  phone                 String?
  passwordHash          String?  @map("password_hash")
  googleId              String?  @map("google_id")
  provider              String   @default("local")
  status                String   @default("active")
  emailVerified         Boolean  @default(false) @map("email_verified")
  phoneVerified         Boolean? @map("phone_verified")
  loginAttempts         Int?     @map("login_attempts")
  lastAttemptTime       DateTime? @map("last_attempt_time")
  lockUntil             DateTime? @map("lock_until")
  lastLoginAt           DateTime? @map("last_login_at")
  lastLogoutAt          DateTime? @map("last_logout_at")
  isOnline              Boolean? @default(false) @map("is_online")
  sessionVersion        Int?     @default(1) @map("session_version")
  emailVerificationToken String? @map("email_verification_token")
  emailVerificationExpires DateTime? @map("email_verification_expires")
  resetPasswordToken    String?  @map("reset_password_token")
  resetPasswordExpires  DateTime? @map("reset_password_expires")
  createdAt             DateTime @default(now()) @map("created_at")
  updatedAt             DateTime @updatedAt @map("updated_at")

  carts        Cart[]
  wishlists    Wishlist[]
  orders       Order[]
  addresses    UserAddress[]
  paymentMethods CustomerPaymentMethod[]

  @@map("customer_accounts")
}

model AdminAccount {
  id                    Int      @id @default(autoincrement())
  adminId               String   @unique @map("admin_id")
  fullName              String   @map("full_name")
  email                 String   @unique
  phone                 String?
  password              String?  // hashed
  role                  String   // master_admin | super_admin | admin | sub_admin | viewer
  status                String   @default("active")
  emailVerified         Boolean  @default(false) @map("email_verified")
  otpHash               String?  @map("otp_hash")
  otpExpiresAt          DateTime? @map("otp_expires_at")
  otpAttempts           Int?     @map("otp_attempts")
  loginAttempts         Int?     @map("login_attempts")
  lockUntil             DateTime? @map("lock_until")
  lastLoginAt           DateTime? @map("last_login_at")
  sessionVersion        Int?     @default(1) @map("session_version")
  resetPasswordToken    String?  @map("reset_password_token")
  resetPasswordExpires  DateTime? @map("reset_password_expires")
  createdBy             Int?     @map("created_by")
  createdAt             DateTime @default(now()) @map("created_at")
  updatedAt             DateTime @updatedAt @map("updated_at")

  @@map("admin_accounts")
}

model ParentCategory {
  id            Int      @id @default(autoincrement())
  name          String
  slug          String   @unique
  displayOrder  Int?     @map("display_order")
  status        Boolean? @default(true)
  metaTitle     String?  @map("meta_title")
  metaDescription String? @map("meta_description")
  image         String?
  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt @map("updated_at")

  categories Category[]
  products   Product[]
  @@map("parent_categories")
}

model Category {
  id          Int      @id @default(autoincrement())
  parentId    Int?     @map("parent_id")
  name        String
  slug        String   @unique
  description String?
  status      Boolean? @default(true)
  image       String?
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  parent   ParentCategory? @relation(fields: [parentId], references: [id])
  products Product[]
  @@map("categories")
}

model Product {
  id                Int      @id @default(autoincrement())
  productId         String   @unique @map("product_id")
  name              String
  slug              String   @unique
  productType       String?  @map("product_type")   // 'simple'
  brand             String?
  mpn               String?
  bullets           String?
  description       String?
  shortDescription  String?  @map("short_description")
  parentCategoryId  Int?     @map("parent_category_id")
  categoryId        Int?     @map("category_id")
  visibility        String?
  status            String?
  metaKeywords      String?  @map("meta_keywords")
  metaTitle         String?  @map("meta_title")
  metaDescription   String?  @map("meta_description")
  mainImage         String?  @map("main_image")
  productVideos     Json?    @map("product_videos")
  displayLocations  Json?    @map("display_locations")
  displayTiming     Json?    @map("display_timing")
  createdAt         DateTime @default(now()) @map("created_at")
  updatedAt         DateTime @updatedAt @map("updated_at")

  parentCategory ParentCategory? @relation(fields: [parentCategoryId], references: [id])
  category       Category?       @relation(fields: [categoryId], references: [id])
  variants       ProductVariant[]
  orderItems     OrderItem[]
  carts          Cart[]
  crossSells     ProductCrossSell[] @relation("CrossSellSource")
  fbt            ProductFBT[]       @relation("FBTSource")
  @@map("products")
}

model ProductVariant {
  id               Int      @id @default(autoincrement())
  productId        Int      @map("product_id")
  name             String?
  displayName      String?  @map("display_name")
  sku              String?
  price            Float?   // Decimal in Prisma
  salePrice        Float?   @map("sale_price")
  costPrice        Float?   @map("cost_price")
  stock            Int      @default(0)
  lowStockThreshold Int?    @default(5) @map("low_stock_threshold")
  trackInventory   Boolean? @default(true) @map("track_inventory")
  allowBackorders  Boolean? @default(false) @map("allow_backorders")
  discountType     String?  @map("discount_type")   // percent|percentage|fixed|amount
  discountValue    Float?   @map("discount_value")
  vatRate          Float?   @default(5) @map("vat_rate")
  vatIncluded      Boolean? @default(true) @map("vat_included")
  barcode          String?
  barcodeType      String?  @map("barcode_type")
  weight           Float?
  weightUnit       String?  @map("weight_unit")
  length           Float?
  width            Float?
  height           Float?
  dimensionUnit    String?  @map("dimension_unit")
  shippingClass    String?  @map("shipping_class")
  isActive         Boolean? @default(true) @map("is_active")
  isDefault        Boolean? @default(false) @map("is_default")
  sortOrder        Int?     @map("sort_order")
  createdAt        DateTime @default(now()) @map("created_at")
  updatedAt        DateTime @updatedAt @map("updated_at")

  product    Product  @relation(fields: [productId], references: [id])
  media      VariantMedia[]
  attributes ProductVariantAttribute[]
  cartRows   Cart[]
  wishlists  Wishlist[]
  orderItems OrderItem[]
  @@map("product_variants")
}

model VariantMedia {
  id          Int    @id @default(autoincrement())
  variantId   Int    @map("variant_id")
  filename    String
  originalname String?
  mimetype    String?
  size        Int?
  variant     ProductVariant @relation(fields: [variantId], references: [id])
  @@map("variant_media")
}

model Attribute {
  id        Int    @id @default(autoincrement())
  name      String
  slug      String
  scopeType String? @map("scope_type")
  productId Int?   @map("product_id")
  variantId Int?   @map("variant_id")
  values    AttributeValue[]
  variantAttrs ProductVariantAttribute[]
  @@index([scopeType])
  @@map("attributes")
}

model AttributeValue {
  id          Int    @id @default(autoincrement())
  attributeId Int    @map("attribute_id")
  value       String
  slug        String?
  sortOrder   Int?   @map("sort_order")
  attribute   Attribute @relation(fields: [attributeId], references: [id], onDelete: Cascade)
  variantAttrs ProductVariantAttribute[]
  @@unique([attributeId, value])
  @@map("attribute_values")
}

model ProductVariantAttribute {
  id               Int @id @default(autoincrement())
  variantId        Int @map("variant_id")
  attributeId      Int @map("attribute_id")
  attributeValueId Int @map("attribute_value_id")
  variant          ProductVariant @relation(fields: [variantId], references: [id], onDelete: Cascade)
  attribute        Attribute      @relation(fields: [attributeId], references: [id], onDelete: Cascade)
  attributeValue   AttributeValue @relation(fields: [attributeValueId], references: [id], onDelete: Cascade)
  @@unique([variantId, attributeId])
  @@map("product_variant_attributes")
}

model Cart {
  id         Int       @id @default(autoincrement())
  trackingId String    @map("tracking_id")
  userId     String?   @map("user_id")     // customer email for logged-in, '' for guest
  guestToken String?   @map("guest_token")
  productId  Int       @map("product_id")
  variantId  Int?      @map("variant_id")
  quantity   Int
  price      Float?
  status     String    @default("active")
  orderId    Int?      @map("order_id")
  orderedAt  DateTime? @map("ordered_at")
  createdAt  DateTime  @default(now()) @map("created_at")
  updatedAt  DateTime  @updatedAt @map("updated_at")

  product Product?       @relation(fields: [productId], references: [id])
  variant ProductVariant? @relation(fields: [variantId], references: [id])
  @@index([trackingId])
  @@index([userId])
  @@index([guestToken])
  @@map("cart")
}

model Wishlist {
  id        Int      @id @default(autoincrement())
  variantId Int      @map("variant_id")
  userId    Int?     @map("user_id")
  guestId   String?  @map("guest_id")
  updatedAt DateTime @updatedAt @map("updated_at")
  variant   ProductVariant @relation(fields: [variantId], references: [id])
  @@unique([variantId, userId])
  @@map("wishlist")
}

model Order {
  id                Int      @id @default(autoincrement())
  userId            Int?     @map("user_id")
  guestToken        String?  @map("guest_token")
  orderNumber       String   @unique @map("order_number")
  trackingId        String?  @map("tracking_id")
  paymentReference  String?  @map("payment_reference")
  customerName      String?  @map("customer_name")
  email             String?
  phone             String?
  currency          String   @default("AED")
  subtotalAmount    Float?   @map("subtotal_amount")
  discountAmount    Float?   @map("discount_amount")
  vatAmount         Float?   @map("vat_amount")
  grandTotal        Float?   @map("grand_total")
  paymentMethod     String?  @map("payment_method")   // cod | card
  paymentStatus     String?  @map("payment_status")
  orderStatus       String?  @map("order_status")
  gatewayProvider   String?  @map("gateway_provider")
  billingAddress    Json?    @map("billing_address")
  shippingAddress   Json?    @map("shipping_address")
  notes             String?
  createdAt         DateTime @default(now()) @map("created_at")
  updatedAt         DateTime @updatedAt @map("updated_at")

  customer CustomerAccount? @relation(fields: [userId], references: [id])
  items    OrderItem[]
  payments OrderPayment[]
  @@map("orders")
}

model OrderItem {
  id             Int     @id @default(autoincrement())
  orderId        Int     @map("order_id")
  cartId         Int?    @map("cart_id")
  productId      Int     @map("product_id")
  variantId      Int?    @map("variant_id")
  productName    String? @map("product_name")
  variantName    String? @map("variant_name")
  sku            String?
  quantity       Int
  unitPrice      Float?  @map("unit_price")
  discountAmount Float?  @map("discount_amount")
  vatAmount      Float?  @map("vat_amount")
  lineTotal      Float?  @map("line_total")
  createdAt      DateTime @default(now()) @map("created_at")
  order          Order          @relation(fields: [orderId], references: [id])
  product        Product?       @relation(fields: [productId], references: [id])
  variant        ProductVariant? @relation(fields: [variantId], references: [id])
  @@map("order_items")
}

model OrderPayment {
  id                   Int       @id @default(autoincrement())
  orderId              Int       @map("order_id")
  provider             String?
  paymentMethod        String?   @map("payment_method")
  transactionReference String?   @map("transaction_reference")
  amount               Float?
  currency             String?
  status               String?
  gatewayResponse      Json?     @map("gateway_response")
  createdAt            DateTime  @default(now()) @map("created_at")
  updatedAt            DateTime  @updatedAt @map("updated_at")
  order                Order     @relation(fields: [orderId], references: [id])
  @@map("order_payments")
}

model CustomerPaymentMethod {
  id                Int      @id @default(autoincrement())
  userId            Int      @map("user_id")
  methodType        String?  @map("method_type")
  provider          String?
  cardholderName    String?  @map("cardholder_name")
  cardBrand         String?  @map("card_brand")
  cardLast4         String?  @map("card_last4")
  cardFingerprint   String?  @map("card_fingerprint")
  cardNumberEnc     String?  @map("card_number_enc")
  expiryMonth       String?  @map("expiry_month")
  expiryYear        String?  @map("expiry_year")
  displayName       String?  @map("display_name")
  accountEmail      String?  @map("account_email")
  isDefault         Boolean? @default(false) @map("is_default")
  meta              Json?
  createdAt         DateTime @default(now()) @map("created_at")
  updatedAt         DateTime @updatedAt @map("updated_at")
  customer          CustomerAccount @relation(fields: [userId], references: [id])
  @@map("customer_payment_methods")
}

model UserAddress {
  id        Int      @id @default(autoincrement())
  userId    Int      @map("user_id")
  email     String?
  addressType String? @map("address_type")
  isDefault Boolean? @default(false) @map("is_default")
  address   String?
  addressLine1 String? @map("address_line1")
  landmark  String?
  city      String?
  emirate   String?
  country   String?
  postalCode String? @map("postal_code")
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")
  customer  CustomerAccount @relation(fields: [userId], references: [id])
  @@map("user_addresses")
}

model Contact {
  id        Int      @id @default(autoincrement())
  name      String
  email     String
  subject   String
  message   String
  createdAt DateTime @default(now()) @map("created_at")
  @@map("contact")
}

model SupportRequest {
  id                  Int      @id @default(autoincrement())
  name                String
  email               String
  phone               String?
  orderNumber         String?  @map("order_number")
  category            String?
  subject             String
  message             String
  attachmentFilename  String?  @map("attachment_filename")
  attachmentPath      String?  @map("attachment_path")
  attachmentMimetype  String?  @map("attachment_mimetype")
  attachmentSize      Int?     @map("attachment_size")
  preferredContact    String?  @map("preferred_contact")
  status              String   @default("open")
  ipAddress           String?  @map("ip_address")
  userAgent           String?  @map("user_agent")
  createdAt           DateTime @default(now()) @map("created_at")
  updatedAt           DateTime @updatedAt @map("updated_at")
  @@map("support_requests")
}

model Visitor {
  id         Int      @id @default(autoincrement())
  visitorKey String   @unique @map("visitor_key")
  ipAddress  String?  @map("ip_address")
  country    String?
  city       String?
  area       String?
  firstVisit DateTime? @map("first_visit")
  lastVisit  DateTime? @map("last_visit")
  visitCount Int?     @default(1) @map("visit_count")
  @@map("visitors")
}

model PageVisit {
  id        Int      @id @default(autoincrement())
  visitorKey String   @map("visitor_key")
  url       String
  method    String?
  ipAddress String?  @map("ip_address")
  userAgent String?  @map("user_agent")
  visitedAt DateTime @map("visited_at")
  @@index([visitorKey])
  @@map("page_visits")
}

model ProductCrossSell {
  id              Int     @id @default(autoincrement())
  productId       Int     @map("product_id")
  relatedProductId Int    @map("related_product_id")
  score           Float?
  product         Product @relation("CrossSellSource", fields: [productId], references: [id])
  @@map("product_cross_sells")
}

model ProductFBT {
  id              Int     @id @default(autoincrement())
  productId       Int     @map("product_id")
  relatedProductId Int    @map("related_product_id")
  score           Float?
  product         Product @relation("FBTSource", fields: [productId], references: [id])
  @@map("product_frequently_bought_together")
}
```

> **Important:** Prisma `Float` maps to MySQL `DOUBLE`. For money, prefer **`Decimal`**
> (maps to `DECIMAL(65,30)`/`DECIMAL`) to avoid floating-point drift — align with the
> legacy `NUMERIC` usage. Confirm each legacy column type before finalizing.

### 3.5 Pricing Logic (port — shared util in `backend/src/modules/checkout/pricing.ts`)

```
computePrices(variant):
  price      = variant.price
  discount   = variant.discount
  if fixed/amount: percent = discount_value / price * 100
  else if percent/percentage: percent = discount_value
  else if sale_price>0 && sale_price<price: percent = (price - sale_price)/price*100
  afterDiscount = price - (price * percent/100)
  if !variant.vat_included: final = afterDiscount + afterDiscount*vat_rate/100
  else final = afterDiscount
```

Stock label: `stock <= 0` → Out of Stock; `stock <= low_stock_threshold` → `{N}
(Limited Stock!)`; else `{N} available`.

### 3.6 Stock Integrity

- All stock mutations use **conditional decrement**: `UPDATE product_variants SET stock =
  stock - ? WHERE id = ? AND stock >= ?` → affectedRows 0 ⇒ throw `INSUFFICIENT_STOCK`.
- COD: decrement inside the order transaction.
- Card: decrement in the webhook `payment_intent.succeeded` handler (idempotent: guard by
  payment status; if already `paid`, skip).
- Cart add/update: `SELECT ... FOR UPDATE` on the variant row (via a transaction).

### 3.7 Auth Design (JWT + HttpOnly cookies)

**Tokens**
- `accessToken` — short-lived (e.g. 15 min), provided on every API call (Authorization
  header `Bearer` OR cookie).
- `refreshToken` — 30-day, stored in HttpOnly `SameSite=Lax` cookie on `/api/auth/refresh`.
- `session_version`/`sessionVersion` on account checked at each protected request.

**Endpoints**
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/auth/customer/sign-in` | customer login (issues tokens) |
| POST | `/api/auth/customer/sign-up` | register → send OTP |
| POST | `/api/auth/customer/verify-otp` | confirm OTP → issue tokens |
| POST | `/api/auth/customer/resend-otp` | resend OTP |
| POST | `/api/auth/admin/sign-in` | admin login → send OTP |
| POST | `/api/auth/admin/verify-otp` | admin OTP → issue admin tokens |
| POST | `/api/auth/refresh` | rotate tokens |
| POST | `/api/auth/logout` | revoke/invalidate session (bump version) |
| GET  | `/api/auth/me` | current user/admin + role |
| GET/POST | `/api/auth/google/*` | Google OAuth |

**Role guards (backend middleware)** — port from legacy:
`requireAuth`, `requireAdmin`, `requireSuperOrMaster`, `requireAdminManager`,
`requireUserManager`, `isMasterAdmin`.

### 3.8 CSRF, Rate Limits, Helmet (port)

- Helmet with the same CSP directives as legacy `server.js` (update origins as needed).
- CSRF on all mutation routes except `/api*` and `/webhooks*`.
- Rate-limit matrix from SRS §4.1.

### 3.9 Uploads

- Product media → `backend/uploads/products` (60MB × 150 files, image+video).
- Admin/avatar images → 2MB, images only.
- Category images → `uploads/categories`.
- Support attachments → `uploads/support`.
- Serve uploads via a dedicated static route with size/MIME checks; keep legacy
  `toPublicUrl`/random-filename conventions.

---

## 4. Frontend Design (Next.js App Router)

### 4.1 Route Groups

```
app/
├── (storefront)/
│   ├── page.tsx                  # homepage
│   ├── shop/...                  # list, group, subgroup, product
│   ├── product/[...]/            # product detail
│   ├── search/                   # universal search
│   ├── categories/               # category menu
│   ├── support-and-help/...      # legal + support static pages
│   └── sitemap.ts
├── (auth)/
│   ├── sign-in/ sign-up/ verify-otp/ forgot-password/ reset-password/ google/callback
├── (account)/                    # requires customer auth
│   ├── profile/ orders/ addresses/ payment-methods/ billing/ security/ transaction-history
├── (cart)/
│   ├── cart/ wishlist/
├── checkout/...
└── (admin)/                      # requires admin auth (segment layout guard)
    ├── dashboard/ products/ categories/ orders/ customers/ admins/
    ├── billing/ transaction-history/ visitors/ settings/ profile/
```

### 4.2 Data Fetching Strategy
- **SSR** for storefront pages needing freshness + SEO (shop list, product detail).
- **ISR / revalidate** where acceptable (categories, static CMS/law pages).
- **Client fetching** (SWR/React Query or plain fetch) for cart, wishlist, checkout,
  account, and admin dashboards.
- Central **API client** (`lib/api.ts`) reads `NEXT_PUBLIC_API_URL`, attaches credentials
  (`credentials: 'include'` for cookie-based auth), unwraps the backend `{success}` envelope,
  and throws typed errors.

### 4.3 Auth on the Frontend
- Middleware / layout guards read the JWT cookie to gate `(account)` and `(admin)` groups.
- `lib/auth.ts` calls `GET /api/auth/me` to hydrate `user`/`admin` context; store in a
  context provider + `res.locals`-style server component helper.

### 4.4 Realtime
- `socket.io-client` connected to the backend; join namespace by role (customer/admim) with
  JWT auth; subscribe to `cartUpdated`, `wishlistUpdated`, `orderTrackingUpdated`,
  `recentProducts*`, `page_visit`, etc.

---

## 5. API Contract Conventions

- Base URL: `{NEXT_PUBLIC_API_URL}/api` (frontend), served by backend under `/api`.
- Response envelope: `{ success: boolean, data?, message?, error_code? }`.
- Errors: consistent `error_code` + HTTP status.
- Pagination: `{ page, limit, total, totalPages, items }` (align with legacy semantics).
- Auth: cookie + optional `Authorization: Bearer`.
- This contract is the **parity checkpoint** against SRS FRs.

---

## 6. Stipe Webhook Design

| Event | Handler |
|-------|---------|
| `checkout.session.completed` | record session/payment-intent IDs into `order_payments.gateway_response` (no stock change) |
| `payment_intent.succeeded` | idempotently mark paid; decrement stock via `order_items`; set `order_status=confirmed` |
| `payment_intent.payment_failed` | mark failed; `order_status=payment_failed` |

- Register route with `express.raw({ type: 'application/json' })`, exclude body-parser and CSRF.
- Verify signature with `stripe.webhooks.constructEvent`.
- Idempotency: guard by payment record status before mutating.

---

## 7. Environment / Config

`backend/.env.example`:
```
PORT=4001
DATABASE_URL="mysql://user:pass@localhost:3306/jood"
JWT_ACCESS_SECRET=...
JWT_REFRESH_SECRET=...
ACCESS_TOKEN_TTL=15m
REFRESH_TOKEN_TTL=30d
STRIPE_SECRET_KEY=...
STRIPE_WEBHOOK_SECRET=...
APP_URL=http://localhost:4001
FRONTEND_URL=http://localhost:3000
SMTP_HOST=... SMTP_PORT=587 SMTP_USER=... SMTP_PASS=... FROM_EMAIL=...
GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... GOOGLE_CALLBACK_URL=...
CARD_ENCRYPTION_KEY=...
```

`frontend/.env.example`:
```
NEXT_PUBLIC_API_URL=http://localhost:4001/api
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=...
```

> Legacy `.env` is for the legacy app only. New apps use `.env.example` and never commit
> real secrets. Do NOT reuse legacy secret values for the new system.

---

## 8. Testing & Verification

- Backend unit: Jest for pricing, auth (move to module test), validation.
- Integration: supertest against in-memory/MySQL test DB.
- Frontend: component/`@testing-library` minimal; manual parity walk of FR checklist.
- Parity verification: run legacy + new side-by-side, compare outputs for same inputs.

---

*Next:* `docs/04-Implementation-Plan.md` (milestone-wise steps).
