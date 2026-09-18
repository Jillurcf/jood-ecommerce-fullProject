import { sendSuccess } from "../../common/response.js";
import { createAppError } from "../../common/errors.js";
import * as service from "./admin.products.service.js";
import { emitProductCreated, emitProductUpdated, emitProductDeleted } from "../../lib/emit.js";
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
const idParam = (req) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    throw createAppError(422, "VALIDATION_ERROR", "Invalid product ID");
  }
  return id;
};
const listProducts = asyncHandler(async (req, res) => {
  const data = await service.listProducts({
    page: Number(req.query.page) || 1,
    limit: Number(req.query.limit) || 20,
    q: String(req.query.q || ""),
    status: String(req.query.status || ""),
    parent_category_id: Number(req.query.parent_category_id) || void 0,
    category_id: Number(req.query.category_id) || void 0
  });
  sendSuccess(res, data);
});
const searchProducts = asyncHandler(async (req, res) => {
  const q = String(req.query.q || req.query.search || "");
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
  const data = await service.searchProducts(q, limit);
  sendSuccess(res, data);
});
const getProduct = asyncHandler(async (req, res) => {
  const data = await service.getProduct(idParam(req));
  sendSuccess(res, data);
});
const createProduct = asyncHandler(async (req, res) => {
  const data = await service.createProduct(req.body ?? {});
  emitProductCreated(data);
  sendSuccess(res, data, "Product created", 201);
});
const updateProduct = asyncHandler(async (req, res) => {
  const data = await service.updateProduct(idParam(req), req.body ?? {});
  emitProductUpdated(data);
  sendSuccess(res, data, "Product updated");
});
const deleteProduct = asyncHandler(async (req, res) => {
  const data = await service.deleteProduct(idParam(req));
  emitProductDeleted({ id: idParam(req) });
  sendSuccess(res, data, data.message);
});
export {
  createProduct,
  deleteProduct,
  getProduct,
  listProducts,
  searchProducts,
  updateProduct
};
