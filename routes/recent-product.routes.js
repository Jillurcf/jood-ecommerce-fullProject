const express = require("express");
const rateLimit = require("express-rate-limit");
const { query, validationResult } = require("express-validator");
const recentController = require("../controllers/recent-product.controller");
const wishlistController = require("../controllers/u/wishlist.controller");

const router = express.Router();

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many requests, please try again later." },
});

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

const cacheControl = (req, res, next) => {
  res.setHeader(
    "Cache-Control",
    "public, max-age=60, s-maxage=60, stale-while-revalidate=30"
  );
  next();
};

const validateQuery = [
  query("limit")
    .optional()
    .isInt({ min: 1, max: 12 })
    .toInt()
    .withMessage("limit must be an integer between 1 and 12"),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ success: false, errors: errors.array() });
    next();
  },
];

router.get(
  "/api",
  apiLimiter,
  originAllow,
  cacheControl,
  validateQuery,
  asyncHandler(async (req, res) => {
    const recentData = await recentController.getRecentProductsAPI(req, res, true);

    if (!recentData?.success || !Array.isArray(recentData.data)) {
      return res.json({ success: false, data: [] });
    }

    const wishlistIdsRaw = await wishlistController.getWishlistIds(req);
    const wishlistIds = wishlistIdsRaw.map(String);

    const dataWithFav = recentData.data.map((p) => ({
      ...p,
      is_fav: wishlistIds.includes(String(p.id)),
    }));

    res.json({ success: true, data: dataWithFav });
  })
);

router.get("/realtime", originAllow, (req, res) => {
  res.json({ success: true, message: "Subscribe to 'recentProductsUpdated' via Socket.IO" });
});

module.exports = router;