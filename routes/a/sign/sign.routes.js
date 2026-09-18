"use strict";

const express = require("express");
const adminController = require("../../../controllers/a/sign/sign.controller");

const router = express.Router();

/* ==================================================
   PUBLIC AUTH ROUTES
   BASE SHOULD BE:
   app.use("/admin/a", router)
================================================== */

router.get(
  ["/sign/in", "/sign"],
  adminController.ensureGuest,
  adminController.getSignInPage
);

router.post(
  ["/sign/in", "/sign"],
  adminController.ensureGuest,
  adminController.postSignIn
);

router.get("/login/verify-otp", adminController.getOtpPage);

router.post("/login/verify-otp", adminController.postVerifyOtp);

router.post("/login/resend-otp", adminController.postResendOtp);

/* ==================================================
   PROTECTED ROUTES
================================================== */

router.get(
  "/dashboard",
  adminController.ensureAuth,
  adminController.adminActivityMiddleware,
  (req, res) => {
    return res.redirect("/admin/a/profile/myprofile");
  }
);

router.get("/logout", adminController.ensureAuth, adminController.logoutAdmin);

router.get("/current", adminController.ensureAuth, adminController.getCurrentAdmin);

router.get("/overview", adminController.ensureAuth, adminController.getAdminOverview);

/* ==================================================
   MASTER ADMIN ACTIONS
================================================== */

router.post("/create", adminController.ensureAuth, adminController.createAdmin);

router.post("/suspend", adminController.ensureAuth, adminController.suspendAdmin);

router.post("/activate", adminController.ensureAuth, adminController.activateAdmin);

router.post("/force-logout", adminController.ensureAuth, adminController.forceLogoutAdmin);

/* ==================================================
   ROOT HANDLERS
================================================== */

router.get("/", (req, res) => {
  const admin = req.session?.admin || null;

  if (admin?.id) return res.redirect("/admin/a/dashboard");
  return res.redirect("/admin/a/sign/in");
});

router.get("/in", (req, res) => {
  return res.redirect("/admin/a/sign/in");
});

router.post("/in", (req, res) => {
  return res.redirect("/admin/a/sign/in");
});

router.get("/check", adminController.ensureAuth, (req, res) => {
  return res.json({
    ok: true,
    loggedIn: true,
    admin: req.session?.admin || null,
  });
});

module.exports = router;