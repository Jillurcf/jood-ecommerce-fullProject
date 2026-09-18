import { Router } from "express";
import * as ctrl from "./catalog.controller.js";
const router = Router();
router.get("/catalog/parent-categories", ctrl.catalogParentCategories);
router.get("/catalog/categories", ctrl.catalogCategories);
router.get("/catalog/menu", ctrl.catalogMenu);
router.get("/shop", ctrl.shopListing);
router.get("/shop/filters", ctrl.shopFilters);
router.get("/shop/group/:groupSlug", ctrl.shopListing);
router.get("/shop/group/id/:groupId", ctrl.shopListing);
router.get("/shop/subgroup/:subgroupSlug", ctrl.shopListing);
router.get("/shop/subgroup/id/:subgroupId", ctrl.shopListing);
router.get("/shop/product/:productSlug", ctrl.shopListing);
router.get("/shop/product/id/:productId", ctrl.shopListing);
router.get("/search/universal", ctrl.searchUniversal);
router.get("/catalog/product-detail/:pid/:vid", ctrl.productDetail);
router.get("/catalog/product-detail/:pid", ctrl.productDetail);
router.get("/catalog/variants", ctrl.variants);
router.get("/catalog/recent", ctrl.recentProducts);
router.get("/catalog/frequent", ctrl.frequentProducts);
var catalog_routes_default = router;
export {
  catalog_routes_default as default
};
