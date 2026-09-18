"use strict";

const express = require("express");
const router = express.Router();

const updateEmailController = require("../../../controllers/a/setting/updateEmail.controller");

/*
|--------------------------------------------------------------------------
| ADMIN UPDATE EMAIL ROUTES
|--------------------------------------------------------------------------
*/

/**
 * Show update email page
 */
router.get(
  "/",
  updateEmailController.getUpdateEmailPage
);

/**
 * Submit new email and send OTP
 */
router.post(
  "/",
  updateEmailController.postUpdateEmail
);

/**
 * Show OTP verification page
 */
router.get(
  "/verify-email-otp",
  updateEmailController.getVerifyEmailOtpPage
);

/**
 * Verify OTP and update admin email
 */
router.post(
  "/verify-email-otp",
  updateEmailController.postVerifyEmailOtp
);

/**
 * Resend OTP
 */
router.post(
  "/resend-email-otp",
  updateEmailController.postResendEmailOtp
);

/**
 * OPTIONAL AJAX API ROUTE
 * Admin email update endpoint
 */
router.post(
  "/admin/u/settings/updateEmail",
  async (req, res) => {
    try {
      const adminId =
        req.session?.admin?.id ||
        req.session?.adminId ||
        null;

      if (!adminId) {
        return res.status(401).json({
          success: false,
          message: "Admin authentication required",
        });
      }

      const { email, otp } = req.body || {};

      console.log("Admin Update Email Request:", {
        adminId,
        email,
        otp,
      });

      /*
      |--------------------------------------------------------------------------
      | OPTIONAL:
      | You can call controller methods here if needed
      |--------------------------------------------------------------------------
      |
      | Example:
      | await updateEmailController.verifyAndUpdate(...);
      |
      */

      return res.status(200).json({
        success: true,
        message: "Request received successfully",
      });

    } catch (error) {
      console.error("Admin Update Email Route Error:", error);

      return res.status(500).json({
        success: false,
        message: "Server error",
      });
    }
  }
);

module.exports = router;