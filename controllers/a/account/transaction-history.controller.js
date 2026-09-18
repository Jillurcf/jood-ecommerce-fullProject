'use strict';

const fs = require('fs');
const path = require('path');
const { pool } = require('../../../includes/conn');

/**
 * =========================================================
 * ADMIN TRANSACTION REPORT CONTROLLER
 * =========================================================
 * Admin-only transaction reporting for SSR and JSON endpoints.
 * Includes:
 * - transaction history page
 * - transaction detail page
 * - paginated JSON data
 * - summary + chart payloads
 * - export-ready JSON payloads for PDF / Excel generation
 *
 * Notes:
 * - Uses parameterized PostgreSQL queries.
 * - Supports order number / tracking ID / payment reference lookup.
 * - Uses the same admin login session shape as other admin controllers.
 * - Backward-compatible aliases are exported at the end.
 * =========================================================
 */

const ADMIN_VIEW = 'admin/a/account/transaction-history';
const ADMIN_DETAIL_VIEW = 'admin/a/account/transaction-detail';
const ADMIN_FALLBACK = '/admin/a/account/transaction-history';
const ADMIN_LOGIN_FALLBACK = '/admin/a/sign/in';

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const EXPORT_LIMIT = 1000;
const DEFAULT_SORT = 'created_at';
const DEFAULT_DIR = 'desc';

const PAID_STATUSES = ['paid', 'completed', 'captured'];
const PENDING_STATUSES = ['pending', 'initiated', 'pending_payment'];
const REFUNDED_STATUSES = ['refunded', 'refund', 'partially_refunded'];

const ORDER_COLUMNS = `
  o.id,
  o.user_id,
  o.guest_token,
  o.order_number,
  o.tracking_id,
  o.customer_name,
  o.email,
  o.phone,
  o.created_at,
  o.updated_at,
  o.grand_total,
  o.currency,
  o.payment_method,
  o.payment_status,
  o.order_status,
  o.gateway_provider,
  o.payment_reference,
  ca.id AS account_id,
  ca.full_name AS account_name,
  ca.email AS account_email,
  ca.phone AS account_phone
`;

function wantsJson(req) {
  return Boolean(
    req.xhr ||
      String(req.headers?.accept || '').includes('application/json') ||
      String(req.headers?.['content-type'] || '').includes('application/json')
  );
}

function sanitizeText(v, max = 255) {
  if (v == null) return '';
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
  if (!d) return 'Not available';
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function safeDateOnlyLabel(value) {
  const d = parseDate(value);
  if (!d) return 'Not available';
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatMoney(value, currency = 'AED') {
  const amount = Number(value || 0);
  const code = String(currency || 'AED').trim() || 'AED';
  try {
    return new Intl.NumberFormat('en-AE', {
      style: 'currency',
      currency: code,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${code} ${amount.toFixed(2)}`;
  }
}

function reply(req, res, statusCode, payload, redirectUrl = ADMIN_FALLBACK) {
  if (wantsJson(req)) {
    return res.status(statusCode).json(payload);
  }

  // Avoid redirect loops if the current request is already on the target URL.
  if (req.originalUrl === redirectUrl || req.path === redirectUrl) {
    return res.status(statusCode).send(payload?.message || 'Request failed.');
  }

  return res.redirect(redirectUrl);
}

function normalizeViewName(v) {
  return String(v || '').trim().replace(/^[\\/]+/, '').replace(/\.ejs$/i, '');
}

function resolveViewName(app, candidates = []) {
  const viewsDir = app?.get?.('views');
  const engine = String(app?.get?.('view engine') || 'ejs').replace(/^\./, '').trim() || 'ejs';

  for (const candidate of candidates) {
    const clean = normalizeViewName(candidate);
    if (!clean) continue;

    const possibleFiles = [
      path.join(viewsDir || '', `${clean}.${engine}`),
      path.join(viewsDir || '', `${clean}.ejs`),
      path.join(viewsDir || '', clean),
    ];

    for (const filePath of possibleFiles) {
      if (filePath && fs.existsSync(filePath)) return clean;
    }
  }

  return normalizeViewName(candidates[0] || ADMIN_VIEW);
}

function renderSafe(res, candidates, data) {
  const viewName = resolveViewName(res.app, candidates);
  return res.render(viewName, data);
}

/* =========================================================
   ADMIN SESSION HELPERS
========================================================= */

function getSessionAdmin(req) {
  if (req.session?.admin?.id) {
    return req.session.admin;
  }

  if (req.session?.adminId) {
    return {
      id: req.session.adminId,
      admin_id: req.session.adminAdminId || null,
      full_name: req.session.adminName || null,
      email: req.session.adminEmail || null,
      phone: req.session.adminPhone || null,
      role: req.session.adminRole || req.session.role || 'admin',
      status: req.session.adminStatus || 'active',
      sessionVersion: req.session.sessionVersion || 1,
      loginAt: req.session.loginAt || null,
    };
  }

  if (req.user?.id) {
    return {
      id: req.user.id,
      admin_id: req.user.admin_id || null,
      full_name: req.user.full_name || req.user.name || null,
      email: req.user.email || null,
      phone: req.user.phone || null,
      role: req.user.role || req.user.type || 'admin',
      status: req.user.status || 'active',
      sessionVersion: req.user.sessionVersion || 1,
      loginAt: req.user.loginAt || null,
    };
  }

  return null;
}

function getActorRole(req) {
  const actor = getSessionAdmin(req);
  return String(
    actor?.role ||
      req.session?.adminRole ||
      req.session?.role ||
      req.user?.role ||
      req.user?.type ||
      ''
  ).toLowerCase();
}

function isAdminUser(req) {
  const actor = getSessionAdmin(req);
  if (actor?.id) return true;

  const role = getActorRole(req);
  return Boolean(
    req.session?.isAdmin ||
      req.user?.isAdmin ||
      role === 'admin' ||
      role === 'superadmin' ||
      role === 'staff' ||
      role === 'master_admin' ||
      role === 'super_admin' ||
      role === 'sub_admin'
  );
}

function requireAdmin(req) {
  if (isAdminUser(req)) return { error: false };

  return {
    error: true,
    statusCode: 401,
    error_code: 'UNAUTHORIZED',
    message: 'Admin access required.',
    redirectUrl: ADMIN_LOGIN_FALLBACK,
  };
}

function buildEmptySummary() {
  return {
    totalCount: 0,
    totalAmount: 0,
    paidCount: 0,
    pendingCount: 0,
    refundedCount: 0,
    thisMonthSpent: 0,
    uniqueCustomers: 0,
    currency: 'AED',
    lastOrder: null,
  };
}

function normalizeFilters(req) {
  return {
    page: clampInt(req.query?.page, 1, 1000000, 1),
    limit: clampInt(req.query?.limit, 1, MAX_LIMIT, DEFAULT_LIMIT),
    sort: sanitizeText(req.query?.sort, 40).toLowerCase() || DEFAULT_SORT,
    dir: sanitizeText(req.query?.dir, 5).toLowerCase() === 'asc' ? 'asc' : DEFAULT_DIR,
    status: sanitizeText(req.query?.status, 40).toLowerCase(),
    payment_method: sanitizeText(req.query?.payment_method || req.query?.paymentMethod, 40).toLowerCase(),
    gateway_provider: sanitizeText(req.query?.gateway_provider || req.query?.gatewayProvider, 60).toLowerCase(),
    order_status: sanitizeText(req.query?.order_status || req.query?.orderStatus, 40).toLowerCase(),
    from: sanitizeText(req.query?.from || req.query?.date_from, 40),
    to: sanitizeText(req.query?.to || req.query?.date_to, 40),
    q: sanitizeText(req.query?.q, 120),
    order_number: sanitizeText(req.query?.order_number || req.query?.orderNumber, 80),
    product_query: sanitizeText(req.query?.product_query || req.query?.productQuery, 120),
    customer: sanitizeText(req.query?.customer, 120),
    email: sanitizeText(req.query?.email, 120),
    type: sanitizeText(req.query?.type, 20).toLowerCase(),
  };
}

function buildSort(query = {}) {
  const sort = sanitizeText(query.sort, 40).toLowerCase() || DEFAULT_SORT;
  const dir = sanitizeText(query.dir, 5).toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  const allowed = {
    id: `o.id ${dir}`,
    created_at: `o.created_at ${dir} NULLS LAST, o.id ${dir}`,
    updated_at: `o.updated_at ${dir} NULLS LAST, o.id ${dir}`,
    total: `o.grand_total ${dir} NULLS LAST, o.id ${dir}`,
    status: `o.payment_status ${dir} NULLS LAST, o.id ${dir}`,
    order_status: `o.order_status ${dir} NULLS LAST, o.id ${dir}`,
    customer_name: `COALESCE(o.customer_name, ca.full_name, '') ${dir} NULLS LAST, o.id ${dir}`,
    payment_method: `o.payment_method ${dir} NULLS LAST, o.id ${dir}`,
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

function buildTransactionWhere(filters = {}, alias = 'o') {
  const params = [];
  const clauses = [];
  const add = (value) => {
    params.push(value);
    return `$${params.length}`;
  };

  buildDateClause(`${alias}.created_at`, filters.from, '>=', params, clauses);
  buildDateClause(`${alias}.created_at`, filters.to, '<=', params, clauses);

  if (filters.status) {
    clauses.push(`COALESCE(LOWER(${alias}.payment_status), '') = ${add(filters.status)}`);
  }

  if (filters.payment_method) {
    clauses.push(`COALESCE(LOWER(${alias}.payment_method), '') = ${add(filters.payment_method)}`);
  }

  if (filters.gateway_provider) {
    clauses.push(`COALESCE(LOWER(${alias}.gateway_provider), '') = ${add(filters.gateway_provider)}`);
  }

  if (filters.order_status) {
    clauses.push(`COALESCE(LOWER(${alias}.order_status), '') = ${add(filters.order_status)}`);
  }

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

  if (filters.type === 'weekly') {
    clauses.push(`${alias}.created_at >= NOW() - INTERVAL '7 days'`);
  }

  if (filters.type === 'today') {
    clauses.push(`${alias}.created_at >= date_trunc('day', NOW())`);
  }

  if (filters.type === 'month') {
    clauses.push(`${alias}.created_at >= date_trunc('month', NOW())`);
  }

  return {
    whereSql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
    params,
  };
}

function mapOrderRow(row) {
  const amount = Number(row.grand_total || 0);
  const currency = row.currency || 'AED';

  return {
    id: row.id,
    user_id: row.user_id ?? null,
    guest_token: row.guest_token ?? null,
    order_number: row.order_number || null,
    tracking_id: row.tracking_id || null,
    title: row.order_number || row.tracking_id || 'Transaction',
    customer_name: row.customer_name || row.account_name || null,
    email: row.email || row.account_email || null,
    phone: row.phone || row.account_phone || null,
    amount,
    grand_total: amount,
    currency,
    payment_method: row.payment_method || null,
    payment_status: row.payment_status || null,
    order_status: row.order_status || null,
    gateway_provider: row.gateway_provider || null,
    payment_reference: row.payment_reference || null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
    created_at_label: safeDateLabel(row.created_at),
    updated_at_label: safeDateLabel(row.updated_at),
    created_date_label: safeDateOnlyLabel(row.created_at),
    account_name: row.account_name || null,
    account_id: row.account_id ?? null,
    detail_url: row.order_number
      ? `/admin/a/account/transaction-history/${encodeURIComponent(row.order_number)}`
      : row.tracking_id
        ? `/admin/a/account/transaction-history/${encodeURIComponent(row.tracking_id)}`
        : null,
    transaction_type: 'order',
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

function buildBaseViewData(req, data = {}) {
  return {
    admin: getSessionAdmin(req) || req.user || req.session?.user || null,
    csrfToken: req.csrfToken ? req.csrfToken() : '',

    summaryData: buildEmptySummary(),
    transactionRows: [],
    transactions: [],
    recentTransactionsData: [],
    weeklyTransactionsData: [],
    weeklySeriesData: [],
    monthlySeriesData: [],
    statusBreakdown: [],
    paymentMethodBreakdown: [],
    gatewayBreakdown: [],
    orderSearchResult: null,
    productSearchResult: null,

    filters: {
      page: 1,
      limit: DEFAULT_LIMIT,
      sort: DEFAULT_SORT,
      dir: DEFAULT_DIR,
      status: '',
      payment_method: '',
      gateway_provider: '',
      order_status: '',
      from: '',
      to: '',
      q: '',
      order_number: '',
      product_query: '',
      customer: '',
      email: '',
      type: 'all',
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

    queryOrderNumber: '',
    queryProductQuery: '',

    successMessage: '',
    errorMessage: '',
    currentRoute: '/admin/a/account/transaction-history',
    ...data,
  };
}

async function getAdminOverview(client, filters = {}) {
  const { whereSql, params } = buildTransactionWhere(filters, 'o');

  const summaryRes = await client.query(
    `
    SELECT
      COUNT(*)::int AS total_count,
      COALESCE(SUM(o.grand_total), 0) AS total_amount,
      COALESCE(COUNT(*) FILTER (WHERE COALESCE(LOWER(o.payment_status), '') = ANY($${params.length + 1}::text[])), 0)::int AS paid_count,
      COALESCE(COUNT(*) FILTER (WHERE COALESCE(LOWER(o.payment_status), '') = ANY($${params.length + 2}::text[])), 0)::int AS refunded_count,
      COALESCE(COUNT(*) FILTER (WHERE COALESCE(LOWER(o.payment_status), '') = ANY($${params.length + 3}::text[])), 0)::int AS pending_count,
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
    [...params, PAID_STATUSES, REFUNDED_STATUSES, PENDING_STATUSES]
  );

  const lastOrderRes = await client.query(
    `
    SELECT
      ${ORDER_COLUMNS}
    FROM orders o
    LEFT JOIN customer_accounts ca
      ON COALESCE(ca.id::text, '') = COALESCE(o.user_id::text, '')
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
    thisMonthSpent: Number(row.this_month_spent || 0),
    uniqueCustomers: toNum(row.unique_customers, 0),
    currency: row.currency || lastOrder?.currency || 'AED',
    lastOrder,
  };
}

async function getAdminBreakdowns(client, filters = {}) {
  const { whereSql, params } = buildTransactionWhere(filters, 'o');

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

async function getAdminWeeklySeries(client, filters = {}) {
  const base = { ...filters, type: 'weekly' };
  const { whereSql, params } = buildTransactionWhere(base, 'o');

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

async function getAdminMonthlySeries(client, filters = {}) {
  const { whereSql, params } = buildTransactionWhere(filters, 'o');

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
    ${whereSql ? 'AND' : 'WHERE'} o.created_at >= date_trunc('month', NOW()) - INTERVAL '11 months'
    GROUP BY 1, 2
    ORDER BY 1 ASC
    `,
    [...params, PAID_STATUSES, REFUNDED_STATUSES, PENDING_STATUSES]
  );

  return r.rows || [];
}

async function fetchAdminTransactions(client, filters = {}, limitOverride = null, offsetOverride = null) {
  const queryFilters = { ...filters };
  if (queryFilters.type === 'recent') queryFilters.limit = 10;
  if (queryFilters.type === 'weekly') queryFilters.limit = queryFilters.limit || DEFAULT_LIMIT;

  const { whereSql, params } = buildTransactionWhere(queryFilters, 'o');
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
    LEFT JOIN customer_accounts ca
      ON COALESCE(ca.id::text, '') = COALESCE(o.user_id::text, '')
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
      ${ORDER_COLUMNS},
      o.billing_address,
      o.shipping_address,
      o.notes
    FROM orders o
    LEFT JOIN customer_accounts ca
      ON COALESCE(ca.id::text, '') = COALESCE(o.user_id::text, '')
    WHERE (
      o.order_number = $1
      OR o.tracking_id = $1
      OR o.payment_reference = $1
    )
    LIMIT 1
    `,
    [ref]
  );

  return r.rows[0] || null;
}

async function getAdminTransactionDetailsByRef(client, orderRef) {
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
    order: {
      ...mapOrderRow(order),
      email: order.email || null,
      phone: order.phone || null,
      billing_address: order.billing_address || null,
      shipping_address: order.shipping_address || null,
      notes: order.notes || null,
      account: order.account_name || order.account_email || null,
    },
    items: (itemsRes.rows || []).map(mapItemRow),
  };
}

async function getAdminProductSearchResult(client, filters = {}) {
  const q = sanitizeText(filters.product_query, 120);
  if (!q) return null;

  const isNumeric = /^\d+$/.test(q);
  const params = [];
  const add = (value) => {
    params.push(value);
    return `$${params.length}`;
  };
  let sql = '';

  if (isNumeric) {
    const p = add(Number(q));
    sql = `
      SELECT
        COALESCE(p.id, oi.product_id)::int AS product_id,
        COALESCE(p.name, oi.product_name, 'Product') AS product_name,
        COUNT(DISTINCT o.id)::int AS transaction_count,
        COALESCE(SUM(o.grand_total), 0) AS amount,
        COALESCE(o.currency, 'AED') AS currency,
        MAX(o.created_at) AS last_order_at
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      LEFT JOIN products p ON p.id = oi.product_id
      WHERE oi.product_id = ${p}
      GROUP BY COALESCE(p.id, oi.product_id), COALESCE(p.name, oi.product_name, 'Product'), COALESCE(o.currency, 'AED')
      ORDER BY amount DESC, transaction_count DESC
      LIMIT 1
    `;
  } else {
    const p = add(`%${q}%`);
    sql = `
      SELECT
        COALESCE(p.id, oi.product_id)::int AS product_id,
        COALESCE(p.name, oi.product_name, 'Product') AS product_name,
        COUNT(DISTINCT o.id)::int AS transaction_count,
        COALESCE(SUM(o.grand_total), 0) AS amount,
        COALESCE(o.currency, 'AED') AS currency,
        MAX(o.created_at) AS last_order_at
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      LEFT JOIN products p ON p.id = oi.product_id
      WHERE (
        COALESCE(p.name, oi.product_name, '') ILIKE ${p}
        OR COALESCE(oi.variant_name, '') ILIKE ${p}
        OR COALESCE(oi.sku, '') ILIKE ${p}
      )
      GROUP BY COALESCE(p.id, oi.product_id), COALESCE(p.name, oi.product_name, 'Product'), COALESCE(o.currency, 'AED')
      ORDER BY amount DESC, transaction_count DESC
      LIMIT 1
    `;
  }

  const r = await client.query(sql, params);
  const row = r.rows[0] || null;
  if (!row) return null;

  return {
    product_id: row.product_id,
    product_name: row.product_name,
    count: toNum(row.transaction_count, 0),
    amount: Number(row.amount || 0),
    currency: row.currency || 'AED',
    last_order_at: row.last_order_at || null,
    last_order_at_label: safeDateLabel(row.last_order_at),
  };
}

async function buildAdminTransactionPageModel(req, client) {
  const filters = normalizeFilters(req);

  const [overview, breakdowns, transactions, recentTransactions, weeklyTransactions, weeklySeries, monthlySeries, orderSearchResult, productSearchResult] =
    await Promise.all([
      getAdminOverview(client, filters),
      getAdminBreakdowns(client, filters),
      fetchAdminTransactions(client, filters),
      fetchAdminTransactions(client, { type: 'recent', sort: 'created_at', dir: 'desc', page: 1, limit: 10 }),
      fetchAdminTransactions(client, { ...filters, type: 'weekly', page: 1, limit: DEFAULT_LIMIT }, DEFAULT_LIMIT, 0),
      getAdminWeeklySeries(client, filters),
      getAdminMonthlySeries(client, filters),
      filters.order_number ? getAdminTransactionDetailsByRef(client, filters.order_number) : Promise.resolve(null),
      filters.product_query ? getAdminProductSearchResult(client, filters) : Promise.resolve(null),
    ]);

  const total = transactions.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / transactions.limit));
  const pagination = {
    page: filters.page,
    limit: filters.limit,
    total,
    totalPages,
    hasPrev: filters.page > 1,
    hasNext: filters.page < totalPages,
    prevPage: filters.page > 1 ? filters.page - 1 : null,
    nextPage: filters.page < totalPages ? filters.page + 1 : null,
  };

  return {
    admin: getSessionAdmin(req) || req.user || req.session?.user || null,
    csrfToken: req.csrfToken ? req.csrfToken() : '',
    filters,
    pagination,

    summaryData: overview,
    transactionRows: transactions.rows,
    transactions: transactions.rows,
    recentTransactionsData: recentTransactions.rows,
    weeklyTransactionsData: weeklyTransactions.rows,
    weeklySeriesData: weeklySeries,
    monthlySeriesData: monthlySeries,

    statusBreakdown: breakdowns.statusBreakdown,
    paymentMethodBreakdown: breakdowns.paymentMethodBreakdown,
    gatewayBreakdown: breakdowns.gatewayBreakdown,

    orderSearchResult,
    productSearchResult,

    queryOrderNumber: filters.order_number || '',
    queryProductQuery: filters.product_query || '',

    currentRoute: '/admin/a/account/transaction-history',
  };
}

exports.getAdminTransactionHistoryPage = async (req, res) => {
  let client;
  try {
    const access = requireAdmin(req);
    if (access.error) {
      return reply(req, res, access.statusCode || 401, {
        ok: false,
        success: false,
        error: access.error_code || 'UNAUTHORIZED',
        message: access.message || 'Admin access required.',
      }, access.redirectUrl || ADMIN_LOGIN_FALLBACK);
    }

    client = await pool.connect();
    const model = await buildAdminTransactionPageModel(req, client);

    return renderSafe(
      res,
      [
        ADMIN_VIEW,
        'admin/a/account/transaction-history/index',
        'admin/transactions/index',
      ],
      buildBaseViewData(req, {
        title: 'Admin Transaction Report',
        ...model,
      })
    );
  } catch (err) {
    console.error('getAdminTransactionHistoryPage:', err);
    return res.redirect(ADMIN_FALLBACK);
  } finally {
    if (client) client.release();
  }
};

exports.getAdminTransactionHistoryData = async (req, res) => {
  let client;
  try {
    const access = requireAdmin(req);
    if (access.error) {
      return res.status(access.statusCode || 401).json({
        ok: false,
        success: false,
        error: access.error_code || 'UNAUTHORIZED',
        message: access.message || 'Admin access required.',
      });
    }

    client = await pool.connect();
    const model = await buildAdminTransactionPageModel(req, client);

    return res.json({
      ok: true,
      success: true,
      serverTime: new Date().toISOString(),
      data: {
        summaryData: model.summaryData,
        transactionRows: model.transactionRows,
        transactions: model.transactions,
        recentTransactionsData: model.recentTransactionsData,
        weeklyTransactionsData: model.weeklyTransactionsData,
        weeklySeriesData: model.weeklySeriesData,
        monthlySeriesData: model.monthlySeriesData,
        statusBreakdown: model.statusBreakdown,
        paymentMethodBreakdown: model.paymentMethodBreakdown,
        gatewayBreakdown: model.gatewayBreakdown,
        orderSearchResult: model.orderSearchResult,
        productSearchResult: model.productSearchResult,
        filters: model.filters,
        pagination: model.pagination,
      },
    });
  } catch (err) {
    console.error('getAdminTransactionHistoryData:', err);
    return res.status(500).json({
      ok: false,
      success: false,
      error: 'SERVER_ERROR',
      message: 'Failed to load admin transaction data.',
    });
  } finally {
    if (client) client.release();
  }
};

exports.getAdminTransactionHistorySummary = async (req, res) => {
  let client;
  try {
    const access = requireAdmin(req);
    if (access.error) {
      return res.status(access.statusCode || 401).json({
        ok: false,
        success: false,
        error: access.error_code || 'UNAUTHORIZED',
        message: access.message || 'Admin access required.',
      });
    }

    client = await pool.connect();
    const filters = normalizeFilters(req);
    const [summaryData, breakdowns, weeklySeries, monthlySeries] = await Promise.all([
      getAdminOverview(client, filters),
      getAdminBreakdowns(client, filters),
      getAdminWeeklySeries(client, filters),
      getAdminMonthlySeries(client, filters),
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
        weeklySeries,
        monthlySeries,
      },
    });
  } catch (err) {
    console.error('getAdminTransactionHistorySummary:', err);
    return res.status(500).json({
      ok: false,
      success: false,
      error: 'SERVER_ERROR',
      message: 'Failed to load admin transaction summary.',
    });
  } finally {
    if (client) client.release();
  }
};

exports.getAdminTransactionHistoryChartData = async (req, res) => {
  let client;
  try {
    const access = requireAdmin(req);
    if (access.error) {
      return res.status(access.statusCode || 401).json({
        ok: false,
        success: false,
        error: access.error_code || 'UNAUTHORIZED',
        message: access.message || 'Admin access required.',
      });
    }

    client = await pool.connect();
    const filters = normalizeFilters(req);
    const [weeklySeries, monthlySeries, breakdowns] = await Promise.all([
      getAdminWeeklySeries(client, filters),
      getAdminMonthlySeries(client, filters),
      getAdminBreakdowns(client, filters),
    ]);

    return res.json({
      ok: true,
      success: true,
      serverTime: new Date().toISOString(),
      data: {
        weeklySeries,
        monthlySeries,
        statusBreakdown: breakdowns.statusBreakdown,
        paymentMethodBreakdown: breakdowns.paymentMethodBreakdown,
        gatewayBreakdown: breakdowns.gatewayBreakdown,
      },
    });
  } catch (err) {
    console.error('getAdminTransactionHistoryChartData:', err);
    return res.status(500).json({
      ok: false,
      success: false,
      error: 'SERVER_ERROR',
      message: 'Failed to load chart data.',
    });
  } finally {
    if (client) client.release();
  }
};

exports.getAdminTransactionDetails = async (req, res) => {
  let client;
  try {
    const access = requireAdmin(req);
    if (access.error) {
      return reply(req, res, access.statusCode || 401, {
        ok: false,
        success: false,
        error: access.error_code || 'UNAUTHORIZED',
        message: access.message || 'Admin access required.',
      }, access.redirectUrl || ADMIN_LOGIN_FALLBACK);
    }

    const orderRef = sanitizeText(
      req.params?.orderNumber || req.params?.order_number || req.params?.id || req.query?.order_number,
      80
    );

    if (!orderRef) {
      return reply(req, res, 400, {
        ok: false,
        success: false,
        error: 'INVALID_INPUT',
        message: 'Order number, tracking ID, or payment reference is required.',
      });
    }

    client = await pool.connect();
    const result = await getAdminTransactionDetailsByRef(client, orderRef);

    if (!result) {
      return reply(req, res, 404, {
        ok: false,
        success: false,
        error: 'NOT_FOUND',
        message: 'Transaction not found.',
      });
    }

    if (wantsJson(req)) {
      return res.json({ ok: true, success: true, data: result });
    }

    return renderSafe(
      res,
      [ADMIN_DETAIL_VIEW, 'admin/a/account/transaction-history/detail', 'admin/transactions/detail'],
      {
        title: `Transaction Detail - ${result.order.order_number || result.order.tracking_id || 'Order'}`,
        detail: result,
        currentRoute: '/admin/a/account/transaction-history',
      }
    );
  } catch (err) {
    console.error('getAdminTransactionDetails:', err);
    return reply(req, res, 500, {
      ok: false,
      success: false,
      error: 'SERVER_ERROR',
      message: 'Failed to load transaction details.',
    });
  } finally {
    if (client) client.release();
  }
};

exports.exportAdminTransactionHistory = async (req, res) => {
  let client;
  try {
    const access = requireAdmin(req);
    if (access.error) {
      return res.status(access.statusCode || 401).json({
        ok: false,
        success: false,
        error: access.error_code || 'UNAUTHORIZED',
        message: access.message || 'Admin access required.',
      });
    }

    client = await pool.connect();
    const filters = normalizeFilters(req);

    const [summaryData, breakdowns, transactions, recentTransactions, weeklyTransactions, weeklySeries, monthlySeries, orderSearchResult, productSearchResult] =
      await Promise.all([
        getAdminOverview(client, filters),
        getAdminBreakdowns(client, filters),
        fetchAdminTransactions(client, { ...filters, page: 1, limit: EXPORT_LIMIT }, EXPORT_LIMIT, 0),
        fetchAdminTransactions(client, { type: 'recent', sort: 'created_at', dir: 'desc', page: 1, limit: 10 }, 10, 0),
        fetchAdminTransactions(client, { ...filters, type: 'weekly', page: 1, limit: DEFAULT_LIMIT }, DEFAULT_LIMIT, 0),
        getAdminWeeklySeries(client, filters),
        getAdminMonthlySeries(client, filters),
        filters.order_number ? getAdminTransactionDetailsByRef(client, filters.order_number) : Promise.resolve(null),
        filters.product_query ? getAdminProductSearchResult(client, filters) : Promise.resolve(null),
      ]);

    return res.json({
      ok: true,
      success: true,
      message: 'Export data ready.',
      serverTime: new Date().toISOString(),
      data: {
        summaryData,
        statusBreakdown: breakdowns.statusBreakdown,
        paymentMethodBreakdown: breakdowns.paymentMethodBreakdown,
        gatewayBreakdown: breakdowns.gatewayBreakdown,
        transactions: transactions.rows,
        recentTransactions: recentTransactions.rows,
        weeklyTransactions: weeklyTransactions.rows,
        weeklySeries,
        monthlySeries,
        orderSearchResult,
        productSearchResult,
        filters,
      },
    });
  } catch (err) {
    console.error('exportAdminTransactionHistory:', err);
    return res.status(500).json({
      ok: false,
      success: false,
      error: 'SERVER_ERROR',
      message: 'Failed to prepare export data.',
    });
  } finally {
    if (client) client.release();
  }
};

exports.getAdminTransactionHistoryPageHtml = exports.getAdminTransactionHistoryPage;

// Backward-compatible aliases
exports.getTransactionHistoryPage = exports.getAdminTransactionHistoryPage;
exports.getTransactionHistoryData = exports.getAdminTransactionHistoryData;
exports.getTransactionHistorySummary = exports.getAdminTransactionHistorySummary;
exports.getTransactionDetails = exports.getAdminTransactionDetails;
exports.exportTransactionHistory = exports.exportAdminTransactionHistory;
exports.getTransactionHistoryItem = exports.getAdminTransactionDetails;

// Optional reusable exports
exports.formatMoney = formatMoney;
exports.safeDateLabel = safeDateLabel;
exports.safeDateOnlyLabel = safeDateOnlyLabel;
exports.resolveViewName = resolveViewName;
exports.renderSafe = renderSafe;
exports.normalizeFilters = normalizeFilters;
exports.buildSort = buildSort;
exports.buildTransactionWhere = buildTransactionWhere;
exports.fetchAdminTransactions = fetchAdminTransactions;
exports.getAdminOverview = getAdminOverview;
exports.getAdminBreakdowns = getAdminBreakdowns;
exports.getAdminTransactionDetailsByRef = getAdminTransactionDetailsByRef;
exports.getAdminProductSearchResult = getAdminProductSearchResult;
exports.buildAdminTransactionPageModel = buildAdminTransactionPageModel;
exports.getSessionAdmin = getSessionAdmin;
exports.requireAdmin = requireAdmin;
