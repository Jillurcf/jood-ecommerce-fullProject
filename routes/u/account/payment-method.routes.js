"use strict";

const express = require("express");
const router = express.Router();

const paymentsController = require("../../../controllers/u/account/payment-method.controller");

/* =========================================================
   PAYMENT PAGE
========================================================= */

// Main payment methods page
router.get("/", paymentsController.getPayments);

/* =========================================================
   PAYMENT LIST / SINGLE RECORD
========================================================= */

// Get all payment methods
router.get("/payments", paymentsController.getPayments);

// Get one payment method
router.get("/payments/:id", paymentsController.getPaymentRecordById);

/* =========================================================
   OTP ROUTES
========================================================= */

// Send OTP for add/save payment method
router.post("/payments/send-otp", paymentsController.sendOtp);

// Verify OTP for add/remove actions
router.post("/payments/verify-otp", paymentsController.verifyOtp);

// Send OTP for delete/remove payment method
router.post("/payments/delete/send-otp", paymentsController.requestDeletePaymentOtp);

/* =========================================================
   PAYMENT ACTIONS
========================================================= */

// Create/save payment method
router.post("/payments", paymentsController.createPayment);

// Delete/remove payment method
router.delete("/payments/:id", paymentsController.deletePayment);

module.exports = router;