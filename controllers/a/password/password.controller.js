"use strict";

require("dotenv").config();

const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");
const { pool } = require("../../../includes/conn");

const OTP_EXPIRES_MINUTES = 10;
const LINK_EXPIRES_MINUTES = 15;
const OTP_MAX_ATTEMPTS = 5;
const RECOVERY_SESSION_MAX_AGE = 15 * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;

// Views
const VIEW_FORGOT_PASSWORD = "admin/a/password/forgot/recovery";
const VIEW_VERIFY_OTP = "admin/a/password/forgot/verify-otp";
const VIEW_RECOVER_PASSWORD = "admin/a/password/forgot/update";

// URLs
const ADMIN_FORGOT_URL = "/admin/a/password/forgot/recovery";
const ADMIN_VERIFY_OTP_URL = "/admin/a/password/forgot/verify-otp";
const ADMIN_PASSWORD_RECOVERY_URL = "/admin/a/password/forgot/update";
const ADMIN_RESET_URL = ADMIN_PASSWORD_RECOVERY_URL;
const ADMIN_SIGN_IN_URL = process.env.ADMIN_SIGN_IN_URL || "/admin/a/sign/in";

// Branding / support
const CURRENT_YEAR = new Date().getFullYear();
const YEAR_LABEL = CURRENT_YEAR === 2026 ? "2026" : `2026 - ${CURRENT_YEAR}`;
const COMPANY_NAME = "JOOD | Quality Goods & Products";
const SUPPORT_EMAIL = "info@jood.com";
const SUPPORT_PHONE = "+971 53 37 2440";
const LOGO_URL = "https://telal-contracting.com/logo.png";

const FROM_EMAIL =
  process.env.FROM_EMAIL || process.env.SMTP_USER || "no-reply@example.com";

let cachedPasswordColumn = null;

/* =========================================================
   HELPERS
========================================================= */

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function sanitizeText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function isStrongPassword(password) {
  const value = String(password || "");
  return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/.test(value);
}

function generateOtp() {
  return String(crypto.randomInt(100000, 1000000));
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

function getIdentifier(req) {
  const raw =
    req.body?.identifier ||
    req.body?.email ||
    req.query?.identifier ||
    req.query?.email ||
    "";

  const trimmed = String(raw || "").trim();
  if (!trimmed) return "";
  return normalizeEmail(trimmed);
}

function getRecoveryMode(req) {
  const raw = String(
    req.body?.recovery_mode ||
      req.body?.mode ||
      req.query?.recovery_mode ||
      req.query?.mode ||
      "otp"
  )
    .trim()
    .toLowerCase();

  return raw === "link" ? "link" : "otp";
}

function getBaseUrl(req) {
  const envBase =
    String(process.env.BASE_URL || process.env.APP_BASE_URL || "").trim() || "";
  if (envBase) return envBase.replace(/\/+$/, "");

  const host = req.get("host") || "localhost:4000";
  const proto =
    String(req.headers["x-forwarded-proto"] || req.protocol || "http")
      .split(",")[0]
      .trim();
  return `${proto}://${host}`;
}

function buildResetLink(req, token) {
  return `${getBaseUrl(req)}${ADMIN_RESET_URL}?token=${encodeURIComponent(token)}`;
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
    csrfToken: getCsrfToken(req),

    // OTP / recovery locals expected by EJS
    otpEmail: options.otpEmail || options.otpTarget || null,
    maskedEmail: options.maskedEmail || options.maskedTarget || null,
    otpTarget: options.otpTarget || null,
    maskedTarget: options.maskedTarget || null,

    recoveryMode: options.recoveryMode || "otp",
    attemptsLeft:
      typeof options.attemptsLeft === "number" ? options.attemptsLeft : null,

    // shared branding/support locals for views
    SUPPORT_EMAIL,
    SUPPORT_PHONE,
    COMPANY_NAME,
    LOGO_URL,
    YEAR_LABEL,
  });
}

function renderForgotPassword(res, req, options = {}) {
  return renderView(res, req, VIEW_FORGOT_PASSWORD, "Forgot Password", options);
}

function renderVerifyOtp(res, req, options = {}) {
  return renderView(res, req, VIEW_VERIFY_OTP, "Verify Recovery OTP", options);
}

function renderRecoverPassword(res, req, options = {}) {
  return renderView(res, req, VIEW_RECOVER_PASSWORD, "Recover Password", options);
}

function maskEmail(email) {
  const safe = normalizeEmail(email);
  const at = safe.indexOf("@");
  if (at <= 1) return `***${safe.slice(at)}`;
  return `${safe[0]}***${safe.slice(at)}`;
}

function getMaskedTarget(identifier) {
  return maskEmail(identifier);
}

function accountLookupErrorMessage() {
  return "The entered email does not match any account.";
}

function recoveryExpired(recovery) {
  return !!(recovery?.expiresAt && Date.now() > Number(recovery.expiresAt));
}

function otpExpired(recovery) {
  return !!(recovery?.otpExpiresAt && Date.now() > Number(recovery.otpExpiresAt));
}

function getRecoverySession(req) {
  const recovery = req.session?.adminRecovery || null;
  if (!recovery) return null;

  if (recoveryExpired(recovery)) {
    clearRecoverySession(req);
    return null;
  }

  return recovery;
}

function clearRecoverySession(req) {
  if (!req.session) return;
  delete req.session.adminRecovery;
}

function setRecoverySession(req, recovery) {
  if (!req.session) return;
  req.session.adminRecovery = { ...recovery, updatedAt: Date.now() };
}

function saveSession(req) {
  return new Promise((resolve, reject) => {
    if (!req.session || typeof req.session.save !== "function") {
      return reject(new Error("Session middleware is not configured."));
    }

    req.session.save((err) => {
      if (err) return reject(err);
      resolve();
    });
  });
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

async function sendEmailMessage(to, subject, html, text) {
  const transporter = await createMailer();
  await transporter.sendMail({
    from: FROM_EMAIL,
    to,
    subject,
    html,
    text,
  });
}

async function getAdminPasswordColumnName() {
  if (cachedPasswordColumn) return cachedPasswordColumn;

  const result = await pool.query(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'admin_accounts'
        AND column_name IN ('password_hash', 'password')
      ORDER BY CASE column_name WHEN 'password_hash' THEN 1 ELSE 2 END
      LIMIT 1
    `
  );

  cachedPasswordColumn = result.rows[0]?.column_name || null;

  if (!cachedPasswordColumn) {
    throw new Error(
      "No password column found in admin_accounts. Expected password_hash or password."
    );
  }

  return cachedPasswordColumn;
}

/* =========================================================
   EMAIL HTML
========================================================= */

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

/* =========================================================
   EMAIL NOTIFICATIONS
========================================================= */

async function sendEmailOtp(to, otp, fullName = "") {
  const safeName = sanitizeText(fullName);
  const greetingLine = safeName ? `Hello ${safeName},` : "Hello,";

  const html = buildEmailTemplate({
    title: "Password Recovery OTP",
    content: `
      <p style="margin:0 0 16px;">${greetingLine}</p>
      <p style="margin:0 0 18px;">You requested to reset your password. Use the one-time password below to continue.</p>
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

You requested to reset your password.

Your OTP is: ${otp}

This OTP expires in ${OTP_EXPIRES_MINUTES} minutes.

If you did not request this, please contact support immediately.

${COMPANY_NAME}
${SUPPORT_EMAIL}
${SUPPORT_PHONE}
`;

  await sendEmailMessage(to, "Your Password Recovery OTP", html, text);
}

async function sendEmailResetLink(to, link, fullName = "") {
  const safeName = sanitizeText(fullName);
  const greetingLine = safeName ? `Hello ${safeName},` : "Hello,";

  const html = buildEmailTemplate({
    title: "Reset Your Password",
    content: `
      <p style="margin:0 0 16px;">${greetingLine}</p>
      <p style="margin:0 0 18px;">You requested to reset your password. Click the button below to reset your password securely.</p>
      <div style="text-align:center;margin:28px 0;">
        <a href="${link}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:10px;">
          Click Reset Link
        </a>
      </div>
      <p style="margin:0 0 10px;">If the button does not work, copy and paste this link into your browser:</p>
      <p style="word-break:break-all;margin:0 0 18px;">
        <a href="${link}" style="color:#344767;text-decoration:none;">${link}</a>
      </p>
      <p style="margin:0 0 12px;">This link expires in <strong>${LINK_EXPIRES_MINUTES} minutes</strong>.</p>
      <p style="margin:0;">If you did not request this, please ignore this email or contact support immediately.</p>
    `,
    footerNote: "For your security, this reset link can only be used once.",
  });

  const text = `
${greetingLine}

You requested to reset your password.

Click reset link to reset your password:
${link}

This link expires in ${LINK_EXPIRES_MINUTES} minutes.

If you did not request this, please contact support immediately.

${COMPANY_NAME}
${SUPPORT_EMAIL}
${SUPPORT_PHONE}
`;

  await sendEmailMessage(to, "Reset Your Password", html, text);
}

async function sendRecoverySuccessEmail(to, fullName = "") {
  const safeName = sanitizeText(fullName);
  const greetingLine = safeName ? `Hello ${safeName},` : "Hello,";

  const html = buildEmailTemplate({
    title: "Password Updated Successfully",
    content: `
      <p style="margin:0 0 16px;">${greetingLine}</p>
      <p style="margin:0 0 18px;">Your password has been updated successfully.</p>
      <div style="margin:22px 0;padding:14px 16px;border:1px solid #e5e7eb;border-radius:12px;background:#ffffff;">
        <div style="font-size:14px;color:#111827;font-weight:700;margin-bottom:6px;">Security confirmation</div>
        <div style="font-size:14px;color:#374151;line-height:1.7;">
          If this was you, no further action is needed.
          If you did not complete this change, contact support immediately.
        </div>
      </div>
      <p style="margin:0;">You can now sign in to your account using your new password.</p>
    `,
    footerNote: "Keep your password private and use a strong unique password.",
  });

  const text = `
${greetingLine}

Your password has been updated successfully.

If this was you, no further action is needed.
If you did not complete this change, contact support immediately.

${COMPANY_NAME}
${SUPPORT_EMAIL}
${SUPPORT_PHONE}
`;

  await sendEmailMessage(to, "Password Updated Successfully", html, text);
}

async function sendRecoveryCancelledEmail(to, fullName = "", reason = "") {
  const safeName = sanitizeText(fullName);
  const greetingLine = safeName ? `Hello ${safeName},` : "Hello,";

  const reasonText =
    sanitizeText(reason) || "Your password recovery request has been closed.";

  const html = buildEmailTemplate({
    title: "Password Recovery Request Closed",
    content: `
      <p style="margin:0 0 16px;">${greetingLine}</p>
      <p style="margin:0 0 18px;">${reasonText}</p>
      <div style="margin:22px 0;padding:14px 16px;border:1px solid #e5e7eb;border-radius:12px;background:#ffffff;">
        <div style="font-size:14px;color:#111827;font-weight:700;margin-bottom:6px;">Need to try again?</div>
        <div style="font-size:14px;color:#374151;line-height:1.7;">
          You can start a new recovery request anytime from the sign-in page.
          If you did not request this, please contact support immediately.
        </div>
      </div>
      <p style="margin:0;">For safety, the previous recovery session is no longer active.</p>
    `,
    footerNote:
      "If this was unexpected, please secure your account and contact support.",
  });

  const text = `
${greetingLine}

${reasonText}

You can start a new recovery request anytime from the sign-in page.

If you did not request this, please contact support immediately.

${COMPANY_NAME}
${SUPPORT_EMAIL}
${SUPPORT_PHONE}
`;

  await sendEmailMessage(to, "Password Recovery Request Closed", html, text);
}

/* =========================================================
   DB HELPERS
========================================================= */

async function findAdminByEmail(email) {
  const result = await pool.query(
    `
      SELECT id, full_name, email, status, email_verified
      FROM admin_accounts
      WHERE LOWER(email) = LOWER($1)
      LIMIT 1
    `,
    [normalizeEmail(email)]
  );
  return result.rows[0] || null;
}

async function findAdminByResetTokenHash(tokenHash) {
  const result = await pool.query(
    `
      SELECT id, full_name, email, status, reset_password_expires
      FROM admin_accounts
      WHERE reset_password_token = $1
      LIMIT 1
    `,
    [tokenHash]
  );
  return result.rows[0] || null;
}

async function storeRecoveryToken(userId, tokenHash, expiresAt) {
  await pool.query(
    `
      UPDATE admin_accounts
      SET reset_password_token = $2,
          reset_password_expires = $3,
          updated_at = NOW()
      WHERE id = $1
    `,
    [userId, tokenHash, expiresAt]
  );
}

async function clearRecoveryToken(userId) {
  await pool.query(
    `
      UPDATE admin_accounts
      SET reset_password_token = NULL,
          reset_password_expires = NULL,
          updated_at = NOW()
      WHERE id = $1
    `,
    [userId]
  );
}

async function setNewPassword(userId, newPasswordHash) {
  const passwordColumn = await getAdminPasswordColumnName();

  const query = `
    UPDATE admin_accounts
    SET ${passwordColumn} = $2,
        reset_password_token = NULL,
        reset_password_expires = NULL,
        login_attempts = 0,
        last_attempt_time = NULL,
        lock_until = NULL,
        is_online = FALSE,
        last_logout_at = NOW(),
        session_version = COALESCE(session_version, 1) + 1,
        updated_at = NOW()
    WHERE id = $1
  `;

  await pool.query(query, [userId, newPasswordHash]);
}

async function loadRecoveryUserById(userId) {
  const accountResult = await pool.query(
    `
      SELECT id, full_name, email, status, reset_password_token, reset_password_expires
      FROM admin_accounts
      WHERE id = $1
      LIMIT 1
    `,
    [userId]
  );
  return accountResult.rows[0] || null;
}

async function redirectToOtpPage(req, res, recovery) {
  setRecoverySession(req, {
    ...recovery,
    lastSentAt: Date.now(),
  });
  await saveSession(req);
  return res.redirect(ADMIN_VERIFY_OTP_URL);
}

async function redirectToRecoveryPage(req, res, recovery) {
  setRecoverySession(req, recovery);
  await saveSession(req);
  return res.redirect(ADMIN_PASSWORD_RECOVERY_URL);
}

function renderInvalidIdentifier(res, req, old = {}) {
  return renderForgotPassword(res, req, {
    error: accountLookupErrorMessage(),
    old: {
      identifier: old.identifier || "",
      recovery_mode: "otp",
    },
    recoveryMode: "otp",
  });
}

async function notifyCancellationIfPossible(user, reason) {
  if (!user?.email) return;
  try {
    await sendRecoveryCancelledEmail(user.email, user.full_name, reason);
  } catch (e) {
    console.error("Recovery cancellation email failed:", e);
  }
}

/* =========================================================
   CONTROLLERS
========================================================= */

async function getForgotPasswordPage(req, res) {
  return renderForgotPassword(res, req, {
    old: {
      identifier: req.query?.identifier || "",
      recovery_mode: req.query?.recovery_mode || "otp",
    },
    recoveryMode: req.query?.recovery_mode || "otp",
  });
}

async function sendOtp(req, res, next) {
  try {
    const identifier = getIdentifier(req);
    const recoveryMode = getRecoveryMode(req);

    if (!identifier) {
      return renderForgotPassword(res, req, {
        error: "Please enter your email address.",
        old: {
          identifier: "",
          recovery_mode: recoveryMode,
        },
        recoveryMode,
      });
    }

    const user = await findAdminByEmail(identifier);

    if (!user || user.status === "deleted" || user.status !== "active") {
      return renderInvalidIdentifier(res, req, { identifier });
    }

    if (!user.email) {
      return renderInvalidIdentifier(res, req, { identifier });
    }

    if (recoveryMode === "otp") {
      const currentRecovery = getRecoverySession(req);
      if (
        currentRecovery?.lastSentAt &&
        Date.now() - Number(currentRecovery.lastSentAt) < OTP_RESEND_COOLDOWN_MS
      ) {
        return renderForgotPassword(res, req, {
          error: "Please wait a moment before requesting another OTP.",
          old: {
            identifier,
            recovery_mode: recoveryMode,
          },
          recoveryMode,
        });
      }

      const otp = generateOtp();
      const otpHash = hashToken(otp);
      const otpExpiresAt = new Date(
        Date.now() + OTP_EXPIRES_MINUTES * 60 * 1000
      );

      await storeRecoveryToken(user.id, otpHash, otpExpiresAt);

      try {
        await sendEmailOtp(user.email, otp, user.full_name);
      } catch (sendErr) {
        console.error("Recovery OTP send failed:", sendErr);
        return renderForgotPassword(res, req, {
          error:
            "Unable to send OTP right now. Please try again later or contact support.",
          old: {
            identifier,
            recovery_mode: recoveryMode,
          },
          recoveryMode,
        });
      }

      return redirectToOtpPage(req, res, {
        userId: user.id,
        identifier: user.email,
        recoveryMode: "otp",
        attempts: 0,
        expiresAt: Date.now() + RECOVERY_SESSION_MAX_AGE,
        otpExpiresAt: otpExpiresAt.getTime(),
        verified: false,
        verifiedAt: null,
        lastSentAt: Date.now(),
      });
    }

    const resetToken = generateSecureToken();
    const resetTokenHash = hashToken(resetToken);
    const tokenExpiresAt = new Date(
      Date.now() + LINK_EXPIRES_MINUTES * 60 * 1000
    );
    const resetLink = buildResetLink(req, resetToken);

    await storeRecoveryToken(user.id, resetTokenHash, tokenExpiresAt);

    try {
      await sendEmailResetLink(user.email, resetLink, user.full_name);
    } catch (sendErr) {
      console.error("Recovery link send failed:", sendErr);
      return renderForgotPassword(res, req, {
        error:
          "Unable to send reset link right now. Please try again later or contact support.",
        old: {
          identifier,
          recovery_mode: recoveryMode,
        },
        recoveryMode,
      });
    }

    return redirectToRecoveryPage(req, res, {
      userId: user.id,
      identifier: user.email,
      recoveryMode: "link",
      attempts: 0,
      expiresAt: Date.now() + RECOVERY_SESSION_MAX_AGE,
      tokenExpiresAt: tokenExpiresAt.getTime(),
      verified: false,
      verifiedAt: null,
    });
  } catch (err) {
    return next(err);
  }
}

async function verifyOtpPage(req, res) {
  const recovery = getRecoverySession(req);
  if (!recovery) return res.redirect(ADMIN_FORGOT_URL);
  if (recovery.recoveryMode === "link")
    return res.redirect(ADMIN_PASSWORD_RECOVERY_URL);

  const flashSuccess = req.session?.otpSuccess || null;
  if (req.session) delete req.session.otpSuccess;

  if (flashSuccess) {
    await saveSession(req).catch(() => {});
  }

  return renderVerifyOtp(res, req, {
    otpTarget: recovery.identifier,
    maskedTarget: getMaskedTarget(recovery.identifier),
    recoveryMode: "otp",
    success: flashSuccess,
  });
}

async function submitOtpVerification(req, res, next) {
  try {
    const recovery = getRecoverySession(req);
    if (!recovery) return res.redirect(ADMIN_FORGOT_URL);
    if (recovery.recoveryMode === "link")
      return res.redirect(ADMIN_PASSWORD_RECOVERY_URL);

    const otp = String(req.body?.otp || "").trim();
    if (!otp) {
      return renderVerifyOtp(res, req, {
        error: "Please enter the OTP.",
        otpTarget: recovery.identifier,
        maskedTarget: getMaskedTarget(recovery.identifier),
        recoveryMode: "otp",
      });
    }

    if (otpExpired(recovery)) {
      const user = await loadRecoveryUserById(recovery.userId);
      await clearRecoveryToken(recovery.userId);
      clearRecoverySession(req);
      await notifyCancellationIfPossible(
        user,
        "Your OTP recovery session expired."
      );

      return renderVerifyOtp(res, req, {
        error: "OTP expired. Please request a new one.",
        recoveryMode: "otp",
      });
    }

    recovery.attempts = Number(recovery.attempts || 0) + 1;
    setRecoverySession(req, recovery);
    await saveSession(req);

    if (recovery.attempts > OTP_MAX_ATTEMPTS) {
      const user = await loadRecoveryUserById(recovery.userId);
      await clearRecoveryToken(recovery.userId);
      clearRecoverySession(req);
      await notifyCancellationIfPossible(
        user,
        "Your OTP recovery session has been closed after too many attempts."
      );

      return renderVerifyOtp(res, req, {
        error: "Too many OTP attempts. Please request a new OTP.",
        recoveryMode: "otp",
      });
    }

    const account = await loadRecoveryUserById(recovery.userId);

    if (
      !account ||
      account.status === "deleted" ||
      !account.reset_password_token ||
      !account.reset_password_expires
    ) {
      clearRecoverySession(req);
      return res.redirect(ADMIN_FORGOT_URL);
    }

    if (Date.now() > new Date(account.reset_password_expires).getTime()) {
      await clearRecoveryToken(recovery.userId);
      clearRecoverySession(req);
      await notifyCancellationIfPossible(
        account,
        "Your OTP recovery session expired before it could be completed."
      );

      return renderVerifyOtp(res, req, {
        error: "OTP expired. Please request a new one.",
        recoveryMode: "otp",
      });
    }

    if (!safeHashEquals(hashToken(otp), account.reset_password_token)) {
      return renderVerifyOtp(res, req, {
        error: "Invalid OTP.",
        otpTarget: recovery.identifier,
        maskedTarget: getMaskedTarget(recovery.identifier),
        recoveryMode: "otp",
      });
    }

    await clearRecoveryToken(recovery.userId);
    return redirectToRecoveryPage(req, res, {
      ...recovery,
      verified: true,
      verifiedAt: Date.now(),
    });
  } catch (err) {
    return next(err);
  }
}

async function getResetPasswordPage(req, res, next) {
  try {
    const token = String(req.query?.token || "").trim();

    if (token) {
      const tokenHash = hashToken(token);
      const user = await findAdminByResetTokenHash(tokenHash);

      if (
        !user ||
        user.status === "deleted" ||
        !user.reset_password_expires ||
        Date.now() > new Date(user.reset_password_expires).getTime()
      ) {
        if (user) {
          await notifyCancellationIfPossible(
            user,
            "Your password reset link is invalid or has expired."
          );
        }

        clearRecoverySession(req);
        return renderForgotPassword(res, req, {
          error: "Reset link is invalid or expired.",
          old: {},
          recoveryMode: "link",
        });
      }

      return redirectToRecoveryPage(req, res, {
        userId: user.id,
        identifier: user.email || "",
        recoveryMode: "link",
        attempts: 0,
        expiresAt: Date.now() + RECOVERY_SESSION_MAX_AGE,
        tokenExpiresAt: new Date(user.reset_password_expires).getTime(),
        verified: true,
        verifiedAt: Date.now(),
      });
    }

    const recovery = getRecoverySession(req);
    if (!recovery) return res.redirect(ADMIN_FORGOT_URL);

    if (recovery.recoveryMode === "link" && !recovery.verified) {
      return renderRecoverPassword(res, req, {
        success:
          "A password reset link has been sent. Click reset link to reset your password.",
        otpTarget: recovery.identifier,
        maskedTarget: getMaskedTarget(recovery.identifier),
        recoveryMode: "link",
      });
    }

    if (!recovery.verified && recovery.recoveryMode === "otp") {
      return res.redirect(ADMIN_FORGOT_URL);
    }

    return renderRecoverPassword(res, req, {
      otpTarget: recovery.identifier,
      maskedTarget: getMaskedTarget(recovery.identifier),
      recoveryMode: recovery.recoveryMode || "otp",
    });
  } catch (err) {
    return next(err);
  }
}

async function handlePasswordUpdate(req, res, recovery) {
  const password = String(req.body?.password || "");
  const confirmPassword = String(
    req.body?.confirm_password || req.body?.confirmPassword || ""
  );

  if (!isStrongPassword(password)) {
    return renderRecoverPassword(res, req, {
      error:
        "Password must be at least 8 characters long and include 1 uppercase letter, 1 lowercase letter, 1 number, and 1 special character.",
      otpTarget: recovery.identifier,
      maskedTarget: getMaskedTarget(recovery.identifier),
      recoveryMode: recovery.recoveryMode || "otp",
    });
  }

  if (password !== confirmPassword) {
    return renderRecoverPassword(res, req, {
      error: "Passwords do not match.",
      otpTarget: recovery.identifier,
      maskedTarget: getMaskedTarget(recovery.identifier),
      recoveryMode: recovery.recoveryMode || "otp",
    });
  }

  const account = await loadRecoveryUserById(recovery.userId);
  if (!account || account.status === "deleted") {
    clearRecoverySession(req);
    return res.redirect(ADMIN_FORGOT_URL);
  }

  const hash = await bcrypt.hash(password, 12);
  await setNewPassword(recovery.userId, hash);

  try {
    await sendRecoverySuccessEmail(account.email, account.full_name);
  } catch (sendErr) {
    console.error("Recovery success email failed:", sendErr);
  }

  clearRecoverySession(req);
  req.session.success = "Password updated successfully. Please sign in.";
  await saveSession(req);
  return res.redirect(ADMIN_SIGN_IN_URL);
}

async function updatePassword(req, res, next) {
  try {
    const recovery = getRecoverySession(req);
    if (!recovery) return res.redirect(ADMIN_FORGOT_URL);

    if (recovery.recoveryMode === "link" && !recovery.verified) {
      return res.redirect(ADMIN_PASSWORD_RECOVERY_URL);
    }

    const hasPasswordFields =
      typeof req.body?.password !== "undefined" ||
      typeof req.body?.confirm_password !== "undefined" ||
      typeof req.body?.confirmPassword !== "undefined";
    const hasOtpField = typeof req.body?.otp !== "undefined";

    if (hasPasswordFields) {
      if (!recovery.verified) return res.redirect(ADMIN_FORGOT_URL);
      return handlePasswordUpdate(req, res, recovery);
    }

    if (hasOtpField || recovery.recoveryMode === "otp") {
      if (recovery.recoveryMode !== "otp")
        return res.redirect(ADMIN_PASSWORD_RECOVERY_URL);
      return submitOtpVerification(req, res, next);
    }

    return res.redirect(ADMIN_FORGOT_URL);
  } catch (err) {
    return next(err);
  }
}

async function resendRecoveryOtp(req, res, next) {
  try {
    const recovery = getRecoverySession(req);
    if (!recovery) return res.redirect(ADMIN_FORGOT_URL);
    if (recovery.recoveryMode === "link")
      return res.redirect(ADMIN_PASSWORD_RECOVERY_URL);

    if (
      recovery.lastSentAt &&
      Date.now() - Number(recovery.lastSentAt) < OTP_RESEND_COOLDOWN_MS
    ) {
      return renderVerifyOtp(res, req, {
        error: "Please wait a moment before requesting another OTP.",
        otpTarget: recovery.identifier,
        maskedTarget: getMaskedTarget(recovery.identifier),
        recoveryMode: "otp",
      });
    }

    const user = await loadRecoveryUserById(recovery.userId);
    if (!user || user.status === "deleted") {
      clearRecoverySession(req);
      return res.redirect(ADMIN_FORGOT_URL);
    }

    const otp = generateOtp();
    const otpHash = hashToken(otp);
    const otpExpiresAt = new Date(Date.now() + OTP_EXPIRES_MINUTES * 60 * 1000);

    await storeRecoveryToken(user.id, otpHash, otpExpiresAt);

    try {
      await sendEmailOtp(user.email, otp, user.full_name);
    } catch (sendErr) {
      console.error("Resend recovery OTP failed:", sendErr);
      return renderVerifyOtp(res, req, {
        error: "Unable to resend OTP right now. Please try again later.",
        otpTarget: recovery.identifier,
        maskedTarget: getMaskedTarget(recovery.identifier),
        recoveryMode: "otp",
      });
    }

    recovery.attempts = 0;
    recovery.otpExpiresAt = otpExpiresAt.getTime();
    recovery.lastSentAt = Date.now();
    setRecoverySession(req, recovery);
    await saveSession(req);

    req.session.otpSuccess = "A new OTP has been sent.";
    await saveSession(req);
    return res.redirect(ADMIN_VERIFY_OTP_URL);
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getForgotPasswordPage,
  sendOtp,
  verifyOtp: verifyOtpPage,
  submitOtpVerification,
  getResetPasswordPage,
  updatePassword,
  resendRecoveryOtp,
  postForgotPassword: sendOtp,
  postVerifyRecoveryOtp: submitOtpVerification,
  postRecoverPassword: updatePassword,
  postResendRecoveryOtp: resendRecoveryOtp,
};