import crypto from "crypto";
import { prisma } from "../lib/prisma.js";
import { emitPageVisit } from "../lib/emit.js";
const GEO_TIMEOUT_MS = 3e3;
const RECENT_HIT_WINDOW_MS = 5e3;
const CLEANUP_INTERVAL_MS = 6e4;
const recentPageHits = /* @__PURE__ */ new Map();
function cleanupRecentHits() {
  const now = Date.now();
  for (const [key, ts] of recentPageHits.entries()) {
    if (now - ts > RECENT_HIT_WINDOW_MS) recentPageHits.delete(key);
  }
}
const cleanupTimer = setInterval(cleanupRecentHits, CLEANUP_INTERVAL_MS);
if (cleanupTimer.unref) cleanupTimer.unref();
function normalizeIp(ip) {
  if (!ip) return "";
  let s = String(ip).trim();
  if (s.startsWith("::ffff:")) s = s.slice(7);
  if (s.startsWith("[") && s.endsWith("]")) s = s.slice(1, -1);
  return s;
}
function isLocalIp(ip) {
  if (!ip) return true;
  if (ip === "127.0.0.1" || ip === "::1" || ip === "localhost") return true;
  if (ip.startsWith("127.")) return true;
  if (ip.startsWith("10.")) return true;
  if (ip.startsWith("192.168.")) return true;
  const parts = ip.split(".");
  if (parts[0] === "172" && parts[1]) {
    const second = parseInt(parts[1], 10);
    if (second >= 16 && second <= 31) return true;
  }
  return false;
}
function getClientIp(req) {
  const candidates = [];
  const xff = req.headers["x-forwarded-for"];
  if (xff) {
    candidates.push(
      ...String(xff).split(",").map((s) => normalizeIp(s)).filter(Boolean)
    );
  }
  const xr = req.headers["x-real-ip"];
  if (xr) candidates.push(normalizeIp(xr));
  const cf = req.headers["cf-connecting-ip"];
  if (cf) candidates.push(normalizeIp(cf));
  if (req.ip) candidates.push(normalizeIp(req.ip));
  if (req.socket?.remoteAddress) candidates.push(normalizeIp(req.socket.remoteAddress));
  return candidates.find((ip) => ip && !isLocalIp(ip)) || candidates.find(Boolean) || "";
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
  if (url.startsWith("/socket.io")) return false;
  if (url === "/favicon.ico") return false;
  if (url.startsWith("/uploads")) return false;
  if (/\.(css|js|png|jpg|jpeg|gif|svg|ico|woff|woff2|map|txt|json)$/i.test(url)) return false;
  if (url.startsWith("/api/") || url.startsWith("/customer/cart") || url.startsWith("/customer/wishlist") || url.startsWith("/wishlist") || url.startsWith("/customer/variant-product") || url.startsWith("/search"))
    return false;
  return true;
}
async function getGeo(ip) {
  ip = normalizeIp(ip);
  if (isLocalIp(ip)) return { country: "Unknown", city: "Unknown", area: "Unknown" };
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GEO_TIMEOUT_MS);
    const res = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`, {
      signal: controller.signal
    });
    clearTimeout(timeout);
    const data = await res.json();
    if (data.success) {
      return {
        country: data.country || "Unknown",
        city: data.city || "Unknown",
        area: data.region || "Unknown"
      };
    }
  } catch {
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GEO_TIMEOUT_MS);
    const res = await fetch(`http://ip-api.com/json/${encodeURIComponent(ip)}`, {
      signal: controller.signal
    });
    clearTimeout(timeout);
    const data = await res.json();
    if (data.status === "success") {
      return {
        country: data.country || "Unknown",
        city: data.city || "Unknown",
        area: data.regionName || "Unknown"
      };
    }
  } catch {
  }
  return { country: "Unknown", city: "Unknown", area: "Unknown" };
}
async function visitorTracker(req, _res, next) {
  try {
    if (req.method !== "GET") return next();
    const rawUrl = normalizePath(req.originalUrl || req.url || "");
    if (!shouldTrack(rawUrl)) return next();
    const refererPath = getReferrerPath(req);
    const ip = getClientIp(req);
    const ua = req.headers["user-agent"] || "Unknown";
    const visitorKey = crypto.createHash("md5").update(`${ip}|${ua}`).digest("hex");
    if (refererPath && refererPath === rawUrl) return next();
    const cacheKey = `${visitorKey}|${rawUrl}`;
    const lastHitAt = recentPageHits.get(cacheKey);
    if (lastHitAt && Date.now() - lastHitAt < RECENT_HIT_WINDOW_MS) return next();
    const now = /* @__PURE__ */ new Date();
    const geo = await getGeo(ip);
    recentPageHits.set(cacheKey, Date.now());
    await prisma.$executeRaw`
      INSERT INTO visitors (visitor_key, ip_address, country, city, area, first_visit, last_visit, visit_count)
      VALUES (${visitorKey}, ${ip}, ${geo.country}, ${geo.city}, ${geo.area}, ${now}, ${now}, 1)
      ON DUPLICATE KEY UPDATE
        last_visit = VALUES(last_visit),
        ip_address = VALUES(ip_address),
        country = VALUES(country),
        city = VALUES(city),
        area = VALUES(area),
        visit_count = visit_count + 1
    `;
    const result = await prisma.$executeRaw`
      INSERT INTO page_visits (visitor_key, url, method, ip_address, user_agent, visited_at)
      VALUES (${visitorKey}, ${rawUrl}, ${req.method}, ${ip}, ${ua}, ${now})
    `;
    emitPageVisit({
      id: Number(result),
      visitorKey,
      url: rawUrl,
      method: req.method,
      ip,
      country: geo.country,
      city: geo.city,
      area: geo.area,
      userAgent: ua,
      visitedAt: now
    });
    return next();
  } catch (err) {
    console.error("[visitorTracker] error:", err);
    return next();
  }
}
export {
  visitorTracker
};
