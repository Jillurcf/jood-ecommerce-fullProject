"use strict";

require("dotenv").config();

const crypto = require("crypto");
const bcrypt = require("bcrypt");
const nodemailer = require("nodemailer");
const { pool } = require("../../../includes/conn");

/* =========================================================
   CONFIG
========================================================= */

const TABLE_NAME = "customer_accounts";
const COMPANY_NAME = "JOOD | Quality Goods & Products";
const SUPPORT_EMAIL = "info@jood.com";
const SUPPORT_PHONE = "+971 53 37 2440";
const LOGO_URL = "https://telal-contracting.com/logo.png";

const FROM_EMAIL = process.env.FROM_EMAIL || process.env.SMTP_USER || "no-reply@example.com";

const APP_BASE_URL = (
  process.env.APP_BASE_URL ||
  process.env.BASE_URL ||
  "https://telal-contracting.com"
).replace(/\/+$/, "");

const DEBUG_USERS_CONTROLLER = String(process.env.DEBUG_USERS_CONTROLLER || "1").toLowerCase() !== "0";

const ALLOWED_STATUSES = new Set(["active", "inactive", "blocked", "deleted"]);
const ACTIONABLE_ROLES = new Set(["super_admin", "master_admin", "admin"]);

const DEFAULT_USER_SELECT_FIELDS = [
  "id",
  "user_id",
  "full_name",
  "email",
  "phone",
  "password_hash",
  "google_id",
  "provider",
  "status",
  "email_verified",
  "phone_verified",
  "login_attempts",
  "last_attempt_time",
  "lock_until",
  "last_login_at",
  "last_logout_at",
  "last_activity_at",
  "is_online",
  "session_version",
  "created_at",
  "updated_at",
];

const UPDATABLE_FIELDS = new Set([
  "user_id",
  "full_name",
  "email",
  "phone",
  "password_hash",
  "google_id",
  "provider",
  "status",
  "email_verified",
  "phone_verified",
  "login_attempts",
  "last_attempt_time",
  "lock_until",
  "last_login_at",
  "last_logout_at",
  "last_activity_at",
  "is_online",
  "session_version",
  "created_at",
  "updated_at",
]);

let cachedTableColumns = null;

/* =========================================================
   DIAGNOSTICS
========================================================= */

function debugTrace(stage, meta = {}) {
  if (!DEBUG_USERS_CONTROLLER) return;
  console.log(`[users.controller] ${new Date().toISOString()}`, { stage, ...meta });
}

function debugError(stage, err, meta = {}) {
  console.error(`[users.controller][ERROR] ${stage}`, {
    message: err?.message,
    stack: err?.stack,
    ...meta,
  });
}

async function getTableColumns(forceRefresh = false) {
  if (!forceRefresh && cachedTableColumns) return cachedTableColumns;

  const result = await pool.query(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = $1
    `,
    [TABLE_NAME]
  );

  cachedTableColumns = new Set((result.rows || []).map((r) => String(r.column_name || "")));
  return cachedTableColumns;
}

async function logSchemaDiagnostics(stage = "schema_check") {
  try {
    const cols = await getTableColumns();
    const missing = DEFAULT_USER_SELECT_FIELDS.filter((c) => !cols.has(c));

    debugTrace(stage, {
      table: TABLE_NAME,
      columnCount: cols.size,
      missingColumns: missing,
    });

    if (missing.length) {
      console.warn(`[users.controller] Table ${TABLE_NAME} is missing columns: ${missing.join(", ")}`);
    }

    return { cols, missing };
  } catch (err) {
    debugError(stage, err, { table: TABLE_NAME });
    return { cols: new Set(), missing: [] };
  }
}

/* =========================================================
   BASIC HELPERS
========================================================= */

function cleanText(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim().replace(/\s+/g, " ");
}

function normalizeEmail(value) {
  return cleanText(value).toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email || ""));
}

function isValidPhone(phone) {
  if (!phone) return true;
  return /^\+?[0-9]{7,15}$/.test(String(phone));
}

function normalizePhone(value) {
  const raw = cleanText(value);
  if (!raw) return null;

  const cleaned = raw.replace(/[^\d+]/g, "");
  if (cleaned.startsWith("+")) {
    return `+${cleaned.slice(1).replace(/\+/g, "")}`.slice(0, 20);
  }

  const out = cleaned.replace(/\+/g, "").slice(0, 20);
  return out || null;
}

function truncateText(value, maxLength) {
  const text = cleanText(value);
  if (!text) return "";
  return text.slice(0, maxLength);
}

function wantsJson(req) {
  return (
    req.xhr ||
    String(req.headers?.["x-requested-with"] || "") === "XMLHttpRequest" ||
    String(req.headers?.accept || "").includes("application/json")
  );
}

function getCsrfToken(req) {
  if (typeof req?.csrfToken !== "function") return null;
  try {
    return req.csrfToken();
  } catch {
    return null;
  }
}

function getSessionAdmin(req) {
  if (req.session?.admin?.id) return req.session.admin;

  if (req.session?.adminId) {
    return {
      id: req.session.adminId,
      admin_id: req.session.adminAdminId || null,
      full_name: req.session.adminName || null,
      email: req.session.adminEmail || null,
      phone: req.session.adminPhone || null,
      role: req.session.adminRole || "admin",
      sessionVersion: req.session.sessionVersion || 1,
      loginAt: req.session.loginAt || null,
    };
  }

  return null;
}

function isAdminActor(req) {
  const role = cleanText(req.session?.admin?.role || req.session?.adminRole || "");
  return ACTIONABLE_ROLES.has(role);
}

function normalizeStatus(status) {
  const clean = cleanText(status).toLowerCase();
  return ALLOWED_STATUSES.has(clean) ? clean : "active";
}

function generateUserId(fullName) {
  const base =
    cleanText(fullName)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 12) || "user";

  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const random = crypto.randomBytes(4).toString("hex");
  return `${base}_${date}_${random}`;
}

function generateStrongPassword(length = 12) {
  const charset = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%*?_";
  let password = "";
  for (let i = 0; i < length; i++) {
    password += charset[crypto.randomInt(0, charset.length)];
  }
  return password;
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

function makeAbsoluteUrl(path) {
  if (!path) return APP_BASE_URL || "";
  if (/^https?:\/\//i.test(path)) return path;
  return `${APP_BASE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}

function minutesUntil(dateValue) {
  if (!dateValue) return 0;
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return 0;
  const diffMs = d.getTime() - Date.now();
  return diffMs > 0 ? Math.ceil(diffMs / 60000) : 0;
}

function getEffectiveStatus(user) {
  const lockUntil = user?.lock_until ? new Date(user.lock_until) : null;
  const freezeActive = lockUntil && !Number.isNaN(lockUntil.getTime()) && lockUntil.getTime() > Date.now();
  if (freezeActive) return "frozen";
  return cleanText(user?.status || "active").toLowerCase();
}

function actionLabel(action) {
  switch (String(action || "").toLowerCase()) {
    case "block":
      return "Blocked";
    case "unblock":
      return "Unblocked";
    case "freeze":
      return "Frozen";
    case "unfreeze":
      return "Unfrozen";
    case "delete":
      return "Deleted";
    case "restore":
      return "Restored";
    case "create":
      return "Created";
    case "update":
      return "Updated";
    default:
      return "Updated";
  }
}

function buildPublicUrl(path) {
  return makeAbsoluteUrl(path);
}

function escapeLike(value) {
  return String(value || "").replace(/[\\%_]/g, "\\$&");
}

function normalizeUserRow(row) {
  if (!row) return null;
  const user = { ...row };
  user.effective_status = getEffectiveStatus(user);
  user.freeze_remaining_minutes = minutesUntil(user.lock_until);
  return user;
}

function filterExistingFields(fields, existingColumns) {
  const out = {};
  for (const [key, value] of Object.entries(fields || {})) {
    if (!UPDATABLE_FIELDS.has(key)) continue;
    if (existingColumns && !existingColumns.has(key)) continue;
    if (value === undefined) continue;
    out[key] = value;
  }
  return out;
}

function inferActionFromEvent(eventName) {
  switch (String(eventName || "").toLowerCase()) {
    case "user:created":
      return "create";
    case "user:updated":
      return "update";
    case "user:blocked":
      return "block";
    case "user:unblocked":
      return "unblock";
    case "user:frozen":
      return "freeze";
    case "user:unfrozen":
      return "unfreeze";
    case "user:deleted":
      return "delete";
    case "user:restored":
      return "restore";
    default:
      return "update";
  }
}

function buildRealtimeUiState(user, action = "") {
  const effective = getEffectiveStatus(user);
  const actionClean = cleanText(action).toLowerCase();

  const stateByStatus = {
    active: {
      badge: "Active",
      badgeClass: "success",
      primaryButton: { text: "Block", action: "block", variant: "danger" },
      secondaryButton: { text: "Freeze", action: "freeze", variant: "warning" },
      dangerButton: { text: "Delete", action: "delete", variant: "dark" },
      canBlock: true,
      canUnblock: false,
      canFreeze: true,
      canUnfreeze: false,
      canDelete: true,
      canRestore: false,
    },
    inactive: {
      badge: "Inactive",
      badgeClass: "secondary",
      primaryButton: { text: "Activate", action: "restore", variant: "success" },
      secondaryButton: { text: "Block", action: "block", variant: "danger" },
      dangerButton: { text: "Delete", action: "delete", variant: "dark" },
      canBlock: true,
      canUnblock: false,
      canFreeze: true,
      canUnfreeze: false,
      canDelete: true,
      canRestore: true,
    },
    blocked: {
      badge: "Blocked",
      badgeClass: "danger",
      primaryButton: { text: "Unblock", action: "unblock", variant: "success" },
      secondaryButton: { text: "Freeze", action: "freeze", variant: "warning" },
      dangerButton: { text: "Delete", action: "delete", variant: "dark" },
      canBlock: false,
      canUnblock: true,
      canFreeze: true,
      canUnfreeze: false,
      canDelete: true,
      canRestore: false,
    },
    deleted: {
      badge: "Deleted",
      badgeClass: "dark",
      primaryButton: { text: "Restore", action: "restore", variant: "success" },
      secondaryButton: null,
      dangerButton: null,
      canBlock: false,
      canUnblock: false,
      canFreeze: false,
      canUnfreeze: false,
      canDelete: false,
      canRestore: true,
    },
    frozen: {
      badge: "Frozen",
      badgeClass: "warning",
      primaryButton: { text: "Unfreeze", action: "unfreeze", variant: "success" },
      secondaryButton: { text: "Block", action: "block", variant: "danger" },
      dangerButton: { text: "Delete", action: "delete", variant: "dark" },
      canBlock: true,
      canUnblock: false,
      canFreeze: false,
      canUnfreeze: true,
      canDelete: true,
      canRestore: false,
    },
  };

  const base = stateByStatus[effective] || stateByStatus.active;

  return {
    effective_status: effective,
    action: actionClean || null,
    action_label: actionClean ? actionLabel(actionClean) : null,
    badge: base.badge,
    badge_class: base.badgeClass,
    primary_button: base.primaryButton,
    secondary_button: base.secondaryButton,
    danger_button: base.dangerButton,
    can: {
      block: base.canBlock,
      unblock: base.canUnblock,
      freeze: base.canFreeze,
      unfreeze: base.canUnfreeze,
      delete: base.canDelete,
      restore: base.canRestore,
    },
    freeze_remaining_minutes: minutesUntil(user?.lock_until),
  };
}

/* =========================================================
   EMAIL TEMPLATE (WITH LOGO)
========================================================= */

function buildEmailTemplate({ title, content, footerNote = "" }) {
  return `
  <div style="margin:0;padding:0;background:#f6f7fb;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:680px;margin:0 auto;padding:28px 16px;">
      <div style="background:#ffffff;border:1px solid #e5eaf3;border-radius:18px;overflow:hidden;box-shadow:0 12px 32px rgba(15,23,42,.06);">
        <div style="padding:24px 26px;background:linear-gradient(135deg,#f59e0b,#d97706);color:#fff;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;">
            <tr>
              <td style="width:92px;vertical-align:middle;">
                <div style="width:92px;height:92px;border-radius:20px;background:#ffffff;display:block;overflow:hidden;box-shadow:0 8px 18px rgba(0,0,0,.10);">
                  <img src="${LOGO_URL}" alt="${COMPANY_NAME}" style="width:100%;height:100%;object-fit:contain;display:block;" />
                </div>
              </td>
              <td style="vertical-align:middle;padding-left:18px;">
                <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;opacity:.92;margin-bottom:6px;">${COMPANY_NAME}</div>
                <h2 style="margin:0;font-size:26px;line-height:1.2;font-weight:700;">${cleanText(title)}</h2>
              </td>
            </tr>
          </table>
        </div>
        <div style="padding:24px;color:#111827;font-size:15px;line-height:1.75;">
          ${content}
        </div>
        <div style="padding:0 24px 24px;color:#6b7280;font-size:12px;line-height:1.6;">
          ${footerNote ? `<div style="padding-top:14px;border-top:1px solid #eef2f7;">${footerNote}</div>` : ""}
          <div style="margin-top:14px;">
            ${COMPANY_NAME}<br>${SUPPORT_EMAIL}<br>${SUPPORT_PHONE}
          </div>
        </div>
      </div>
    </div>
  </div>`;
}

/* =========================================================
   EMAIL
========================================================= */

async function createMailer() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_PORT || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    throw new Error("SMTP is not configured.");
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

async function sendEmailMessage({ to, subject, html, text }) {
  const transporter = await createMailer();
  await transporter.sendMail({ from: FROM_EMAIL, to, subject, html, text });
}

function buildActionEmail({ fullName, action, actorName, details }) {
  const safeName = cleanText(fullName);
  const greeting = safeName ? `Hello ${safeName},` : "Hello,";
  const label = actionLabel(action);
  const safeActor = cleanText(actorName || "System");
  const safeDetails = cleanText(details || "");

  const html = buildEmailTemplate({
    title: `Account ${label}`,
    content: `
      <p style="margin:0 0 16px;">${greeting}</p>
      <p style="margin:0 0 16px;">Your account status has been changed.</p>
      <div style="margin:22px 0;padding:18px;border:1px solid #eef2f7;border-radius:12px;background:#fafafa;">
        <div style="font-size:14px;color:#6b7280;margin-bottom:8px;">Action details</div>
        <div style="font-size:15px;line-height:1.9;color:#111827;">
          <strong>Action:</strong> ${label}<br>
          <strong>Performed By:</strong> ${safeActor}<br>
          ${safeDetails ? `<strong>Details:</strong> ${safeDetails}<br>` : ""}
          <strong>Time:</strong> ${new Date().toLocaleString()}
        </div>
      </div>
      <p style="margin:0;">If this was unexpected, please contact support immediately.</p>
    `,
    footerNote: "This is an automated notification.",
  });

  const text = `
${greeting}

Your account status has been changed.

Action: ${label}
Performed by: ${safeActor}
${safeDetails ? `Details: ${safeDetails}\n` : ""}Time: ${new Date().toLocaleString()}

${COMPANY_NAME}
${SUPPORT_EMAIL}
${SUPPORT_PHONE}
`;

  return { html, text };
}

function buildAdminActionEmail({ targetName, action, targetEmail, actorName, details }) {
  const label = actionLabel(action);
  const html = buildEmailTemplate({
    title: `User ${label}`,
    content: `
      <p style="margin:0 0 16px;">Hello ${cleanText(actorName || "Admin")},</p>
      <p style="margin:0 0 16px;">The following user action was completed successfully.</p>
      <div style="margin:22px 0;padding:18px;border:1px solid #eef2f7;border-radius:12px;background:#fafafa;">
        <div style="font-size:14px;color:#6b7280;margin-bottom:8px;">Action summary</div>
        <div style="font-size:15px;line-height:1.9;color:#111827;">
          <strong>User:</strong> ${cleanText(targetName)}<br>
          <strong>Email:</strong> ${cleanText(targetEmail)}<br>
          <strong>Action:</strong> ${label}<br>
          ${cleanText(details) ? `<strong>Details:</strong> ${cleanText(details)}<br>` : ""}
          <strong>Time:</strong> ${new Date().toLocaleString()}
        </div>
      </div>
    `,
    footerNote: "Automated admin notification.",
  });

  const text = `
Hello ${cleanText(actorName || "Admin")},

The following user action was completed successfully.

User: ${cleanText(targetName)}
Email: ${cleanText(targetEmail)}
Action: ${label}
${cleanText(details) ? `Details: ${cleanText(details)}\n` : ""}Time: ${new Date().toLocaleString()}

${COMPANY_NAME}
${SUPPORT_EMAIL}
${SUPPORT_PHONE}
`;

  return { html, text };
}

function buildCredentialsEmail(fullName, email, plainPassword) {
  const safeName = cleanText(fullName);
  const greeting = safeName ? `Hello ${safeName},` : "Hello,";

  const html = buildEmailTemplate({
    title: "Your account has been created",
    content: `
      <p style="margin:0 0 16px;">${greeting}</p>
      <p style="margin:0 0 16px;">Your account has been created successfully.</p>
      <div style="margin:22px 0;padding:18px;border:1px solid #eef2f7;border-radius:12px;background:#fafafa;">
        <div style="font-size:14px;color:#6b7280;margin-bottom:8px;">Login details</div>
        <div style="font-size:15px;line-height:1.9;color:#111827;">
          <strong>Email:</strong> ${cleanText(email)}<br>
          <strong>Password:</strong> ${cleanText(plainPassword)}
        </div>
      </div>
      <p style="margin:0;">Please sign in and change your password after login.</p>
    `,
    footerNote: "For security, do not share your password with anyone.",
  });

  const text = `
${greeting}

Your account has been created successfully.

Email: ${cleanText(email)}
Password: ${cleanText(plainPassword)}

Please sign in and change your password after login.

${COMPANY_NAME}
${SUPPORT_EMAIL}
${SUPPORT_PHONE}
`;

  return { html, text };
}

/* =========================================================
   DB HELPERS
========================================================= */

async function findUserByEmail(email) {
  const result = await pool.query(
    `
      SELECT *
      FROM ${TABLE_NAME}
      WHERE LOWER(email) = LOWER($1)
      LIMIT 1
    `,
    [normalizeEmail(email)]
  );
  return normalizeUserRow(result.rows[0] || null);
}

async function findUserById(id) {
  const result = await pool.query(
    `
      SELECT *
      FROM ${TABLE_NAME}
      WHERE id = $1
      LIMIT 1
    `,
    [id]
  );
  return normalizeUserRow(result.rows[0] || null);
}

async function countUsers(filter = {}) {
  const clauses = [];
  const values = [];

  if (filter.q) {
    values.push(`%${escapeLike(filter.q)}%`);
    clauses.push(
      `(full_name ILIKE $${values.length} ESCAPE '\\' OR email ILIKE $${values.length} ESCAPE '\\' OR user_id ILIKE $${values.length} ESCAPE '\\')`
    );
  }

  if (filter.status && ALLOWED_STATUSES.has(String(filter.status).toLowerCase())) {
    values.push(String(filter.status).toLowerCase());
    clauses.push(`status = $${values.length}`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const result = await pool.query(`SELECT COUNT(*)::int AS count FROM ${TABLE_NAME} ${where}`, values);
  return result.rows[0]?.count || 0;
}

async function listUsersQuery({ q = "", status = "", page = 1, limit = 1000 } = {}) {
  const clauses = [];
  const values = [];
  let idx = 1;

  if (q) {
    values.push(`%${escapeLike(q)}%`);
    clauses.push(
      `(full_name ILIKE $${idx} ESCAPE '\\' OR email ILIKE $${idx} ESCAPE '\\' OR user_id ILIKE $${idx} ESCAPE '\\')`
    );
    idx += 1;
  }

  if (status && ALLOWED_STATUSES.has(String(status).toLowerCase())) {
    values.push(String(status).toLowerCase());
    clauses.push(`status = $${idx}`);
    idx += 1;
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const safeLimit = Math.max(1, Math.min(Number(limit) || 1000, 1000));
  const safePage = Math.max(1, Number(page) || 1);
  const offset = (safePage - 1) * safeLimit;

  values.push(safeLimit, offset);

  const result = await pool.query(
    `
      SELECT *
      FROM ${TABLE_NAME}
      ${where}
      ORDER BY
        CASE COALESCE(status, 'active')
          WHEN 'active' THEN 1
          WHEN 'inactive' THEN 2
          WHEN 'blocked' THEN 3
          WHEN 'deleted' THEN 4
          ELSE 5
        END,
        created_at DESC NULLS LAST,
        id DESC
      LIMIT $${idx}
      OFFSET $${idx + 1}
    `,
    values
  );

  const total = await countUsers({ q, status });

  return {
    rows: (result.rows || []).map(normalizeUserRow),
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      pages: Math.max(1, Math.ceil(total / safeLimit)),
    },
  };
}

async function updateUserFields(userId, fields = {}) {
  const existingColumns = await getTableColumns();
  const safeFields = filterExistingFields(fields, existingColumns);
  const keys = Object.keys(safeFields);

  if (!keys.length) return findUserById(userId);

  const setParts = [];
  const values = [userId];
  let idx = 2;

  for (const key of keys) {
    setParts.push(`${key} = $${idx++}`);
    values.push(safeFields[key]);
  }

  if (existingColumns.has("updated_at")) setParts.push(`updated_at = NOW()`);

  const result = await pool.query(
    `
      UPDATE ${TABLE_NAME}
      SET ${setParts.join(", ")}
      WHERE id = $1
      RETURNING *
    `,
    values
  );

  return normalizeUserRow(result.rows[0] || null);
}

async function refreshExpiredFreeze(userId) {
  const columns = await getTableColumns();
  if (!columns.has("lock_until")) return findUserById(userId);

  const setParts = ["lock_until = NULL"];
  if (columns.has("updated_at")) setParts.push("updated_at = NOW()");

  const result = await pool.query(
    `
      UPDATE ${TABLE_NAME}
      SET ${setParts.join(", ")}
      WHERE id = $1
        AND lock_until IS NOT NULL
        AND lock_until <= NOW()
      RETURNING *
    `,
    [userId]
  );

  return normalizeUserRow(result.rows[0] || null);
}

async function insertUserRecord(data = {}) {
  const existingColumns = await getTableColumns();
  const insertMap = filterExistingFields(data, existingColumns);
  const keys = Object.keys(insertMap);

  if (!keys.length) {
    throw new Error("No valid columns available for insert.");
  }

  const cols = [];
  const vals = [];
  const placeholders = [];
  let idx = 1;

  for (const key of keys) {
    cols.push(key);
    vals.push(insertMap[key]);
    placeholders.push(`$${idx++}`);
  }

  if (existingColumns.has("created_at") && !cols.includes("created_at")) {
    cols.push("created_at");
    placeholders.push("NOW()");
  }

  if (existingColumns.has("updated_at")) {
    cols.push("updated_at");
    placeholders.push("NOW()");
  }

  const query = `
    INSERT INTO ${TABLE_NAME} (${cols.join(", ")})
    VALUES (${placeholders.join(", ")})
    RETURNING *
  `;

  const result = await pool.query(query, vals);
  return normalizeUserRow(result.rows[0] || null);
}

/* =========================================================
   REAL-TIME HELPERS
========================================================= */

function emitUserEvent(req, eventName, payload = {}) {
  const io = req.app?.get?.("io") || req.app?.get?.("socketio") || req.app?.locals?.io;
  if (!io || typeof io.emit !== "function") return;

  const user = payload.user ? normalizeUserRow(payload.user) : null;
  const action = payload.action || inferActionFromEvent(eventName);
  const ui = user ? buildRealtimeUiState(user, action) : null;
  const at = payload.at || new Date().toISOString();

  const eventPayload = {
    ...payload,
    event: eventName,
    action,
    at,
    user,
    ui,
  };

  io.emit(eventName, eventPayload);
  io.emit("user:realtime", eventPayload);
}

/* =========================================================
   NOTIFY
========================================================= */

async function notifyUserAction({ req, user, action, details = "" }) {
  try {
    const email = user?.email;
    if (!email) return;

    const subject = `Account ${actionLabel(action)}`;
    const { html, text } = buildActionEmail({
      fullName: user?.full_name,
      action,
      actorName: req.session?.admin?.full_name || req.session?.adminName || "System",
      details,
    });

    await sendEmailMessage({
      to: email,
      subject,
      html,
      text: text || `Action: ${actionLabel(action)}\nDetails: ${details}`,
    });
  } catch (err) {
    debugError("notifyUserAction", err, {
      userId: user?.id || null,
      email: user?.email || null,
      action,
    });
  }
}

/* =========================================================
   ACCESS CHECK
========================================================= */

function ensureAdminAccess(req, res) {
  const actor = getSessionAdmin(req);
  if (!actor?.id && !isAdminActor(req)) {
    res.status(401).json({ ok: false, message: "Unauthorized" });
    return null;
  }
  return actor;
}

/* =========================================================
   PAGE RENDER
========================================================= */

exports.getUserListPage = async (req, res, next) => {
  try {
    const actor = ensureAdminAccess(req, res);
    if (!actor) return;

    debugTrace("getUserListPage:start", {
      actorId: actor?.id || null,
      actorRole: actor?.role || null,
    });

    await logSchemaDiagnostics("getUserListPage:schema");

    const q = cleanText(req.query?.q || "");
    const status = cleanText(req.query?.status || "").toLowerCase();

    const result = await listUsersQuery({ q, status, page: 1, limit: 1000 });
    const users = [];

    for (const row of result.rows) {
      const refreshed = await refreshExpiredFreeze(row.id);
      users.push(refreshed || row);
    }

    return res.render("admin/a/profile/users", {
      admin: actor,
      user: actor,
      sessionAdmin: actor,
      users,
      userList: users,
      dataUsers: users,
      pagination: result.pagination,
      csrfToken: getCsrfToken(req),
    });
  } catch (err) {
    debugError("getUserListPage", err, { query: req.query || {} });
    return next(err);
  }
};

/* =========================================================
   LIST / DETAILS
========================================================= */

exports.getUserList = async (req, res, next) => {
  try {
    const actor = ensureAdminAccess(req, res);
    if (!actor) return;

    debugTrace("getUserList:start", {
      actorId: actor?.id || null,
      actorRole: actor?.role || null,
      query: req.query || {},
    });

    await logSchemaDiagnostics("getUserList:schema");

    const q = cleanText(req.query?.q || req.body?.q);
    const status = cleanText(req.query?.status || req.body?.status).toLowerCase();
    const page = Number(req.query?.page || req.body?.page || 1);
    const limit = Number(req.query?.limit || req.body?.limit || 1000);

    const result = await listUsersQuery({ q, status, page, limit });
    const rows = [];

    for (const user of result.rows) {
      const refreshed = await refreshExpiredFreeze(user.id);
      rows.push(refreshed || normalizeUserRow(user));
    }

    debugTrace("getUserList:done", {
      returned: rows.length,
      page: result.pagination.page,
      total: result.pagination.total,
    });

    return res.json({
      ok: true,
      users: rows,
      data: rows,
      pagination: result.pagination,
    });
  } catch (err) {
    debugError("getUserList", err, { query: req.query || {}, body: req.body || {} });
    return next(err);
  }
};

exports.getUserById = async (req, res, next) => {
  try {
    const actor = ensureAdminAccess(req, res);
    if (!actor) return;

    const id = Number(req.params?.id || req.body?.id);
    if (!id) {
      return res.status(400).json({ ok: false, message: "User ID is required." });
    }

    const refreshed = await refreshExpiredFreeze(id);
    const user = refreshed || (await findUserById(id));

    if (!user) {
      return res.status(404).json({ ok: false, message: "User not found." });
    }

    return res.json({ ok: true, user: normalizeUserRow(user) });
  } catch (err) {
    debugError("getUserById", err, { id: req.params?.id || req.body?.id || null });
    return next(err);
  }
};

/* =========================================================
   CREATE / UPDATE
========================================================= */

exports.createUser = async (req, res, next) => {
  try {
    const actor = ensureAdminAccess(req, res);
    if (!actor) return;

    debugTrace("createUser:start", { actorId: actor?.id || null, bodyKeys: Object.keys(req.body || {}) });

    const fullName = truncateText(req.body?.full_name ?? req.body?.fullName, 80);
    const email = normalizeEmail(req.body?.email);
    const phone = normalizePhone(req.body?.phone ?? req.body?.phone_number);
    const status = normalizeStatus(req.body?.status || "active");
    const provider = cleanText(req.body?.provider || "manual") || "manual";
    const googleId = cleanText(req.body?.google_id || req.body?.googleId) || null;

    if (!fullName || fullName.length < 2) {
      return res.status(400).json({ ok: false, message: "Full name is required." });
    }
    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ ok: false, message: "Please enter a valid email address." });
    }
    if (phone && !isValidPhone(phone)) {
      return res.status(400).json({ ok: false, message: "Please enter a valid phone number." });
    }

    const exists = await findUserByEmail(email);
    if (exists) {
      return res.status(409).json({ ok: false, message: "User email already exists." });
    }

    const plainPassword = generateStrongPassword(12);
    const passwordHash = await bcrypt.hash(plainPassword, 12);
    const userId = generateUserId(fullName);

    const user = await insertUserRecord({
      user_id: userId,
      full_name: fullName,
      email,
      phone,
      password_hash: passwordHash,
      google_id: googleId,
      provider,
      status,
      email_verified: false,
      phone_verified: false,
      login_attempts: 0,
      last_attempt_time: null,
      lock_until: null,
      last_login_at: null,
      last_logout_at: null,
      last_activity_at: null,
      is_online: false,
      session_version: 1,
    });

    try {
      const userMail = buildCredentialsEmail(fullName, email, plainPassword);
      await sendEmailMessage({
        to: email,
        subject: "Your account has been created",
        html: userMail.html,
        text: userMail.text,
      });

      const adminEmail = normalizeEmail(req.session?.admin?.email || req.session?.adminEmail || actor?.email || "");
      if (adminEmail && adminEmail !== email) {
        const adminMail = buildAdminActionEmail({
          targetName: fullName,
          action: "create",
          targetEmail: email,
          actorName: cleanText(actor?.full_name || req.session?.adminName || "System"),
          details: `Provider: ${provider}`,
        });

        await sendEmailMessage({
          to: adminEmail,
          subject: "New user created",
          html: adminMail.html,
          text: adminMail.text,
        });
      }
    } catch (mailErr) {
      debugError("createUser:email", mailErr, { email, userId: user?.id || null });
    }

    emitUserEvent(req, "user:created", { user, by: actor?.id || null, at: new Date().toISOString() });

    return res.status(201).json({
      ok: true,
      message: "User created successfully.",
      user,
      tempPassword: plainPassword,
    });
  } catch (err) {
    debugError("createUser", err, { body: req.body || {} });
    return next(err);
  }
};

exports.updateUser = async (req, res, next) => {
  try {
    const actor = ensureAdminAccess(req, res);
    if (!actor) return;

    const id = Number(req.params?.id || req.body?.id);
    if (!id) {
      return res.status(400).json({ ok: false, message: "User ID is required." });
    }

    const existing = await findUserById(id);
    if (!existing) {
      return res.status(404).json({ ok: false, message: "User not found." });
    }

    const fullName = truncateText(req.body?.full_name ?? req.body?.fullName, 80);
    const email = normalizeEmail(req.body?.email);
    const phone = normalizePhone(req.body?.phone ?? req.body?.phone_number);
    const status = normalizeStatus(req.body?.status || existing.status);
    const provider = cleanText(req.body?.provider || existing.provider || "manual") || "manual";
    const googleId = cleanText(req.body?.google_id || req.body?.googleId) || existing.google_id || null;

    const fields = {};
    if (fullName) fields.full_name = fullName;
    if (email && isValidEmail(email)) fields.email = email;
    if (phone !== null) {
      if (phone && !isValidPhone(phone)) {
        return res.status(400).json({ ok: false, message: "Please enter a valid phone number." });
      }
      fields.phone = phone;
    }
    fields.status = status;
    fields.provider = provider;
    fields.google_id = googleId;

    const updated = await updateUserFields(id, fields);

    try {
      await notifyUserAction({
        req,
        user: updated,
        action: "update",
        details: Object.keys(fields).join(", "),
      });
    } catch (mailErr) {
      debugError("updateUser:notify", mailErr, { userId: id });
    }

    emitUserEvent(req, "user:updated", { user: updated, by: actor?.id || null, at: new Date().toISOString() });

    return res.json({ ok: true, message: "User updated successfully.", user: updated });
  } catch (err) {
    debugError("updateUser", err, { body: req.body || {}, params: req.params || {} });
    return next(err);
  }
};

/* =========================================================
   ACTIONS
========================================================= */

exports.blockUser = async (req, res, next) => {
  try {
    const actor = ensureAdminAccess(req, res);
    if (!actor) return;

    const id = Number(req.params?.id || req.body?.id);
    if (!id) return res.status(400).json({ ok: false, message: "User ID is required." });

    const reason = truncateText(req.body?.reason, 255);
    const user = await findUserById(id);
    if (!user) return res.status(404).json({ ok: false, message: "User not found." });

    const updated = await updateUserFields(id, {
      status: "blocked",
      lock_until: null,
      is_online: false,
      last_logout_at: new Date(),
    });

    await notifyUserAction({ req, user: updated, action: "block", details: reason || "Account access blocked by admin." });

    emitUserEvent(req, "user:blocked", {
      user: updated,
      reason: reason || null,
      by: actor?.id || null,
      at: new Date().toISOString(),
    });

    return res.json({ ok: true, message: "User blocked successfully.", user: updated });
  } catch (err) {
    debugError("blockUser", err, { body: req.body || {}, params: req.params || {} });
    return next(err);
  }
};

exports.unblockUser = async (req, res, next) => {
  try {
    const actor = ensureAdminAccess(req, res);
    if (!actor) return;

    const id = Number(req.params?.id || req.body?.id);
    if (!id) return res.status(400).json({ ok: false, message: "User ID is required." });

    const user = await findUserById(id);
    if (!user) return res.status(404).json({ ok: false, message: "User not found." });

    const updated = await updateUserFields(id, {
      status: "active",
      lock_until: null,
      login_attempts: 0,
      last_attempt_time: null,
    });

    await notifyUserAction({ req, user: updated, action: "unblock", details: "Account access restored." });

    emitUserEvent(req, "user:unblocked", { user: updated, by: actor?.id || null, at: new Date().toISOString() });

    return res.json({ ok: true, message: "User unblocked successfully.", user: updated });
  } catch (err) {
    debugError("unblockUser", err, { body: req.body || {}, params: req.params || {} });
    return next(err);
  }
};

exports.freezeUser = async (req, res, next) => {
  try {
    const actor = ensureAdminAccess(req, res);
    if (!actor) return;

    const id = Number(req.params?.id || req.body?.id);
    const freezeUntilRaw = req.body?.freeze_until || req.body?.until || req.body?.lock_until;
    if (!id) return res.status(400).json({ ok: false, message: "User ID is required." });

    const user = await findUserById(id);
    if (!user) return res.status(404).json({ ok: false, message: "User not found." });

    const until = freezeUntilRaw ? new Date(freezeUntilRaw) : null;
    if (!until || Number.isNaN(until.getTime())) {
      return res.status(400).json({ ok: false, message: "Please provide a valid freeze date and time." });
    }
    if (until.getTime() <= Date.now()) {
      return res.status(400).json({ ok: false, message: "Freeze time must be in the future." });
    }

    const updated = await updateUserFields(id, {
      lock_until: until,
      status: user.status === "deleted" ? "deleted" : user.status || "active",
    });

    await notifyUserAction({ req, user: updated, action: "freeze", details: `Frozen until ${until.toLocaleString()}` });

    emitUserEvent(req, "user:frozen", {
      user: updated,
      freeze_until: until.toISOString(),
      freeze_remaining_minutes: minutesUntil(until),
      by: actor?.id || null,
      at: new Date().toISOString(),
    });

    return res.json({
      ok: true,
      message: `User frozen until ${until.toLocaleString()}.`,
      user: normalizeUserRow({
        ...updated,
        effective_status: "frozen",
        freeze_remaining_minutes: minutesUntil(until),
      }),
    });
  } catch (err) {
    debugError("freezeUser", err, { body: req.body || {}, params: req.params || {} });
    return next(err);
  }
};

exports.unfreezeUser = async (req, res, next) => {
  try {
    const actor = ensureAdminAccess(req, res);
    if (!actor) return;

    const id = Number(req.params?.id || req.body?.id);
    if (!id) return res.status(400).json({ ok: false, message: "User ID is required." });

    const user = await findUserById(id);
    if (!user) return res.status(404).json({ ok: false, message: "User not found." });

    const updated = await updateUserFields(id, { lock_until: null });

    await notifyUserAction({ req, user: updated, action: "unfreeze", details: "Freeze period removed." });

    emitUserEvent(req, "user:unfrozen", { user: updated, by: actor?.id || null, at: new Date().toISOString() });

    return res.json({ ok: true, message: "User unfrozen successfully.", user: updated });
  } catch (err) {
    debugError("unfreezeUser", err, { body: req.body || {}, params: req.params || {} });
    return next(err);
  }
};

exports.deleteUser = async (req, res, next) => {
  try {
    const actor = ensureAdminAccess(req, res);
    if (!actor) return;

    const id = Number(req.params?.id || req.body?.id);
    if (!id) return res.status(400).json({ ok: false, message: "User ID is required." });

    const reason = truncateText(req.body?.reason, 255);
    const user = await findUserById(id);
    if (!user) return res.status(404).json({ ok: false, message: "User not found." });

    const updated = await updateUserFields(id, {
      status: "deleted",
      lock_until: null,
      is_online: false,
      last_logout_at: new Date(),
    });

    await notifyUserAction({ req, user: updated, action: "delete", details: reason || "Account marked as deleted." });

    emitUserEvent(req, "user:deleted", {
      user: updated,
      reason: reason || null,
      by: actor?.id || null,
      at: new Date().toISOString(),
    });

    return res.json({ ok: true, message: "User deleted successfully.", user: updated });
  } catch (err) {
    debugError("deleteUser", err, { body: req.body || {}, params: req.params || {} });
    return next(err);
  }
};

exports.restoreUser = async (req, res, next) => {
  try {
    const actor = ensureAdminAccess(req, res);
    if (!actor) return;

    const id = Number(req.params?.id || req.body?.id);
    if (!id) return res.status(400).json({ ok: false, message: "User ID is required." });

    const user = await findUserById(id);
    if (!user) return res.status(404).json({ ok: false, message: "User not found." });

    const updated = await updateUserFields(id, { status: "active", lock_until: null });

    await notifyUserAction({ req, user: updated, action: "restore", details: "Account restored by admin." });

    emitUserEvent(req, "user:restored", { user: updated, by: actor?.id || null, at: new Date().toISOString() });

    return res.json({ ok: true, message: "User restored successfully.", user: updated });
  } catch (err) {
    debugError("restoreUser", err, { body: req.body || {}, params: req.params || {} });
    return next(err);
  }
};

/* =========================================================
   AUTO-UNFREEZE SYNC
========================================================= */

exports.syncExpiredUserFreezes = async (req, res, next) => {
  try {
    const actor = ensureAdminAccess(req, res);
    if (!actor) return;

    debugTrace("syncExpiredUserFreezes:start", { actorId: actor?.id || null });

    const columns = await getTableColumns();
    if (!columns.has("lock_until")) {
      return res.json({ ok: true, message: "Freeze column does not exist in this table.", count: 0 });
    }

    const setParts = ["lock_until = NULL"];
    if (columns.has("updated_at")) setParts.push("updated_at = NOW()");

    const result = await pool.query(
      `
        UPDATE ${TABLE_NAME}
        SET ${setParts.join(", ")}
        WHERE lock_until IS NOT NULL
          AND lock_until <= NOW()
        RETURNING *
      `
    );

    const changedUsers = (result.rows || []).map(normalizeUserRow);

    for (const user of changedUsers) {
      emitUserEvent(req, "user:unfrozen", { user, auto: true, at: new Date().toISOString() });
      await notifyUserAction({ req, user, action: "unfreeze", details: "Freeze period expired automatically." });
    }

    debugTrace("syncExpiredUserFreezes:done", { count: changedUsers.length });

    return res.json({ ok: true, message: "Expired freeze records synced successfully.", count: changedUsers.length });
  } catch (err) {
    debugError("syncExpiredUserFreezes", err, { body: req.body || {}, query: req.query || {} });
    return next(err);
  }
};

/* =========================================================
   GENERIC ACTION ENDPOINT
========================================================= */

exports.updateUserStatusAction = async (req, res, next) => {
  try {
    const action = cleanText(req.body?.action || req.params?.action).toLowerCase();
    debugTrace("updateUserStatusAction", { action });

    switch (action) {
      case "block":
        return exports.blockUser(req, res, next);
      case "unblock":
        return exports.unblockUser(req, res, next);
      case "freeze":
        return exports.freezeUser(req, res, next);
      case "unfreeze":
        return exports.unfreezeUser(req, res, next);
      case "delete":
        return exports.deleteUser(req, res, next);
      case "restore":
        return exports.restoreUser(req, res, next);
      default:
        return res.status(400).json({ ok: false, message: "Invalid action." });
    }
  } catch (err) {
    debugError("updateUserStatusAction", err, { body: req.body || {}, params: req.params || {} });
    return next(err);
  }
};

/* =========================================================
   HEALTH / DEBUG
========================================================= */

exports.getUserControllerDebug = async (req, res) => {
  const actor = getSessionAdmin(req);
  const schema = await logSchemaDiagnostics("debug_endpoint");

  return res.json({
    ok: true,
    table: TABLE_NAME,
    actor: actor
      ? {
          id: actor.id || null,
          role: actor.role || null,
          email: actor.email || null,
        }
      : null,
    schema: {
      totalColumns: schema.cols.size,
      missingColumns: schema.missing,
    },
    helpers: {
      wantsJson: wantsJson(req),
      baseUrl: APP_BASE_URL,
    },
  });
};

/* =========================================================
   ALIASES / EXPORT HELPERS
========================================================= */

exports.findUserByEmail = findUserByEmail;
exports.findUserById = findUserById;
exports.generateUserId = generateUserId;
exports.generateStrongPassword = generateStrongPassword;
exports.hashToken = hashToken;
exports.safeCompareStrings = (a, b) => {
  const left = String(a || "");
  const right = String(b || "");
  if (!left || !right || left.length !== right.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(left), Buffer.from(right));
  } catch {
    return left === right;
  }
};
exports.makeAbsoluteUrl = makeAbsoluteUrl;
exports.buildPublicUrl = buildPublicUrl;
exports.getCsrfToken = getCsrfToken;
exports.getSessionAdmin = getSessionAdmin;
exports.getEffectiveStatus = getEffectiveStatus;
exports.notifyUserAction = notifyUserAction;
exports.emitUserEvent = emitUserEvent;
exports.refreshExpiredFreeze = refreshExpiredFreeze;
exports.cleanText = cleanText;
exports.normalizeEmail = normalizeEmail;
exports.normalizePhone = normalizePhone;
exports.isValidEmail = isValidEmail;
exports.isValidPhone = isValidPhone;
exports.updateUserFields = updateUserFields;
exports.listUsersQuery = listUsersQuery;
exports.countUsers = countUsers;
exports.getTableColumns = getTableColumns;
exports.logSchemaDiagnostics = logSchemaDiagnostics;
exports.normalizeUserRow = normalizeUserRow;
exports.buildRealtimeUiState = buildRealtimeUiState;

exports.listUsers = exports.getUserList;
exports.userOverview = exports.getUserList;
exports.userListPage = exports.getUserListPage;
exports.blockAccount = exports.blockUser;
exports.unblockAccount = exports.unblockUser;
exports.freezeAccount = exports.freezeUser;
exports.unfreezeAccount = exports.unfreezeUser;
exports.removeUser = exports.deleteUser;
exports.softDeleteUser = exports.deleteUser;
