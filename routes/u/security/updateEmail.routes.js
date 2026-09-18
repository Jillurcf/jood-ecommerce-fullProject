"use strict";

const express = require("express");
const router = express.Router();

const updateEmailController = require("../../../controllers/u/security/updateEmail.controller");

/*
|--------------------------------------------------------------------------
| Update Email Routes
|--------------------------------------------------------------------------
*/

// Show update email page
router.get(
  "/",
  updateEmailController.getUpdateEmailPage
);

// Submit new email and send OTP
router.post(
  "/",
  updateEmailController.postUpdateEmail
);

// Show OTP verification page
router.get(
  "/verify-email-otp",
  updateEmailController.getVerifyEmailOtpPage
);

// Verify OTP and update email
router.post(
  "/verify-email-otp",
  updateEmailController.postVerifyEmailOtp
);

// Resend OTP
router.post(
  "/resend-email-otp",
  updateEmailController.postResendEmailOtp
);
router.post("/customer/u/security/updateEmail", async (req, res) => {
  try {
    const { email, otp } = req.body;

    console.log(req.body);

    // update logic here

    return res.json({
      success: true
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});
module.exports = router;