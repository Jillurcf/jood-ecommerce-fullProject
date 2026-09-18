const express = require("express");
const rateLimit = require("express-rate-limit");
const { query, validationResult } = require("express-validator");
const frequentController = require("../controllers/frequent-products.controller");
const wishlistController = require("../controllers/u/wishlist.controller");

const router = express.Router();

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// Rate limiter: max 30 requests per minute
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many requests, please try again later." },
});

// CORS / Origin control
const originAllow = (req, res, next) => {
  const allowedOrigin = process.env.FRONTEND_URL || "";
  const origin = req.get("origin");
  res.setHeader("Vary", "Origin");

  if (!origin || (allowedOrigin && origin === allowedOrigin)) {
    if (allowedOrigin) res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    return next();
  }

  return res.status(403).json({ success: false, message: "Forbidden origin" });
};

// Cache control
const cacheControl = (req, res, next) => {
  res.setHeader(
    "Cache-Control",
    "public, max-age=60, s-maxage=60, stale-while-revalidate=30"
  );
  next();
};

// Query validation
const validateQuery = [
  query("limit")
    .optional()
    .isInt({ min: 1, max: 30 }) // frequent controller allows 1-100, here we clamp to 30
    .toInt()
    .withMessage("limit must be an integer between 1 and 30"),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ success: false, errors: errors.array() });
    next();
  },
];

// ---------- Frequent Orders API ----------
router.get(
  "/api",
  apiLimiter,
  originAllow,
  cacheControl,
  validateQuery,
  asyncHandler(async (req, res) => {
    const frequentData = await frequentController.getFrequentProductsAPI(req, res, true);

    if (!frequentData?.success || !Array.isArray(frequentData.data)) {
      return res.json({ success: false, data: [] });
    }

    const wishlistIdsRaw = await wishlistController.getWishlistIds(req);
    const wishlistIds = wishlistIdsRaw.map(String);

    const dataWithFav = frequentData.data.map((p) => ({
      ...p,
      is_fav: wishlistIds.includes(String(p.id)),
    }));

    res.json({ success: true, data: dataWithFav });
  })
);

// ---------- Real-time guidance ----------
router.get("/realtime", originAllow, (req, res) => {
  res.json({
    success: true,
    message: "Subscribe to 'frequentProductsUpdated' via Socket.IO",
  });
});

module.exports = router;