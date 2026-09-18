"use strict";

const express = require("express");
const router = express.Router();

const passwordController = require("../../../controllers/a/password/password.controller");

/* =========================================================
   SAFE HANDLER CHECK
========================================================= */
function requireHandler(fn, name) {
  if (typeof fn !== "function") {
    throw new Error(`password.controller is missing required export: ${name}`);
  }
  return fn;
}

/* =========================================================
   CONTROLLER METHODS
========================================================= */
const {
  getForgotPasswordPage,
  sendOtp,
  verifyOtp,
  submitOtpVerification,
  getResetPasswordPage,
  updatePassword,
  resendRecoveryOtp,
} = passwordController;

/* =========================================================
   BASE ROUTE
   app.use("/admin/a/password", router)
========================================================= */

/* =========================================================
   FORGOT PASSWORD FLOW
========================================================= */

// Step 1: Show forgot page
router.get(
  "/forgot/recovery",
  requireHandler(getForgotPasswordPage, "getForgotPasswordPage")
);

// Step 2: Send OTP or link
router.post(
  "/forgot/recovery",
  requireHandler(sendOtp, "sendOtp")
);

/* =========================================================
   OTP VERIFICATION
========================================================= */

// Step 3: Show OTP page
router.get(
  "/forgot/verify-otp",
  requireHandler(verifyOtp, "verifyOtp")
);

// Step 4: Verify OTP
router.post(
  "/forgot/verify-otp",
  requireHandler(submitOtpVerification, "submitOtpVerification")
);

/* =========================================================
   PASSWORD RESET
========================================================= */

// Step 5: Show reset page
router.get(
  "/forgot/update",
  requireHandler(getResetPasswordPage, "getResetPasswordPage")
);

// Step 6: Update password
router.post(
  "/forgot/update",
  requireHandler(updatePassword, "updatePassword")
);

/* =========================================================
   RESEND OTP (🔥 FIXED FLOW)
========================================================= */

router.post("/forgot/resend-otp", async (req, res, next) => {
  try {
    await requireHandler(resendRecoveryOtp, "resendRecoveryOtp")(req, res, next);

    // ✅ FORCE redirect back to OTP page
    return res.redirect("/admin/a/password/forgot/verify-otp");
  } catch (err) {
    return next(err);
  }
});

/* =========================================================
   LEGACY SUPPORT (CLEAN REDIRECTS)
========================================================= */

// Old forgot
router.get("/forgot", (req, res) =>
  res.redirect("/admin/a/password/forgot/recovery")
);
router.post("/forgot", (req, res) =>
  res.redirect("/admin/a/password/forgot/recovery")
);

// Old OTP
router.get("/verify-otp", (req, res) =>
  res.redirect("/admin/a/password/forgot/verify-otp")
);
router.post("/verify-otp", (req, res) =>
  res.redirect("/admin/a/password/forgot/verify-otp")
);

// Old update
router.get("/recovery", (req, res) =>
  res.redirect("/admin/a/password/forgot/update")
);
router.post("/recovery", (req, res) =>
  res.redirect("/admin/a/password/forgot/update")
);

router.get("/reset", (req, res) =>
  res.redirect("/admin/a/password/forgot/update")
);
router.post("/reset", (req, res) =>
  res.redirect("/admin/a/password/forgot/update")
);

// Old send OTP
router.post("/send-otp", (req, res, next) =>
  requireHandler(sendOtp, "sendOtp")(req, res, next)
);

// Old resend OTP
router.post("/resend-otp", (req, res, next) =>
  requireHandler(resendRecoveryOtp, "resendRecoveryOtp")(req, res, next)
);

module.exports = router;