import { Router } from "express";
import { requireAdmin } from "../auth/middleware.js";
import profileRoutes from "./admin.profile.routes.js";
import accountsRoutes from "./admin.accounts.routes.js";
import usersRoutes from "./admin.users.routes.js";
import productsRoutes from "./admin.products.routes.js";
import categoriesRoutes from "./admin.categories.routes.js";
import ordersRoutes from "./admin.orders.routes.js";
import dashboardRoutes from "./admin.dashboard.routes.js";
import supportRoutes from "./admin.support.routes.js";
const router = Router();
router.use(requireAdmin);
router.use("/", profileRoutes);
router.use("/", accountsRoutes);
router.use("/", usersRoutes);
router.use("/", productsRoutes);
router.use("/", categoriesRoutes);
router.use("/", ordersRoutes);
router.use("/", dashboardRoutes);
router.use("/", supportRoutes);
var admin_routes_default = router;
export {
  admin_routes_default as default
};
