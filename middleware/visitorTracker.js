const axios = require("axios");
const crypto = require("crypto");
const pool = require("../includes/conn");

const GEO_TIMEOUT_MS = 3000;
const RECENT_HIT_WINDOW_MS = 5000; // ignore same URL re-hit inside this window
const CLEANUP_INTERVAL_MS = 60 * 1000; // cleanup memory cache every minute

// In-memory dedupe cache:
// key = `${visitorKey}|${url}`
// value = timestamp (ms)
const recentPageHits = new Map();

function cleanupRecentHits() {
  const now = Date.now();
  for (const [key, ts] of recentPageHits.entries()) {
    if (now - ts > RECENT_HIT_WINDOW_MS) {
      recentPageHits.delete(key);
    }
  }
}

// Keep memory small
setInterval(cleanupRecentHits, CLEANUP_INTERVAL_MS).unref();

function normalizeIp(ip) {
  if (!ip) return "";
  ip = String(ip).trim();

  if (ip.startsWith("::ffff:")) {
    ip = ip.replace("::ffff:", "");
  }

  if (ip.startsWith("[") && ip.endsWith("]")) {
    ip = ip.slice(1, -1);
  }

  return ip;
}

function isLocalIp(ip) {
  ip = normalizeIp(ip);

  return (
    !ip ||
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip === "localhost" ||
    ip.startsWith("127.") ||
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    ip.startsWith("172.16.") ||
    ip.startsWith("172.17.") ||
    ip.startsWith("172.18.") ||
    ip.startsWith("172.19.") ||
    ip.startsWith("172.20.") ||
    ip.startsWith("172.21.") ||
    ip.startsWith("172.22.") ||
    ip.startsWith("172.23.") ||
    ip.startsWith("172.24.") ||
    ip.startsWith("172.25.") ||
    ip.startsWith("172.26.") ||
    ip.startsWith("172.27.") ||
    ip.startsWith("172.28.") ||
    ip.startsWith("172.29.") ||
    ip.startsWith("172.30.") ||
    ip.startsWith("172.31.")
  );
}

function getClientIp(req) {
  const candidates = [];

  const xff = req.headers["x-forwarded-for"];
  if (xff) {
    candidates.push(
      ...String(xff)
        .split(",")
        .map((ip) => normalizeIp(ip))
        .filter(Boolean)
    );
  }

  const xRealIp = req.headers["x-real-ip"];
  if (xRealIp) candidates.push(normalizeIp(xRealIp));

  const cfConnectingIp = req.headers["cf-connecting-ip"];
  if (cfConnectingIp) candidates.push(normalizeIp(cfConnectingIp));

  if (req.ip) candidates.push(normalizeIp(req.ip));
  if (req.socket?.remoteAddress) candidates.push(normalizeIp(req.socket.remoteAddress));

  const publicIp = candidates.find((ip) => ip && !isLocalIp(ip));
  return publicIp || candidates.find(Boolean) || "";
}

function normalizePath(url) {
  if (!url) return "/";
  let path = String(url).split("?")[0].trim();

  if (!path.startsWith("/")) path = `/${path}`;
  if (path.length > 1) path = path.replace(/\/+$/, "");

  return path || "/";
}

function getReferrerPath(req) {
  const ref = req.headers.referer || req.headers.referrer || "";
  if (!ref) return "";

  try {
    const u = new URL(ref);
    return normalizePath(u.pathname || "/");
  } catch {
    return "";
  }
}

function shouldTrack(url) {
  if (!url) return false;

  // Ignore non-page requests
  if (url.startsWith("/socket.io")) return false;
  if (url === "/favicon.ico") return false;
  if (url.startsWith("/uploads")) return false;

  if (/\.(css|js|png|jpg|jpeg|gif|svg|ico|woff|woff2|map|txt|json)$/i.test(url)) {
    return false;
  }

  // Ignore API/AJAX endpoints
  if (
    url.startsWith("/api/") ||
    url.includes("/api/") ||
    url.startsWith("/customer/cart") ||
    url.startsWith("/customer/wishlist") ||
    url.startsWith("/wishlist") ||
    url.startsWith("/customer/variant-product") ||
    url.startsWith("/search")
  ) {
    return false;
  }

  return true;
}

async function getGeo(ip) {
  ip = normalizeIp(ip);

  if (isLocalIp(ip)) {
    return { country: "Unknown", city: "Unknown", area: "Unknown" };
  }

  try {
    const res = await axios.get(`https://ipwho.is/${encodeURIComponent(ip)}`, {
      timeout: GEO_TIMEOUT_MS,
    });

    if (res.data?.success) {
      return {
        country: res.data.country || "Unknown",
        city: res.data.city || "Unknown",
        area: res.data.region || "Unknown",
      };
    }
  } catch (err) {
    console.error("Geo lookup failed (ipwho.is):", err.message);
  }

  try {
    const res = await axios.get(`http://ip-api.com/json/${encodeURIComponent(ip)}`, {
      timeout: GEO_TIMEOUT_MS,
    });

    if (res.data?.status === "success") {
      return {
        country: res.data.country || "Unknown",
        city: res.data.city || "Unknown",
        area: res.data.regionName || "Unknown",
      };
    }
  } catch (err) {
    console.error("Geo lookup failed (ip-api):", err.message);
  }

  return { country: "Unknown", city: "Unknown", area: "Unknown" };
}

function shouldIgnoreAsRefreshOrDuplicate(visitorKey, currentPath, refererPath) {
  // 1) Same page refresh or same-page re-request from browser
  if (refererPath && refererPath === currentPath) {
    return true;
  }

  // 2) Immediate same URL hit (double request / redirect loop / re-hit)
  const cacheKey = `${visitorKey}|${currentPath}`;
  const lastHitAt = recentPageHits.get(cacheKey);
  const now = Date.now();

  if (lastHitAt && now - lastHitAt < RECENT_HIT_WINDOW_MS) {
    return true;
  }

  return false;
}

const visitorTracker = async (req, res, next) => {
  try {
    // Only track normal page navigation
    if (req.method !== "GET") return next();

    const rawUrl = normalizePath(req.originalUrl || req.url || "");
    if (!shouldTrack(rawUrl)) return next();

    const refererPath = getReferrerPath(req);
    const ip = getClientIp(req);
    const ua = req.headers["user-agent"] || "Unknown";

    const visitorKey = crypto
      .createHash("md5")
      .update(`${ip}|${ua}`)
      .digest("hex");

    // Ignore refreshes and immediate same-URL repeats
    if (shouldIgnoreAsRefreshOrDuplicate(visitorKey, rawUrl, refererPath)) {
      return next();
    }

    const now = new Date();
    const geo = await getGeo(ip);

    // Mark this page as recently seen before DB work to avoid double-hit races
    recentPageHits.set(`${visitorKey}|${rawUrl}`, Date.now());

    // Save / update visitor
    await pool.query(
      `INSERT INTO visitors
       (visitor_key, ip_address, country, city, area, last_visit, visit_count)
       VALUES ($1,$2,$3,$4,$5,$6,1)
       ON CONFLICT (visitor_key)
       DO UPDATE SET
         last_visit = EXCLUDED.last_visit,
         ip_address = EXCLUDED.ip_address,
         country = EXCLUDED.country,
         city = EXCLUDED.city,
         area = EXCLUDED.area,
         visit_count = visitors.visit_count + 1`,
      [visitorKey, ip, geo.country, geo.city, geo.area, now]
    );

    // Save only real page navigation
    const pageInsert = await pool.query(
      `INSERT INTO page_visits
       (visitor_key, url, method, user_agent, visited_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [visitorKey, rawUrl, req.method, ua, now]
    );

    const io = req.app.get("io");
    if (io) {
      io.emit("page_visit", {
        id: pageInsert.rows?.[0]?.id || null,
        visitorKey,
        url: rawUrl,
        method: req.method,
        ip,
        country: geo.country,
        city: geo.city,
        area: geo.area,
        userAgent: ua,
        visitedAt: now,
      });
    }

    return next();
  } catch (err) {
    console.error("Visitor middleware error:", err);
    return next();
  }
};

module.exports = visitorTracker;