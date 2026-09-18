import { sendSuccess } from "../../common/response.js";
import { createAppError } from "../../common/errors.js";
import * as service from "./admin.categories.service.js";
import { emitCategoryAddedOrUpdated, emitCategoryDeleted } from "../../lib/emit.js";
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
const idParam = (req) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    throw createAppError(422, "VALIDATION_ERROR", "Invalid ID");
  }
  return id;
};
const listParentCategories = asyncHandler(async (req, res) => {
  const data = await service.listParentCategories();
  sendSuccess(res, data);
});
const getParentCategory = asyncHandler(async (req, res) => {
  const data = await service.getParentCategory(idParam(req));
  sendSuccess(res, data);
});
const createParentCategory = asyncHandler(async (req, res) => {
  const data = await service.createParentCategory({
    name: String(req.body?.name || ""),
    slug: String(req.body?.slug || ""),
    display_order: Number(req.body?.display_order) || void 0,
    status: req.body?.status,
    meta_title: String(req.body?.meta_title || ""),
    meta_description: String(req.body?.meta_description || ""),
    image: String(req.body?.image || "")
  });
  emitCategoryAddedOrUpdated(data);
  sendSuccess(res, data, data.message, 201);
});
const updateParentCategory = asyncHandler(async (req, res) => {
  const data = await service.updateParentCategory(idParam(req), {
    name: String(req.body?.name ?? ""),
    slug: String(req.body?.slug ?? ""),
    display_order: req.body?.display_order !== void 0 ? Number(req.body.display_order) : void 0,
    status: req.body?.status,
    meta_title: String(req.body?.meta_title ?? ""),
    meta_description: String(req.body?.meta_description ?? ""),
    image: String(req.body?.image ?? "")
  });
  emitCategoryAddedOrUpdated(data);
  sendSuccess(res, data, data.message);
});
const deleteParentCategory = asyncHandler(async (req, res) => {
  const id = idParam(req);
  const data = await service.deleteParentCategory(id);
  emitCategoryDeleted({ id });
  sendSuccess(res, data, data.message);
});
const removeParentCategoryImage = asyncHandler(async (req, res) => {
  const data = await service.removeParentCategoryImage(idParam(req));
  sendSuccess(res, data, data.message);
});
const listCategories = asyncHandler(async (req, res) => {
  const parentId = Number(req.query.parent_id) || void 0;
  const data = await service.listCategories(parentId);
  sendSuccess(res, data);
});
const getCategory = asyncHandler(async (req, res) => {
  const data = await service.getCategory(idParam(req));
  sendSuccess(res, data);
});
const createCategory = asyncHandler(async (req, res) => {
  const data = await service.createCategory({
    parent_id: Number(req.body?.parent_id) || void 0,
    name: String(req.body?.name || ""),
    slug: String(req.body?.slug || ""),
    description: String(req.body?.description || ""),
    status: req.body?.status,
    image: String(req.body?.image || "")
  });
  emitCategoryAddedOrUpdated(data);
  sendSuccess(res, data, data.message, 201);
});
const updateCategory = asyncHandler(async (req, res) => {
  const data = await service.updateCategory(idParam(req), {
    parent_id: req.body?.parent_id !== void 0 ? Number(req.body.parent_id) : void 0,
    name: String(req.body?.name ?? ""),
    slug: String(req.body?.slug ?? ""),
    description: String(req.body?.description ?? ""),
    status: req.body?.status,
    image: String(req.body?.image ?? "")
  });
  emitCategoryAddedOrUpdated(data);
  sendSuccess(res, data, data.message);
});
const deleteCategory = asyncHandler(async (req, res) => {
  const id = idParam(req);
  const data = await service.deleteCategory(id);
  emitCategoryDeleted({ id });
  sendSuccess(res, data, data.message);
});
const removeCategoryImage = asyncHandler(async (req, res) => {
  const data = await service.removeCategoryImage(idParam(req));
  sendSuccess(res, data, data.message);
});
export {
  createCategory,
  createParentCategory,
  deleteCategory,
  deleteParentCategory,
  getCategory,
  getParentCategory,
  listCategories,
  listParentCategories,
  removeCategoryImage,
  removeParentCategoryImage,
  updateCategory,
  updateParentCategory
};
