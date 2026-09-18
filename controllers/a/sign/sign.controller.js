"use strict";

require("dotenv").config();

const crypto = require("crypto");
const bcrypt = require("bcrypt");
const nodemailer = require("nodemailer");
const { pool } = require("../../../includes/conn");

/* =========================================================
   BRAND / EMAIL CONFIG
========================================================= */

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_LABEL = CURRENT_YEAR === 2026 ? "2026" : `2026 - ${CURRENT_YEAR}`;

const COMPANY_NAME = "JOOD | Quality Goods & Products";
const SUPPORT_EMAIL = "info@jood.com";
const SUPPORT_PHONE = "+971 53 37 2440";
const LOGO_URL = "https://telal-contracting.com/logo.png";

const FROM_EMAIL =
  process.env.FROM_EMAIL || process.env.SMTP_USER || "no-reply@example.com";

const APP_BASE_URL = (process.env.APP_BASE_URL || "").replace(/\/+$/, "");

/* =========================================================
   CONFIG
========================================================= */

const OTP_EXPIRES_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;
const OTP_LOCK_MINUTES = 15;

const SESSION_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
const IDLE_LIMIT_MS = 4 * 60 * 1000;

const MASTER_ROLE = "master_admin";
const ALLOWED_ROLES = new Set(["master_admin", "admin", "sub_admin", "viewer"]);
const ALLOWED_STATUSES = new Set(["active", "inactive", "blocked", "deleted"]);

const PATH_SIGN_IN = "/admin/a/sign/in";
const PATH_VERIFY_OTP = "/admin/a/login/verify-otp";
const PATH_DASHBOARD = "/admin/a/dashboard";

const VIEW_SIGN_IN = "admin/a/sign/in";
const VIEW_VERIFY_OTP = "admin/a/login/verify-otp";

/* =========================================================
   DB FIELDS
========================================================= */

const ADMIN_SELECT_FIELDS = `
  id,
  admin_id,
  full_name,
  email,
  phone,
  role,
  status,
  email_verified,
  password,
  otp_hash,
  otp_expires_at,
  otp_attempts,
  otp_sent_at,
  login_attempts,
  last_attempt_time,
  lock_until,
  last_login_at,
  last_logout_at,
  last_activity_at,
  is_online,
  session_version,
  created_by,
  created_at,
  updated_at
`;

const ADMIN_PUBLIC_FIELDS = `
  id,
  admin_id,
  full_name,
  email,
  phone,
  role,
  status,
  email_verified,
  login_attempts,
  last_attempt_time,
  lock_until,
  last_login_at,
  last_logout_at,
  last_activity_at,
  is_online,
  session_version,
  created_by,
  created_at,
  updated_at
`;

/* =========================================================
   HELPERS
========================================================= */

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function sanitizeText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email || ""));
}

function generateOtp() {
  return String(crypto.randomInt(100000, 1000000));
}

function generateAdminId(fullName) {
  const base =
    sanitizeText(fullName)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 12) || "admin";

  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const random = crypto.randomBytes(4).toString("hex");
  return `${base}_${date}_${random}`;
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

function makeAbsoluteUrl(path) {
  if (!path) return APP_BASE_URL || "";
  if (/^https?:\/\//i.test(path)) return path;
  if (!APP_BASE_URL) return path;
  return `${APP_BASE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}

function getCsrfToken(req) {
  if (typeof req?.csrfToken !== "function") return null;
  try {
    return req.csrfToken();
  } catch {
    return null;
  }
}

function renderView(res, req, view, title, options = {}) {
  return res.render(view, {
    title,
    error: options.error || null,
    success: options.success || null,
    old: options.old || {},
    token: options.token || null,
    csrfToken: getCsrfToken(req),
    otpEmail: options.otpEmail || null,
    lockMinutes: options.lockMinutes || 0,
    lockUntil: options.lockUntil || null,
    attemptsLeft:
      typeof options.attemptsLeft === "number" ? options.attemptsLeft : null,
  });
}

function renderSignIn(res, req, options = {}) {
  return renderView(res, req, VIEW_SIGN_IN, "Admin Sign In", options);
}

function renderOtpPage(res, req, options = {}) {
  return renderView(res, req, VIEW_VERIFY_OTP, "Verify OTP", options);
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

function minutesUntilUnlock(lockUntil) {
  if (!lockUntil) return 0;
  const d = new Date(lockUntil);
  if (Number.isNaN(d.getTime())) return 0;
  const diffMs = d.getTime() - Date.now();
  return diffMs > 0 ? Math.ceil(diffMs / 60000) : 0;
}

function isLockedOut(admin) {
  return minutesUntilUnlock(admin?.lock_until) > 0;
}

function lockoutMessage(admin) {
  const remaining = minutesUntilUnlock(admin?.lock_until);
  if (remaining <= 0) return "Too many failed attempts. Please try again later.";
  return `Too many failed attempts. Please try again in ${remaining} minute${remaining > 1 ? "s" : ""}.`;
}

function isMasterAdmin(req) {
  return (
    req.session?.admin?.role === MASTER_ROLE ||
    req.session?.adminRole === MASTER_ROLE
  );
}

function validateRole(role) {
  const clean = String(role || "").trim();
  return ALLOWED_ROLES.has(clean) ? clean : "admin";
}

function validateStatus(status) {
  const clean = String(status || "").trim();
  return ALLOWED_STATUSES.has(clean) ? clean : "active";
}

async function createMailer() {
  if (
    !process.env.SMTP_HOST ||
    !process.env.SMTP_PORT ||
    !process.env.SMTP_USER ||
    !process.env.SMTP_PASS
  ) {
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
  await transporter.sendMail({
    from: FROM_EMAIL,
    to,
    subject,
    html,
    text,
  });
}

function buildEmailTemplate({ title, content, footerNote }) {
  return `
  <div style="margin:0;padding:0;background:#ffffff;font-family:Arial,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0;background:#ffffff;">
      <tr>
        <td align="center">
          <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #eef2f7;border-radius:14px;overflow:hidden;">
            <tr>
              <td style="background:#ffffff;padding:24px 24px 16px;text-align:center;border-bottom:1px solid #eef2f7;">
                <img src="${LOGO_URL}" alt="${COMPANY_NAME} Logo" style="max-height:62px;display:block;margin:0 auto 12px;">
                <div style="font-size:18px;font-weight:700;color:#111827;line-height:1.4;">
                  ${COMPANY_NAME}
                </div>
                <div style="font-size:13px;color:#6b7280;margin-top:4px;">
                  Quality Goods &amp; Products
                </div>
              </td>
            </tr>

            <tr>
              <td style="padding:30px 30px 24px;">
                <div style="font-size:22px;font-weight:700;color:#111827;margin:0 0 16px;">
                  ${title}
                </div>
                <div style="font-size:15px;line-height:1.8;color:#374151;">
                  ${content}
                </div>
              </td>
            </tr>

            <tr>
              <td style="padding:0 30px 24px;">
                <div style="border-top:1px solid #eef2f7;padding-top:18px;color:#6b7280;font-size:13px;line-height:1.8;">
                  <div style="font-weight:700;color:#111827;margin-bottom:4px;">Support</div>
                  <div>
                    Email: <a href="mailto:${SUPPORT_EMAIL}" style="color:#344767;text-decoration:none;">${SUPPORT_EMAIL}</a><br>
                    Phone: ${SUPPORT_PHONE}
                  </div>
                  ${
                    footerNote
                      ? `<div style="margin-top:12px;color:#6b7280;">${footerNote}</div>`
                      : ""
                  }
                </div>
              </td>
            </tr>

            <tr>
              <td style="background:#ffffff;padding:16px 30px;text-align:center;font-size:12px;color:#6b7280;border-top:1px solid #eef2f7;">
                © ${YEAR_LABEL} ${COMPANY_NAME}. All rights reserved.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </div>
  `;
}

function buildOtpEmail(fullName, otp) {
  const safeName = sanitizeText(fullName);
  const greetingLine = safeName ? `Hello ${safeName},` : "Hello,";

  const html = buildEmailTemplate({
    title: "Login OTP",
    content: `
      <p style="margin:0 0 16px;">${greetingLine}</p>
      <p style="margin:0 0 18px;">You requested to sign in. Use the OTP below to continue.</p>
      <div style="text-align:center;margin:24px 0;">
        <div style="display:inline-block;padding:16px 22px;border:1px dashed #d1d5db;border-radius:12px;background:#ffffff;">
          <span style="font-size:32px;font-weight:700;letter-spacing:7px;color:#111827;">${otp}</span>
        </div>
      </div>
      <p style="margin:0 0 12px;">This OTP expires in <strong>${OTP_EXPIRES_MINUTES} minutes</strong>.</p>
      <p style="margin:0;">If you did not request this, please ignore this email or contact support immediately.</p>
    `,
    footerNote: "For security, never share your OTP with anyone.",
  });

  const text = `
${greetingLine}

You requested to sign in.

Your OTP is: ${otp}

This OTP expires in ${OTP_EXPIRES_MINUTES} minutes.

If you did not request this, please contact support immediately.

${COMPANY_NAME}
${SUPPORT_EMAIL}
${SUPPORT_PHONE}
`;

  return { html, text };
}

async function findAdminByEmail(email) {
  const result = await pool.query(
    `
      SELECT ${ADMIN_SELECT_FIELDS}
      FROM admin_accounts
      WHERE LOWER(email) = LOWER($1)
      LIMIT 1
    `,
    [normalizeEmail(email)]
  );
  return result.rows[0] || null;
}

async function findAdminById(id) {
  const result = await pool.query(
    `
      SELECT ${ADMIN_SELECT_FIELDS}
      FROM admin_accounts
      WHERE id = $1
      LIMIT 1
    `,
    [id]
  );
  return result.rows[0] || null;
}

async function findAdminsForOverview() {
  const result = await pool.query(
    `
      SELECT ${ADMIN_PUBLIC_FIELDS}
      FROM admin_accounts
      ORDER BY
        CASE role
          WHEN 'master_admin' THEN 1
          WHEN 'admin' THEN 2
          WHEN 'sub_admin' THEN 3
          ELSE 4
        END,
        created_at DESC
    `
  );
  return result.rows || [];
}

async function countMasterAdmins() {
  const result = await pool.query(
    `
      SELECT COUNT(*)::int AS count
      FROM admin_accounts
      WHERE role = 'master_admin'
        AND status <> 'deleted'
    `
  );
  return result.rows[0]?.count || 0;
}

async function updateAdminOtp(adminId, otpHash, expiresAt) {
  await pool.query(
    `
      UPDATE admin_accounts
      SET otp_hash = $2,
          otp_expires_at = $3,
          otp_attempts = 0,
          otp_sent_at = NOW(),
          last_attempt_time = NOW(),
          updated_at = NOW()
      WHERE id = $1
    `,
    [adminId, otpHash, expiresAt]
  );
}

async function incrementOtpAttempts(adminId) {
  const result = await pool.query(
    `
      UPDATE admin_accounts
      SET otp_attempts = COALESCE(otp_attempts, 0) + 1,
          last_attempt_time = NOW(),
          lock_until = CASE
            WHEN COALESCE(otp_attempts, 0) + 1 > $2
              THEN NOW() + ($3 * INTERVAL '1 minute')
            ELSE lock_until
          END,
          updated_at = NOW()
      WHERE id = $1
      RETURNING otp_attempts, lock_until
    `,
    [adminId, OTP_MAX_ATTEMPTS, OTP_LOCK_MINUTES]
  );

  return result.rows[0] || null;
}

async function incrementLoginAttempts(adminId) {
  const result = await pool.query(
    `
      UPDATE admin_accounts
      SET login_attempts = COALESCE(login_attempts, 0) + 1,
          last_attempt_time = NOW(),
          lock_until = CASE
            WHEN COALESCE(login_attempts, 0) + 1 > $2
              THEN NOW() + ($3 * INTERVAL '1 minute')
            ELSE lock_until
          END,
          updated_at = NOW()
      WHERE id = $1
      RETURNING login_attempts, lock_until
    `,
    [adminId, OTP_MAX_ATTEMPTS, OTP_LOCK_MINUTES]
  );

  return result.rows[0] || null;
}

async function resetLoginAttempts(adminId) {
  await pool.query(
    `
      UPDATE admin_accounts
      SET login_attempts = 0,
          last_attempt_time = NULL,
          lock_until = NULL,
          updated_at = NOW()
      WHERE id = $1
    `,
    [adminId]
  );
}

async function clearAdminOtp(adminId) {
  await pool.query(
    `
      UPDATE admin_accounts
      SET otp_hash = NULL,
          otp_expires_at = NULL,
          otp_attempts = 0,
          lock_until = NULL,
          updated_at = NOW()
      WHERE id = $1
    `,
    [adminId]
  );
}

async function markAdminLoggedIn(adminId) {
  const result = await pool.query(
    `
      UPDATE admin_accounts
      SET login_attempts = 0,
          last_attempt_time = NULL,
          lock_until = NULL,
          is_online = TRUE,
          last_login_at = NOW(),
          last_activity_at = NOW(),
          session_version = COALESCE(session_version, 1) + 1,
          updated_at = NOW()
      WHERE id = $1
      RETURNING ${ADMIN_SELECT_FIELDS}
    `,
    [adminId]
  );

  return result.rows[0] || null;
}

async function markAdminOffline(adminId) {
  await pool.query(
    `
      UPDATE admin_accounts
      SET is_online = FALSE,
          last_logout_at = NOW(),
          last_activity_at = NOW(),
          updated_at = NOW()
      WHERE id = $1
    `,
    [adminId]
  );
}

async function touchAdminActivity(adminId) {
  await pool.query(
    `
      UPDATE admin_accounts
      SET last_activity_at = NOW(),
          is_online = TRUE,
          updated_at = NOW()
      WHERE id = $1
    `,
    [adminId]
  );
}

async function createAdminSession(req, admin) {
  return new Promise((resolve, reject) => {
    if (!req.session) return reject(new Error("Session is not available."));

    req.session.regenerate((err) => {
      if (err) return reject(err);

      const sessionAdmin = {
        id: admin.id,
        admin_id: admin.admin_id || null,
        full_name: admin.full_name || null,
        email: admin.email || null,
        phone: admin.phone || null,
        role: admin.role || "admin",
        loginAt: new Date().toISOString(),
        sessionVersion: admin.session_version || 1,
      };

      req.session.admin = sessionAdmin;
      req.session.adminId = admin.id;
      req.session.adminAdminId = admin.admin_id || null;
      req.session.adminName = admin.full_name || null;
      req.session.adminEmail = admin.email || null;
      req.session.adminPhone = admin.phone || null;
      req.session.adminRole = admin.role || "admin";
      req.session.isAuthenticated = true;
      req.session.loginAt = sessionAdmin.loginAt;
      req.session.sessionVersion = sessionAdmin.sessionVersion;
      req.session.lastActivity = Date.now();
      req.session.cookie.maxAge = SESSION_MAX_AGE;

      req.session.save((saveErr) => {
        if (saveErr) return reject(saveErr);
        resolve(sessionAdmin);
      });
    });
  });
}

function clearPendingAdminLogin(req) {
  if (!req.session) return;
  delete req.session.pendingAdminEmail;
  delete req.session.pendingAdminId;
}

async function finalizeAdminLogin(req, admin) {
  const freshAdmin = await markAdminLoggedIn(admin.id);
  if (!freshAdmin) throw new Error("Unable to finalize admin login.");

  await createAdminSession(req, freshAdmin);
  return freshAdmin;
}

async function createAdminRecord({
  fullName,
  email,
  phone = null,
  passwordHash,
  role = "admin",
  status = "active",
  createdBy = null,
}) {
  const adminId = generateAdminId(fullName);

  const result = await pool.query(
    `
      INSERT INTO admin_accounts
        (
          admin_id,
          full_name,
          email,
          phone,
          password,
          role,
          status,
          email_verified,
          login_attempts,
          last_attempt_time,
          lock_until,
          last_login_at,
          last_logout_at,
          last_activity_at,
          is_online,
          session_version,
          created_by,
          created_at,
          updated_at
        )
      VALUES
        (
          $1::text,
          $2::text,
          $3::text,
          $4::text,
          $5::text,
          $6::text,
          $7::text,
          TRUE,
          0,
          NULL,
          NULL,
          NULL,
          NULL,
          NULL,
          FALSE,
          1,
          $8,
          NOW(),
          NOW()
        )
      RETURNING ${ADMIN_SELECT_FIELDS}
    `,
    [adminId, fullName, email, phone, passwordHash, role, status, createdBy]
  );

  return result.rows[0];
}

/* =========================================================
   VIEWS
========================================================= */

exports.getSignInPage = (req, res) => {
  const currentAdmin = getSessionAdmin(req);
  if (currentAdmin?.id) return res.redirect(PATH_DASHBOARD);
  return renderSignIn(res, req);
};

exports.getOtpPage = (req, res) => {
  const pendingEmail = normalizeEmail(
    req.session?.pendingAdminEmail || req.query?.email
  );

  if (!pendingEmail) return res.redirect(PATH_SIGN_IN);

  return renderOtpPage(res, req, {
    old: { email: pendingEmail },
    otpEmail: pendingEmail,
  });
};

/* =========================================================
   SIGN IN: EMAIL + PASSWORD FIRST, THEN SEND OTP
========================================================= */

exports.postSignIn = async (req, res, next) => {
  try {
    const currentAdmin = getSessionAdmin(req);
    if (currentAdmin?.id) return res.redirect(PATH_DASHBOARD);

    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || "").trim();

    if (!email || !isValidEmail(email)) {
      return renderSignIn(res, req, {
        error: "Please enter a valid email address.",
        old: { email },
      });
    }

    if (!password) {
      return renderSignIn(res, req, {
        error: "Please enter your password.",
        old: { email },
      });
    }

    const admin = await findAdminByEmail(email);

    if (!admin) {
      return renderSignIn(res, req, {
        error: "Admin account not found.",
        old: { email },
      });
    }

    if (admin.status === "deleted") {
      return renderSignIn(res, req, {
        error: "This account has been removed.",
        old: { email },
      });
    }

    if (admin.status !== "active") {
      return renderSignIn(res, req, {
        error: "This account is not active.",
        old: { email },
      });
    }

    if (!admin.email_verified) {
      return renderSignIn(res, req, {
        error: "Email is not verified.",
        old: { email },
      });
    }

    if (isLockedOut(admin)) {
      return renderSignIn(res, req, {
        error: lockoutMessage(admin),
        lockMinutes: minutesUntilUnlock(admin.lock_until),
        lockUntil: admin.lock_until,
        old: { email },
      });
    }

    const passwordHash = String(admin.password || "");
    if (!passwordHash) {
      return renderSignIn(res, req, {
        error: "Password is not configured for this account.",
        old: { email },
      });
    }

    const passwordOk = await bcrypt.compare(password, passwordHash);

    if (!passwordOk) {
      const updated = await incrementLoginAttempts(admin.id);

      if (Number(updated?.login_attempts || 0) > OTP_MAX_ATTEMPTS) {
        return renderSignIn(res, req, {
          error: lockoutMessage(updated),
          lockMinutes: minutesUntilUnlock(updated.lock_until),
          lockUntil: updated.lock_until,
          old: { email },
        });
      }

      return renderSignIn(res, req, {
        error: `Invalid password. Attempts left: ${Math.max(
          0,
          OTP_MAX_ATTEMPTS - Number(updated?.login_attempts || 0)
        )}`,
        old: { email },
      });
    }

    await resetLoginAttempts(admin.id);

    const otp = generateOtp();
    const otpHash = hashToken(otp);
    const expiresAt = new Date(Date.now() + OTP_EXPIRES_MINUTES * 60 * 1000);

    await updateAdminOtp(admin.id, otpHash, expiresAt);

    const mail = buildOtpEmail(admin.full_name, otp);

    try {
      await sendEmailMessage({
        to: admin.email,
        subject: "Your admin login OTP",
        html: mail.html,
        text: mail.text,
      });
    } catch (mailErr) {
      console.error("OTP email failed:", mailErr);
      await clearAdminOtp(admin.id);

      return renderSignIn(res, req, {
        error: "Unable to send OTP email right now. Please try again.",
        old: { email },
      });
    }

    if (!req.session) {
      return renderSignIn(res, req, {
        error: "Session is not available.",
        old: { email },
      });
    }

    req.session.pendingAdminEmail = email;
    req.session.pendingAdminId = admin.id;

    req.session.save((saveErr) => {
      if (saveErr) return next(saveErr);
      return res.redirect(303, PATH_VERIFY_OTP);
    });
  } catch (err) {
    return next(err);
  }
};

/* =========================================================
   OTP VERIFY
========================================================= */

exports.postVerifyOtp = async (req, res, next) => {
  try {
    const email = normalizeEmail(
      req.session?.pendingAdminEmail || req.body?.email
    );
    const pendingId = Number(req.session?.pendingAdminId || 0);
    const enteredOtp = String(req.body?.otp || req.body?.code || "").trim();

    if (!email && !pendingId) {
      return res.redirect(PATH_SIGN_IN);
    }

    if (!enteredOtp) {
      return renderOtpPage(res, req, {
        error: "Please enter the OTP.",
        old: { email },
        otpEmail: email,
      });
    }

    const admin = pendingId
      ? await findAdminById(pendingId)
      : await findAdminByEmail(email);

    if (!admin) {
      clearPendingAdminLogin(req);
      return res.redirect(PATH_SIGN_IN);
    }

    if (admin.status === "deleted") {
      clearPendingAdminLogin(req);
      return res.redirect(PATH_SIGN_IN);
    }

    if (admin.status !== "active") {
      clearPendingAdminLogin(req);
      return res.redirect(PATH_SIGN_IN);
    }

    if (isLockedOut(admin)) {
      clearPendingAdminLogin(req);
      return res.redirect(PATH_SIGN_IN);
    }

    if (!admin.otp_hash || !admin.otp_expires_at) {
      clearPendingAdminLogin(req);
      return res.redirect(PATH_SIGN_IN);
    }

    if (Date.now() > new Date(admin.otp_expires_at).getTime()) {
      await clearAdminOtp(admin.id);
      clearPendingAdminLogin(req);
      return res.redirect(PATH_SIGN_IN);
    }

    const enteredHash = hashToken(enteredOtp);

    if (enteredHash !== admin.otp_hash) {
      const updated = await incrementOtpAttempts(admin.id);
      const attempts = Number(updated?.otp_attempts || 0);

      if (attempts > OTP_MAX_ATTEMPTS) {
        clearPendingAdminLogin(req);
        return res.redirect(PATH_SIGN_IN);
      }

      return renderOtpPage(res, req, {
        error: `Invalid OTP. Attempts left: ${Math.max(
          0,
          OTP_MAX_ATTEMPTS - attempts
        )}`,
        old: { email },
        otpEmail: email,
        attemptsLeft: Math.max(0, OTP_MAX_ATTEMPTS - attempts),
      });
    }

    await clearAdminOtp(admin.id);
    await finalizeAdminLogin(req, admin);
    clearPendingAdminLogin(req);

    return res.redirect(PATH_DASHBOARD);
  } catch (err) {
    return next(err);
  }
};

exports.postResendOtp = async (req, res, next) => {
  try {
    const email = normalizeEmail(
      req.session?.pendingAdminEmail || req.body?.email
    );

    if (!email) {
      return res.redirect(PATH_SIGN_IN);
    }

    const admin = req.session?.pendingAdminId
      ? await findAdminById(req.session.pendingAdminId)
      : await findAdminByEmail(email);

    if (!admin) {
      clearPendingAdminLogin(req);
      return res.redirect(PATH_SIGN_IN);
    }

    if (isLockedOut(admin)) {
      return res.redirect(PATH_SIGN_IN);
    }

    const otp = generateOtp();
    const otpHash = hashToken(otp);
    const expiresAt = new Date(Date.now() + OTP_EXPIRES_MINUTES * 60 * 1000);

    await updateAdminOtp(admin.id, otpHash, expiresAt);

    const mail = buildOtpEmail(admin.full_name, otp);

    try {
      await sendEmailMessage({
        to: admin.email,
        subject: "Your admin login OTP",
        html: mail.html,
        text: mail.text,
      });
    } catch (mailErr) {
      console.error("Resend OTP email failed:", mailErr);
      await clearAdminOtp(admin.id);
      return res.redirect(PATH_SIGN_IN);
    }

    return res.redirect(PATH_VERIFY_OTP);
  } catch (err) {
    return next(err);
  }
};

/* =========================================================
   LOGOUT
========================================================= */

exports.logoutAdmin = async (req, res) => {
  try {
    const current = getSessionAdmin(req);
    if (current?.id) {
      await markAdminOffline(current.id);
    }
  } catch (err) {
    console.error("Logout status update failed:", err);
  }

  if (!req.session) return res.redirect(PATH_SIGN_IN);

  req.session.destroy(() => {
    res.clearCookie("admin_session");
    res.clearCookie("connect.sid");
    return res.redirect(PATH_SIGN_IN);
  });
};

/* =========================================================
   AUTH / IDLE / VERSION CHECK
========================================================= */

exports.ensureAuth = async (req, res, next) => {
  try {
    const sessionAdmin = getSessionAdmin(req);
    if (!sessionAdmin?.id) {
      return res.redirect(PATH_SIGN_IN);
    }

    const loginAt = req.session?.loginAt
      ? new Date(req.session.loginAt).getTime()
      : 0;

    if (!loginAt || Date.now() - loginAt > SESSION_MAX_AGE) {
      try {
        await markAdminOffline(sessionAdmin.id);
      } catch {}

      if (req.session) {
        req.session.destroy(() => {});
      }

      return res.redirect(PATH_SIGN_IN);
    }

    const dbAdmin = await findAdminById(sessionAdmin.id);
    if (!dbAdmin) {
      if (req.session) req.session.destroy(() => {});
      return res.redirect(PATH_SIGN_IN);
    }

    if (dbAdmin.status !== "active") {
      if (req.session) req.session.destroy(() => {});
      return res.redirect(PATH_SIGN_IN);
    }

    const sessionVersion = Number(
      req.session?.sessionVersion || sessionAdmin.sessionVersion || 1
    );
    const dbVersion = Number(dbAdmin.session_version || 1);

    if (sessionVersion !== dbVersion) {
      if (req.session) req.session.destroy(() => {});
      return res.redirect(PATH_SIGN_IN);
    }

    return next();
  } catch (err) {
    return next(err);
  }
};

exports.ensureGuest = (req, res, next) => {
  const admin = getSessionAdmin(req);
  if (!admin?.id) return next();
  return res.redirect(PATH_DASHBOARD);
};

exports.adminActivityMiddleware = async (req, res, next) => {
  try {
    const admin = getSessionAdmin(req);
    if (!admin?.id) return next();

    const lastActivity = Number(req.session?.lastActivity || 0);
    if (lastActivity && Date.now() - lastActivity > IDLE_LIMIT_MS) {
      try {
        await markAdminOffline(admin.id);
      } catch {}

      if (req.session) {
        req.session.destroy(() => {});
      }

      return res.redirect(PATH_SIGN_IN);
    }

    req.session.lastActivity = Date.now();

    try {
      await touchAdminActivity(admin.id);
    } catch {}

    return next();
  } catch (err) {
    return next(err);
  }
};

/* =========================================================
   CURRENT ADMIN / OVERVIEW
========================================================= */

exports.getCurrentAdmin = async (req, res, next) => {
  try {
    const current = getSessionAdmin(req);

    if (!current?.id) {
      return res.status(401).json({ ok: false, loggedIn: false });
    }

    const admin = await findAdminById(current.id);

    if (!admin) {
      if (req.session) req.session.destroy(() => {});
      return res.status(401).json({ ok: false, loggedIn: false });
    }

    if (admin.status !== "active") {
      if (req.session) req.session.destroy(() => {});
      return res.status(401).json({ ok: false, loggedIn: false });
    }

    if (
      Number(req.session?.sessionVersion || 1) !==
      Number(admin.session_version || 1)
    ) {
      if (req.session) req.session.destroy(() => {});
      return res.status(401).json({ ok: false, loggedIn: false });
    }

    await touchAdminActivity(admin.id);

    return res.json({
      ok: true,
      loggedIn: true,
      admin: {
        id: admin.id,
        admin_id: admin.admin_id,
        full_name: admin.full_name,
        email: admin.email,
        phone: admin.phone || null,
        role: admin.role,
        status: admin.status,
        is_online: !!admin.is_online,
        last_login_at: admin.last_login_at,
        last_activity_at: admin.last_activity_at,
        session_version: admin.session_version || 1,
      },
    });
  } catch (err) {
    return next(err);
  }
};

exports.getAdminOverview = async (req, res, next) => {
  try {
    if (!isMasterAdmin(req)) {
      return res.status(403).json({ ok: false, message: "Forbidden" });
    }

    const admins = await findAdminsForOverview();

    return res.json({
      ok: true,
      admins,
    });
  } catch (err) {
    return next(err);
  }
};

/* =========================================================
   MASTER ADMIN ACTIONS
========================================================= */

exports.createAdmin = async (req, res, next) => {
  try {
    if (!isMasterAdmin(req)) {
      return res.status(403).json({ ok: false, message: "Forbidden" });
    }

    const fullName = sanitizeText(req.body?.full_name || req.body?.fullName);
    const email = normalizeEmail(req.body?.email);
    const phone = String(req.body?.phone || "").trim() || null;
    const password = String(req.body?.password || "").trim();
    const role = validateRole(req.body?.role);
    const status = validateStatus(req.body?.status || "active");

    if (!fullName || fullName.length < 2) {
      return res
        .status(400)
        .json({ ok: false, message: "Full name is required." });
    }

    if (!email || !isValidEmail(email)) {
      return res
        .status(400)
        .json({ ok: false, message: "Valid email is required." });
    }

    if (!password || password.length < 6) {
      return res
        .status(400)
        .json({ ok: false, message: "Password must be at least 6 characters." });
    }

    if (!ALLOWED_ROLES.has(role)) {
      return res.status(400).json({ ok: false, message: "Invalid role." });
    }

    if (role === MASTER_ROLE) {
      const masterCount = await countMasterAdmins();
      if (masterCount > 0) {
        return res.status(409).json({
          ok: false,
          message: "Only one master admin is allowed.",
        });
      }
    }

    const exists = await findAdminByEmail(email);
    if (exists) {
      return res
        .status(409)
        .json({ ok: false, message: "Admin email already exists." });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const created = await createAdminRecord({
      fullName,
      email,
      phone,
      passwordHash,
      role,
      status,
      createdBy: req.session?.admin?.id || req.session?.adminId || null,
    });

    return res.status(201).json({
      ok: true,
      message: "Admin created successfully.",
      admin: created,
    });
  } catch (err) {
    return next(err);
  }
};

exports.suspendAdmin = async (req, res, next) => {
  try {
    if (!isMasterAdmin(req)) {
      return res.status(403).json({ ok: false, message: "Forbidden" });
    }

    const adminId = Number(req.body?.adminId || req.body?.id);
    if (!adminId) {
      return res
        .status(400)
        .json({ ok: false, message: "Admin ID is required." });
    }

    const result = await pool.query(
      `
        UPDATE admin_accounts
        SET status = 'blocked',
            session_version = session_version + 1,
            is_online = FALSE,
            last_logout_at = NOW(),
            updated_at = NOW()
        WHERE id = $1
        RETURNING ${ADMIN_PUBLIC_FIELDS}
      `,
      [adminId]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ ok: false, message: "Admin not found." });
    }

    return res.json({
      ok: true,
      message: "Admin suspended.",
      admin: result.rows[0],
    });
  } catch (err) {
    return next(err);
  }
};

exports.activateAdmin = async (req, res, next) => {
  try {
    if (!isMasterAdmin(req)) {
      return res.status(403).json({ ok: false, message: "Forbidden" });
    }

    const adminId = Number(req.body?.adminId || req.body?.id);
    if (!adminId) {
      return res
        .status(400)
        .json({ ok: false, message: "Admin ID is required." });
    }

    const result = await pool.query(
      `
        UPDATE admin_accounts
        SET status = 'active',
            updated_at = NOW()
        WHERE id = $1
        RETURNING ${ADMIN_PUBLIC_FIELDS}
      `,
      [adminId]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ ok: false, message: "Admin not found." });
    }

    return res.json({
      ok: true,
      message: "Admin activated.",
      admin: result.rows[0],
    });
  } catch (err) {
    return next(err);
  }
};

exports.forceLogoutAdmin = async (req, res, next) => {
  try {
    if (!isMasterAdmin(req)) {
      return res.status(403).json({ ok: false, message: "Forbidden" });
    }

    const adminId = Number(req.body?.adminId || req.body?.id);
    if (!adminId) {
      return res
        .status(400)
        .json({ ok: false, message: "Admin ID is required." });
    }

    const result = await pool.query(
      `
        UPDATE admin_accounts
        SET session_version = session_version + 1,
            is_online = FALSE,
            last_logout_at = NOW(),
            updated_at = NOW()
        WHERE id = $1
        RETURNING ${ADMIN_PUBLIC_FIELDS}
      `,
      [adminId]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ ok: false, message: "Admin not found." });
    }

    return res.json({
      ok: true,
      message: "Admin logged out remotely.",
      admin: result.rows[0],
    });
  } catch (err) {
    return next(err);
  }
};

/* =========================================================
   HELPERS EXPORTS
========================================================= */

exports.findAdminByEmail = findAdminByEmail;
exports.findAdminById = findAdminById;
exports.getCsrfToken = getCsrfToken;
exports.generateAdminId = generateAdminId;
exports.buildEmailTemplate = buildEmailTemplate;
exports.buildOtpEmail = buildOtpEmail;