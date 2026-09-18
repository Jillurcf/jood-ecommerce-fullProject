import { sendSuccess } from "../../common/response.js";
import { createAppError } from "../../common/errors.js";
import * as service from "./admin.dashboard.service.js";
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
const getDashboard = asyncHandler(async (_req, res) => {
  const data = await service.getDashboard();
  sendSuccess(res, data);
});
const getBilling = asyncHandler(async (req, res) => {
  const data = await service.getBilling({
    page: Number(req.query.page) || 1,
    limit: Number(req.query.limit) || 20,
    q: String(req.query.q || ""),
    payment_status: String(req.query.payment_status || ""),
    payment_method: String(req.query.payment_method || ""),
    order_status: String(req.query.order_status || ""),
    city: String(req.query.city || ""),
    country: String(req.query.country || ""),
    date_from: String(req.query.date_from || ""),
    date_to: String(req.query.date_to || ""),
    min_total: req.query.min_total !== void 0 ? Number(req.query.min_total) : void 0,
    max_total: req.query.max_total !== void 0 ? Number(req.query.max_total) : void 0
  });
  sendSuccess(res, data);
});
const getBillingChart = asyncHandler(async (_req, res) => {
  const data = await service.getBillingChart();
  sendSuccess(res, data);
});
const getBillingDetail = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!id) throw createAppError(422, "VALIDATION_ERROR", "User ID is required");
  const data = await service.getBillingDetail(id);
  sendSuccess(res, data);
});
const getBillingPdf = asyncHandler(async (req, res) => {
  const userId = Number(req.query.user_id) || void 0;
  const data = await service.getBillingPdfData(userId);
  sendSuccess(res, data);
});
const getTransactions = asyncHandler(async (req, res) => {
  const data = await service.getTransactions({
    page: Number(req.query.page) || 1,
    limit: Number(req.query.limit) || 25,
    sort: String(req.query.sort || ""),
    dir: String(req.query.dir || "desc"),
    q: String(req.query.q || ""),
    status: String(req.query.status || ""),
    type: String(req.query.type || ""),
    from: String(req.query.from || ""),
    to: String(req.query.to || "")
  });
  sendSuccess(res, data);
});
const getTransactionSummary = asyncHandler(async (_req, res) => {
  const data = await service.getTransactionSummary();
  sendSuccess(res, data);
});
const getTransactionItem = asyncHandler(async (req, res) => {
  const itemType = String(req.params.type || "");
  const itemId = Number(req.params.id);
  if (!itemType || !itemId) throw createAppError(422, "VALIDATION_ERROR", "Type and ID are required");
  const data = await service.getTransactionItem(itemType, itemId);
  sendSuccess(res, data);
});
const exportTransactions = asyncHandler(async (req, res) => {
  const data = await service.exportTransactions({
    status: String(req.query.status || ""),
    from: String(req.query.from || ""),
    to: String(req.query.to || ""),
    format: String(req.query.format || "json")
  });
  sendSuccess(res, data);
});
const getTransactionChart = asyncHandler(async (_req, res) => {
  const data = await service.getTransactionChart();
  sendSuccess(res, data);
});
const productSearch = asyncHandler(async (req, res) => {
  const q = String(req.query.q || req.query.search || "");
  const data = await service.productSearch(q);
  sendSuccess(res, data);
});
const getVisitors = asyncHandler(async (req, res) => {
  const data = await service.getVisitors({
    page: Number(req.query.page) || 1,
    limit: Number(req.query.limit) || 10
  });
  sendSuccess(res, data);
});
const getVisitorChart = asyncHandler(async (req, res) => {
  const range = String(req.query.range || "day");
  const data = await service.getVisitorChart(range);
  sendSuccess(res, data);
});
const getVisitorDetail = asyncHandler(async (req, res) => {
  const visitorKey = String(req.params.visitorKey || "");
  if (!visitorKey) throw createAppError(422, "VALIDATION_ERROR", "Visitor key is required");
  const data = await service.getVisitorDetail(visitorKey, {
    page: Number(req.query.page) || 1,
    limit: Number(req.query.limit) || 20
  });
  sendSuccess(res, data);
});
export {
  exportTransactions,
  getBilling,
  getBillingChart,
  getBillingDetail,
  getBillingPdf,
  getDashboard,
  getTransactionChart,
  getTransactionItem,
  getTransactionSummary,
  getTransactions,
  getVisitorChart,
  getVisitorDetail,
  getVisitors,
  productSearch
};
