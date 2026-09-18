import { sendSuccess } from "../../common/response.js";
import { resolveCartIdentity } from "./identity.js";
import * as service from "./cart.service.js";
import { emitCartUpdated } from "./events.js";
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
function identityOf(req) {
  return resolveCartIdentity(req);
}
function sendAppError(res, err) {
  const code = err.code || "INVALID_ITEM";
  if (code === "VARIANT_REQUIRED" && err.availableVariantIds?.length) {
    return res.status(400).json({
      success: false,
      message: err.message || "Variant selection required",
      error_code: code,
      available_variants: err.availableVariantIds,
      debug: err.debug ?? null
    });
  }
  const status = ["PRODUCT_NOT_FOUND", "VARIANT_NOT_FOUND"].includes(code) ? 404 : 400;
  return res.status(status).json({
    success: false,
    message: err.message || "Invalid item",
    error_code: code,
    debug: err.debug ?? null
  });
}
const toNullableId = (v) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};
const getCart = asyncHandler(async (req, res) => {
  const rows = await service.getCart(identityOf(req));
  sendSuccess(res, rows);
});
const addToCart = asyncHandler(async (req, res) => {
  const rawQuantity = Number(req.body?.quantity ?? 1);
  if (!Number.isInteger(rawQuantity) || rawQuantity < 1) {
    return res.status(400).json({ success: false, message: "Invalid quantity", error_code: "INVALID_QUANTITY" });
  }
  const productId = toNullableId(req.body?.product_id);
  const variantId = toNullableId(req.body?.variant_id);
  try {
    const id = identityOf(req);
    const result = await service.addToCart(id, { productId, variantId, quantity: rawQuantity });
    const rows = await service.getCart(id);
    emitCartUpdated({
      userId: id.userId,
      guestToken: id.guestToken,
      trackingId: result.trackingId,
      variant_id: result.mapping.finalVariantId,
      quantity: rawQuantity
    });
    sendSuccess(res, rows, "Added to cart", 200);
  } catch (err) {
    return sendAppError(res, err);
  }
});
const updateCartQty = asyncHandler(async (req, res) => {
  const rawQuantity = Number(req.body?.quantity);
  if (!Number.isInteger(rawQuantity)) {
    return res.status(400).json({ success: false, message: "Invalid quantity", error_code: "INVALID_QUANTITY" });
  }
  const productId = toNullableId(req.body?.product_id);
  const variantId = toNullableId(req.body?.variant_id);
  try {
    const id = identityOf(req);
    const result = await service.updateCartQty(id, { productId, variantId, quantity: rawQuantity });
    const rows = await service.getCart(id);
    emitCartUpdated({ userId: id.userId, guestToken: id.guestToken, variant_id: variantId });
    if (result.removed) {
      return sendSuccess(res, rows, "Item removed", 200);
    }
    return sendSuccess(res, rows, "Quantity updated", 200);
  } catch (err) {
    const e = err;
    if (e.code === "CART_ITEM_NOT_FOUND") {
      return res.status(404).json({ success: false, message: e.message || "Cart item not found", error_code: e.code });
    }
    return sendAppError(res, e);
  }
});
const removeFromCart = asyncHandler(async (req, res) => {
  const variantId = toNullableId(req.body?.variant_id);
  if (!variantId) {
    return res.status(400).json({ success: false, message: "variant_id required", error_code: "INVALID_INPUT" });
  }
  const id = identityOf(req);
  await service.removeFromCart(id, variantId);
  const rows = await service.getCart(id);
  emitCartUpdated({ userId: id.userId, guestToken: id.guestToken, variant_id: variantId });
  return sendSuccess(res, rows, "Item removed", 200);
});
export {
  addToCart,
  getCart,
  removeFromCart,
  updateCartQty
};
