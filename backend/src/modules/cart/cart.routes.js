import { Router } from "express";
import * as ctrl from "./cart.controller.js";
const router = Router();
router.get("/", ctrl.getCart);
router.post("/add", ctrl.addToCart);
router.post("/update", ctrl.updateCartQty);
router.post("/remove", ctrl.removeFromCart);
var cart_routes_default = router;
export {
  cart_routes_default as default
};
