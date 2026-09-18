import { sendSuccess } from "../../common/response.js";
import { createAppError } from "../../common/errors.js";
import * as service from "./admin.support.service.js";
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
const listSupport = asyncHandler(async (req, res) => {
  const data = await service.listSupport({
    page: Number(req.query.page) || 1,
    limit: Number(req.query.limit) || 20,
    q: String(req.query.q || ""),
    status: String(req.query.status || ""),
    type: String(req.query.type || "all")
  });
  sendSuccess(res, data);
});
const getSupportDetail = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!id) throw createAppError(422, "VALIDATION_ERROR", "ID is required");
  const data = await service.getSupportDetail(id);
  sendSuccess(res, data);
});
const updateSupportStatus = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!id) throw createAppError(422, "VALIDATION_ERROR", "ID is required");
  const status = String(req.body?.status || "");
  const data = await service.updateSupportStatus(id, status);
  sendSuccess(res, data, data.message);
});
export {
  getSupportDetail,
  listSupport,
  updateSupportStatus
};
