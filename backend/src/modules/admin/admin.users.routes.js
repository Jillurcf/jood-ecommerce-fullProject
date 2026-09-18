import { Router } from "express";
import { requireUserManager, requireSuperOrMaster } from "../auth/middleware.js";
import * as ctrl from "./admin.users.controller.js";
const router = Router();
router.get("/users", requireUserManager, ctrl.listUsers);
router.get("/users/:id", requireUserManager, ctrl.getUser);
router.post("/users", requireUserManager, ctrl.createUser);
router.put("/users/:id", requireUserManager, ctrl.updateUser);
router.post("/users/:id/block", requireSuperOrMaster, ctrl.blockUser);
router.post("/users/:id/freeze", requireSuperOrMaster, ctrl.freezeUser);
router.post("/users/:id/delete", requireSuperOrMaster, ctrl.deleteUser);
var admin_users_routes_default = router;
export {
  admin_users_routes_default as default
};
