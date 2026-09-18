"use strict";

/*
 * frequent-products.controller.js
 *
 * Fetches most frequently ordered products from the cart table.
 * Returns variant-level cards (one per product) with wishlist and pricing info.
 * Socket emits remain compatible with recent-product controller.
 */

const { pool } = require("../includes/conn");
const wishlistController = require("./u/wishlist.controller");


// ---------- helpers ----------

const toNum = (v, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

const sanitize = (v) =>
  typeof v === "string"
    ? v.replace(/[<>]/g, "")
    : v === null
    ? ""
    : String(v);

const buildStockStatus = (stock) => {
  if (stock <= 0) return "Out of Stock";
  if (stock <= 5) return `${stock} (Limited Stock!)`;
  return `${stock} available`;
};


const calculateFinalPrice = (basePrice, discountPercent = 0, vatPercent = 0) => {
  const bp = toNum(basePrice);
  const d = toNum(discountPercent);
  const v = toNum(vatPercent);

  const discountValue = +(bp * (d / 100));
  const vatValue = +((bp - discountValue) * (v / 100));

  const finalPrice = +(bp - discountValue + vatValue).toFixed(2);

  return {
    finalPrice,
    discountValue,
    vatValue,
  };
};


const resolveDiscountPercent = (discount_type, discount_value, price) => {
  const dv = toNum(discount_value);
  const p = toNum(price);

  if (!discount_type) return 0;

  const t = String(discount_type).toLowerCase();

  if (t === "percent" || t === "percentage") return dv;

  if (t === "fixed" || t === "amount") {
    return p > 0 ? (dv / p) * 100 : 0;
  }

  return 0;
};


async function safeGetWishlistIds(req) {
  try {
    if (!wishlistController?.getWishlistIds) return [];

    const ids = await wishlistController.getWishlistIds(req);

    return Array.isArray(ids) ? ids.map(String) : [];
  } catch {
    return [];
  }
}


// ---------- payload builder ----------

function buildVariantPayloadRow(variantRow, wishlistIds = []) {

  const vprice = toNum(variantRow.price);

  const discountPercent = resolveDiscountPercent(
    variantRow.discount_type,
    variantRow.discount_value,
    vprice
  );

  const vatPercent = toNum(variantRow.vat_rate ?? 0);

  const { finalPrice, discountValue } =
    calculateFinalPrice(vprice, discountPercent, vatPercent);

  const masterName = variantRow.master_name
    ? String(variantRow.master_name).trim()
    : "";

  const variantName = variantRow.name
    ? String(variantRow.name).trim()
    : "";

  const displayName =
    variantName
      ? `${masterName} ${variantName}`.trim()
      : masterName || variantName || "";

  const image =
    variantRow.variant_image ||
    variantRow.master_main_image ||
    "";

  return {
    id: String(variantRow.id),

    cart_key: `${variantRow.product_id}:${variantRow.id}`,

    type: "variant",

    product_id: String(variantRow.product_id),
    master_id: String(variantRow.product_id),
    variant_id: String(variantRow.id),

    wishlist_id: String(variantRow.product_id),

    name: sanitize(displayName),

    slug: sanitize(variantRow.master_slug || ""),

    original_price: Number(vprice).toFixed(2),

    final_price: Number(finalPrice).toFixed(2),

    discount_value: Number(discountValue).toFixed(2),

    discount_percent: Number(Number(discountPercent || 0).toFixed(2)),

    image: sanitize(image),

    brand: sanitize(variantRow.brand || ""),

    stock: toNum(variantRow.stock),

    stock_status: buildStockStatus(toNum(variantRow.stock)),

    variant_options: {
      sku: sanitize(variantRow.sku || ""),
    },

    created_at:
      variantRow.variant_created_at ||
      variantRow.created_at ||
      null,

    is_fav: wishlistIds.includes(String(variantRow.product_id)),

    in_cart_qty: 0,

    vat_included: Boolean(variantRow.vat_included),
  };
}



// ---------- DB helpers ----------


async function fetchTopProducts(limit = 30) {

  const clampedLimit = Math.max(1, Math.min(100, limit));

  const q = `
    SELECT
      product_id,
      SUM(quantity) AS total_qty
    FROM cart
    GROUP BY product_id
    ORDER BY total_qty DESC
    LIMIT $1
  `;

  const res = await pool.query(q, [clampedLimit]);

  return (res.rows || []).map((r) => ({
    product_id: toNum(r.product_id),
    total_qty: toNum(r.total_qty),
  }));
}



async function fetchRepresentativeVariant(productId) {

  const vr = await pool.query(
    `
    SELECT
      v.id,
      v.product_id,
      v.name,
      v.sku,
      v.price,
      v.stock,
      v.vat_included,
      v.shipping_class,
      v.created_at AS variant_created_at,
      v.updated_at AS variant_updated_at,

      p.slug AS master_slug,
      p.main_image AS master_main_image,
      p.brand,

      v.discount_type,
      v.discount_value,
      v.vat_rate,

      (
        SELECT filename
        FROM variant_media vm
        WHERE vm.variant_id = v.id
        ORDER BY vm.id DESC
        LIMIT 1
      ) AS variant_image,

      (
        SELECT COALESCE(SUM(quantity),0)
        FROM cart c
        WHERE c.variant_id = v.id
      ) AS variant_orders

    FROM product_variants v
    JOIN products p ON p.id = v.product_id

    WHERE v.product_id = $1

    ORDER BY variant_orders DESC, v.id ASC

    LIMIT 1
  `,
    [productId]
  );

  return vr.rows?.[0] || null;
}



// ---------- API ----------


exports.getFrequentProductsAPI = async (req, res = null, rawOnly = false) => {

  try {

    const limitParam = req?.query?.limit
      ? toNum(req.query.limit, 30)
      : 30;

    const limit = Math.max(1, Math.min(100, limitParam));

    const topProducts = await fetchTopProducts(limit);

    if (!topProducts.length) {

      if (rawOnly) return { success: true, data: [] };

      return res.json({ success: true, data: [] });
    }

    const wishlistIds = await safeGetWishlistIds(req);

    const payloads = [];

    for (const p of topProducts) {

      const variantRow =
        await fetchRepresentativeVariant(p.product_id);

      if (!variantRow) continue;

      const card =
        buildVariantPayloadRow(variantRow, wishlistIds);

      card.total_ordered_quantity = toNum(p.total_qty);

      payloads.push(card);
    }

    const result = payloads.slice(0, limit);

    if (rawOnly) return { success: true, data: result };

    return res.json({ success: true, data: result });

  } catch (err) {

    console.error("Frequent API Error:", err);

    if (!rawOnly && res) {
      return res.status(500).json({
        success: false,
        data: [],
      });
    }

    return { success: false, data: [] };
  }
};

// ---------- Socket emits ----------

exports.emitFrequentProductsUpdate = async (ioInstance, limit = 30) => {

  if (!ioInstance) return;

  try {

    const result =
      await exports.getFrequentProductsAPI(
        { query: { limit } },
        null,
        true
      );

    ioInstance.emit(
      "frequentProductsUpdated",
      result.data || []
    );

  } catch (e) {

    console.error("emitFrequentProductsUpdate error:", e);
  }
};



exports.emitProductAdded = async (ioInstance, productId) => {

  if (!ioInstance || !productId) return;

  try {

    const variantRow =
      await fetchRepresentativeVariant(productId);

    if (variantRow) {

      const payload =
        buildVariantPayloadRow(variantRow, []);

      ioInstance.emit("frequentProductAdded", payload);
    }

    await exports.emitFrequentProductsUpdate(ioInstance, 30);

  } catch (e) {

    console.error("emitProductAdded error:", e);
  }
};



exports.emitProductUpdated = async (ioInstance, productId) => {

  if (!ioInstance || !productId) return;

  try {

    await exports.emitProductAdded(ioInstance, productId);

    ioInstance.emit(
      "frequentProductUpdated",
      String(productId)
    );

    await exports.emitFrequentProductsUpdate(ioInstance, 30);

  } catch (e) {

    console.error("emitProductUpdated error:", e);
  }
};



exports.emitProductDeleted = async (ioInstance, productId) => {

  if (!ioInstance || !productId) return;

  try {

    const vr = await pool.query(
      "SELECT id FROM product_variants WHERE product_id = $1",
      [productId]
    );

    const variantIds =
      (vr.rows || []).map((r) => String(r.id));

    for (const vid of variantIds) {
      ioInstance.emit("frequentProductDeleted", vid);
    }

    ioInstance.emit(
      "frequentProductDeleted",
      String(productId)
    );

    await exports.emitFrequentProductsUpdate(ioInstance, 30);

  } catch (e) {

    console.error("emitProductDeleted error:", e);
  }
};



// ---------- exports ----------


module.exports = {

  getFrequentProductsAPI:
    exports.getFrequentProductsAPI,

  emitFrequentProductsUpdate:
    exports.emitFrequentProductsUpdate,

  emitProductAdded:
    exports.emitProductAdded,

  emitProductUpdated:
    exports.emitProductUpdated,

  emitProductDeleted:
    exports.emitProductDeleted,

  buildVariantPayloadRow,

  calculateFinalPrice,
};