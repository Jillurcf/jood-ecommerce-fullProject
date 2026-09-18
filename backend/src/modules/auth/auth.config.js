import crypto from "crypto";
import bcrypt from "bcryptjs";
import { env } from "../../config/index.js";
const SALT_ROUNDS = 12;
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const EMAIL_VERIFY_HOURS = 24;
const RESET_PASSWORD_MINUTES = 30;
const OTP_EXPIRES_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;
const ADMIN_SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1e3;
const ADMIN_IDLE_LIMIT_MS = 4 * 60 * 1e3;
const RECOVERY_OTP_RESEND_COOLDOWN_MS = 60 * 1e3;
const RECOVERY_LINK_EXPIRES_MINUTES = 15;
const MASTER_ROLE = "master_admin";
const SUPER_ROLE = "super_admin";
const ADMIN_ROLE = "admin";
const SUB_ADMIN_ROLE = "sub_admin";
const VIEWER_ROLE = "viewer";
const ADMIN_ALIASES = /* @__PURE__ */ new Set([
  MASTER_ROLE,
  SUPER_ROLE,
  ADMIN_ROLE,
  SUB_ADMIN_ROLE,
  VIEWER_ROLE,
  "superadmin",
  "staff"
]);
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";
function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}
function sanitizeText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}
function normalizePhone(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const cleaned = raw.replace(/[^\d+]/g, "");
  if (cleaned.startsWith("+")) {
    return `+${cleaned.slice(1).replace(/\+/g, "")}`;
  }
  return cleaned.replace(/\+/g, "");
}
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email || ""));
}
function isValidFullName(name) {
  const n = sanitizeText(name);
  return n.length >= 2 && n.length <= 80;
}
function isValidPhone(phone) {
  if (!phone) return true;
  return /^\+?[0-9]{7,15}$/.test(phone);
}
function isStrongPassword(password) {
  const p = String(password || "");
  return p.length >= 8 && p.length <= 128;
}
function isAdminStrongPassword(password) {
  return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/.test(
    String(password || "")
  );
}
function generateOtp() {
  return String(crypto.randomInt(1e5, 1e6));
}
function generateSecureToken() {
  return crypto.randomBytes(32).toString("hex");
}
function hashToken(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}
function safeHashEquals(left, right) {
  const a = String(left || "");
  const b = String(right || "");
  if (!a || !b || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}
function generateUserIdFromName(fullName, prefixFallback = "user") {
  const baseName = sanitizeText(fullName).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12) || prefixFallback;
  const date = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10).replace(/-/g, "");
  const random = crypto.randomBytes(4).toString("hex");
  return `${baseName}_${date}_${random}`;
}
function minutesUntilUnlock(lockUntil) {
  if (!lockUntil) return 0;
  const lock = new Date(lockUntil);
  if (Number.isNaN(lock.getTime())) return 0;
  const diffMs = lock.getTime() - Date.now();
  return diffMs > 0 ? Math.ceil(diffMs / 6e4) : 0;
}
function isLockedOut(lockUntil) {
  return minutesUntilUnlock(lockUntil) > 0;
}
function lockoutMessage(lockUntil) {
  const remaining = minutesUntilUnlock(lockUntil);
  if (remaining <= 0) return "Too many failed attempts. Please try again later.";
  return `Too many failed attempts. Please try again in ${remaining} minute${remaining > 1 ? "s" : ""}.`;
}
async function hashPassword(password) {
  return bcrypt.hash(password, SALT_ROUNDS);
}
async function verifyPassword(password, hash) {
  if (!hash) return false;
  return bcrypt.compare(password, hash);
}
function appBaseUrl(req) {
  if (env.APP_URL) return env.APP_URL.replace(/\/$/, "");
  const proto = req?.headers?.["x-forwarded-proto"]?.split(",")[0]?.trim() || "http";
  return `${proto}://${req?.headers?.host || "localhost:4001"}`;
}
const FRONTEND_URL = env.FRONTEND_URL.replace(/\/$/, "");
export {
  ADMIN_ALIASES,
  ADMIN_IDLE_LIMIT_MS,
  ADMIN_ROLE,
  ADMIN_SESSION_MAX_AGE_MS,
  EMAIL_VERIFY_HOURS,
  FRONTEND_URL,
  GOOGLE_AUTH_URL,
  GOOGLE_TOKEN_URL,
  GOOGLE_USERINFO_URL,
  LOCK_MINUTES,
  MASTER_ROLE,
  MAX_LOGIN_ATTEMPTS,
  OTP_EXPIRES_MINUTES,
  OTP_MAX_ATTEMPTS,
  RECOVERY_LINK_EXPIRES_MINUTES,
  RECOVERY_OTP_RESEND_COOLDOWN_MS,
  RESET_PASSWORD_MINUTES,
  SALT_ROUNDS,
  SUB_ADMIN_ROLE,
  SUPER_ROLE,
  VIEWER_ROLE,
  appBaseUrl,
  generateOtp,
  generateSecureToken,
  generateUserIdFromName,
  hashPassword,
  hashToken,
  isAdminStrongPassword,
  isLockedOut,
  isStrongPassword,
  isValidEmail,
  isValidFullName,
  isValidPhone,
  lockoutMessage,
  minutesUntilUnlock,
  normalizeEmail,
  normalizePhone,
  safeHashEquals,
  sanitizeText,
  verifyPassword
};
