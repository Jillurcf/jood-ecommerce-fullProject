import { sendSuccess } from "../../common/response.js";
import { createAppError } from "../../common/errors.js";
import * as service from "./admin.orders.service.js";
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
const getOrdersData = asyncHandler(async (req, res) => {
  const data = await service.getOrdersData({
    page: Number(req.query.page) || 1,
    limit: Number(req.query.limit) || 20,
    sort: String(req.query.sort || ""),
    dir: String(req.query.dir || "desc"),
    q: String(req.query.q || ""),
    order_number: String(req.query.order_number || ""),
    tracking_id: String(req.query.tracking_id || ""),
    payment_reference: String(req.query.payment_reference || ""),
    customer: String(req.query.customer || ""),
    email: String(req.query.email || ""),
    phone: String(req.query.phone || ""),
    payment_method: String(req.query.payment_method || ""),
    gateway_provider: String(req.query.gateway_provider || ""),
    order_status: String(req.query.order_status || ""),
    section: String(req.query.section || ""),
    status: String(req.query.status || ""),
    from: String(req.query.from || ""),
    to: String(req.query.to || ""),
    type: String(req.query.type || "")
  });
  sendSuccess(res, { ...data, serverTime: (/* @__PURE__ */ new Date()).toISOString() });
});
const getOrdersSummary = asyncHandler(async (req, res) => {
  const data = await service.getOrdersData({ limit: 1 });
  sendSuccess(res, { summaryData: data.summaryData });
});
const getOrderDetail = asyncHandler(async (req, res) => {
  const orderNumber = String(req.params.orderNumber || "");
  if (!orderNumber) throw createAppError(422, "VALIDATION_ERROR", "Order number is required");
  const data = await service.getOrderDetail(orderNumber);
  sendSuccess(res, data);
});
const liveSearch = asyncHandler(async (req, res) => {
  const q = String(req.query.q || req.query.search || "");
  const data = await service.liveSearch(q);
  sendSuccess(res, data);
});
const exportOrders = asyncHandler(async (req, res) => {
  const data = await service.exportOrders({
    sort: String(req.query.sort || ""),
    dir: String(req.query.dir || "desc"),
    q: String(req.query.q || ""),
    order_number: String(req.query.order_number || ""),
    tracking_id: String(req.query.tracking_id || ""),
    payment_reference: String(req.query.payment_reference || ""),
    customer: String(req.query.customer || ""),
    email: String(req.query.email || ""),
    phone: String(req.query.phone || ""),
    payment_method: String(req.query.payment_method || ""),
    gateway_provider: String(req.query.gateway_provider || ""),
    order_status: String(req.query.order_status || ""),
    section: String(req.query.section || ""),
    status: String(req.query.status || ""),
    from: String(req.query.from || ""),
    to: String(req.query.to || ""),
    type: String(req.query.type || "")
  });
  sendSuccess(res, data);
});
const cancelOrder = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!id) throw createAppError(422, "VALIDATION_ERROR", "Order ID is required");
  const data = await service.cancelOrder(id);
  sendSuccess(res, data, data.message);
});
const getStatusOptions = asyncHandler(async (_req, res) => {
  const data = service.getStatusOptions();
  sendSuccess(res, data);
});
export {
  cancelOrder,
  exportOrders,
  getOrderDetail,
  getOrdersData,
  getOrdersSummary,
  getStatusOptions,
  liveSearch
};
