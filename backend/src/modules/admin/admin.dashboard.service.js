import { prisma } from "../../lib/prisma.js";
import { createAppError } from "../../common/errors.js";
import { sanitizeText } from "../auth/auth.config.js";
const PAID_STATUSES = ["paid", "completed", "captured"];
const PENDING_STATUSES = ["pending", "initiated", "pending_payment"];
const REFUNDED_STATUSES = ["refunded", "refund", "partially_refunded"];
const CANCELLED_STATUSES = ["cancelled", "canceled"];
async function getDashboard() {
  const [
    totalUsers,
    totalProducts,
    totalOrders,
    revenueAgg,
    latestOrders,
    totalVisitors
  ] = await Promise.all([
    prisma.customerAccount.count(),
    prisma.product.count(),
    prisma.order.count(),
    prisma.order.aggregate({
      _sum: { grandTotal: true },
      where: { paymentStatus: { in: PAID_STATUSES } }
    }),
    prisma.order.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      include: {
        customer: { select: { fullName: true, email: true } },
        items: { select: { productName: true, quantity: true } }
      }
    }),
    prisma.visitor.aggregate({ _sum: { visitCount: true }, _count: { id: true } })
  ]);
  const thisMonthStart = /* @__PURE__ */ new Date();
  thisMonthStart.setDate(1);
  thisMonthStart.setHours(0, 0, 0, 0);
  const thisMonthRevenue = await prisma.order.aggregate({
    _sum: { grandTotal: true },
    where: {
      paymentStatus: { in: PAID_STATUSES },
      createdAt: { gte: thisMonthStart }
    }
  });
  return {
    totalUsers,
    totalProducts,
    totalOrders,
    totalRevenue: Number(revenueAgg._sum.grandTotal || 0),
    thisMonthRevenue: Number(thisMonthRevenue._sum.grandTotal || 0),
    totalVisitors: totalVisitors._count.id,
    totalPageVisits: Number(totalVisitors._sum.visitCount || 0),
    latestOrders
  };
}
async function getBilling(query) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(5, Number(query.limit) || 20));
  const offset = (page - 1) * limit;
  const q = sanitizeText(query.q || "");
  const orderWhere = {};
  if (q) {
    orderWhere.OR = [
      { customerName: { contains: q } },
      { email: { contains: q } },
      { phone: { contains: q } },
      { orderNumber: { contains: q } }
    ];
  }
  if (query.payment_status) orderWhere.paymentStatus = sanitizeText(query.payment_status);
  if (query.payment_method) orderWhere.paymentMethod = sanitizeText(query.payment_method);
  if (query.order_status) orderWhere.orderStatus = sanitizeText(query.order_status);
  if (query.date_from) {
    const d = new Date(query.date_from);
    if (!Number.isNaN(d.getTime())) orderWhere.createdAt = { ...orderWhere.createdAt, gte: d };
  }
  if (query.date_to) {
    const d = new Date(query.date_to);
    if (!Number.isNaN(d.getTime())) orderWhere.createdAt = { ...orderWhere.createdAt, lte: d };
  }
  if (query.min_total !== void 0) {
    orderWhere.grandTotal = { ...orderWhere.grandTotal, gte: query.min_total };
  }
  if (query.max_total !== void 0) {
    orderWhere.grandTotal = { ...orderWhere.grandTotal, lte: query.max_total };
  }
  const [
    totalUsers,
    usersWithOrders,
    paidUsers,
    totalRevenueAgg,
    totalRefundsAgg,
    pendingPaymentsAgg,
    totalOrders,
    totalAddresses,
    thisMonthRevenueAgg
  ] = await Promise.all([
    prisma.customerAccount.count(),
    prisma.customerAccount.count({ where: { orders: { some: {} } } }),
    prisma.customerAccount.count({ where: { orders: { some: { paymentStatus: { in: PAID_STATUSES } } } } }),
    prisma.order.aggregate({ _sum: { grandTotal: true }, where: { paymentStatus: { in: PAID_STATUSES } } }),
    prisma.order.aggregate({ _sum: { grandTotal: true }, where: { paymentStatus: { in: REFUNDED_STATUSES } } }),
    prisma.order.aggregate({ _sum: { grandTotal: true }, where: { paymentStatus: { in: PENDING_STATUSES } } }),
    prisma.order.count(),
    prisma.userAddress.count(),
    prisma.order.aggregate({
      _sum: { grandTotal: true },
      where: {
        paymentStatus: { in: PAID_STATUSES },
        createdAt: { gte: new Date((/* @__PURE__ */ new Date()).getFullYear(), (/* @__PURE__ */ new Date()).getMonth(), 1) }
      }
    })
  ]);
  const users = await prisma.customerAccount.findMany({
    where: q ? {
      OR: [
        { fullName: { contains: q } },
        { email: { contains: q } }
      ]
    } : {},
    include: {
      orders: {
        select: {
          grandTotal: true,
          paymentStatus: true,
          createdAt: true,
          orderNumber: true
        },
        orderBy: { createdAt: "desc" }
      },
      addresses: { select: { id: true } }
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    skip: offset
  });
  const totalUserCount = q ? await prisma.customerAccount.count({
    where: {
      OR: [
        { fullName: { contains: q } },
        { email: { contains: q } }
      ]
    }
  }) : await prisma.customerAccount.count();
  const enrichedUsers = users.map((u) => {
    const paidOrders = u.orders.filter((o) => PAID_STATUSES.includes(o.paymentStatus || ""));
    const pendingOrders = u.orders.filter((o) => PENDING_STATUSES.includes(o.paymentStatus || ""));
    const refundedOrders = u.orders.filter((o) => REFUNDED_STATUSES.includes(o.paymentStatus || ""));
    const totalSpent = paidOrders.reduce((sum, o) => sum + Number(o.grandTotal || 0), 0);
    const pendingPayments = pendingOrders.reduce((sum, o) => sum + Number(o.grandTotal || 0), 0);
    const refundTotal = refundedOrders.reduce((sum, o) => sum + Number(o.grandTotal || 0), 0);
    const now = /* @__PURE__ */ new Date();
    const thisMonth = paidOrders.filter((o) => o.createdAt.getMonth() === now.getMonth() && o.createdAt.getFullYear() === now.getFullYear());
    const thisMonthSpent = thisMonth.reduce((sum, o) => sum + Number(o.grandTotal || 0), 0);
    const lastPaid = paidOrders[0]?.createdAt || null;
    const firstOrder = u.orders.length ? u.orders[u.orders.length - 1].createdAt : null;
    return {
      id: u.id,
      full_name: u.fullName,
      email: u.email,
      phone: u.phone,
      total_spent: totalSpent,
      total_orders_paid: paidOrders.length,
      pending_payments: pendingPayments,
      refund_total: refundTotal,
      this_month_spent: thisMonthSpent,
      last_paid_at: lastPaid,
      first_order_at: firstOrder,
      total_orders: u.orders.length,
      total_addresses: u.addresses.length,
      last_order: u.orders[0] || null,
      created_at: u.createdAt
    };
  });
  const monthlyData = await getMonthlyRevenueChart();
  return {
    totalUsers,
    usersWithOrders,
    paidUsers,
    totalRevenue: Number(totalRevenueAgg._sum.grandTotal || 0),
    totalRefunds: Number(totalRefundsAgg._sum.grandTotal || 0),
    pendingPayments: Number(pendingPaymentsAgg._sum.grandTotal || 0),
    totalOrders,
    totalAddresses,
    thisMonthRevenue: Number(thisMonthRevenueAgg._sum.grandTotal || 0),
    users: enrichedUsers,
    monthlyRevenue: monthlyData,
    pagination: { page, limit, total: totalUserCount, totalPages: Math.ceil(totalUserCount / limit) }
  };
}
async function getMonthlyRevenueChart() {
  const monthlyMap = /* @__PURE__ */ new Map();
  for (let i = 11; i >= 0; i--) {
    const d = /* @__PURE__ */ new Date();
    d.setMonth(d.getMonth() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
    monthlyMap.set(key, { label, revenue: 0, orders: 0 });
  }
  const monthStart = /* @__PURE__ */ new Date();
  monthStart.setMonth(monthStart.getMonth() - 11);
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const orders = await prisma.order.findMany({
    where: { createdAt: { gte: monthStart }, paymentStatus: { in: PAID_STATUSES } },
    select: { createdAt: true, grandTotal: true }
  });
  for (const o of orders) {
    const key = o.createdAt.toISOString().slice(0, 7);
    const entry = monthlyMap.get(key);
    if (entry) {
      entry.revenue += Number(o.grandTotal || 0);
      entry.orders++;
    }
  }
  return Array.from(monthlyMap.values());
}
async function getBillingChart() {
  const data = await getMonthlyRevenueChart();
  return { chart: data };
}
async function getBillingDetail(userId) {
  const user = await prisma.customerAccount.findUnique({
    where: { id: userId },
    include: {
      orders: {
        orderBy: { createdAt: "desc" },
        include: { items: true }
      },
      addresses: true
    }
  });
  if (!user) throw createAppError(404, "NOT_FOUND", "User not found");
  const paidOrders = user.orders.filter((o) => PAID_STATUSES.includes(o.paymentStatus || ""));
  const totalSpent = paidOrders.reduce((sum, o) => sum + Number(o.grandTotal || 0), 0);
  return {
    user: {
      id: user.id,
      full_name: user.fullName,
      email: user.email,
      phone: user.phone,
      created_at: user.createdAt
    },
    total_spent: totalSpent,
    total_orders: user.orders.length,
    orders: user.orders,
    addresses: user.addresses
  };
}
async function getTransactions(query) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(5, Number(query.limit) || 25));
  const offset = (page - 1) * limit;
  const q = sanitizeText(query.q || "");
  const where = {};
  if (q) {
    where.OR = [
      { orderNumber: { contains: q } },
      { trackingId: { contains: q } },
      { paymentReference: { contains: q } },
      { customerName: { contains: q } },
      { email: { contains: q } }
    ];
  }
  if (query.status) {
    const bucket = sanitizeText(query.status);
    switch (bucket) {
      case "paid":
        where.paymentStatus = { in: PAID_STATUSES };
        break;
      case "pending":
        where.paymentStatus = { in: PENDING_STATUSES };
        break;
      case "refunded":
        where.paymentStatus = { in: REFUNDED_STATUSES };
        break;
      case "cancelled":
        where.paymentStatus = { in: CANCELLED_STATUSES };
        break;
    }
  }
  if (query.from) {
    const d = new Date(query.from);
    if (!Number.isNaN(d.getTime())) where.createdAt = { ...where.createdAt, gte: d };
  }
  if (query.to) {
    const d = new Date(query.to);
    if (!Number.isNaN(d.getTime())) where.createdAt = { ...where.createdAt, lte: d };
  }
  const sortField = (query.sort || "created_at") === "created_at" ? "createdAt" : "createdAt";
  const sortDir = (query.dir || "desc") === "asc" ? "asc" : "desc";
  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: {
        customer: { select: { id: true, fullName: true, email: true, phone: true } },
        items: { select: { id: true, productName: true, quantity: true, lineTotal: true, productId: true, variantId: true } }
      },
      orderBy: { [sortField]: sortDir },
      take: limit,
      skip: offset
    }),
    prisma.order.count({ where })
  ]);
  return {
    transactions: orders,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
  };
}
async function getTransactionSummary() {
  const [totalRevenue, paidCount, pendingCount, refundedCount, cancelledCount] = await Promise.all([
    prisma.order.aggregate({ _sum: { grandTotal: true }, where: { paymentStatus: { in: PAID_STATUSES } } }),
    prisma.order.count({ where: { paymentStatus: { in: PAID_STATUSES } } }),
    prisma.order.count({ where: { paymentStatus: { in: PENDING_STATUSES } } }),
    prisma.order.count({ where: { paymentStatus: { in: REFUNDED_STATUSES } } }),
    prisma.order.count({ where: { paymentStatus: { in: CANCELLED_STATUSES } } })
  ]);
  return {
    totalRevenue: Number(totalRevenue._sum.grandTotal || 0),
    paidCount,
    pendingCount,
    refundedCount,
    cancelledCount
  };
}
async function getTransactionItem(itemType, itemId) {
  if (itemType === "order") {
    const order = await prisma.order.findUnique({
      where: { id: itemId },
      include: {
        customer: { select: { fullName: true, email: true, phone: true } },
        items: true,
        payments: true
      }
    });
    if (!order) throw createAppError(404, "NOT_FOUND", "Order not found");
    return { item_type: "order", order };
  }
  if (itemType === "payment") {
    const payment = await prisma.orderPayment.findUnique({
      where: { id: itemId },
      include: { order: true }
    });
    if (!payment) throw createAppError(404, "NOT_FOUND", "Payment not found");
    return { item_type: "payment", payment };
  }
  throw createAppError(422, "VALIDATION_ERROR", "Invalid item type");
}
async function getTransactionChart() {
  const data = await getMonthlyRevenueChart();
  return { chart: data };
}
async function exportTransactions(query) {
  const limit = 1e3;
  const where = {};
  if (query.status) {
    const bucket = sanitizeText(query.status);
    switch (bucket) {
      case "paid":
        where.paymentStatus = { in: PAID_STATUSES };
        break;
      case "pending":
        where.paymentStatus = { in: PENDING_STATUSES };
        break;
      case "refunded":
        where.paymentStatus = { in: REFUNDED_STATUSES };
        break;
      case "cancelled":
        where.paymentStatus = { in: CANCELLED_STATUSES };
        break;
    }
  }
  if (query.from) {
    const d = new Date(query.from);
    if (!Number.isNaN(d.getTime())) where.createdAt = { ...where.createdAt, gte: d };
  }
  if (query.to) {
    const d = new Date(query.to);
    if (!Number.isNaN(d.getTime())) where.createdAt = { ...where.createdAt, lte: d };
  }
  const orders = await prisma.order.findMany({
    where,
    include: {
      customer: { select: { fullName: true, email: true } },
      items: { select: { productName: true, quantity: true, lineTotal: true } }
    },
    orderBy: { createdAt: "desc" },
    take: limit
  });
  return { transactions: orders, total: orders.length, format: query.format || "json" };
}
async function productSearch(q) {
  const term = sanitizeText(q);
  if (!term) return { products: [] };
  const results = await prisma.$queryRaw`
    SELECT
      oi.product_id AS product_id,
      p.name AS product_name,
      COUNT(*) AS transaction_count,
      SUM(oi.line_total) AS amount,
      MAX(o.created_at) AS last_order_at
    FROM order_items oi
    JOIN products p ON p.id = oi.product_id
    JOIN orders o ON o.id = oi.order_id
    WHERE LOWER(p.name) LIKE ${`%${term.toLowerCase()}%`}
    GROUP BY oi.product_id, p.name
    ORDER BY transaction_count DESC
    LIMIT 20
  `;
  return {
    products: results.map((r) => ({
      product_id: r.product_id,
      product_name: r.product_name,
      transaction_count: Number(r.transaction_count),
      amount: Number(r.amount),
      currency: "AED",
      last_order_at: r.last_order_at
    }))
  };
}
async function getVisitors(query) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(10, Number(query.limit) || 10));
  const offset = (page - 1) * limit;
  const [visitors, total, stats] = await Promise.all([
    prisma.visitor.findMany({
      orderBy: { lastVisit: { sort: "desc", nulls: "last" } },
      take: limit,
      skip: offset
    }),
    prisma.visitor.count(),
    prisma.visitor.aggregate({
      _sum: { visitCount: true },
      _count: { id: true }
    })
  ]);
  const enriched = await Promise.all(
    visitors.map(async (v) => {
      const pageStats = await prisma.pageVisit.aggregate({
        where: { visitorKey: v.visitorKey },
        _count: { id: true },
        _min: { visitedAt: true },
        _max: { visitedAt: true }
      });
      const lastVisit = await prisma.pageVisit.findFirst({
        where: { visitorKey: v.visitorKey },
        orderBy: { visitedAt: "desc" },
        select: { url: true, userAgent: true, visitedAt: true, method: true, ipAddress: true }
      });
      return {
        ...v,
        page_visit_count: pageStats._count.id,
        first_page_visit: pageStats._min.visitedAt,
        last_page_visit: pageStats._max.visitedAt,
        last_page_url: lastVisit?.url || null,
        user_agent: lastVisit?.userAgent?.slice(0, 500) || null
      };
    })
  );
  return {
    visitors: enriched,
    stats: {
      totalVisitors: stats._count.id,
      totalPageVisits: Number(stats._sum.visitCount || 0)
    },
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
  };
}
async function getVisitorChart(range) {
  const validRange = ["hour", "day", "week", "month", "year"].includes(range) ? range : "day";
  const now = /* @__PURE__ */ new Date();
  let startDate;
  let groupBy;
  switch (validRange) {
    case "hour":
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1e3);
      groupBy = "hour";
      break;
    case "day":
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1e3);
      groupBy = "day";
      break;
    case "week":
      startDate = new Date(now.getTime() - 12 * 7 * 24 * 60 * 60 * 1e3);
      groupBy = "week";
      break;
    case "month":
      startDate = new Date(now.getTime() - 12 * 30 * 24 * 60 * 60 * 1e3);
      groupBy = "month";
      break;
    case "year":
      startDate = new Date(now.getTime() - 5 * 365 * 24 * 60 * 60 * 1e3);
      groupBy = "year";
      break;
    default:
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1e3);
      groupBy = "day";
  }
  const visits = await prisma.pageVisit.findMany({
    where: { visitedAt: { gte: startDate } },
    select: { visitedAt: true },
    orderBy: { visitedAt: "asc" }
  });
  const buckets = /* @__PURE__ */ new Map();
  for (const v of visits) {
    let key;
    const d = v.visitedAt;
    switch (groupBy) {
      case "hour":
        key = d.toISOString().slice(0, 13);
        break;
      case "day":
        key = d.toISOString().slice(0, 10);
        break;
      case "week": {
        const weekStart = new Date(d);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        key = weekStart.toISOString().slice(0, 10);
        break;
      }
      case "month":
        key = d.toISOString().slice(0, 7);
        break;
      case "year":
        key = d.toISOString().slice(0, 4);
        break;
      default:
        key = d.toISOString().slice(0, 10);
    }
    buckets.set(key, (buckets.get(key) || 0) + 1);
  }
  const chart = Array.from(buckets.entries()).map(([label, count]) => ({ label, count }));
  return { chart, range: validRange, groupBy };
}
async function getVisitorDetail(visitorKey, query) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(10, Number(query.limit) || 20));
  const offset = (page - 1) * limit;
  const visitor = await prisma.visitor.findUnique({ where: { visitorKey } });
  if (!visitor) throw createAppError(404, "NOT_FOUND", "Visitor not found");
  const [stats, lastVisit, visits, totalVisits] = await Promise.all([
    prisma.pageVisit.aggregate({
      where: { visitorKey },
      _count: { id: true },
      _min: { visitedAt: true },
      _max: { visitedAt: true }
    }),
    prisma.pageVisit.findFirst({
      where: { visitorKey },
      orderBy: { visitedAt: "desc" },
      select: { url: true, userAgent: true, method: true, visitedAt: true, ipAddress: true }
    }),
    prisma.pageVisit.findMany({
      where: { visitorKey },
      orderBy: { visitedAt: "desc" },
      take: limit,
      skip: offset
    }),
    prisma.pageVisit.count({ where: { visitorKey } })
  ]);
  return {
    visitor,
    stats: {
      totalVisits: stats._count.id,
      firstVisit: stats._min.visitedAt,
      lastVisit: stats._max.visitedAt
    },
    lastVisit: lastVisit ? {
      url: lastVisit.url,
      user_agent: lastVisit.userAgent?.slice(0, 500) || null,
      method: lastVisit.method,
      visited_at: lastVisit.visitedAt,
      ip_address: lastVisit.ipAddress
    } : null,
    visits,
    pagination: { page, limit, total: totalVisits, totalPages: Math.ceil(totalVisits / limit) }
  };
}
async function getBillingPdfData(userId) {
  if (userId) {
    return getBillingDetail(userId);
  }
  const billing = await getBilling({ limit: 500 });
  return billing;
}
export {
  exportTransactions,
  getBilling,
  getBillingChart,
  getBillingDetail,
  getBillingPdfData,
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
