"use strict";

const express = require("express");
const router = express.Router();

const userController = require("../../../controllers/a/profile/users.controller");

/* =========================================================
   REQUEST HELPERS
========================================================= */

function wantsJson(req) {
  return (
    req.xhr ||
    String(req.headers?.accept || "").includes("application/json") ||
    String(req.headers?.["x-requested-with"] || "") === "XMLHttpRequest"
  );
}

function getAdminRole(req) {
  return String(req.session?.admin?.role || req.session?.adminRole || "").trim();
}

function getAdminId(req) {
  const sessionAdmin = req.session?.admin || null;

  return (
    sessionAdmin?.id ||
    req.session?.adminId ||
    sessionAdmin?.admin_id ||
    req.session?.adminAdminId ||
    null
  );
}

/* =========================================================
   AUTH / ROLE GUARDS
========================================================= */

function requireAdmin(req, res, next) {
  const adminId = getAdminId(req);

  if (!adminId) {
    if (wantsJson(req)) {
      return res.status(401).json({ ok: false, message: "Unauthorized" });
    }

    return res.redirect("/admin/a/sign/in");
  }

  return next();
}

function requireUserManager(req, res, next) {
  const role = getAdminRole(req);
  const allowed = new Set(["super_admin", "master_admin", "admin", "sub_admin"]);

  if (!allowed.has(role)) {
    if (wantsJson(req)) {
      return res.status(403).json({ ok: false, message: "Forbidden" });
    }

    return res.status(403).send("Forbidden");
  }

  return next();
}

function requireSuperOrMaster(req, res, next) {
  const role = getAdminRole(req);

  if (role !== "super_admin" && role !== "master_admin") {
    if (wantsJson(req)) {
      return res.status(403).json({ ok: false, message: "Forbidden" });
    }

    return res.status(403).send("Forbidden");
  }

  return next();
}

/* =========================================================
   ROUTE ORDER
   Fixed routes first, then parameter routes.
========================================================= */

// Page
router.get("/", requireAdmin, requireUserManager, userController.getUserListPage);

// API list endpoints
router.get("/list", requireAdmin, requireUserManager, userController.getUserList);
router.get("/overview", requireAdmin, requireUserManager, userController.getUserList);
router.get("/sync-expired-freezes", requireAdmin, requireSuperOrMaster, userController.syncExpiredUserFreezes);

// Debug / health endpoint for controller diagnostics
router.get("/debug", requireAdmin, requireSuperOrMaster, userController.getUserControllerDebug);

// Create / update / actions
router.post("/create", requireAdmin, requireUserManager, userController.createUser);
router.post("/update/:id", requireAdmin, requireUserManager, userController.updateUser);

router.post("/action/:action/:id", requireAdmin, requireUserManager, userController.updateUserStatusAction);

// Destructive / privileged actions
router.post("/block/:id", requireAdmin, requireSuperOrMaster, userController.blockUser);
router.post("/unblock/:id", requireAdmin, requireSuperOrMaster, userController.unblockUser);
router.post("/freeze/:id", requireAdmin, requireSuperOrMaster, userController.freezeUser);
router.post("/unfreeze/:id", requireAdmin, requireSuperOrMaster, userController.unfreezeUser);
router.post("/delete/:id", requireAdmin, requireSuperOrMaster, userController.deleteUser);
router.post("/restore/:id", requireAdmin, requireSuperOrMaster, userController.restoreUser);

// Keep :id LAST so it does not swallow fixed routes above.
router.get("/:id", requireAdmin, requireUserManager, userController.getUserById);

// Optional cleanup endpoint
router.post("/cancel-pending", requireAdmin, requireUserManager, (req, res) => {
  return res.json({ ok: true, message: "Pending user action cancelled." });
});

module.exports = router;
