import { sendSuccess } from "../../common/response.js";
import { createAppError } from "../../common/errors.js";
import * as service from "./admin.accounts.service.js";
import { emitAdminEvent } from "../../lib/emit.js";
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
function requireAdminId(req) {
  if (!req.user || req.user.type !== "admin") {
    throw createAppError(401, "UNAUTHORIZED", "Admin authentication required");
  }
  return req.user.id;
}
function requireAdminRole(req) {
  if (!req.user || req.user.type !== "admin") {
    throw createAppError(401, "UNAUTHORIZED", "Admin authentication required");
  }
  return req.user.role;
}
const getOverview = asyncHandler(async (req, res) => {
  requireAdminRole(req);
  const data = await service.getOverview();
  sendSuccess(res, data);
});
const requestCreateAdmin = asyncHandler(async (req, res) => {
  const actorId = requireAdminId(req);
  const actorRole = requireAdminRole(req);
  const data = await service.requestCreateAdmin(actorId, actorRole, {
    full_name: String(req.body?.full_name || ""),
    email: String(req.body?.email || ""),
    phone: String(req.body?.phone || ""),
    role: String(req.body?.role || "admin")
  });
  sendSuccess(res, data, data.message);
});
const verifyCreateAdminOtp = asyncHandler(async (req, res) => {
  const actorId = requireAdminId(req);
  const data = await service.verifyCreateAdminOtp(
    actorId,
    String(req.body?.pending_token || ""),
    String(req.body?.otp || ""),
    req.body?.step
  );
  sendSuccess(res, data, data.message);
});
const suspendAdmin = asyncHandler(async (req, res) => {
  const id = Number(req.body?.id || req.params?.id);
  if (!id) throw createAppError(422, "VALIDATION_ERROR", "Admin ID is required");
  const data = await service.suspendAdmin(id);
  emitAdminEvent("admin:statusChanged", { adminId: id, action: "suspended", by: req.user?.id });
  sendSuccess(res, data, data.message);
});
const activateAdmin = asyncHandler(async (req, res) => {
  const id = Number(req.body?.id || req.params?.id);
  if (!id) throw createAppError(422, "VALIDATION_ERROR", "Admin ID is required");
  const data = await service.activateAdmin(id);
  emitAdminEvent("admin:statusChanged", { adminId: id, action: "activated", by: req.user?.id });
  sendSuccess(res, data, data.message);
});
const forceLogoutAdmin = asyncHandler(async (req, res) => {
  const id = Number(req.body?.id || req.params?.id);
  if (!id) throw createAppError(422, "VALIDATION_ERROR", "Admin ID is required");
  const data = await service.forceLogoutAdmin(id);
  emitAdminEvent("admin:forceLogout", { adminId: id, by: req.user?.id });
  sendSuccess(res, data, data.message);
});
const listAdmins = asyncHandler(async (req, res) => {
  const data = await service.listAdmins({
    page: Number(req.query.page) || 1,
    limit: Number(req.query.limit) || 20,
    q: String(req.query.q || ""),
    status: String(req.query.status || ""),
    role: String(req.query.role || "admin")
  });
  sendSuccess(res, data);
});
const listMasterAdmins = asyncHandler(async (req, res) => {
  const data = await service.listMasterAdmins({
    page: Number(req.query.page) || 1,
    limit: Number(req.query.limit) || 20,
    q: String(req.query.q || ""),
    status: String(req.query.status || "")
  });
  sendSuccess(res, data);
});
const listSuperAdmins = asyncHandler(async (req, res) => {
  const data = await service.listSuperAdmins({
    page: Number(req.query.page) || 1,
    limit: Number(req.query.limit) || 20,
    q: String(req.query.q || ""),
    status: String(req.query.status || "")
  });
  sendSuccess(res, data);
});
const approveAdmin = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!id) throw createAppError(422, "VALIDATION_ERROR", "Admin ID is required");
  const data = await service.approveAdmin(id, String(req.body?.otp || ""));
  sendSuccess(res, data, data.message);
});
export {
  activateAdmin,
  approveAdmin,
  forceLogoutAdmin,
  getOverview,
  listAdmins,
  listMasterAdmins,
  listSuperAdmins,
  requestCreateAdmin,
  suspendAdmin,
  verifyCreateAdminOtp
};
