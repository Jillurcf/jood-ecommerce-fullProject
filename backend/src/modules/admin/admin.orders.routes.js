import { Router } from "express";
import * as ctrl from "./admin.orders.controller.js";
const router = Router();
router.get("/orders", ctrl.getOrdersData);
router.get("/orders/data", ctrl.getOrdersData);
router.get("/orders/summary", ctrl.getOrdersSummary);
router.get("/orders/live-search", ctrl.liveSearch);
router.get("/orders/export", ctrl.exportOrders);
router.get("/orders/status-options", ctrl.getStatusOptions);
router.get("/orders/:orderNumber", ctrl.getOrderDetail);
router.post("/orders/:id/cancel", ctrl.cancelOrder);
var admin_orders_routes_default = router;
export {
  admin_orders_routes_default as default
};
