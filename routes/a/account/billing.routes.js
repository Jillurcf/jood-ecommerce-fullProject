"use strict";

const express = require("express");
const router = express.Router();

const billingController = require("../../../controllers/a/account/billing.controller");
const adminController = require("../../../controllers/a/sign/sign.controller");

router.use(adminController.ensureAuth);

/**
 * =====================================================
 * BILLING HOME
 * =====================================================
 */
router.get("/", billingController.getAdminBillingPage);

/**
 * =====================================================
 * BILLING DATA / LIVE SEARCH / FILTERS
 * =====================================================
 */
router.get("/data", billingController.getAdminBillingData);

router.get(
  "/realtime",
  billingController.getAdminBillingRealtimeData
);

router.get(
  "/summary",
  billingController.getAdminBillingSummary
);

/**
 * =====================================================
 * BILLING CHARTS
 * =====================================================
 */
router.get(
  "/chart",
  billingController.getAdminBillingChartData
);

/**
 * =====================================================
 * BILLING DETAIL
 * =====================================================
 */
router.get(
  "/detail/:id",
  billingController.getAdminBillingDetail
);

/**
 * =====================================================
 * EXPORT
 * =====================================================
 */
router.get(
  "/export/pdf",
  billingController.exportAdminBillingPdf
);

/**
 * =====================================================
 * OPTIONAL MODULES
 * =====================================================
 */
// router.use("/visitors", require("./dashboard/visitor.routes"));

module.exports = router;