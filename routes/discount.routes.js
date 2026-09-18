/*
 * discount-product.routes.js
 * FINAL VERSION (OPTIMIZED)
 */

const express = require("express");
const rateLimit = require("express-rate-limit");
const { query, validationResult } = require("express-validator");

const discountController = require("../controllers/discount.controller");

const router = express.Router();

// ---------- ASYNC HANDLER ----------
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// ---------- RATE LIMIT ----------
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 min
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests, please try again later.",
  },
});

// ---------- CORS ----------
const originAllow = (req, res, next) => {
  const allowedOrigin = process.env.FRONTEND_URL || "";
  const origin = req.get("origin");

  res.setHeader("Vary", "Origin");

  if (!origin || (allowedOrigin && origin === allowedOrigin)) {
    if (allowedOrigin) {
      res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    }
    return next();
  }

  return res.status(403).json({
    success: false,
    message: "Forbidden origin",
  });
};

// ---------- CACHE ----------
const cacheControl = (req, res, next) => {
  res.setHeader(
    "Cache-Control",
    "public, max-age=60, s-maxage=60, stale-while-revalidate=30"
  );
  next();
};

// ---------- VALIDATION ----------
const validateQuery = [
  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .toInt()
    .withMessage("limit must be between 1 and 100"),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }
    next();
  },
];

// ======================================================
// 🚀 MAIN DISCOUNT API
// ======================================================
router.get(
  "/api",
  apiLimiter,
  originAllow,
  cacheControl,
  validateQuery,
  asyncHandler(async (req, res) => {
    const result = await discountController.getDiscountProductsAPI(
      req,
      null,
      true
    );

    if (!result?.success || !result.data) {
      return res.json({
        success: false,
        data: {
          carousel: [],
          banners: [],
          top2: [],
          grid3: [],
        },
      });
    }

    // Optional limit override (for carousel only)
    let { carousel, banners, top2, grid3 } = result.data;

    if (req.query.limit) {
      carousel = (carousel || []).slice(0, req.query.limit);
    }

    return res.json({
      success: true,
      data: {
        carousel: carousel || [],
        banners: banners || [],
        top2: top2 || [],
        grid3: grid3 || [],
      },
    });
  })
);

// ======================================================
// 🔌 REALTIME INFO
// ======================================================
router.get(
  "/realtime",
  originAllow,
  (req, res) => {
    res.json({
      success: true,
      message: "Subscribe to 'discountProductsUpdated' via Socket.IO",
      event: "discountProductsUpdated",
    });
  }
);

// ======================================================
// 🔌 MANUAL SOCKET TRIGGER (ADMIN / DEBUG)
// ======================================================
router.get(
  "/realtime/emit",
  originAllow,
  asyncHandler(async (req, res) => {
    if (!req.app?.io) {
      return res.status(500).json({
        success: false,
        message: "Socket.IO not initialized",
      });
    }

    await discountController.emitDiscountUpdate(req.app.io);

    res.json({
      success: true,
      message: "Discount update emitted successfully",
    });
  })
);

// ======================================================
// ❌ GLOBAL ERROR HANDLER (OPTIONAL)
// ======================================================
router.use((err, req, res, next) => {
  console.error("Route Error:", err);

  res.status(500).json({
    success: false,
    message: "Internal server error",
  });
});

// ---------- EXPORT ----------
module.exports = router;