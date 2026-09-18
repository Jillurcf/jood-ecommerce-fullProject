import { sendSuccess } from "../../common/response.js";
import { createAppError } from "../../common/errors.js";
import { setAuthCookies } from "../auth/token.service.js";
import * as service from "./account.service.js";
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
function currentUserId(req) {
  if (!req.user || req.user.type !== "customer") {
    throw createAppError(401, "UNAUTHORIZED", "Authentication required");
  }
  return req.user.id;
}
const idParam = (req) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    throw createAppError(422, "VALIDATION_ERROR", "Invalid id");
  }
  return id;
};
const getProfile = asyncHandler(async (req, res) => {
  const profile = await service.getProfile(currentUserId(req));
  sendSuccess(res, profile);
});
const updateProfile = asyncHandler(async (req, res) => {
  const profile = await service.updateProfile(currentUserId(req), req.body ?? {});
  sendSuccess(res, profile, "Profile updated");
});
const getOrders = asyncHandler(async (req, res) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 20;
  const data = await service.getOrders(currentUserId(req), page, limit);
  sendSuccess(res, data);
});
const getOrderDetail = asyncHandler(async (req, res) => {
  const orderNumber = String(req.params.orderNumber || "");
  if (!orderNumber) throw createAppError(422, "VALIDATION_ERROR", "Order number is required");
  const data = await service.getOrderDetail(currentUserId(req), orderNumber);
  sendSuccess(res, data);
});
const getAddresses = asyncHandler(async (req, res) => {
  const data = await service.getAddresses(currentUserId(req));
  sendSuccess(res, data);
});
const createAddress = asyncHandler(async (req, res) => {
  const row = await service.createAddress(currentUserId(req), req.body ?? {});
  sendSuccess(res, row, "Address added", 201);
});
const updateAddress = asyncHandler(async (req, res) => {
  const row = await service.updateAddress(currentUserId(req), idParam(req), req.body ?? {});
  sendSuccess(res, row, "Address updated");
});
const deleteAddress = asyncHandler(async (req, res) => {
  const result = await service.deleteAddress(currentUserId(req), idParam(req));
  sendSuccess(res, result, "Address deleted");
});
const setDefaultAddress = asyncHandler(async (req, res) => {
  const result = await service.setDefaultAddress(currentUserId(req), idParam(req));
  sendSuccess(res, result, "Default address set");
});
const getPaymentMethods = asyncHandler(async (req, res) => {
  const data = await service.getPaymentMethods(currentUserId(req));
  sendSuccess(res, data);
});
const deletePaymentMethod = asyncHandler(async (req, res) => {
  const result = await service.deletePaymentMethod(currentUserId(req), idParam(req));
  sendSuccess(res, result, "Payment method removed");
});
const getBilling = asyncHandler(async (req, res) => {
  const data = await service.getBilling(currentUserId(req));
  sendSuccess(res, data);
});
const getTransactionHistory = asyncHandler(async (req, res) => {
  const data = await service.getTransactionHistory(currentUserId(req), req.query);
  sendSuccess(res, data);
});
const getTransactionSummary = asyncHandler(async (req, res) => {
  const data = await service.getTransactionSummary(currentUserId(req));
  sendSuccess(res, data);
});
const requestEmailChange = asyncHandler(async (req, res) => {
  const result = await service.requestEmailChange(currentUserId(req), String(req.body?.new_email || req.body?.email || ""));
  sendSuccess(res, result, "Verification code sent");
});
const resendEmailOtp = asyncHandler(async (req, res) => {
  const result = await service.resendEmailOtp(currentUserId(req));
  sendSuccess(res, result, "Verification code resent");
});
const verifyEmailChange = asyncHandler(async (req, res) => {
  const result = await service.verifyAndChangeEmail(currentUserId(req), String(req.body?.otp || ""));
  setAuthCookies(res, result.pair, Boolean(req.body?.remember_me));
  sendSuccess(res, { session_version: result.sessionVersion, email_updated: true }, "Email updated");
});
const updatePassword = asyncHandler(async (req, res) => {
  const result = await service.updatePassword(currentUserId(req), {
    current_password: String(req.body?.current_password || ""),
    new_password: String(req.body?.new_password || ""),
    confirm_password: String(req.body?.confirm_password || "")
  });
  setAuthCookies(res, result.pair, Boolean(req.body?.remember_me));
  sendSuccess(res, { session_version: result.sessionVersion, password_updated: true }, "Password updated");
});
export {
  createAddress,
  deleteAddress,
  deletePaymentMethod,
  getAddresses,
  getBilling,
  getOrderDetail,
  getOrders,
  getPaymentMethods,
  getProfile,
  getTransactionHistory,
  getTransactionSummary,
  requestEmailChange,
  resendEmailOtp,
  setDefaultAddress,
  updateAddress,
  updatePassword,
  updateProfile,
  verifyEmailChange
};
