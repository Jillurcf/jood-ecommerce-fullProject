"use strict";

require("dotenv").config();

const crypto = require("crypto");
const nodemailer = require("nodemailer");
const { pool } = require("../../../includes/conn");

/* =========================================================
   CONFIG
========================================================= */

const TABLE_NAME = "customer_payment_methods";
const VIEW_PAYMENT_METHODS = "customer/u/account/payment-methods";

const COMPANY_NAME = "JOOD | Quality Goods & Products";
const SUPPORT_EMAIL = "info@jood.com";
const SUPPORT_PHONE = "+971 53 37 2440";
const LOGO_URL = "https://telal-contracting.com/logo.png";

const FROM_EMAIL =
  process.env.FROM_EMAIL || process.env.SMTP_USER || "no-reply@example.com";

const OTP_EXPIRES_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;
const OTP_LENGTH = 6;
const OTP_VERIFIED_MINUTES = 10;

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

/* =========================================================
   STRING / NORMALIZE HELPERS
========================================================= */

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizeText(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function normalizeEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeDigits(value) {
  return String(value ?? "").replace(/\D+/g, "");
}

function normalizeMonth(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (n < 1 || n > 12) return null;
  return String(Math.trunc(n)).padStart(2, "0");
}

function normalizeYear(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const y = Math.trunc(n);
  if (y < 2000 || y > 2100) return null;
  return String(y);
}

function normalizeProvider(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  return raw || "visa";
}

function normalizeMethodType(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  return raw === "wallet" ? "wallet" : "card";
}

function normalizeBoolean(value) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function isValidProvider(value) {
  return ["visa", "mastercard", "amex", "paypal", "stripe"].includes(
    String(value ?? "").trim().toLowerCase()
  );
}

function isValidCardholderName(value) {
  const raw = sanitizeText(value);
  return raw.length >= 2 && raw.length <= 120;
}

function isValidCardNumber(value) {
  const digits = normalizeDigits(value);
  return digits.length >= 13 && digits.length <= 19;
}

function isValidExpiryMonth(value) {
  return normalizeMonth(value) !== null;
}

function isValidExpiryYear(value) {
  return normalizeYear(value) !== null;
}

function isValidEmail(value) {
  const raw = normalizeEmail(value);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw);
}

function isJsonLike(value) {
  if (value == null) return false;
  if (typeof value === "object") return true;

  const s = String(value).trim();
  return (
    (s.startsWith("{") && s.endsWith("}")) ||
    (s.startsWith("[") && s.endsWith("]"))
  );
}

function parseMeta(value) {
  if (value == null || value === "") return null;
  if (typeof value === "object") return value;

  const raw = String(value).trim();
  if (!raw) return null;

  if (isJsonLike(raw)) {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }

  return raw;
}

function getClientIp(req) {
  return (
    req.headers?.["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.ip ||
    req.connection?.remoteAddress ||
    null
  );
}

function maskCardNumber(cardNumber) {
  const digits = normalizeDigits(cardNumber);
  if (digits.length < 4) return "****";
  return `**** **** **** ${digits.slice(-4)}`;
}

function inferCardBrand(cardNumber) {
  const digits = normalizeDigits(cardNumber);
  if (!digits) return "card";

  if (digits.startsWith("4")) return "visa";

  if (
    /^5[1-5]/.test(digits) ||
    /^(2221|222[2-9]|22[3-9]\d|2[3-6]\d{2}|27[01]\d|2720)/.test(digits)
  ) {
    return "mastercard";
  }

  if (/^3[47]/.test(digits)) return "amex";

  return "card";
}

function getCardFingerprint(cardNumber) {
  return crypto
    .createHash("sha256")
    .update(normalizeDigits(cardNumber))
    .digest("hex");
}

/* =========================================================
   AUTH HELPERS
========================================================= */

function getCurrentUserId(req) {
  const s = req.session || {};

  return (
    s.customerId ||
    s.userId ||
    s.adminId ||
    s.customer?.id ||
    s.user?.id ||
    s.admin?.id ||
    s.customer?.user_id ||
    s.user?.user_id ||
    s.admin?.user_id ||
    null
  );
}

function getCurrentActor(req) {
  const s = req.session || {};
  const userId = getCurrentUserId(req);

  const user =
    s.customer ||
    s.user ||
    s.admin ||
    (userId
      ? {
          id: userId,
          email: s.customerEmail || s.userEmail || s.adminEmail || null,
          full_name: s.customerName || s.userName || s.adminName || null,
          role: s.customerRole || s.userRole || s.adminRole || "customer",
        }
      : null);

  if (!user) return null;

  return {
    id: user.id || null,
    email: normalizeEmail(
      user.email || s.customerEmail || s.userEmail || s.adminEmail || ""
    ),
    full_name: sanitizeText(
      user.full_name ||
        user.name ||
        s.customerName ||
        s.userName ||
        s.adminName ||
        ""
    ),
    role: String(
      user.role || s.customerRole || s.userRole || s.adminRole || "customer"
    ).toLowerCase(),
    ip: getClientIp(req),
  };
}

function isAjax(req) {
  return (
    req.xhr ||
    String(req.headers?.["x-requested-with"] || "").toLowerCase() ===
      "xmlhttprequest" ||
    String(req.headers?.accept || "").includes("application/json")
  );
}

function requireActor(req, res) {
  const userId = getCurrentUserId(req);

  if (!userId) {
    if (isAjax(req)) {
      res.status(401).json({ ok: false, message: "Please sign in first." });
      return null;
    }

    return res.redirect("/customer/");
  }

  const actor = getCurrentActor(req);
  if (!actor) {
    if (isAjax(req)) {
      res.status(401).json({ ok: false, message: "Please sign in first." });
      return null;
    }

    return res.redirect("/customer/");
  }

  return actor;
}

function respond(req, res, payload, viewData = null) {
  if (isAjax(req)) {
    return res.status(payload.ok ? 200 : 400).json(payload);
  }

  if (viewData) {
    return res.render(VIEW_PAYMENT_METHODS, viewData);
  }

  return res.redirect("/customer/u/account/payment-methods");
}

function renderPage(res, data = {}) {
  return res.render(VIEW_PAYMENT_METHODS, data);
}

/* =========================================================
   EMAIL TEMPLATE
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
                  ${escapeHtml(title)}
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
                © ${new Date().getFullYear()} ${COMPANY_NAME}. All rights reserved.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </div>
  `;
}

function buildOtpEmail(fullName, otp, actionLabel = "payment method action") {
  const safeName = sanitizeText(fullName);
  const greetingLine = safeName ? `Hello ${escapeHtml(safeName)},` : "Hello,";

  const html = buildEmailTemplate({
    title: "Approval OTP",
    content: `
      <p style="margin:0 0 16px;">${greetingLine}</p>
      <p style="margin:0 0 18px;">Use the OTP below to approve your ${escapeHtml(
        actionLabel
      )}.</p>
      <div style="text-align:center;margin:24px 0;">
        <div style="display:inline-block;padding:16px 22px;border:1px dashed #d1d5db;border-radius:12px;background:#ffffff;">
          <span style="font-size:32px;font-weight:700;letter-spacing:7px;color:#111827;">${escapeHtml(
            otp
          )}</span>
        </div>
      </div>
      <p style="margin:0 0 12px;">This OTP expires in <strong>${OTP_EXPIRES_MINUTES} minutes</strong>.</p>
      <p style="margin:0;">If you did not request this, please ignore this email or contact support immediately.</p>
    `,
    footerNote: "For security, never share your OTP with anyone.",
  });

  const text = `
${greetingLine}

Use the OTP below to approve your ${actionLabel}.

Your OTP is: ${otp}

This OTP expires in ${OTP_EXPIRES_MINUTES} minutes.

If you did not request this, please contact support immediately.

${COMPANY_NAME}
${SUPPORT_EMAIL}
${SUPPORT_PHONE}
`;

  return { html, text };
}

/* =========================================================
   MAILER
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

async function sendMail({ to, subject, html, text }) {
  const transporter = await createMailer();
  await transporter.sendMail({
    from: FROM_EMAIL,
    to,
    subject,
    html,
    text,
  });
}

/* =========================================================
   ENCRYPTION HELPERS
========================================================= */

function getCardEncryptionKey() {
  const key = process.env.CARD_ENCRYPTION_KEY;
  if (!key) return null;

  const clean = key.trim();
  if (/^[a-f0-9]{64}$/i.test(clean)) return Buffer.from(clean, "hex");

  const buf = Buffer.from(clean, "base64");
  if (buf.length === 32) return buf;

  return null;
}

function encryptValue(value) {
  const key = getCardEncryptionKey();
  if (!key) return null;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(String(value ?? ""), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

/* =========================================================
   DB HELPERS
========================================================= */

async function listPaymentMethods({
  userId,
  page = 1,
  limit = DEFAULT_PAGE_SIZE,
  q = "",
  provider = "",
  methodType = "",
} = {}) {
  const safeUserId = String(userId ?? "").trim();
  if (!safeUserId) {
    return {
      total: 0,
      page: 1,
      limit: DEFAULT_PAGE_SIZE,
      totalPages: 1,
      rows: [],
    };
  }

  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number(limit) || DEFAULT_PAGE_SIZE)
  );
  const offset = (safePage - 1) * safeLimit;

  const where = [`user_id = $1`];
  const params = [safeUserId];
  let i = 2;

  if (q) {
    where.push(`(
      COALESCE(cardholder_name, '') ILIKE $${i}
      OR COALESCE(provider, '') ILIKE $${i}
      OR COALESCE(method_type, '') ILIKE $${i}
      OR COALESCE(card_last4, '') ILIKE $${i}
      OR COALESCE(account_email, '') ILIKE $${i}
      OR COALESCE(display_name, '') ILIKE $${i}
    )`);
    params.push(`%${q}%`);
    i++;
  }

  if (provider) {
    where.push(`COALESCE(provider, '') = $${i}`);
    params.push(provider);
    i++;
  }

  if (methodType) {
    where.push(`COALESCE(method_type, '') = $${i}`);
    params.push(methodType);
    i++;
  }

  const whereSql = `WHERE ${where.join(" AND ")}`;

  const countSql = `
    SELECT COUNT(*)::int AS total
    FROM ${TABLE_NAME}
    ${whereSql}
  `;

  const listSql = `
    SELECT *
    FROM ${TABLE_NAME}
    ${whereSql}
    ORDER BY is_default DESC, created_at DESC
    LIMIT $${i} OFFSET $${i + 1}
  `;

  const totalResult = await pool.query(countSql, params);
  const total = Number(totalResult.rows[0]?.total || 0);

  const rowsResult = await pool.query(listSql, [...params, safeLimit, offset]);

  return {
    total,
    page: safePage,
    limit: safeLimit,
    totalPages: Math.max(1, Math.ceil(total / safeLimit)),
    rows: rowsResult.rows || [],
  };
}

async function getPaymentById(id) {
  const result = await pool.query(
    `
      SELECT *
      FROM ${TABLE_NAME}
      WHERE id = $1
      LIMIT 1
    `,
    [id]
  );

  return result.rows[0] || null;
}

async function getPaymentByUserAndFingerprint(userId, fingerprint) {
  const result = await pool.query(
    `
      SELECT *
      FROM ${TABLE_NAME}
      WHERE user_id = $1
        AND card_fingerprint = $2
      LIMIT 1
    `,
    [String(userId ?? "").trim(), fingerprint]
  );

  return result.rows[0] || null;
}

async function insertPaymentRecord(payload) {
  const result = await pool.query(
    `
      INSERT INTO ${TABLE_NAME} (
        user_id,
        method_type,
        provider,
        cardholder_name,
        card_brand,
        card_last4,
        card_fingerprint,
        card_number_enc,
        expiry_month,
        expiry_year,
        display_name,
        account_email,
        is_default,
        meta,
        created_at,
        updated_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW(),NOW())
      RETURNING *
    `,
    [
      String(payload.user_id ?? "").trim(),
      payload.method_type,
      payload.provider,
      payload.cardholder_name,
      payload.card_brand,
      payload.card_last4,
      payload.card_fingerprint,
      payload.card_number_enc,
      payload.expiry_month,
      payload.expiry_year,
      payload.display_name,
      payload.account_email,
      payload.is_default,
      payload.meta,
    ]
  );

  return result.rows[0] || null;
}

async function deletePaymentRecordById(userId, id) {
  const result = await pool.query(
    `
      DELETE FROM ${TABLE_NAME}
      WHERE id = $1
        AND user_id = $2
      RETURNING *
    `,
    [id, String(userId ?? "").trim()]
  );

  return result.rows[0] || null;
}

async function deletePaymentRecordByFingerprint(userId, fingerprint) {
  const result = await pool.query(
    `
      DELETE FROM ${TABLE_NAME}
      WHERE user_id = $1
        AND card_fingerprint = $2
      RETURNING *
    `,
    [String(userId ?? "").trim(), fingerprint]
  );

  return result.rows[0] || null;
}

/* =========================================================
   OTP SESSION HELPERS
========================================================= */

function getPendingApproval(req) {
  const pending = req.session?.pendingPaymentApproval || null;
  if (!pending) return null;

  const expiresAt = Number(pending.expiresAt || 0);
  if (expiresAt && Date.now() > expiresAt) {
    return null;
  }

  return pending;
}

function clearPendingApproval(req) {
  if (!req.session) return;
  delete req.session.pendingPaymentApproval;
}

function setPendingApproval(req, payload) {
  if (!req.session) return;
  req.session.pendingPaymentApproval = payload;
}

function isPendingApprovalOwner(req, pending) {
  const actor = getCurrentActor(req);
  if (!pending?.requestedBy?.id || !actor?.id) return false;
  return String(pending.requestedBy.id) === String(actor.id);
}

function hasVerifiedApproval(req, expectedActionLabel = null) {
  const pending = getPendingApproval(req);
  if (!pending) return null;
  if (!isPendingApprovalOwner(req, pending)) return null;
  if (!pending.verified) return null;

  const verifiedUntil = Number(pending.verifiedUntil || 0);
  if (verifiedUntil && Date.now() > verifiedUntil) return null;

  if (
    expectedActionLabel &&
    String(pending.actionLabel || "") !== String(expectedActionLabel)
  ) {
    return null;
  }

  return pending;
}

async function sendApprovalOtp(req, actionLabel) {
  const actor = getCurrentActor(req);
  if (!actor?.email) {
    throw new Error("Your account email is not available for OTP delivery.");
  }

  const otp = crypto
    .randomInt(10 ** (OTP_LENGTH - 1), 10 ** OTP_LENGTH)
    .toString();

  const otpHash = crypto.createHash("sha256").update(otp).digest("hex");

  setPendingApproval(req, {
    actionLabel,
    otpHash,
    otpAttempts: 0,
    verified: false,
    verifiedUntil: null,
    expiresAt: Date.now() + OTP_EXPIRES_MINUTES * 60 * 1000,
    createdAt: Date.now(),
    requestedBy: {
      id: actor.id,
      email: actor.email,
      full_name: actor.full_name,
      role: actor.role,
      ip: actor.ip,
    },
  });

  const mail = buildOtpEmail(
    actor.full_name || actor.email || "User",
    otp,
    actionLabel
  );

  await sendMail({
    to: actor.email,
    subject: "Payment Method Approval OTP",
    html: mail.html,
    text: mail.text,
  });

  return {
    ok: true,
    message: `OTP sent to ${actor.email}.`,
  };
}

function markApprovalVerified(req) {
  const pending = getPendingApproval(req);
  if (!pending) return null;

  pending.verified = true;
  pending.verifiedAt = Date.now();
  pending.verifiedUntil = Date.now() + OTP_VERIFIED_MINUTES * 60 * 1000;
  pending.otpHash = null;
  pending.otpAttempts = 0;

  setPendingApproval(req, pending);
  return pending;
}

/* =========================================================
   VALIDATION
========================================================= */

function validateCreatePayload(body) {
  const method_type = normalizeMethodType(body?.method_type);
  const provider = normalizeProvider(body?.provider);

  const cardholder_name = sanitizeText(body?.cardholder_name);
  const card_number = normalizeDigits(body?.card_number);
  const expiry_month = normalizeMonth(body?.expiry_month);
  const expiry_year = normalizeYear(body?.expiry_year);
  const display_name = sanitizeText(body?.display_name);
  const account_email = normalizeEmail(body?.account_email);
  const is_default = normalizeBoolean(body?.is_default);
  const meta = parseMeta(body?.meta);
  const cvv = normalizeDigits(body?.cvv);

  if (!isValidProvider(provider)) {
    return {
      ok: false,
      message:
        "Please choose a valid provider: visa, mastercard, amex, paypal, or stripe.",
    };
  }

  if (method_type === "card") {
    if (!isValidCardholderName(cardholder_name)) {
      return { ok: false, message: "Please enter the cardholder name." };
    }

    if (!isValidCardNumber(card_number)) {
      return { ok: false, message: "Please enter a valid card number." };
    }

    if (!isValidExpiryMonth(expiry_month)) {
      return { ok: false, message: "Please choose a valid expiry month." };
    }

    if (!isValidExpiryYear(expiry_year)) {
      return { ok: false, message: "Please choose a valid expiry year." };
    }
  } else {
    if (!isValidEmail(account_email)) {
      return { ok: false, message: "Please enter a valid account email." };
    }
  }

  const card_brand = method_type === "card" ? inferCardBrand(card_number) : provider;
  const card_last4 = method_type === "card" ? card_number.slice(-4) : null;
  const card_fingerprint =
    method_type === "card" ? getCardFingerprint(card_number) : null;
  const card_number_enc =
    method_type === "card" ? encryptValue(card_number) : null;

  return {
    ok: true,
    data: {
      method_type,
      provider,
      cardholder_name: method_type === "card" ? cardholder_name : null,
      card_brand,
      card_last4,
      card_fingerprint,
      card_number_enc,
      expiry_month: method_type === "card" ? expiry_month : null,
      expiry_year: method_type === "card" ? expiry_year : null,
      display_name:
        display_name ||
        (method_type === "card"
          ? `${card_brand.toUpperCase()} ${maskCardNumber(card_number)}`
          : provider.toUpperCase()),
      account_email: method_type === "wallet" ? account_email : null,
      is_default,
      meta: {
        ...(typeof meta === "object" && meta ? meta : {}),
        cvv_ignored: Boolean(cvv),
      },
    },
  };
}

function validateDeletePayload(body) {
  const id =
    body?.id != null && String(body.id).trim() !== ""
      ? String(body.id).trim()
      : null;

  const card_number = normalizeDigits(body?.card_number);
  const card_fingerprint = body?.card_fingerprint
    ? String(body.card_fingerprint).trim()
    : null;

  if (id) {
    return { ok: true, data: { mode: "id", id } };
  }

  if (!card_fingerprint && !card_number) {
    return {
      ok: false,
      message:
        "Please provide the saved card number or card fingerprint to remove it.",
    };
  }

  return {
    ok: true,
    data: {
      mode: "fingerprint",
      fingerprint: card_fingerprint || getCardFingerprint(card_number),
    },
  };
}

/* =========================================================
   CONTROLLER: PAGE / LIST
========================================================= */

exports.getPayments = async (req, res, next) => {
  try {
    const actor = requireActor(req, res);
    if (!actor) return;

    const page = Number(req.query?.page || 1);
    const limit = Number(req.query?.limit || DEFAULT_PAGE_SIZE);
    const q = sanitizeText(req.query?.q);
    const provider = sanitizeText(req.query?.provider);
    const methodType = sanitizeText(req.query?.method_type);

    const data = await listPaymentMethods({
      userId: actor.id,
      page,
      limit,
      q,
      provider,
      methodType,
    });

    const rows = (data.rows || []).map((row) => ({
      ...row,
      card_number_masked: row.card_last4 ? `**** **** **** ${row.card_last4}` : null,
      card_number_enc: undefined,
    }));

    if (isAjax(req)) {
      return res.json({
        ok: true,
        rows,
        pagination: {
          page: data.page,
          limit: data.limit,
          total: data.total,
          totalPages: data.totalPages,
        },
        filters: {
          q,
          provider,
          method_type: methodType,
        },
        pendingOtp: !!getPendingApproval(req),
      });
    }

    return renderPage(res, {
      title: "Payment Methods",
      user: actor,
      rows,
      pagination: {
        page: data.page,
        limit: data.limit,
        total: data.total,
        totalPages: data.totalPages,
      },
      filters: {
        q,
        provider,
        method_type: methodType,
      },
      pendingApproval: getPendingApproval(req),
      csrfToken: exports.getCsrfToken(req),
    });
  } catch (err) {
    return next(err);
  }
};

exports.getPaymentMethodsPage = exports.getPayments;
exports.getPaymentMethodsData = exports.getPayments;

/* =========================================================
   CONTROLLER: OTP REQUEST / VERIFY
========================================================= */

exports.requestPaymentApprovalOtp = async (req, res, next) => {
  try {
    const actor = requireActor(req, res);
    if (!actor) return;

    const action = sanitizeText(req.body?.action);
    const actionLabel =
      action === "delete"
        ? "Remove saved payment method"
        : action === "create"
        ? "Add saved payment method"
        : "Approve payment method change";

    const pending = getPendingApproval(req);
    if (pending && !isPendingApprovalOwner(req, pending)) {
      clearPendingApproval(req);
    }

    const result = await sendApprovalOtp(req, actionLabel);
    return respond(req, res, result);
  } catch (err) {
    return next(err);
  }
};

exports.verifyPaymentApprovalOtp = async (req, res, next) => {
  try {
    const actor = requireActor(req, res);
    if (!actor) return;

    const otp = sanitizeText(req.body?.otp || req.body?.code);
    const pending = getPendingApproval(req);

    if (!pending) {
      return respond(req, res, {
        ok: false,
        message: "OTP session expired. Please request a new OTP.",
      });
    }

    if (!isPendingApprovalOwner(req, pending)) {
      clearPendingApproval(req);
      return respond(req, res, {
        ok: false,
        message: "OTP session is not valid for this user.",
      });
    }

    const attempts = Number(pending.otpAttempts || 0) + 1;
    pending.otpAttempts = attempts;
    req.session.pendingPaymentApproval = pending;

    if (attempts > OTP_MAX_ATTEMPTS) {
      clearPendingApproval(req);
      return respond(req, res, {
        ok: false,
        message: "Too many OTP attempts. Please request a new OTP.",
      });
    }

    if (!otp) {
      return respond(req, res, {
        ok: false,
        message: "Please enter the OTP.",
      });
    }

    if (Date.now() > Number(pending.expiresAt || 0)) {
      clearPendingApproval(req);
      return respond(req, res, {
        ok: false,
        message: "OTP expired. Please request a new OTP.",
      });
    }

    if (crypto.createHash("sha256").update(otp).digest("hex") !== pending.otpHash) {
      return respond(req, res, {
        ok: false,
        message: "Invalid OTP.",
      });
    }

    markApprovalVerified(req);

    return respond(req, res, {
      ok: true,
      message: "OTP verified successfully.",
    });
  } catch (err) {
    return next(err);
  }
};

/* =========================================================
   CONTROLLER: CREATE SAVED PAYMENT METHOD
========================================================= */

exports.createPaymentRecord = async (req, res, next) => {
  try {
    const actor = requireActor(req, res);
    if (!actor) return;

    const approved = hasVerifiedApproval(req, "Add saved payment method");
    if (!approved) {
      return respond(req, res, {
        ok: false,
        message: "Please request and verify OTP before adding a payment method.",
      });
    }

    const validation = validateCreatePayload(req.body);
    if (!validation.ok) {
      return respond(req, res, validation);
    }

    const exists = validation.data.card_fingerprint
      ? await getPaymentByUserAndFingerprint(actor.id, validation.data.card_fingerprint)
      : null;

    if (exists) {
      clearPendingApproval(req);
      return respond(req, res, {
        ok: false,
        message: "This payment method already exists.",
      });
    }

    const created = await insertPaymentRecord({
      user_id: actor.id,
      ...validation.data,
    });

    if (!created) {
      clearPendingApproval(req);
      return respond(req, res, {
        ok: false,
        message: "Unable to save payment method.",
      });
    }

    const safeRow = {
      ...created,
      card_number_masked: created.card_last4
        ? `**** **** **** ${created.card_last4}`
        : null,
      card_number_enc: undefined,
    };

    clearPendingApproval(req);

    return respond(req, res, {
      ok: true,
      message: "Payment method added successfully.",
      row: safeRow,
    });
  } catch (err) {
    return next(err);
  }
};

/* =========================================================
   CONTROLLER: DELETE SAVED PAYMENT METHOD
========================================================= */

exports.requestDeletePaymentOtp = async (req, res, next) => {
  try {
    const actor = requireActor(req, res);
    if (!actor) return;

    const pending = getPendingApproval(req);
    if (pending && !isPendingApprovalOwner(req, pending)) {
      clearPendingApproval(req);
    }

    const result = await sendApprovalOtp(req, "Remove saved payment method");
    return respond(req, res, result);
  } catch (err) {
    return next(err);
  }
};

exports.deletePaymentRecord = async (req, res, next) => {
  try {
    const actor = requireActor(req, res);
    if (!actor) return;

    const approved = hasVerifiedApproval(req, "Remove saved payment method");
    if (!approved) {
      return respond(req, res, {
        ok: false,
        message: "Please request and verify OTP before removing a payment method.",
      });
    }

    const validation = validateDeletePayload(req.body);
    if (!validation.ok) {
      return respond(req, res, validation);
    }

    let deleted = null;

    if (validation.data.mode === "id") {
      deleted = await deletePaymentRecordById(actor.id, validation.data.id);
    } else {
      deleted = await deletePaymentRecordByFingerprint(
        actor.id,
        validation.data.fingerprint
      );
    }

    if (!deleted) {
      clearPendingApproval(req);
      return respond(req, res, {
        ok: false,
        message: "Payment method not found.",
      });
    }

    clearPendingApproval(req);

    return respond(req, res, {
      ok: true,
      message: "Payment method removed successfully.",
      row: {
        ...deleted,
        card_number_enc: undefined,
      },
    });
  } catch (err) {
    return next(err);
  }
};

/* =========================================================
   CONTROLLER: GET ONE
========================================================= */

exports.getPaymentRecordById = async (req, res, next) => {
  try {
    const actor = requireActor(req, res);
    if (!actor) return;

    const id = String(req.params?.id || "").trim();
    if (!id) {
      return res
        .status(400)
        .json({ ok: false, message: "Missing payment method ID." });
    }

    const row = await getPaymentById(id);
    if (!row) {
      return res
        .status(404)
        .json({ ok: false, message: "Payment method not found." });
    }

    if (String(row.user_id) !== String(actor.id)) {
      return res.status(403).json({ ok: false, message: "Forbidden." });
    }

    return res.json({
      ok: true,
      row: {
        ...row,
        card_number_masked: row.card_last4
          ? `**** **** **** ${row.card_last4}`
          : null,
        card_number_enc: undefined,
      },
    });
  } catch (err) {
    return next(err);
  }
};

/* =========================================================
   ROUTE-COMPATIBLE ALIASES
========================================================= */

exports.createPayment = exports.createPaymentRecord;
exports.sendOtp = exports.requestPaymentApprovalOtp;
exports.verifyOtp = exports.verifyPaymentApprovalOtp;
exports.deletePayment = exports.deletePaymentRecord;

/* =========================================================
   OPTIONAL HELPERS
========================================================= */

exports.getCsrfToken = function getCsrfToken(req) {
  if (typeof req?.csrfToken !== "function") return null;

  try {
    return req.csrfToken();
  } catch {
    return null;
  }
};

exports.sendApprovalOtp = sendApprovalOtp;
exports.listPayments = listPaymentMethods;
exports.getPaymentById = getPaymentById;
exports.getCurrentActor = getCurrentActor;
exports.buildEmailTemplate = buildEmailTemplate;
exports.buildOtpEmail = buildOtpEmail;