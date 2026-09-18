import { logger } from "../common/logger.js";
const SKIP_PREFIXES = ["/socket.io/", "/webhooks/"];
function shouldSkip(path) {
  return SKIP_PREFIXES.some((p) => path.startsWith(p));
}
function requestLogger(req, res, next) {
  if (shouldSkip(req.path)) return next();
  const start = process.hrtime.bigint();
  const method = req.method;
  const url = req.originalUrl || req.url;
  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    const status = res.statusCode;
    const level = status >= 500 ? "error" : status >= 400 ? "warn" : "info";
    logger[level]("request", {
      method,
      url,
      status,
      duration_ms: Math.round(durationMs * 10) / 10,
      rss_mb: Math.round(process.memoryUsage().rss / 1024 / 1024 * 10) / 10
    });
  });
  return next();
}
export {
  requestLogger
};
