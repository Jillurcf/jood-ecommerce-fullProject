import { sendSuccess } from "../../common/response.js";
import { createAppError } from "../../common/errors.js";
import * as service from "./admin.users.service.js";
import { emitUserEvent } from "../../lib/emit.js";
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
const idParam = (req) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    throw createAppError(422, "VALIDATION_ERROR", "Invalid user ID");
  }
  return id;
};
const listUsers = asyncHandler(async (req, res) => {
  const data = await service.listUsers({
    page: Number(req.query.page) || 1,
    limit: Number(req.query.limit) || 20,
    q: String(req.query.q || ""),
    status: String(req.query.status || "")
  });
  sendSuccess(res, data);
});
const getUser = asyncHandler(async (req, res) => {
  const data = await service.getUser(idParam(req));
  sendSuccess(res, data);
});
const createUser = asyncHandler(async (req, res) => {
  const data = await service.createUser({
    full_name: String(req.body?.full_name || ""),
    email: String(req.body?.email || ""),
    phone: String(req.body?.phone || ""),
    password: String(req.body?.password || "")
  });
  sendSuccess(res, data, data.message, 201);
});
const updateUser = asyncHandler(async (req, res) => {
  const data = await service.updateUser(idParam(req), {
    full_name: String(req.body?.full_name ?? ""),
    phone: String(req.body?.phone ?? ""),
    status: String(req.body?.status ?? "")
  });
  sendSuccess(res, data, data.message);
});
const blockUser = asyncHandler(async (req, res) => {
  const data = await service.blockUser(idParam(req));
  emitUserEvent("user:blocked", { userId: idParam(req), by: req.user?.id });
  sendSuccess(res, data, data.message);
});
const freezeUser = asyncHandler(async (req, res) => {
  const data = await service.freezeUser(idParam(req));
  emitUserEvent("user:frozen", { userId: idParam(req), by: req.user?.id });
  sendSuccess(res, data, data.message);
});
const deleteUser = asyncHandler(async (req, res) => {
  const data = await service.deleteUser(idParam(req));
  emitUserEvent("user:deleted", { userId: idParam(req), by: req.user?.id });
  sendSuccess(res, data, data.message);
});
export {
  blockUser,
  createUser,
  deleteUser,
  freezeUser,
  getUser,
  listUsers,
  updateUser
};
