import { sendSuccess, sendError } from "../../common/response.js";
import {
  getMenu,
  getParentCategories,
  getCategories,
  getShopListing,
  getProductDetail,
  universalSearch,
  getVariantCards,
  getRecentProducts,
  getFrequentProducts,
  getFiltersForScope
} from "./catalog.service.js";
import { resolveCartIdentity } from "../cart/identity.js";
import { getWishlistIds } from "../cart/wishlist.service.js";
import { getCartQuantityMap } from "../cart/cart.service.js";
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
function setPublicCache(res) {
  res.set("Cache-Control", "public, max-age=60, s-maxage=60, stale-while-revalidate=30");
}
function setNoStore(res) {
  res.set("Cache-Control", "no-store");
}
async function resolveWishlistIds(req) {
  try {
    const ids = await getWishlistIds(resolveCartIdentity(req));
    return ids.map(String);
  } catch {
    return [];
  }
}
async function resolveCartQtyMap(req) {
  try {
    return await getCartQuantityMap(resolveCartIdentity(req));
  } catch {
    return /* @__PURE__ */ new Map();
  }
}
const catalogMenu = asyncHandler(async (_req, res) => {
  setPublicCache(res);
  const data = await getMenu();
  sendSuccess(res, data);
});
const catalogParentCategories = asyncHandler(async (_req, res) => {
  setPublicCache(res);
  const data = await getParentCategories();
  sendSuccess(res, data);
});
const catalogCategories = asyncHandler(async (req, res) => {
  setPublicCache(res);
  const parentId = req.query.parent_id ? Number.parseInt(String(req.query.parent_id), 10) : void 0;
  const data = await getCategories(Number.isFinite(parentId) ? parentId : void 0);
  sendSuccess(res, data);
});
const shopListing = asyncHandler(async (req, res) => {
  const isDynamicFilter = Boolean(
    req.query.attributes || req.query.attribute_filters || req.query.attr_
  );
  if (isDynamicFilter) setNoStore(res);
  else setPublicCache(res);
  const [wishlistIds, cartQtyMap] = await Promise.all([
    resolveWishlistIds(req),
    resolveCartQtyMap(req)
  ]);
  const data = await getShopListing(
    { ...req.params },
    req.query,
    wishlistIds,
    cartQtyMap
  );
  res.json(data);
});
const shopFilters = asyncHandler(async (req, res) => {
  setNoStore(res);
  const data = await getFiltersForScope(req.params, req.query);
  sendSuccess(res, { attributes: data.attributes });
});
const productDetail = asyncHandler(async (req, res) => {
  setNoStore(res);
  const productId = req.params.pid ? Number.parseInt(String(req.params.pid), 10) : null;
  const variantId = req.params.vid ? Number.parseInt(String(req.params.vid), 10) : null;
  const [wishlistIds, cartQtyMap] = await Promise.all([
    resolveWishlistIds(req),
    resolveCartQtyMap(req)
  ]);
  const data = await getProductDetail(
    Number.isFinite(productId) ? productId : null,
    Number.isFinite(variantId) ? variantId : null,
    wishlistIds,
    cartQtyMap
  );
  if (!data.success) return sendError(res, 404, data.message, "PRODUCT_NOT_FOUND");
  res.json(data);
});
const searchUniversal = asyncHandler(async (req, res) => {
  setPublicCache(res);
  const q = String(req.query.q || "");
  const data = await universalSearch(q);
  sendSuccess(res, data);
});
const variants = asyncHandler(async (req, res) => {
  setPublicCache(res);
  const limit = Number.parseInt(String(req.query.limit || "100"), 10);
  const inStockOnly = req.query.in_stock_only !== "false";
  const grouped = req.query.grouped === "true";
  const data = await getVariantCards(Number.isFinite(limit) ? limit : 100, inStockOnly, grouped);
  res.json(data);
});
const recentProducts = asyncHandler(async (req, res) => {
  setPublicCache(res);
  const limit = Number.parseInt(String(req.query.limit || "30"), 10);
  const inStockOnly = req.query.in_stock_only !== "false";
  const data = await getRecentProducts(Number.isFinite(limit) ? limit : 30, inStockOnly);
  res.json(data);
});
const frequentProducts = asyncHandler(async (req, res) => {
  setPublicCache(res);
  const limit = Number.parseInt(String(req.query.limit || "30"), 10);
  const data = await getFrequentProducts(Number.isFinite(limit) ? limit : 30);
  res.json(data);
});
export {
  catalogCategories,
  catalogMenu,
  catalogParentCategories,
  frequentProducts,
  productDetail,
  recentProducts,
  searchUniversal,
  shopFilters,
  shopListing,
  variants
};
