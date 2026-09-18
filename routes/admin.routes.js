const express = require("express");
const router = express.Router();
const adminController = require("../controllers/admin.controller");
const { ensureAuth, ensureGuest } = require("../middleware/auth");
const upload = require("../middleware/multer");

// Admin login page
router.get("/sign-in", ensureGuest, adminController.showLogin);
router.post("/sign-in", adminController.loginAdmin);

// Admin signup page
router.get("/sign-up", ensureGuest, adminController.showSignup);
router.post("/sign-up", upload.single("avatar"), adminController.registerAdmin);

// Admin dashboard
router.get("/", ensureAuth, (req, res) => {
  res.render("admin/index");
});

module.exports = router;
