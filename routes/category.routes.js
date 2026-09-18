/**
 * ==================================================
 *  CATEGORY ROUTES
 *  Express Router — Admin Category Management
 *  Supports image upload using Multer
 * ==================================================
 */

const express = require("express");
const router = express.Router();

// ===============================
// CONTROLLERS
// ===============================
const {
  getCategories,       // GET all categories
  saveCategory,        // POST add/edit category with image
  searchCategory,      // GET search categories (AJAX)
  deleteCategory,      // DELETE a category by ID
  removeCategoryImage, // DELETE only category image
} = require("../controllers/category.controller");

// ===============================
// MIDDLEWARE
// ===============================
const uploadCategoryImage = require("../middleware/uploadsubCategoryImage");

// ===============================
// ROUTES
// ===============================

// GET: list all categories
router.get("/category", getCategories);

// POST: add or edit a category (with optional image)
router.post("/category", uploadCategoryImage.single("image"), saveCategory);

// GET: search categories (AJAX)
router.get("/category/search", searchCategory);

// DELETE: remove a category by ID
router.delete("/category/:id", deleteCategory);

// DELETE: remove only category image
router.delete("/category/remove-image/:id", removeCategoryImage);

// ===============================
// EXPORT ROUTER
// ===============================
module.exports = router;
