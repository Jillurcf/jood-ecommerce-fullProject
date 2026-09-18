"use strict"; 
const { pool } = require("../includes/conn");
const crypto = require("crypto");

// ----- CONFIG -----
const AUTO_SELECT_VARIANT = true; // set to false if you want frontend to always choose when >1 variants
const ONLY_ACTIVE_VARIANTS_FOR_SELECTION = true; // when auto-selecting or listing, only consider is_active=true
// ------------------

function generateTrackingId() {
  return "TRK-" + crypto.randomBytes(5).toString("hex").toUpperCase();
}

function invalidInput(res, message = "Invalid input", code = "INVALID_INPUT", debug = null) {
  const payload = { success: false, message, error_code: code };
  if (debug) payload.debug = debug;
  return res.status(400).json(payload);
}

function resolveIdentity(req) {
  const headerToken = req.headers["x-guest-token"] || req.headers["x-guest-token".toLowerCase()] || null;
  const bodyToken = req.body?.guest_token ?? null;
  const queryToken = req.query?.guest_token ?? null;
  const cookieToken = req.cookies?.guest_token ?? null;
  const requestToken = req.guestToken ?? null;
  const sessionToken = req.session?.guestToken ?? req.session?.guest_token ?? null;
  const guestToken = headerToken || bodyToken || queryToken || cookieToken || requestToken || sessionToken || null;
  const userId =
    req.user?.email ||
    req.session?.user?.email ||
    req.session?.userEmail ||
    null;

  if (!userId && !guestToken) {
    return { error: true, message: "Cannot identify user", error_code: "IDENTITY_REQUIRED" };
  }
  return {
    error: false,
    userId: userId ? String(userId).trim().toLowerCase() : null,
    guestToken: guestToken ? String(guestToken) : null
  };
}

// numeric helper
const toNum = (v, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

// discount resolver (percent or fixed)
function resolveDiscountPercent(discount_type, discount_value, price) {
  const dv = Number(discount_value || 0);
  const p = Number(price || 0);

  if (!discount_type || dv === 0 || p === 0) return 0;

  const t = String(discount_type).toLowerCase();

  if (t === "percent" || t === "percentage") {
    return dv;
  }

  if (t === "fixed" || t === "amount") {
    return (dv / p) * 100;
  }

  return 0;
}

// price calculation (base + discount + VAT)
function calculateFinalPrice(basePrice = 0, discountPercent = 0, vatPercent = 0) {
  const bp = toNum(basePrice, 0);
  const d = toNum(discountPercent, 0);
  const v = toNum(vatPercent, 0);
  const discountValue = +(bp * (d / 100));
  const taxedBase = +(bp - discountValue);
  const vatValue = +(taxedBase * (v / 100));
  const finalPrice = +(taxedBase + vatValue).toFixed(2);
  return { finalPrice, discountValue, vatValue };
}

// --------------------------
// DB helpers
// --------------------------

// Fetch cart rows using product_variants only for variant details.
// If a cart row has no variant_id, we still return it but variant fields remain null.
async function fetchCartRows(client, userId, guestToken) {
  const q = `
  SELECT
    c.id,
    c.tracking_id,
    c.product_id AS cart_product_id,
    c.variant_id,
    c.quantity,
    c.price,
    c.status,
    c.created_at,
    c.updated_at,
    
    -- variant-driven fields
    pv.product_id AS pv_product_id,
    pv.id        AS pv_id,
    pv.name      AS pv_name,
    pv.sku       AS pv_sku,
    pv.price     AS pv_price,
    pv.sale_price AS pv_sale_price,
    pv.discount_type AS pv_discount_type,
    pv.discount_value AS pv_discount_value,
    pv.vat_rate AS pv_vat_rate,
    pv.vat_included AS pv_vat_included,
    pv.stock    AS pv_stock,

    -- product brand
    p.id AS m_pid,
    p.brand AS product_brand,

    -- variant image (pick first one if multiple exist)
    vm.filename AS variant_image

FROM cart c
LEFT JOIN product_variants pv ON pv.id = c.variant_id
LEFT JOIN products p 
  ON p.id = COALESCE(pv.product_id, c.product_id)
LEFT JOIN LATERAL (
    SELECT filename
    FROM variant_media
    WHERE variant_id = pv.id
    ORDER BY id ASC
    LIMIT 1
) vm ON true

WHERE (c.user_id = $1 OR c.guest_token = $2)
  AND c.status = 'active'
ORDER BY c.created_at ASC;
`;
  const r = await client.query(q, [userId, guestToken]);

return (r.rows || []).map(row => {
  console.log({
  price: row.pv_price,
  discount_type: row.pv_discount_type,
  discount_value: row.pv_discount_value,
  vat_rate: row.pv_vat_rate
});
  const productId = row.pv_product_id ?? row.cart_product_id ?? null;
  const isVariant = row.variant_id != null;

  const basePrice = Number(row.pv_price ?? row.price ?? 0);
  const salePrice = row.pv_sale_price ?? basePrice;

  // ✅ FIX: calculate discount %
  const discountPercent = resolveDiscountPercent(
    row.pv_discount_type,
    row.pv_discount_value,
    basePrice
  );

  const priceInfo = calculateFinalPrice(
    basePrice,
    discountPercent,
    row.pv_vat_rate
  );

  const cartKey = isVariant
    ? `v_${row.variant_id}`
    : (productId ? `p_${productId}` : `c_${row.id}`);

  return {
    id: row.id,
    cart_key: cartKey,
    type: isVariant ? "variant" : "product",

    tracking_id: row.tracking_id,
    product_id: productId,
    master_id: productId,
    variant_id: row.variant_id,

    name: row.pv_name ?? null,
    slug: null, // ⚠️ you are not selecting slug → fix below
    brand: row.product_brand ?? null,

    sku: row.pv_sku ?? null,

    image: row.variant_image ?? null,

    quantity: Number(row.quantity || 0),

    original_price: basePrice,
    final_price: priceInfo.finalPrice,

pv_discount_type: row.pv_discount_type ?? null,
pv_discount_value: Number(row.pv_discount_value || 0),

pv_vat_rate: Number(row.pv_vat_rate || 0),
pv_vat_included: row.pv_vat_included ?? false,

    stock: row.variant_id ? Number(row.pv_stock || 0) : null,

    created_at: row.created_at,
    updated_at: row.updated_at,
  };
});
}

// get or create tracking id
async function getOrCreateTrackingId(client, userId, guestToken) {
  const tQ = `
    SELECT DISTINCT ON (tracking_id) tracking_id, updated_at
    FROM cart
    WHERE (user_id=$1 OR guest_token=$2)
      AND status='active'
    ORDER BY tracking_id, updated_at DESC
  `;
  const tR = await client.query(tQ, [userId, guestToken]);
  if (!tR.rows.length) return generateTrackingId();
  const trackingId = tR.rows[0].tracking_id;

  if (tR.rows.length > 1) {
    await client.query(
      `
      UPDATE cart
      SET tracking_id=$1, updated_at=NOW()
      WHERE (user_id=$2 OR guest_token=$3)
        AND status='active'
    `,
      [trackingId, userId, guestToken]
    );
  }
  return trackingId;
}

/**
 * resolveAndValidateMapping (product_variants-only)
 *
 * - If variantId provided -> use product_variants row (validate product_id when given)
 * - If variantId omitted -> inspect product_variants for the product_id:
 *     - 0 rows => PRODUCT_NOT_FOUND
 *     - 1 row  => auto-select that variant
 *     - >1 rows => behavior depends on AUTO_SELECT_VARIANT
 *
 * Returns:
 *  { finalProductId, finalVariantId|null, finalPrice, availableStock, source, product_status, auto_selected?, auto_selected_reason? }
 *
 * Throws:
 *  - { code: "PRODUCT_NOT_FOUND" | "VARIANT_NOT_FOUND" | "VARIANT_REQUIRED", message, debug, available_variants? }
 */
async function resolveAndValidateMapping(client, productId, variantId) {
  const pid = productId != null && productId !== "" && Number(productId) !== 0 ? Number(productId) : null;
  const vid = variantId != null && variantId !== "" && Number(variantId) !== 0 ? Number(variantId) : null;

  // If variant explicitly provided -> fetch variant row from product_variants
  if (vid) {
    let vq, vparams;
    if (pid) {
      vq = `
        SELECT id AS variant_id, product_id, price, stock, discount_type, discount_value,
               vat_rate, vat_included, is_active, name
        FROM product_variants
        WHERE id = $1 AND product_id = $2
        LIMIT 1
      `;
      vparams = [vid, pid];
    } else {
      vq = `
        SELECT id AS variant_id, product_id, price, stock, discount_type, discount_value,
               vat_rate, vat_included, is_active, name
        FROM product_variants
        WHERE id = $1
        LIMIT 1
      `;
      vparams = [vid];
    }

    const vr = await client.query(vq, vparams);
    if (!vr.rows.length) {
      throw { code: "VARIANT_NOT_FOUND", message: "Variant not found", debug: { received_variant_id: vid, received_product_id: pid } };
    }

    const row = vr.rows[0];
    const basePrice = Number(row.price ?? 0);
    const discountPercent = resolveDiscountPercent(row.discount_type, row.discount_value, basePrice);
    const vatPercent = Number(row.vat_rate ?? 0);
    const priceInfo = calculateFinalPrice(basePrice, discountPercent, vatPercent);

    return {
      finalProductId: Number(row.product_id),
      finalVariantId: Number(row.variant_id),
      finalPrice: priceInfo.finalPrice,
      availableStock: Number(row.stock ?? 0),
      source: "variant",
      product_status: row.is_active ? "published" : "draft"
    };
  }

  // No variant provided -> product_id must be present
  if (!pid) {
    throw { code: "INVALID_PRODUCT", message: "Product ID required (or provide variant_id)", debug: { received_product_id: productId, received_variant_id: variantId } };
  }

  // Build WHERE clause for counting/selecting; optionally filter on is_active
  const activeFilter = ONLY_ACTIVE_VARIANTS_FOR_SELECTION ? "AND is_active = TRUE" : "";

  // Count variants for this product and aggregate stock; only use product_variants table
  const pq = `
    SELECT
      COUNT(*) AS variant_count,
      COALESCE(SUM(COALESCE(stock,0)),0) AS total_stock,
      MAX( CASE WHEN is_default = TRUE THEN id ELSE NULL END ) AS default_variant_id,
      (SELECT id FROM product_variants pv2 WHERE pv2.product_id = $1 ${activeFilter} AND pv2.price IS NOT NULL ORDER BY pv2.price ASC LIMIT 1) AS min_price_variant_id
    FROM product_variants
    WHERE product_id = $1
    ${activeFilter}
  `;
  const pres = await client.query(pq, [pid]);
  const stats = pres.rows && pres.rows[0] ? pres.rows[0] : null;

  if (!stats || Number(stats.variant_count || 0) === 0) {
    throw { code: "PRODUCT_NOT_FOUND", message: "No variants found for product (product not purchasable via variants-only flow)", debug: { product_id: pid } };
  }

  const variantCount = Number(stats.variant_count || 0);
  const totalStock = Number(stats.total_stock || 0);

  // If exactly 1 variant -> pick that variant automatically
  if (variantCount === 1) {
    const vr = await client.query(
      `SELECT id, product_id, price, stock, discount_type, discount_value, vat_rate, vat_included, is_active, name FROM product_variants WHERE product_id=$1 ${activeFilter} LIMIT 1`,
      [pid]
    );
    if (!vr.rows.length) {
      throw { code: "VARIANT_NOT_FOUND", message: "No variant row found", debug: { product_id: pid } };
    }
    const rv = vr.rows[0];
    const basePrice = Number(rv.price ?? 0);
    const discountPercent = resolveDiscountPercent(rv.discount_type, rv.discount_value, basePrice);
    const vatPercent = Number(rv.vat_rate ?? 0);
    const priceInfo = calculateFinalPrice(basePrice, discountPercent, vatPercent);
    return {
      finalProductId: Number(rv.product_id),
      finalVariantId: Number(rv.id),
      finalPrice: priceInfo.finalPrice,
      availableStock: Number(rv.stock ?? 0),
      source: "single_variant_auto",
      product_status: rv.is_active ? "published" : "draft"
    };
  }

  // Multiple variants and no variant specified -> either auto-select or return available_variants
  if (AUTO_SELECT_VARIANT) {
    // prefer explicit default variant if present, else prefer min price variant
    const pickVariantId = Number(stats.default_variant_id || stats.min_price_variant_id || null);
    if (!pickVariantId) {
      // Fallback: try to pick any active variant for product
      const fallbackRes = await client.query(
        `SELECT id, product_id, price, stock, discount_type, discount_value, vat_rate, vat_included, is_active, name
         FROM product_variants
         WHERE product_id = $1
         ${activeFilter}
         LIMIT 1`,
        [pid]
      );
      if (!fallbackRes.rows.length) {
        throw { code: "VARIANT_REQUIRED", message: "Product has multiple variants; none available for auto-select", debug: { product_id: pid, variant_count: variantCount } };
      }
      const rv = fallbackRes.rows[0];
      const basePrice = Number(rv.price ?? 0);
      const discountPercent = resolveDiscountPercent(rv.discount_type, rv.discount_value, basePrice);
      const vatPercent = Number(rv.vat_rate ?? 0);
      const priceInfo = calculateFinalPrice(basePrice, discountPercent, vatPercent);
      return {
        finalProductId: Number(rv.product_id),
        finalVariantId: Number(rv.id),
        finalPrice: priceInfo.finalPrice,
        availableStock: Number(rv.stock ?? 0),
        source: "auto_selected_variant",
        product_status: rv.is_active ? "published" : "draft",
        auto_selected: true,
        auto_selected_reason: "fallback_any_active"
      };
    }

    // fetch the chosen variant row and compute price/stock as we do for a single variant
    const vr = await client.query(
      `SELECT id, product_id, price, stock, discount_type, discount_value, vat_rate, vat_included, is_active, name FROM product_variants WHERE id = $1 LIMIT 1`,
      [pickVariantId]
    );
    if (!vr.rows.length) {
      throw { code: "VARIANT_NOT_FOUND", message: "Auto-selected variant not found", debug: { picked_variant_id: pickVariantId, product_id: pid } };
    }
    const rv = vr.rows[0];
    const basePrice = Number(rv.price ?? 0);
    const discountPercent = resolveDiscountPercent(rv.discount_type, rv.discount_value, basePrice);
    const vatPercent = Number(rv.vat_rate ?? 0);
    const priceInfo = calculateFinalPrice(basePrice, discountPercent, vatPercent);

    return {
      finalProductId: Number(rv.product_id),
      finalVariantId: Number(rv.id),
      finalPrice: priceInfo.finalPrice,
      availableStock: Number(rv.stock ?? 0),
      source: "auto_selected_variant",
      product_status: rv.is_active ? "published" : "draft",
      auto_selected: true,
      auto_selected_reason: stats.default_variant_id ? "default_variant" : "min_price_variant"
    };
  } else {
    // Provide available variants to help frontend choose (no silent server decision)
    const varRows = await client.query(
      `SELECT id, name, sku, price, stock, is_active FROM product_variants WHERE product_id = $1 ${ONLY_ACTIVE_VARIANTS_FOR_SELECTION ? "AND is_active = TRUE" : ""} ORDER BY is_default DESC, price ASC LIMIT 50`,
      [pid]
    );

    const available_variants = (varRows.rows || []).map(v => ({
      variant_id: v.id,
      name: v.name,
      sku: v.sku,
      price: v.price,
      stock: v.stock,
      is_active: v.is_active
    }));

    throw {
      code: "VARIANT_REQUIRED",
      message: "Product has multiple variants; please provide variant_id",
      debug: { product_id: pid, variant_count: variantCount },
      available_variants
    };
  }
}

// emit helper unchanged
function emitCartUpdated(req, payload = {}) {
  try {
    const io = req && req.app && req.app.get ? req.app.get("io") : null;
    if (!io) return;
    io.emit("cartUpdated", payload);
  } catch (e) {
    console.warn("emitCartUpdated error", e && e.message ? e.message : e);
  }
}

// -----------------------------
// Add to cart (main)
// -----------------------------
exports.addToCart = async (req, res) => {
  let client;
  try {
    let { product_id: rawProductId = null, variant_id: rawVariantId = null, quantity: rawQuantity = 1 } = req.body || {};

    const variantIsProvided = !(rawVariantId === null || typeof rawVariantId === "undefined" || rawVariantId === "" || rawVariantId === 0 || rawVariantId === "0");
    const variant_id = variantIsProvided ? Number(rawVariantId) : null;

    const productIsProvided = !(rawProductId === null || typeof rawProductId === "undefined" || rawProductId === "" || rawProductId === 0 || rawProductId === "0");
    const product_id = productIsProvided ? Number(rawProductId) : null;

    const quantity = Number(rawQuantity || 1);
    if (!Number.isInteger(quantity) || quantity < 1) return invalidInput(res, "Invalid quantity", "INVALID_QUANTITY");

    const identity = resolveIdentity(req);
    if (identity.error) return res.status(401).json(identity);
    const { userId, guestToken } = identity;

    client = await pool.connect();
    await client.query("BEGIN");

    // resolve mapping (variant-first, product_variants-only)
    let mapping;
    try {
      mapping = await resolveAndValidateMapping(client, product_id, variant_id);
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      // If VARIANT_REQUIRED includes available_variants, return 400 with payload
      if (err.code === "VARIANT_REQUIRED" && err.available_variants) {
        return res.status(400).json({
          success: false,
          message: err.message || "Variant selection required",
          error_code: err.code,
          available_variants: err.available_variants,
          debug: err.debug ?? null
        });
      }
      const status = ["PRODUCT_NOT_FOUND", "VARIANT_NOT_FOUND"].includes(err.code) ? 404 : 400;
      const debug = { received_product_id: product_id, received_variant_id: variant_id, mapping_error: err.debug ?? null };
      return res.status(status).json({ success: false, message: err.message || "Invalid item", error_code: err.code || "INVALID_ITEM", debug });
    }

    // sanity: product_id if provided must match mapping.finalProductId
    if (product_id && mapping.finalProductId && Number(mapping.finalProductId) !== Number(product_id)) {
      await client.query("ROLLBACK").catch(() => {});
      const debug = { received_product_id: product_id, resolved_parent_product_id: mapping.finalProductId };
      console.warn("MISMATCHED_PARENT in addToCart", debug);
      return res.status(400).json({ success: false, message: "Provided product_id does not match resolved product", error_code: "MISMATCHED_PARENT", debug });
    }

    // Lock the variant row when variant is used (prefer variant row locking).
    // When mapping.finalProductId is known, lock both id+product to be stricter.
    try {
      if (mapping.finalVariantId) {
        if (mapping.finalProductId != null) {
          await client.query("SELECT stock FROM product_variants WHERE id=$1 AND product_id=$2 FOR UPDATE", [mapping.finalVariantId, mapping.finalProductId]);
        } else {
          await client.query("SELECT stock FROM product_variants WHERE id=$1 FOR UPDATE", [mapping.finalVariantId]);
        }
      } else {
        // product-level: rarely used in variants-only flow
      }
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("DB LOCK ERROR:", err);
      return res.status(500).json({ success: false, message: "Failed to lock", error_code: "DB_LOCK_ERROR" });
    }

    const trackingId = await getOrCreateTrackingId(client, userId, guestToken);

    // Find existing cart row by tracking/session and variant-first
    // Use FOR UPDATE to lock that row if exists. Include product_id when available to tighten scope.
    let existingCart;
    if (mapping.finalVariantId != null) {
      if (mapping.finalProductId != null) {
        existingCart = await client.query(
          `SELECT id, quantity FROM cart WHERE tracking_id=$1 AND variant_id IS NOT DISTINCT FROM $2 AND product_id = $3 AND status='active' FOR UPDATE`,
          [trackingId, mapping.finalVariantId, mapping.finalProductId]
        );
      } else {
        existingCart = await client.query(
          `SELECT id, quantity FROM cart WHERE tracking_id=$1 AND variant_id IS NOT DISTINCT FROM $2 AND status='active' FOR UPDATE`,
          [trackingId, mapping.finalVariantId]
        );
      }
    } else {
      existingCart = await client.query(
        `SELECT id, quantity FROM cart WHERE tracking_id=$1 AND product_id=$2 AND variant_id IS NULL AND status='active' FOR UPDATE`,
        [trackingId, mapping.finalProductId]
      );
    }

    let newQty = quantity;
    if (existingCart.rows.length) newQty += Number(existingCart.rows[0].quantity || 0);

    if (newQty > mapping.availableStock) {
      await client.query("ROLLBACK").catch(() => {});
      return res.status(400).json({ success: false, message: `Only ${mapping.availableStock} item(s) available`, error_code: "INSUFFICIENT_STOCK" });
    }

    try {
      if (existingCart.rows.length) {
        await client.query("UPDATE cart SET quantity=$1, price=$2, updated_at=NOW() WHERE id=$3", [newQty, mapping.finalPrice, existingCart.rows[0].id]);
      } else {
        // Insert: still write product_id (master) for compatibility, but variant_id carries the identity
        await client.query(
          `INSERT INTO cart (tracking_id,user_id,guest_token,product_id,variant_id,quantity,price,status,created_at,updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,'active',NOW(),NOW())`,
          [trackingId, userId, guestToken, mapping.finalProductId, mapping.finalVariantId, quantity, mapping.finalPrice]
        );
      }
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("CART INSERT/UPDATE ERROR:", err);
      return res.status(500).json({ success: false, message: "Failed to add item to cart", error_code: "CART_DB_ERROR" });
    }

    const cartRows = await fetchCartRows(client, userId, guestToken);
    await client.query("COMMIT");

    emitCartUpdated(req, { userId, guestToken, trackingId });
    return res.json({ success: true, message: "Added to cart", tracking_id: trackingId, data: cartRows });
  } catch (err) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    console.error("ADD TO CART UNHANDLED ERROR:", err && err.stack ? err.stack : err);
    return res.status(500).json({ success: false, message: "Server error", error_code: "SERVER_ERROR", details: err && err.message ? err.message : err });
  } finally {
    if (client) client && client.release();
  }
};

// -----------------------------
// Get cart
// -----------------------------
exports.getCart = async (req, res) => {
  let client;
  try {
    const identity = resolveIdentity(req);
    if (identity.error) return res.status(401).json(identity);
    const { userId, guestToken } = identity;
    client = await pool.connect();
    const rows = await fetchCartRows(client, userId, guestToken);
    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error("GET CART ERROR:", err && err.stack ? err.stack : err);
    return res.status(500).json({ success: false, message: "Server error", error_code: "SERVER_ERROR" });
  } finally {
    if (client) client && client.release();
  }
};

// -----------------------------
// updateCartQty
// -----------------------------
exports.updateCartQty = async (req, res) => {
  let client;
  try {
    let { product_id = null, variant_id = null, quantity = null } = req.body || {};
    const variantIsProvided = !(variant_id === null || typeof variant_id === "undefined" || variant_id === "" || variant_id === 0 || variant_id === "0");
    variant_id = variantIsProvided ? Number(variant_id) : null;
    product_id = product_id != null && product_id !== "" && product_id !== 0 && product_id !== "0" ? Number(product_id) : null;
    quantity = quantity != null ? Number(quantity) : null;

    if (!Number.isInteger(quantity)) return invalidInput(res, "Invalid quantity");

    const identity = resolveIdentity(req);
    if (identity.error) return res.status(401).json(identity);
    const { userId, guestToken } = identity;

    client = await pool.connect();
    await client.query("BEGIN");

    let mapping;
    try {
      mapping = await resolveAndValidateMapping(client, product_id, variant_id);
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      if (err.code === "VARIANT_REQUIRED" && err.available_variants) {
        return res.status(400).json({
          success: false,
          message: err.message || "Variant selection required",
          error_code: err.code,
          available_variants: err.available_variants,
          debug: err.debug ?? null
        });
      }
      const status = ["PRODUCT_NOT_FOUND", "VARIANT_NOT_FOUND"].includes(err.code) ? 404 : 400;
      return res.status(status).json({ success: false, message: err.message || "Invalid item", error_code: err.code || "INVALID_ITEM", debug: { received_product_id: product_id, received_variant_id: variant_id } });
    }

    if (product_id && mapping.finalProductId && Number(mapping.finalProductId) !== Number(product_id)) {
      await client.query("ROLLBACK").catch(() => {});
      const debug = { received_product_id: product_id, resolved_parent_product_id: mapping.finalProductId };
      console.warn("MISMATCHED_PARENT detected in updateCartQty", debug);
      return res.status(400).json({ success: false, message: "Provided product_id does not match resolved product", error_code: "MISMATCHED_PARENT", debug });
    }

    if (quantity < 1) {
      // Delete matching row: prefer variant match if variant present, else product-level & null-variant
      if (mapping.finalVariantId != null) {
        if (mapping.finalProductId != null) {
          await client.query(`DELETE FROM cart WHERE variant_id IS NOT DISTINCT FROM $1 AND product_id = $2 AND (user_id=$3 OR guest_token=$4)`, [mapping.finalVariantId, mapping.finalProductId, userId, guestToken]);
        } else {
          await client.query(`DELETE FROM cart WHERE variant_id IS NOT DISTINCT FROM $1 AND (user_id=$2 OR guest_token=$3)`, [mapping.finalVariantId, userId, guestToken]);
        }
      } else {
        await client.query(`DELETE FROM cart WHERE product_id=$1 AND variant_id IS NULL AND (user_id=$2 OR guest_token=$3)`, [mapping.finalProductId, userId, guestToken]);
      }
      const rows = await fetchCartRows(client, userId, guestToken);
      await client.query("COMMIT");
      emitCartUpdated(req, { userId, guestToken });
      return res.json({ success: true, message: "Item removed", data: rows });
    }

    // Lock variant row if present (prefer locking id + product_id)
    try {
      if (mapping.finalVariantId) {
        if (mapping.finalProductId != null) {
          await client.query("SELECT stock FROM product_variants WHERE id=$1 AND product_id=$2 FOR UPDATE", [mapping.finalVariantId, mapping.finalProductId]);
        } else {
          await client.query("SELECT stock FROM product_variants WHERE id=$1 FOR UPDATE", [mapping.finalVariantId]);
        }
      }
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("DB LOCK ERROR:", err);
      return res.status(500).json({ success: false, message: "Failed to lock", error_code: "DB_LOCK_ERROR" });
    }

    // Select the cart row with variant-first matching and lock it; include product_id when available
    let selectCartR;
    if (mapping.finalVariantId != null) {
      if (mapping.finalProductId != null) {
        selectCartR = await client.query(
          `SELECT id, quantity FROM cart WHERE variant_id IS NOT DISTINCT FROM $1 AND product_id = $2 AND (user_id=$3 OR guest_token=$4) FOR UPDATE`,
          [mapping.finalVariantId, mapping.finalProductId, userId, guestToken]
        );
      } else {
        selectCartR = await client.query(
          `SELECT id, quantity FROM cart WHERE variant_id IS NOT DISTINCT FROM $1 AND (user_id=$2 OR guest_token=$3) FOR UPDATE`,
          [mapping.finalVariantId, userId, guestToken]
        );
      }
    } else {
      selectCartR = await client.query(
        `SELECT id, quantity FROM cart WHERE product_id=$1 AND variant_id IS NULL AND (user_id=$2 OR guest_token=$3) FOR UPDATE`,
        [mapping.finalProductId, userId, guestToken]
      );
    }

    if (!selectCartR.rows.length) {
      await client.query("ROLLBACK").catch(() => {});
      return res.status(404).json({ success: false, message: "Cart item not found", error_code: "CART_ITEM_NOT_FOUND" });
    }

    if (quantity > mapping.availableStock) {
      await client.query("ROLLBACK").catch(() => {});
      return res.status(400).json({ success: false, message: "Insufficient stock", error_code: "INSUFFICIENT_STOCK" });
    }

    const cartId = selectCartR.rows[0].id;
    await client.query("UPDATE cart SET quantity=$1, price=$2, updated_at=NOW() WHERE id=$3", [quantity, mapping.finalPrice, cartId]);

    const rows = await fetchCartRows(client, userId, guestToken);
    await client.query("COMMIT");

    emitCartUpdated(req, { userId, guestToken });
    return res.json({ success: true, message: "Quantity updated", data: rows });
  } catch (err) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    console.error("UPDATE CART ERROR:", err && err.stack ? err.stack : err);
    return res.status(500).json({ success: false, message: "Server error", error_code: "SERVER_ERROR" });
  } finally {
    if (client) client && client.release();
  }
};

// -----------------------------
// removeFromCart
// -----------------------------
exports.removeFromCart = async (req, res) => {
  let client;

  try {
    let { variant_id = null } = req.body || {};

    const variantIsProvided =
      !(variant_id === null || typeof variant_id === "undefined" || variant_id === "" || variant_id === 0 || variant_id === "0");

    variant_id = variantIsProvided ? Number(variant_id) : null;

    if (!variant_id) {
      return invalidInput(res, "variant_id required");
    }

    const identity = resolveIdentity(req);
    if (identity.error) return res.status(401).json(identity);

    const { userId, guestToken } = identity;

    client = await pool.connect();
    await client.query("BEGIN");

    // Delete strictly using variant_id
    await client.query(
      `
      DELETE FROM cart
      WHERE variant_id = $1
      AND (user_id = $2 OR guest_token = $3)
      `,
      [variant_id, userId, guestToken]
    );

    const rows = await fetchCartRows(client, userId, guestToken);

    await client.query("COMMIT");

    emitCartUpdated(req, { userId, guestToken });

    return res.json({
      success: true,
      message: "Item removed",
      data: rows
    });

  } catch (err) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    console.error("REMOVE CART ERROR:", err && err.stack ? err.stack : err);

    return res.status(500).json({
      success: false,
      message: "Server error",
      error_code: "SERVER_ERROR"
    });

  } finally {
    if (client) client.release();
  }
};
