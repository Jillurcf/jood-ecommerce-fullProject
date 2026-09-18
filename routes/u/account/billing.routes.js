"use strict";

const express = require("express");
const router = express.Router();

const billingController = require("../../../controllers/u/account/billing.controller");

/**
 * =========================
 * AUTH MIDDLEWARE (IMPROVED)
 * =========================
 */
function requireCustomer(req, res, next) {
  const userId =
    req.session?.user?.id ||
    req.session?.userId ||
    req.user?.id;

  if (!userId) {
    const isApi =
      req.xhr || req.headers.accept?.includes("application/json");

    if (isApi) {
      return res.status(401).json({
        ok: false,
        error: "AUTH_REQUIRED",
        message: "Please login to continue",
      });
    }

    return res.redirect("/customer/sign/in");
  }

  next();
}

/**
 * =========================
 * STEP-UP MIDDLEWARE
 * =========================
 */
function requireStepUp(req, res, next) {
  if (!billingController.requireStepUpSession(req)) {
    const isApi =
      req.xhr || req.headers.accept?.includes("application/json");

    if (isApi) {
      return res.status(403).json({
        ok: false,
        error: "STEP_UP_REQUIRED",
        message: "OTP verification required",
      });
    }

    return res.redirect("/customer/u/account/billing");
  }

  next();
}

// Apply auth globally
router.use(requireCustomer);

/**
 * =========================
 * BILLING PAGE
 * =========================
 */
router.get("/", billingController.getBillingPage);
router.get("/view", billingController.getBillingPage);

/**
 * =========================
 * DATA API
 * =========================
 */
router.get("/data", billingController.getBillingData);

/**
 * =========================
 * OTP FLOW
 * =========================
 */
router.post("/otp/request", billingController.requestOtp);
router.post("/otp/verify", billingController.verifyOtp);

/**
 * =========================
 * UPDATE BILLING (SECURED)
 * =========================
 */

// ✅ SAFE for HTML forms
router.post("/update", requireStepUp, billingController.updateBillingData);

// ✅ API / AJAX
router.put("/", requireStepUp, billingController.updateBillingData);
router.patch("/", requireStepUp, billingController.updateBillingData);

/**
 * =========================
 * OPTIONAL FUTURE ROUTES
 * =========================
 */
// router.get("/summary", billingController.getPaymentSummary);
// router.get("/orders", billingController.getOrderHistory);

module.exports = router;