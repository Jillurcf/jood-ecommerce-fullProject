import crypto from "crypto";
const ALLOWED_PAYMENT_METHODS = /* @__PURE__ */ new Set(["cod", "card"]);
const ALLOWED_GATEWAY_PROVIDERS = /* @__PURE__ */ new Set(["manual", "stripe"]);
const CURRENCY = "AED";
const DEFAULT_LIMIT = 24;
function generateOrderNumber() {
  const now = /* @__PURE__ */ new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const rand = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `ORD-${y}${m}${d}-${rand}`;
}
function generateTrackingId() {
  return "TRK-" + crypto.randomBytes(5).toString("hex").toUpperCase();
}
function generatePaymentReference() {
  return "PAY-" + crypto.randomBytes(5).toString("hex").toUpperCase();
}
const sanitize = (v) => v !== null && v !== void 0 ? String(v).trim() : "";
const sanitizeText = sanitize;
const sanitizeEmail = (v) => {
  const s = sanitize(v).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : "";
};
const sanitizePhone = (v) => {
  const s = sanitize(v).replace(/[^0-9+\-\s()]/g, "");
  return s.length >= 5 ? s : "";
};
const sanitizeDigits = (v) => sanitize(v).replace(/[^0-9]/g, "");
function maskCardNumber(num) {
  if (!num) return "";
  const digits = num.replace(/\D/g, "");
  if (digits.length < 4) return "****";
  return `**** ${digits.slice(-4)}`;
}
function maskCardDisplay(brand, last4) {
  const b = brand || "Card";
  const l = last4 || "****";
  return `${b} **${l}`;
}
function formatLocalDate(d = /* @__PURE__ */ new Date()) {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}
export {
  ALLOWED_GATEWAY_PROVIDERS,
  ALLOWED_PAYMENT_METHODS,
  CURRENCY,
  DEFAULT_LIMIT,
  formatLocalDate,
  generateOrderNumber,
  generatePaymentReference,
  generateTrackingId,
  maskCardDisplay,
  maskCardNumber,
  sanitize,
  sanitizeDigits,
  sanitizeEmail,
  sanitizePhone,
  sanitizeText
};
