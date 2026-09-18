"use strict";

const express = require("express");
const router = express.Router();

const visitorController =
  require("../../../controllers/a/dashboard/visitor.controller");

/**
 * DASHBOARD PAGE
 */
router.get("/", visitorController.dashboardPage);

/**
 * VISITOR LIST API
 */
router.get("/api/visitors", visitorController.getVisitors);

/**
 * VISITOR CHART API
 */
router.get("/api/visitors/chart", visitorController.getVisitorChart);

/**
 * VISITOR DETAILS
 */
router.get(
  "/visitors/:visitorKey/visits",
  visitorController.getVisitorDetails
);

module.exports = router;