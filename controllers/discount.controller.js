/*
 * discount-product.controller.js
 * FINAL VERSION (OPTIMIZED)
 * - Carousel: Top 20 (discounted first, then latest)
 * - Banners: Top 5 highest discount
 * - Real-time Socket.IO support
 */

const { pool } = require("../includes/conn");
const wishlistController = require("./u/wishlist.controller");

const LIMIT_CAROUSEL = 20;
const LIMIT_BANNERS = 5;

// ---------- HELPERS ----------
const toNum = (v, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

const sanitize = (v) =>
  typeof v === "string" ? v.replace(/[<>]/g, "") : v === null ? "" : String(v);

// ---------- PRICE CALC ----------
const calculateFinalPrice = (basePrice, discountPercent = 0, vatPercent = 0) => {
  const bp = toNum(basePrice, 0);
  const d = toNum(discountPercent, 0);
  const v = toNum(vatPercent, 0);

  const discountValue = bp * (d / 100);
  const vatValue = (bp - discountValue) * (v / 100);
  const finalPrice = +(bp - discountValue + vatValue).toFixed(2);

  return {
    finalPrice,
    discountValue: +discountValue.toFixed(2),
    vatValue: +vatValue.toFixed(2),
  };
};

// ---------- DISCOUNT RESOLVER ----------
const resolveDiscountPercent = (type, value, price) => {
  const dv = toNum(value, 0);
  const p = toNum(price, 0);

  if (!type) return 0;

  const t = String(type).toLowerCase();

  if (t === "percent" || t === "percentage") return dv;
  if (t === "fixed" || t === "amount") {
    return p > 0 ? (dv / p) * 100 : 0;
  }

  return 0;
};

// ---------- WISHLIST ----------
async function safeGetWishlistIds(req) {
  try {
    if (!wishlistController?.getWishlistIds) return [];
    const ids = await wishlistController.getWishlistIds(req);
    return Array.isArray(ids) ? ids.map(String) : [];
  } catch {
    return [];
  }
}

// ---------- PAYLOAD BUILDER ----------
const buildVariantPayloadRow = (row, wishlistIds = []) => {
  const price = toNum(row.price, 0);

  const discountPercent = resolveDiscountPercent(
    row.discount_type,
    row.discount_value,
    price
  );

  const vatPercent = toNum(row.vat_rate, 0);

  const { finalPrice, discountValue } = calculateFinalPrice(
    price,
    discountPercent,
    vatPercent
  );

  const name = [row.master_name, row.name].filter(Boolean).join(" ").trim();

  const image = row.variant_image || row.master_main_image || "";

  return {
    id: String(row.id),
    cart_key: `${row.product_id}:${row.id}`,
    type: "variant",

    product_id: String(row.product_id),
    master_id: String(row.product_id),
    variant_id: String(row.id),

    wishlist_id: String(row.product_id),

    name: sanitize(name),
    slug: sanitize(row.master_slug || ""),

    original_price: price.toFixed(2),
    final_price: finalPrice.toFixed(2),

    discount_value: discountValue.toFixed(2),
    discount_percent: +discountPercent.toFixed(2),

    image: sanitize(image),
    brand: sanitize(row.brand || ""),

    stock: toNum(row.stock, 0),

    variant_options: {
      sku: sanitize(row.sku || ""),
    },

    created_at: row.variant_created_at || row.created_at || null,

    is_fav: wishlistIds.includes(String(row.product_id)),
    vat_included: Boolean(row.vat_included),
  };
};

// ---------- FETCH VARIANTS ----------
async function fetchVariantCards(limit = 100) {
  const q = `
    SELECT
      v.id,
      v.product_id,
      v.name,
      v.sku,
      v.price,
      v.stock,
      v.discount_type,
      v.discount_value,
      v.vat_rate,
      v.created_at AS variant_created_at,
      p.slug AS master_slug,
      p.brand,
      p.main_image AS master_main_image,
      (
        SELECT filename 
        FROM variant_media vm 
        WHERE vm.variant_id = v.id 
        ORDER BY vm.id DESC 
        LIMIT 1
      ) AS variant_image
    FROM product_variants v
    JOIN products p ON p.id = v.product_id
    ORDER BY GREATEST(
      COALESCE(v.updated_at, v.created_at),
      COALESCE(p.updated_at, p.created_at)
    ) DESC
    LIMIT $1
  `;

  const res = await pool.query(q, [limit]);
  return res.rows || [];
}

// ---------- MAIN API ----------
const getDiscountProductsAPI = async (req, res = null, rawOnly = false) => {
  try {
    const wishlistIds = await safeGetWishlistIds(req);

    const rows = await fetchVariantCards(100);

    const all = rows.map((r) => buildVariantPayloadRow(r, wishlistIds));

    // ---------- SPLIT ----------
    const discounted = all.filter((p) => toNum(p.discount_percent) > 0);
    const nonDiscounted = all.filter((p) => toNum(p.discount_percent) === 0);

    // ---------- SORT ----------
    discounted.sort((a, b) => {
      if (b.discount_percent !== a.discount_percent) {
        return b.discount_percent - a.discount_percent;
      }
      if (toNum(b.discount_value) !== toNum(a.discount_value)) {
        return toNum(b.discount_value) - toNum(a.discount_value);
      }
      return new Date(b.created_at) - new Date(a.created_at);
    });

    nonDiscounted.sort(
      (a, b) => new Date(b.created_at) - new Date(a.created_at)
    );

    // ---------- CAROUSEL ----------
    const carousel = [...discounted, ...nonDiscounted].slice(
      0,
      LIMIT_CAROUSEL
    );

    // ---------- BANNERS ----------
    const banners = discounted.slice(0, LIMIT_BANNERS);
    const top2 = banners.slice(0, 2);
    const grid3 = banners.slice(2, 5);

    const result = {
      carousel,
      banners,
      top2,
      grid3,
    };

    if (rawOnly) return { success: true, data: result };

    return res.json({ success: true, data: result });
  } catch (err) {
    console.error("DiscountProductsAPI Error:", err);

    const empty = { carousel: [], banners: [], top2: [], grid3: [] };

    if (res) return res.status(500).json({ success: false, data: empty });

    return { success: false, data: empty };
  }
};

// ---------- SOCKET.IO ----------
const emitDiscountUpdate = async (io) => {
  if (!io) return;

  try {
    const response = await getDiscountProductsAPI({}, null, true);

    // Always send structured object
    io.emit("discountProductsUpdated", response.data);
  } catch (err) {
    console.error("Socket Emit Error:", err);
  }
};

// Optional: auto trigger helper (call this after DB update)
const triggerDiscountUpdate = async (io) => {
  await emitDiscountUpdate(io);
};

// ---------- EXPORTS ----------
module.exports = {
  getDiscountProductsAPI,
  emitDiscountUpdate,
  triggerDiscountUpdate,
  buildVariantPayloadRow,
};