// routes/variant.routes.js
const express = require("express");
const rateLimit = require("express-rate-limit");
const { query, validationResult } = require("express-validator");
const variantController = require("../controllers/variant-product.controller");
const wishlistController = require("../controllers/u/wishlist.controller");

const router = express.Router();

// Async wrapper to catch errors from async route handlers
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// -------------------- Rate limiter --------------------
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many requests, please try again later." },
});

// -------------------- CORS origin check --------------------
const originAllow = (req, res, next) => {
  const raw = process.env.FRONTEND_URLS || process.env.FRONTEND_URL || "";
  const allowedOrigins = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const origin = req.get("origin");
  res.setHeader("Vary", "Origin");

  // allow if no origin (server-to-server) or origin matches one of allowedOrigins
  if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
    if (origin && allowedOrigins.length) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.setHeader("Access-Control-Allow-Credentials", "true");
    }
    return next();
  }

  return res.status(403).json({ success: false, message: "Forbidden origin" });
};

// -------------------- Cache headers --------------------
const cacheControl = (req, res, next) => {
  // short cache for product feeds; CDN may respect s-maxage
  res.setHeader(
    "Cache-Control",
    "public, max-age=60, s-maxage=60, stale-while-revalidate=30"
  );
  next();
};

// -------------------- Query validation --------------------
const validateQuery = [
  // keep validation consistent with previous usage
  query("limit")
    .optional()
    .isInt({ min: 1, max: 200 })
    .toInt()
    .withMessage("limit must be an integer between 1 and 200"),
  query("parent_category_id")
    .optional()
    .isString()
    .withMessage("parent_category_id must be a string"),
  // in_stock_only: accepts "true"/"false" (string) or boolean; convert to boolean
  query("in_stock_only")
    .optional()
    .isBoolean()
    .toBoolean()
    .withMessage("in_stock_only must be a boolean"),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ success: false, errors: errors.array() });
    next();
  },
];

// ----------------- Routes -----------------

/**
 * GET /api/grouped
 * Returns variants grouped by parent category.
 * Controller returns an array of groups: [{ heading, parent_category_id, items: [...] }, ...]
 * This route returns an object map: { "<heading>": [items], ... } to preserve previous clients expectations.
 */
router.get(
  "/api/grouped",
  apiLimiter,
  originAllow,
  cacheControl,
  validateQuery,
  asyncHandler(async (req, res) => {
    // forward expected query params to controller
    const raw = await variantController.getRecentProductsAPI(req, null, true);

    if (!raw?.success || !Array.isArray(raw.data)) {
      return res.json({ success: false, data: {} });
    }

    // Safe wishlist retrieval (wishlistController may throw or return unexpected values)
    let wishlistIdsRaw = [];
    try {
      const wi = await wishlistController.getWishlistIds(req);
      wishlistIdsRaw = Array.isArray(wi) ? wi : [];
    } catch (e) {
      wishlistIdsRaw = [];
    }
    const wishlistIds = wishlistIdsRaw.map(String);

    // Convert grouped array into map: heading -> items[]
    const dataWithFav = {};
    for (const group of raw.data) {
      const heading = group.heading || "Uncategorized";
      const parentCatId = group.parent_category_id ?? null;
      const key = heading; // preserve old clients keyed by heading

      const items = Array.isArray(group.items) ? group.items : [];

      dataWithFav[key] = items.map((v) => ({
        ...v,
        // ensure product_id exists; fallback to variant's product_id field or product_id inside card
        is_fav: wishlistIds.includes(String(v.product_id || v.master_id || "")),
      }));
      // keep metadata if needed (optional): attach parent_category_id on the array as descriptor
      dataWithFav[key].parent_category_id = parentCatId;
    }

    return res.json({ success: true, data: dataWithFav });
  })
);

/**
 * GET /api
 * Backwards-compatible flat recent variants endpoint (array).
 * Flattens the grouped response into a single array of variant cards.
 */
router.get(
  "/api",
  apiLimiter,
  originAllow,
  cacheControl,
  validateQuery,
  asyncHandler(async (req, res) => {
    const raw = await variantController.getRecentProductsAPI(req, null, true);

    if (!raw?.success || !Array.isArray(raw.data)) {
      return res.json({ success: false, data: [] });
    }

    // flatten grouped array into one array of variant cards
    let flat = [];
    for (const g of raw.data) {
      if (Array.isArray(g.items)) flat = flat.concat(g.items);
    }

    // Safe wishlist retrieval
    let wishlistIdsRaw = [];
    try {
      const wi = await wishlistController.getWishlistIds(req);
      wishlistIdsRaw = Array.isArray(wi) ? wi : [];
    } catch (e) {
      wishlistIdsRaw = [];
    }
    const wishlistIds = wishlistIdsRaw.map(String);

    const dataWithFav = flat.map((v) => ({
      ...v,
      is_fav: wishlistIds.includes(String(v.product_id || v.master_id || "")),
    }));

    return res.json({ success: true, data: dataWithFav });
  })
);

// Realtime route: instruct clients to subscribe to Socket.IO events emitted by the controller
router.get("/realtime", originAllow, (req, res) => {
  // The controller emits 'recentProductsUpdated' (grouped feed) and granular add/update/delete events.
  res.json({
    success: true,
    message:
      "Subscribe to 'recentProductsUpdated' for grouped feed; also listen for 'recentProductAdded', 'recentProductUpdated', 'recentProductDeleted' for granular events via Socket.IO",
  });
});

module.exports = router;