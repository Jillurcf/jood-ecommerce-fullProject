import { Router } from "express";
import * as ctrl from "./admin.support.controller.js";
const router = Router();
router.get("/support", ctrl.listSupport);
router.get("/support/:id", ctrl.getSupportDetail);
router.post("/support/:id/status", ctrl.updateSupportStatus);
var admin_support_routes_default = router;
export {
  admin_support_routes_default as default
};
