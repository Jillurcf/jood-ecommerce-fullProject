import { Router } from "express";
import { requireAuth } from "../auth/middleware.js";
import * as ctrl from "./account.controller.js";
const router = Router();
router.use(requireAuth);
router.get("/profile", ctrl.getProfile);
router.put("/profile", ctrl.updateProfile);
router.get("/orders", ctrl.getOrders);
router.get("/orders/:orderNumber", ctrl.getOrderDetail);
router.get("/addresses", ctrl.getAddresses);
router.post("/addresses", ctrl.createAddress);
router.put("/addresses/:id", ctrl.updateAddress);
router.delete("/addresses/:id", ctrl.deleteAddress);
router.post("/addresses/:id/default", ctrl.setDefaultAddress);
router.get("/payment-methods", ctrl.getPaymentMethods);
router.delete("/payment-methods/:id", ctrl.deletePaymentMethod);
router.get("/billing", ctrl.getBilling);
router.get("/transaction-history", ctrl.getTransactionHistory);
router.get("/transaction-history/summary", ctrl.getTransactionSummary);
router.post("/security/update-email", ctrl.requestEmailChange);
router.post("/security/update-email/resend-otp", ctrl.resendEmailOtp);
router.post("/security/update-email/verify", ctrl.verifyEmailChange);
router.post("/security/update-password", ctrl.updatePassword);
var account_routes_default = router;
export {
  account_routes_default as default
};
