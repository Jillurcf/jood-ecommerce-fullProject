"use strict";

const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
const { pool } = require("../../../includes/conn");

/**
 * =========================================================
 * ADMIN BILLING CONTROLLER
 * - searchable / filterable billing list
 * - billing overview cards
 * - user billing detail view
 * - chart data for live dashboard graphs
 * - PDF export
 * - realtime-ready endpoints for polling / socket refresh
 * =========================================================
 */

const ADMIN_VIEW = "admin/billing/index";
const ADMIN_DETAIL_VIEW = "admin/billing/detail";
const ADMIN_FALLBACK = "/admin/a/account/billing";

const PAID_STATUSES = ["paid", "completed", "captured"];
const REFUNDED_STATUSES = ["refunded", "refund", "partially_refunded"];
const PENDING_STATUSES = ["pending", "initiated"];

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const PDF_EXPORT_LIMIT = 500;

/**
 * =========================================================
 * BASIC HELPERS
 * =========================================================
 */
function wantsJson(req) {
  return Boolean(
    req.xhr ||
      String(req.headers?.accept || "").includes("application/json") ||
      String(req.headers?.["content-type"] || "").includes("application/json")
  );
}

function toNum(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function sanitizeText(v, max = 255) {
  if (v == null) return "";
  return String(v).trim().slice(0, max);
}

function sanitizeDate(v) {
  const s = sanitizeText(v, 30);
  if (!s) return "";
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

function safeDateTime(v) {
  if (!v) return "N/A";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "N/A";
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function safeDateOnly(v) {
  if (!v) return "N/A";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "N/A";
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

function buildLike(term) {
  return `%${String(term || "").toLowerCase()}%`;
}

function reply(req, res, statusCode, payload, redirectUrl = ADMIN_FALLBACK) {
  if (wantsJson(req)) {
    return res.status(statusCode).json(payload);
  }
  return res.redirect(redirectUrl);
}

function parsePagination(req, fallbackLimit = DEFAULT_LIMIT) {
  const page = Math.max(1, toNum(req.query?.page, 1));
  const limit = Math.min(MAX_LIMIT, Math.max(5, toNum(req.query?.limit, fallbackLimit)));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

function pickFirst(...values) {
  for (const v of values) {
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return "";
}

function textExpr(expr) {
  return `COALESCE(CAST(${expr} AS TEXT), '')`;
}

function userMatchExpr(userAlias = "u", orderAlias = "o") {
  return `${textExpr(`${orderAlias}.user_id`)} = ${textExpr(`${userAlias}.id`)}`;
}

/**
 * =========================================================
 * VIEW RESOLUTION
 * =========================================================
 */
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
      if (filePath && fs.existsSync(filePath)) {
        return clean;
      }
    }
  }

  return normalizeViewName(candidates[0] || ADMIN_VIEW);
}

function renderSafe(res, candidates, data) {
  const viewName = resolveViewName(res.app, candidates);
  return res.render(viewName, data);
}

/**
 * =========================================================
 * FILTER / SORT BUILDERS
 * =========================================================
 */
function buildBillingFilters(query = {}) {
  const where = [];
  const params = [];
  const add = (v) => {
    params.push(v);
    return `$${params.length}`;
  };

  const q = sanitizeText(query.q, 120);
  const paymentStatus = sanitizeText(query.payment_status, 40);
  const paymentMethod = sanitizeText(query.payment_method, 40);
  const orderStatus = sanitizeText(query.order_status, 40);
  const city = sanitizeText(query.city, 100);
  const country = sanitizeText(query.country, 100);
  const addressType = sanitizeText(query.address_type, 40);
  const dateFrom = sanitizeDate(query.date_from);
  const dateTo = sanitizeDate(query.date_to);
  const minTotal = query.min_total !== undefined && query.min_total !== "" ? toNum(query.min_total, null) : null;
  const maxTotal = query.max_total !== undefined && query.max_total !== "" ? toNum(query.max_total, null) : null;

  if (q) {
    const like = add(buildLike(q));
    where.push(`
      (
        LOWER(COALESCE(u.full_name, '')) LIKE ${like}
        OR LOWER(COALESCE(u.email, '')) LIKE ${like}
        OR LOWER(COALESCE(u.phone, '')) LIKE ${like}
        OR LOWER(COALESCE(u.address, '')) LIKE ${like}
        OR LOWER(COALESCE(u.city, '')) LIKE ${like}
        OR LOWER(COALESCE(u.country, '')) LIKE ${like}
        OR EXISTS (
          SELECT 1
          FROM orders o
          WHERE ${userMatchExpr("u", "o")}
            AND (
              LOWER(COALESCE(o.order_number, '')) LIKE ${like}
              OR LOWER(COALESCE(o.tracking_id, '')) LIKE ${like}
              OR LOWER(COALESCE(o.payment_reference, '')) LIKE ${like}
              OR LOWER(COALESCE(o.gateway_provider, '')) LIKE ${like}
              OR LOWER(COALESCE(o.payment_method, '')) LIKE ${like}
              OR LOWER(COALESCE(o.payment_status, '')) LIKE ${like}
              OR LOWER(COALESCE(o.order_status, '')) LIKE ${like}
            )
        )
      )
    `);
  }

  if (paymentStatus) {
    const p = add(paymentStatus);
    where.push(`
      EXISTS (
        SELECT 1
        FROM orders o
        WHERE ${userMatchExpr("u", "o")}
          AND o.payment_status = ${p}
      )
    `);
  }

  if (paymentMethod) {
    const p = add(paymentMethod);
    where.push(`
      EXISTS (
        SELECT 1
        FROM orders o
        WHERE ${userMatchExpr("u", "o")}
          AND o.payment_method = ${p}
      )
    `);
  }

  if (orderStatus) {
    const p = add(orderStatus);
    where.push(`
      EXISTS (
        SELECT 1
        FROM orders o
        WHERE ${userMatchExpr("u", "o")}
          AND o.order_status = ${p}
      )
    `);
  }

  if (city) {
    const p = add(city);
    where.push(`LOWER(COALESCE(u.city, '')) = LOWER(${p})`);
  }

  if (country) {
    const p = add(country);
    where.push(`LOWER(COALESCE(u.country, '')) = LOWER(${p})`);
  }

  if (addressType) {
    const p = add(addressType);
    where.push(`
      EXISTS (
        SELECT 1
        FROM user_addresses a
        WHERE COALESCE(a.user_id::text, '') = COALESCE(u.id::text, '')
          AND LOWER(COALESCE(a.address_type, '')) = LOWER(${p})
      )
    `);
  }

  if (dateFrom) {
    const p = add(dateFrom);
    where.push(`
      EXISTS (
        SELECT 1
        FROM orders o
        WHERE ${userMatchExpr("u", "o")}
          AND o.created_at::date >= ${p}::date
      )
    `);
  }

  if (dateTo) {
    const p = add(dateTo);
    where.push(`
      EXISTS (
        SELECT 1
        FROM orders o
        WHERE ${userMatchExpr("u", "o")}
          AND o.created_at::date <= ${p}::date
      )
    `);
  }

  if (minTotal !== null && Number.isFinite(minTotal)) {
    const p = add(minTotal);
    where.push(`
      EXISTS (
        SELECT 1
        FROM orders o
        WHERE ${userMatchExpr("u", "o")}
          AND o.grand_total >= ${p}
      )
    `);
  }

  if (maxTotal !== null && Number.isFinite(maxTotal)) {
    const p = add(maxTotal);
    where.push(`
      EXISTS (
        SELECT 1
        FROM orders o
        WHERE ${userMatchExpr("u", "o")}
          AND o.grand_total <= ${p}
      )
    `);
  }

  return {
    whereSql: where.length ? `WHERE ${where.join(" AND ")}` : "",
    params,
  };
}

function buildSort(query = {}) {
  const sort = sanitizeText(query.sort, 40).toLowerCase();
  const dir = sanitizeText(query.dir, 5).toLowerCase() === "asc" ? "ASC" : "DESC";

  const allowed = {
    id: `u.id ${dir}`,
    name: `u.full_name ${dir}`,
    email: `u.email ${dir}`,
    created_at: `u.created_at ${dir}`,
    updated_at: `u.updated_at ${dir}`,
    last_order_at: `last_order.created_at ${dir} NULLS LAST`,
    total_spent: `COALESCE(stats.total_spent, 0) ${dir}`,
    orders_paid: `COALESCE(stats.total_orders_paid, 0) ${dir}`,
    pending_payments: `COALESCE(stats.pending_payments, 0) ${dir}`,
  };

  return allowed[sort] || "u.id DESC";
}

function getExportFormat(req) {
  const format = sanitizeText(pickFirst(req.query?.format, req.body?.format), 20).toLowerCase();
  return ["pdf", "json"].includes(format) ? format : "pdf";
}

/**
 * =========================================================
 * SQL HELPERS
 * =========================================================
 */
async function getBillingOverview(client) {
  const summary = await client.query(
    `
    SELECT
      COUNT(*)::int AS total_users,
      COALESCE(COUNT(*) FILTER (
        WHERE EXISTS (
          SELECT 1
          FROM orders o
          WHERE ${userMatchExpr("u", "o")}
        )
      ), 0)::int AS users_with_orders,
      COALESCE(SUM(
        CASE
          WHEN EXISTS (
            SELECT 1
            FROM orders o
            WHERE ${userMatchExpr("u", "o")}
              AND o.payment_status = ANY($1)
          )
          THEN 1 ELSE 0
        END
      ), 0)::int AS paid_users,
      COALESCE((
        SELECT SUM(o.grand_total)
        FROM orders o
        WHERE o.payment_status = ANY($1)
      ), 0) AS total_revenue,
      COALESCE((
        SELECT SUM(o.grand_total)
        FROM orders o
        WHERE o.payment_status = ANY($2)
      ), 0) AS total_refunds,
      COALESCE((
        SELECT COUNT(*)
        FROM orders o
        WHERE o.payment_status = ANY($3)
      ), 0)::int AS pending_payments,
      COALESCE((
        SELECT COUNT(*)
        FROM orders o
      ), 0)::int AS total_orders,
      COALESCE((
        SELECT COUNT(*)
        FROM user_addresses a
      ), 0)::int AS total_addresses,
      COALESCE((
        SELECT SUM(o.grand_total)
        FROM orders o
        WHERE o.payment_status = ANY($1)
          AND o.created_at >= date_trunc('month', NOW())
      ), 0) AS this_month_revenue
    FROM customer_accounts u
    `,
    [PAID_STATUSES, REFUNDED_STATUSES, PENDING_STATUSES]
  );

  return {
    totalUsers: toNum(summary.rows[0]?.total_users, 0),
    usersWithOrders: toNum(summary.rows[0]?.users_with_orders, 0),
    paidUsers: toNum(summary.rows[0]?.paid_users, 0),
    totalRevenue: Number(summary.rows[0]?.total_revenue || 0),
    totalRefunds: Number(summary.rows[0]?.total_refunds || 0),
    pendingPayments: toNum(summary.rows[0]?.pending_payments, 0),
    totalOrders: toNum(summary.rows[0]?.total_orders, 0),
    totalAddresses: toNum(summary.rows[0]?.total_addresses, 0),
    thisMonthRevenue: Number(summary.rows[0]?.this_month_revenue || 0),
  };
}

async function getBillingChartData(client) {
  const monthly = await client.query(
    `
    SELECT
      to_char(date_trunc('month', o.created_at), 'YYYY-MM') AS month_key,
      to_char(date_trunc('month', o.created_at), 'Mon YYYY') AS month_label,
      COALESCE(SUM(CASE WHEN o.payment_status = ANY($1) THEN o.grand_total ELSE 0 END), 0) AS revenue,
      COALESCE(COUNT(*) FILTER (WHERE o.payment_status = ANY($1)), 0)::int AS paid_orders,
      COALESCE(COUNT(*) FILTER (WHERE o.payment_status = ANY($2)), 0)::int AS refunded_orders,
      COALESCE(COUNT(*) FILTER (WHERE o.payment_status = ANY($3)), 0)::int AS pending_orders
    FROM orders o
    WHERE o.created_at >= date_trunc('month', NOW()) - INTERVAL '11 months'
    GROUP BY 1, 2
    ORDER BY 1 ASC
    `,
    [PAID_STATUSES, REFUNDED_STATUSES, PENDING_STATUSES]
  );

  const byStatus = await client.query(
    `
    SELECT
      COALESCE(payment_status, 'unknown') AS payment_status,
      COUNT(*)::int AS count,
      COALESCE(SUM(grand_total), 0) AS total
    FROM orders
    GROUP BY COALESCE(payment_status, 'unknown')
    ORDER BY count DESC
    `
  );

  const byMethod = await client.query(
    `
    SELECT
      COALESCE(payment_method, 'unknown') AS payment_method,
      COUNT(*)::int AS count,
      COALESCE(SUM(grand_total), 0) AS total
    FROM orders
    GROUP BY COALESCE(payment_method, 'unknown')
    ORDER BY count DESC
    `
  );

  return {
    monthly: monthly.rows,
    byStatus: byStatus.rows,
    byMethod: byMethod.rows,
  };
}

async function getBillingRows(client, query = {}, limitOverride = null) {
  const { page, limit: pagedLimit, offset } = parsePagination({ query }, DEFAULT_LIMIT);
  const limit = Number.isFinite(limitOverride) ? Math.max(1, Math.min(MAX_LIMIT * 10, limitOverride)) : pagedLimit;

  const { whereSql, params } = buildBillingFilters(query);
  const orderBy = buildSort(query);

  const countSql = `
    SELECT COUNT(*)::int AS total
    FROM customer_accounts u
    ${whereSql}
  `;

  const rowsSql = `
    SELECT
      u.id,
      u.full_name,
      u.email,
      u.phone,
      u.address,
      u.city,
      u.country,
      u.bio,
      u.created_at,
      u.updated_at,

      COALESCE(stats.total_spent, 0) AS total_spent,
      COALESCE(stats.total_orders_paid, 0) AS total_orders_paid,
      COALESCE(stats.pending_payments, 0) AS pending_payments,
      COALESCE(stats.refund_total, 0) AS refund_total,
      COALESCE(stats.this_month_spent, 0) AS this_month_spent,
      COALESCE(stats.last_paid_at, NULL) AS last_paid_at,
      COALESCE(stats.first_order_at, NULL) AS first_order_at,

      last_order.order_number AS last_order_number,
      last_order.tracking_id AS last_tracking_id,
      last_order.created_at AS last_order_at,
      last_order.grand_total AS last_order_total,
      last_order.currency AS last_order_currency,
      last_order.payment_method AS last_payment_method,
      last_order.payment_status AS last_payment_status,
      last_order.order_status AS last_order_status,
      last_order.payment_reference AS last_payment_reference,
      last_order.gateway_provider AS last_gateway_provider,

      COALESCE(addresses.addresses, '[]'::json) AS addresses
    FROM customer_accounts u

    LEFT JOIN LATERAL (
      SELECT
        COALESCE(SUM(CASE WHEN o.payment_status = ANY($${params.length + 1}) THEN o.grand_total ELSE 0 END), 0) AS total_spent,
        COALESCE(COUNT(CASE WHEN o.payment_status = ANY($${params.length + 1}) THEN 1 END), 0) AS total_orders_paid,
        COALESCE(COUNT(CASE WHEN o.payment_status = ANY($${params.length + 3}) THEN 1 END), 0) AS pending_payments,
        COALESCE(SUM(CASE WHEN o.payment_status = ANY($${params.length + 2}) THEN o.grand_total ELSE 0 END), 0) AS refund_total,
        COALESCE(SUM(CASE WHEN o.payment_status = ANY($${params.length + 1}) AND o.created_at >= date_trunc('month', NOW()) THEN o.grand_total ELSE 0 END), 0) AS this_month_spent,
        MAX(CASE WHEN o.payment_status = ANY($${params.length + 1}) THEN o.created_at ELSE NULL END) AS last_paid_at,
        MIN(o.created_at) AS first_order_at
      FROM orders o
      WHERE ${userMatchExpr("u", "o")}
    ) stats ON TRUE

    LEFT JOIN LATERAL (
      SELECT
        o.order_number,
        o.tracking_id,
        o.created_at,
        o.grand_total,
        o.currency,
        o.payment_method,
        o.payment_status,
        o.order_status,
        o.payment_reference,
        o.gateway_provider
      FROM orders o
      WHERE ${userMatchExpr("u", "o")}
      ORDER BY o.created_at DESC, o.id DESC
      LIMIT 1
    ) last_order ON TRUE

    LEFT JOIN LATERAL (
      SELECT json_agg(a.* ORDER BY COALESCE(a.is_default, false) DESC, a.id DESC) AS addresses
      FROM user_addresses a
      WHERE COALESCE(a.user_id::text, '') = COALESCE(u.id::text, '')
    ) addresses ON TRUE

    ${whereSql}
    ORDER BY ${orderBy}
    LIMIT $${params.length + 4} OFFSET $${params.length + 5}
  `;

  const countParams = [...params];
  const rowsParams = [...params, PAID_STATUSES, REFUNDED_STATUSES, PENDING_STATUSES, limit, offset];

  const totalRes = await client.query(countSql, countParams);
  const rowsRes = await client.query(rowsSql, rowsParams);

  return {
    total: toNum(totalRes.rows[0]?.total, 0),
    page,
    limit,
    rows: rowsRes.rows,
  };
}

async function getBillingUserDetail(client, userId) {
  const userKey = sanitizeText(userId, 120);

  const userRes = await client.query(
    `
    SELECT
      id,
      full_name,
      email,
      phone,
      address,
      city,
      country,
      bio,
      created_at,
      updated_at
    FROM customer_accounts
    WHERE COALESCE(id::text, '') = $1::text
    LIMIT 1
    `,
    [userKey]
  );

  const user = userRes.rows[0] || null;
  if (!user) return null;

  const statsRes = await client.query(
    `
    SELECT
      COALESCE(SUM(CASE WHEN payment_status = ANY($2) THEN grand_total ELSE 0 END), 0) AS total_spent,
      COALESCE(COUNT(CASE WHEN payment_status = ANY($2) THEN 1 END), 0) AS total_orders_paid,
      COALESCE(COUNT(CASE WHEN payment_status = ANY($4) THEN 1 END), 0) AS pending_payments,
      COALESCE(SUM(CASE WHEN payment_status = ANY($3) THEN grand_total ELSE 0 END), 0) AS refund_total,
      COALESCE(SUM(CASE WHEN payment_status = ANY($2) AND created_at >= date_trunc('month', NOW()) THEN grand_total ELSE 0 END), 0) AS this_month_spent,
      COALESCE(MIN(created_at), NULL) AS first_order_at,
      COALESCE(MAX(created_at), NULL) AS last_order_at
    FROM orders
    WHERE COALESCE(user_id::text, '') = $1::text
    `,
    [userKey, PAID_STATUSES, REFUNDED_STATUSES, PENDING_STATUSES]
  );

  const addressesRes = await client.query(
    `
    SELECT *
    FROM user_addresses
    WHERE COALESCE(user_id::text, '') = $1::text
    ORDER BY COALESCE(is_default, false) DESC, id DESC
    `,
    [userKey]
  );

  const ordersRes = await client.query(
    `
    SELECT
      id,
      order_number,
      tracking_id,
      grand_total,
      currency,
      payment_method,
      payment_status,
      order_status,
      payment_reference,
      gateway_provider,
      created_at,
      updated_at
    FROM orders
    WHERE COALESCE(user_id::text, '') = $1::text
    ORDER BY created_at DESC, id DESC
    LIMIT 100
    `,
    [userKey]
  );

  const paymentMethodsRes = await client.query(
    `
    SELECT
      COALESCE(payment_method, 'unknown') AS payment_method,
      COUNT(*)::int AS count,
      COALESCE(SUM(grand_total), 0) AS total
    FROM orders
    WHERE COALESCE(user_id::text, '') = $1::text
    GROUP BY COALESCE(payment_method, 'unknown')
    ORDER BY count DESC
    `,
    [userKey]
  );

  const statusBreakdownRes = await client.query(
    `
    SELECT
      COALESCE(payment_status, 'unknown') AS payment_status,
      COUNT(*)::int AS count,
      COALESCE(SUM(grand_total), 0) AS total
    FROM orders
    WHERE COALESCE(user_id::text, '') = $1::text
    GROUP BY COALESCE(payment_status, 'unknown')
    ORDER BY count DESC
    `,
    [userKey]
  );

  return {
    user,
    stats: {
      totalSpent: Number(statsRes.rows[0]?.total_spent || 0),
      totalOrdersPaid: toNum(statsRes.rows[0]?.total_orders_paid, 0),
      pendingPayments: toNum(statsRes.rows[0]?.pending_payments, 0),
      refundTotal: Number(statsRes.rows[0]?.refund_total || 0),
      thisMonthSpent: Number(statsRes.rows[0]?.this_month_spent || 0),
      firstOrderAt: statsRes.rows[0]?.first_order_at || null,
      lastOrderAt: statsRes.rows[0]?.last_order_at || null,
    },
    addresses: addressesRes.rows || [],
    orders: ordersRes.rows || [],
    paymentMethods: paymentMethodsRes.rows || [],
    statusBreakdown: statusBreakdownRes.rows || [],
  };
}

/**
 * =========================================================
 * PDF EXPORT HELPERS
 * =========================================================
 */
function createPdfHeader(doc, title, subtitle = "") {
  doc.fontSize(20).text(title, { align: "center" });
  if (subtitle) {
    doc.moveDown(0.25);
    doc.fontSize(10).fillColor("#666666").text(subtitle, { align: "center" });
  }
  doc.moveDown(1);
  doc.fillColor("#000000");
}

function createPdfSection(doc, heading) {
  doc.moveDown(0.4);
  doc.fontSize(13).text(heading, { underline: true });
  doc.moveDown(0.25);
}

function pdfLabelValue(doc, label, value, x, y, labelWidth = 120, valueWidth = 350) {
  doc.fontSize(9).fillColor("#444444").text(label, x, y, { width: labelWidth });
  doc.fontSize(9).fillColor("#000000").text(String(value ?? "N/A"), x + labelWidth, y, { width: valueWidth });
}

function drawTableRow(doc, y, colX, colWidths, values, options = {}) {
  const rowHeight = options.rowHeight || 18;
  const fontSize = options.fontSize || 8;
  const fill = options.fill || "#000000";

  doc.fontSize(fontSize).fillColor(fill);
  values.forEach((value, index) => {
    const x = colX[index];
    const w = colWidths[index];
    doc.text(String(value ?? ""), x, y, { width: w, ellipsis: true });
  });

  return y + rowHeight;
}

async function buildBillingPdfBuffer({ overview, chartData, rows, filters, generatedAt }) {
  return await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 28 });
    const chunks = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    createPdfHeader(doc, "Admin Billing Report", `Generated at: ${generatedAt}`);

    createPdfSection(doc, "Overview");
    const overviewItems = [
      ["Total Users", overview.totalUsers],
      ["Users With Orders", overview.usersWithOrders],
      ["Paid Users", overview.paidUsers],
      ["Total Orders", overview.totalOrders],
      ["Pending Payments", overview.pendingPayments],
      ["Total Addresses", overview.totalAddresses],
      ["Total Revenue", formatMoney(overview.totalRevenue)],
      ["Total Refunds", formatMoney(overview.totalRefunds)],
      ["This Month Revenue", formatMoney(overview.thisMonthRevenue)],
    ];

    let y = doc.y + 8;
    const col1X = 40;
    const col2X = 300;
    const col3X = 560;
    overviewItems.forEach((item, index) => {
      const rowY = y + Math.floor(index / 3) * 28;
      const colX = index % 3 === 0 ? col1X : index % 3 === 1 ? col2X : col3X;
      pdfLabelValue(doc, `${item[0]}:`, item[1], colX, rowY, 140, 160);
    });

    doc.y = y + 58;

    createPdfSection(doc, "Applied Filters");
    const filterText =
      Object.entries(filters || {})
        .filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== "")
        .map(([k, v]) => `${k}: ${v}`)
        .join(" | ") || "None";
    doc.fontSize(9).text(filterText, { width: 760 });

    if (chartData?.monthly?.length) {
      doc.moveDown(0.7);
      createPdfSection(doc, "Monthly Revenue Snapshot");
      chartData.monthly.slice(-12).forEach((m) => {
        doc.fontSize(9).text(
          `${m.month_label} — Revenue: ${formatMoney(m.revenue)} | Paid Orders: ${m.paid_orders} | Pending: ${m.pending_orders} | Refunded: ${m.refunded_orders}`
        );
      });
    }

    doc.addPage({ size: "A4", layout: "landscape", margin: 28 });
    createPdfHeader(doc, "Billing Rows");

    const headers = [
      "ID",
      "Name",
      "Email",
      "City",
      "Country",
      "Total Spent",
      "Paid Orders",
      "Pending",
      "Last Order",
      "Last Payment Status",
    ];
    const colX = [30, 70, 200, 340, 410, 500, 610, 670, 735, 820];
    const colWidths = [35, 120, 130, 65, 70, 85, 45, 35, 75, 90];

    doc.fontSize(8).fillColor("#111111");
    drawTableRow(doc, doc.y + 2, colX, colWidths, headers, { rowHeight: 16, fontSize: 8 });
    doc.moveTo(28, doc.y + 2).lineTo(1020, doc.y + 2).strokeColor("#cccccc").stroke();

    let rowY = doc.y + 10;
    rows.forEach((row, idx) => {
      if (rowY > 520) {
        doc.addPage({ size: "A4", layout: "landscape", margin: 28 });
        rowY = 40;
        drawTableRow(doc, rowY, colX, colWidths, headers, { rowHeight: 16, fontSize: 8 });
        rowY += 20;
      }

      const values = [
        row.id,
        row.full_name || "",
        row.email || "",
        row.city || "",
        row.country || "",
        formatMoney(row.total_spent, row.last_order_currency || "AED"),
        row.total_orders_paid,
        row.pending_payments,
        row.last_order_number || row.last_tracking_id || "-",
        row.last_payment_status || "-",
      ];

      rowY = drawTableRow(doc, rowY, colX, colWidths, values, { rowHeight: 18, fontSize: 8 });
      if (idx < rows.length - 1) rowY += 1;
    });

    doc.end();
  });
}

/**
 * =========================================================
 * CONTROLLERS
 * =========================================================
 */
exports.getAdminBillingPage = async (req, res) => {
  let client;

  try {
    client = await pool.connect();

    const overview = await getBillingOverview(client);
    const chartData = await getBillingChartData(client);
    const list = await getBillingRows(client, req.query || {});

    return renderSafe(
      res,
      [
        ADMIN_VIEW,
        "admin/a/account/billing",
        "admin/billing",
        "billing/index"
      ],
      {
        title: "Admin Billing",

        overview,
        chartData,

        billingRows: list.rows,

        pagination: {
          page: list.page,
          limit: list.limit,
          total: list.total,
          totalPages: Math.max(
            1,
            Math.ceil(list.total / list.limit)
          ),
        },

        filters: req.query || {},

        currentRoute: "/admin/a/account/billing",

        currentBillingRoute: "/admin/a/account/billing",

        realtimeEndpoint:
          "/admin/a/account/billing/realtime",

        exportEndpoint:
          "/admin/a/account/billing/export/pdf",
      }
    );

  } catch (err) {

    console.error("getAdminBillingPage:", err);

    return res.redirect(ADMIN_FALLBACK);

  } finally {

    if (client) client.release();

  }
};

exports.getAdminBillingData = async (req, res) => {
  let client;
  try {
    client = await pool.connect();

    const overview = await getBillingOverview(client);
    const list = await getBillingRows(client, req.query || {});

    return res.json({
      ok: true,
      success: true,
      serverTime: new Date().toISOString(),
      overview,
      data: list.rows,
      pagination: {
        page: list.page,
        limit: list.limit,
        total: list.total,
        totalPages: Math.max(1, Math.ceil(list.total / list.limit)),
      },
    });
  } catch (err) {
    console.error("getAdminBillingData:", err);
    return res.status(500).json({
      ok: false,
      success: false,
      error: "SERVER_ERROR",
      message: "Failed to load billing data.",
    });
  } finally {
    if (client) client.release();
  }
};

exports.getAdminBillingRealtimeData = async (req, res) => {
  let client;
  try {
    client = await pool.connect();

    const overview = await getBillingOverview(client);
    const chartData = await getBillingChartData(client);
    const list = await getBillingRows(client, req.query || {});

    return res.json({
      ok: true,
      success: true,
      realtime: true,
      serverTime: new Date().toISOString(),
      overview,
      chartData,
      data: list.rows,
      pagination: {
        page: list.page,
        limit: list.limit,
        total: list.total,
        totalPages: Math.max(1, Math.ceil(list.total / list.limit)),
      },
    });
  } catch (err) {
    console.error("getAdminBillingRealtimeData:", err);
    return res.status(500).json({
      ok: false,
      success: false,
      error: "SERVER_ERROR",
      message: "Failed to load realtime billing data.",
    });
  } finally {
    if (client) client.release();
  }
};

exports.getAdminBillingChartData = async (req, res) => {
  let client;
  try {
    client = await pool.connect();
    const chartData = await getBillingChartData(client);

    return res.json({
      ok: true,
      success: true,
      serverTime: new Date().toISOString(),
      data: chartData,
    });
  } catch (err) {
    console.error("getAdminBillingChartData:", err);
    return res.status(500).json({
      ok: false,
      success: false,
      error: "SERVER_ERROR",
      message: "Failed to load billing chart data.",
    });
  } finally {
    if (client) client.release();
  }
};

exports.getAdminBillingDetail = async (req, res) => {
  let client;
  try {
    const userId = sanitizeText(req.params?.id, 120);
    if (!userId) {
      return reply(req, res, 400, {
        ok: false,
        success: false,
        error: "INVALID_USER_ID",
        message: "Invalid billing user id.",
      });
    }

    client = await pool.connect();
    const detail = await getBillingUserDetail(client, userId);

    if (!detail) {
      return reply(req, res, 404, {
        ok: false,
        success: false,
        error: "NOT_FOUND",
        message: "Billing profile not found.",
      });
    }

    if (wantsJson(req)) {
      return res.json({ ok: true, success: true, data: detail });
    }

    return renderSafe(res, [ADMIN_DETAIL_VIEW, "admin/a/account/billing-detail", "admin/billing/detail"], {
      title: `Billing Detail - ${detail.user.full_name || detail.user.email || "User"}`,
      detail,
      currentRoute: "/admin/a/account/billing",
    });
  } catch (err) {
    console.error("getAdminBillingDetail:", err);
    return reply(req, res, 500, {
      ok: false,
      success: false,
      error: "SERVER_ERROR",
      message: "Failed to load billing detail.",
    });
  } finally {
    if (client) client.release();
  }
};

exports.exportAdminBillingPdf = async (req, res) => {
  let client;
  try {
    client = await pool.connect();

    const overview = await getBillingOverview(client);
    const chartData = await getBillingChartData(client);
    const list = await getBillingRows(client, req.query || {}, PDF_EXPORT_LIMIT);

    const generatedAt = new Date().toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    const pdfBuffer = await buildBillingPdfBuffer({
      overview,
      chartData,
      rows: list.rows,
      filters: req.query || {},
      generatedAt,
    });

    const fileName = `billing-report-${new Date().toISOString().slice(0, 10)}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.setHeader("Content-Length", pdfBuffer.length);
    return res.end(pdfBuffer);
  } catch (err) {
    console.error("exportAdminBillingPdf:", err);
    return reply(req, res, 500, {
      ok: false,
      success: false,
      error: "SERVER_ERROR",
      message: "Failed to export PDF.",
    });
  } finally {
    if (client) client.release();
  }
};

exports.getAdminBillingSummary = async (req, res) => {
  let client;
  try {
    client = await pool.connect();
    const overview = await getBillingOverview(client);
    return res.json({
      ok: true,
      success: true,
      serverTime: new Date().toISOString(),
      data: overview,
    });
  } catch (err) {
    console.error("getAdminBillingSummary:", err);
    return res.status(500).json({
      ok: false,
      success: false,
      error: "SERVER_ERROR",
      message: "Failed to load billing summary.",
    });
  } finally {
    if (client) client.release();
  }
};

/**
 * =========================================================
 * OPTIONAL EXPORTS FOR REUSE
 * =========================================================
 */
exports.getBillingOverview = getBillingOverview;
exports.getBillingChartData = getBillingChartData;
exports.getBillingRows = getBillingRows;
exports.getBillingUserDetail = getBillingUserDetail;
exports.buildBillingFilters = buildBillingFilters;
exports.buildSort = buildSort;
exports.formatMoney = formatMoney;
exports.safeDateTime = safeDateTime;
exports.safeDateOnly = safeDateOnly;
exports.resolveViewName = resolveViewName;
exports.renderSafe = renderSafe;