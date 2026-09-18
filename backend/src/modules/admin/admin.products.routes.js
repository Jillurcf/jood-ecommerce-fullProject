import { Router } from "express";
import * as ctrl from "./admin.products.controller.js";
const router = Router();
router.get("/products", ctrl.listProducts);
router.get("/products/search", ctrl.searchProducts);
router.get("/products/:id", ctrl.getProduct);
router.post("/products", ctrl.createProduct);
router.put("/products/:id", ctrl.updateProduct);
router.delete("/products/:id", ctrl.deleteProduct);
var admin_products_routes_default = router;
export {
  admin_products_routes_default as default
};
