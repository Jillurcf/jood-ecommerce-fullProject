# 02 — Catalog Spec
## Products, Variants, Categories, Shop Listing, Search & Product Detail

**Milestone:** M3 · **SRS:** FR-1.x, FR-2.x · **Legacy ref:** `controllers/shop.controller.js`,
`controllers/product-detail.controller.js`, `controllers/frontend-search.controller.js`,
`controllers/frontend-category.controller.js`, `controllers/variant-product.controller.js`,
`controllers/recent-product.controller.js`, `controllers/frequent-products.controller.js`

---

## 1. Domain model (parity)

### Product (master row — no price/stock on it)
`id, product_id (PROD…/PART…), name, slug, product_type ('simple'), brand, mpn, bullets,
description, short_description, parent_category_id, category_id, visibility, status
('published'), meta_keywords, meta_title, meta_description, main_image, product_videos
(JSON), display_locations (JSON), display_timing (JSON), created_at, updated_at`

### ProductVariant (purchasable SKU — pricing/stock live here)
`id, product_id, name, display_name, sku, price, sale_price, cost_price, stock,
low_stock_threshold (default 5), track_inventory, allow_backorders, discount_type
(percent|percentage|fixed|amount), discount_value, vat_rate (default 5), vat_included
(default true), barcode, barcode_type, weight, weight_unit, length, width, height,
dimension_unit, shipping_class, is_active, is_default, sort_order, created_at, updated_at`

### Related
- `variant_media` (`variant_id, filename, originalname, mimetype, size`)
- `attributes` (`name, slug, scope_type, product_id?, variant_id?`)
- `attribute_values` (`attribute_id, value, slug, sort_order`)
- `product_variant_attributes` (`variant_id, attribute_id, attribute_value_id`,
  UNIQUE variant+attribute)
- `parent_categories` (`name, slug, display_order, status, meta_title, meta_description, image`)
- `categories` (`parent_id, name, slug, description, status, image`)
- Recommended: `product_cross_sells`, `product_frequently_bought_together`
  (`product_id, related_product_id, score`)

---

## 2. Pricing & stock rules (shared util — modules/checkout/pricing)

```
computePrices(variant):
  price = variant.price
  if discount_type in (fixed, amount):        percent = discount_value / price * 100
  elif discount_type in (percent, percentage): percent = discount_value
  elif sale_price > 0 && sale_price < price:   percent = (price - sale_price) / price * 100
  else: percent = 0
  afterDiscount = price - (price * percent / 100)
  final = vat_included ? afterDiscount
                       : afterDiscount + afterDiscount * vat_rate / 100
```

Stock label:
```
stock <= 0               → "Out of Stock"
stock <= low_stock_thr   → "{N} (Limited Stock!)"
else                     → "{N} available"
```

---

## 3. Read APIs (new → legacy)

| Method | New path | Legacy | Auth |
|--------|----------|--------|------|
| GET | `/api/catalog/parent-categories` | `GET /frontend/category/menu` | public |
| GET | `/api/catalog/categories` | (menu children) | public |
| GET | `/api/catalog/menu` | `GET /frontend/category/menu` | public |
| GET | `/api/shop` | `GET /customer/shop/` + `/shop/api` | public |
| GET | `/api/shop/group/:slug` · `/group/id/:id` | `GET /customer/shop/group/:slug` | public |
| GET | `/api/shop/subgroup/:slug` · `/subgroup/id/:id` | `GET /customer/shop/subgroup/:slug` | public |
| GET | `/api/shop/product/:slug` · `/product/id/:id` | `GET /customer/shop/product/:slug` | public |
| GET | `/api/shop/filters` (+group/subgroup/product variants) | `GET /customer/shop/api/filters/*` | public |
| GET | `/api/search/universal` | `GET /search/universal?q=` | public |
| GET | `/api/catalog/product-detail/:pid/:vid` · `/:pid` | `GET /customer/product/product-details/...` | public |
| GET | `/api/catalog/variants` | `GET /customer/variant-product/api*` | public |
| GET | `/api/catalog/recent` | `GET /customer/recent-product/api` | public |
| GET | `/api/catalog/frequent` | `GET /customer/frequent-products/api` | public |

All public; cached (`Cache-Control: public, max-age=60, s-maxage=60,
stale-while-revalidate=30`); dynamic filter queries `no-store`.

---

## 4. Shop listing — filter/sort/pagination contract

**Inputs (query params):** `page, limit (1–1000, default 24), sort,
in_stock_only (default true), price_min/max, weight_min/max, search/q, brand/brands,
model/models, condition/conditions, rating/ratings, parent_category_id/parent_id,
category_id/subgroup_id, attributes/attribute_filters, color/colors, attr_<name>, size`.

**Scope resolution priority:** product > subgroup > group > shop.

**Sort values:** `latest` (default, by GREATEST(created,updated) DESC), `oldest`,
`price_asc`, `price_desc`, `name_asc`, `name_desc`, `rating_asc`, `rating_desc`.

**Response grouping:** results grouped by parent category →
`[{ heading, parent_category_id, parent_category_slug, items: [VariantCard] }]`.

**Filters inventory (parity):** two-layer — DB `WHERE` (parent_category, category,
brand, model, price, stock, text LIKE on name/brand/model/sku/slug/bullets/description/
short_description) + in-memory attribute filter (joins product_variant_attributes).

**VariantCard enrichment (non-fatal):** `is_fav` (wishlist), `in_cart_qty` (cart),
`wishlist_id = product_id` (master product, not variant).

---

## 5. Product detail payload

Return: `product, variants, selectedVariant, relatedProducts, frequentlyBoughtTogether,
customersAlsoViewed, sameModelVariants, compareItems, breadcrumbs`.

- `selectedVariant`: `is_default=true` first, else first by sort_order.
- `relatedProducts`: same category.
- `frequentlyBoughtTogether`: from `product_frequently_bought_together`, fallback
  `product_cross_sells`, fallback same category/brand.
- `customersAlsoViewed`: same category, different brand.
- `sameModelVariants`: same category + same `model_key`.
- `compareItems`: same category, excluding current.
- `model_key`: computed by stripping size/ram/color/common terms from name; used to group
  variants of the "same model".

**Limits (env-configurable, parity defaults):** variant 1000, related 12, model 12,
FBT 4, viewed 8, compare 4.

## 6. Universal search
- `parent_categories` (status=true) — limit 5, by `display_order`.
- `categories` (status=true) — limit 5, by `name`.
- `products` (status='published') — limit 10, by `name OR brand` ILIKE.
- Total capped at 10; return unified results.

## 7. Variant / recent / frequent endpoints

| Endpoint | Behavior |
|----------|----------|
| `/api/catalog/variants` | flat variant cards (recent, in-stock); optional `grouped` map by parent category |
| `/api/catalog/recent` | ordered by GREATEST(created,updated) DESC; limit default 30 max 100; `in_stock_only=true` default |
| `/api/catalog/frequent` | top by SUM(quantity) from `cart` grouped by product; pick highest-quantity variant per product; append `total_ordered_quantity` |

## 8. Realization notes (Prisma/MySQL)
- Use Prisma `include`/`select` for the composite reads; mirror legacy lateral subselects
  for variant media + attributes via Prisma relation queries.
- Performance: add indexes on `products.slug`, `product_variants.product_id`,
  `categories.parent_id`, `parent_categories.id`, and on `(stock)`.

## 9. Acceptance checklist (M3)
- [ ] Menu returns all active parent categories with children, ordered.
- [ ] Shop listing honors every filter/sort/pagination input; grouping matches legacy.
- [ ] Product detail returns all 10 sub-payload keys with parity defaults.
- [ ] Pricing util matches legacy formula for fixed, percent, and implicit sale-price.
- [ ] Search returns capped results across the three tables.
- [ ] Variant/recent/frequent match legacy ordering + limits.
- [ ] Per-card `is_fav` / `in_cart_qty` are non-fatal when identity lookup fails.
