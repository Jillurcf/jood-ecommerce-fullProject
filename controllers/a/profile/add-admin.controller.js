"use strict";

require("dotenv").config();

const crypto = require("crypto");
const bcrypt = require("bcrypt");
const nodemailer = require("nodemailer");
const { pool } = require("../../../includes/conn");
const { buildEmailTemplate } = require("../sign/sign.controller");

/* =========================================================
   CONFIG
========================================================= */

const OTP_EXPIRES_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;
const OTP_LOCK_MINUTES = 15;

const COMPANY_NAME = "JOOD | Quality Goods & Products";
const SUPPORT_EMAIL = "info@jood.com";
const SUPPORT_PHONE = "+971 53 37 2440";

const FROM_EMAIL =
  process.env.FROM_EMAIL || process.env.SMTP_USER || "no-reply@example.com";

const APP_BASE_URL = (
  process.env.APP_BASE_URL ||
  process.env.BASE_URL ||
  "https://telal-contracting.com"
).replace(/\/+$/, "");

const MASTER_ROLE = "master_admin";
const SUPER_ROLE = "super_admin";

const ALLOWED_ROLES = new Set([
  "super_admin",
  "master_admin",
  "admin",
  "sub_admin",
  "viewer",
]);

const ALLOWED_STATUSES = new Set(["active", "inactive", "blocked", "deleted"]);

const ADMIN_SELECT_FIELDS = `
  id,
  admin_id,
  full_name,
  email,
  phone,
  role,
  status,
  email_verified,
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
  return /^\+?[0-9]{7,15}$/.test(phone);
}

function normalizePhone(value) {
  const raw = cleanText(value);
  if (!raw) return null;

  const cleaned = raw.replace(/[^\d+]/g, "");
  if (cleaned.startsWith("+")) {
    return `+${cleaned.slice(1).replace(/\+/g, "")}`.slice(0, 20);
  }

  return cleaned.replace(/\+/g, "").slice(0, 20) || null;
}

function truncateText(value, maxLength) {
  const text = cleanText(value);
  if (!text) return "";
  return text.slice(0, maxLength);
}

function isValidFullName(name) {
  const n = cleanText(name);
  return n.length >= 2 && n.length <= 80;
}

function generateAdminId(fullName) {
  const base =
    cleanText(fullName)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 12) || "admin";

  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const random = crypto.randomBytes(4).toString("hex");
  return `${base}_${date}_${random}`;
}

function generateStrongPassword(length = 12) {
  const charset =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%*?_";
  let password = "";
  for (let i = 0; i < length; i++) {
    password += charset[crypto.randomInt(0, charset.length)];
  }
  return password;
}

function generateOtp() {
  return String(crypto.randomInt(100000, 1000000));
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

function safeCompareStrings(a, b) {
  const left = String(a || "");
  const right = String(b || "");
  if (!left || !right || left.length !== right.length) return false;

  try {
    return crypto.timingSafeEqual(Buffer.from(left), Buffer.from(right));
  } catch {
    return left === right;
  }
}

function makeAbsoluteUrl(path) {
  if (!path) return APP_BASE_URL || "";
  if (/^https?:\/\//i.test(path)) return path;
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

function wantsJson(req) {
  return (
    req.xhr ||
    String(req.headers?.["x-requested-with"] || "") === "XMLHttpRequest" ||
    String(req.headers?.accept || "").includes("application/json")
  );
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

function isMasterOrSuper(req) {
  const role = req.session?.admin?.role || req.session?.adminRole || "";
  return role === MASTER_ROLE || role === SUPER_ROLE;
}

function validateRole(role) {
  const clean = cleanText(role);
  return ALLOWED_ROLES.has(clean) ? clean : "admin";
}

function validateStatus(status) {
  const clean = cleanText(status);
  return ALLOWED_STATUSES.has(clean) ? clean : "active";
}

function canCreateRole(actorRole, targetRole) {
  if (actorRole === SUPER_ROLE) return true;
  if (actorRole === MASTER_ROLE) {
    return ["admin", "sub_admin", "viewer"].includes(targetRole);
  }
  return false;
}

function minutesUntilUnlock(lockUntil) {
  if (!lockUntil) return 0;
  const d = new Date(lockUntil);
  if (Number.isNaN(d.getTime())) return 0;
  const diffMs = d.getTime() - Date.now();
  return diffMs > 0 ? Math.ceil(diffMs / 60000) : 0;
}

function lockoutMessage(admin) {
  const remaining = minutesUntilUnlock(admin?.lock_until);
  if (remaining <= 0) return "Too many failed attempts. Please try again later.";
  return `Too many failed attempts. Please try again in ${remaining} minute${
    remaining > 1 ? "s" : ""
  }.`;
}

/* =========================================================
   EMAIL
========================================================= */

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
  await transporter.sendMail({ from: FROM_EMAIL, to, subject, html, text });
}

function buildUserOtpEmail(fullName, otp, actionLabel = "verify your email") {
  const safeName = cleanText(fullName);
  const greeting = safeName ? `Hello ${safeName},` : "Hello,";

  const html = buildEmailTemplate({
    title: "Email Verification OTP",
    content: `
      <p style="margin:0 0 16px;">${greeting}</p>
      <p style="margin:0 0 16px;">
        Please use the OTP below to ${actionLabel}.
      </p>
      <div style="text-align:center;margin:24px 0;">
        <div style="display:inline-block;padding:16px 22px;border:1px dashed #d1d5db;border-radius:12px;background:#ffffff;">
          <span style="font-size:32px;font-weight:700;letter-spacing:7px;color:#111827;">${otp}</span>
        </div>
      </div>
      <p style="margin:0 0 12px;">
        This OTP expires in <strong>${OTP_EXPIRES_MINUTES} minutes</strong>.
      </p>
      <p style="margin:0;">
        After verification, the second approval OTP will be sent to the logged-in admin who is creating this account.
      </p>
    `,
    footerNote: "For security, never share your OTP with anyone.",
  });

  const text = `
${greeting}

Please use the OTP below to ${actionLabel}.

OTP: ${otp}

This OTP expires in ${OTP_EXPIRES_MINUTES} minutes.

After verification, the second approval OTP will be sent to the logged-in admin who is creating this account.

${COMPANY_NAME}
${SUPPORT_EMAIL}
${SUPPORT_PHONE}
`;

  return { html, text };
}

function buildApprovalOtpEmail(approverName, otp, targetEmail, targetRole) {
  const safeName = cleanText(approverName);
  const greeting = safeName ? `Hello ${safeName},` : "Hello,";

  const html = buildEmailTemplate({
    title: "Approve Admin Account Creation",
    content: `
      <p style="margin:0 0 16px;">${greeting}</p>
      <p style="margin:0 0 16px;">
        The target email has already been verified. Please use the OTP below to approve the new admin account.
      </p>
      <div style="text-align:center;margin:24px 0;">
        <div style="display:inline-block;padding:16px 22px;border:1px dashed #d1d5db;border-radius:12px;background:#ffffff;">
          <span style="font-size:32px;font-weight:700;letter-spacing:7px;color:#111827;">${otp}</span>
        </div>
      </div>
      <div style="margin:22px 0;padding:18px;border:1px solid #eef2f7;border-radius:12px;background:#fafafa;">
        <div style="font-size:14px;color:#6b7280;margin-bottom:8px;">Request details</div>
        <div style="font-size:15px;line-height:1.9;color:#111827;">
          <strong>Target Email:</strong> ${cleanText(targetEmail)}<br>
          <strong>Target Role:</strong> ${cleanText(targetRole)}<br>
          <strong>Approved By:</strong> ${cleanText(approverName)}
        </div>
      </div>
      <p style="margin:0 0 12px;">
        This OTP expires in <strong>${OTP_EXPIRES_MINUTES} minutes</strong>.
      </p>
      <p style="margin:0;">
        If you did not request this, ignore this email.
      </p>
    `,
    footerNote: "Never share this OTP with anyone.",
  });

  const text = `
${greeting}

The target email has already been verified. Please use the OTP below to approve the new admin account.

OTP: ${otp}

Approved by: ${cleanText(approverName)}
Target email: ${cleanText(targetEmail)}
Target role: ${cleanText(targetRole)}

This OTP expires in ${OTP_EXPIRES_MINUTES} minutes.

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
    title: "Your Admin Account Is Ready",
    content: `
      <p style="margin:0 0 16px;">${greeting}</p>
      <p style="margin:0 0 16px;">
        Your admin account has been created successfully.
      </p>
      <div style="margin:22px 0;padding:18px;border:1px solid #eef2f7;border-radius:12px;background:#fafafa;">
        <div style="font-size:14px;color:#6b7280;margin-bottom:8px;">Login details</div>
        <div style="font-size:15px;line-height:1.9;color:#111827;">
          <strong>Email:</strong> ${cleanText(email)}<br>
          <strong>Password:</strong> ${cleanText(plainPassword)}
        </div>
      </div>
      <p style="margin:0 0 12px;">
        You can update your password after login.
      </p>
      <p style="margin:0;">
        Please sign in and change the password to something private and secure.
      </p>
    `,
    footerNote: "For security, do not share your password with anyone.",
  });

  const text = `
${greeting}

Your admin account has been created successfully.

Login details:
Email: ${cleanText(email)}
Password: ${cleanText(plainPassword)}

You can update your password after login.

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

async function countRole(role) {
  const result = await pool.query(
    `
      SELECT COUNT(*)::int AS count
      FROM admin_accounts
      WHERE role = $1
        AND status <> 'deleted'
    `,
    [role]
  );
  return result.rows[0]?.count || 0;
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
          NULL,
          NULL,
          0,
          NULL,
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

async function deleteAdminById(id) {
  await pool.query(`DELETE FROM admin_accounts WHERE id = $1`, [id]);
}

async function clearAdminOtp(adminId) {
  await pool.query(
    `
      UPDATE admin_accounts
      SET otp_hash = NULL,
          otp_expires_at = NULL,
          otp_attempts = 0,
          otp_sent_at = NULL,
          lock_until = NULL,
          updated_at = NOW()
      WHERE id = $1
    `,
    [adminId]
  );
}

async function updateApprovalOtp(adminId, approvalOtpHash, expiresAt) {
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
    [adminId, approvalOtpHash, expiresAt]
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

/* =========================================================
   PENDING CREATE SESSION
========================================================= */

function setPendingCreate(req, data) {
  if (!req.session) return null;
  req.session.pendingAdminCreate = data;
  return data;
}

function getPendingCreate(req) {
  return req.session?.pendingAdminCreate || null;
}

function clearPendingCreate(req) {
  if (!req.session) return;
  delete req.session.pendingAdminCreate;
}

function requireCurrentApprover(req) {
  const actor = getSessionAdmin(req);
  if (!actor?.id) return null;
  const role = cleanText(actor.role || req.session?.adminRole || "");
  if (role !== SUPER_ROLE && role !== MASTER_ROLE) return null;
  return actor;
}

function ensureApproverRecipient(req, pending) {
  const approver = requireCurrentApprover(req);
  if (!approver) return null;

  const approverEmail = normalizeEmail(
    approver.email || req.session?.adminEmail || ""
  );
  const approverId = Number(approver.id || req.session?.adminId || 0) || null;

  if (!approverEmail) return null;

  const recipient = {
    id: approverId,
    email: approverEmail,
    full_name: cleanText(approver.full_name || req.session?.adminName || ""),
    role: cleanText(approver.role || req.session?.adminRole || ""),
  };

  pending.approvalRecipient = recipient;
  pending.approvalRecipientId = recipient.id;
  pending.approvalRecipientEmail = recipient.email;
  pending.approvalRecipientName = recipient.full_name;
  pending.approvalRecipientRole = recipient.role;
  return recipient;
}

/* =========================================================
   VIEW
========================================================= */

exports.getAddAdminPage = (req, res) => {
  const actor = getSessionAdmin(req);

  if (!actor?.id) {
    return res.status(401).json({
      ok: false,
      message: "Unauthorized",
    });
  }

  return res.render("admin/a/profile/add-admin", {
    admin: actor,
    user: actor,
    sessionAdmin: actor,
    csrfToken: getCsrfToken(req),
  });
};

/* =========================================================
   STEP 1:
   Validate target email, send OTP to the target user's email.
========================================================= */

exports.requestCreateAdmin = async (req, res, next) => {
  try {
    const actor = getSessionAdmin(req);
    if (!actor?.id) {
      return res.status(401).json({ ok: false, message: "Unauthorized" });
    }

    const actorRole = cleanText(actor.role || req.session?.adminRole || "");

    const fullName = truncateText(
      req.body?.full_name ?? req.body?.fullName,
      80
    );
    const email = normalizeEmail(req.body?.email);
    const phone = normalizePhone(req.body?.phone ?? req.body?.phone_number);
    const role = validateRole(req.body?.role);
    const status = validateStatus(req.body?.status || "active");

    if (!fullName || !isValidFullName(fullName)) {
      return res.status(400).json({
        ok: false,
        message: "Full name is required and must be between 2 and 80 characters.",
      });
    }

    if (!email || !isValidEmail(email)) {
      return res.status(400).json({
        ok: false,
        message: "Please enter a valid email address.",
      });
    }

    if (phone && !isValidPhone(phone)) {
      return res.status(400).json({
        ok: false,
        message: "Please enter a valid phone number.",
      });
    }

    if (!ALLOWED_ROLES.has(role)) {
      return res.status(400).json({
        ok: false,
        message: "Invalid role selected.",
      });
    }

    if (!canCreateRole(actorRole, role)) {
      return res.status(403).json({
        ok: false,
        message: "You are not allowed to create this role.",
      });
    }

    const existing = await findAdminByEmail(email);
    if (existing) {
      return res.status(409).json({
        ok: false,
        message: "Admin email already exists.",
      });
    }

    if (role === MASTER_ROLE && (await countRole(MASTER_ROLE)) > 0) {
      return res.status(409).json({
        ok: false,
        message: "Only one master admin is allowed.",
      });
    }

    if (role === SUPER_ROLE && (await countRole(SUPER_ROLE)) > 0) {
      return res.status(409).json({
        ok: false,
        message: "Only one super admin is allowed.",
      });
    }

    const targetOtp = generateOtp();
    const targetOtpHash = hashToken(targetOtp);
    const targetOtpExpiresAt = new Date(
      Date.now() + OTP_EXPIRES_MINUTES * 60 * 1000
    );

    setPendingCreate(req, {
      step: "email_verification",
      fullName,
      email,
      phone,
      role,
      status,
      createdBy: actor.id || req.session?.adminId || null,
      createdByEmail: normalizeEmail(actor.email || req.session?.adminEmail || ""),
      createdByName: cleanText(actor.full_name || req.session?.adminName || ""),
      createdByRole: actorRole,
      targetOtpHash,
      targetOtpExpiresAt: targetOtpExpiresAt.toISOString(),
      targetOtpAttempts: 0,
      targetOtpSentAt: new Date().toISOString(),
      approvalOtpHash: null,
      approvalOtpExpiresAt: null,
      approvalOtpAttempts: 0,
      approvalOtpSentAt: null,
      approvalRecipient: null,
      approvalRecipientId: null,
      approvalRecipientEmail: null,
      approvalRecipientName: null,
      approvalRecipientRole: null,
      approvalVerifiedAt: null,
      createdAt: new Date().toISOString(),
    });

    const mail = buildUserOtpEmail(fullName, targetOtp, "verify your email address");

    try {
      await sendEmailMessage({
        to: email,
        subject: "Verify your email address",
        html: mail.html,
        text: mail.text,
      });
    } catch (mailErr) {
      console.error("Target OTP email failed:", mailErr);
      clearPendingCreate(req);
      return res.status(500).json({
        ok: false,
        message: "Unable to send verification OTP right now.",
      });
    }

    return res.status(200).json({
      ok: true,
      message:
        "Verification OTP sent to the target email address. Please verify it first.",
      requireEmailOtp: true,
      showFirstOffcanvas: false,
      showSecondOffcanvas: false,
      nextStep: "email_otp",
      email,
      role,
    });
  } catch (err) {
    console.error("requestCreateAdmin error:", err);
    return next(err);
  }
};

/* =========================================================
   STEP 2:
   Verify target user's OTP.
   After success, send approval OTP to the logged-in super/master admin.
========================================================= */

exports.verifyCreateAdminOtp = async (req, res, next) => {
  try {
    const pending = getPendingCreate(req);
    if (!pending) {
      return res.status(400).json({
        ok: false,
        message: "No pending admin creation request found.",
      });
    }

    const enteredOtp = String(req.body?.otp || req.body?.code || "").trim();
    if (!enteredOtp) {
      return res.status(400).json({
        ok: false,
        message: "OTP is required.",
      });
    }

    if (pending.step === "email_verification") {
      const expiresAt = new Date(pending.targetOtpExpiresAt || "").getTime();
      if (!expiresAt || Date.now() > expiresAt) {
        clearPendingCreate(req);
        return res.status(400).json({
          ok: false,
          message: "Verification OTP expired. Please request a new one.",
        });
      }

      const enteredHash = hashToken(enteredOtp);
      if (!safeCompareStrings(enteredHash, pending.targetOtpHash)) {
        pending.targetOtpAttempts = Number(pending.targetOtpAttempts || 0) + 1;
        setPendingCreate(req, pending);

        if (pending.targetOtpAttempts > OTP_MAX_ATTEMPTS) {
          clearPendingCreate(req);
          return res.status(429).json({
            ok: false,
            message: "Too many failed OTP attempts.",
          });
        }

        return res.status(400).json({
          ok: false,
          message: "Invalid verification OTP.",
        });
      }

      const recipient = ensureApproverRecipient(req, pending);
      if (!recipient) {
        clearPendingCreate(req);
        return res.status(403).json({
          ok: false,
          message:
            "Only a super admin or master admin can approve this action.",
        });
      }

      const approvalOtp = generateOtp();
      const approvalOtpHash = hashToken(approvalOtp);
      const approvalOtpExpiresAt = new Date(
        Date.now() + OTP_EXPIRES_MINUTES * 60 * 1000
      );

      pending.step = "approval_verification";
      pending.targetOtpHash = null;
      pending.targetOtpExpiresAt = null;
      pending.targetOtpAttempts = 0;
      pending.approvalOtpHash = approvalOtpHash;
      pending.approvalOtpExpiresAt = approvalOtpExpiresAt.toISOString();
      pending.approvalOtpAttempts = 0;
      pending.approvalOtpSentAt = new Date().toISOString();
      setPendingCreate(req, pending);

      const approverMail = buildApprovalOtpEmail(
        recipient.full_name,
        approvalOtp,
        pending.email,
        pending.role
      );

      try {
        await sendEmailMessage({
          to: recipient.email,
          subject: "Approve admin account creation",
          html: approverMail.html,
          text: approverMail.text,
        });
      } catch (mailErr) {
        console.error("Approval OTP email failed:", mailErr);
        clearPendingCreate(req);
        return res.status(500).json({
          ok: false,
          message: "Unable to send approval OTP right now.",
        });
      }

      return res.status(200).json({
        ok: true,
        message:
          `Email verified successfully. Please check ${recipient.email} for the approval OTP.`,
        requireApprovalOtp: true,
        showSecondOffcanvas: true,
        nextStep: "approval_otp",
        approvalEmail: recipient.email,
        approvalDisplayEmail: recipient.email,
        createdForEmail: pending.email,
        createdForRole: pending.role,
        approverEmail: recipient.email,
        approverName: recipient.full_name,
        promptText: `Enter the OTP sent to ${recipient.email} to approve the account created for ${pending.email}.`,
      });
    }

    if (pending.step === "approval_verification") {
      const approver = requireCurrentApprover(req);
      if (!approver) {
        return res.status(403).json({
          ok: false,
          message:
            "Only a super admin or master admin can approve this action.",
        });
      }

      const approverEmail = normalizeEmail(
        approver.email || req.session?.adminEmail || ""
      );
      if (!approverEmail || approverEmail !== pending.approvalRecipientEmail) {
        return res.status(403).json({
          ok: false,
          message: `This approval OTP was sent to ${
            pending.approvalRecipientEmail || "another admin email"
          }.`,
        });
      }

      const expiresAt = new Date(pending.approvalOtpExpiresAt || "").getTime();
      if (!expiresAt || Date.now() > expiresAt) {
        clearPendingCreate(req);
        return res.status(400).json({
          ok: false,
          message: "Approval OTP expired. Please request a new one.",
        });
      }

      const enteredHash = hashToken(enteredOtp);
      if (!safeCompareStrings(enteredHash, pending.approvalOtpHash)) {
        pending.approvalOtpAttempts = Number(pending.approvalOtpAttempts || 0) + 1;
        setPendingCreate(req, pending);

        if (pending.approvalOtpAttempts > OTP_MAX_ATTEMPTS) {
          clearPendingCreate(req);
          return res.status(429).json({
            ok: false,
            message: "Too many failed approval OTP attempts.",
          });
        }

        return res.status(400).json({
          ok: false,
          message: "Invalid approval OTP.",
        });
      }

      const plainPassword = generateStrongPassword(12);
      const passwordHash = await bcrypt.hash(plainPassword, 12);

      const created = await createAdminRecord({
        fullName: pending.fullName,
        email: pending.email,
        phone: pending.phone,
        passwordHash,
        role: pending.role,
        status: pending.status,
        createdBy: pending.createdBy,
      });

      const credsMail = buildCredentialsEmail(
        pending.fullName,
        pending.email,
        plainPassword
      );

      try {
        await sendEmailMessage({
          to: pending.email,
          subject: "Your admin account credentials",
          html: credsMail.html,
          text: credsMail.text,
        });
      } catch (mailErr) {
        console.error("Final credentials email failed:", mailErr);
        await deleteAdminById(created.id);
        clearPendingCreate(req);
        return res.status(500).json({
          ok: false,
          message: "Account was not finalized because the email could not be sent.",
        });
      }

      clearPendingCreate(req);

      return res.status(201).json({
        ok: true,
        message: "Admin account created successfully.",
        admin: created,
        closeOffcanvas: true,
        showSecondOffcanvas: false,
        nextStep: "completed",
      });
    }

    return res.status(400).json({
      ok: false,
      message: "Approval is not in the correct state.",
    });
  } catch (err) {
    console.error("verifyCreateAdminOtp error:", err);
    return next(err);
  }
};

/* =========================================================
   RESEND OTP
========================================================= */

exports.resendCreateAdminOtp = async (req, res, next) => {
  try {
    const pending = getPendingCreate(req);
    if (!pending) {
      return res.status(400).json({
        ok: false,
        message: "No pending admin creation request found.",
      });
    }

    if (pending.step === "email_verification") {
      const otp = generateOtp();
      const otpHash = hashToken(otp);
      const expiresAt = new Date(
        Date.now() + OTP_EXPIRES_MINUTES * 60 * 1000
      );

      pending.targetOtpHash = otpHash;
      pending.targetOtpExpiresAt = expiresAt.toISOString();
      pending.targetOtpAttempts = 0;
      pending.targetOtpSentAt = new Date().toISOString();
      setPendingCreate(req, pending);

      const mail = buildUserOtpEmail(
        pending.fullName,
        otp,
        "verify your email address"
      );

      try {
        await sendEmailMessage({
          to: pending.email,
          subject: "Verify your email address",
          html: mail.html,
          text: mail.text,
        });
      } catch (mailErr) {
        console.error("Resend target OTP email failed:", mailErr);
        return res.status(500).json({
          ok: false,
          message: "Unable to resend verification OTP.",
        });
      }

      return res.status(200).json({
        ok: true,
        message: "Verification OTP resent successfully.",
        requireEmailOtp: true,
        nextStep: "email_otp",
      });
    }

    if (pending.step === "approval_verification") {
      const recipient = ensureApproverRecipient(req, pending);
      if (!recipient) {
        clearPendingCreate(req);
        return res.status(403).json({
          ok: false,
          message:
            "Only a super admin or master admin can approve this action.",
        });
      }

      const approvalOtp = generateOtp();
      const approvalOtpHash = hashToken(approvalOtp);
      const expiresAt = new Date(
        Date.now() + OTP_EXPIRES_MINUTES * 60 * 1000
      );

      pending.approvalOtpHash = approvalOtpHash;
      pending.approvalOtpExpiresAt = expiresAt.toISOString();
      pending.approvalOtpAttempts = 0;
      pending.approvalOtpSentAt = new Date().toISOString();
      pending.approvalRecipient = recipient;
      pending.approvalRecipientId = recipient.id;
      pending.approvalRecipientEmail = recipient.email;
      pending.approvalRecipientName = recipient.full_name;
      pending.approvalRecipientRole = recipient.role;
      setPendingCreate(req, pending);

      const mail = buildApprovalOtpEmail(
        recipient.full_name,
        approvalOtp,
        pending.email,
        pending.role
      );

      try {
        await sendEmailMessage({
          to: recipient.email,
          subject: "Approve admin account creation",
          html: mail.html,
          text: mail.text,
        });
      } catch (mailErr) {
        console.error("Resend approval OTP email failed:", mailErr);
        return res.status(500).json({
          ok: false,
          message: "Unable to resend approval OTP.",
        });
      }

      return res.status(200).json({
        ok: true,
        message: `Approval OTP resent successfully to ${recipient.email}.`,
        requireApprovalOtp: true,
        showSecondOffcanvas: true,
        nextStep: "approval_otp",
        approvalEmail: recipient.email,
        createdForEmail: pending.email,
        promptText: `Enter the OTP sent to ${recipient.email} to approve the account created for ${pending.email}.`,
      });
    }

    return res.status(400).json({
      ok: false,
      message: "Invalid pending creation state.",
    });
  } catch (err) {
    console.error("resendCreateAdminOtp error:", err);
    return next(err);
  }
};

/* =========================================================
   OPTIONAL HELPERS / LISTING
========================================================= */

exports.getAdminOverview = async (req, res, next) => {
  try {
    const actor = getSessionAdmin(req);
    if (!actor?.id) {
      return res.status(401).json({ ok: false, message: "Unauthorized" });
    }

    if (!isMasterOrSuper(req)) {
      return res.status(403).json({ ok: false, message: "Forbidden" });
    }

    const result = await pool.query(
      `
        SELECT ${ADMIN_SELECT_FIELDS}
        FROM admin_accounts
        ORDER BY
          CASE role
            WHEN 'super_admin' THEN 1
            WHEN 'master_admin' THEN 2
            WHEN 'admin' THEN 3
            WHEN 'sub_admin' THEN 4
            ELSE 5
          END,
          created_at DESC
      `
    );

    return res.json({ ok: true, admins: result.rows || [] });
  } catch (err) {
    console.error("getAdminOverview error:", err);
    return next(err);
  }
};

exports.getAdminById = async (req, res, next) => {
  try {
    const actor = getSessionAdmin(req);
    if (!actor?.id) {
      return res.status(401).json({ ok: false, message: "Unauthorized" });
    }

    const id = Number(req.params?.id || req.body?.id);
    if (!id) {
      return res.status(400).json({ ok: false, message: "Admin ID is required." });
    }

    const admin = await findAdminById(id);
    if (!admin) {
      return res.status(404).json({ ok: false, message: "Admin not found." });
    }

    return res.json({ ok: true, admin });
  } catch (err) {
    console.error("getAdminById error:", err);
    return next(err);
  }
};

exports.cancelPendingCreateAdmin = async (req, res) => {
  clearPendingCreate(req);
  return res.json({ ok: true, message: "Pending admin creation cancelled." });
};

/* =========================================================
   ALIASES
========================================================= */

exports.addAdmin = exports.requestCreateAdmin;
exports.createAdmin = exports.requestCreateAdmin;
exports.confirmAdminOtp = exports.verifyCreateAdminOtp;
exports.verifyAdminOtp = exports.verifyCreateAdminOtp;
exports.resendAdminOtp = exports.resendCreateAdminOtp;
exports.confirmApprovalOtp = exports.verifyCreateAdminOtp;
exports.verifyApprovalOtp = exports.verifyCreateAdminOtp;

/* =========================================================
   EXPORT HELPERS
========================================================= */

exports.findAdminByEmail = findAdminByEmail;
exports.findAdminById = findAdminById;
exports.generateAdminId = generateAdminId;
exports.generateStrongPassword = generateStrongPassword;
exports.buildUserOtpEmail = buildUserOtpEmail;
exports.buildApprovalOtpEmail = buildApprovalOtpEmail;
exports.buildCredentialsEmail = buildCredentialsEmail;
exports.getCsrfToken = getCsrfToken;
exports.makeAbsoluteUrl = makeAbsoluteUrl;
exports.getSessionAdmin = getSessionAdmin;
exports.requireCurrentApprover = requireCurrentApprover;