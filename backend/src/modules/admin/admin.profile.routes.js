import { Router } from "express";
import * as ctrl from "./admin.profile.controller.js";
const router = Router();
router.get("/profile", ctrl.getProfile);
router.put("/profile", ctrl.updateProfile);
router.post("/heartbeat", ctrl.heartbeat);
router.post("/offline", ctrl.setOffline);
router.post("/update-email", ctrl.updateEmail);
router.post("/update-password", ctrl.updatePassword);
router.get("/me", ctrl.getMe);
var admin_profile_routes_default = router;
export {
  admin_profile_routes_default as default
};
