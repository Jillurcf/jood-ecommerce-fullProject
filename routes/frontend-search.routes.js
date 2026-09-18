const express = require("express");
const router = express.Router();
const rateLimit = require("express-rate-limit");
const { query, validationResult } = require("express-validator");
const { getUniversalSearch } = require("../controllers/frontend-search.controller");

// Rate limiter
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Too many requests. Try again later." }
});

// Validation
const validateSearch = [
  query("q").optional().isString().withMessage("Invalid search query"),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, error: errors.array()[0].msg });
    next();
  }
];

// Route
router.get("/universal", limiter, validateSearch, getUniversalSearch);

module.exports = router;
