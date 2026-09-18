import { Router } from "express";
import * as ctrl from "./admin.categories.controller.js";
const router = Router();
router.get("/parent-categories", ctrl.listParentCategories);
router.get("/parent-categories/:id", ctrl.getParentCategory);
router.post("/parent-categories", ctrl.createParentCategory);
router.put("/parent-categories/:id", ctrl.updateParentCategory);
router.delete("/parent-categories/:id", ctrl.deleteParentCategory);
router.delete("/parent-categories/:id/image", ctrl.removeParentCategoryImage);
router.get("/categories", ctrl.listCategories);
router.get("/categories/:id", ctrl.getCategory);
router.post("/categories", ctrl.createCategory);
router.put("/categories/:id", ctrl.updateCategory);
router.delete("/categories/:id", ctrl.deleteCategory);
router.delete("/categories/:id/image", ctrl.removeCategoryImage);
var admin_categories_routes_default = router;
export {
  admin_categories_routes_default as default
};
