import { Router } from "express";
import * as ctrl from "./auth.controller.js";
import { requireAuth, requireAdmin } from "./middleware.js";
import { loginLimiter, authLimiter } from "./rate-limits.js";
const router = Router();
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
router.post("/customer/sign-up", authLimiter, asyncHandler(ctrl.customerSignUp));
router.post("/customer/verify-otp", authLimiter, asyncHandler(ctrl.customerVerifyOtp));
router.post("/customer/resend-otp", authLimiter, asyncHandler(ctrl.customerResendOtp));
router.get("/customer/verify-email", asyncHandler(ctrl.customerVerifyEmail));
router.post("/customer/resend-verification", authLimiter, asyncHandler(ctrl.customerResendVerification));
router.post("/customer/forgot-password", authLimiter, asyncHandler(ctrl.customerForgotPassword));
router.get("/customer/reset-password", asyncHandler(ctrl.customerGetResetPassword));
router.post("/customer/reset-password", authLimiter, asyncHandler(ctrl.customerPostResetPassword));
router.post("/customer/sign-in", loginLimiter, asyncHandler(ctrl.customerSignIn));
router.get("/customer/google", asyncHandler(ctrl.googleSignIn));
router.get("/customer/google/callback", asyncHandler(ctrl.googleCallback));
router.get("/customer/google/logout", requireAuth, asyncHandler(ctrl.googleLogout));
router.post("/customer/logout", requireAuth, asyncHandler(ctrl.customerLogout));
router.post("/admin/sign-in", loginLimiter, asyncHandler(ctrl.adminSignIn));
router.post("/admin/verify-otp", authLimiter, asyncHandler(ctrl.adminVerifyOtp));
router.post("/admin/resend-otp", authLimiter, asyncHandler(ctrl.adminResendOtp));
router.post("/admin/forgot-password", authLimiter, asyncHandler(ctrl.adminForgotPassword));
router.post("/admin/verify-recovery-otp", authLimiter, asyncHandler(ctrl.adminVerifyRecoveryOtp));
router.post("/admin/resend-recovery-otp", authLimiter, asyncHandler(ctrl.adminResendRecoveryOtp));
router.get("/admin/reset-password", asyncHandler(ctrl.adminGetResetPassword));
router.post("/admin/reset-password", authLimiter, asyncHandler(ctrl.adminResetPassword));
router.post("/admin/logout", requireAdmin, asyncHandler(ctrl.adminLogout));
router.post("/refresh", asyncHandler(ctrl.refresh));
router.get("/me", requireAuth, asyncHandler(ctrl.me));
var auth_routes_default = router;
export {
  auth_routes_default as default
};
