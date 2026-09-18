"use strict";

require("dotenv").config();

const crypto = require("crypto");
const bcrypt = require("bcrypt");
const nodemailer = require("nodemailer");
const { pool } = require("../../../includes/conn");

/* =========================================================
   CONFIG
========================================================= */

const TABLE_NAME = "admin_accounts";
const ADMIN_ROLE = "admin";
const COMPANY_NAME = "JOOD | Quality Goods & Products";
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || "info@jood.com";
const SUPPORT_PHONE = process.env.SUPPORT_PHONE || "+971 53 37 2440";
const LOGO_URL = process.env.LOGO_URL || "https://telal-contracting.com/logo.png";

const FROM_EMAIL = process.env.FROM_EMAIL || process.env.SMTP_USER || "no-reply@example.com";
const APP_BASE_URL = (process.env.APP_BASE_URL || process.env.BASE_URL || "https://telal-contracting.com").replace(/\/+$/, "");
const DEBUG_ADMINS_CONTROLLER = String(process.env.DEBUG_ADMINS_CONTROLLER || "1").toLowerCase() !== "0";

const ALLOWED_STATUSES = new Set(["active", "inactive", "blocked", "deleted"]);
const ACTIONABLE_ROLES = new Set(["super_admin", "master_admin", "admin"]);

const DEFAULT_ADMIN_SELECT_FIELDS = [
  "admin_id",
  "full_name",
  "email",
  "phone",
  "password",
  "role",
  "status",
  "email_verified",
  "login_attempts",
  "last_attempt_time",
  "lock_until",
  "last_login_at",
  "last_logout_at",
  "last_activity_at",
  "is_online",
  "session_version",
  "created_by",
  "created_at",
  "updated_at",
];

const UPDATABLE_FIELDS = new Set([
  "admin_id",
  "full_name",
  "email",
  "phone",
  "password",
  "role",
  "status",
  "email_verified",
  "login_attempts",
  "last_attempt_time",
  "lock_until",
  "last_login_at",
  "last_logout_at",
  "last_activity_at",
  "is_online",
  "session_version",
  "created_by",
  "created_at",
  "updated_at",
]);

let cachedTableColumns = null;

/* =========================================================
   DIAGNOSTICS
========================================================= */

function debugTrace(stage, meta = {}) {
  if (!DEBUG_ADMINS_CONTROLLER) return;
  console.log(`[admins.controller] ${new Date().toISOString()}`, { stage, ...meta });
}

function debugError(stage, err, meta = {}) {
  console.error(`[admins.controller][ERROR] ${stage}`, {
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
    const missing = DEFAULT_ADMIN_SELECT_FIELDS.filter((c) => !cols.has(c));

    debugTrace(stage, {
      table: TABLE_NAME,
      columnCount: cols.size,
      missingColumns: missing,
    });

    if (missing.length) {
      console.warn(`[admins.controller] Table ${TABLE_NAME} is missing columns: ${missing.join(", ")}`);
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
  if (req.session?.admin?.admin_id || req.session?.admin?.id) return req.session.admin;

  if (req.session?.adminId) {
    return {
      admin_id: req.session.adminId,
      id: req.session.adminId,
      full_name: req.session.adminName || null,
      email: req.session.adminEmail || null,
      phone: req.session.adminPhone || null,
      role: req.session.adminRole || "admin",
      session_version: req.session.sessionVersion || 1,
      login_at: req.session.loginAt || null,
    };
  }

  return null;
}

function isAdminActor(req) {
  const role = cleanText(req.session?.admin?.role || req.session?.adminRole || "").toLowerCase();
  return ACTIONABLE_ROLES.has(role);
}

function normalizeStatus(status) {
  const clean = cleanText(status).toLowerCase();
  return ALLOWED_STATUSES.has(clean) ? clean : "active";
}

function generateAdminId(fullName) {
  const base = cleanText(fullName).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12) || "admin";
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

function getEffectiveStatus(admin) {
  const lockUntil = admin?.lock_until ? new Date(admin.lock_until) : null;
  const freezeActive = lockUntil && !Number.isNaN(lockUntil.getTime()) && lockUntil.getTime() > Date.now();
  if (freezeActive) return "frozen";
  return cleanText(admin?.status || "active").toLowerCase();
}

function actionLabel(action) {
  switch (String(action || "").toLowerCase()) {
    case "block": return "Blocked";
    case "unblock": return "Unblocked";
    case "freeze": return "Frozen";
    case "unfreeze": return "Unfrozen";
    case "delete": return "Deleted";
    case "restore": return "Restored";
    case "create": return "Created";
    case "update": return "Updated";
    default: return "Updated";
  }
}

function buildPublicUrl(path) {
  return makeAbsoluteUrl(path);
}

function escapeLike(value) {
  return String(value || "").replace(/[\\%_]/g, "\\$&");
}

function normalizeAdminRow(row) {
  if (!row) return null;
  const admin = { ...row };
  admin.effective_status = getEffectiveStatus(admin);
  admin.freeze_remaining_minutes = minutesUntil(admin.lock_until);
  return admin;
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
    case "admin:created": return "create";
    case "admin:updated": return "update";
    case "admin:blocked": return "block";
    case "admin:unblocked": return "unblock";
    case "admin:frozen": return "freeze";
    case "admin:unfrozen": return "unfreeze";
    case "admin:deleted": return "delete";
    case "admin:restored": return "restore";
    default: return "update";
  }
}

function buildRealtimeUiState(admin, action = "") {
  const effective = getEffectiveStatus(admin);
  const actionClean = cleanText(action).toLowerCase();

  const stateByStatus = {
    active: {
      badge: "Active",
      badgeClass: "success",
      primaryButton: { text: "Block", action: "block", variant: "danger" },
      secondaryButton: { text: "Freeze", action: "freeze", variant: "warning" },
      dangerButton: { text: "Delete", action: "delete", variant: "dark" },
      can: { block: true, unblock: false, freeze: true, unfreeze: false, delete: true, restore: false },
    },
    inactive: {
      badge: "Inactive",
      badgeClass: "secondary",
      primaryButton: { text: "Activate", action: "restore", variant: "success" },
      secondaryButton: { text: "Block", action: "block", variant: "danger" },
      dangerButton: { text: "Delete", action: "delete", variant: "dark" },
      can: { block: true, unblock: false, freeze: true, unfreeze: false, delete: true, restore: true },
    },
    blocked: {
      badge: "Blocked",
      badgeClass: "danger",
      primaryButton: { text: "Unblock", action: "unblock", variant: "success" },
      secondaryButton: { text: "Freeze", action: "freeze", variant: "warning" },
      dangerButton: { text: "Delete", action: "delete", variant: "dark" },
      can: { block: false, unblock: true, freeze: true, unfreeze: false, delete: true, restore: false },
    },
    deleted: {
      badge: "Deleted",
      badgeClass: "dark",
      primaryButton: { text: "Restore", action: "restore", variant: "success" },
      secondaryButton: null,
      dangerButton: null,
      can: { block: false, unblock: false, freeze: false, unfreeze: false, delete: false, restore: true },
    },
    frozen: {
      badge: "Frozen",
      badgeClass: "warning",
      primaryButton: { text: "Unfreeze", action: "unfreeze", variant: "success" },
      secondaryButton: { text: "Block", action: "block", variant: "danger" },
      dangerButton: { text: "Delete", action: "delete", variant: "dark" },
      can: { block: true, unblock: false, freeze: false, unfreeze: true, delete: true, restore: false },
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
    can: base.can,
    freeze_remaining_minutes: minutesUntil(admin?.lock_until),
  };
}

/* =========================================================
   EMAIL TEMPLATE
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

function buildAdminCredentialsEmail(fullName, email, plainPassword) {
  const safeName = cleanText(fullName);
  const greeting = safeName ? `Hello ${safeName},` : "Hello,";

  const html = buildEmailTemplate({
    title: "Your admin account has been created",
    content: `
      <p style="margin:0 0 16px;">${greeting}</p>
      <p style="margin:0 0 16px;">Your admin account has been created successfully.</p>
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

Your admin account has been created successfully.

Email: ${cleanText(email)}
Password: ${cleanText(plainPassword)}

Please sign in and change your password after login.

${COMPANY_NAME}
${SUPPORT_EMAIL}
${SUPPORT_PHONE}
`;

  return { html, text };
}

function buildActionEmail({ fullName, action, actorName, details }) {
  const safeName = cleanText(fullName);
  const greeting = safeName ? `Hello ${safeName},` : "Hello,";
  const label = actionLabel(action);
  const safeActor = cleanText(actorName || "System");
  const safeDetails = cleanText(details || "");

  const html = buildEmailTemplate({
    title: `Admin Account ${label}`,
    content: `
      <p style="margin:0 0 16px;">${greeting}</p>
      <p style="margin:0 0 16px;">Your admin account status has been changed.</p>
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

Your admin account status has been changed.

Action: ${label}
Performed by: ${safeActor}
${safeDetails ? `Details: ${safeDetails}\n` : ""}Time: ${new Date().toLocaleString()}

${COMPANY_NAME}
${SUPPORT_EMAIL}
${SUPPORT_PHONE}
`;

  return { html, text };
}

/* =========================================================
   DB HELPERS
========================================================= */

async function findAdminByEmail(email) {
  const result = await pool.query(
    `
      SELECT *
      FROM ${TABLE_NAME}
      WHERE LOWER(email) = LOWER($1)
      LIMIT 1
    `,
    [normalizeEmail(email)]
  );
  return normalizeAdminRow(result.rows[0] || null);
}

async function findAdminById(id) {
  const result = await pool.query(
    `
      SELECT *
      FROM ${TABLE_NAME}
      WHERE admin_id = $1
      LIMIT 1
    `,
    [id]
  );
  return normalizeAdminRow(result.rows[0] || null);
}

async function countAdmins(filter = {}) {
  const clauses = [`role = $1`];
  const values = [ADMIN_ROLE];

  if (filter.q) {
    values.push(`%${escapeLike(filter.q)}%`);
    clauses.push(
      `(full_name ILIKE $${values.length} ESCAPE '\\' OR email ILIKE $${values.length} ESCAPE '\\' OR admin_id ILIKE $${values.length} ESCAPE '\\')`
    );
  }

  if (filter.status && ALLOWED_STATUSES.has(String(filter.status).toLowerCase())) {
    values.push(String(filter.status).toLowerCase());
    clauses.push(`status = $${values.length}`);
  }

  const where = `WHERE ${clauses.join(" AND ")}`;
  const result = await pool.query(`SELECT COUNT(*)::int AS count FROM ${TABLE_NAME} ${where}`, values);
  return result.rows[0]?.count || 0;
}

async function listAdminsQuery({ q = "", status = "", page = 1, limit = 1000 } = {}) {
  const clauses = [`role = $1`];
  const values = [ADMIN_ROLE];
  let idx = 2;

  if (q) {
    values.push(`%${escapeLike(q)}%`);
    clauses.push(
      `(full_name ILIKE $${idx} ESCAPE '\\' OR email ILIKE $${idx} ESCAPE '\\' OR admin_id ILIKE $${idx} ESCAPE '\\')`
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
        admin_id DESC
      LIMIT $${idx}
      OFFSET $${idx + 1}
    `,
    values
  );

  const total = await countAdmins({ q, status });

  return {
    rows: (result.rows || []).map(normalizeAdminRow),
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      pages: Math.max(1, Math.ceil(total / safeLimit)),
    },
  };
}

async function updateAdminFields(adminId, fields = {}) {
  const existingColumns = await getTableColumns();
  const safeFields = filterExistingFields(fields, existingColumns);
  const keys = Object.keys(safeFields);

  if (!keys.length) return findAdminById(adminId);

  const setParts = [];
  const values = [adminId];
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
      WHERE admin_id = $1
      RETURNING *
    `,
    values
  );

  return normalizeAdminRow(result.rows[0] || null);
}

async function refreshExpiredFreeze(adminId) {
  const columns = await getTableColumns();
  if (!columns.has("lock_until")) return findAdminById(adminId);

  const setParts = ["lock_until = NULL"];
  if (columns.has("updated_at")) setParts.push("updated_at = NOW()");

  const result = await pool.query(
    `
      UPDATE ${TABLE_NAME}
      SET ${setParts.join(", ")}
      WHERE admin_id = $1
        AND lock_until IS NOT NULL
        AND lock_until <= NOW()
      RETURNING *
    `,
    [adminId]
  );

  return normalizeAdminRow(result.rows[0] || null);
}

async function insertAdminRecord(data = {}) {
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
  return normalizeAdminRow(result.rows[0] || null);
}

/* =========================================================
   REAL-TIME HELPERS
========================================================= */

function emitAdminEvent(req, eventName, payload = {}) {
  const io = req.app?.get?.("io") || req.app?.get?.("socketio") || req.app?.locals?.io;
  if (!io || typeof io.emit !== "function") return;

  const admin = payload.admin ? normalizeAdminRow(payload.admin) : null;
  const action = payload.action || inferActionFromEvent(eventName);
  const ui = admin ? buildRealtimeUiState(admin, action) : null;
  const at = payload.at || new Date().toISOString();

  const eventPayload = {
    ...payload,
    event: eventName,
    action,
    at,
    admin,
    ui,
  };

  io.emit(eventName, eventPayload);
  io.emit("admin:realtime", eventPayload);
}

/* =========================================================
   NOTIFY
========================================================= */

async function notifyAdminAction({ req, admin, action, details = "" }) {
  try {
    const email = admin?.email;
    if (!email) return;

    const subject = `Account ${actionLabel(action)}`;
    const { html, text } = buildActionEmail({
      fullName: admin?.full_name,
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
    debugError("notifyAdminAction", err, {
      adminId: admin?.admin_id || null,
      email: admin?.email || null,
      action,
    });
  }
}

function ensureAdminAccess(req, res) {
  const actor = getSessionAdmin(req);
  const role = cleanText(actor?.role || req.session?.admin?.role || req.session?.adminRole || "").toLowerCase();
  if (!actor?.admin_id && !actor?.id && !ACTIONABLE_ROLES.has(role)) {
    res.status(401).json({ ok: false, message: "Unauthorized" });
    return null;
  }
  return actor;
}

/* =========================================================
   PAGE RENDER
========================================================= */

exports.getAdminListPage = async (req, res, next) => {
  try {
    const actor = ensureAdminAccess(req, res);
    if (!actor) return;

    debugTrace("getAdminListPage:start", {
      actorId: actor?.admin_id || actor?.id || null,
      actorRole: actor?.role || null,
    });

    await logSchemaDiagnostics("getAdminListPage:schema");

    const q = cleanText(req.query?.q || "");
    const status = cleanText(req.query?.status || "").toLowerCase();

    const result = await listAdminsQuery({ q, status, page: 1, limit: 1000 });
    const admins = [];

    for (const row of result.rows) {
      const refreshed = await refreshExpiredFreeze(row.admin_id);
      admins.push(refreshed || row);
    }

    return res.render("admin/a/profile/admins", {
      admin: actor,
      user: actor,
      sessionAdmin: actor,
      admins,
      adminList: admins,
      dataAdmins: admins,
      pagination: result.pagination,
      csrfToken: getCsrfToken(req),
    });
  } catch (err) {
    debugError("getAdminListPage", err, { query: req.query || {} });
    return next(err);
  }
};

/* =========================================================
   LIST / DETAILS
========================================================= */

exports.getAdminList = async (req, res, next) => {
  try {
    const actor = ensureAdminAccess(req, res);
    if (!actor) return;

    debugTrace("getAdminList:start", {
      actorId: actor?.admin_id || actor?.id || null,
      actorRole: actor?.role || null,
      query: req.query || {},
    });

    await logSchemaDiagnostics("getAdminList:schema");

    const q = cleanText(req.query?.q || req.body?.q);
    const status = cleanText(req.query?.status || req.body?.status).toLowerCase();
    const page = Number(req.query?.page || req.body?.page || 1);
    const limit = Number(req.query?.limit || req.body?.limit || 1000);

    const result = await listAdminsQuery({ q, status, page, limit });
    const rows = [];

    for (const admin of result.rows) {
      const refreshed = await refreshExpiredFreeze(admin.admin_id);
      rows.push(refreshed || normalizeAdminRow(admin));
    }

    return res.json({
      ok: true,
      admins: rows,
      data: rows,
      pagination: result.pagination,
    });
  } catch (err) {
    debugError("getAdminList", err, { query: req.query || {}, body: req.body || {} });
    return next(err);
  }
};

exports.getAdminById = async (req, res, next) => {
  try {
    const actor = ensureAdminAccess(req, res);
    if (!actor) return;

    const adminId = cleanText(req.params?.admin_id || req.params?.id || req.body?.admin_id || req.body?.id);
    if (!adminId) {
      return res.status(400).json({ ok: false, message: "Admin ID is required." });
    }

    const refreshed = await refreshExpiredFreeze(adminId);
    const admin = refreshed || (await findAdminById(adminId));

    if (!admin) {
      return res.status(404).json({ ok: false, message: "Admin not found." });
    }

    return res.json({ ok: true, admin: normalizeAdminRow(admin) });
  } catch (err) {
    debugError("getAdminById", err, { id: req.params?.admin_id || req.params?.id || null });
    return next(err);
  }
};

/* =========================================================
   CREATE / UPDATE
========================================================= */

exports.createAdmin = async (req, res, next) => {
  try {
    const actor = ensureAdminAccess(req, res);
    if (!actor) return;

    debugTrace("createAdmin:start", { actorId: actor?.admin_id || actor?.id || null, bodyKeys: Object.keys(req.body || {}) });

    const fullName = truncateText(req.body?.full_name ?? req.body?.fullName, 80);
    const email = normalizeEmail(req.body?.email);
    const phone = normalizePhone(req.body?.phone ?? req.body?.phone_number);
    const role = cleanText(req.body?.role || ADMIN_ROLE).toLowerCase() || ADMIN_ROLE;
    const status = normalizeStatus(req.body?.status || "active");
    const createdBy = cleanText(req.body?.created_by || actor?.admin_id || actor?.id || null) || null;

    if (!fullName || fullName.length < 2) {
      return res.status(400).json({ ok: false, message: "Full name is required." });
    }
    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ ok: false, message: "Please enter a valid email address." });
    }
    if (phone && !isValidPhone(phone)) {
      return res.status(400).json({ ok: false, message: "Please enter a valid phone number." });
    }
    if (role !== ADMIN_ROLE) {
      return res.status(400).json({ ok: false, message: `Admin role must be '${ADMIN_ROLE}'.` });
    }

    const exists = await findAdminByEmail(email);
    if (exists) {
      return res.status(409).json({ ok: false, message: "Admin email already exists." });
    }

    const plainPassword = generateStrongPassword(12);
    const passwordHash = await bcrypt.hash(plainPassword, 12);
    const adminId = generateAdminId(fullName);

    const admin = await insertAdminRecord({
      admin_id: adminId,
      full_name: fullName,
      email,
      phone,
      password: passwordHash,
      role: ADMIN_ROLE,
      status,
      email_verified: false,
      login_attempts: 0,
      last_attempt_time: null,
      lock_until: null,
      last_login_at: null,
      last_logout_at: null,
      last_activity_at: null,
      is_online: false,
      session_version: 1,
      created_by: createdBy,
    });

    try {
      const mail = buildAdminCredentialsEmail(fullName, email, plainPassword);
      await sendEmailMessage({
        to: email,
        subject: "Your admin account has been created",
        html: mail.html,
        text: mail.text,
      });

      const actorEmail = normalizeEmail(req.session?.admin?.email || req.session?.adminEmail || actor?.email || "");
      if (actorEmail && actorEmail !== email) {
        const adminMail = buildActionEmail({
          fullName,
          action: "create",
          actorName: cleanText(actor?.full_name || req.session?.adminName || "System"),
          details: `Role: ${ADMIN_ROLE}`,
        });

        await sendEmailMessage({
          to: actorEmail,
          subject: "New admin created",
          html: adminMail.html,
          text: adminMail.text,
        });
      }
    } catch (mailErr) {
      debugError("createAdmin:email", mailErr, { email, adminId: admin?.admin_id || null });
    }

    emitAdminEvent(req, "admin:created", { admin, by: actor?.admin_id || actor?.id || null, at: new Date().toISOString() });

    return res.status(201).json({
      ok: true,
      message: "Admin created successfully.",
      admin,
      tempPassword: plainPassword,
    });
  } catch (err) {
    debugError("createAdmin", err, { body: req.body || {} });
    return next(err);
  }
};

exports.updateAdmin = async (req, res, next) => {
  try {
    const actor = ensureAdminAccess(req, res);
    if (!actor) return;

    const adminId = cleanText(req.params?.admin_id || req.params?.id || req.body?.admin_id || req.body?.id);
    if (!adminId) {
      return res.status(400).json({ ok: false, message: "Admin ID is required." });
    }

    const existing = await findAdminById(adminId);
    if (!existing) {
      return res.status(404).json({ ok: false, message: "Admin not found." });
    }

    const fullName = truncateText(req.body?.full_name ?? req.body?.fullName, 80);
    const email = normalizeEmail(req.body?.email);
    const phone = normalizePhone(req.body?.phone ?? req.body?.phone_number);
    const status = normalizeStatus(req.body?.status || existing.status);
    const role = cleanText(req.body?.role || existing.role || ADMIN_ROLE).toLowerCase() || ADMIN_ROLE;

    if (role !== ADMIN_ROLE) {
      return res.status(400).json({ ok: false, message: `Admin role must be '${ADMIN_ROLE}'.` });
    }

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
    fields.role = ADMIN_ROLE;

    const updated = await updateAdminFields(adminId, fields);

    try {
      await notifyAdminAction({
        req,
        admin: updated,
        action: "update",
        details: Object.keys(fields).join(", "),
      });
    } catch (mailErr) {
      debugError("updateAdmin:notify", mailErr, { adminId });
    }

    emitAdminEvent(req, "admin:updated", { admin: updated, by: actor?.admin_id || actor?.id || null, at: new Date().toISOString() });

    return res.json({ ok: true, message: "Admin updated successfully.", admin: updated });
  } catch (err) {
    debugError("updateAdmin", err, { body: req.body || {}, params: req.params || {} });
    return next(err);
  }
};

/* =========================================================
   ACTIONS
========================================================= */

exports.blockAdmin = async (req, res, next) => {
  try {
    const actor = ensureAdminAccess(req, res);
    if (!actor) return;

    const adminId = cleanText(req.params?.admin_id || req.params?.id || req.body?.admin_id || req.body?.id);
    if (!adminId) return res.status(400).json({ ok: false, message: "Admin ID is required." });

    const reason = truncateText(req.body?.reason, 255);
    const admin = await findAdminById(adminId);
    if (!admin) return res.status(404).json({ ok: false, message: "Admin not found." });

    const updated = await updateAdminFields(adminId, {
      status: "blocked",
      lock_until: null,
      is_online: false,
      last_logout_at: new Date(),
    });

    await notifyAdminAction({ req, admin: updated, action: "block", details: reason || "Account access blocked by admin." });

    emitAdminEvent(req, "admin:blocked", {
      admin: updated,
      reason: reason || null,
      by: actor?.admin_id || actor?.id || null,
      at: new Date().toISOString(),
    });

    return res.json({ ok: true, message: "Admin blocked successfully.", admin: updated });
  } catch (err) {
    debugError("blockAdmin", err, { body: req.body || {}, params: req.params || {} });
    return next(err);
  }
};

exports.unblockAdmin = async (req, res, next) => {
  try {
    const actor = ensureAdminAccess(req, res);
    if (!actor) return;

    const adminId = cleanText(req.params?.admin_id || req.params?.id || req.body?.admin_id || req.body?.id);
    if (!adminId) return res.status(400).json({ ok: false, message: "Admin ID is required." });

    const admin = await findAdminById(adminId);
    if (!admin) return res.status(404).json({ ok: false, message: "Admin not found." });

    const updated = await updateAdminFields(adminId, {
      status: "active",
      lock_until: null,
      login_attempts: 0,
      last_attempt_time: null,
    });

    await notifyAdminAction({ req, admin: updated, action: "unblock", details: "Account access restored." });

    emitAdminEvent(req, "admin:unblocked", { admin: updated, by: actor?.admin_id || actor?.id || null, at: new Date().toISOString() });

    return res.json({ ok: true, message: "Admin unblocked successfully.", admin: updated });
  } catch (err) {
    debugError("unblockAdmin", err, { body: req.body || {}, params: req.params || {} });
    return next(err);
  }
};

exports.freezeAdmin = async (req, res, next) => {
  try {
    const actor = ensureAdminAccess(req, res);
    if (!actor) return;

    const adminId = cleanText(req.params?.admin_id || req.params?.id || req.body?.admin_id || req.body?.id);
    const freezeUntilRaw = req.body?.freeze_until || req.body?.until || req.body?.lock_until;
    if (!adminId) return res.status(400).json({ ok: false, message: "Admin ID is required." });

    const admin = await findAdminById(adminId);
    if (!admin) return res.status(404).json({ ok: false, message: "Admin not found." });

    const until = freezeUntilRaw ? new Date(freezeUntilRaw) : null;
    if (!until || Number.isNaN(until.getTime())) {
      return res.status(400).json({ ok: false, message: "Please provide a valid freeze date and time." });
    }
    if (until.getTime() <= Date.now()) {
      return res.status(400).json({ ok: false, message: "Freeze time must be in the future." });
    }

    const updated = await updateAdminFields(adminId, {
      lock_until: until,
      status: admin.status === "deleted" ? "deleted" : admin.status || "active",
    });

    await notifyAdminAction({ req, admin: updated, action: "freeze", details: `Frozen until ${until.toLocaleString()}` });

    emitAdminEvent(req, "admin:frozen", {
      admin: updated,
      freeze_until: until.toISOString(),
      freeze_remaining_minutes: minutesUntil(until),
      by: actor?.admin_id || actor?.id || null,
      at: new Date().toISOString(),
    });

    return res.json({
      ok: true,
      message: `Admin frozen until ${until.toLocaleString()}.`,
      admin: normalizeAdminRow({
        ...updated,
        effective_status: "frozen",
        freeze_remaining_minutes: minutesUntil(until),
      }),
    });
  } catch (err) {
    debugError("freezeAdmin", err, { body: req.body || {}, params: req.params || {} });
    return next(err);
  }
};

exports.unfreezeAdmin = async (req, res, next) => {
  try {
    const actor = ensureAdminAccess(req, res);
    if (!actor) return;

    const adminId = cleanText(req.params?.admin_id || req.params?.id || req.body?.admin_id || req.body?.id);
    if (!adminId) return res.status(400).json({ ok: false, message: "Admin ID is required." });

    const admin = await findAdminById(adminId);
    if (!admin) return res.status(404).json({ ok: false, message: "Admin not found." });

    const updated = await updateAdminFields(adminId, { lock_until: null });

    await notifyAdminAction({ req, admin: updated, action: "unfreeze", details: "Freeze period removed." });

    emitAdminEvent(req, "admin:unfrozen", { admin: updated, by: actor?.admin_id || actor?.id || null, at: new Date().toISOString() });

    return res.json({ ok: true, message: "Admin unfrozen successfully.", admin: updated });
  } catch (err) {
    debugError("unfreezeAdmin", err, { body: req.body || {}, params: req.params || {} });
    return next(err);
  }
};

exports.deleteAdmin = async (req, res, next) => {
  try {
    const actor = ensureAdminAccess(req, res);
    if (!actor) return;

    const adminId = cleanText(req.params?.admin_id || req.params?.id || req.body?.admin_id || req.body?.id);
    if (!adminId) return res.status(400).json({ ok: false, message: "Admin ID is required." });

    const reason = truncateText(req.body?.reason, 255);
    const admin = await findAdminById(adminId);
    if (!admin) return res.status(404).json({ ok: false, message: "Admin not found." });

    const updated = await updateAdminFields(adminId, {
      status: "deleted",
      lock_until: null,
      is_online: false,
      last_logout_at: new Date(),
    });

    await notifyAdminAction({ req, admin: updated, action: "delete", details: reason || "Account marked as deleted." });

    emitAdminEvent(req, "admin:deleted", {
      admin: updated,
      reason: reason || null,
      by: actor?.admin_id || actor?.id || null,
      at: new Date().toISOString(),
    });

    return res.json({ ok: true, message: "Admin deleted successfully.", admin: updated });
  } catch (err) {
    debugError("deleteAdmin", err, { body: req.body || {}, params: req.params || {} });
    return next(err);
  }
};

exports.restoreAdmin = async (req, res, next) => {
  try {
    const actor = ensureAdminAccess(req, res);
    if (!actor) return;

    const adminId = cleanText(req.params?.admin_id || req.params?.id || req.body?.admin_id || req.body?.id);
    if (!adminId) return res.status(400).json({ ok: false, message: "Admin ID is required." });

    const admin = await findAdminById(adminId);
    if (!admin) return res.status(404).json({ ok: false, message: "Admin not found." });

    const updated = await updateAdminFields(adminId, { status: "active", lock_until: null });

    await notifyAdminAction({ req, admin: updated, action: "restore", details: "Account restored by admin." });

    emitAdminEvent(req, "admin:restored", { admin: updated, by: actor?.admin_id || actor?.id || null, at: new Date().toISOString() });

    return res.json({ ok: true, message: "Admin restored successfully.", admin: updated });
  } catch (err) {
    debugError("restoreAdmin", err, { body: req.body || {}, params: req.params || {} });
    return next(err);
  }
};

/* =========================================================
   AUTO-UNFREEZE SYNC
========================================================= */

exports.syncExpiredAdminFreezes = async (req, res, next) => {
  try {
    const actor = ensureAdminAccess(req, res);
    if (!actor) return;

    debugTrace("syncExpiredAdminFreezes:start", { actorId: actor?.admin_id || actor?.id || null });

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
        WHERE role = $1
          AND lock_until IS NOT NULL
          AND lock_until <= NOW()
        RETURNING *
      `,
      [ADMIN_ROLE]
    );

    const changedAdmins = (result.rows || []).map(normalizeAdminRow);

    for (const admin of changedAdmins) {
      emitAdminEvent(req, "admin:unfrozen", { admin, auto: true, at: new Date().toISOString() });
      await notifyAdminAction({ req, admin, action: "unfreeze", details: "Freeze period expired automatically." });
    }

    debugTrace("syncExpiredAdminFreezes:done", { count: changedAdmins.length });

    return res.json({ ok: true, message: "Expired freeze records synced successfully.", count: changedAdmins.length });
  } catch (err) {
    debugError("syncExpiredAdminFreezes", err, { body: req.body || {}, query: req.query || {} });
    return next(err);
  }
};

/* =========================================================
   GENERIC ACTION ENDPOINT
========================================================= */

exports.updateAdminStatusAction = async (req, res, next) => {
  try {
    const action = cleanText(req.body?.action || req.params?.action).toLowerCase();
    debugTrace("updateAdminStatusAction", { action });

    switch (action) {
      case "block":
        return exports.blockAdmin(req, res, next);
      case "unblock":
        return exports.unblockAdmin(req, res, next);
      case "freeze":
        return exports.freezeAdmin(req, res, next);
      case "unfreeze":
        return exports.unfreezeAdmin(req, res, next);
      case "delete":
        return exports.deleteAdmin(req, res, next);
      case "restore":
        return exports.restoreAdmin(req, res, next);
      default:
        return res.status(400).json({ ok: false, message: "Invalid action." });
    }
  } catch (err) {
    debugError("updateAdminStatusAction", err, { body: req.body || {}, params: req.params || {} });
    return next(err);
  }
};

/* =========================================================
   HEALTH / DEBUG
========================================================= */

exports.getAdminControllerDebug = async (req, res) => {
  const actor = getSessionAdmin(req);
  const schema = await logSchemaDiagnostics("debug_endpoint");

  return res.json({
    ok: true,
    table: TABLE_NAME,
    roleFilter: ADMIN_ROLE,
    actor: actor
      ? {
          admin_id: actor.admin_id || actor.id || null,
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

exports.findAdminByEmail = findAdminByEmail;
exports.findAdminById = findAdminById;
exports.generateAdminId = generateAdminId;
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
exports.notifyAdminAction = notifyAdminAction;
exports.emitAdminEvent = emitAdminEvent;
exports.refreshExpiredFreeze = refreshExpiredFreeze;
exports.cleanText = cleanText;
exports.normalizeEmail = normalizeEmail;
exports.normalizePhone = normalizePhone;
exports.isValidEmail = isValidEmail;
exports.isValidPhone = isValidPhone;
exports.updateAdminFields = updateAdminFields;
exports.listAdminsQuery = listAdminsQuery;
exports.countAdmins = countAdmins;
exports.getTableColumns = getTableColumns;
exports.logSchemaDiagnostics = logSchemaDiagnostics;
exports.normalizeAdminRow = normalizeAdminRow;
exports.buildRealtimeUiState = buildRealtimeUiState;
exports.insertAdminRecord = insertAdminRecord;
exports.syncExpiredAdminFreezes = exports.syncExpiredAdminFreezes;

exports.listAdmins = exports.getAdminList;
exports.adminOverview = exports.getAdminList;
exports.adminListPage = exports.getAdminListPage;
exports.blockAccount = exports.blockAdmin;
exports.unblockAccount = exports.unblockAdmin;
exports.freezeAccount = exports.freezeAdmin;
exports.unfreezeAccount = exports.unfreezeAdmin;
exports.removeAdmin = exports.deleteAdmin;
exports.softDeleteAdmin = exports.deleteAdmin;
