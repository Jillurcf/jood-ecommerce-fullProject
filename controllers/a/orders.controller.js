"use strict";

const fs = require("fs");
const path = require("path");
const { pool } = require("../../includes/conn");

/**
 * =========================================================
 * ADMIN ORDERS CONTROLLER
 * =========================================================
 * Full admin access to orders with:
 * - SSR list page
 * - order detail page
 * - JSON data endpoints
 * - live search
 * - summary / breakdowns / chart data
 * - export-ready payload
 *
 * Uses only the columns that exist in the checkout flow:
 * orders:
 *  id, user_id, guest_token, order_number, tracking_id, payment_reference,
 *  customer_name, email, phone, currency, subtotal_amount, discount_amount,
 *  vat_amount, grand_total, payment_method, payment_status, order_status,
 *  gateway_provider, billing_address, shipping_address, notes, created_at,
 *  updated_at
 *
 * order_items:
 *  id, order_id, cart_id, product_id, variant_id, product_name, variant_name,
 *  sku, quantity, unit_price, discount_amount, vat_amount, line_total,
 *  created_at
 * =========================================================
 */

const ADMIN_LIST_VIEW = "admin/a/orders";
const ADMIN_DETAIL_VIEW = "admin/a/orders/detail";
const ADMIN_FALLBACK = "/admin/a/orders";
const ADMIN_LOGIN_FALLBACK = "/admin/a/sign/in";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const EXPORT_LIMIT = 1000;
const DEFAULT_SORT = "created_at";
const DEFAULT_DIR = "desc";

const PAID_STATUSES = ["paid", "completed", "captured", "successful", "success"];
const PENDING_STATUSES = ["pending", "initiated", "pending_payment", "processing", "ongoing"];
const REFUNDED_STATUSES = ["refunded", "refund", "partially_refunded"];
const CANCELLED_STATUSES = ["cancelled", "canceled"];

const ORDER_COLUMNS = `
  o.id,
  o.user_id,
  o.guest_token,
  o.order_number,
  o.tracking_id,
  o.payment_reference,
  o.customer_name,
  o.email,
  o.phone,
  o.currency,
  o.subtotal_amount,
  o.discount_amount,
  o.vat_amount,
  o.grand_total,
  o.payment_method,
  o.payment_status,
  o.order_status,
  o.gateway_provider,
  o.billing_address,
  o.shipping_address,
  o.notes,
  o.created_at,
  o.updated_at
`;

/* =========================================================
   BASIC HELPERS
========================================================= */

function wantsJson(req) {
  const accept = String(req.headers?.accept || "").toLowerCase();
  return Boolean(
    req.xhr ||
      accept.includes("application/json") ||
      String(req.headers?.["content-type"] || "").includes("application/json")
  );
}

function sanitizeText(v, max = 255) {
  if (v == null) return "";
  return String(v).trim().slice(0, max);
}

function toNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function toInt(v, fallback = 0) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

function clampInt(v, min, max, fallback) {
  const n = toInt(v, fallback);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function safeDateLabel(value) {
  const d = parseDate(value);
  if (!d) return "Not available";
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function safeDateOnlyLabel(value) {
  const d = parseDate(value);
  if (!d) return "Not available";
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatMoney(value, currency = "AED") {
  const amount = Number(value || 0);
  const code = String(currency || "AED").trim() || "AED";
  try {
    return new Intl.NumberFormat("en-AE", {
      style: "currency",
      currency: code,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${code} ${amount.toFixed(2)}`;
  }
}

function normalizeViewName(v) {
  return String(v || "").trim().replace(/^[\\/]+/, "").replace(/\.ejs$/i, "");
}

function resolveViewName(app, candidates = []) {
  const viewsDir = app?.get?.("views");
  const engine = String(app?.get?.("view engine") || "ejs").replace(/^\./, "").trim() || "ejs";

  for (const candidate of candidates) {
    const clean = normalizeViewName(candidate);
    if (!clean) continue;

    const possibleFiles = [
      path.join(viewsDir || "", `${clean}.${engine}`),
      path.join(viewsDir || "", `${clean}.ejs`),
      path.join(viewsDir || "", clean),
    ];

    for (const filePath of possibleFiles) {
      if (filePath && fs.existsSync(filePath)) return clean;
    }
  }

  return normalizeViewName(candidates[0] || ADMIN_LIST_VIEW);
}

function renderSafe(res, candidates, data) {
  const viewName = resolveViewName(res.app, candidates);
  return res.render(viewName, data);
}

function reply(req, res, statusCode, payload, redirectUrl = ADMIN_FALLBACK) {
  if (wantsJson(req)) {
    return res.status(statusCode).json(payload);
  }
  return res.redirect(redirectUrl);
}

/* =========================================================
   ADMIN SESSION HELPERS
========================================================= */

function getSessionAdmin(req) {
  if (req.session?.admin?.id) return req.session.admin;

  if (req.session?.adminId) {
    return {
      id: req.session.adminId,
      admin_id: req.session.adminAdminId || null,
      full_name: req.session.adminName || null,
      email: req.session.adminEmail || null,
      phone: req.session.adminPhone || null,
      role: req.session.adminRole || req.session.role || "admin",
      status: req.session.adminStatus || "active",
      loginAt: req.session.loginAt || null,
      sessionVersion: req.session.sessionVersion || 1,
    };
  }

  if (req.user?.id) {
    return {
      id: req.user.id,
      admin_id: req.user.admin_id || null,
      full_name: req.user.full_name || req.user.name || null,
      email: req.user.email || null,
      phone: req.user.phone || null,
      role: req.user.role || req.user.type || "admin",
      status: req.user.status || "active",
      loginAt: req.user.loginAt || null,
      sessionVersion: req.user.sessionVersion || 1,
    };
  }

  return null;
}

function isAdminUser(req) {
  const admin = getSessionAdmin(req);
  if (!admin?.id) return false;

  const role = String(
    admin.role ||
      req.session?.adminRole ||
      req.session?.role ||
      req.user?.role ||
      req.user?.type ||
      ""
  ).toLowerCase();

  return Boolean(
    req.session?.isAdmin === true ||
      req.user?.isAdmin === true ||
      role === "admin" ||
      role === "superadmin" ||
      role === "super_admin" ||
      role === "master_admin" ||
      role === "staff" ||
      role === "sub_admin"
  );
}

function requireAdmin(req) {
  if (isAdminUser(req)) return { error: false };
  return {
    error: true,
    statusCode: 401,
    error_code: "UNAUTHORIZED",
    message: "Admin access required.",
    redirectUrl: ADMIN_LOGIN_FALLBACK,
  };
}

/* =========================================================
   FILTERS / SQL BUILDERS
========================================================= */

function buildEmptySummary() {
  return {
    totalCount: 0,
    totalAmount: 0,
    paidCount: 0,
    pendingCount: 0,
    refundedCount: 0,
    cancelledCount: 0,
    thisMonthSpent: 0,
    uniqueCustomers: 0,
    currency: "AED",
    lastOrder: null,
  };
}

function normalizeFilters(req) {
  return {
    page: clampInt(req.query?.page, 1, 1000000, 1),
    limit: clampInt(req.query?.limit, 1, MAX_LIMIT, DEFAULT_LIMIT),
    sort: sanitizeText(req.query?.sort, 40).toLowerCase() || DEFAULT_SORT,
    dir: sanitizeText(req.query?.dir, 5).toLowerCase() === "asc" ? "asc" : DEFAULT_DIR,
    status: sanitizeText(req.query?.status, 40).toLowerCase(),
    payment_method: sanitizeText(req.query?.payment_method || req.query?.paymentMethod, 40).toLowerCase(),
    gateway_provider: sanitizeText(req.query?.gateway_provider || req.query?.gatewayProvider, 60).toLowerCase(),
    order_status: sanitizeText(req.query?.order_status || req.query?.orderStatus, 40).toLowerCase(),
    from: sanitizeText(req.query?.from || req.query?.date_from, 40),
    to: sanitizeText(req.query?.to || req.query?.date_to, 40),
    q: sanitizeText(req.query?.q, 120),
    order_number: sanitizeText(req.query?.order_number || req.query?.orderNumber, 80),
    tracking_id: sanitizeText(req.query?.tracking_id || req.query?.trackingId, 80),
    payment_reference: sanitizeText(req.query?.payment_reference || req.query?.paymentReference, 80),
    customer: sanitizeText(req.query?.customer, 120),
    email: sanitizeText(req.query?.email, 120),
    phone: sanitizeText(req.query?.phone, 40),
    type: sanitizeText(req.query?.type, 20).toLowerCase(),
    section: sanitizeText(req.query?.section, 30).toLowerCase() || "all",
  };
}

function buildSort(query = {}) {
  const sort = sanitizeText(query.sort, 40).toLowerCase() || DEFAULT_SORT;
  const dir = sanitizeText(query.dir, 5).toLowerCase() === "asc" ? "ASC" : "DESC";

  const allowed = {
    id: `o.id ${dir}`,
    created_at: `o.created_at ${dir} NULLS LAST, o.id ${dir}`,
    updated_at: `o.updated_at ${dir} NULLS LAST, o.id ${dir}`,
    total: `o.grand_total ${dir} NULLS LAST, o.id ${dir}`,
    status: `o.payment_status ${dir} NULLS LAST, o.id ${dir}`,
    order_status: `o.order_status ${dir} NULLS LAST, o.id ${dir}`,
    customer_name: `COALESCE(o.customer_name, '') ${dir} NULLS LAST, o.id ${dir}`,
    payment_method: `o.payment_method ${dir} NULLS LAST, o.id ${dir}`,
    tracking_id: `o.tracking_id ${dir} NULLS LAST, o.id ${dir}`,
    payment_reference: `o.payment_reference ${dir} NULLS LAST, o.id ${dir}`,
  };

  return allowed[sort] || `o.created_at DESC, o.id DESC`;
}

function buildDateClause(fieldExpr, value, operator, params, clauses) {
  if (!value) return;
  const d = parseDate(value);
  if (!d) return;
  params.push(d.toISOString());
  clauses.push(`${fieldExpr} ${operator} $${params.length}::timestamptz`);
}

function pushArrayClause(fieldExpr, values, params, clauses) {
  if (!Array.isArray(values) || !values.length) return;
  params.push(values);
  clauses.push(`COALESCE(LOWER(${fieldExpr}), '') = ANY($${params.length}::text[])`);
}

function buildOrderWhere(filters = {}, alias = "o") {
  const params = [];
  const clauses = [];
  const add = (value) => {
    params.push(value);
    return `$${params.length}`;
  };

  buildDateClause(`${alias}.created_at`, filters.from, ">=", params, clauses);
  buildDateClause(`${alias}.created_at`, filters.to, "<=", params, clauses);

  if (filters.status) clauses.push(`COALESCE(LOWER(${alias}.payment_status), '') = ${add(filters.status)}`);
  if (filters.payment_method) clauses.push(`COALESCE(LOWER(${alias}.payment_method), '') = ${add(filters.payment_method)}`);
  if (filters.gateway_provider) clauses.push(`COALESCE(LOWER(${alias}.gateway_provider), '') = ${add(filters.gateway_provider)}`);
  if (filters.order_status) clauses.push(`COALESCE(LOWER(${alias}.order_status), '') = ${add(filters.order_status)}`);

  if (filters.customer) {
    const like = add(`%${filters.customer.toLowerCase()}%`);
    clauses.push(`(
      LOWER(COALESCE(${alias}.customer_name, '')) LIKE ${like}
      OR LOWER(COALESCE(${alias}.email, '')) LIKE ${like}
      OR LOWER(COALESCE(${alias}.phone, '')) LIKE ${like}
    )`);
  }

  if (filters.email) {
    const p = add(filters.email.toLowerCase());
    clauses.push(`LOWER(COALESCE(${alias}.email, '')) = ${p}`);
  }

  if (filters.phone) {
    const p = add(filters.phone.toLowerCase());
    clauses.push(`LOWER(COALESCE(${alias}.phone, '')) LIKE ${p}`);
  }

  if (filters.order_number) {
    const p = add(filters.order_number.toLowerCase());
    clauses.push(`LOWER(COALESCE(${alias}.order_number, '')) = ${p}`);
  }

  if (filters.tracking_id) {
    const p = add(filters.tracking_id.toLowerCase());
    clauses.push(`LOWER(COALESCE(${alias}.tracking_id, '')) = ${p}`);
  }

  if (filters.payment_reference) {
    const p = add(filters.payment_reference.toLowerCase());
    clauses.push(`LOWER(COALESCE(${alias}.payment_reference, '')) = ${p}`);
  }

  if (filters.q) {
    const like = add(`%${filters.q.toLowerCase()}%`);
    clauses.push(`(
      LOWER(COALESCE(${alias}.order_number, '')) LIKE ${like}
      OR LOWER(COALESCE(${alias}.tracking_id, '')) LIKE ${like}
      OR LOWER(COALESCE(${alias}.payment_reference, '')) LIKE ${like}
      OR LOWER(COALESCE(${alias}.customer_name, '')) LIKE ${like}
      OR LOWER(COALESCE(${alias}.email, '')) LIKE ${like}
      OR LOWER(COALESCE(${alias}.phone, '')) LIKE ${like}
      OR LOWER(COALESCE(${alias}.payment_method, '')) LIKE ${like}
      OR LOWER(COALESCE(${alias}.gateway_provider, '')) LIKE ${like}
      OR LOWER(COALESCE(${alias}.order_status, '')) LIKE ${like}
      OR LOWER(COALESCE(${alias}.payment_status, '')) LIKE ${like}
    )`);
  }

  if (filters.type === "weekly") clauses.push(`${alias}.created_at >= NOW() - INTERVAL '7 days'`);
  if (filters.type === "today") clauses.push(`${alias}.created_at >= date_trunc('day', NOW())`);
  if (filters.type === "month") clauses.push(`${alias}.created_at >= date_trunc('month', NOW())`);

  if (filters.section === "paid") pushArrayClause(`${alias}.payment_status`, PAID_STATUSES, params, clauses);
  if (filters.section === "pending") pushArrayClause(`${alias}.payment_status`, PENDING_STATUSES, params, clauses);
  if (filters.section === "refunded") pushArrayClause(`${alias}.payment_status`, REFUNDED_STATUSES, params, clauses);
  if (filters.section === "cancelled") pushArrayClause(`${alias}.payment_status`, CANCELLED_STATUSES, params, clauses);

  return {
    whereSql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
    params,
  };
}

/* =========================================================
   MAPPERS
========================================================= */
function formatAddress(addr) {
  if (!addr || typeof addr !== 'object') return null;

  return [
    addr.address_line1,
    addr.landmark,
    addr.city,
    addr.emirate,
    addr.country,
    addr.postal_code
  ].filter(Boolean).join(', ') || null;
}

function mapOrderRow(row) {
  const subtotalAmount = Number(row.subtotal_amount || 0);
  const discount = Number(row.discount_amount || 0);
  const vat = Number(row.vat_amount || 0);
  const amount = Number(row.grand_total || 0);
  const currency = row.currency || "AED";

  return {
    id: row.id,
    user_id: row.user_id ?? null,
    guest_token: row.guest_token ?? null,
    order_number: row.order_number || null,
    tracking_id: row.tracking_id || null,
    payment_reference: row.payment_reference || null,
    title: row.order_number || row.tracking_id || "Order",
    customer_name: row.customer_name || null,
    email: row.email || null,
    phone: row.phone || null,
    subtotal_amount: subtotalAmount,
    discount_amount: discount,
    vat_amount: vat,
    amount,
    grand_total: amount,
    currency,
    payment_method: row.payment_method || null,
    payment_status: row.payment_status || null,
    order_status: row.order_status || null,
    gateway_provider: row.gateway_provider || null,
    billing_address: row.billing_address || null,
    shipping_address: row.shipping_address || null,
    billing_address_text: formatAddress(row.billing_address),
    shipping_address_text: formatAddress(row.shipping_address),
    notes: row.notes || null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
    created_at_label: safeDateLabel(row.created_at),
    updated_at_label: safeDateLabel(row.updated_at),
    created_date_label: safeDateOnlyLabel(row.created_at),
    detail_url: row.order_number
      ? `/admin/a/orders/${encodeURIComponent(row.order_number)}`
      : row.tracking_id
        ? `/admin/a/orders/${encodeURIComponent(row.tracking_id)}`
        : row.payment_reference
          ? `/admin/a/orders/${encodeURIComponent(row.payment_reference)}`
          : null,
    transaction_type: "order",
  };
}

function mapItemRow(row) {
  return {
    id: row.id,
    order_id: row.order_id,
    cart_id: row.cart_id,
    product_id: row.product_id,
    variant_id: row.variant_id,
    product_name: row.product_name || row.product_catalog_name || null,
    variant_name: row.variant_name || null,
    sku: row.sku || null,
    quantity: toNum(row.quantity, 0),
    unit_price: Number(row.unit_price || 0),
    discount_amount: Number(row.discount_amount || 0),
    vat_amount: Number(row.vat_amount || 0),
    line_total: Number(row.line_total || 0),
    created_at: row.created_at || null,
    created_at_label: safeDateLabel(row.created_at),
  };
}

function buildPagination(total, page, limit) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return {
    page,
    limit,
    total,
    totalPages,
    hasPrev: page > 1,
    hasNext: page < totalPages,
    prevPage: page > 1 ? page - 1 : null,
    nextPage: page < totalPages ? page + 1 : null,
  };
}

function buildBaseViewData(req, data = {}) {
  return {
    admin: getSessionAdmin(req) || req.user || req.session?.user || null,
    csrfToken: req.csrfToken ? req.csrfToken() : "",

    summaryData: buildEmptySummary(),
    orderRows: [],
    orders: [],
    recentOrders: [],
    liveSearchResults: [],
    orderSearchResult: null,
    quickOrderResult: null,

    filters: {
      page: 1,
      limit: DEFAULT_LIMIT,
      sort: DEFAULT_SORT,
      dir: DEFAULT_DIR,
      status: "",
      payment_method: "",
      gateway_provider: "",
      order_status: "",
      from: "",
      to: "",
      q: "",
      order_number: "",
      tracking_id: "",
      payment_reference: "",
      customer: "",
      email: "",
      phone: "",
      type: "all",
      section: "all",
    },

    pagination: {
      page: 1,
      limit: DEFAULT_LIMIT,
      total: 0,
      totalPages: 0,
      hasPrev: false,
      hasNext: false,
      prevPage: null,
      nextPage: null,
    },

    queryOrderNumber: "",
    queryTrackingId: "",
    queryPaymentReference: "",
    successMessage: "",
    errorMessage: "",
    currentRoute: "/admin/a/orders",
    ...data,
  };
}

/* =========================================================
   DATA QUERIES
========================================================= */

async function getAdminOrdersOverview(client, filters = {}) {
  const { whereSql, params } = buildOrderWhere(filters, "o");

  const summaryRes = await client.query(
    `
    SELECT
      COUNT(*)::int AS total_count,
      COALESCE(SUM(o.grand_total), 0) AS total_amount,
      COALESCE(COUNT(*) FILTER (WHERE COALESCE(LOWER(o.payment_status), '') = ANY($${params.length + 1}::text[])), 0)::int AS paid_count,
      COALESCE(COUNT(*) FILTER (WHERE COALESCE(LOWER(o.payment_status), '') = ANY($${params.length + 2}::text[])), 0)::int AS refunded_count,
      COALESCE(COUNT(*) FILTER (WHERE COALESCE(LOWER(o.payment_status), '') = ANY($${params.length + 3}::text[])), 0)::int AS pending_count,
      COALESCE(COUNT(*) FILTER (WHERE COALESCE(LOWER(o.payment_status), '') = ANY($${params.length + 4}::text[])), 0)::int AS cancelled_count,
      COALESCE(COUNT(DISTINCT COALESCE(o.user_id::text, o.guest_token, o.email, o.phone, o.customer_name)), 0)::int AS unique_customers,
      COALESCE(SUM(CASE
        WHEN COALESCE(LOWER(o.payment_status), '') = ANY($${params.length + 1}::text[])
         AND o.created_at >= date_trunc('month', NOW())
        THEN o.grand_total ELSE 0 END), 0) AS this_month_spent,
      COALESCE(MAX(o.created_at), NULL) AS last_order_at,
      COALESCE(MAX(o.currency), 'AED') AS currency
    FROM orders o
    ${whereSql}
    `,
    [...params, PAID_STATUSES, REFUNDED_STATUSES, PENDING_STATUSES, CANCELLED_STATUSES]
  );

  const lastOrderRes = await client.query(
    `
    SELECT
      ${ORDER_COLUMNS}
    FROM orders o
    ${whereSql}
    ORDER BY o.created_at DESC, o.id DESC
    LIMIT 1
    `,
    params
  );

  const row = summaryRes.rows[0] || {};
  const lastOrder = lastOrderRes.rows[0] ? mapOrderRow(lastOrderRes.rows[0]) : null;

  return {
    totalCount: toNum(row.total_count, 0),
    totalAmount: Number(row.total_amount || 0),
    paidCount: toNum(row.paid_count, 0),
    pendingCount: toNum(row.pending_count, 0),
    refundedCount: toNum(row.refunded_count, 0),
    cancelledCount: toNum(row.cancelled_count, 0),
    thisMonthSpent: Number(row.this_month_spent || 0),
    uniqueCustomers: toNum(row.unique_customers, 0),
    currency: row.currency || lastOrder?.currency || "AED",
    lastOrder,
  };
}

async function getAdminOrdersBreakdowns(client, filters = {}) {
  const { whereSql, params } = buildOrderWhere(filters, "o");

  const [statusRes, methodRes, gatewayRes] = await Promise.all([
    client.query(
      `
      SELECT
        COALESCE(o.payment_status, 'unknown') AS payment_status,
        COUNT(*)::int AS count,
        COALESCE(SUM(o.grand_total), 0) AS total
      FROM orders o
      ${whereSql}
      GROUP BY COALESCE(o.payment_status, 'unknown')
      ORDER BY count DESC, total DESC
      `,
      params
    ),
    client.query(
      `
      SELECT
        COALESCE(o.payment_method, 'unknown') AS payment_method,
        COUNT(*)::int AS count,
        COALESCE(SUM(o.grand_total), 0) AS total
      FROM orders o
      ${whereSql}
      GROUP BY COALESCE(o.payment_method, 'unknown')
      ORDER BY count DESC, total DESC
      `,
      params
    ),
    client.query(
      `
      SELECT
        COALESCE(o.gateway_provider, 'unknown') AS gateway_provider,
        COUNT(*)::int AS count,
        COALESCE(SUM(o.grand_total), 0) AS total
      FROM orders o
      ${whereSql}
      GROUP BY COALESCE(o.gateway_provider, 'unknown')
      ORDER BY count DESC, total DESC
      `,
      params
    ),
  ]);

  return {
    statusBreakdown: statusRes.rows || [],
    paymentMethodBreakdown: methodRes.rows || [],
    gatewayBreakdown: gatewayRes.rows || [],
  };
}

async function getAdminOrdersWeeklySeries(client, filters = {}) {
  const base = { ...filters, type: "weekly" };
  const { whereSql, params } = buildOrderWhere(base, "o");

  const r = await client.query(
    `
    SELECT
      TO_CHAR(date_trunc('day', o.created_at), 'Dy') AS label,
      DATE_TRUNC('day', o.created_at) AS day_key,
      COALESCE(SUM(CASE WHEN COALESCE(LOWER(o.payment_status), '') = ANY($${params.length + 1}::text[]) THEN o.grand_total ELSE 0 END), 0) AS amount,
      COALESCE(COUNT(*) FILTER (WHERE COALESCE(LOWER(o.payment_status), '') = ANY($${params.length + 1}::text[])), 0)::int AS paid_count
    FROM orders o
    ${whereSql}
    GROUP BY 1, 2
    ORDER BY 2 ASC
    `,
    [...params, PAID_STATUSES]
  );

  return r.rows || [];
}

async function getAdminOrdersMonthlySeries(client, filters = {}) {
  const { whereSql, params } = buildOrderWhere(filters, "o");

  const r = await client.query(
    `
    SELECT
      TO_CHAR(date_trunc('month', o.created_at), 'YYYY-MM') AS month_key,
      TO_CHAR(date_trunc('month', o.created_at), 'Mon YYYY') AS month_label,
      COALESCE(SUM(CASE WHEN COALESCE(LOWER(o.payment_status), '') = ANY($${params.length + 1}::text[]) THEN o.grand_total ELSE 0 END), 0) AS revenue,
      COALESCE(COUNT(*) FILTER (WHERE COALESCE(LOWER(o.payment_status), '') = ANY($${params.length + 1}::text[])), 0)::int AS paid_orders,
      COALESCE(COUNT(*) FILTER (WHERE COALESCE(LOWER(o.payment_status), '') = ANY($${params.length + 2}::text[])), 0)::int AS refunded_orders,
      COALESCE(COUNT(*) FILTER (WHERE COALESCE(LOWER(o.payment_status), '') = ANY($${params.length + 3}::text[])), 0)::int AS pending_orders
    FROM orders o
    ${whereSql}
    ${whereSql ? "AND" : "WHERE"} o.created_at >= date_trunc('month', NOW()) - INTERVAL '11 months'
    GROUP BY 1, 2
    ORDER BY 1 ASC
    `,
    [...params, PAID_STATUSES, REFUNDED_STATUSES, PENDING_STATUSES]
  );

  return r.rows || [];
}

async function fetchAdminOrders(client, filters = {}, limitOverride = null, offsetOverride = null) {
  const queryFilters = { ...filters };
  if (queryFilters.type === "recent") queryFilters.limit = 10;
  if (queryFilters.type === "weekly") queryFilters.limit = queryFilters.limit || DEFAULT_LIMIT;

  const { whereSql, params } = buildOrderWhere(queryFilters, "o");
  const orderBy = buildSort(queryFilters);
  const limit = limitOverride ?? queryFilters.limit ?? DEFAULT_LIMIT;
  const page = queryFilters.page || 1;
  const offset = offsetOverride ?? (page - 1) * limit;

  const countSql = `
    SELECT COUNT(*)::int AS total
    FROM orders o
    ${whereSql}
  `;

  const dataSql = `
    SELECT
      ${ORDER_COLUMNS}
    FROM orders o
    ${whereSql}
    ORDER BY ${orderBy}
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}
  `;

  const [countRes, dataRes] = await Promise.all([
    client.query(countSql, params),
    client.query(dataSql, [...params, limit, offset]),
  ]);

  return {
    total: toNum(countRes.rows[0]?.total, 0),
    page,
    limit,
    rows: (dataRes.rows || []).map(mapOrderRow),
  };
}

async function getAdminOrderByRef(client, orderRef) {
  const ref = sanitizeText(orderRef, 80);
  if (!ref) return null;

  const r = await client.query(
    `
    SELECT
      ${ORDER_COLUMNS}
    FROM orders o
    WHERE (
      o.order_number = $1
      OR o.tracking_id = $1
      OR o.payment_reference = $1
      OR o.id::text = $1
    )
    LIMIT 1
    `,
    [ref]
  );

  return r.rows[0] || null;
}

async function getAdminOrderDetailsByRef(client, orderRef) {
  const order = await getAdminOrderByRef(client, orderRef);
  if (!order) return null;

  const itemsRes = await client.query(
    `
    SELECT
      oi.id,
      oi.order_id,
      oi.cart_id,
      oi.product_id,
      oi.variant_id,
      oi.product_name,
      oi.variant_name,
      oi.sku,
      oi.quantity,
      oi.unit_price,
      oi.discount_amount,
      oi.vat_amount,
      oi.line_total,
      oi.created_at,
      p.name AS product_catalog_name
    FROM order_items oi
    LEFT JOIN products p ON p.id = oi.product_id
    WHERE oi.order_id = $1
    ORDER BY oi.id ASC
    `,
    [order.id]
  );

  return {
    order: mapOrderRow(order),
    items: (itemsRes.rows || []).map(mapItemRow),
  };
}

async function getAdminLiveSearchResults(client, filters = {}) {
  const query = sanitizeText(filters.q, 120);
  if (!query) return [];

  const params = [];
  const add = (value) => {
    params.push(value);
    return `$${params.length}`;
  };
  const like = add(`%${query.toLowerCase()}%`);

  const r = await client.query(
    `
    SELECT
      ${ORDER_COLUMNS}
    FROM orders o
    WHERE (
      LOWER(COALESCE(o.order_number, '')) LIKE ${like}
      OR LOWER(COALESCE(o.tracking_id, '')) LIKE ${like}
      OR LOWER(COALESCE(o.payment_reference, '')) LIKE ${like}
      OR LOWER(COALESCE(o.customer_name, '')) LIKE ${like}
      OR LOWER(COALESCE(o.email, '')) LIKE ${like}
      OR LOWER(COALESCE(o.phone, '')) LIKE ${like}
      OR LOWER(COALESCE(o.payment_method, '')) LIKE ${like}
      OR LOWER(COALESCE(o.gateway_provider, '')) LIKE ${like}
      OR LOWER(COALESCE(o.order_status, '')) LIKE ${like}
      OR LOWER(COALESCE(o.payment_status, '')) LIKE ${like}
    )
    ORDER BY o.created_at DESC, o.id DESC
    LIMIT 20
    `,
    params
  );

  return (r.rows || []).map(mapOrderRow);
}

async function buildAdminOrdersPageModel(req, client) {
  const filters = normalizeFilters(req);

  const [overview, breakdowns, orders, recentOrders, liveSearchResults, weeklySeries, monthlySeries, orderSearchResult] =
    await Promise.all([
      getAdminOrdersOverview(client, filters),
      getAdminOrdersBreakdowns(client, filters),
      fetchAdminOrders(client, filters),
      fetchAdminOrders(client, { type: "recent", sort: "created_at", dir: "desc", page: 1, limit: 10 }),
      getAdminLiveSearchResults(client, filters),
      getAdminOrdersWeeklySeries(client, filters),
      getAdminOrdersMonthlySeries(client, filters),
      filters.order_number || filters.tracking_id || filters.payment_reference
        ? getAdminOrderDetailsByRef(client, filters.order_number || filters.tracking_id || filters.payment_reference)
        : Promise.resolve(null),
    ]);

  const pagination = buildPagination(orders.total || 0, orders.page || 1, orders.limit || DEFAULT_LIMIT);

  return {
    admin: getSessionAdmin(req) || req.user || req.session?.user || null,
    csrfToken: req.csrfToken ? req.csrfToken() : "",
    filters,
    pagination,
    summaryData: overview,
    orderRows: orders.rows,
    orders: orders.rows,
    recentOrders: recentOrders.rows,
    liveSearchResults,
    weeklySeriesData: weeklySeries,
    monthlySeriesData: monthlySeries,
    statusBreakdown: breakdowns.statusBreakdown,
    paymentMethodBreakdown: breakdowns.paymentMethodBreakdown,
    gatewayBreakdown: breakdowns.gatewayBreakdown,
    orderSearchResult,
    quickOrderResult: orderSearchResult,
    queryOrderNumber: filters.order_number || "",
    queryTrackingId: filters.tracking_id || "",
    queryPaymentReference: filters.payment_reference || "",
    currentRoute: "/admin/a/orders",
  };
}

/* =========================================================
   ROUTE HANDLERS
========================================================= */

exports.getAdminOrdersPage = async (req, res) => {
  let client;
  try {
    const access = requireAdmin(req);
    if (access.error) {
      return reply(
        req,
        res,
        access.statusCode || 401,
        {
          ok: false,
          success: false,
          error: access.error_code || "UNAUTHORIZED",
          message: access.message || "Admin access required.",
        },
        access.redirectUrl || ADMIN_LOGIN_FALLBACK
      );
    }

    client = await pool.connect();
    const model = await buildAdminOrdersPageModel(req, client);

    return renderSafe(
      res,
      [ADMIN_LIST_VIEW, "admin/a/orders", "admin/orders"],
      buildBaseViewData(req, {
        title: "Admin Orders",
        ...model,
      })
    );
  } catch (err) {
    console.error("getAdminOrdersPage:", err);
    return res.redirect(ADMIN_FALLBACK);
  } finally {
    if (client) client.release();
  }
};

exports.getAdminOrdersData = async (req, res) => {
  let client;
  try {
    const access = requireAdmin(req);
    if (access.error) {
      return res.status(access.statusCode || 401).json({
        ok: false,
        success: false,
        error: access.error_code || "UNAUTHORIZED",
        message: access.message || "Admin access required.",
      });
    }

    client = await pool.connect();
    const model = await buildAdminOrdersPageModel(req, client);

    return res.json({
      ok: true,
      success: true,
      serverTime: new Date().toISOString(),
      data: {
        summaryData: model.summaryData,
        orderRows: model.orderRows,
        orders: model.orders,
        recentOrders: model.recentOrders,
        liveSearchResults: model.liveSearchResults,
        weeklySeriesData: model.weeklySeriesData,
        monthlySeriesData: model.monthlySeriesData,
        statusBreakdown: model.statusBreakdown,
        paymentMethodBreakdown: model.paymentMethodBreakdown,
        gatewayBreakdown: model.gatewayBreakdown,
        orderSearchResult: model.orderSearchResult,
        quickOrderResult: model.quickOrderResult,
        filters: model.filters,
        pagination: model.pagination,
      },
    });
  } catch (err) {
    console.error("getAdminOrdersData:", err);
    return res.status(500).json({
      ok: false,
      success: false,
      error: "SERVER_ERROR",
      message: "Failed to load admin order data.",
    });
  } finally {
    if (client) client.release();
  }
};

exports.getAdminOrdersSummary = async (req, res) => {
  let client;
  try {
    const access = requireAdmin(req);
    if (access.error) {
      return res.status(access.statusCode || 401).json({
        ok: false,
        success: false,
        error: access.error_code || "UNAUTHORIZED",
        message: access.message || "Admin access required.",
      });
    }

    client = await pool.connect();
    const filters = normalizeFilters(req);
    const [summaryData, breakdowns, weeklySeriesData, monthlySeriesData] = await Promise.all([
      getAdminOrdersOverview(client, filters),
      getAdminOrdersBreakdowns(client, filters),
      getAdminOrdersWeeklySeries(client, filters),
      getAdminOrdersMonthlySeries(client, filters),
    ]);

    return res.json({
      ok: true,
      success: true,
      serverTime: new Date().toISOString(),
      data: {
        summaryData,
        statusBreakdown: breakdowns.statusBreakdown,
        paymentMethodBreakdown: breakdowns.paymentMethodBreakdown,
        gatewayBreakdown: breakdowns.gatewayBreakdown,
        weeklySeriesData,
        monthlySeriesData,
      },
    });
  } catch (err) {
    console.error("getAdminOrdersSummary:", err);
    return res.status(500).json({
      ok: false,
      success: false,
      error: "SERVER_ERROR",
      message: "Failed to load admin order summary.",
    });
  } finally {
    if (client) client.release();
  }
};

exports.getAdminOrdersLiveSearch = async (req, res) => {
  let client;
  try {
    const access = requireAdmin(req);
    if (access.error) {
      return res.status(access.statusCode || 401).json({
        ok: false,
        success: false,
        error: access.error_code || "UNAUTHORIZED",
        message: access.message || "Admin access required.",
      });
    }

    client = await pool.connect();
    const filters = normalizeFilters(req);
    const results = await getAdminLiveSearchResults(client, filters);

    return res.json({
      ok: true,
      success: true,
      serverTime: new Date().toISOString(),
      data: {
        results,
        count: results.length,
      },
    });
  } catch (err) {
    console.error("getAdminOrdersLiveSearch:", err);
    return res.status(500).json({
      ok: false,
      success: false,
      error: "SERVER_ERROR",
      message: "Failed to load live search results.",
    });
  } finally {
    if (client) client.release();
  }
};

exports.getAdminOrderDetails = async (req, res) => {
  let client;
  try {
    const access = requireAdmin(req);
    if (access.error) {
      return reply(
        req,
        res,
        access.statusCode || 401,
        {
          ok: false,
          success: false,
          error: access.error_code || "UNAUTHORIZED",
          message: access.message || "Admin access required.",
        },
        access.redirectUrl || ADMIN_LOGIN_FALLBACK
      );
    }

    const orderRef = sanitizeText(
      req.params?.orderNumber ||
        req.params?.order_number ||
        req.params?.id ||
        req.query?.order_number ||
        req.query?.tracking_id ||
        req.query?.payment_reference,
      80
    );

    if (!orderRef) {
      return reply(req, res, 400, {
        ok: false,
        success: false,
        error: "INVALID_INPUT",
        message: "Order number, tracking ID, payment reference, or ID is required.",
      });
    }

    client = await pool.connect();
    const result = await getAdminOrderDetailsByRef(client, orderRef);

    if (!result) {
      return reply(req, res, 404, {
        ok: false,
        success: false,
        error: "NOT_FOUND",
        message: "Order not found.",
      });
    }

    if (wantsJson(req)) {
      return res.json({ ok: true, success: true, data: result });
    }

    return renderSafe(
      res,
      [ADMIN_DETAIL_VIEW, "admin/a/orders/detail", "admin/orders/detail"],
      {
        title: `Order Detail - ${result.order.order_number || result.order.tracking_id || "Order"}`,
        detail: result,
        currentRoute: "/admin/a/orders",
      }
    );
  } catch (err) {
    console.error("getAdminOrderDetails:", err);
    return reply(req, res, 500, {
      ok: false,
      success: false,
      error: "SERVER_ERROR",
      message: "Failed to load order details.",
    });
  } finally {
    if (client) client.release();
  }
};

exports.exportAdminOrders = async (req, res) => {
  let client;
  try {
    const access = requireAdmin(req);
    if (access.error) {
      return res.status(access.statusCode || 401).json({
        ok: false,
        success: false,
        error: access.error_code || "UNAUTHORIZED",
        message: access.message || "Admin access required.",
      });
    }

    client = await pool.connect();
    const filters = normalizeFilters(req);

    const [
      summaryData,
      breakdowns,
      orders,
      recentOrders,
      liveSearchResults,
      weeklySeriesData,
      monthlySeriesData,
      orderSearchResult,
    ] = await Promise.all([
      getAdminOrdersOverview(client, filters),
      getAdminOrdersBreakdowns(client, filters),
      fetchAdminOrders(client, { ...filters, page: 1, limit: EXPORT_LIMIT }, EXPORT_LIMIT, 0),
      fetchAdminOrders(client, { type: "recent", sort: "created_at", dir: "desc", page: 1, limit: 10 }, 10, 0),
      getAdminLiveSearchResults(client, filters),
      getAdminOrdersWeeklySeries(client, filters),
      getAdminOrdersMonthlySeries(client, filters),
      filters.order_number || filters.tracking_id || filters.payment_reference
        ? getAdminOrderDetailsByRef(client, filters.order_number || filters.tracking_id || filters.payment_reference)
        : Promise.resolve(null),
    ]);

    return res.json({
      ok: true,
      success: true,
      message: "Export data ready.",
      serverTime: new Date().toISOString(),
      data: {
        summaryData,
        statusBreakdown: breakdowns.statusBreakdown,
        paymentMethodBreakdown: breakdowns.paymentMethodBreakdown,
        gatewayBreakdown: breakdowns.gatewayBreakdown,
        orders: orders.rows,
        recentOrders: recentOrders.rows,
        liveSearchResults,
        weeklySeriesData,
        monthlySeriesData,
        orderSearchResult,
        filters,
      },
    });
  } catch (err) {
    console.error("exportAdminOrders:", err);
    return res.status(500).json({
      ok: false,
      success: false,
      error: "SERVER_ERROR",
      message: "Failed to prepare export data.",
    });
  } finally {
    if (client) client.release();
  }
};

/* =========================================================
   COMPATIBILITY ALIASES
========================================================= */

exports.getOrdersPage = exports.getAdminOrdersPage;
exports.getOrdersData = exports.getAdminOrdersData;
exports.getOrdersSummary = exports.getAdminOrdersSummary;
exports.getOrdersLiveSearch = exports.getAdminOrdersLiveSearch;
exports.getOrderDetails = exports.getAdminOrderDetails;
exports.getOrderItem = exports.getAdminOrderDetails;
exports.exportOrders = exports.exportAdminOrders;

exports.getOrders = exports.getAdminOrdersPage;
exports.getOrderById = exports.getAdminOrderDetails;

exports.cancelOrder = async (req, res) => {
  let client;
  try {
    const access = requireAdmin(req);
    if (access.error) {
      return reply(
        req,
        res,
        access.statusCode || 401,
        {
          ok: false,
          success: false,
          error: access.error_code || "UNAUTHORIZED",
          message: access.message || "Admin access required.",
        },
        access.redirectUrl || ADMIN_LOGIN_FALLBACK
      );
    }

    const orderId = sanitizeText(req.params?.id, 80);
    if (!orderId) {
      return reply(req, res, 400, {
        ok: false,
        success: false,
        error: "INVALID_INPUT",
        message: "Order ID is required.",
      });
    }

    client = await pool.connect();

    const r = await client.query(
      `
      UPDATE orders
      SET payment_status = 'cancelled',
          order_status = 'cancelled',
          updated_at = NOW()
      WHERE id::text = $1
      RETURNING id
      `,
      [orderId]
    );

    if (!r.rows.length) {
      return reply(req, res, 404, {
        ok: false,
        success: false,
        error: "NOT_FOUND",
        message: "Order not found.",
      });
    }

    if (wantsJson(req)) {
      return res.json({
        ok: true,
        success: true,
        message: "Order cancelled successfully.",
      });
    }

    return res.redirect(ADMIN_FALLBACK);
  } catch (err) {
    console.error("cancelOrder:", err);
    return reply(req, res, 500, {
      ok: false,
      success: false,
      error: "SERVER_ERROR",
      message: "Failed to cancel order.",
    });
  } finally {
    if (client) client.release();
  }
};

exports.getOrderStatusOptions = async (req, res) => {
  const options = [
    "pending",
    "initiated",
    "pending_payment",
    "processing",
    "ongoing",
    "confirmed",
    "completed",
    "cancelled",
    "refunded",
    "partially_refunded",
  ];

  if (wantsJson(req)) {
    return res.json({ ok: true, success: true, data: options });
  }

  return res.render("admin/a/orders/status-options", { options });
};

/* =========================================================
   OPTIONAL REUSABLE EXPORTS
========================================================= */

exports.formatMoney = formatMoney;
exports.safeDateLabel = safeDateLabel;
exports.safeDateOnlyLabel = safeDateOnlyLabel;
exports.resolveViewName = resolveViewName;
exports.renderSafe = renderSafe;
exports.normalizeFilters = normalizeFilters;
exports.buildSort = buildSort;
exports.buildOrderWhere = buildOrderWhere;
exports.fetchAdminOrders = fetchAdminOrders;
exports.getAdminOrdersOverview = getAdminOrdersOverview;
exports.getAdminOrdersBreakdowns = getAdminOrdersBreakdowns;
exports.getAdminOrderDetailsByRef = getAdminOrderDetailsByRef;
exports.getAdminLiveSearchResults = getAdminLiveSearchResults;
exports.buildAdminOrdersPageModel = buildAdminOrdersPageModel;
exports.getSessionAdmin = getSessionAdmin;
exports.requireAdmin = requireAdmin;
exports.buildPagination = buildPagination;