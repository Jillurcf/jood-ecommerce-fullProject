"use strict";

const express = require("express");
const router = express.Router();
const checkoutController = require("../controllers/checkout.controller");
/* =========================================================
   AUTH MIDDLEWARE
========================================================= */

function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.redirect("/customer/sign/in");
  }
  next();
}

/* =========================================================
   CHECKOUT CORE ROUTES
========================================================= */

// Render checkout page
router.get("/", requireAuth, checkoutController.getCheckoutPage);

// Get full checkout data (AJAX refresh / SPA support)
router.get("/data", requireAuth, checkoutController.getCheckoutData);

// Place order
router.post("/", requireAuth, checkoutController.placeOrder);
router.post(
  "/create-payment-session",
  requireAuth,
  checkoutController.createPaymentSession
);

/* =========================================================
   ORDER SUCCESS / TRACKING
========================================================= */

// Order success page
router.get("/success/:order_number", requireAuth, checkoutController.getOrderSuccess);

// Order tracking (AJAX)
router.get("/track/:order_number", requireAuth, checkoutController.getOrderTrackData);

/* =========================================================
   SAVED CUSTOMER DATA (AUTOFILL)
========================================================= */

// Saved payment methods
router.get(
  "/saved-payment-methods",
  requireAuth,
  checkoutController.getSavedPaymentMethods
);

// Saved addresses
router.get(
  "/saved-addresses",
  requireAuth,
  checkoutController.getSavedAddresses
);

/* =========================================================
   ALIASES (BACKWARD COMPATIBILITY)
========================================================= */

router.get("/summary", requireAuth, checkoutController.getCheckoutSummary);
router.get("/model", requireAuth, checkoutController.getCheckoutModel);

router.post("/place", requireAuth, checkoutController.placeCheckoutOrder);

router.get(
  "/success-page/:order_number",
  requireAuth,
  checkoutController.getOrderSuccessPage
);

module.exports = router;