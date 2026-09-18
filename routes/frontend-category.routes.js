const express = require("express");
const router = express.Router();
const rateLimit = require("express-rate-limit");
const { query, validationResult } = require("express-validator");

const { getCategoryMenu } = require("../controllers/frontend-category.controller");

// ------------------------
// Rate limiter for category menu
// ------------------------
const menuLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30, // max 30 requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: "<p>Too many requests. Please try again later.</p>",
});

// ------------------------
// Validation middleware (currently no params, placeholder for future)
// ------------------------
const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    console.warn("Validation failed for category menu:", errors.array());
    return res.status(400).send("<p>Invalid request</p>");
  }
  next();
};

// ------------------------
// GET: Fetch category menu partial
// ------------------------
router.get(
  "/menu",
  menuLimiter,
  validateRequest,
  getCategoryMenu
);

module.exports = router;
