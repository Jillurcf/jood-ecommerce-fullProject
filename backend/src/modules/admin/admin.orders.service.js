import { prisma } from "../../lib/prisma.js";
import { createAppError } from "../../common/errors.js";
import { sanitizeText } from "../auth/auth.config.js";
const PAID_STATUSES = ["paid", "completed", "captured", "successful", "success"];
const PENDING_STATUSES = ["pending", "initiated", "pending_payment", "processing", "ongoing"];
const REFUNDED_STATUSES = ["refunded", "refund", "partially_refunded"];
const CANCELLED_STATUSES = ["cancelled", "canceled"];
const STATUS_OPTIONS = [
  "pending",
  "initiated",
  "pending_payment",
  "processing",
  "ongoing",
  "confirmed",
  "completed",
  "cancelled",
  "refunded",
  "partially_refunded"
];
function toStatusBucket(status) {
  const s = (status || "").toLowerCase();
  if (PAID_STATUSES.includes(s)) return "paid";
  if (REFUNDED_STATUSES.includes(s)) return "refunded";
  if (CANCELLED_STATUSES.includes(s)) return "cancelled";
  if (PENDING_STATUSES.includes(s)) return "pending";
  return "other";
}
function buildOrderWhere(query) {
  const where = {};
  if (query.q) {
    const q = sanitizeText(query.q);
    where.OR = [
      { orderNumber: { contains: q } },
      { trackingId: { contains: q } },
      { paymentReference: { contains: q } },
      { customerName: { contains: q } },
      { email: { contains: q } },
      { phone: { contains: q } }
    ];
  }
  if (query.order_number) where.orderNumber = { contains: sanitizeText(query.order_number) };
  if (query.tracking_id) where.trackingId = { contains: sanitizeText(query.tracking_id) };
  if (query.payment_reference) where.paymentReference = { contains: sanitizeText(query.payment_reference || "") };
  if (query.customer) where.customerName = { contains: sanitizeText(query.customer || "") };
  if (query.email) where.email = { contains: sanitizeText(query.email || "") };
  if (query.phone) where.phone = { contains: sanitizeText(query.phone || "") };
  if (query.payment_method) where.paymentMethod = sanitizeText(query.payment_method || "");
  if (query.gateway_provider) where.gatewayProvider = sanitizeText(query.gateway_provider || "");
  if (query.order_status) where.orderStatus = sanitizeText(query.order_status || "");
  if (query.section || query.status) {
    const bucket = sanitizeText(query.section || query.status || "");
    let statuses;
    switch (bucket) {
      case "paid":
        statuses = PAID_STATUSES;
        break;
      case "pending":
        statuses = PENDING_STATUSES;
        break;
      case "refunded":
        statuses = REFUNDED_STATUSES;
        break;
      case "cancelled":
        statuses = CANCELLED_STATUSES;
        break;
      default:
        statuses = [bucket];
    }
    where.paymentStatus = { in: statuses };
  }
  if (query.from) {
    const d = new Date(query.from);
    if (!Number.isNaN(d.getTime())) {
      where.createdAt = { ...where.createdAt, gte: d };
    }
  }
  if (query.to) {
    const d = new Date(query.to);
    if (!Number.isNaN(d.getTime())) {
      where.createdAt = { ...where.createdAt, lte: d };
    }
  }
  if (query.type === "today") {
    const start = /* @__PURE__ */ new Date();
    start.setHours(0, 0, 0, 0);
    where.createdAt = { ...where.createdAt, gte: start };
  } else if (query.type === "weekly") {
    const start = /* @__PURE__ */ new Date();
    start.setDate(start.getDate() - 7);
    where.createdAt = { ...where.createdAt, gte: start };
  } else if (query.type === "month") {
    const start = /* @__PURE__ */ new Date();
    start.setMonth(start.getMonth() - 1);
    where.createdAt = { ...where.createdAt, gte: start };
  }
  return where;
}
const SORT_MAP = {
  id: "id",
  created_at: "createdAt",
  updated_at: "updatedAt",
  total: "grandTotal",
  status: "paymentStatus",
  order_status: "orderStatus",
  customer_name: "customerName",
  payment_method: "paymentMethod",
  tracking_id: "trackingId",
  payment_reference: "paymentReference"
};
async function getOrdersData(query) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(5, Number(query.limit) || 20));
  const offset = (page - 1) * limit;
  const sortField = SORT_MAP[sanitizeText(query.sort || "") || "created_at"] || "createdAt";
  const sortDir = (query.dir || "desc").toLowerCase() === "asc" ? "asc" : "desc";
  const where = buildOrderWhere(query);
  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: {
        customer: { select: { id: true, fullName: true, email: true, phone: true } },
        items: { select: { id: true, productName: true, quantity: true, lineTotal: true } }
      },
      orderBy: { [sortField]: sortDir },
      take: limit,
      skip: offset
    }),
    prisma.order.count({ where })
  ]);
  const [totalOrders, paidTotal, pendingTotal, refundedTotal, cancelledTotal, thisMonthRevenue] = await Promise.all([
    prisma.order.count({ where: {} }),
    prisma.order.aggregate({ _sum: { grandTotal: true }, where: { paymentStatus: { in: PAID_STATUSES } } }),
    prisma.order.aggregate({ _sum: { grandTotal: true }, where: { paymentStatus: { in: PENDING_STATUSES } } }),
    prisma.order.aggregate({ _sum: { grandTotal: true }, where: { paymentStatus: { in: REFUNDED_STATUSES } } }),
    prisma.order.count({ where: { paymentStatus: { in: CANCELLED_STATUSES } } }),
    prisma.order.aggregate({
      _sum: { grandTotal: true },
      where: {
        paymentStatus: { in: PAID_STATUSES },
        createdAt: { gte: new Date((/* @__PURE__ */ new Date()).getFullYear(), (/* @__PURE__ */ new Date()).getMonth(), 1) }
      }
    })
  ]);
  const [statusBreakdown, methodBreakdown, gatewayBreakdown] = await Promise.all([
    prisma.order.groupBy({
      by: ["paymentStatus"],
      _count: { id: true },
      _sum: { grandTotal: true },
      orderBy: { _count: { id: "desc" } }
    }),
    prisma.order.groupBy({
      by: ["paymentMethod"],
      _count: { id: true },
      _sum: { grandTotal: true },
      orderBy: { _count: { id: "desc" } }
    }),
    prisma.order.groupBy({
      by: ["gatewayProvider"],
      _count: { id: true },
      _sum: { grandTotal: true },
      orderBy: { _count: { id: "desc" } }
    })
  ]);
  const weekStart = /* @__PURE__ */ new Date();
  weekStart.setDate(weekStart.getDate() - 6);
  weekStart.setHours(0, 0, 0, 0);
  const weeklyOrders = await prisma.order.findMany({
    where: { createdAt: { gte: weekStart }, paymentStatus: { in: PAID_STATUSES } },
    select: { createdAt: true, grandTotal: true }
  });
  const weeklyMap = /* @__PURE__ */ new Map();
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    weeklyMap.set(key, { revenue: 0, count: 0 });
  }
  for (const o of weeklyOrders) {
    const key = o.createdAt.toISOString().slice(0, 10);
    const entry = weeklyMap.get(key);
    if (entry) {
      entry.revenue += Number(o.grandTotal || 0);
      entry.count++;
    }
  }
  const monthlyMap = /* @__PURE__ */ new Map();
  for (let i = 11; i >= 0; i--) {
    const d = /* @__PURE__ */ new Date();
    d.setMonth(d.getMonth() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
    monthlyMap.set(key, { label, revenue: 0, paidCount: 0, refundedCount: 0, pendingCount: 0 });
  }
  const monthStart = /* @__PURE__ */ new Date();
  monthStart.setMonth(monthStart.getMonth() - 11);
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const monthlyOrders = await prisma.order.findMany({
    where: { createdAt: { gte: monthStart } },
    select: { createdAt: true, grandTotal: true, paymentStatus: true }
  });
  for (const o of monthlyOrders) {
    const key = o.createdAt.toISOString().slice(0, 7);
    const entry = monthlyMap.get(key);
    if (entry) {
      const bucket = toStatusBucket(o.paymentStatus);
      if (bucket === "paid") {
        entry.revenue += Number(o.grandTotal || 0);
        entry.paidCount++;
      } else if (bucket === "refunded") entry.refundedCount++;
      else if (bucket === "pending") entry.pendingCount++;
    }
  }
  return {
    summaryData: {
      totalOrders,
      totalRevenue: Number(paidTotal._sum.grandTotal || 0),
      pendingPayments: Number(pendingTotal._sum.grandTotal || 0),
      totalRefunds: Number(refundedTotal._sum.grandTotal || 0),
      cancelledOrders: cancelledTotal,
      thisMonthRevenue: Number(thisMonthRevenue._sum.grandTotal || 0)
    },
    orders,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    statusBreakdown: statusBreakdown.map((s) => ({ label: s.paymentStatus, count: s._count.id, total: Number(s._sum.grandTotal || 0) })),
    paymentMethodBreakdown: methodBreakdown.map((m) => ({ label: m.paymentMethod, count: m._count.id, total: Number(m._sum.grandTotal || 0) })),
    gatewayBreakdown: gatewayBreakdown.map((g) => ({ label: g.gatewayProvider, count: g._count.id, total: Number(g._sum.grandTotal || 0) })),
    weeklySeriesData: Array.from(weeklyMap.entries()).map(([date, v]) => ({ date, ...v })),
    monthlySeriesData: Array.from(monthlyMap.values())
  };
}
async function getOrderDetail(orderNumber) {
  if (!orderNumber) throw createAppError(422, "VALIDATION_ERROR", "Order number is required");
  const order = await prisma.order.findFirst({
    where: {
      OR: [
        { orderNumber },
        { trackingId: orderNumber },
        { paymentReference: orderNumber }
      ]
    },
    include: {
      customer: { select: { id: true, fullName: true, email: true, phone: true } },
      items: true,
      payments: true
    }
  });
  if (!order) throw createAppError(404, "NOT_FOUND", "Order not found");
  const items = await Promise.all(
    order.items.map(async (item) => {
      let productName = item.productName;
      if (item.productId) {
        const product = await prisma.product.findUnique({
          where: { id: item.productId },
          select: { name: true }
        });
        if (product) productName = product.name;
      }
      return { ...item, product_catalog_name: productName };
    })
  );
  return { order, items };
}
async function liveSearch(q) {
  const term = sanitizeText(q);
  if (!term) return { results: [] };
  const results = await prisma.order.findMany({
    where: {
      OR: [
        { orderNumber: { contains: term } },
        { trackingId: { contains: term } },
        { paymentReference: { contains: term } },
        { customerName: { contains: term } },
        { email: { contains: term } },
        { phone: { contains: term } }
      ]
    },
    orderBy: { createdAt: "desc" },
    take: 20
  });
  return { results };
}
async function exportOrders(query) {
  const limit = Math.min(1e3, Math.max(1, Number(query.limit) || 1e3));
  const where = buildOrderWhere(query);
  const orders = await prisma.order.findMany({
    where,
    include: {
      customer: { select: { fullName: true, email: true, phone: true } },
      items: { select: { productName: true, quantity: true, lineTotal: true } }
    },
    orderBy: { createdAt: "desc" },
    take: limit
  });
  return { orders, total: orders.length };
}
async function cancelOrder(orderId) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw createAppError(404, "NOT_FOUND", "Order not found");
  if (CANCELLED_STATUSES.includes(order.paymentStatus || "")) {
    throw createAppError(400, "ALREADY_CANCELLED", "Order is already cancelled");
  }
  const updated = await prisma.order.update({
    where: { id: orderId },
    data: {
      paymentStatus: "cancelled",
      orderStatus: "cancelled"
    }
  });
  return { order: updated, message: "Order cancelled" };
}
function getStatusOptions() {
  return { statuses: STATUS_OPTIONS };
}
export {
  CANCELLED_STATUSES,
  PAID_STATUSES,
  PENDING_STATUSES,
  REFUNDED_STATUSES,
  STATUS_OPTIONS,
  cancelOrder,
  exportOrders,
  getOrderDetail,
  getOrdersData,
  getStatusOptions,
  liveSearch
};
