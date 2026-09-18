"use strict";

const express = require("express");
const router = express.Router();

const updatePasswordController = require("../../../controllers/u/security/updatePassword.controller");

/*
  =========================
  UPDATE PASSWORD (LOGGED IN)
  =========================
*/

// Show update password page
router.get(
  "/",
  updatePasswordController.getUpdatePasswordPage
);

// Submit current password + new password
router.post(
  "/customer/u/security/updatePassword",
  updatePasswordController.postUpdatePassword
);

/*
  =========================
  FORGOT PASSWORD FLOW (OTP)
  =========================
*/

// Step 1: Show forgot password page (enter email)
router.get(
  "/customer/u/security/forgotPassword",
  updatePasswordController.getForgotPasswordPage
);

// Step 1: Submit email → send OTP
router.post(
  "/customer/u/security/forgotPassword",
  updatePasswordController.postForgotPassword
);

// Step 2: Show OTP verification page
router.get(
  "/customer/u/security/forgotPassword/verify",
  updatePasswordController.getVerifyForgotPasswordOtpPage
);

// Step 2: Verify OTP
router.post(
  "/customer/u/security/forgotPassword/verify",
  updatePasswordController.postVerifyForgotPasswordOtp
);

// Step 3: Show reset password form (after OTP verified)
router.get(
  "/customer/u/security/forgotPassword/reset",
  updatePasswordController.getResetForgotPasswordPage
);

// Step 3: Submit new password
router.post(
  "/customer/u/security/forgotPassword/reset",
  updatePasswordController.postResetForgotPassword
);

// Resend OTP
router.post(
  "/customer/u/security/forgotPassword/resend-otp",
  updatePasswordController.postResendForgotPasswordOtp
);

module.exports = router;