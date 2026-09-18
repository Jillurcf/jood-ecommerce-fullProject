import { Router } from "express";
import * as ctrl from "./admin.dashboard.controller.js";
const router = Router();
router.get("/dashboard", ctrl.getDashboard);
router.get("/billing", ctrl.getBilling);
router.get("/billing/chart", ctrl.getBillingChart);
router.get("/billing/detail/:id", ctrl.getBillingDetail);
router.get("/billing/export/pdf", ctrl.getBillingPdf);
router.get("/transactions", ctrl.getTransactions);
router.get("/transactions/summary", ctrl.getTransactionSummary);
router.get("/transactions/item/:type/:id", ctrl.getTransactionItem);
router.post("/transactions/export", ctrl.exportTransactions);
router.get("/transactions/chart", ctrl.getTransactionChart);
router.get("/transactions/product-search", ctrl.productSearch);
router.get("/visitors", ctrl.getVisitors);
router.get("/visitors/chart", ctrl.getVisitorChart);
router.get("/visitors/:visitorKey/visits", ctrl.getVisitorDetail);
var admin_dashboard_routes_default = router;
export {
  admin_dashboard_routes_default as default
};
