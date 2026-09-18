import { Router } from "express";
import { requireAuth } from "../auth/middleware.js";
import * as ctrl from "./checkout.controller.js";
const router = Router();
router.use(requireAuth);
router.get("/data", ctrl.getCheckoutData);
router.get("/summary", ctrl.getCheckoutData);
router.get("/model", ctrl.getCheckoutData);
router.post("/", ctrl.placeOrder);
router.post("/place", ctrl.placeOrder);
router.post("/create-payment-session", ctrl.createPaymentSession);
router.get("/success/:orderNumber", ctrl.getOrderSuccess);
router.get("/success-page/:orderNumber", ctrl.getOrderSuccess);
router.get("/track/:orderNumber", ctrl.getOrderTracking);
router.get("/saved-payment-methods", ctrl.getSavedPaymentMethods);
router.get("/saved-addresses", ctrl.getSavedAddresses);
var checkout_routes_default = router;
export {
  checkout_routes_default as default
};
