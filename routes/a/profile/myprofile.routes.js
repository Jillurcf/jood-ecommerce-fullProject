"use strict";

const express = require("express");
const router = express.Router();

const accountController = require("../../../controllers/a/profile/myprofile.controller");

/**
 * ADMIN AUTH GUARD
 * Accepts the most common session shapes safely.
 */
function requireAdmin(req, res, next) {
  const sessionAdmin = req.session?.admin || null;

  const adminId =
    sessionAdmin?.id ||
    req.session?.adminId ||
    sessionAdmin?.admin_id ||
    req.session?.adminAdminId ||
    null;

  if (!adminId) {
    const wantsJson =
      req.xhr ||
      String(req.headers?.accept || "").includes("application/json") ||
      String(req.headers?.["x-requested-with"] || "") === "XMLHttpRequest";

    if (wantsJson) {
      return res.status(401).json({
        ok: false,
        message: "Unauthorized",
      });
    }

    return res.redirect("/admin/a/sign/in");
  }

  // Optional debug only
  console.log("SESSION ADMIN:", req.session?.admin);

  next();
}

/**
 * OPTIONAL: CSRF protection
 * Enable only if your app is configured for it.
 *
 * const csrf = require("csurf");
 * const csrfProtection = csrf({ cookie: true });
 */

// ======================
// ADMIN PROFILE ROUTES
// ======================

/**
 * GET PROFILE PAGE
 */
router.get("/", requireAdmin, accountController.getProfilePage);

/**
 * GET PROFILE JSON
 */
router.get("/me", requireAdmin, accountController.getAccount);

/**
 * UPDATE PROFILE
 */
router.post(
  "/update-profile",
  requireAdmin,
  // csrfProtection,
  accountController.updateProfile
);

/**
 * HEARTBEAT
 */
router.post("/heartbeat", requireAdmin, accountController.heartbeat);

/**
 * SET OFFLINE
 */
router.post("/offline", requireAdmin, accountController.setOffline);

module.exports = router;