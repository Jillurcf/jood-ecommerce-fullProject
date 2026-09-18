/**
 * routes/parent-category.routes.js
 * Modern, CSRF-aware, JSON API ready
 *
 * Features:
 *  - Full input validation with express-validator
 *  - CSRF protection support
 *  - Rate limiting
 *  - Multipart handling for images
 *  - JSON API responses & fallback render for non-AJAX
 */

const express = require("express");
const router = express.Router();
const rateLimit = require("express-rate-limit");
const { body, param, query, validationResult } = require("express-validator");
const uploadCategory = require("../middleware/multerCategory");

// Controllers
const {
  getParentCategories,
  saveParentCategory,
  searchParentCategory,
  deleteParentCategory,
  removeParentCategoryImage,
} = require("../controllers/parent-category.controller");

// ------------------------
// Router-level rate limiter
// ------------------------
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many requests, please try again later." },
});
router.use(limiter);

// ------------------------
// Helper: Validation error handler
// ------------------------
const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorMsg = errors.array().map(e => e.msg).join(", ");
    if (req.xhr || (req.headers.accept && req.headers.accept.includes("json"))) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }
    return res.status(400).render("admin/parent-category", {
      categories: [],
      error: errorMsg,
      success: null,
      formData: req.body || {},
      csrfToken: req.csrfToken ? req.csrfToken() : null,
    });
  }
  next();
};

// ------------------------
// GET: List all parent categories
// ------------------------
router.get("/parent-category", getParentCategories);

// ------------------------
// GET: Live search (AJAX)
// ------------------------
router.get(
  "/parent-category/search",
  [query("q").optional().trim().escape()],
  validateRequest,
  searchParentCategory
);

// ------------------------
// POST: Add or Update Parent Category
// ------------------------
router.post(
  "/parent-category",
  uploadCategory.single("image"),
  [
    body("id").optional().toInt(),
    body("name")
      .trim()
      .isLength({ min: 2 })
      .withMessage("Category name must be at least 2 characters"),
    body("slug")
      .optional({ checkFalsy: true })
      .trim()
      .matches(/^[a-z0-9-]+$/)
      .withMessage("Slug must contain only lowercase letters, numbers, or dashes"),
    body("status")
      .optional()
      .trim()
      .isIn(["active", "inactive"])
      .withMessage("Status must be 'active' or 'inactive'"),
    body("display_order")
      .optional()
      .toInt()
      .isInt({ min: 0 })
      .withMessage("Display order must be a non-negative integer"),
  ],
  validateRequest,
  saveParentCategory
);

// ------------------------
// DELETE: Remove only category image
// ------------------------
router.delete(
  "/parent-category/:id/image",
  [param("id").isInt().withMessage("Invalid category ID").toInt()],
  validateRequest,
  removeParentCategoryImage
);

// ------------------------
// DELETE: Remove entire parent category
// ------------------------
router.delete(
  "/parent-category/:id",
  [param("id").isInt().withMessage("Invalid category ID").toInt()],
  validateRequest,
  (req, res, next) => {
    // Convert param to string safely before trim
    const id = String(req.params.id || "").trim();
    if (!id) {
      return res.status(400).json({ success: false, message: "Category ID is required" });
    }
    // Attach sanitized ID to req for controller
    req.sanitizedId = id;
    next();
  },
  deleteParentCategory
);

module.exports = router;
