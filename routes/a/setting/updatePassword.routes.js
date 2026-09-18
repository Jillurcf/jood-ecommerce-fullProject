"use strict";

const express = require("express");
const router = express.Router();

const updatePasswordController = require("../../../controllers/a/setting/updatePassword.controller");

/*
|--------------------------------------------------------------------------
| UPDATE PASSWORD
|--------------------------------------------------------------------------
*/

// GET update password page
router.get(
  "/",
  updatePasswordController.getUpdatePasswordPage
);

// POST update password
router.post(
  "/",
  updatePasswordController.postUpdatePassword
);

/*
|--------------------------------------------------------------------------
| FORGOT PASSWORD
|--------------------------------------------------------------------------
*/

// GET forgot password page
router.get(
  "/forgotPassword",
  updatePasswordController.getForgotPasswordPage
);

// POST send OTP
router.post(
  "/forgotPassword",
  updatePasswordController.postForgotPassword
);

/*
|--------------------------------------------------------------------------
| VERIFY OTP
|--------------------------------------------------------------------------
*/

// GET verify OTP page
router.get(
  "/forgotPassword/verify",
  updatePasswordController.getVerifyForgotPasswordOtpPage
);

// POST verify OTP
router.post(
  "/forgotPassword/verify",
  updatePasswordController.postVerifyForgotPasswordOtp
);

/*
|--------------------------------------------------------------------------
| RESET PASSWORD
|--------------------------------------------------------------------------
*/

// GET reset password page
router.get(
  "/forgotPassword/reset",
  updatePasswordController.getResetForgotPasswordPage
);

// POST reset password
router.post(
  "/forgotPassword/reset",
  updatePasswordController.postResetForgotPassword
);

/*
|--------------------------------------------------------------------------
| RESEND OTP
|--------------------------------------------------------------------------
*/

// POST resend OTP
router.post(
  "/forgotPassword/resend-otp",
  updatePasswordController.postResendForgotPasswordOtp
);

module.exports = router;