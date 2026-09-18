"use strict";

const { pool } = require("../includes/conn");

let wishlistController = null;
let cartController = null;

try { wishlistController = require("./wishlist.controller"); } catch (_) {}
try { cartController = require("./cart.controller"); } catch (_) {}

const DEBUG = String(process.env.PRODUCT_DETAIL_DEBUG || "true").toLowerCase() !== "false";
const PRODUCT_MEDIA_BASE_URL = String(process.env.PRODUCT_MEDIA_BASE_URL || "").trim();

const MAX_DETAIL_VARIANTS = clamp(process.env.PRODUCT_DETAIL_VARIANT_LIMIT || 1000, 1, 1000);
const MAX_RECENT_VARIANTS = clamp(process.env.PRODUCT_DETAIL_RECENT_LIMIT || 1000, 1, 1000);
const MAX_RELATED_PRODUCTS = clamp(process.env.PRODUCT_DETAIL_RELATED_LIMIT || 12, 1, 48);
const MAX_MODEL_VARIANTS = clamp(process.env.PRODUCT_DETAIL_MODEL_LIMIT || 12, 1, 48);
const MAX_FBT_ITEMS = clamp(process.env.PRODUCT_DETAIL_FBT_LIMIT || 4, 2, 8);
const MAX_VIEWED_ITEMS = clamp(process.env.PRODUCT_DETAIL_VIEWED_LIMIT || 8, 2, 16);
const MAX_COMPARE_ITEMS = clamp(process.env.PRODUCT_DETAIL_COMPARE_LIMIT || 4, 2, 8);

function debugLog(...args) { if (DEBUG) console.log("[product-detail]", ...args); }
function debugWarn(...args) { if (DEBUG) console.warn("[product-detail]", ...args); }
function debugError(...args) { console.error("[product-detail]", ...args); }

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toNumberOrNull(value) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, toNumber(value, min)));
}

function safeString(value) {
  if (value === undefined || value === null) return "";
  return typeof value === "string" ? value : String(value);
}

function sanitizeText(value) {
  return safeString(value).replace(/\u0000/g, "").trim();
}

function normalizeUrl(value) {
  const text = sanitizeText(value);
  if (!text) return "";
  if (/^\s*javascript:/i.test(text)) return "";
  if (/^data:/i.test(text)) return text;
  if (/^https?:\/\//i.test(text)) {
    try { return new URL(text).toString(); } catch { return ""; }
  }
  if (text.startsWith("/")) return text;
  return text;
}

function sanitizeFilename(value) {
  const text = sanitizeText(value);
  if (!text) return "";
  return text.replace(/[\\/]/g, "").replace(/\.{2,}/g, "");
}

function joinMediaPath(filename) {
  const clean = sanitizeFilename(filename);
  if (!clean) return "";
  if (PRODUCT_MEDIA_BASE_URL) {
    try { return new URL(`/uploads/products/${clean}`, PRODUCT_MEDIA_BASE_URL).toString(); } catch {}
  }
  return `/uploads/products/${clean}`;
}

function buildMediaUrl(media) {
  if (!media) return "";
  if (typeof media === "string") {
    const text = sanitizeText(media);
    if (!text) return "";
    if (/^https?:\/\//i.test(text) || text.startsWith("/") || /^data:/i.test(text)) return normalizeUrl(text);
    const filename = sanitizeFilename(text);
    return filename ? joinMediaPath(filename) : "";
  }
  if (typeof media !== "object") return "";
  const explicit = media.url || media.path || media.src;
  if (explicit) return normalizeUrl(explicit);
  const filename = media.filename || media.originalname || media.name;
  if (filename) return joinMediaPath(filename);
  return "";
}

function parseJsonArray(value) {
  if (value === undefined || value === null || value === "") return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "object") return [value];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
    } catch {
      debugWarn("JSON parse failed while normalizing JSON array");
      return [];
    }
  }
  return [];
}

function safeQuery(text, params) {
  return pool.query(text, params).then((r) => (Array.isArray(r?.rows) ? r.rows : [])).catch((err) => {
    debugError("DB QUERY ERROR");
    debugError("Message:", err?.message || err);
    debugError("Query:", text);
    debugError("Params:", params);
    throw err;
  });
}

function safeQueryOptional(text, params) {
  return pool.query(text, params).then((r) => (Array.isArray(r?.rows) ? r.rows : [])).catch((err) => {
    debugWarn("Optional query failed:", err?.message || err);
    return [];
  });
}

function readRequestIds(req) {
  const productId = toNumberOrNull(req?.params?.product_id ?? req?.params?.productId ?? req?.query?.product_id ?? req?.query?.productId ?? req?.body?.product_id ?? req?.body?.productId);
  const variantId = toNumberOrNull(req?.params?.variant_id ?? req?.params?.variantId ?? req?.params?.id ?? req?.query?.variant_id ?? req?.query?.variantId ?? req?.query?.id ?? req?.body?.variant_id ?? req?.body?.variantId);
  return { productId, variantId };
}

function pickFirst(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return "";
}

function toWishSet(ids) {
  return new Set((Array.isArray(ids) ? ids : []).map(String));
}

async function safeGetWishlistIds(req) {
  try {
    if (!wishlistController || typeof wishlistController.getWishlistIds !== "function") return [];
    const ids = await wishlistController.getWishlistIds(req);
    return Array.isArray(ids) ? ids.map(String) : [];
  } catch (err) {
    debugWarn("safeGetWishlistIds failed:", err?.message || err);
    return [];
  }
}

async function safeGetCartMap(req) {
  try {
    if (!cartController) return {};
    if (typeof cartController.getCartMap === "function") {
      const map = await cartController.getCartMap(req);
      return map && typeof map === "object" ? map : {};
    }
    if (typeof cartController.getCartItems === "function") {
      const items = await cartController.getCartItems(req);
      if (!Array.isArray(items)) return {};
      const map = {};
      for (const item of items) {
        if (!item) continue;
        const qty = toNumber(item.qty ?? item.quantity ?? item.qty_in_cart ?? 0, 0);
        if (item.cart_key) map[String(item.cart_key)] = qty;
        else if (item.product_id != null && item.variant_id != null) map[`${item.product_id}:${item.variant_id}`] = qty;
        else if (item.variant_id != null) map[String(item.variant_id)] = qty;
      }
      return map;
    }
    return {};
  } catch (err) {
    debugWarn("safeGetCartMap failed:", err?.message || err);
    return {};
  }
}

function tryCartLookup(cartMap, productId, variantId) {
  if (!cartMap || typeof cartMap !== "object") return 0;
  const keys = [`${productId}:${variantId}`, String(variantId), String(productId)];
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(cartMap, key)) return toNumber(cartMap[key], 0);
  }
  return 0;
}

function buildStockStatus(stock, lowStockThreshold = 5) {
  const qty = toNumber(stock, 0);
  const threshold = toNumber(lowStockThreshold, 5);
  if (qty <= 0) return "out_of_stock";
  if (qty <= threshold) return "low_stock";
  return "in_stock";
}

function resolveDiscountPercent(discountType, discountValue, price) {
  const dv = toNumber(discountValue, 0);
  const p = toNumber(price, 0);
  const t = safeString(discountType).toLowerCase();
  if (!t) return 0;
  if (t === "percent" || t === "percentage") return dv;
  if (t === "fixed" || t === "amount") return p > 0 ? (dv / p) * 100 : 0;
  return 0;
}

function calculateFinalPrice(basePrice, discountPercent = 0, vatPercent = 0) {
  const bp = toNumber(basePrice, 0);
  const d = toNumber(discountPercent, 0);
  const v = toNumber(vatPercent, 0);
  const discountValue = bp * (d / 100);
  const taxable = Math.max(0, bp - discountValue);
  const vatValue = taxable * (v / 100);
  const finalPrice = taxable + vatValue;
  return { finalPrice: +finalPrice.toFixed(2), discountValue: +discountValue.toFixed(2), vatValue: +vatValue.toFixed(2) };
}

const STORAGE_RE = /\b(\d+(?:\.\d+)?\s?(?:gb|tb|mb|kb))\b/gi;
const RAM_RE = /\b(\d+\s?gb\s?ram|\d+\s?ram)\b/gi;
const COLOR_RE = /\b(black|white|silver|gray|grey|gold|blue|red|green|yellow|pink|purple|orange|graphite|space gray|midnight|starlight|natural titanium|blue titanium|black titanium|white titanium|desert titanium|pearl|beige|bronze|mint|lavender|sky blue)\b/gi;
const COMMON_VARIANT_RE = /\b(5g|4g|lte|wifi|dual sim|single sim|e-sim|esim|unlocked|global|international|new|used|refurbished|sealed)\b/gi;
const EXTRA_PUNCT_RE = /[|/,:;]+/g;

function deriveModelKey(text = "") {
  return sanitizeText(text)
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(STORAGE_RE, " ")
    .replace(RAM_RE, " ")
    .replace(COLOR_RE, " ")
    .replace(COMMON_VARIANT_RE, " ")
    .replace(EXTRA_PUNCT_RE, " ")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getModelKeyFromVariantRow(row = {}) {
  const source = pickFirst(row.model_group, row.model_slug, row.variant_name, row.display_name, row.product_name, row.name);
  return deriveModelKey(source);
}

function getModelKeyFromProduct(product = {}) {
  return deriveModelKey(pickFirst(product.model_group, product.name, product.slug));
}

function normalizeAttributes(input) {
  const items = parseJsonArray(input);
  return items.filter(Boolean).map((item) => ({
    attribute_id: item?.attribute_id != null ? String(item.attribute_id) : null,
    attribute_name: sanitizeText(item?.attribute_name || item?.attribute || ""),
    attribute_slug: sanitizeText(item?.attribute_slug || ""),
    value_id: item?.value_id != null ? String(item.value_id) : null,
    value_name: sanitizeText(item?.value || item?.value_name || item?.value_label || ""),
    value_slug: sanitizeText(item?.value_slug || ""),
  }));
}

function normalizeVariantMedia(variantMedia, fallbackImage = "") {
  const items = parseJsonArray(variantMedia);
  const images = [];
  const seen = new Set();
  for (const item of items) {
    const url = buildMediaUrl(item);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    images.push(url);
  }
  let primaryImage = images[0] || normalizeUrl(fallbackImage);
  return { images, primaryImage, raw: items };
}
function pickFirst(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }
  return "";
}

function firstNonEmpty(...values) {
  return sanitizeText(pickFirst(...values));
}
function buildVariantPayloadRow(variantRow = {}, wishlistIds = [], cartMap = {}, allVariants = []) {
  const wishSet = wishlistIds instanceof Set ? wishlistIds : toWishSet(wishlistIds);
  const basePrice = toNumber(variantRow.price ?? 0, 0);
  const discountPercent = resolveDiscountPercent(variantRow.discount_type, variantRow.discount_value, basePrice);
  const vatPercent = toNumber(variantRow.vat_rate ?? 0, 0);
  const calculated = calculateFinalPrice(basePrice, discountPercent, vatPercent);

  const finalPrice = variantRow.final_price !== undefined && variantRow.final_price !== null
    ? toNumber(variantRow.final_price, calculated.finalPrice)
    : calculated.finalPrice;

  const discountValue = variantRow.discount_value !== undefined && variantRow.discount_value !== null
    ? toNumber(variantRow.discount_value, calculated.discountValue)
    : calculated.discountValue;

  const productId = String(variantRow.product_id ?? variantRow.product_id_master ?? "");
  const variantId = String(variantRow.id ?? variantRow.variant_id ?? "");
  const masterName = firstNonEmpty(variantRow.product_name, variantRow.name);
  const variantName = firstNonEmpty(variantRow.variant_name, variantRow.display_name);
  const displayName = masterName && variantName ? `${masterName} ${variantName}`.trim() : masterName || variantName;

  const media = normalizeVariantMedia(variantRow.variant_media, variantRow.product_main_image || variantRow.image || "");
  const attributes = Array.isArray(variantRow.attributes) ? normalizeAttributes(variantRow.attributes) : [];

  const product = {
    id: productId,
    name: sanitizeText(variantRow.product_name || ""),
    slug: sanitizeText(variantRow.product_slug || variantRow.master_slug || ""),
    product_type: sanitizeText(variantRow.product_type || ""),
    brand: sanitizeText(variantRow.brand || ""),
    mpn: sanitizeText(variantRow.mpn || ""),
    bullets: sanitizeText(variantRow.bullets || ""),
    description: sanitizeText(variantRow.product_description || variantRow.description || ""),
    short_description: sanitizeText(variantRow.short_description || ""),
    parent_category_id: variantRow.parent_category_id ?? null,
    category_id: variantRow.category_id ?? null,
    visibility: sanitizeText(variantRow.visibility || ""),
    meta_keywords: sanitizeText(variantRow.meta_keywords || ""),
    meta_title: sanitizeText(variantRow.meta_title || ""),
    meta_description: sanitizeText(variantRow.meta_description || ""),
    main_image: normalizeUrl(variantRow.product_main_image || ""),
    product_videos: variantRow.product_videos || null,
    display_locations: variantRow.display_locations || null,
    display_timing: variantRow.display_timing || null,
    created_at: variantRow.product_created_at || null,
    updated_at: variantRow.product_updated_at || null,
  };

  return {
    id: variantId,
    cart_key: `${productId}:${variantId}`,
    type: "variant",
    product_id: productId,
    master_id: productId,
    variant_id: variantId,
    name: sanitizeText(displayName || variantRow.display_name || variantRow.variant_name || ""),
    display_name: sanitizeText(variantRow.display_name || displayName || ""),
    slug: sanitizeText(variantRow.master_slug || variantRow.product_slug || ""),
    original_price: +basePrice.toFixed(2),
    sale_price: variantRow.sale_price != null ? +toNumber(variantRow.sale_price, 0).toFixed(2) : null,
    final_price: +finalPrice.toFixed(2),
    discount_value: +discountValue.toFixed(2),
    discount_percent: +Number(discountPercent || 0).toFixed(2),
    image: normalizeUrl(media.primaryImage || variantRow.product_main_image || ""),
    images: Array.isArray(media.images) ? media.images.map(normalizeUrl).filter(Boolean) : [],
    variant_media: Array.isArray(media.raw) ? media.raw : [],
    brand: sanitizeText(variantRow.brand || ""),
    stock: toNumber(variantRow.stock, 0),
    low_stock_threshold: toNumber(variantRow.low_stock_threshold, 5),
    stock_status: buildStockStatus(variantRow.stock, variantRow.low_stock_threshold),
    track_inventory: Boolean(variantRow.track_inventory),
    allow_backorders: Boolean(variantRow.allow_backorders),
    barcode: sanitizeText(variantRow.barcode || ""),
    barcode_type: sanitizeText(variantRow.barcode_type || ""),
    variant_options: {
      sku: sanitizeText(variantRow.sku || ""),
      cost_price: +toNumber(variantRow.cost_price, 0).toFixed(2),
      weight: toNumber(variantRow.weight, 0),
      weight_unit: sanitizeText(variantRow.weight_unit || ""),
      length: toNumber(variantRow.length, 0),
      width: toNumber(variantRow.width, 0),
      height: toNumber(variantRow.height, 0),
      dimension_unit: sanitizeText(variantRow.dimension_unit || ""),
      shipping_class: sanitizeText(variantRow.shipping_class || ""),
      attributes,
    },
    attributes,
    created_at: variantRow.variant_created_at || null,
    updated_at: variantRow.variant_updated_at || null,
    is_default: Boolean(variantRow.is_default),
    is_active: Boolean(variantRow.is_active),
    sort_order: toNumber(variantRow.sort_order, 0),
    is_fav: Boolean(wishSet.has(variantId) || wishSet.has(productId)),
    in_cart_qty: toNumber(tryCartLookup(cartMap, productId, variantId), 0),
    vat_included: Boolean(variantRow.vat_included),
    vat_rate: toNumber(variantRow.vat_rate, 0),
    product,
    all_variants: Array.isArray(allVariants) ? allVariants : [],
  };
}

function buildProductPayloadFromRows(rows = [], wishlistIds = [], cartMap = {}) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const wishSet = wishlistIds instanceof Set ? wishlistIds : toWishSet(wishlistIds);

  const lightweightVariants = rows.map((row) => {
    const media = normalizeVariantMedia(row.variant_media, row.product_main_image || row.image || "");
    return {
      id: String(row.id ?? row.variant_id ?? ""),
      name: sanitizeText(row.variant_name || row.display_name || row.product_name || ""),
      display_name: sanitizeText(row.display_name || ""),
      price: toNumber(row.price, 0),
      final_price: toNumber(row.final_price, 0),
      stock: toNumber(row.stock, 0),
      image: normalizeUrl(media.primaryImage || row.product_main_image || row.image || ""),
      images: media.images,
      is_default: Boolean(row.is_default),
      is_active: Boolean(row.is_active),
      sort_order: toNumber(row.sort_order, 0),
    };
  });

  const merged = {};
  for (const row of rows) {
    for (const [key, value] of Object.entries(row || {})) {
      if (merged[key] === undefined || merged[key] === null || merged[key] === "") merged[key] = value;
    }
  }

  const productId = String(pickFirst(rows[0].product_id_master, rows[0].product_id, lightweightVariants[0]?.id || ""));
  const variantStock = lightweightVariants.reduce((sum, variant) => sum + toNumber(variant.stock, 0), 0);
  const prices = lightweightVariants.map((variant) => toNumber(variant.final_price, 0));
  const minPrice = prices.length ? Math.min(...prices) : 0;
  const selectedMainImage = normalizeUrl(merged.product_main_image || "") || lightweightVariants.find((v) => v.image)?.image || "";

  return {
    id: productId,
    type: "product",
    name: sanitizeText(merged.product_name || merged.name || ""),
    slug: sanitizeText(merged.product_slug || merged.master_slug || ""),
    product_type: sanitizeText(merged.product_type || ""),
    brand: sanitizeText(merged.brand || ""),
    mpn: sanitizeText(merged.mpn || ""),
    bullets: sanitizeText(merged.bullets || ""),
    description: sanitizeText(merged.product_description || merged.description || ""),
    short_description: sanitizeText(merged.short_description || ""),
    parent_category_id: merged.parent_category_id ?? null,
    category_id: merged.category_id ?? null,
    visibility: sanitizeText(merged.visibility || ""),
    meta_keywords: sanitizeText(merged.meta_keywords || ""),
    meta_title: sanitizeText(merged.meta_title || ""),
    meta_description: sanitizeText(merged.meta_description || ""),
    main_image: selectedMainImage,
    product_videos: merged.product_videos || null,
    display_locations: merged.display_locations || null,
    display_timing: merged.display_timing || null,
    created_at: merged.product_created_at || null,
    updated_at: merged.product_updated_at || null,
    variants_count: lightweightVariants.length,
    variant_stock: variantStock,
    stock_status: buildStockStatus(variantStock, merged.low_stock_threshold),
    min_price: +minPrice.toFixed(2),
    is_fav: Boolean(wishSet.has(productId)),
    in_cart_qty: 0,
  };
}

function buildCompactRelatedCard(row = {}, wishlistIds = [], cartMap = {}) {
  const payload = buildVariantPayloadRow(row, wishlistIds, cartMap, []);
  return { ...payload, all_variants: [], variant_options: undefined, attributes: [], product: payload.product };
}

function dedupeCardsByKey(cards, keyFn) {
  const unique = [];
  const seen = new Set();
  for (const card of Array.isArray(cards) ? cards : []) {
    const key = sanitizeText(keyFn(card));
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(card);
  }
  return unique;
}

function buildVariantSelectSQL() {
  return `
    SELECT
      v.id,
      v.product_id,
      v.name AS variant_name,
      v.display_name,
      v.sku,
      v.price,
      v.sale_price,
      v.cost_price,
      v.stock,
      v.low_stock_threshold,
      v.track_inventory,
      v.allow_backorders,
      v.barcode,
      v.barcode_type,
      v.weight,
      v.weight_unit,
      v.length,
      v.width,
      v.height,
      v.dimension_unit,
      v.shipping_class,
      v.is_active,
      v.is_default,
      v.sort_order,
      v.discount_type,
      v.discount_value,
      v.vat_rate,
      v.vat_included,
      v.created_at AS variant_created_at,
      v.updated_at AS variant_updated_at,
      p.id AS product_id_master,
      p.slug AS product_slug,
      p.product_type,
      p.brand,
      p.mpn,
      p.bullets,
      p.description AS product_description,
      p.short_description,
      p.parent_category_id,
      p.category_id,
      p.visibility,
      p.meta_keywords,
      p.meta_title,
      p.meta_description,
      p.main_image AS product_main_image,
      p.product_videos,
      p.display_locations,
      p.display_timing,
      p.created_at AS product_created_at,
      p.updated_at AS product_updated_at,
      CASE
        WHEN LOWER(COALESCE(v.discount_type, '')) IN ('percentage', 'percent') AND v.discount_value IS NOT NULL
          THEN ROUND(v.price - (v.price * v.discount_value / 100.0), 2)
        WHEN LOWER(COALESCE(v.discount_type, '')) IN ('fixed', 'amount') AND v.discount_value IS NOT NULL
          THEN GREATEST(v.price - v.discount_value, 0)
        WHEN v.sale_price IS NOT NULL
          THEN v.sale_price
        ELSE v.price
      END AS final_price,
      CASE
        WHEN COALESCE(v.stock, 0) <= 0 THEN 'out_of_stock'
        WHEN COALESCE(v.stock, 0) <= COALESCE(v.low_stock_threshold, 5) THEN 'low_stock'
        ELSE 'in_stock'
      END AS stock_status,
      COALESCE(
        (
          SELECT json_agg(
            json_build_object('id', vm.id, 'url', '/uploads/products/' || vm.filename, 'name', vm.originalname)
            ORDER BY vm.id ASC
          )
          FROM variant_media vm
          WHERE vm.variant_id = v.id
        ),
        '[]'::json
      ) AS variant_media,
      COALESCE(
        (
          SELECT json_agg(
            json_build_object(
              'attribute_id', a.id,
              'attribute_name', a.name,
              'attribute_slug', a.slug,
              'value_id', av.id,
              'value', av.value,
              'value_slug', av.slug
            )
            ORDER BY a.id ASC, av.id ASC
          )
          FROM product_variant_attributes pva
          LEFT JOIN attributes a ON a.id = pva.attribute_id
          LEFT JOIN attribute_values av ON av.id = pva.attribute_value_id
          WHERE pva.variant_id = v.id
        ),
        '[]'::json
      ) AS attributes
    FROM product_variants v
    JOIN products p ON p.id = v.product_id
  `;
}

async function fetchVariantCards(options = {}) {
  const sanitized = {
    limit: clamp(options.limit ?? 30, 1, MAX_DETAIL_VARIANTS),
    productId: toNumberOrNull(options.productId),
    variantId: toNumberOrNull(options.variantId),
    includeInactive: options.includeInactive === true,
    inStockOnly: options.inStockOnly === undefined ? !(options.productId !== undefined || options.variantId !== undefined) : Boolean(options.inStockOnly),
  };

  debugLog("fetchVariantCards() input:", sanitized);

  let resolvedProductId = sanitized.productId;
  if (resolvedProductId === null && sanitized.variantId !== null) {
    const lookup = await safeQuery("SELECT product_id FROM product_variants WHERE id = $1 LIMIT 1", [sanitized.variantId]);
    resolvedProductId = toNumberOrNull(lookup?.[0]?.product_id);
    debugLog("Resolved productId from variantId:", { variantId: sanitized.variantId, resolvedProductId });
  }

  const params = [];
  const where = [];
  const order = [];

  if (resolvedProductId !== null) {
    params.push(resolvedProductId);
    where.push(`v.product_id = $${params.length}`);
  } else if (sanitized.variantId !== null) {
    params.push(sanitized.variantId);
    where.push(`v.id = $${params.length}`);
  }

  if (!sanitized.includeInactive) where.push("COALESCE(v.is_active, TRUE) = TRUE");
  if (sanitized.inStockOnly) where.push("COALESCE(v.stock, 0) > 0");

  if (sanitized.variantId !== null && resolvedProductId !== null) {
    params.push(sanitized.variantId);
    order.push(`CASE WHEN v.id = $${params.length} THEN 0 ELSE 1 END`);
  }

  order.push("COALESCE(v.is_default, FALSE) DESC");
  order.push("COALESCE(v.sort_order, 0) ASC");
  order.push("v.id DESC");

  const useLimit = resolvedProductId === null && sanitized.variantId === null;
  if (useLimit) params.push(sanitized.limit);

  const query = `
    ${buildVariantSelectSQL()}
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY ${order.join(", ")}
    ${useLimit ? `LIMIT $${params.length}` : ""}
  `;

  const result = await pool.query(query, params);
  const rows = Array.isArray(result.rows) ? result.rows : [];
  debugLog("DB row count:", rows.length);
  return rows;
}

async function fetchRelatedProductsByCategory({ categoryId, excludeProductId, wishlistIds = [], cartMap = {}, limit = MAX_RELATED_PRODUCTS }) {
  const cid = toNumberOrNull(categoryId);
  const excluded = toNumberOrNull(excludeProductId);
  if (cid === null) return [];

  const params = [cid];
  const where = ["p.category_id = $1", "COALESCE(v.is_active, TRUE) = TRUE"];
  if (excluded !== null) {
    params.push(excluded);
    where.push(`p.id <> $${params.length}`);
  }
  params.push(limit);

  const query = `
    ${buildVariantSelectSQL()}
    WHERE ${where.join(" AND ")}
    ORDER BY p.id, COALESCE(v.is_default, FALSE) DESC, COALESCE(v.sort_order, 0) ASC, v.id DESC
    LIMIT $${params.length}
  `;

  const rows = await safeQuery(query, params);
  return dedupeCardsByKey(rows.map((row) => buildCompactRelatedCard(row, wishlistIds, cartMap)), (c) => String(c.product_id || c.master_id || c.id || "")).slice(0, limit);
}

async function fetchModelVariantsByCategory({ categoryId, currentModelKey, excludeVariantId, wishlistIds = [], cartMap = {}, limit = MAX_MODEL_VARIANTS }) {
  const cid = toNumberOrNull(categoryId);
  if (cid === null || !currentModelKey) return [];

  const params = [cid];
  const where = ["p.category_id = $1", "COALESCE(v.is_active, TRUE) = TRUE"];
  if (excludeVariantId !== null && excludeVariantId !== undefined) {
    params.push(toNumberOrNull(excludeVariantId));
    where.push(`v.id <> $${params.length}`);
  }
  params.push(Math.max(limit * 6, 48));

  const query = `
    ${buildVariantSelectSQL()}
    WHERE ${where.join(" AND ")}
    ORDER BY p.id, COALESCE(v.is_default, FALSE) DESC, COALESCE(v.sort_order, 0) ASC, v.id DESC
    LIMIT $${params.length}
  `;

  const rows = await safeQuery(query, params);
  const filtered = rows.filter((row) => getModelKeyFromVariantRow(row) === currentModelKey);
  return dedupeCardsByKey(filtered.map((row) => buildCompactRelatedCard(row, wishlistIds, cartMap)), (c) => String(c.variant_id || c.id || "")).slice(0, limit);
}

async function fetchFrequentlyBoughtTogether({ productId, variantId, categoryId, brand, wishlistIds = [], cartMap = {}, limit = MAX_FBT_ITEMS }) {
  const pid = toNumberOrNull(productId);
  const vid = toNumberOrNull(variantId);
  const cid = toNumberOrNull(categoryId);
  const brandText = sanitizeText(brand);
  if (pid === null && vid === null) return [];

  const optionalSources = [
    { table: "product_frequently_bought_together", relatedColumn: "related_product_id", scoreColumn: "score", params: [pid ?? vid, limit] },
    { table: "product_cross_sells", relatedColumn: "related_product_id", scoreColumn: "score", params: [pid ?? vid, limit] },
  ];

  for (const source of optionalSources) {
    const query = `
      SELECT DISTINCT ON (v.id)
        v.id,
        v.product_id,
        v.name AS variant_name,
        v.display_name,
        v.sku,
        v.price,
        v.sale_price,
        v.cost_price,
        v.stock,
        v.low_stock_threshold,
        v.track_inventory,
        v.allow_backorders,
        v.barcode,
        v.barcode_type,
        v.weight,
        v.weight_unit,
        v.length,
        v.width,
        v.height,
        v.dimension_unit,
        v.shipping_class,
        v.is_active,
        v.is_default,
        v.sort_order,
        v.discount_type,
        v.discount_value,
        v.vat_rate,
        v.vat_included,
        v.created_at AS variant_created_at,
        v.updated_at AS variant_updated_at,
        p.id AS product_id_master,
        p.name AS product_name,
        p.slug AS product_slug,
        p.product_type,
        p.brand,
        p.mpn,
        p.bullets,
        p.description AS product_description,
        p.short_description,
        p.parent_category_id,
        p.category_id,
        p.visibility,
        p.meta_keywords,
        p.meta_title,
        p.meta_description,
        p.main_image AS product_main_image,
        p.product_videos,
        p.display_locations,
        p.display_timing,
        p.created_at AS product_created_at,
        p.updated_at AS product_updated_at,
        CASE
          WHEN LOWER(COALESCE(v.discount_type, '')) IN ('percentage', 'percent') AND v.discount_value IS NOT NULL
            THEN ROUND(v.price - (v.price * v.discount_value / 100.0), 2)
          WHEN LOWER(COALESCE(v.discount_type, '')) IN ('fixed', 'amount') AND v.discount_value IS NOT NULL
            THEN GREATEST(v.price - v.discount_value, 0)
          WHEN v.sale_price IS NOT NULL
            THEN v.sale_price
          ELSE v.price
        END AS final_price,
        COALESCE((SELECT json_agg(json_build_object('id', vm.id, 'url', '/uploads/products/' || vm.filename, 'name', vm.originalname) ORDER BY vm.id ASC) FROM variant_media vm WHERE vm.variant_id = v.id), '[]'::json) AS variant_media,
        COALESCE((SELECT json_agg(json_build_object('attribute_id', a.id, 'attribute_name', a.name, 'attribute_slug', a.slug, 'value_id', av.id, 'value', av.value, 'value_slug', av.slug) ORDER BY a.id ASC, av.id ASC) FROM product_variant_attributes pva LEFT JOIN attributes a ON a.id = pva.attribute_id LEFT JOIN attribute_values av ON av.id = pva.attribute_value_id WHERE pva.variant_id = v.id), '[]'::json) AS attributes
      FROM ${source.table} rel
      JOIN product_variants v ON v.product_id = rel.${source.relatedColumn}
      JOIN products p ON p.id = v.product_id
      WHERE rel.product_id = $1
      ORDER BY COALESCE(rel.${source.scoreColumn}, 0) DESC, rel.id DESC
      LIMIT $2
    `;

    const rows = await safeQueryOptional(query, source.params);
    if (rows.length) {
      const cards = rows.map((row) => buildCompactRelatedCard(row, wishlistIds, cartMap));
      return dedupeCardsByKey(cards, (c) => String(c.product_id || c.id || "")).slice(0, limit);
    }
  }

  const params = [];
  const where = ["COALESCE(v.is_active, TRUE) = TRUE"];
  if (pid !== null) {
    params.push(pid);
    where.push(`p.id <> $${params.length}`);
  }
  if (cid !== null) {
    params.push(cid);
    where.push(`p.category_id = $${params.length}`);
  }
  if (brandText) {
    params.push(brandText);
    where.push(`LOWER(COALESCE(p.brand, '')) = LOWER($${params.length})`);
  }
  params.push(Math.max(limit * 6, 36));

  const query = `
    ${buildVariantSelectSQL()}
    WHERE ${where.join(" AND ")}
    ORDER BY COALESCE(p.brand, '') DESC, COALESCE(v.is_default, FALSE) DESC, COALESCE(v.sort_order, 0) ASC, v.id DESC
    LIMIT $${params.length}
  `;

  const rows = await safeQuery(query, params);
  return dedupeCardsByKey(rows.map((row) => buildCompactRelatedCard(row, wishlistIds, cartMap)), (c) => String(c.product_id || c.master_id || c.id || "")).slice(0, limit);
}

async function fetchCustomersAlsoViewed({ productId, categoryId, brand, wishlistIds = [], cartMap = {}, limit = MAX_VIEWED_ITEMS }) {
  const pid = toNumberOrNull(productId);
  const cid = toNumberOrNull(categoryId);
  const brandText = sanitizeText(brand);
  if (pid === null && cid === null) return [];

  const params = [];
  const where = ["COALESCE(v.is_active, TRUE) = TRUE"];
  if (pid !== null) {
    params.push(pid);
    where.push(`p.id <> $${params.length}`);
  }
  if (cid !== null) {
    params.push(cid);
    where.push(`p.category_id = $${params.length}`);
  }
  if (brandText) {
    params.push(brandText);
    where.push(`LOWER(COALESCE(p.brand, '')) <> LOWER($${params.length})`);
  }
  params.push(Math.max(limit * 6, 36));

  const query = `
    ${buildVariantSelectSQL()}
    WHERE ${where.join(" AND ")}
    ORDER BY COALESCE(v.stock, 0) DESC, COALESCE(v.is_default, FALSE) DESC, COALESCE(v.sort_order, 0) ASC, v.id DESC
    LIMIT $${params.length}
  `;

  const rows = await safeQuery(query, params);
  return dedupeCardsByKey(rows.map((row) => buildCompactRelatedCard(row, wishlistIds, cartMap)), (c) => String(c.product_id || c.master_id || c.id || "")).slice(0, limit);
}

async function fetchCompareItems({ categoryId, currentProductId, wishlistIds = [], cartMap = {}, limit = MAX_COMPARE_ITEMS }) {
  const cid = toNumberOrNull(categoryId);
  const pid = toNumberOrNull(currentProductId);
  if (cid === null) return [];

  const params = [cid];
  const where = ["p.category_id = $1", "COALESCE(v.is_active, TRUE) = TRUE"];
  if (pid !== null) {
    params.push(pid);
    where.push(`p.id <> $${params.length}`);
  }
  params.push(Math.max(limit * 4, 24));

  const query = `
    ${buildVariantSelectSQL()}
    WHERE ${where.join(" AND ")}
    ORDER BY COALESCE(v.is_default, FALSE) DESC, COALESCE(v.sort_order, 0) ASC, v.id DESC
    LIMIT $${params.length}
  `;

  const rows = await safeQuery(query, params);
  return dedupeCardsByKey(rows.map((row) => buildCompactRelatedCard(row, wishlistIds, cartMap)), (c) => String(c.product_id || c.master_id || c.id || "")).slice(0, limit);
}

function buildBreadcrumbs(product, selectedVariant) {
  const crumbs = [{ label: "Home", href: "/" }];
  if (product?.category_id != null) crumbs.push({ label: product?.category_name || product?.category || "Category", href: `/category/${product.category_id}` });
  if (product?.name) crumbs.push({ label: product.name, href: product?.slug ? `/product/${product.slug}` : "" });
  if (selectedVariant?.name && selectedVariant?.name !== product?.name) crumbs.push({ label: selectedVariant.name, href: "" });
  return crumbs;
}

function emptyDetailResponse(message) {
  return {
    success: false,
    message,
    product: null,
    variants: [],
    variantsForState: [],
    selectedVariant: null,
    selected_variant_id: null,
    gallery: [],
    relatedProducts: [],
    categoryProducts: [],
    related: [],
    frequentlyBoughtTogether: [],
    frequently_bought_together: [],
    customersAlsoViewed: [],
    alsoViewed: [],
    modelVariants: [],
    sameModelVariants: [],
    compareItems: [],
    breadcrumbs: [],
  };
}

async function getProductDetails(productId, variantId, req = null) {
  const pid = toNumberOrNull(productId);
  const vid = toNumberOrNull(variantId);
  debugLog("getProductDetails() input:", { productId: pid, variantId: vid });

  if (pid === null && vid === null) return emptyDetailResponse("Missing productId or variantId");

  let resolvedProductId = pid;
  if (resolvedProductId === null && vid !== null) {
    const lookup = await safeQuery("SELECT product_id FROM product_variants WHERE id = $1 LIMIT 1", [vid]);
    resolvedProductId = toNumberOrNull(lookup?.[0]?.product_id);
  }
  if (resolvedProductId === null) return emptyDetailResponse("Product not found");

  const rows = await fetchVariantCards({ productId: resolvedProductId, variantId: vid, includeInactive: true, inStockOnly: false, limit: MAX_DETAIL_VARIANTS });
  if (!Array.isArray(rows) || rows.length === 0) return emptyDetailResponse("Product not found");

  const [wishlistIds, cartMap] = await Promise.all([safeGetWishlistIds(req), safeGetCartMap(req)]);
  const wishSet = toWishSet(wishlistIds);

  const lightweightVariants = rows.map((row) => {
    const media = normalizeVariantMedia(row.variant_media, row.product_main_image || row.image || "");
    return {
      id: String(row.id ?? row.variant_id ?? ""),
      name: sanitizeText(row.variant_name || row.display_name || row.product_name || ""),
      display_name: sanitizeText(row.display_name || ""),
      price: toNumber(row.price, 0),
      final_price: toNumber(row.final_price, 0),
      stock: toNumber(row.stock, 0),
      image: normalizeUrl(media.primaryImage || row.product_main_image || row.image || ""),
      images: media.images,
      is_default: Boolean(row.is_default),
      is_active: Boolean(row.is_active),
      sort_order: toNumber(row.sort_order, 0),
    };
  });

  const variants = rows.map((row) => buildVariantPayloadRow(row, wishSet, cartMap, lightweightVariants));
  if (vid !== null) {
    variants.sort((a, b) => {
      if (String(a.id) === String(vid)) return -1;
      if (String(b.id) === String(vid)) return 1;
      if (a.is_default !== b.is_default) return a.is_default ? -1 : 1;
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
      return String(b.id).localeCompare(String(a.id));
    });
  }

  const product = buildProductPayloadFromRows(rows, wishSet, cartMap);
  const selectedVariant = variants.find((variant) => String(variant.id) === String(vid)) || variants.find((variant) => variant.is_default) || variants[0] || null;
  const categoryId = toNumberOrNull(product?.category_id ?? rows[0]?.category_id);
  const currentModelKey = getModelKeyFromVariantRow(selectedVariant || rows[0]);

  const [relatedProducts, sameModelVariants, frequentlyBoughtTogether, customersAlsoViewed, compareItems] = await Promise.all([
    fetchRelatedProductsByCategory({ categoryId, excludeProductId: product?.id ?? resolvedProductId, wishlistIds: wishSet, cartMap, limit: MAX_RELATED_PRODUCTS }),
    fetchModelVariantsByCategory({ categoryId, currentModelKey, excludeVariantId: selectedVariant?.id ?? vid, wishlistIds: wishSet, cartMap, limit: MAX_MODEL_VARIANTS }),
    fetchFrequentlyBoughtTogether({ productId: product?.id ?? resolvedProductId, variantId: selectedVariant?.id ?? vid, categoryId, brand: product?.brand, wishlistIds: wishSet, cartMap, limit: MAX_FBT_ITEMS }),
    fetchCustomersAlsoViewed({ productId: product?.id ?? resolvedProductId, categoryId, brand: product?.brand, wishlistIds: wishSet, cartMap, limit: MAX_VIEWED_ITEMS }),
    fetchCompareItems({ categoryId, currentProductId: product?.id ?? resolvedProductId, wishlistIds: wishSet, cartMap, limit: MAX_COMPARE_ITEMS }),
  ]);

  return {
    success: true,
    message: "Product details loaded",
    product,
    variants,
    variantsForState: variants,
    selectedVariant,
    selected_variant_id: selectedVariant ? String(selectedVariant.id) : null,
    gallery: selectedVariant?.images?.length ? selectedVariant.images : product?.main_image ? [product.main_image] : [],
    relatedProducts,
    categoryProducts: relatedProducts,
    related: relatedProducts,
    frequentlyBoughtTogether,
    frequently_bought_together: frequentlyBoughtTogether,
    customersAlsoViewed,
    alsoViewed: customersAlsoViewed,
    modelVariants: sameModelVariants,
    sameModelVariants,
    compareItems,
    breadcrumbs: buildBreadcrumbs(product, selectedVariant),
  };
}

async function getProductDetailsAPI(req, res) {
  try {
    const { productId, variantId } = readRequestIds(req);
    const data = await getProductDetails(productId, variantId, req);
    if (!data.success) return res.status(404).json(data);
    return res.json(data);
  } catch (err) {
    debugError("getProductDetailsAPI error:", err?.message || err);
    return res.status(500).json(emptyDetailResponse("Server error"));
  }
}

async function getRecentProductsAPI(req, res = null, rawOnly = false) {
  try {
    const { productId, variantId } = readRequestIds(req);
    const limit = clamp(req?.query?.limit ?? 30, 1, MAX_RECENT_VARIANTS);
    const includeInactive = req?.query?.include_inactive !== undefined ? String(req.query.include_inactive).toLowerCase() === "true" : false;
    const inStockOnly = req?.query?.in_stock_only !== undefined ? String(req.query.in_stock_only).toLowerCase() === "true" : !(productId !== null || variantId !== null);

    const rows = await fetchVariantCards({ limit, productId, variantId, includeInactive, inStockOnly });
    const [wishlistIds, cartMap] = await Promise.all([safeGetWishlistIds(req), safeGetCartMap(req)]);
    const wishSet = toWishSet(wishlistIds);

    const lightweightVariants = rows.map((row) => {
      const media = normalizeVariantMedia(row.variant_media, row.product_main_image || row.image || "");
      return {
        id: String(row.id),
        name: sanitizeText(row.variant_name || row.display_name || row.product_name || ""),
        display_name: sanitizeText(row.display_name || ""),
        price: toNumber(row.price, 0),
        final_price: toNumber(row.final_price, 0),
        stock: toNumber(row.stock, 0),
        image: normalizeUrl(media.primaryImage || row.product_main_image || row.image || ""),
        images: media.images,
        is_default: Boolean(row.is_default),
        is_active: Boolean(row.is_active),
        sort_order: toNumber(row.sort_order, 0),
      };
    });

    const data = rows.map((row) => buildVariantPayloadRow(row, wishSet, cartMap, lightweightVariants));
    if (variantId !== null) {
      data.sort((a, b) => {
        if (String(a.id) === String(variantId)) return -1;
        if (String(b.id) === String(variantId)) return 1;
        if (a.is_default !== b.is_default) return a.is_default ? -1 : 1;
        if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
        return String(b.id).localeCompare(String(a.id));
      });
    }

    const payload = { success: true, data: data.slice(0, rows.length || limit) };
    if (rawOnly || !res) return payload;
    return res.json(payload);
  } catch (err) {
    debugError("getRecentProductsAPI error:", err?.message || err);
    const payload = { success: false, data: [] };
    if (res) return res.status(500).json(payload);
    return payload;
  }
}

async function emitRecentProductsUpdate(ioInstance, limit = 30) {
  if (!ioInstance || typeof ioInstance.emit !== "function") return;
  try {
    const recent = await getRecentProductsAPI({ query: { limit } }, null, true);
    ioInstance.emit("recentProductsUpdated", Array.isArray(recent.data) ? recent.data : []);
  } catch (err) {
    debugError("emitRecentProductsUpdate error:", err?.message || err);
  }
}

async function emitProductAdded(ioInstance, productId) {
  if (!ioInstance || !productId) return;
  try {
    const rows = await fetchVariantCards({ productId, inStockOnly: false, includeInactive: true, limit: MAX_DETAIL_VARIANTS });
    for (const row of rows) ioInstance.emit("recentProductAdded", buildVariantPayloadRow(row, [], {}, []));
    await emitRecentProductsUpdate(ioInstance, 30);
  } catch (err) {
    debugError("emitProductAdded error:", err?.message || err);
  }
}

async function emitProductUpdated(ioInstance, productId) {
  if (!ioInstance || !productId) return;
  try {
    const rows = await fetchVariantCards({ productId, inStockOnly: false, includeInactive: true, limit: MAX_DETAIL_VARIANTS });
    for (const row of rows) ioInstance.emit("recentProductUpdated", buildVariantPayloadRow(row, [], {}, []));
    await emitRecentProductsUpdate(ioInstance, 30);
  } catch (err) {
    debugError("emitProductUpdated error:", err?.message || err);
  }
}

async function emitProductDeleted(ioInstance, productId) {
  if (!ioInstance || !productId) return;
  try {
    const variantRows = await pool.query("SELECT id FROM product_variants WHERE product_id = $1", [productId]);
    const variantIds = Array.isArray(variantRows.rows) ? variantRows.rows.map((row) => String(row.id)).filter(Boolean) : [];
    for (const variantId of variantIds) ioInstance.emit("recentProductDeleted", variantId);
    ioInstance.emit("recentProductDeleted", String(productId));
    await emitRecentProductsUpdate(ioInstance, 30);
  } catch (err) {
    debugError("emitProductDeleted error:", err?.message || err);
  }
}

module.exports = {
  getProductDetails,
  getProductDetailsAPI,
  getRecentProductsAPI,
  emitRecentProductsUpdate,
  emitProductAdded,
  emitProductUpdated,
  emitProductDeleted,
  buildProductPayloadFromRows,
  buildVariantPayloadRow,
  calculateFinalPrice,
  fetchVariantCards,
  fetchRelatedProductsByCategory,
  fetchFrequentlyBoughtTogether,
  fetchCustomersAlsoViewed,
  fetchCompareItems,
  fetchModelVariantsByCategory,
  deriveModelKey,
  getModelKeyFromVariantRow,
  getModelKeyFromProduct,
};
