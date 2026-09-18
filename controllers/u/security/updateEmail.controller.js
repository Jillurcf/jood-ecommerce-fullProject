"use strict";

require("dotenv").config();

const crypto = require("crypto");
const nodemailer = require("nodemailer");
const { pool } = require("../../../includes/conn");

const OTP_EXPIRES_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;

const APP_URL_RAW = String(process.env.APP_URL || "").trim().replace(/\/$/, "");
const FROM_EMAIL =
  process.env.FROM_EMAIL || process.env.SMTP_USER || "no-reply@example.com";

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function sanitizeText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

function generateOtp() {
  return String(crypto.randomInt(100000, 1000000));
}

function getCsrfToken(req) {
  if (typeof req?.csrfToken !== "function") return null;
  try {
    return req.csrfToken();
  } catch {
    return null;
  }
}

function getSessionCustomer(req) {
  if (req.session?.user?.id) return req.session.user;

  if (req.session?.userId) {
    return {
      id: req.session.userId,
      user_id: req.session.userUserId || null,
      full_name: req.session.userName || null,
      email: req.session.userEmail || null,
      phone: req.session.userPhone || null,
      role: req.session.userRole || "customer",
      provider: req.session.authProvider || "local",
      loginAt: req.session.loginAt || null,
      sessionVersion: req.session.sessionVersion || 1,
    };
  }

  return null;
}

function getBaseUrl(req) {
  if (APP_URL_RAW) return APP_URL_RAW;
  const proto = req?.headers?.["x-forwarded-proto"] || req?.protocol || "http";
  const host = req?.get?.("host");
  return `${proto}://${host}`.replace(/\/$/, "");
}

function buildUrl(req, path) {
  const base = getBaseUrl(req);
  const safePath = String(path || "").startsWith("/") ? path : `/${path}`;
  return `${base}${safePath}`;
}

function setFlash(req, type, message) {
  if (!req.session) return;
  req.session[type] = message;
}

function wantsJson(req) {
  const accept = String(req.headers?.accept || "").toLowerCase();
  return (
    req.xhr ||
    accept.includes("application/json") ||
    String(req.headers?.["content-type"] || "").includes("application/json")
  );
}

function saveSession(req) {
  return new Promise((resolve, reject) => {
    if (!req.session || typeof req.session.save !== "function") {
      return resolve();
    }

    req.session.save((err) => {
      if (err) return reject(err);
      return resolve();
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

/*
  KEEPING THE OTP EMAIL DESIGN 100% SAME
*/
function buildOtpEmail(fullName, otp) {
  const safeName = sanitizeText(fullName) || "User";

  return {
    subject: "Your verification OTP",
    text: `Hello ${safeName},\n\nYour OTP is: ${otp}\n\nThis OTP expires in ${OTP_EXPIRES_MINUTES} minutes.`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#222">
        <h2>Verify your email</h2>
        <p>Hello ${safeName},</p>
        <p>Your OTP is:</p>
        <div style="font-size:28px;font-weight:700;letter-spacing:6px">${otp}</div>
        <p>This OTP expires in ${OTP_EXPIRES_MINUTES} minutes.</p>
      </div>
    `,
  };
}

async function findCustomerById(id) {
  const result = await pool.query(
    `
      SELECT
        id,
        user_id,
        full_name,
        email,
        phone,
        password_hash,
        google_id,
        provider,
        status,
        email_verified,
        phone_verified,
        login_attempts,
        last_attempt_time,
        lock_until,
        last_login_at,
        last_logout_at,
        last_activity_at,
        is_online,
        session_version
      FROM customer_accounts
      WHERE id = $1
      LIMIT 1
    `,
    [id]
  );

  return result.rows[0] || null;
}

async function findAnyAccountByEmail(email) {
  const customer = await pool.query(
    `
      SELECT id, 'customer_accounts'::text AS source
      FROM customer_accounts
      WHERE LOWER(email) = LOWER($1)
      LIMIT 1
    `,
    [email]
  );
  if (customer.rows[0]) return customer.rows[0];

  const admin = await pool.query(
    `
      SELECT id, 'admin_accounts'::text AS source
      FROM admin_accounts
      WHERE LOWER(email) = LOWER($1)
      LIMIT 1
    `,
    [email]
  );
  return admin.rows[0] || null;
}

function getPendingEmailUpdate(req) {
  const pending = req.session?.pendingEmailUpdate || null;
  if (!pending) return null;

  if (pending.expiresAt && Date.now() > Number(pending.expiresAt)) {
    return null;
  }

  return pending;
}

function clearPendingEmailUpdate(req) {
  if (!req.session) return;
  delete req.session.pendingEmailUpdate;
}

async function updateCustomerEmail(userId, newEmail) {
  const result = await pool.query(
    `
      UPDATE customer_accounts
      SET email = $2,
          email_verified = TRUE,
          updated_at = NOW()
      WHERE id = $1
      RETURNING
        id,
        user_id,
        full_name,
        email,
        phone,
        provider,
        status,
        email_verified,
        phone_verified,
        session_version
    `,
    [userId, newEmail]
  );

  return result.rows[0] || null;
}

function syncSessionEmail(req, email) {
  if (!req.session) return;

  if (req.session.user) {
    req.session.user.email = email;
  }

  req.session.userEmail = email;
}

async function renderUpdateEmail(res, req, options = {}) {
  return res.render("customer/u/security/updateEmail", {
    title: "Update Email",
    error: options.error || null,
    success: options.success || null,
    old: options.old || {},
    token: options.token || null,
    otpEmail: options.otpEmail || null,
    otpStep: !!options.otpStep,
    csrfToken: getCsrfToken(req),
    user: req.session?.user || res.locals.user || null,
  });
}

async function renderOtpPage(res, req, options = {}) {
  return res.render("customer/u/security/updateEmail", {
    title: "Update Email",
    error: options.error || null,
    success: options.success || null,
    old: options.old || {},
    token: options.token || null,
    otpEmail: options.otpEmail || null,
    otpStep: true,
    csrfToken: getCsrfToken(req),
    user: req.session?.user || res.locals.user || null,
  });
}

function respondWithOtpStep(req, res, payload = {}) {
  const body = {
    ok: true,
    otpStep: true,
    otpEmail: payload.otpEmail || null,
    message:
      payload.message || "OTP has been sent to your new email address.",
  };

  if (wantsJson(req)) {
    return res.status(200).json(body);
  }

  return renderUpdateEmail(res, req, {
    success: body.message,
    otpStep: true,
    otpEmail: body.otpEmail,
    old: { email: body.otpEmail || "" },
  });
}

function respondWithSuccess(req, res, payload = {}) {
  const body = {
    ok: true,
    message: payload.message || "Email updated successfully.",
    redirectUrl: payload.redirectUrl || "/customer/u/profile",
  };

  if (wantsJson(req)) {
    return res.status(200).json(body);
  }

  setFlash(req, "success", body.message);
  return res.redirect(body.redirectUrl);
}

exports.getUpdateEmailPage = async (req, res, next) => {
  try {
    const currentUser = getSessionCustomer(req);
    if (!currentUser) {
      return res.redirect("/customer/sign/in");
    }

    const freshUser = await findCustomerById(currentUser.id);
    if (!freshUser) {
      return res.redirect("/customer/sign/in");
    }

    const pending = getPendingEmailUpdate(req);

    return renderUpdateEmail(res, req, {
      old: { email: freshUser.email || "" },
      otpStep: !!pending,
      otpEmail: pending?.newEmail || null,
      success: req.session?.success || null,
    });
  } catch (err) {
    return next(err);
  }
};

exports.postUpdateEmail = async (req, res, next) => {
  try {
    const currentUser = getSessionCustomer(req);
    if (!currentUser) {
      return res.redirect("/customer/sign/in");
    }

    const freshUser = await findCustomerById(currentUser.id);
    if (!freshUser) {
      return res.redirect("/customer/sign/in");
    }

    const newEmail = normalizeEmail(req.body?.email || req.body?.new_email);

    if (!newEmail || !isValidEmail(newEmail)) {
      return renderUpdateEmail(res, req, {
        error: "Please enter a valid email address.",
        old: { email: newEmail },
        otpStep: false,
      });
    }

    if (normalizeEmail(freshUser.email) === newEmail) {
      return renderUpdateEmail(res, req, {
        error: "This email is already your current email address.",
        old: { email: newEmail },
        otpStep: false,
      });
    }

    const existing = await findAnyAccountByEmail(newEmail);
    if (existing) {
      return renderUpdateEmail(res, req, {
        error: "This email address is already registered.",
        old: { email: newEmail },
        otpStep: false,
      });
    }

    if (!req.session) {
      return renderUpdateEmail(res, req, {
        error: "Session is not available.",
        old: { email: newEmail },
        otpStep: false,
      });
    }

    const otp = generateOtp();

    req.session.pendingEmailUpdate = {
      userId: freshUser.id,
      currentEmail: freshUser.email,
      newEmail,
      otp,
      otpAttempts: 0,
      expiresAt: Date.now() + OTP_EXPIRES_MINUTES * 60 * 1000,
      createdAt: Date.now(),
    };

    const mail = buildOtpEmail(freshUser.full_name, otp);

    try {
      await sendMail({
        to: newEmail,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
      });
    } catch (mailErr) {
      console.error("Email update OTP failed:", mailErr);
      clearPendingEmailUpdate(req);
      return renderUpdateEmail(res, req, {
        error: "Unable to send OTP. Please try again.",
        old: { email: newEmail },
        otpStep: false,
      });
    }

    await saveSession(req);

    return respondWithOtpStep(req, res, {
      otpEmail: newEmail,
      message: "OTP has been sent. Please verify the code in the same drawer.",
    });
  } catch (err) {
    return next(err);
  }
};

exports.getVerifyEmailOtpPage = async (req, res, next) => {
  try {
    const pending = getPendingEmailUpdate(req);
    if (!pending) {
      return res.redirect("/customer/u/security/updateEmail");
    }

    return renderOtpPage(res, req, {
      old: { email: pending.newEmail },
      otpEmail: pending.newEmail,
    });
  } catch (err) {
    return next(err);
  }
};

exports.postVerifyEmailOtp = async (req, res, next) => {
  try {
    const pending = getPendingEmailUpdate(req);

    if (!pending) {
      return wantsJson(req)
        ? res.status(400).json({ ok: false, message: "OTP session expired." })
        : res.redirect("/customer/u/security/updateEmail");
    }

    const enteredOtp = String(req.body?.otp || req.body?.code || "").trim();

    if (!enteredOtp) {
      return renderOtpPage(res, req, {
        error: "Please enter the OTP.",
        old: { email: pending.newEmail },
        otpEmail: pending.newEmail,
      });
    }

    if (Date.now() > Number(pending.expiresAt)) {
      clearPendingEmailUpdate(req);
      return renderOtpPage(res, req, {
        error: "OTP expired. Please request a new one.",
        otpEmail: pending.newEmail,
      });
    }

    const attempts = Number(pending.otpAttempts || 0) + 1;
    pending.otpAttempts = attempts;
    req.session.pendingEmailUpdate = pending;

    if (attempts > OTP_MAX_ATTEMPTS) {
      clearPendingEmailUpdate(req);
      return renderOtpPage(res, req, {
        error: "Too many OTP attempts. Please request a new one.",
        otpEmail: pending.newEmail,
      });
    }

    if (enteredOtp !== String(pending.otp)) {
      return renderOtpPage(res, req, {
        error: "Invalid OTP.",
        old: { email: pending.newEmail },
        otpEmail: pending.newEmail,
      });
    }

    const currentUser = getSessionCustomer(req);
    if (!currentUser || Number(currentUser.id) !== Number(pending.userId)) {
      clearPendingEmailUpdate(req);
      return res.redirect("/customer/sign/in");
    }

    const conflict = await findAnyAccountByEmail(pending.newEmail);
    if (conflict) {
      clearPendingEmailUpdate(req);
      return renderOtpPage(res, req, {
        error: "This email address is already registered.",
        old: { email: pending.newEmail },
        otpEmail: pending.newEmail,
      });
    }

    const updatedUser = await updateCustomerEmail(pending.userId, pending.newEmail);
    if (!updatedUser) {
      clearPendingEmailUpdate(req);
      return renderOtpPage(res, req, {
        error: "Unable to update email right now.",
        otpEmail: pending.newEmail,
      });
    }

    syncSessionEmail(req, pending.newEmail);
    clearPendingEmailUpdate(req);
    setFlash(req, "success", "Email updated successfully.");

    return respondWithSuccess(req, res, {
      message: "Email updated successfully.",
      redirectUrl: "/customer/u/profile",
    });
  } catch (err) {
    return next(err);
  }
};

exports.postResendEmailOtp = async (req, res, next) => {
  try {
    const pending = getPendingEmailUpdate(req);

    if (!pending) {
      return wantsJson(req)
        ? res.status(400).json({ ok: false, message: "OTP session expired." })
        : res.redirect("/customer/u/security/updateEmail");
    }

    const currentUser = getSessionCustomer(req);
    if (!currentUser || Number(currentUser.id) !== Number(pending.userId)) {
      clearPendingEmailUpdate(req);
      return res.redirect("/customer/sign/in");
    }

    const otp = generateOtp();
    pending.otp = otp;
    pending.otpAttempts = 0;
    pending.expiresAt = Date.now() + OTP_EXPIRES_MINUTES * 60 * 1000;
    req.session.pendingEmailUpdate = pending;

    const mail = buildOtpEmail(currentUser.full_name || pending.currentEmail, otp);

    try {
      await sendMail({
        to: pending.newEmail,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
      });
    } catch (mailErr) {
      console.error("Resend email OTP failed:", mailErr);
      return renderOtpPage(res, req, {
        error: "Unable to resend OTP. Please try again.",
        old: { email: pending.newEmail },
        otpEmail: pending.newEmail,
      });
    }

    await saveSession(req);

    if (wantsJson(req)) {
      return res.status(200).json({
        ok: true,
        otpStep: true,
        otpEmail: pending.newEmail,
        message: "A new OTP has been sent.",
      });
    }

    return renderOtpPage(res, req, {
      success: "A new OTP has been sent.",
      old: { email: pending.newEmail },
      otpEmail: pending.newEmail,
    });
  } catch (err) {
    return next(err);
  }
};

exports.findCustomerById = findCustomerById;
exports.getCsrfToken = getCsrfToken;
exports.buildOtpEmail = buildOtpEmail;