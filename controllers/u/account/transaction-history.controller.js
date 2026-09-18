'use strict';

const { pool } = require('../../../includes/conn');

/**
 * transaction-history.controller.js
 *
 * Secure transaction history controller for:
 * - SSR transaction history page
 * - JSON transaction history data
 * - single order / tracking lookup
 * - summary data for dashboard cards and charts
 * - export-ready payloads for PDF / Excel on the frontend
 *
 * Supports:
 * - logged-in user access
 * - guest token access
 * - safe PostgreSQL parameterized queries
 * - separate order search and product search
 */

const ACCOUNT_VIEW = 'customer/u/account/transaction-history';
const FALLBACK_REDIRECT = '/';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;
const DEFAULT_SORT = 'desc';

const PAID_STATUSES = ['paid', 'completed', 'captured'];
const PENDING_STATUSES = ['pending', 'initiated', 'pending_payment'];
const REFUNDED_STATUSES = ['refunded', 'refund', 'partially_refunded'];

function wantsJson(req) {
  return Boolean(
    req.xhr ||
      String(req.headers?.accept || '').includes('application/json') ||
      String(req.headers?.['content-type'] || '').includes('application/json')
  );
}

function reply(req, res, statusCode, payload, redirectUrl = FALLBACK_REDIRECT) {
  if (wantsJson(req)) {
    return res.status(statusCode).json(payload);
  }
  return res.redirect(redirectUrl);
}

function redirectHome(req, res) {
  if (wantsJson(req)) {
    return res.status(401).json({
      ok: false,
      success: false,
      error: 'AUTH_REQUIRED',
      message: 'Authentication or guest access required.',
    });
  }
  return res.redirect('/');
}

function sanitizeText(v, max = 255) {
  if (v == null) return '';
  return String(v).trim().slice(0, max);
}

function sanitizeOrderRef(v) {
  return sanitizeText(v, 60);
}

function sanitizeProductQuery(v) {
  return sanitizeText(v, 120);
}

function toNum(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function toInt(v, d = 0) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : d;
}

function clampInt(v, min, max, fallback) {
  const n = toInt(v, fallback);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

function parseDate(value) {
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

function getCurrentUserId(req) {
  const id = req.session?.user?.id ?? req.session?.userId ?? req.user?.id ?? null;
  const userId = Number(id);
  return Number.isFinite(userId) && userId > 0 ? userId : null;
}

function getGuestToken(req) {
  return (
    sanitizeText(req.headers?.['x-guest-token'], 200) ||
    sanitizeText(req.query?.guest_token, 200) ||
    sanitizeText(req.cookies?.guest_token, 200) ||
    sanitizeText(req.cookies?.guest_wishlist_token, 200) ||
    ''
  );
}

function resolveIdentity(req) {
  const userId = getCurrentUserId(req);
  const guestToken = getGuestToken(req);

  if (!userId && !guestToken) {
    return {
      error: true,
      message: 'Authentication or guest access required.',
      error_code: 'AUTH_REQUIRED',
    };
  }

  return {
    error: false,
    userId,
    guestToken: guestToken || null,
  };
}

function buildOwnershipClause(access, alias = 'o', startIndex = 1) {
  const params = [];

  if (access.userId && access.guestToken) {
    return {
      sql: `(${alias}.user_id = $${startIndex} OR ${alias}.guest_token = $${startIndex + 1})`,
      params: [access.userId, access.guestToken],
      nextIndex: startIndex + 2,
    };
  }

  if (access.userId) {
    return {
      sql: `${alias}.user_id = $${startIndex}`,
      params: [access.userId],
      nextIndex: startIndex + 1,
    };
  }

  return {
    sql: `${alias}.guest_token = $${startIndex}`,
    params: [access.guestToken],
    nextIndex: startIndex + 1,
  };
}

function normalizeFilters(req) {
  return {
    page: clampInt(req.query?.page, 1, 1000000, 1),
    limit: clampInt(req.query?.limit, 1, MAX_LIMIT, DEFAULT_LIMIT),
    sort: String(req.query?.sort || DEFAULT_SORT).toLowerCase() === 'asc' ? 'asc' : 'desc',
    status: sanitizeText(req.query?.status, 40).toLowerCase(),
    payment_method: sanitizeText(req.query?.payment_method || req.query?.paymentMethod, 40).toLowerCase(),
    gateway_provider: sanitizeText(req.query?.gateway_provider || req.query?.gatewayProvider, 40).toLowerCase(),
    from: sanitizeText(req.query?.from, 30),
    to: sanitizeText(req.query?.to, 30),
    q: sanitizeText(req.query?.q, 80),
    order_number: sanitizeOrderRef(req.query?.order_number || req.query?.orderNumber),
    product_query: sanitizeProductQuery(req.query?.product_query || req.query?.productQuery),
    type: sanitizeText(req.query?.type, 20).toLowerCase(),
  };
}

function buildQueryClauses(access, filters, alias = 'o', startIndex = 1) {
  const ownership = buildOwnershipClause(access, alias, startIndex);
  const clauses = [ownership.sql];
  const params = [...ownership.params];
  let idx = ownership.nextIndex;

  if (filters.from) {
    clauses.push(`${alias}.created_at >= $${idx++}::timestamptz`);
    params.push(filters.from);
  }

  if (filters.to) {
    clauses.push(`${alias}.created_at <= $${idx++}::timestamptz`);
    params.push(filters.to);
  }

  if (filters.status) {
    clauses.push(`COALESCE(LOWER(${alias}.payment_status), '') = $${idx++}`);
    params.push(filters.status);
  }

  if (filters.payment_method) {
    clauses.push(`COALESCE(LOWER(${alias}.payment_method), '') = $${idx++}`);
    params.push(filters.payment_method);
  }

  if (filters.gateway_provider) {
    clauses.push(`COALESCE(LOWER(${alias}.gateway_provider), '') = $${idx++}`);
    params.push(filters.gateway_provider);
  }

  if (filters.q) {
    clauses.push(`(
      ${alias}.order_number ILIKE $${idx}
      OR COALESCE(${alias}.tracking_id, '') ILIKE $${idx}
      OR COALESCE(${alias}.payment_reference, '') ILIKE $${idx}
      OR COALESCE(${alias}.customer_name, '') ILIKE $${idx}
    )`);
    params.push(`%${filters.q}%`);
    idx += 1;
  }

  if (filters.type === 'weekly') {
    clauses.push(`${alias}.created_at >= NOW() - INTERVAL '7 days'`);
  }

  return { whereSql: clauses.join(' AND '), params, nextIndex: idx };
}

function mapOrderRow(row) {
  return {
    id: row.id,
    order_number: row.order_number || null,
    tracking_id: row.tracking_id || null,
    title: row.order_number || row.tracking_id || 'Transaction',
    customer_name: row.customer_name || null,
    amount: Number(row.grand_total || 0),
    currency: row.currency || 'AED',
    payment_method: row.payment_method || null,
    payment_status: row.payment_status || null,
    order_status: row.order_status || null,
    gateway_provider: row.gateway_provider || null,
    payment_reference: row.payment_reference || null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
    created_at_label: safeDateLabel(row.created_at),
    updated_at_label: safeDateLabel(row.updated_at),
    detail_url: row.order_number
      ? `/customer/u/account/transaction-history?order_number=${encodeURIComponent(row.order_number)}`
      : null,
    transaction_type: 'order',
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
    currency: 'AED',
    lastOrder: null,
  };
}

async function getUser(client, userId) {
  const r = await client.query(
    `
    SELECT *
    FROM customer_accounts
    WHERE id = $1
    LIMIT 1
    `,
    [userId]
  );
  return r.rows[0] || null;
}

async function fetchOrders(client, access, filters, limitOverride = null, offsetOverride = null) {
  const queryFilters = { ...filters };
  if (queryFilters.type === 'recent') {
    queryFilters.limit = 10;
  }
  if (queryFilters.type === 'weekly') {
    queryFilters.limit = queryFilters.limit || DEFAULT_LIMIT;
  }

  const ownership = buildOwnershipClause(access, 'o', 1);
  const params = [...ownership.params];
  let idx = ownership.nextIndex;
  const clauses = [ownership.sql];

  if (queryFilters.from) {
    clauses.push(`o.created_at >= $${idx++}::timestamptz`);
    params.push(queryFilters.from);
  }

  if (queryFilters.to) {
    clauses.push(`o.created_at <= $${idx++}::timestamptz`);
    params.push(queryFilters.to);
  }

  if (queryFilters.status) {
    clauses.push(`COALESCE(LOWER(o.payment_status), '') = $${idx++}`);
    params.push(queryFilters.status);
  }

  if (queryFilters.payment_method) {
    clauses.push(`COALESCE(LOWER(o.payment_method), '') = $${idx++}`);
    params.push(queryFilters.payment_method);
  }

  if (queryFilters.gateway_provider) {
    clauses.push(`COALESCE(LOWER(o.gateway_provider), '') = $${idx++}`);
    params.push(queryFilters.gateway_provider);
  }

  if (queryFilters.q) {
    clauses.push(`(
      o.order_number ILIKE $${idx}
      OR COALESCE(o.tracking_id, '') ILIKE $${idx}
      OR COALESCE(o.payment_reference, '') ILIKE $${idx}
      OR COALESCE(o.customer_name, '') ILIKE $${idx}
    )`);
    params.push(`%${queryFilters.q}%`);
    idx += 1;
  }

  if (queryFilters.type === 'weekly') {
    clauses.push(`o.created_at >= NOW() - INTERVAL '7 days'`);
  }

  const whereSql = clauses.join(' AND ');
  const sortDir = queryFilters.sort === 'asc' ? 'ASC' : 'DESC';
  const limit = limitOverride ?? queryFilters.limit ?? DEFAULT_LIMIT;
  const page = queryFilters.page || 1;
  const offset = offsetOverride ?? ((page - 1) * limit);

  const dataSql = `
    SELECT
      o.id,
      o.order_number,
      o.tracking_id,
      o.customer_name,
      o.created_at,
      o.updated_at,
      o.grand_total,
      o.currency,
      o.payment_method,
      o.payment_status,
      o.order_status,
      o.gateway_provider,
      o.payment_reference
    FROM orders o
    WHERE ${whereSql}
    ORDER BY o.created_at ${sortDir}, o.id ${sortDir}
    LIMIT $${idx++} OFFSET $${idx++}
  `;

  const countSql = `
    SELECT COUNT(*)::int AS total
    FROM orders o
    WHERE ${whereSql}
  `;

  const [dataRes, countRes] = await Promise.all([
    client.query(dataSql, [...params, limit, offset]),
    client.query(countSql, params),
  ]);

  return {
    rows: (dataRes.rows || []).map(mapOrderRow),
    total: countRes.rows[0]?.total || 0,
  };
}

async function getSummary(client, access) {
  const ownership = buildOwnershipClause(access, 'o', 1);
  const params = [...ownership.params];
  const whereSql = ownership.sql;

  const summaryRes = await client.query(
    `
    SELECT
      COALESCE(COUNT(*)::int, 0) AS total_count,
      COALESCE(SUM(o.grand_total), 0) AS total_amount,
      COALESCE(COUNT(CASE WHEN o.payment_status = ANY($${ownership.nextIndex}::text[]) THEN 1 END), 0) AS paid_count,
      COALESCE(COUNT(CASE WHEN o.payment_status IN ('pending', 'initiated', 'pending_payment') THEN 1 END), 0) AS pending_count,
      COALESCE(COUNT(CASE WHEN o.payment_status = ANY($${ownership.nextIndex + 1}::text[]) THEN 1 END), 0) AS refunded_count,
      COALESCE(SUM(CASE
        WHEN o.payment_status = ANY($${ownership.nextIndex}::text[])
         AND o.created_at >= date_trunc('month', NOW())
        THEN o.grand_total ELSE 0 END), 0) AS this_month_spent
    FROM orders o
    WHERE ${whereSql}
    `,
    [...params, PAID_STATUSES, REFUNDED_STATUSES]
  );

  const lastOrderRes = await client.query(
    `
    SELECT
      o.id,
      o.order_number,
      o.tracking_id,
      o.customer_name,
      o.created_at,
      o.updated_at,
      o.grand_total,
      o.currency,
      o.payment_method,
      o.payment_status,
      o.order_status,
      o.gateway_provider,
      o.payment_reference
    FROM orders o
    WHERE ${whereSql}
    ORDER BY o.created_at DESC, o.id DESC
    LIMIT 1
    `,
    params
  );

  return {
    totalCount: Number(summaryRes.rows[0]?.total_count || 0),
    totalAmount: Number(summaryRes.rows[0]?.total_amount || 0),
    paidCount: Number(summaryRes.rows[0]?.paid_count || 0),
    pendingCount: Number(summaryRes.rows[0]?.pending_count || 0),
    refundedCount: Number(summaryRes.rows[0]?.refunded_count || 0),
    thisMonthSpent: Number(summaryRes.rows[0]?.this_month_spent || 0),
    currency: lastOrderRes.rows[0]?.currency || 'AED',
    lastOrder: lastOrderRes.rows[0] ? mapOrderRow(lastOrderRes.rows[0]) : null,
  };
}

async function getWeeklySeries(client, access) {
  const ownership = buildOwnershipClause(access, 'o', 1);
  const params = [...ownership.params, PAID_STATUSES];
  const whereSql = `${ownership.sql} AND o.payment_status = ANY($${ownership.nextIndex}::text[]) AND o.created_at >= NOW() - INTERVAL '7 days'`;

  const r = await client.query(
    `
    SELECT
      TO_CHAR(date_trunc('day', o.created_at), 'Dy') AS label,
      COALESCE(SUM(o.grand_total), 0) AS amount
    FROM orders o
    WHERE ${whereSql}
    GROUP BY date_trunc('day', o.created_at)
    ORDER BY date_trunc('day', o.created_at) ASC
    `,
    params
  );

  return r.rows || [];
}

async function getWeeklyTransactions(client, access) {
  return fetchOrders(
    client,
    access,
    { page: 1, limit: MAX_LIMIT, sort: 'desc', type: 'weekly' },
    MAX_LIMIT,
    0
  );
}

async function getRecentTransactions(client, access) {
  return fetchOrders(
    client,
    access,
    { page: 1, limit: 10, sort: 'desc', type: 'recent' },
    10,
    0
  );
}

async function getOrderSearchResult(client, access, orderRef) {
  const ref = sanitizeOrderRef(orderRef);
  if (!ref) return null;

  const ownership = buildOwnershipClause(access, 'o', 1);
  const params = [...ownership.params, ref];
  const whereSql = `${ownership.sql} AND (o.order_number = $${ownership.nextIndex} OR o.tracking_id = $${ownership.nextIndex})`;

  const r = await client.query(
    `
    SELECT
      o.id,
      o.order_number,
      o.tracking_id,
      o.customer_name,
      o.created_at,
      o.updated_at,
      o.grand_total,
      o.currency,
      o.payment_method,
      o.payment_status,
      o.order_status,
      o.gateway_provider,
      o.payment_reference,
      o.billing_address,
      o.shipping_address,
      o.notes
    FROM orders o
    WHERE ${whereSql}
    LIMIT 1
    `,
    params
  );

  return r.rows[0] ? mapOrderRow(r.rows[0]) : null;
}

async function getProductSearchResult(client, access, productQuery) {
  const q = sanitizeProductQuery(productQuery);
  if (!q) return null;

  const isNumeric = /^\d+$/.test(q);
  const ownership = buildOwnershipClause(access, 'o', 1);

  let sql = '';
  let params = [...ownership.params];
  let idx = ownership.nextIndex;

  if (isNumeric) {
    sql = `
      SELECT
        COALESCE(p.id, oi.product_id)::int AS product_id,
        COALESCE(p.name, oi.product_name, 'Product') AS product_name,
        COUNT(DISTINCT o.id)::int AS transaction_count,
        COALESCE(SUM(o.grand_total), 0) AS amount,
        COALESCE(o.currency, 'AED') AS currency
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      LEFT JOIN products p ON p.id = oi.product_id
      WHERE ${ownership.sql}
        AND oi.product_id = $${idx}
      GROUP BY COALESCE(p.id, oi.product_id), COALESCE(p.name, oi.product_name, 'Product'), COALESCE(o.currency, 'AED')
      ORDER BY amount DESC, transaction_count DESC
      LIMIT 1
    `;
    params.push(Number(q));
  } else {
    sql = `
      SELECT
        COALESCE(p.id, oi.product_id)::int AS product_id,
        COALESCE(p.name, oi.product_name, 'Product') AS product_name,
        COUNT(DISTINCT o.id)::int AS transaction_count,
        COALESCE(SUM(o.grand_total), 0) AS amount,
        COALESCE(o.currency, 'AED') AS currency
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      LEFT JOIN products p ON p.id = oi.product_id
      WHERE ${ownership.sql}
        AND (
          COALESCE(p.name, oi.product_name, '') ILIKE $${idx}
          OR COALESCE(oi.variant_name, '') ILIKE $${idx}
        )
      GROUP BY COALESCE(p.id, oi.product_id), COALESCE(p.name, oi.product_name, 'Product'), COALESCE(o.currency, 'AED')
      ORDER BY amount DESC, transaction_count DESC
      LIMIT 1
    `;
    params.push(`%${q}%`);
  }

  const r = await client.query(sql, params);
  const row = r.rows[0] || null;
  if (!row) return null;

  return {
    product_id: row.product_id,
    product_name: row.product_name,
    count: Number(row.transaction_count || 0),
    amount: Number(row.amount || 0),
    currency: row.currency || 'AED',
  };
}

async function getTransactionDetailsByRef(client, access, orderRef) {
  const ref = sanitizeOrderRef(orderRef);
  if (!ref) return null;

  const ownership = buildOwnershipClause(access, 'o', 1);
  const params = [...ownership.params, ref];
  const whereSql = `${ownership.sql} AND (o.order_number = $${ownership.nextIndex} OR o.tracking_id = $${ownership.nextIndex})`;

  const orderRes = await client.query(
    `
    SELECT
      o.id,
      o.order_number,
      o.tracking_id,
      o.user_id,
      o.guest_token,
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
      o.billing_address,
      o.shipping_address,
      o.notes
    FROM orders o
    WHERE ${whereSql}
    LIMIT 1
    `,
    params
  );

  const order = orderRes.rows[0];
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
      oi.created_at
    FROM order_items oi
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
    },
    items: itemsRes.rows || [],
  };
}

function buildBaseViewData(req, data = {}) {
  return {
    user: null,
    customer: null,
    profile: null,
    csrfToken: req.csrfToken ? req.csrfToken() : '',
    guestToken: null,
    guestTokenSource: null,
    guestTokenDetected: false,
    guestTokenCandidates: null,
    guestTokenNote: null,

    transactionRows: [],
    transactions: [],
    allTransactionsData: [],
    recentTransactionsData: [],
    weeklyTransactionsData: [],
    weeklySeriesData: [],

    summaryData: buildEmptySummary(),
    transactionSummary: buildEmptySummary(),
    paymentSummary: buildEmptySummary(),

    orderSearchResult: null,
    productSearchResult: null,

    queryOrderNumber: '',
    queryProductId: '',
    filters: {
      page: 1,
      limit: DEFAULT_LIMIT,
      sort: DEFAULT_SORT,
      status: '',
      payment_method: '',
      gateway_provider: '',
      from: '',
      to: '',
      q: '',
      order_number: '',
      product_query: '',
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

    successMessage: '',
    errorMessage: '',
    currentRoute: '/customer/u/account/transaction-history',
    ...data,
  };
}

async function buildTransactionPageModel(req, client, access) {
  const filters = normalizeFilters(req);

  const [user, summary, allTransactions, recentTransactions, weeklyTransactions, weeklySeries, orderSearchResult, productSearchResult] =
    await Promise.all([
      access.userId ? getUser(client, access.userId) : Promise.resolve(null),
      getSummary(client, access),
      fetchOrders(client, access, filters),
      getRecentTransactions(client, access),
      getWeeklyTransactions(client, access),
      getWeeklySeries(client, access),
      filters.order_number ? getOrderSearchResult(client, access, filters.order_number) : Promise.resolve(null),
      filters.product_query ? getProductSearchResult(client, access, filters.product_query) : Promise.resolve(null),
    ]);

  const total = allTransactions.total || 0;
  const pagination = {
    page: filters.page,
    limit: filters.limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / filters.limit)),
    hasPrev: filters.page > 1,
    hasNext: filters.page < Math.max(1, Math.ceil(total / filters.limit)),
    prevPage: filters.page > 1 ? filters.page - 1 : null,
    nextPage: filters.page < Math.max(1, Math.ceil(total / filters.limit)) ? filters.page + 1 : null,
  };

  const userSafe = user || null;

  return {
    user: userSafe,
    customer: userSafe,
    profile: userSafe
      ? {
          id: userSafe.id ?? null,
          name: sanitizeText(userSafe.full_name || userSafe.name || userSafe.username, 150),
          email: sanitizeText(userSafe.email, 150),
          phone: sanitizeText(userSafe.phone || userSafe.mobile || userSafe.whatsapp, 30),
          company_name: sanitizeText(userSafe.company_name, 150),
        }
      : null,

    guestToken: access.guestToken || null,
    guestTokenDetected: !!access.guestToken,
    guestTokenSource: access.guestToken ? 'request' : null,
    guestTokenCandidates: {
      header: sanitizeText(req.headers?.['x-guest-token'], 200) || null,
      query: sanitizeText(req.query?.guest_token, 200) || null,
      cookie_guest_token: sanitizeText(req.cookies?.guest_token, 200) || null,
      cookie_guest_wishlist_token: sanitizeText(req.cookies?.guest_wishlist_token, 200) || null,
    },
    guestTokenNote: access.guestToken
      ? 'Guest token found'
      : 'No guest token found. For guest access, pass it through header, query, or cookie.',

    transactionRows: allTransactions.rows,
    transactions: allTransactions.rows,
    allTransactionsData: allTransactions.rows,
    recentTransactionsData: recentTransactions.rows,
    weeklyTransactionsData: weeklyTransactions.rows,
    weeklySeriesData: weeklySeries,

    summaryData: summary,
    transactionSummary: summary,
    paymentSummary: summary,

    orderSearchResult,
    productSearchResult,

    queryOrderNumber: filters.order_number || '',
    queryProductId: filters.product_query || '',
    filters,
    pagination,

    successMessage: '',
    errorMessage: '',
    currentRoute: '/customer/u/account/transaction-history',
    csrfToken: req.csrfToken ? req.csrfToken() : '',
  };
}

exports.getTransactionHistoryPage = async (req, res) => {
  let client;
  try {
    const access = resolveIdentity(req);
    if (access.error) {
      return redirectHome(req, res);
    }

    client = await pool.connect();
    const model = await buildTransactionPageModel(req, client, access);

    return res.render(
      ACCOUNT_VIEW,
      buildBaseViewData(req, {
        ...model,
      })
    );
  } catch (err) {
    console.error('GET TRANSACTION HISTORY PAGE ERROR:', err && err.stack ? err.stack : err);
    return res.redirect('/');
  } finally {
    if (client) client.release();
  }
};

exports.getTransactionHistoryData = async (req, res) => {
  let client;
  try {
    const access = resolveIdentity(req);
    if (access.error) {
      return res.status(401).json({
        ok: false,
        success: false,
        error: access.error_code || 'AUTH_REQUIRED',
        message: access.message || 'Authentication required.',
      });
    }

    client = await pool.connect();
    const model = await buildTransactionPageModel(req, client, access);

    return res.json({
      ok: true,
      success: true,
      data: {
        transactionRows: model.transactionRows,
        transactions: model.transactions,
        allTransactionsData: model.allTransactionsData,
        recentTransactionsData: model.recentTransactionsData,
        weeklyTransactionsData: model.weeklyTransactionsData,
        weeklySeriesData: model.weeklySeriesData,
        summaryData: model.summaryData,
        transactionSummary: model.transactionSummary,
        paymentSummary: model.paymentSummary,
        orderSearchResult: model.orderSearchResult,
        productSearchResult: model.productSearchResult,
        queryOrderNumber: model.queryOrderNumber,
        queryProductId: model.queryProductId,
        filters: model.filters,
        pagination: model.pagination,
        user: model.user,
        customer: model.customer,
        profile: model.profile,
        csrfToken: model.csrfToken,
      },
    });
  } catch (err) {
    console.error('GET TRANSACTION HISTORY DATA ERROR:', err && err.stack ? err.stack : err);
    return res.status(500).json({
      ok: false,
      success: false,
      error: 'SERVER_ERROR',
      message: 'Failed to load transaction history data.',
    });
  } finally {
    if (client) client.release();
  }
};

exports.getTransactionDetails = async (req, res) => {
  let client;
  try {
    const access = resolveIdentity(req);
    if (access.error) {
      return redirectHome(req, res);
    }

    const orderRef = sanitizeOrderRef(req.params.orderNumber || req.params.order_number || req.query.order_number);
    if (!orderRef) {
      return reply(req, res, 400, {
        ok: false,
        success: false,
        error: 'INVALID_INPUT',
        message: 'Order number or tracking ID is required.',
      });
    }

    client = await pool.connect();

    const result = await getTransactionDetailsByRef(client, access, orderRef);

    if (!result) {
      return reply(req, res, 404, {
        ok: false,
        success: false,
        error: 'NOT_FOUND',
        message: 'Transaction not found.',
      });
    }

    return res.json({
      ok: true,
      success: true,
      data: result,
    });
  } catch (err) {
    console.error('GET TRANSACTION DETAILS ERROR:', err && err.stack ? err.stack : err);
    return res.status(500).json({
      ok: false,
      success: false,
      error: 'SERVER_ERROR',
      message: 'Failed to load transaction details.',
    });
  } finally {
    if (client) client.release();
  }
};

exports.getTransactionHistorySummary = async (req, res) => {
  let client;
  try {
    const access = resolveIdentity(req);
    if (access.error) {
      return res.status(401).json({
        ok: false,
        success: false,
        error: access.error_code || 'AUTH_REQUIRED',
        message: access.message || 'Authentication required.',
      });
    }

    client = await pool.connect();
    const summary = await getSummary(client, access);
    const weeklySeries = await getWeeklySeries(client, access);

    return res.json({
      ok: true,
      success: true,
      data: {
        summary,
        weeklySeries,
      },
    });
  } catch (err) {
    console.error('GET TRANSACTION SUMMARY ERROR:', err && err.stack ? err.stack : err);
    return res.status(500).json({
      ok: false,
      success: false,
      error: 'SERVER_ERROR',
      message: 'Failed to load transaction summary.',
    });
  } finally {
    if (client) client.release();
  }
};

exports.exportTransactionHistory = async (req, res) => {
  let client;
  try {
    const access = resolveIdentity(req);
    if (access.error) {
      return res.status(401).json({
        ok: false,
        success: false,
        error: access.error_code || 'AUTH_REQUIRED',
        message: access.message || 'Authentication required.',
      });
    }

    client = await pool.connect();

    const filters = normalizeFilters(req);
    const [summary, allTransactions, recentTransactions, weeklyTransactions, weeklySeries, orderSearchResult, productSearchResult] =
      await Promise.all([
        getSummary(client, access),
        fetchOrders(client, access, { ...filters, page: 1, limit: MAX_LIMIT }, MAX_LIMIT, 0),
        getRecentTransactions(client, access),
        getWeeklyTransactions(client, access),
        getWeeklySeries(client, access),
        filters.order_number ? getOrderSearchResult(client, access, filters.order_number) : Promise.resolve(null),
        filters.product_query ? getProductSearchResult(client, access, filters.product_query) : Promise.resolve(null),
      ]);

    return res.json({
      ok: true,
      success: true,
      data: {
        summary,
        allTransactions: allTransactions.rows,
        recentTransactions: recentTransactions.rows,
        weeklyTransactions: weeklyTransactions.rows,
        weeklySeries,
        orderSearchResult,
        productSearchResult,
        filters,
      },
      message: 'Export data ready.',
    });
  } catch (err) {
    console.error('EXPORT TRANSACTION HISTORY ERROR:', err && err.stack ? err.stack : err);
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

exports.getTransactionHistoryItem = exports.getTransactionDetails;
exports.getTransactionHistoryPage = exports.getTransactionHistoryPage;
exports.getTransactionHistoryData = exports.getTransactionHistoryData;
exports.getTransactionHistorySummary = exports.getTransactionHistorySummary;
exports.exportTransactionHistory = exports.exportTransactionHistory;