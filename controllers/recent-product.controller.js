/*
 * recent-product.controller.variants-only.js
 *
 * Variant-only rewrite (default: first 30 variant cards)
 * - getRecentProductsAPI returns ONLY variant-level cards sourced from product_variants
 * - Socket emits remain the same (recentProductsUpdated, recentProductAdded, recentProductUpdated, recentProductDeleted)
 * - Parameterized queries, input clamping, defensive coding, and wishlist integration preserved
 * - Limits clamped to protect against DoS
 */

const { pool } = require("../includes/conn");
const wishlistController = require("./u/wishlist.controller");


// ---------- small helpers ----------
const toNum = (v, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

const sanitize = (v) =>
  typeof v === "string" ? v.replace(/[<>]/g, "") : v === null ? "" : String(v);

const buildStockStatus = (stock) => {
  if (stock <= 0) return "Out of Stock";
  if (stock <= 5) return `${stock} (Limited Stock!)`;
  return `${stock} available`;
};

const calculateFinalPrice = (basePrice, discountPercent = 0, vatPercent = 0) => {
  const bp = toNum(basePrice, 0);
  const d = toNum(discountPercent, 0);
  const v = toNum(vatPercent, 0);
  const discountValue = +(bp * (d / 100));
  const vatValue = +((bp - discountValue) * (v / 100));
  const finalPrice = +(bp - discountValue + vatValue).toFixed(2);
  return { finalPrice, discountValue, vatValue };
};

const resolveDiscountPercent = (discount_type, discount_value, price) => {
  const dv = toNum(discount_value, 0);
  const p = toNum(price, 0);
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
  } catch (e) {
    // wishlist errors are non-fatal for listing
    return [];
  }
}

// ---------- product payload builder (kept for compatibility but not used by listing) ----------
function buildProductPayloadRow(productRow, wishlistIds = []) {
  const variantStock = toNum(productRow.variant_stock ?? 0, 0);

  const minPrice = toNum(productRow.min_variant_price ?? 0, 0);
  const minVariantDiscountType = productRow.min_variant_discount_type;
  const minVariantDiscountValue = productRow.min_variant_discount_value;
  const minVariantVatRate = toNum(productRow.min_variant_vat_rate ?? 0, 0);
  const minVariantImage = productRow.min_variant_image || "";
  const minVariantVatIncluded = Boolean(productRow.min_variant_vat_included);

  const discountPercent = resolveDiscountPercent(
    minVariantDiscountType,
    minVariantDiscountValue,
    minPrice
  );
  const { finalPrice, discountValue } = calculateFinalPrice(
    minPrice,
    discountPercent,
    minVariantVatRate
  );

  const image = sanitize(minVariantImage || productRow.main_image || "");

  const displayStock = variantStock;
  const stockStatus = buildStockStatus(displayStock);

  return {
    id: String(productRow.id),
    type: "product",
    name: sanitize(productRow.name || ""),
    slug: sanitize(productRow.slug || ""),
    original_price: Number(minPrice).toFixed(2),
    final_price: Number(finalPrice).toFixed(2),
    discount_value: Number(discountValue).toFixed(2),
    discount_percent: Number(Number(discountPercent || 0).toFixed(2)),
    price_note: sanitize(productRow.price_note || ""),
    image,
    brand: sanitize(productRow.brand || ""),
    main_stock: 0,
    variant_stock: variantStock,
    stock: displayStock,
    stock_status: stockStatus,
    variants_count: toNum(productRow.variants_count ?? 0, 0),
    created_at: productRow.latest_variant || productRow.created_at,
    description: sanitize(productRow.description || ""),
    bullets: sanitize(productRow.bullets || ""),
    mpn: sanitize(productRow.mpn || ""),
    product_type: sanitize(productRow.product_type || ""),
    is_fav: wishlistIds.includes(String(productRow.id)),
    in_cart_qty: 0,
    vat_included: minVariantVatIncluded,
  };
}

// ---------- variant payload builder (primary card format) ----------
function buildVariantPayloadRow(variantRow, wishlistIds = []) {
  const vprice = toNum(variantRow.price, 0);
  const discountPercent = resolveDiscountPercent(
    variantRow.discount_type,
    variantRow.discount_value,
    vprice
  );
  const vatPercent = toNum(variantRow.vat_rate ?? 0, 0);
  const { finalPrice, discountValue } = calculateFinalPrice(vprice, discountPercent, vatPercent);

  const masterName = variantRow.master_name ? String(variantRow.master_name).trim() : "";
  const variantName = variantRow.name ? String(variantRow.name).trim() : "";
  const displayName = variantName ? `${masterName} ${variantName}`.trim() : masterName || variantName || "";

  const image = variantRow.variant_image || variantRow.master_main_image || "";

 return {
  id: String(variantRow.id),
  cart_key: `${variantRow.product_id}:${variantRow.id}`,
  type: "variant",
  product_id: String(variantRow.product_id),
  master_id: String(variantRow.product_id),
  variant_id: String(variantRow.id),
  wishlist_id: String(variantRow.product_id),
  name: sanitize(displayName || variantRow.name || masterName || ""),
  slug: sanitize(variantRow.master_slug || ""),
  original_price: Number(vprice).toFixed(2),
  final_price: Number(finalPrice).toFixed(2),
  discount_value: Number(discountValue).toFixed(2),
  discount_percent: Number(Number(discountPercent || 0).toFixed(2)),
  image: sanitize(image || ""),
  brand: sanitize(variantRow.brand || ""),
  stock: toNum(variantRow.stock, 0),
  stock_status: buildStockStatus(toNum(variantRow.stock, 0)),
  variant_options: { sku: sanitize(variantRow.sku || "") },
  created_at: variantRow.variant_created_at || variantRow.created_at || null,
  is_fav: wishlistIds.includes(String(variantRow.product_id)),
  in_cart_qty: 0,
  vat_included: Boolean(variantRow.vat_included),
};
}

// ---------- DB helper: fetch variant rows with media and product metadata ----------
async function fetchVariantCards(limit = 30, whereClause = "", params = []) {
  const q = `
    SELECT
      v.id,
      v.product_id,
      v.name,
      v.sku,
      v.price,
      v.stock,
      v.cost_price,
      v.length,
      v.width,
      v.height,
      v.weight,
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
      (SELECT filename FROM variant_media vm WHERE vm.variant_id = v.id ORDER BY vm.id DESC LIMIT 1) AS variant_image
    FROM product_variants v
    JOIN products p ON p.id = v.product_id
    ${whereClause}
    ORDER BY GREATEST(COALESCE(v.created_at, now()), COALESCE(v.updated_at, now())) DESC
    LIMIT $${params.length + 1}
  `;

  const allParams = params.concat([limit]);
  const res = await pool.query(q, allParams);
  return res.rows || [];
}

// ---------- API: returns variant-only cards (default 30) ----------
exports.getRecentProductsAPI = async (req, res = null, rawOnly = false) => {
  try {
    // default limit: 30; clamp to 1..100 to avoid abuse
    const limitParam = req?.query?.limit ? toNum(req.query.limit, 30) : 30;
    const limit = Math.max(1, Math.min(100, limitParam));

    // optional: in_stock_only (defaults true)
    const inStockOnly =
  req?.query?.in_stock_only !== undefined
    ? String(req.query.in_stock_only) === "true"
    : true;
    const whereClause = inStockOnly ? "WHERE v.stock > 0" : "";

    // fetch variant rows
    const variantRows = await fetchVariantCards(limit, whereClause, []);

    // wishlist flags (if available)
    const wishlistIds = await safeGetWishlistIds(req);

    const variantCards = variantRows.map((v) => buildVariantPayloadRow(v, wishlistIds));

    // client-side safety: sort and slice
    variantCards.sort((a, b) => {
      const ta = new Date(a.created_at || 0).getTime();
      const tb = new Date(b.created_at || 0).getTime();
      return tb - ta || String(a.id).localeCompare(String(b.id));
    });

    const sliced = variantCards.slice(0, limit);

    if (rawOnly) return { success: true, data: sliced };
    return res.json({ success: true, data: sliced });
  } catch (err) {
    console.error("Recent API Error (variants-only):", err);
    if (res) return res.status(500).json({ success: false, data: [] });
    return { success: false, data: [] };
  }
};

// ---------- Socket emits: variant-only behavior (keeps event names unchanged) ----------

// Emit full feed (variant cards)
exports.emitRecentProductsUpdate = async (ioInstance, limit = 30) => {
  if (!ioInstance?.emit) return;
  try {
    const recent = await exports.getRecentProductsAPI({ query: { limit } }, null, true);
    ioInstance.emit("recentProductsUpdated", recent.data || []);
  } catch (e) {
    console.error("emitRecentProductsUpdate error:", e && e.message ? e.message : e);
  }
};

// Emit product added -> emit variant cards for that product only (preserve compatibility)
exports.emitProductAdded = async (ioInstance, productId) => {
  if (!ioInstance || !productId) return;
  try {
    // get all variants for the product (no stock filter; callers may expect full data)
    const rows = await fetchVariantCards(1000, "WHERE v.product_id = $1", [productId]);
    const wishlistIds = []; // emit context usually has no req
    for (const v of rows) {
      const payloads = rows.map(v =>
  buildVariantPayloadRow(v, wishlistIds)
);

ioInstance.emit("recentProductAdded", payloads);
    }

    // finally emit summary update (top N)
    await exports.emitRecentProductsUpdate(ioInstance, 30);
  } catch (e) {
    console.error("emitProductAdded error:", e && e.message ? e.message : e);
  }
};

// Emit product updated -> re-emit variants then ID-based compatibility event
exports.emitProductUpdated = async (ioInstance, productId) => {
  if (!ioInstance || !productId) return;
  try {
    await exports.emitProductAdded(ioInstance, productId); // re-emit variant cards
    ioInstance.emit("recentProductUpdated", String(productId));
    await exports.emitRecentProductsUpdate(ioInstance, 30);
  } catch (e) {
    console.error("emitProductUpdated error:", e && e.message ? e.message : e);
  }
};

// Emit product deleted: emit variant ids then master id
exports.emitProductDeleted = async (ioInstance, productId) => {
  if (!ioInstance || !productId) return;
  try {
    const vr = await pool.query("SELECT id FROM product_variants WHERE product_id = $1", [productId]);
    const variantIds = (vr.rows || []).map((r) => String(r.id)).filter(Boolean);
    for (const vid of variantIds) {
      ioInstance.emit("recentProductDeleted", vid);
    }
    ioInstance.emit("recentProductDeleted", String(productId));
    await exports.emitRecentProductsUpdate(ioInstance, 30);
  } catch (e) {
    console.error("emitProductDeleted error:", e && e.message ? e.message : e);
  }
};

// ---------- exports ----------
module.exports = {
  getRecentProductsAPI: exports.getRecentProductsAPI,
  emitRecentProductsUpdate: exports.emitRecentProductsUpdate,
  emitProductAdded: exports.emitProductAdded,
  emitProductUpdated: exports.emitProductUpdated,
  emitProductDeleted: exports.emitProductDeleted,
  buildProductPayloadRow,
  buildVariantPayloadRow,
  calculateFinalPrice,
};
