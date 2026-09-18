"use strict";

const express = require("express");
const router = express.Router();

const wishlistController = require("../../controllers/u/wishlist.controller");
const guestTokenMiddleware = require("../../middleware/guestToken.middleware");

/**
 * Auth guard for wishlist page
 */
function requireCustomer(req, res, next) {
  const userId = req.session?.user?.id || req.session?.userId || null;

  if (!userId) {
    if (req.xhr || String(req.headers.accept || "").includes("application/json")) {
      return res.status(401).json({
        ok: false,
        message: "Unauthorized",
      });
    }

    return res.redirect("/customer/sign/in");
  }

  next();
}

/**
 * Attach guest token for wishlist tracking.
 * Safe to keep even for logged-in users.
 */
router.use(guestTokenMiddleware);

/**
 * GET wishlist page
 * Redirects to login if session is missing
 */
router.get("/", requireCustomer, (req, res) => {
  try {
    return res.render("customer/u/wishlist/products", {
      user: req.session?.user || null,
      csrfToken: typeof req.csrfToken === "function" ? req.csrfToken() : null,
    });
  } catch (err) {
    console.error("Wishlist page render error:", err);
    return res.status(500).send("Failed to load wishlist page");
  }
});

/**
 * GET wishlist data
 */
router.get("/data", async (req, res, next) => {
  try {
    return await wishlistController.getWishlist(req, res);
  } catch (err) {
    next(err);
  }
});

/**
 * POST toggle wishlist item
 */
router.post("/toggle", async (req, res, next) => {
  try {
    const io = req.app.get("io") || null;
    return await wishlistController.toggleWishlist(req, res, io);
  } catch (err) {
    next(err);
  }
});

/**
 * Route error handler
 */
router.use((err, req, res, next) => {
  console.error("Wishlist Route Error:", err);

  return res.status(500).json({
    success: false,
    message: "Something went wrong",
  });
});

module.exports = router;