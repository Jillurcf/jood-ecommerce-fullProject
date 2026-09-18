"use strict";

const express = require("express");
const router = express.Router();

const adminController = require("../../../controllers/a/profile/master-admins.controller");

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
  return String(req.session?.admin?.role || req.session?.adminRole || "").trim().toLowerCase();
}

function getAdminId(req) {
  const sessionAdmin = req.session?.admin || null;

  return (
    sessionAdmin?.id ||
    sessionAdmin?.admin_id ||
    req.session?.adminId ||
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

function requireAdminManager(req, res, next) {
  const role = getAdminRole(req);
  const allowed = new Set(["super_admin", "master_admin", "admin"]);

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
router.get("/", requireAdmin, requireAdminManager, adminController.getAdminListPage);

// API list endpoints
router.get("/list", requireAdmin, requireAdminManager, adminController.getAdminList);
router.get("/overview", requireAdmin, requireAdminManager, adminController.getAdminList);
router.get("/sync-expired-freezes", requireAdmin, requireSuperOrMaster, adminController.syncExpiredAdminFreezes);

// Debug / health endpoint for controller diagnostics
router.get("/debug", requireAdmin, requireSuperOrMaster, adminController.getAdminControllerDebug);

// Create / update / actions
router.post("/create", requireAdmin, requireSuperOrMaster, adminController.createAdmin);
router.post("/update/:id", requireAdmin, requireSuperOrMaster, adminController.updateAdmin);
router.post("/action/:action/:id", requireAdmin, requireSuperOrMaster, adminController.updateAdminStatusAction);

// Destructive / privileged actions
router.post("/block/:id", requireAdmin, requireSuperOrMaster, adminController.blockAdmin);
router.post("/unblock/:id", requireAdmin, requireSuperOrMaster, adminController.unblockAdmin);
router.post("/freeze/:id", requireAdmin, requireSuperOrMaster, adminController.freezeAdmin);
router.post("/unfreeze/:id", requireAdmin, requireSuperOrMaster, adminController.unfreezeAdmin);
router.post("/delete/:id", requireAdmin, requireSuperOrMaster, adminController.deleteAdmin);
router.post("/restore/:id", requireAdmin, requireSuperOrMaster, adminController.restoreAdmin);

// Keep :id LAST so it does not swallow fixed routes above.
router.get("/:id", requireAdmin, requireAdminManager, adminController.getAdminById);

// Optional cleanup endpoint
router.post("/cancel-pending", requireAdmin, requireAdminManager, (req, res) => {
  return res.json({ ok: true, message: "Pending admin action cancelled." });
});

module.exports = router;
