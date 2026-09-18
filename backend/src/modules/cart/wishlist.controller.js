import { sendSuccess } from "../../common/response.js";
import { resolveCartIdentity } from "./identity.js";
import * as service from "./wishlist.service.js";
import { emitWishlistUpdated } from "./events.js";
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
function identityOf(req) {
  return resolveCartIdentity(req);
}
const parsePositiveInt = (value) => {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};
const getWishlist = asyncHandler(async (req, res) => {
  const id = identityOf(req);
  const { ids, items } = await service.getWishlist(id);
  return sendSuccess(res, {
    data: ids,
    items,
    total: items.length,
    guestId: id.isCustomer ? null : id.guestId
  });
});
const toggleWishlist = asyncHandler(async (req, res) => {
  const variantId = parsePositiveInt(req.body?.variant_id ?? req.body?.variantId);
  if (!variantId) {
    return res.status(400).json({ success: false, message: "Missing or invalid variant_id", error_code: "INVALID_INPUT" });
  }
  const id = identityOf(req);
  if (!id.isCustomer && !id.guestId) {
    return res.status(400).json({ success: false, message: "Missing user or guest identity", error_code: "IDENTITY_REQUIRED" });
  }
  try {
    const result = await service.toggleWishlist(id, variantId);
    emitWishlistUpdated({
      variant_id: variantId,
      userId: id.numericId,
      guestId: id.guestId,
      is_fav: result.is_fav,
      action: result.action
    });
    return sendSuccess(res, {
      ...result,
      guestId: id.isCustomer ? null : id.guestId,
      data: result.row ?? null
    }, void 0, 200);
  } catch (err) {
    console.error("WishlistToggleError:", err);
    return res.status(500).json({ success: false, message: "Database error", error_code: "DB_ERROR" });
  }
});
export {
  getWishlist,
  toggleWishlist
};
