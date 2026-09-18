import { env } from "../config/index.js";
const LEVEL_PRIORITY = { debug: 10, info: 20, warn: 30, error: 40 };
function resolveConfig() {
  const requested = (process.env.LOG_LEVEL || (env && env.NODE_ENV === "production" ? "info" : "debug")).toLowerCase();
  const json = process.env.LOG_JSON === "1";
  return { minPriority: LEVEL_PRIORITY[requested] ?? LEVEL_PRIORITY.info, json };
}
function timestamp() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
function stringify(value) {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  if (value && typeof value === "object") {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return String(value);
    }
  }
  return value;
}
function write(level, message, meta) {
  const { minPriority, json } = resolveConfig();
  if ((LEVEL_PRIORITY[level] ?? LEVEL_PRIORITY.info) < minPriority) return;
  const line = { level, message, timestamp: timestamp(), ...meta !== void 0 ? { meta: stringify(meta) } : {} };
  if (json) {
    const out = process.stdout;
    void out;
    if (level === "error") console.error(JSON.stringify(line));
    else console.log(JSON.stringify(line));
    return;
  }
  const args = meta !== void 0 ? [stringify(meta)] : [];
  if (level === "error") console.error(`[${level}]`, message, ...args);
  else if (level === "warn") console.warn(`[${level}]`, message, ...args);
  else console.log(`[${level}]`, message, ...args);
}
const logger = {
  debug: (message, meta) => write("debug", message, meta),
  info: (message, meta) => write("info", message, meta),
  warn: (message, meta) => write("warn", message, meta),
  error: (message, meta) => write("error", message, meta)
};
export {
  logger
};
