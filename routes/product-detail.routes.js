"use strict";

const express = require("express");
const { param, validationResult } = require("express-validator");
const wishlistController = require("../controllers/u/wishlist.controller");

let productDetailController = null;
try {
  productDetailController = require("../controllers/product-detail.amazon.controller");
} catch (err) {
  try {
    productDetailController = require("../controllers/product-detail.controller");
  } catch (_) {
    productDetailController = null;
  }
}

const router = express.Router();

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

function toInt(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function sanitizeUrl(url) {
  if (!url) return "";
  const u = String(url).trim();
  if (/^javascript:/i.test(u)) return "";
  return u.replace(/\s+/g, "%20");
}

function normalizeImageList(value, fallback = "") {
  const out = [];
  const seen = new Set();

  const push = (img) => {
    const clean = sanitizeUrl(img);
    if (!clean || seen.has(clean)) return;
    seen.add(clean);
    out.push(clean);
  };

  if (Array.isArray(value)) {
    for (const img of value) push(img);
  } else if (typeof value === "string" && value) {
    push(value);
  }

  if (!out.length && fallback) push(fallback);
  return out;
}

function normalizeItem(item = {}) {
  if (!item || typeof item !== "object") return item;
  const images = normalizeImageList(item.images, item.image || item.product?.main_image || "");
  return {
    ...item,
    images,
    image: images[0] || sanitizeUrl(item.image || item.product?.main_image || ""),
  };
}

function normalizeItems(items = []) {
  return Array.isArray(items) ? items.map(normalizeItem) : [];
}

function buildCurrentUrl(req) {
  try {
    return `${req.protocol}://${req.get("host")}${req.originalUrl}`;
  } catch {
    return "";
  }
}

function buildFallbackTitle(product = {}, variant = {}) {
  return (
    String(product?.meta_title || "").trim() ||
    String(product?.name || "").trim() ||
    String(variant?.display_name || "").trim() ||
    String(variant?.variant_name || "").trim() ||
    String(variant?.name || "").trim() ||
    "Product Details"
  );
}

function buildFallbackDescription(product = {}, variant = {}) {
  return (
    String(product?.meta_description || "").trim() ||
    String(product?.description || "").trim() ||
    String(product?.short_description || "").trim() ||
    String(variant?.product?.description || "").trim() ||
    String(variant?.product_description || "").trim() ||
    String(variant?.short_description || "").trim() ||
    ""
  );
}

function buildFallbackBrand(product = {}, variant = {}) {
  return String(product?.brand || "").trim() || String(variant?.brand || "").trim() || "";
}

function getSelectedVariant(variants = [], variantId = null) {
  if (!Array.isArray(variants) || variants.length === 0) return null;

  const wantedId = toInt(variantId);
  return (
    variants.find((v) => Number(v.id) === wantedId) ||
    variants.find((v) => Boolean(v.is_default)) ||
    variants[0] ||
    null
  );
}

function dedupeByKey(items = [], keyGetter = (x) => x?.id) {
  const out = [];
  const seen = new Set();
  for (const item of Array.isArray(items) ? items : []) {
    const key = String(keyGetter(item) ?? "").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function prepareDetailList(list = []) {
  return normalizeItems(dedupeByKey(Array.isArray(list) ? list : [], (item) => item?.id || item?.variant_id));
}

function detailRenderPayload(data = {}, req, productId, variantId) {
  const product = data.product || {};
  const variants = prepareDetailList(data.variantsForState || data.variants || []);
  const selectedVariant =
    data.selectedVariant || getSelectedVariant(variants, variantId) || null;

  const relatedProducts = prepareDetailList(
    data.frequentlyBoughtTogether ||
      data.frequently_bought_together ||
      data.relatedProducts ||
      data.categoryProducts ||
      data.related || []
  );

  const alsoViewed = prepareDetailList(data.customersAlsoViewed || data.alsoViewed || []);
  const sameModelVariants = prepareDetailList(data.sameModelVariants || data.modelVariants || []);
  const compareItems = prepareDetailList(data.compareItems || []);

  const gallery = normalizeImageList(
    data.gallery || selectedVariant?.images || product?.images,
    selectedVariant?.image || product?.main_image || ""
  );

  return {
    product,
    variant: selectedVariant,
    selectedVariant,
    variants,
    variantsForState: variants,

    gallery,
    currentUrl: buildCurrentUrl(req),

    title: buildFallbackTitle(product, selectedVariant),
    description: buildFallbackDescription(product, selectedVariant),
    brand: buildFallbackBrand(product, selectedVariant),

    related: prepareDetailList(data.related || data.categoryProducts || data.relatedProducts || []),
    relatedProducts,
    categoryProducts: relatedProducts,

    frequentlyBoughtTogether: relatedProducts,
    frequently_bought_together: relatedProducts,

    customersAlsoViewed: alsoViewed,
    alsoViewed,

    sameModelVariants,
    modelVariants: sameModelVariants,

    compareItems,

    breadcrumbs: Array.isArray(data.breadcrumbs) ? data.breadcrumbs : [],
  };
}

async function loadProductDetail(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).render("errors/400");
  }

  const productId = toInt(req.params.productId);
  const variantId = toInt(req.params.variantId);

  if (!productId || !variantId) {
    return res.status(400).render("errors/400");
  }

  if (!productDetailController || typeof productDetailController.getProductDetails !== "function") {
    return res.status(500).render("errors/500");
  }

  try {
    const data = await productDetailController.getProductDetails(productId, variantId, req);

    if (!data || !data.success) {
      return res.status(404).render("errors/404");
    }

    const payload = detailRenderPayload(data, req, productId, variantId);
    return res.render("customer/product/product-details", payload);
  } catch (err) {
    return next(err);
  }
}

/* -------------------------------------------------------------------------- */
/* Routes                                                                     */
/* -------------------------------------------------------------------------- */

router.get(
  "/product-details/:productId/:variantId",
  [
    param("productId").isInt({ min: 1 }).toInt(),
    param("variantId").isInt({ min: 1 }).toInt(),
  ],
  asyncHandler(loadProductDetail)
);

router.get(
  "/product-details/:productId",
  [param("productId").isInt({ min: 1 }).toInt()],
  asyncHandler(async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).render("errors/400");
    }

    const productId = toInt(req.params.productId);
    if (!productId) {
      return res.status(400).render("errors/400");
    }

    if (!productDetailController || typeof productDetailController.getProductDetails !== "function") {
      return res.status(500).render("errors/500");
    }

    try {
      const data = await productDetailController.getProductDetails(productId, null, req);
      if (!data || !data.success) {
        return res.status(404).render("errors/404");
      }

      const payload = detailRenderPayload(data, req, productId, null);
      return res.render("customer/product/product-details", payload);
    } catch (err) {
      return next(err);
    }
  })
);

/* -------------------------------------------------------------------------- */
/* API: Full detail payload                                                   */
/* -------------------------------------------------------------------------- */

router.get(
  "/api/product-details/:productId/:variantId",
  [
    param("productId").isInt({ min: 1 }).toInt(),
    param("variantId").isInt({ min: 1 }).toInt(),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: "Invalid params" });
    }

    const productId = toInt(req.params.productId);
    const variantId = toInt(req.params.variantId);

    if (!productId || !variantId) {
      return res.status(400).json({ success: false, message: "Invalid params" });
    }

    if (!productDetailController || typeof productDetailController.getProductDetails !== "function") {
      return res.status(500).json({ success: false, message: "Controller unavailable" });
    }

    const data = await productDetailController.getProductDetails(productId, variantId, req);
    if (!data || !data.success) {
      return res.status(404).json(data || { success: false, message: "Not found" });
    }

    return res.json(data);
  })
);

/* -------------------------------------------------------------------------- */
/* API: Recent / related style data                                           */
/* -------------------------------------------------------------------------- */

router.get(
  "/product-detail/api/:productId",
  [param("productId").isInt({ min: 1 }).toInt()],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, data: [] });
    }

    const productId = toInt(req.params.productId);
    if (!productId) {
      return res.status(400).json({ success: false, data: [] });
    }

    if (!productDetailController || typeof productDetailController.getRecentProductsAPI !== "function") {
      return res.json({ success: false, data: [] });
    }

    const recent = await productDetailController.getRecentProductsAPI(
      { query: { productId, limit: 50 } },
      null,
      true
    );

    if (!recent?.success) {
      return res.json({ success: false, data: [] });
    }

    const relevant = (recent.data || []).filter(
      (item) => Number(item.product_id) === productId || Number(item.master_id) === productId
    );

    return res.json({
      success: true,
      data: prepareDetailList(relevant),
    });
  })
);

router.get(
  "/api/product-detail/:productId/:variantId",
  [
    param("productId").isInt({ min: 1 }).toInt(),
    param("variantId").isInt({ min: 1 }).toInt(),
  ],
  asyncHandler(async (req, res) => {
    const productId = toInt(req.params.productId);
    const variantId = toInt(req.params.variantId);

    if (!productId || !variantId) {
      return res.status(400).json({ success: false, message: "Invalid params" });
    }

    if (!productDetailController || typeof productDetailController.getProductDetails !== "function") {
      return res.status(500).json({ success: false, message: "Controller unavailable" });
    }

    const data = await productDetailController.getProductDetails(productId, variantId, req);
    if (!data || !data.success) {
      return res.status(404).json(data || { success: false, message: "Not found" });
    }

    return res.json({
      success: true,
      product: data.product || null,
      variant: data.selectedVariant || null,
      gallery: Array.isArray(data.gallery) ? data.gallery : [],
      relatedProducts: Array.isArray(data.relatedProducts) ? data.relatedProducts : [],
      frequentlyBoughtTogether: Array.isArray(data.frequentlyBoughtTogether)
        ? data.frequentlyBoughtTogether
        : [],
      customersAlsoViewed: Array.isArray(data.customersAlsoViewed) ? data.customersAlsoViewed : [],
      sameModelVariants: Array.isArray(data.sameModelVariants) ? data.sameModelVariants : [],
      compareItems: Array.isArray(data.compareItems) ? data.compareItems : [],
    });
  })
);

/* -------------------------------------------------------------------------- */
/* Export                                                                     */
/* -------------------------------------------------------------------------- */

module.exports = router;
