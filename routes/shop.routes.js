"use strict";

/**
 * routes/shop.routes.js
 *
 * Mount at:
 *   /customer/shop
 *
 * Pages:
 *   /customer/shop
 *   /customer/shop/group/:groupSlug
 *   /customer/shop/group/id/:groupId
 *   /customer/shop/subgroup/:subgroupSlug
 *   /customer/shop/subgroup/id/:subgroupId
 *   /customer/shop/product/:productSlug
 *   /customer/shop/product/id/:productId
 *
 * APIs:
 *   /customer/shop/api
 *   /customer/shop/grouped
 *   /customer/shop/api/group/:groupSlug
 *   /customer/shop/api/group/id/:groupId
 *   /customer/shop/api/subgroup/:subgroupSlug
 *   /customer/shop/api/subgroup/id/:subgroupId
 *   /customer/shop/api/product/:productSlug
 *   /customer/shop/api/product/id/:productId
 *   /customer/shop/api/filters
 *   /customer/shop/api/filters/group/:groupSlug
 *   /customer/shop/api/filters/group/id/:groupId
 *   /customer/shop/api/filters/subgroup/:subgroupSlug
 *   /customer/shop/api/filters/subgroup/id/:subgroupId
 *   /customer/shop/api/filters/product/:productSlug
 *   /customer/shop/api/filters/product/id/:productId
 */

const express = require("express");
const rateLimit = require("express-rate-limit");
const { query, validationResult } = require("express-validator");

const shopController = require("../controllers/shop.controller");

const router = express.Router();

/* ========================================================================== */
/* Helpers                                                                    */
/* ========================================================================== */

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

function sendJson(res, payload, statusCode = 200) {
  return res.status(statusCode).json(payload);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (m) => {
    switch (m) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      case "'": return "&#39;";
      default: return m;
    }
  });
}

function normalizePageType(type) {
  return ["shop", "group", "subgroup", "product"].includes(type) ? type : "shop";
}

function buildScopeFromRequest(req, pageType) {
  const type = normalizePageType(pageType);
  return {
    type,
    params: { ...(req?.params || {}) },
    query: { ...(req?.query || {}) },
  };
}

function hasDynamicFilters(query = {}) {
  return Boolean(
    query.search ||
    query.q ||
    query.price_min !== undefined ||
    query.price_max !== undefined ||
    query.weight_min !== undefined ||
    query.weight_max !== undefined ||
    query.brand ||
    query.brands ||
    query.model ||
    query.models ||
    query.condition ||
    query.conditions ||
    query.rating ||
    query.ratings ||
    query.attributes ||
    query.attribute_filters ||
    query.attr_color ||
    query.attr_size ||
    query.colors ||
    query.color
  );
}

function normalizeList(val) {
  if (val === undefined || val === null || val === "") return [];
  if (Array.isArray(val)) return val.map((v) => String(v).trim()).filter(Boolean);
  return String(val).split(",").map((v) => String(v).trim()).filter(Boolean);
}

async function getSmartPayload(req) {
  if (shopController && typeof shopController.getSmartShopAPI === "function") {
    return shopController.getSmartShopAPI(req, null, true);
  }
  return { success: false, data: [], cards: [], filters: {}, pagination: { page: 1, limit: 24, total: 0, total_pages: 1 } };
}

async function getFilterPayload(req) {
  const payload = await getSmartPayload(req);
  return {
    success: Boolean(payload?.success),
    scope: payload?.scope || null,
    filters: payload?.filters || {
      parent_categories: [],
      categories: [],
      brands: [],
      models: [],
      ratings: [],
      conditions: [],
      attributes: [],
      price_range: { min: 0, max: 0 },
      base_price_range: { min: 0, max: 0 },
      selected: {},
    },
  };
}

function buildRouteParams(req) {
  return {
    ...(req?.params || {}),
    ...(req?.query || {}),
  };
}

/* ========================================================================== */
/* Rate limiting                                                              */
/* ========================================================================== */

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests, please try again later.",
  },
});

/* ========================================================================== */
/* Origin allow-list / CORS                                                   */
/* ========================================================================== */

const originAllow = (req, res, next) => {
  const raw = process.env.FRONTEND_URLS || process.env.FRONTEND_URL || "";
  const allowedOrigins = raw.split(",").map((s) => s.trim()).filter(Boolean);
  const origin = req.get("origin");

  res.setHeader("Vary", "Origin");

  if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
    if (origin && allowedOrigins.length) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Guest-Token, X-CSRF-Token");
      res.setHeader("Access-Control-Allow-Credentials", "true");
    }

    if (req.method === "OPTIONS") return res.sendStatus(204);
    return next();
  }

  return sendJson(res, { success: false, message: "Forbidden origin" }, 403);
};

/* ========================================================================== */
/* Cache control                                                              */
/* ========================================================================== */

const cacheControl = (req, res, next) => {
  if (hasDynamicFilters(req.query || {})) {
    res.setHeader("Cache-Control", "no-store");
  } else {
    res.setHeader("Cache-Control", "public, max-age=60, s-maxage=60, stale-while-revalidate=30");
  }
  next();
};

/* ========================================================================== */
/* Validation                                                                 */
/* ========================================================================== */

const validateQuery = [
  query("limit")
    .optional()
    .isInt({ min: 1, max: 1000 })
    .toInt()
    .withMessage("limit must be an integer between 1 and 1000"),

  query("page")
    .optional()
    .isInt({ min: 1, max: 1000000 })
    .toInt()
    .withMessage("page must be a positive integer"),

  query("sort")
    .optional()
    .isString()
    .trim()
    .isIn([
      "latest",
      "oldest",
      "price_asc",
      "price_desc",
      "name_asc",
      "name_desc",
      "rating_asc",
      "rating_desc",
    ])
    .withMessage("sort must be one of latest, oldest, price_asc, price_desc, name_asc, name_desc, rating_asc, rating_desc"),

  query("in_stock_only")
    .optional()
    .isBoolean()
    .toBoolean()
    .withMessage("in_stock_only must be a boolean"),

  query("price_min")
    .optional()
    .isFloat({ min: 0 })
    .toFloat()
    .withMessage("price_min must be a number >= 0"),

  query("price_max")
    .optional()
    .isFloat({ min: 0 })
    .toFloat()
    .withMessage("price_max must be a number >= 0"),

  query("weight_min")
    .optional()
    .isFloat({ min: 0 })
    .toFloat()
    .withMessage("weight_min must be a number >= 0"),

  query("weight_max")
    .optional()
    .isFloat({ min: 0 })
    .toFloat()
    .withMessage("weight_max must be a number >= 0"),

  query("search").optional().isString().trim(),
  query("q").optional().isString().trim(),

  query("brand").optional(),
  query("brands").optional(),
  query("model").optional(),
  query("models").optional(),
  query("condition").optional(),
  query("conditions").optional(),
  query("rating").optional(),
  query("ratings").optional(),
  query("attributes").optional(),
  query("attribute_filters").optional(),
  query("color").optional(),
  query("colors").optional(),
  query("attr_color").optional(),
  query("attr_size").optional(),

  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendJson(res, { success: false, errors: errors.array() }, 400);
    }
    next();
  },
];

/* ========================================================================== */
/* Page renderer                                                              */
/* ========================================================================== */

function renderShopPage(pageType) {
  return (req, res) => {
    const safeType = normalizePageType(pageType);
    const titleMap = {
      shop: "Shop",
      group: "Group",
      subgroup: "Subgroup",
      product: "Product",
    };

    return res.render("customer/shop", {
      pageType: safeType,
      pageTitle: titleMap[safeType] || "Shop",
      scope: buildScopeFromRequest(req, safeType),
      initialScopeType: safeType,
      initialParams: { ...(req.params || {}) },
      initialQuery: { ...(req.query || {}) },
    });
  };
}

/* ========================================================================== */
/* Debug HTML preview                                                         */
/* ========================================================================== */

function renderGroupedHtml(payload) {
  const groups = Array.isArray(payload?.data) ? payload.data : [];
  const selected = payload?.filters?.selected || {};
  const attributes = Array.isArray(payload?.filters?.attributes) ? payload.filters.attributes : [];
  const parentCategories = Array.isArray(payload?.filters?.parent_categories) ? payload.filters.parent_categories : [];
  const categories = Array.isArray(payload?.filters?.categories) ? payload.filters.categories : [];
  const brands = Array.isArray(payload?.filters?.brands) ? payload.filters.brands : [];
  const models = Array.isArray(payload?.filters?.models) ? payload.filters.models : [];
  const ratings = Array.isArray(payload?.filters?.ratings) ? payload.filters.ratings : [];
  const conditions = Array.isArray(payload?.filters?.conditions) ? payload.filters.conditions : [];

  let html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Shop Preview</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 20px; background: #f6f8fb; color: #1e293b; }
    h1 { margin-bottom: 20px; }
    h2 { margin: 22px 0 10px; }
    .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 12px; margin-bottom: 10px; }
    .meta { color: #64748b; font-size: 13px; margin-top: 4px; }
    .price { font-weight: 700; margin-top: 8px; }
    .muted { color: #64748b; }
    .filter-box { background:#fff; border:1px solid #e5e7eb; border-radius:12px; padding:12px; margin:12px 0 20px; }
    .filter-group { margin-bottom: 14px; }
    .filter-group h3 { margin: 0 0 8px; font-size: 16px; }
    .filter-pill { display:inline-block; padding:4px 8px; border:1px solid #cbd5e1; border-radius:999px; margin:4px 6px 0 0; font-size:13px; }
    .attr-values { display:flex; flex-wrap:wrap; gap:8px; }
    .check { color: #16a34a; font-weight: 700; }
  </style>
</head>
<body>
<h1>Products</h1>`;

  html += `<div class="filter-box">
    <div class="filter-group">
      <h3>Selected Filters</h3>
      <div class="muted">Parent Category: ${escapeHtml(normalizeList(selected.parent_category_id || selected.parent_id).join(", ") || "-")}</div>
      <div class="muted">Category: ${escapeHtml(normalizeList(selected.category_id).join(", ") || "-")}</div>
      <div class="muted">Brand: ${escapeHtml(normalizeList(selected.brand || selected.brands).join(", ") || "-")}</div>
      <div class="muted">Model: ${escapeHtml(normalizeList(selected.model || selected.models).join(", ") || "-")}</div>
      <div class="muted">Condition: ${escapeHtml(normalizeList(selected.condition || selected.conditions).join(", ") || "-")}</div>
      <div class="muted">Rating: ${escapeHtml(normalizeList(selected.rating || selected.ratings).join(", ") || "-")}</div>
      <div class="muted">Price: ${escapeHtml(selected.price_min ?? "-")} - ${escapeHtml(selected.price_max ?? "-")}</div>
    </div>

    <div class="filter-group">
      <h3>Core Filters</h3>
      <div class="muted">Parent Categories:</div>
      <div class="attr-values">${parentCategories.length ? parentCategories.map((g) => `<span class="filter-pill">${escapeHtml(g.name)} (${escapeHtml(g.count ?? 0)})</span>`).join("") : `<span class="muted">-</span>`}</div>
      <div class="muted" style="margin-top:10px;">Categories:</div>
      <div class="attr-values">${categories.length ? categories.map((g) => `<span class="filter-pill">${escapeHtml(g.name)} (${escapeHtml(g.count ?? 0)})</span>`).join("") : `<span class="muted">-</span>`}</div>
      <div class="muted" style="margin-top:10px;">Brands:</div>
      <div class="attr-values">${brands.length ? brands.map((g) => `<span class="filter-pill">${escapeHtml(g.value)} (${escapeHtml(g.count ?? 0)})</span>`).join("") : `<span class="muted">-</span>`}</div>
      <div class="muted" style="margin-top:10px;">Models:</div>
      <div class="attr-values">${models.length ? models.map((g) => `<span class="filter-pill">${escapeHtml(g.value)} (${escapeHtml(g.count ?? 0)})</span>`).join("") : `<span class="muted">-</span>`}</div>
      <div class="muted" style="margin-top:10px;">Ratings:</div>
      <div class="attr-values">${ratings.length ? ratings.map((g) => `<span class="filter-pill">${escapeHtml(g.value)}★ (${escapeHtml(g.count ?? 0)})</span>`).join("") : `<span class="muted">-</span>`}</div>
      <div class="muted" style="margin-top:10px;">Conditions:</div>
      <div class="attr-values">${conditions.length ? conditions.map((g) => `<span class="filter-pill">${escapeHtml(g.value)} (${escapeHtml(g.count ?? 0)})</span>`).join("") : `<span class="muted">-</span>`}</div>
    </div>

    <div class="filter-group">
      <h3>Attribute Filters</h3>
      ${attributes.length ? attributes.map((g) => `
        <div style="margin-bottom:10px;">
          <strong>${escapeHtml(g.heading)}</strong>
          <div class="attr-values">
            ${(g.values || []).map((v) => `<span class="filter-pill"><span class="check">✓</span> ${escapeHtml(v.value)} (${escapeHtml(v.count ?? 0)})</span>`).join("")}
          </div>
        </div>
      `).join("") : `<div class="muted">No attribute filters</div>`}
    </div>
  </div>`;

  if (!groups.length) html += `<p class="muted">No products found.</p>`;

  groups.forEach((group) => {
    html += `<h2>${escapeHtml(group.heading)}</h2>`;
    (group.items || []).forEach((item) => {
      const attrs = Array.isArray(item.attributes) ? item.attributes : [];
      html += `<div class="card">
        <div><strong>${escapeHtml(item.name || "Product")}</strong></div>
        <div class="meta">
          Brand: ${escapeHtml(item.brand || "-")} |
          Model: ${escapeHtml(item.model || item.mpn || "-")} |
          Weight: ${escapeHtml(item.variant_options?.weight_display || item.variant_options?.weight || "-")} |
          Stock: ${escapeHtml(item.stock_status || "-")}
        </div>
        <div class="meta">${attrs.length ? attrs.map((a) => `${escapeHtml(a.attribute_name)}: ${escapeHtml(a.attribute_value)}`).join(" | ") : "No attributes"}</div>
        <div class="price">AED ${escapeHtml(item.final_price || "0.00")}</div>
      </div>`;
    });
  });

  html += `</body></html>`;
  return html;
}

/* ========================================================================== */
/* Page routes                                                                */
/* ========================================================================== */

router.get("/", renderShopPage("shop"));
router.get("/group/:groupSlug", renderShopPage("group"));
router.get("/group/id/:groupId", renderShopPage("group"));
router.get("/subgroup/:subgroupSlug", renderShopPage("subgroup"));
router.get("/subgroup/id/:subgroupId", renderShopPage("subgroup"));
router.get("/product/:productSlug", renderShopPage("product"));
router.get("/product/id/:productId", renderShopPage("product"));

/* ========================================================================== */
/* API routes                                                                 */
/* ========================================================================== */

router.get(
  "/api",
  apiLimiter,
  originAllow,
  cacheControl,
  validateQuery,
  asyncHandler(async (req, res) => shopController.getSmartShopAPI(req, res, false))
);

router.get(
  "/grouped",
  apiLimiter,
  originAllow,
  cacheControl,
  validateQuery,
  asyncHandler(async (req, res) => shopController.getSmartShopAPI(req, res, false))
);

router.get(
  "/api/group/:groupSlug",
  apiLimiter,
  originAllow,
  cacheControl,
  validateQuery,
  asyncHandler(async (req, res) => shopController.getGroupProductsAPI(req, res, false))
);

router.get(
  "/api/group/id/:groupId",
  apiLimiter,
  originAllow,
  cacheControl,
  validateQuery,
  asyncHandler(async (req, res) => shopController.getGroupProductsAPI(req, res, false))
);

router.get(
  "/api/subgroup/:subgroupSlug",
  apiLimiter,
  originAllow,
  cacheControl,
  validateQuery,
  asyncHandler(async (req, res) => shopController.getSubGroupProductsAPI(req, res, false))
);

router.get(
  "/api/subgroup/id/:subgroupId",
  apiLimiter,
  originAllow,
  cacheControl,
  validateQuery,
  asyncHandler(async (req, res) => shopController.getSubGroupProductsAPI(req, res, false))
);

router.get(
  "/api/product/:productSlug",
  apiLimiter,
  originAllow,
  cacheControl,
  validateQuery,
  asyncHandler(async (req, res) => shopController.getProductPageAPI(req, res, false))
);

router.get(
  "/api/product/id/:productId",
  apiLimiter,
  originAllow,
  cacheControl,
  validateQuery,
  asyncHandler(async (req, res) => shopController.getProductPageAPI(req, res, false))
);

/* ========================================================================== */
/* Filter endpoints                                                           */
/* ========================================================================== */

router.get(
  "/api/filters",
  apiLimiter,
  originAllow,
  cacheControl,
  validateQuery,
  asyncHandler(async (req, res) => sendJson(res, await getFilterPayload(req)))
);

router.get(
  "/api/filters/group/:groupSlug",
  apiLimiter,
  originAllow,
  cacheControl,
  validateQuery,
  asyncHandler(async (req, res) => sendJson(res, await getFilterPayload(req)))
);

router.get(
  "/api/filters/group/id/:groupId",
  apiLimiter,
  originAllow,
  cacheControl,
  validateQuery,
  asyncHandler(async (req, res) => sendJson(res, await getFilterPayload(req)))
);

router.get(
  "/api/filters/subgroup/:subgroupSlug",
  apiLimiter,
  originAllow,
  cacheControl,
  validateQuery,
  asyncHandler(async (req, res) => sendJson(res, await getFilterPayload(req)))
);

router.get(
  "/api/filters/subgroup/id/:subgroupId",
  apiLimiter,
  originAllow,
  cacheControl,
  validateQuery,
  asyncHandler(async (req, res) => sendJson(res, await getFilterPayload(req)))
);

router.get(
  "/api/filters/product/:productSlug",
  apiLimiter,
  originAllow,
  cacheControl,
  validateQuery,
  asyncHandler(async (req, res) => sendJson(res, await getFilterPayload(req)))
);

router.get(
  "/api/filters/product/id/:productId",
  apiLimiter,
  originAllow,
  cacheControl,
  validateQuery,
  asyncHandler(async (req, res) => sendJson(res, await getFilterPayload(req)))
);

/* ========================================================================== */
/* Debug / test endpoints                                                     */
/* ========================================================================== */

router.get(
  "/grouped-html",
  apiLimiter,
  originAllow,
  cacheControl,
  validateQuery,
  asyncHandler(async (req, res) => {
    const payload = await getSmartPayload(req);
    if (!payload?.success) return res.status(404).send("<h1>No products found</h1>");
    return res.send(renderGroupedHtml(payload));
  })
);

router.get("/realtime", originAllow, (req, res) => {
  res.json({
    success: true,
    message: "Listen for recentProductsUpdated, recentProductAdded, recentProductUpdated, and recentProductDeleted via Socket.IO.",
  });
});

/* ========================================================================== */
/* Fallback error handler                                                     */
/* ========================================================================== */

router.use((err, req, res, next) => {
  console.error("shop.routes error:", err?.stack || err?.message || err);

  if (err?.code === "EBADCSRFTOKEN") {
    return res.status(403).json({ success: false, message: "Invalid CSRF token" });
  }

  if (res.headersSent) return next(err);
  return res.status(500).json({ success: false, message: "Something went wrong" });
});

module.exports = router;
