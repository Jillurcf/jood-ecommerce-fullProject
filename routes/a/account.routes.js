"use strict";

const express = require("express");
const router = express.Router();

const accountController = require("../../controllers/a/account.controller");
const signController = require("../../controllers/a/sign/sign.controller");

function requireAdmin(req, res, next) {
  if (!req.session?.admin?.id && !req.session?.adminId) {
    return res.redirect("/admin/a/sign/in");
  }
  next();
}

// Account page
router.get("/", requireAdmin, accountController.getAccountPage);

// Get current admin data
router.get("/me", requireAdmin, accountController.getAccount);

// Update editable fields
router.patch("/update", requireAdmin, accountController.updateField);

module.exports = router;