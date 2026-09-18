import { sendSuccess } from "../../common/response.js";
import { createAppError } from "../../common/errors.js";
import * as service from "./admin.profile.service.js";
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
const getProfile = asyncHandler(async (req, res) => {
  const data = await service.getProfile(requireAdminId(req));
  sendSuccess(res, data);
});
const updateProfile = asyncHandler(async (req, res) => {
  const data = await service.updateProfile(requireAdminId(req), req.body ?? {});
  sendSuccess(res, data, data.message);
});
const heartbeat = asyncHandler(async (req, res) => {
  const data = await service.heartbeat(requireAdminId(req));
  sendSuccess(res, data);
});
const setOffline = asyncHandler(async (req, res) => {
  const data = await service.setOffline(requireAdminId(req));
  sendSuccess(res, data);
});
const getMe = asyncHandler(async (req, res) => {
  const data = await service.getMe(requireAdminId(req));
  sendSuccess(res, data);
});
const updateEmail = asyncHandler(async (req, res) => {
  const data = await service.requestEmailChange(
    requireAdminId(req),
    String(req.body?.new_email || req.body?.email || "")
  );
  sendSuccess(res, data, data.message);
});
const updatePassword = asyncHandler(async (req, res) => {
  const data = await service.updatePassword(requireAdminId(req), {
    current_password: String(req.body?.current_password || ""),
    new_password: String(req.body?.new_password || ""),
    confirm_password: String(req.body?.confirm_password || "")
  });
  sendSuccess(res, { session_version: data.sessionVersion, password_updated: true }, "Password updated");
});
export {
  getMe,
  getProfile,
  heartbeat,
  setOffline,
  updateEmail,
  updatePassword,
  updateProfile
};
