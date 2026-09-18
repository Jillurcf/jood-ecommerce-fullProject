import { Router } from "express";
import express from "express";
import { handleStripeWebhook } from "./webhook.controller.js";
const router = Router();
router.post(
  "/stripe",
  express.raw({ type: "application/json", limit: "10kb" }),
  handleStripeWebhook
);
var webhook_routes_default = router;
export {
  webhook_routes_default as default
};
