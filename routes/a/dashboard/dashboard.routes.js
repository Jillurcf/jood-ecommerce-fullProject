"use strict";

const express = require("express");
const router = express.Router();

const { pool } = require("../../../includes/conn");
const adminController = require("../../../controllers/a/sign/sign.controller");
const visitorController = require("../../../controllers/a/dashboard/visitor.controller");
const ordersController = require("../../../controllers/a/orders.controller");
const transactionController = require("../../../controllers/a/account/transaction-history.controller");

/* =========================================================
   HELPERS
========================================================= */

const toInt = (value, fallback = 1) => {
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const clampLimit = (value, fallback = 10) => {
  const n = toInt(value, fallback);
  return Math.min(Math.max(n, 10), 100);
};

const safeNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

async function loadDashboardCounts(client) {
  const [usersRes, productsRes] = await Promise.all([
    client.query("SELECT COUNT(*)::int AS total FROM customer_accounts"),
    client.query("SELECT COUNT(*)::int AS total FROM products"),
  ]);

  return {
    totalUsers: safeNumber(usersRes.rows?.[0]?.total),
    totalItems: safeNumber(productsRes.rows?.[0]?.total),
    totalProducts: safeNumber(productsRes.rows?.[0]?.total),
  };
}

/* =========================================================
   DASHBOARD PAGE (MAIN SSR)
========================================================= */

router.use(adminController.ensureAuth);

async function renderDashboardPage(req, res, next) {
  let client;

  try {
    const page = toInt(req.query.page, 1);
    const limit = clampLimit(req.query.limit, 10);

    client = await pool.connect();

    const [visitorData, ordersData, transactionData, dashboardCounts] = await Promise.all([
      visitorController.loadDashboardVisitors(page, limit),
      ordersController.buildAdminOrdersPageModel(req, client),
      transactionController.buildAdminTransactionPageModel(req, client),
      loadDashboardCounts(client),
    ]);

    const orderSummary = ordersData.summaryData || {};
    const orderRowsRaw = ordersData.orderRows || ordersData.orders || [];
    const latestOrderRows = [...orderRowsRaw].sort((a, b) => {
      return new Date(b.created_at) - new Date(a.created_at);
    }).slice(0, 10);
    const combinedStats = {
      ...(visitorData.stats || {}),
      ...dashboardCounts,
      totalOrders: safeNumber(orderSummary.totalCount),
      orders: safeNumber(orderSummary.totalCount),
      totalIncome: safeNumber(orderSummary.totalAmount),
      income: safeNumber(orderSummary.totalAmount),
    };
    

    return res.render("admin/a/account/dashboard", {
      title: "Admin Dashboard",

      admin: res.locals.admin || req.session?.admin || null,
      user: res.locals.user || req.user || null,

      /* =====================================================
         VISITORS
      ===================================================== */
      stats: combinedStats,
      visitors: visitorData.visitors || [],
      visitorPagination: visitorData.pagination || {},

      /* =====================================================
         ORDERS
      ===================================================== */
      ...ordersData,
      orderSummaryData: ordersData.summaryData || {},
      orderRows: latestOrderRows,
      orderPagination: ordersData.pagination || {},

      /* =====================================================
         TRANSACTIONS
      ===================================================== */
      transactionSummaryData: transactionData.summaryData || {},
      transactionRows: transactionData.transactionRows || transactionData.transactions || [],
      transactionPagination: transactionData.pagination || {},
      recentTransactionsData: transactionData.recentTransactionsData || [],
      weeklyTransactionsData: transactionData.weeklyTransactionsData || [],
      weeklySeriesData: transactionData.weeklySeriesData || [],
      monthlySeriesData: transactionData.monthlySeriesData || [],
      transactionStatusBreakdown: transactionData.statusBreakdown || [],
      transactionPaymentMethodBreakdown: transactionData.paymentMethodBreakdown || [],
      transactionGatewayBreakdown: transactionData.gatewayBreakdown || [],
      transactionOrderSearchResult: transactionData.orderSearchResult || null,
      transactionProductSearchResult: transactionData.productSearchResult || null,
      transactionFilters: transactionData.filters || {},
      transactionQueryOrderNumber: transactionData.queryOrderNumber || "",
      transactionQueryProductQuery: transactionData.queryProductQuery || "",

      /* =====================================================
         GLOBAL
      ===================================================== */
      currentRoute: "/admin/a/dashboard",
      query: req.query,
      pageLimitOptions: [10, 20, 50, 100],
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("renderDashboardPage error:", error);
    return next(error);
  } finally {
    if (client) client.release();
  }
}

/* =========================================================
   ROUTES
========================================================= */

router.get("/", renderDashboardPage);

/* Visitors */
router.get("/api/visitors", visitorController.getVisitors);
router.get("/api/visitors/chart", visitorController.getVisitorChart);
router.get("/visitors/:visitorKey/visits", visitorController.getVisitorDetails);

/* Orders */
router.get("/orders", ordersController.getAdminOrdersPage);
router.get("/orders/data", ordersController.getAdminOrdersData);
router.get("/orders/summary", ordersController.getAdminOrdersSummary);
router.get("/orders/live-search", ordersController.getAdminOrdersLiveSearch);
router.get("/orders/export", ordersController.exportAdminOrders);
router.get("/orders/:orderNumber", ordersController.getAdminOrderDetails);
router.post("/orders/:id/cancel", ordersController.cancelOrder);
router.get("/orders-status-options", ordersController.getOrderStatusOptions);

/* Transaction history */
router.get("/transaction-history", transactionController.getAdminTransactionHistoryPage);
router.get("/transaction-history/data", transactionController.getAdminTransactionHistoryData);
router.get("/transaction-history/summary", transactionController.getAdminTransactionHistorySummary);
router.get("/transaction-history/chart", transactionController.getAdminTransactionHistoryChartData);
router.get("/transaction-history/:orderNumber", transactionController.getAdminTransactionDetails);
router.get("/transaction-history/export", transactionController.exportAdminTransactionHistory);

/* =========================================================
   404 HANDLER
========================================================= */

router.use((req, res) => {
  return res.status(404).json({
    success: false,
    message: "Dashboard route not found",
    path: req.originalUrl,
  });
});

module.exports = router;
