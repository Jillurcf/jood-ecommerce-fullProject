"use strict";

const express = require("express");
const router = express.Router();

const addAdminController = require("../../../controllers/a/profile/add-admin.controller");

/* =========================================================
   AUTH / ROLE GUARDS
========================================================= */

function wantsJson(req) {
  return (
    req.xhr ||
    String(req.headers?.accept || "").includes("application/json") ||
    String(req.headers?.["x-requested-with"] || "") === "XMLHttpRequest"
  );
}

/**
 * ADMIN AUTH GUARD
 * Accepts common session shapes safely.
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
    if (wantsJson(req)) {
      return res.status(401).json({
        ok: false,
        message: "Unauthorized",
      });
    }

    return res.redirect("/admin/a/sign/in");
  }

  return next();
}

/**
 * Role guard for page access and listing.
 * Only super admin and master admin are allowed.
 */
function requireSuperOrMaster(req, res, next) {
  const role = req.session?.admin?.role || req.session?.adminRole || "";

  if (role !== "super_admin" && role !== "master_admin") {
    if (wantsJson(req)) {
      return res.status(403).json({
        ok: false,
        message: "Forbidden",
      });
    }

    return res.status(403).send("Forbidden");
  }

  return next();
}

/* =========================================================
   ADD ADMIN ROUTES
========================================================= */

/**
 * GET add admin page
 */
router.get(
  "/",
  requireAdmin,
  requireSuperOrMaster,
  addAdminController.getAddAdminPage
);

/**
 * POST create admin
 * Step 1:
 * - validate target email
 * - send OTP to the target email
 */
router.post(
  "/create",
  requireAdmin,
  requireSuperOrMaster,
  addAdminController.requestCreateAdmin
);

/**
 * POST verify OTP
 * Handles:
 * - target email OTP step
 * - approval OTP step
 *
 * The controller decides which step is active and returns offcanvas-friendly
 * flags such as showSecondOffcanvas / nextStep.
 */
router.post(
  "/verify-otp",
  requireAdmin,
  addAdminController.verifyCreateAdminOtp
);

/**
 * POST resend OTP
 * Resends:
 * - target email OTP
 * - approval OTP
 */
router.post(
  "/resend-otp",
  requireAdmin,
  addAdminController.resendCreateAdminOtp
);

/**
 * GET admin overview/list
 */
router.get(
  "/overview",
  requireAdmin,
  requireSuperOrMaster,
  addAdminController.getAdminOverview
);

/**
 * GET single admin by ID
 * Keep this AFTER "/overview" so Express does not treat "overview" as :id.
 */
router.get(
  "/:id",
  requireAdmin,
  requireSuperOrMaster,
  addAdminController.getAdminById
);

/**
 * POST cancel pending creation
 */
router.post(
  "/cancel-pending",
  requireAdmin,
  addAdminController.cancelPendingCreateAdmin
);

module.exports = router;