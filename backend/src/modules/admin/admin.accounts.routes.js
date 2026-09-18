import { Router } from "express";
import { requireSuperOrMaster, requireAdminManager } from "../auth/middleware.js";
import * as ctrl from "./admin.accounts.controller.js";
const router = Router();
router.get("/overview", requireSuperOrMaster, ctrl.getOverview);
router.post("/create", requireSuperOrMaster, ctrl.requestCreateAdmin);
router.post("/create/verify", requireSuperOrMaster, ctrl.verifyCreateAdminOtp);
router.post("/suspend", requireSuperOrMaster, ctrl.suspendAdmin);
router.post("/activate", requireSuperOrMaster, ctrl.activateAdmin);
router.post("/force-logout", requireSuperOrMaster, ctrl.forceLogoutAdmin);
router.get("/admins", requireAdminManager, ctrl.listAdmins);
router.post("/admins", requireAdminManager, ctrl.requestCreateAdmin);
router.post("/admins/:id/approve", requireSuperOrMaster, ctrl.approveAdmin);
router.get("/master-admins", requireSuperOrMaster, ctrl.listMasterAdmins);
router.get("/super-admins", requireSuperOrMaster, ctrl.listSuperAdmins);
var admin_accounts_routes_default = router;
export {
  admin_accounts_routes_default as default
};
