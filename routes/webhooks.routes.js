"use strict";

const express = require("express");
const router = express.Router();
const stripeWebhookController = require("../controllers/stripeWebhook.controller");

router.post(
  "/stripe",
  express.raw({ type: "application/json", limit: "10kb" }),
  stripeWebhookController.handleStripeWebhook
);

module.exports = router;
