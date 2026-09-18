"use strict";

const express = require("express");
const router = express.Router();

const accountController = require("../../controllers/u/profile.controller");

/**
 * AUTH GUARD (Customer only)
 */
function requireCustomer(req, res, next) {
  const userId = req.session?.user?.id;

  if (!userId) {
    // Avoid redirect loops + make API-safe
    if (req.xhr || req.headers.accept?.includes("application/json")) {
      return res.status(401).json({
        ok: false,
        message: "Unauthorized",
      });
    }

    return res.redirect("/customer/sign/in");
  }
console.log("SESSION USER:", req.session.user);

  next();
}

/**
 * OPTIONAL: CSRF protection middleware
 * (You must install csurf for this to work)
 *
 * const csrf = require("csurf");
 * const csrfProtection = csrf({ cookie: true });
 */

// ======================
// PROFILE ROUTES (SECURE)
// ======================

/**
 * GET PROFILE PAGE
 */
router.get(
  "/",
  requireCustomer,
  accountController.getProfilePage
);

/**
 * GET PROFILE JSON (API)
 */
router.get(
  "/me",
  requireCustomer,
  accountController.getAccount
);

/**
 * UPDATE PROFILE (SECURE)
 * - should include CSRF in production
 * - should be rate-limited (recommended)
 */
router.post(
  "/update-profile",
  requireCustomer,
  // csrfProtection, // enable in production
  accountController.updateProfile
);
module.exports = router;