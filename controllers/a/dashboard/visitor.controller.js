"use strict";

const pool = require("../../../includes/conn");
const ordersController = require("../orders.controller");
/**
 * =========================================================
 * HELPERS
 * =========================================================
 */

const toInt = (value, fallback = 1) => {
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const clampLimit = (value, fallback = 10) => {
  const n = toInt(value, fallback);
  return Math.min(Math.max(n, 10), 100);
};

const safeRows = (result) => (Array.isArray(result?.rows) ? result.rows : []);

const safeNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const normalizeVisitorKey = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    return decodeURIComponent(raw).replace(/\0/g, "");
  } catch {
    return raw.replace(/\0/g, "");
  }
};

const isValidRange = (range) =>
  ["hour", "day", "week", "month", "year"].includes(String(range || "").toLowerCase());

/**
 * =========================================================
 * SQL
 * =========================================================
 * Notes:
 * - Main list comes from `visitors`
 * - Detail modal comes from `page_visits`
 * - `city` is read directly from `v.city`
 */

const VISITOR_LIST_SQL = `
  SELECT
    v.id,
    v.visitor_key,
    v.ip_address,
    v.country,
    v.city AS city,
    v.first_visit,
    v.last_visit,
    COALESCE(v.visit_count, 0)::int AS db_visit_count,
    COALESCE(v.area, '') AS area,

    COALESCE(pv.page_visit_count, 0)::int AS page_visit_count,
    pv.first_page_visit,
    pv.last_page_visit,
    pv.last_visited_at,
    pv.last_page_url,
    LEFT(COALESCE(pv.user_agent, ''), 500) AS user_agent
  FROM visitors v
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*)::int AS page_visit_count,
      MIN(visited_at) AS first_page_visit,
      MAX(visited_at) AS last_page_visit,
      MAX(visited_at) AS last_visited_at,
      (
        SELECT p2.url
        FROM page_visits p2
        WHERE p2.visitor_key = v.visitor_key
        ORDER BY p2.visited_at DESC, p2.id DESC
        LIMIT 1
      ) AS last_page_url,
      (
        SELECT p2.user_agent
        FROM page_visits p2
        WHERE p2.visitor_key = v.visitor_key
        ORDER BY p2.visited_at DESC, p2.id DESC
        LIMIT 1
      ) AS user_agent
    FROM page_visits pv
    WHERE pv.visitor_key = v.visitor_key
  ) pv ON TRUE
  ORDER BY COALESCE(v.last_visit, pv.last_visited_at, v.first_visit) DESC NULLS LAST, v.id DESC
  LIMIT $1 OFFSET $2
`;

const VISITOR_TOTAL_SQL = `
  SELECT COUNT(*)::int AS total
  FROM visitors
`;

const VISITOR_STATS_SQL = `
  SELECT
    COUNT(*)::int AS total_visitors,
    COALESCE((SELECT COUNT(*)::int FROM page_visits), 0)::int AS total_page_visits
  FROM visitors
`;

/**
 * =========================================================
 * VISITOR DETAIL SQL
 * =========================================================
 */

const VISITOR_DETAIL_ROW_SQL = `
  SELECT
    v.id,
    v.visitor_key,
    v.ip_address,
    v.country,
    v.city AS city,
    v.first_visit,
    v.last_visit,
    COALESCE(v.visit_count, 0)::int AS db_visit_count,
    COALESCE(v.area, '') AS area
  FROM visitors v
  WHERE v.visitor_key = $1
  LIMIT 1
`;

const VISITOR_DETAIL_STATS_SQL = `
  SELECT
    COUNT(*)::int AS total_visits,
    MIN(visited_at) AS first_visit,
    MAX(visited_at) AS last_visit,
    MAX(ip_address) AS ip_address
  FROM page_visits
  WHERE visitor_key = $1
`;

const VISITOR_DETAIL_LAST_SQL = `
  SELECT
    url AS last_page_url,
    LEFT(COALESCE(user_agent, ''), 500) AS user_agent,
    method AS last_method,
    visited_at AS last_visited_at,
    ip_address AS last_ip_address
  FROM page_visits
  WHERE visitor_key = $1
  ORDER BY visited_at DESC, id DESC
  LIMIT 1
`;

const VISITOR_DETAIL_VISITS_SQL = `
  SELECT
    id,
    url,
    method,
    ip_address,
    LEFT(COALESCE(user_agent, ''), 500) AS user_agent,
    visited_at
  FROM page_visits
  WHERE visitor_key = $1
  ORDER BY visited_at DESC, id DESC
  LIMIT $2 OFFSET $3
`;

const VISITOR_DETAIL_VISITS_TOTAL_SQL = `
  SELECT COUNT(*)::int AS total
  FROM page_visits
  WHERE visitor_key = $1
`;

/**
 * =========================================================
 * DASHBOARD DATA LOADER
 * =========================================================
 */

async function loadDashboardVisitors(page, limit) {
  const safePage = toInt(page, 1);
  const safeLimit = clampLimit(limit, 10);
  const offset = (safePage - 1) * safeLimit;

  const [visitorsRes, totalRes, statsRes] = await Promise.all([
    pool.query(VISITOR_LIST_SQL, [safeLimit, offset]),
    pool.query(VISITOR_TOTAL_SQL),
    pool.query(VISITOR_STATS_SQL),
  ]);

  const visitors = safeRows(visitorsRes);
  const totalRows = safeNumber(totalRes?.rows?.[0]?.total);
  const stats = statsRes?.rows?.[0] || {};

  const totalPages = Math.max(1, Math.ceil(totalRows / safeLimit));

  return {
    visitors,
    stats: {
      totalVisitors: safeNumber(stats.total_visitors),
      totalPageVisits: safeNumber(stats.total_page_visits),
    },
    pagination: {
      page: safePage,
      limit: safeLimit,
      totalPages,
      totalRows,
      hasPrev: safePage > 1,
      hasNext: safePage < totalPages,
    },
  };
}

/**
 * =========================================================
 * DASHBOARD PAGE (SSR)
 * GET /dashboard/visitors
 * =========================================================
 */
async function dashboardPage(req, res, next) {
  try {
    const page = toInt(req.query.page, 1);
    const limit = clampLimit(req.query.limit, 10);

    const data = await loadDashboardVisitors(page, limit);

    return res.render("admin/a/account/dashboard", {
      title: "Visitor Dashboard",
      stats: data.stats,
      visitors: data.visitors,
      pagination: data.pagination,
      user: res.locals.user || req.user || null,
      query: req.query,
      pageLimitOptions: [10, 20, 50, 100],
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("dashboardPage error:", error);
    return next(error);
  }
}

/**
 * =========================================================
 * VISITORS LIST API
 * GET /api/visitors
 * =========================================================
 */
async function getVisitors(req, res, next) {
  try {
    const page = toInt(req.query.page, 1);
    const limit = clampLimit(req.query.limit, 10);

    const data = await loadDashboardVisitors(page, limit);

    return res.json({
      success: true,
      generatedAt: new Date().toISOString(),
      stats: data.stats,
      visitors: data.visitors,
      pagination: data.pagination,
    });
  } catch (error) {
    console.error("getVisitors error:", error);
    return next(error);
  }
}

/**
 * =========================================================
 * VISITOR CHART API
 * GET /api/visitors/chart
 * =========================================================
 * Returns consistent labels even when there are empty time slots.
 */
async function getVisitorChart(req, res, next) {
  try {
    const range = String(req.query.range || "day").toLowerCase();

    if (!isValidRange(range)) {
      return res.status(400).json({
        success: false,
        message: "Invalid range. Use hour, day, week, month, or year.",
      });
    }

    let sql;

    if (range === "year") {
      sql = `
        WITH months AS (
          SELECT generate_series(
            date_trunc('month', NOW()) - INTERVAL '11 months',
            date_trunc('month', NOW()),
            INTERVAL '1 month'
          ) AS bucket
        )
        SELECT
          TO_CHAR(m.bucket, 'Mon YYYY') AS label,
          COALESCE(COUNT(pv.id), 0)::int AS total
        FROM months m
        LEFT JOIN page_visits pv
          ON date_trunc('month', pv.visited_at) = m.bucket
        GROUP BY m.bucket
        ORDER BY m.bucket
      `;
    } else if (range === "month") {
      sql = `
        WITH days AS (
          SELECT generate_series(
            date_trunc('day', NOW()) - INTERVAL '29 days',
            date_trunc('day', NOW()),
            INTERVAL '1 day'
          ) AS bucket
        )
        SELECT
          TO_CHAR(d.bucket, 'DD Mon') AS label,
          COALESCE(COUNT(pv.id), 0)::int AS total
        FROM days d
        LEFT JOIN page_visits pv
          ON date_trunc('day', pv.visited_at) = d.bucket
        GROUP BY d.bucket
        ORDER BY d.bucket
      `;
    } else if (range === "week") {
      sql = `
        WITH days AS (
          SELECT generate_series(
            date_trunc('day', NOW()) - INTERVAL '6 days',
            date_trunc('day', NOW()),
            INTERVAL '1 day'
          ) AS bucket
        )
        SELECT
          TO_CHAR(d.bucket, 'Dy') AS label,
          COALESCE(COUNT(pv.id), 0)::int AS total
        FROM days d
        LEFT JOIN page_visits pv
          ON date_trunc('day', pv.visited_at) = d.bucket
        GROUP BY d.bucket
        ORDER BY d.bucket
      `;
    } else if (range === "hour") {
      sql = `
        WITH hours AS (
          SELECT generate_series(
            date_trunc('hour', NOW()) - INTERVAL '23 hours',
            date_trunc('hour', NOW()),
            INTERVAL '1 hour'
          ) AS bucket
        )
        SELECT
          TO_CHAR(h.bucket, 'HH24:00') AS label,
          COALESCE(COUNT(pv.id), 0)::int AS total
        FROM hours h
        LEFT JOIN page_visits pv
          ON date_trunc('hour', pv.visited_at) = h.bucket
        GROUP BY h.bucket
        ORDER BY h.bucket
      `;
    } else {
      sql = `
        WITH hours AS (
          SELECT generate_series(
            date_trunc('hour', NOW()) - INTERVAL '23 hours',
            date_trunc('hour', NOW()),
            INTERVAL '1 hour'
          ) AS bucket
        )
        SELECT
          TO_CHAR(h.bucket, 'HH24:00') AS label,
          COALESCE(COUNT(pv.id), 0)::int AS total
        FROM hours h
        LEFT JOIN page_visits pv
          ON date_trunc('hour', pv.visited_at) = h.bucket
        GROUP BY h.bucket
        ORDER BY h.bucket
      `;
    }

    const rows = safeRows(await pool.query(sql));
    const labels = rows.map((r) => r.label);
    const values = rows.map((r) => safeNumber(r.total));

    return res.json({
      success: true,
      range,
      labels,
      values,
      total: values.reduce((a, b) => a + b, 0),
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("getVisitorChart error:", error);
    return next(error);
  }
}

/**
 * =========================================================
 * VISITOR DETAILS API
 * GET /visitors/:visitorKey/visits
 * =========================================================
 */
async function getVisitorDetails(req, res, next) {
  try {
    const key = normalizeVisitorKey(req.params.visitorKey);

    if (!key) {
      return res.status(400).json({
        success: false,
        message: "Missing visitorKey",
      });
    }

    const page = toInt(req.query.page, 1);
    const limit = clampLimit(req.query.limit, 20);
    const offset = (page - 1) * limit;

    const [visitorRes, statsRes, lastRes, visitsRes, totalRes] = await Promise.all([
      pool.query(VISITOR_DETAIL_ROW_SQL, [key]),
      pool.query(VISITOR_DETAIL_STATS_SQL, [key]),
      pool.query(VISITOR_DETAIL_LAST_SQL, [key]),
      pool.query(VISITOR_DETAIL_VISITS_SQL, [key, limit, offset]),
      pool.query(VISITOR_DETAIL_VISITS_TOTAL_SQL, [key]),
    ]);

    const visitor = visitorRes?.rows?.[0] || null;
    const stats = statsRes?.rows?.[0] || {};
    const lastVisit = lastRes?.rows?.[0] || {};
    const visits = safeRows(visitsRes);
    const total = safeNumber(totalRes?.rows?.[0]?.total);

    if (!visitor && total === 0) {
      return res.status(404).json({
        success: false,
        message: "Visitor not found",
        visitor_key: key,
      });
    }

    const totalPages = Math.max(1, Math.ceil(total / limit));

    return res.json({
      success: true,
      generatedAt: new Date().toISOString(),
      visitor: visitor
        ? {
            id: visitor.id,
            visitor_key: visitor.visitor_key,
            ip_address: visitor.ip_address,
            country: visitor.country,
            city: visitor.city,
            first_visit: visitor.first_visit,
            last_visit: visitor.last_visit,
            visit_count: safeNumber(visitor.db_visit_count),
            area: visitor.area,
          }
        : { visitor_key: key },
      summary: {
        total_visits: safeNumber(stats.total_visits || 0),
        first_visit: stats.first_visit || visitor?.first_visit || null,
        last_visit: stats.last_visit || visitor?.last_visit || null,
        ip_address: lastVisit.last_ip_address || stats.ip_address || visitor?.ip_address || null,
        country: visitor?.country || null,
        city: visitor?.city || null,
        area: visitor?.area || null,
        last_page_url: lastVisit.last_page_url || null,
        user_agent: lastVisit.user_agent || null,
        last_method: lastVisit.last_method || null,
        last_visited_at: lastVisit.last_visited_at || null,
      },
      visits,
      pagination: {
        page,
        limit,
        totalPages,
        totalRows: total,
        hasPrev: page > 1,
        hasNext: page < totalPages,
      },
    });
  } catch (error) {
    console.error("getVisitorDetails error:", error);
    return next(error);
  }
}
/**
 * =========================================================
 * EXPORTS
 * =========================================================
 */
module.exports = {
  dashboardPage,
  getVisitors,
  getVisitorChart,
  getVisitorDetails,
  loadDashboardVisitors,
};