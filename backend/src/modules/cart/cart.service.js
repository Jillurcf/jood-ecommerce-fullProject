import crypto from "crypto";
import { prisma } from "../../lib/prisma.js";
import { Prisma } from "@prisma/client";
import { computePrices } from "../catalog/pricing.util.js";
const AUTO_SELECT_VARIANT = true;
const ONLY_ACTIVE_VARIANTS_FOR_SELECTION = true;
const toNum = (v, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};
const sanitize = (v) => {
  if (v === null || v === void 0) return "";
  return String(v).trim();
};
function generateTrackingId() {
  return "TRK-" + crypto.randomBytes(5).toString("hex").toUpperCase();
}
function mappingError(code, message, debug, availableVariantIds) {
  const err = new Error(message);
  err.code = code;
  err.debug = debug;
  if (availableVariantIds) err.availableVariantIds = availableVariantIds;
  return err;
}
function cartIdentityWhere(id) {
  return {
    status: "active",
    OR: [
      ...id.userId ? [{ userId: id.userId }] : [],
      ...id.guestToken ? [{ guestToken: id.guestToken }] : []
    ]
  };
}
async function lockVariant(tx, variantId, productId) {
  const rows = await tx.$queryRaw`SELECT id, product_id, name, display_name, sku, price, sale_price, stock,
            discount_type, discount_value, vat_rate, vat_included, is_active, is_default, sort_order
     FROM product_variants
     WHERE id = ${variantId} ${productId ? Prisma.sql`AND product_id = ${productId}` : Prisma.empty}
     LIMIT 1
     FOR UPDATE`;
  const row = rows[0];
  if (!row) {
    throw mappingError("VARIANT_NOT_FOUND", "Variant not found", { received_variant_id: variantId, received_product_id: productId });
  }
  return resolveFromVariantRow(row);
}
function resolveFromVariantRow(row) {
  const price = toNum(row.price);
  const salePrice = toNum(row.sale_price);
  const vatRate = toNum(row.vat_rate, 5);
  const { finalPrice } = computePrices(
    price || null,
    salePrice || null,
    row.discount_type,
    row.discount_value != null ? toNum(row.discount_value) : null,
    vatRate,
    row.vat_included ?? true
  );
  return {
    finalProductId: row.product_id,
    finalVariantId: row.id,
    finalPrice,
    availableStock: Number(row.stock || 0),
    source: "variant",
    productStatus: row.is_active ? "published" : "draft",
    isDefault: !!row.is_default,
    sortOrder: row.sort_order,
    name: row.name,
    displayName: row.display_name,
    sku: row.sku
  };
}
async function resolveAndValidateMapping(tx, productId, variantId) {
  if (variantId) {
    return lockVariant(tx, variantId, productId);
  }
  if (!productId) {
    throw mappingError("INVALID_PRODUCT", "Product ID required (or provide variant_id)", { product_id: productId, variant_id: variantId });
  }
  const activeFilter = ONLY_ACTIVE_VARIANTS_FOR_SELECTION ? "AND is_active = TRUE" : "";
  const statsRows = await tx.$queryRaw`
    SELECT
      COUNT(*) AS variant_count,
      COALESCE(SUM(COALESCE(stock,0)),0) AS total_stock,
      MAX(CASE WHEN is_default = TRUE THEN id ELSE NULL END) AS default_variant_id,
      (SELECT id FROM product_variants pv2
        WHERE pv2.product_id = ${productId} ${Prisma.raw(activeFilter)} AND pv2.price IS NOT NULL
        ORDER BY pv2.price ASC LIMIT 1) AS min_price_variant_id
    FROM product_variants
    WHERE product_id = ${productId} ${Prisma.raw(activeFilter)}
  `;
  const stats = statsRows[0];
  const variantCount = stats ? Number(stats.variant_count) : 0;
  if (!stats || variantCount === 0) {
    throw mappingError("PRODUCT_NOT_FOUND", "No variants found for product (product not purchasable via variants-only flow)", { product_id: productId });
  }
  if (variantCount === 1) {
    const rows2 = await tx.$queryRaw`
      SELECT id, product_id, name, display_name, sku, price, sale_price, stock,
             discount_type, discount_value, vat_rate, vat_included, is_active, is_default, sort_order
      FROM product_variants
      WHERE product_id = ${productId} ${Prisma.raw(activeFilter)}
      LIMIT 1
      FOR UPDATE
    `;
    const row = rows2[0];
    if (!row) throw mappingError("VARIANT_NOT_FOUND", "No variant row found", { product_id: productId });
    const resolved = resolveFromVariantRow(row);
    resolved.source = "single_variant_auto";
    return resolved;
  }
  if (AUTO_SELECT_VARIANT) {
    const pickId = stats.default_variant_id || stats.min_price_variant_id;
    if (!pickId) {
      const fallback = await tx.$queryRaw`SELECT id FROM product_variants WHERE product_id = ${productId} ${Prisma.raw(activeFilter)} LIMIT 1 FOR UPDATE`;
      if (!fallback.length) {
        throw mappingError("VARIANT_REQUIRED", "Product has multiple variants; none available for auto-select", { product_id: productId, variant_count: variantCount });
      }
      const resolved2 = await lockVariant(tx, Number(fallback[0].id), productId);
      resolved2.source = "auto_selected_variant";
      resolved2.isDefault = false;
      return resolved2;
    }
    const resolved = await lockVariant(tx, pickId, productId);
    resolved.source = "auto_selected_variant";
    return resolved;
  }
  const rows = await tx.productVariant.findMany({
    where: { productId, isActive: true },
    orderBy: [{ isDefault: "desc" }, { price: "asc" }],
    take: 50,
    select: { id: true }
  });
  throw mappingError(
    "VARIANT_REQUIRED",
    "Product has multiple variants; please provide variant_id",
    { product_id: productId, variant_count: variantCount },
    rows.map((r) => r.id)
  );
}
async function fetchCartRows(id) {
  const rows = await prisma.cart.findMany({
    where: cartIdentityWhere(id),
    orderBy: { createdAt: "asc" },
    include: {
      variant: {
        include: {
          product: true,
          media: { orderBy: { id: "asc" }, take: 1 }
        }
      }
    }
  });
  return rows.map((row) => {
    const variant = row.variant ?? null;
    const product = variant?.product ?? null;
    const isVariant = row.variantId != null;
    const price = toNum(variant?.price);
    const salePrice = toNum(variant?.salePrice);
    const vatRate = toNum(variant?.vatRate, 5);
    const { finalPrice } = computePrices(
      price || null,
      salePrice || null,
      variant?.discountType ?? null,
      variant?.discountValue != null ? toNum(variant.discountValue) : null,
      vatRate,
      variant?.vatIncluded ?? true
    );
    const masterId = isVariant ? variant.productId : row.productId;
    const productId = isVariant ? variant.productId : row.productId;
    const cartKey = isVariant ? `v_${row.variantId}` : `p_${row.productId}`;
    return {
      id: row.id,
      cart_key: cartKey,
      type: isVariant ? "variant" : "product",
      tracking_id: row.trackingId,
      product_id: productId,
      master_id: masterId,
      variant_id: row.variantId,
      name: variant?.name ?? product?.name ?? null,
      slug: product?.slug ?? null,
      brand: product?.brand ?? null,
      sku: variant?.sku ?? null,
      image: variant?.media[0]?.filename ?? product?.mainImage ?? null,
      quantity: row.quantity,
      original_price: price > 0 ? price : salePrice > 0 ? salePrice : 0,
      sale_price: salePrice > 0 ? salePrice : 0,
      final_price: finalPrice,
      discount_type: variant?.discountType ?? null,
      discount_value: variant?.discountValue != null ? toNum(variant.discountValue) : 0,
      vat_rate: vatRate,
      vat_included: variant?.vatIncluded ?? false,
      stock: isVariant ? Number(variant.stock || 0) : null,
      created_at: row.createdAt,
      updated_at: row.updatedAt
    };
  });
}
async function getOrCreateTrackingId(tx, id) {
  const rows = await tx.cart.findMany({
    where: { status: "active", OR: [
      ...id.userId ? [{ userId: id.userId }] : [],
      ...id.guestToken ? [{ guestToken: id.guestToken }] : []
    ] },
    orderBy: { updatedAt: "desc" },
    select: { trackingId: true },
    take: 1e3
  });
  if (!rows.length) return generateTrackingId();
  const trackingId = rows[0].trackingId;
  if (rows.length > 1) {
    await tx.cart.updateMany({
      where: { OR: [
        ...id.userId ? [{ userId: id.userId }] : [],
        ...id.guestToken ? [{ guestToken: id.guestToken }] : []
      ], status: "active", trackingId: { not: trackingId } },
      data: { trackingId, updatedAt: /* @__PURE__ */ new Date() }
    });
  }
  return trackingId;
}
function findExistingCartWhere(id, trackingId, finalVariantId, finalProductId) {
  const identityWhere = cartIdentityWhere(id);
  const base = {
    status: "active",
    ...identityWhere
  };
  if (trackingId) base.trackingId = trackingId;
  if (finalVariantId != null) {
    base.variantId = finalVariantId;
    if (finalProductId != null) base.productId = finalProductId;
  } else {
    base.variantId = null;
    base.productId = finalProductId ?? void 0;
  }
  return base;
}
async function getCart(id) {
  const rows = await fetchCartRows(id);
  return rows;
}
async function getCartQuantityMap(id) {
  const rows = await fetchCartRows(id);
  const map = /* @__PURE__ */ new Map();
  for (const row of rows) {
    const variantKey = row.variant_id != null ? String(row.variant_id) : "";
    map.set(`${row.product_id}:${variantKey}`, row.quantity);
  }
  return map;
}
async function addToCart(id, input) {
  return prisma.$transaction(async (tx) => {
    let mapping;
    try {
      mapping = await resolveAndValidateMapping(tx, input.productId, input.variantId);
    } catch (err) {
      throw err;
    }
    if (input.productId && mapping.finalProductId && Number(mapping.finalProductId) !== Number(input.productId)) {
      throw mappingError("MISMATCHED_PARENT", "Provided product_id does not match resolved product", { received_product_id: input.productId, resolved_parent_product_id: mapping.finalProductId });
    }
    const trackingId = await getOrCreateTrackingId(tx, id);
    const existing = await tx.cart.findFirst({
      where: findExistingCartWhere(id, trackingId, mapping.finalVariantId, mapping.finalProductId),
      select: { id: true, quantity: true }
    });
    let newQty = input.quantity;
    if (existing) newQty += existing.quantity;
    if (newQty > mapping.availableStock) {
      throw mappingError("INSUFFICIENT_STOCK", `Only ${mapping.availableStock} item(s) available`, { available_stock: mapping.availableStock });
    }
    if (existing) {
      await tx.cart.update({
        where: { id: existing.id },
        data: { quantity: newQty, price: mapping.finalPrice, updatedAt: /* @__PURE__ */ new Date() }
      });
    } else {
      await tx.cart.create({
        data: {
          trackingId,
          userId: id.cartUserId,
          // '' for guests (parity: merge keys on user_id = '')
          guestToken: id.guestToken,
          productId: mapping.finalProductId,
          variantId: mapping.finalVariantId,
          quantity: input.quantity,
          price: mapping.finalPrice,
          status: "active"
        }
      });
    }
    return { trackingId, mapping };
  });
}
async function updateCartQty(id, input) {
  return prisma.$transaction(async (tx) => {
    let mapping;
    try {
      mapping = await resolveAndValidateMapping(tx, input.productId, input.variantId);
    } catch (err) {
      throw err;
    }
    if (input.productId && mapping.finalProductId && Number(mapping.finalProductId) !== Number(input.productId)) {
      throw mappingError("MISMATCHED_PARENT", "Provided product_id does not match resolved product", { received_product_id: input.productId, resolved_parent_product_id: mapping.finalProductId });
    }
    if (input.quantity < 1) {
      const { count } = await tx.cart.deleteMany({
        where: findExistingCartWhere(id, null, mapping.finalVariantId, mapping.finalProductId)
      });
      return { removed: true, removedCount: count };
    }
    await lockVariant(tx, mapping.finalVariantId, mapping.finalProductId);
    const existing = await tx.cart.findFirst({
      where: findExistingCartWhere(id, null, mapping.finalVariantId, mapping.finalProductId),
      select: { id: true }
    });
    if (!existing) {
      throw mappingError("CART_ITEM_NOT_FOUND", "Cart item not found");
    }
    if (input.quantity > mapping.availableStock) {
      throw mappingError("INSUFFICIENT_STOCK", "Insufficient stock", { available_stock: mapping.availableStock });
    }
    await tx.cart.update({
      where: { id: existing.id },
      data: { quantity: input.quantity, price: mapping.finalPrice, updatedAt: /* @__PURE__ */ new Date() }
    });
    return { removed: false, quantity: input.quantity };
  });
}
async function removeFromCart(id, variantId) {
  await prisma.$transaction(async (tx) => {
    await tx.cart.deleteMany({
      where: { variantId, status: "active", OR: [
        ...id.userId ? [{ userId: id.userId }] : [],
        ...id.guestToken ? [{ guestToken: id.guestToken }] : []
      ] }
    });
  });
}
export {
  addToCart,
  fetchCartRows,
  getCart,
  getCartQuantityMap,
  removeFromCart,
  updateCartQty
};
