/*
 * variant-product.controller.js
 *
 * Variant-first controller that returns variant cards grouped by product parent category.
 * - Each group object: { heading: "<parent category name>", parent_category_id: "<id>", items: [ variant-cards... ] }
 * - Default behavior: limit total variant rows returned (clamped), optional in_stock_only filter
 * - Wishlist integration is non-fatal and optional
 * - Socket emits preserved (emitRecentProductsUpdate emits grouped data)
 *
 * Notes:
 * - Assumes a table `parent_categories` with fields `id` and `name`.
 * - Assumes `products.parent_category_id` exists and can be null.
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
    parent_category_id: variantRow.parent_category_id ? String(variantRow.parent_category_id) : null,
    parent_category_name: variantRow.parent_category_name ? sanitize(variantRow.parent_category_name) : "Uncategorized",
  };
}

// ---------- DB helper: fetch variant rows with media, product metadata, and parent category ----------
async function fetchVariantCards(limit = 100, whereClause = "", params = []) {
  // select parent category id/name from parent_categories (left join, products may have null parent_category_id)
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
      p.parent_category_id,
      pc.name AS parent_category_name,
      (SELECT filename FROM variant_media vm WHERE vm.variant_id = v.id ORDER BY vm.id DESC LIMIT 1) AS variant_image
    FROM product_variants v
    JOIN products p ON p.id = v.product_id
    LEFT JOIN parent_categories pc ON pc.id = p.parent_category_id
    ${whereClause}
    ORDER BY GREATEST(COALESCE(v.created_at, now()), COALESCE(v.updated_at, now())) DESC
    LIMIT $${params.length + 1}
  `;

  const allParams = params.concat([limit]);
  const res = await pool.query(q, allParams);
  return res.rows || [];
}

// ---------- API: returns variant cards grouped by parent category ----------
exports.getRecentProductsAPI = async (req, res = null, rawOnly = false) => {
  try {
    // default limit: 100 total variant rows; clamp to 1..1000
    const limitParam = req?.query?.limit ? toNum(req.query.limit, 100) : 100;
    const limit = Math.max(1, Math.min(1000, limitParam));

    // optional: in_stock_only (defaults true)
    const inStockOnly = req?.query?.in_stock_only !== undefined ? Boolean(req.query.in_stock_only) : true;
    const whereClause = inStockOnly ? "WHERE v.stock > 0" : "";

    // fetch variant rows (includes parent_category fields)
    const variantRows = await fetchVariantCards(limit, whereClause, []);

    // wishlist flags (if available)
    const wishlistIds = await safeGetWishlistIds(req);

    // build variant payloads
    const payloads = variantRows.map((v) => buildVariantPayloadRow(v, wishlistIds));

    // group by parent_category_name (fall back to 'Uncategorized')
    const groupsMap = new Map();
    for (const p of payloads) {
      const heading = p.parent_category_name || "Uncategorized";
      const parentId = p.parent_category_id || null;
      const key = `${heading}::${parentId ?? "null"}`;

      if (!groupsMap.has(key)) {
        groupsMap.set(key, {
          heading,
          parent_category_id: parentId,
          items: [],
        });
      }
      groupsMap.get(key).items.push(p);
    }

    // Convert map -> array and sort groups alphabetically by heading
    const grouped = Array.from(groupsMap.values())
      .map((g) => {
        // sort items in each group by created_at desc then id for determinism
        g.items.sort((a, b) => {
          const ta = new Date(a.created_at || 0).getTime();
          const tb = new Date(b.created_at || 0).getTime();
          if (tb !== ta) return tb - ta;
          return String(a.id).localeCompare(String(b.id));
        });
        return g;
      })
      .sort((a, b) => String(a.heading || "").localeCompare(String(b.heading || "")));

    if (rawOnly) return { success: true, data: grouped };
    return res.json({ success: true, data: grouped });
  } catch (err) {
    console.error("Variant grouped API Error:", err);
    if (res) return res.status(500).json({ success: false, data: [] });
    return { success: false, data: [] };
  }
};

// ---------- Socket emits: grouped behavior (keeps event names unchanged) ----------

// Emit full grouped feed
exports.emitRecentProductsUpdate = async (ioInstance, limit = 100) => {
  if (!ioInstance) return;
  try {
    const recent = await exports.getRecentProductsAPI({ query: { limit } }, null, true);
    ioInstance.emit("recentProductsUpdated", recent.data || []);
  } catch (e) {
    console.error("emitRecentProductsUpdate error:", e && e.message ? e.message : e);
  }
};

// Emit product added -> emit variant cards for that product only (preserve compatibility)
// For product added we emit each variant payload as 'recentProductAdded' (individual payload),
// and then emit grouped summary update.
exports.emitProductAdded = async (ioInstance, productId) => {
  if (!ioInstance || !productId) return;
  try {
    // get all variants for the product (no stock filter; callers may expect full data)
    const rows = await fetchVariantCards(1000, "WHERE v.product_id = $1", [productId]);
    const wishlistIds = []; // emit context usually has no req
    for (const v of rows) {
      const payload = buildVariantPayloadRow(v, wishlistIds);
      ioInstance.emit("recentProductAdded", payload);
    }

    // finally emit grouped summary update (top N)
    await exports.emitRecentProductsUpdate(ioInstance, 100);
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
    await exports.emitRecentProductsUpdate(ioInstance, 100);
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
    await exports.emitRecentProductsUpdate(ioInstance, 100);
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
  buildVariantPayloadRow,
  calculateFinalPrice,
};