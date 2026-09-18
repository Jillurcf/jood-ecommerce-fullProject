import { Router } from "express";
import * as ctrl from "./wishlist.controller.js";
const router = Router();
router.get("/", ctrl.getWishlist);
router.post("/toggle", ctrl.toggleWishlist);
var wishlist_routes_default = router;
export {
  wishlist_routes_default as default
};
