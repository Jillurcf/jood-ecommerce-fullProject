"use strict";

require("dotenv").config();

const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");
const { pool } = require("../../../includes/conn");

const OTP_EXPIRES_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;
const PASSWORD_SALT_ROUNDS = 12;
const MIN_PASSWORD_LENGTH = 8;

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

function isValidPassword(password) {
  return String(password || "").length >= MIN_PASSWORD_LENGTH;
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
  Used for both email verification and password reset OTP.
*/
function buildOtpEmail(fullName, otp, options = {}) {
  const safeName = sanitizeText(fullName) || "User";
  const heading = sanitizeText(options.heading || "Verify your identity");
  const subject = sanitizeText(options.subject || "Your verification OTP");
  const intro = sanitizeText(options.intro || "Your OTP is:");
  const footer =
    sanitizeText(
      options.footer || `This OTP expires in ${OTP_EXPIRES_MINUTES} minutes.`
    ) || `This OTP expires in ${OTP_EXPIRES_MINUTES} minutes.`;

  return {
    subject,
    text: `Hello ${safeName},\n\n${intro} ${otp}\n\n${footer}`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#222">
        <h2>${heading}</h2>
        <p>Hello ${safeName},</p>
        <p>${intro}</p>
        <div style="font-size:28px;font-weight:700;letter-spacing:6px">${otp}</div>
        <p>${footer}</p>
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

async function findCustomerByEmail(email) {
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
        session_version
      FROM customer_accounts
      WHERE LOWER(email) = LOWER($1)
      LIMIT 1
    `,
    [email]
  );

  return result.rows[0] || null;
}

function getPendingPasswordUpdate(req) {
  const pending = req.session?.pendingPasswordUpdate || null;
  if (!pending) return null;

  if (pending.expiresAt && Date.now() > Number(pending.expiresAt)) {
    return null;
  }

  return pending;
}

function clearPendingPasswordUpdate(req) {
  if (!req.session) return;
  delete req.session.pendingPasswordUpdate;
}

function getPendingPasswordReset(req) {
  const pending = req.session?.pendingPasswordReset || null;
  if (!pending) return null;

  if (pending.expiresAt && Date.now() > Number(pending.expiresAt)) {
    return null;
  }

  return pending;
}

function clearPendingPasswordReset(req) {
  if (!req.session) return;
  delete req.session.pendingPasswordReset;
}

async function updateCustomerPassword(userId, newPasswordHash) {
  const result = await pool.query(
    `
      UPDATE customer_accounts
      SET password_hash = $2,
          session_version = COALESCE(session_version, 0) + 1,
          updated_at = NOW()
      WHERE id = $1
        AND password_hash IS NOT NULL
        AND password_hash <> ''
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
    [userId, newPasswordHash]
  );

  return result.rows[0] || null;
}

async function hashPassword(password) {
  return bcrypt.hash(String(password), PASSWORD_SALT_ROUNDS);
}

async function comparePassword(password, passwordHash) {
  if (!passwordHash) return false;
  return bcrypt.compare(String(password), String(passwordHash));
}

function syncSessionPasswordVersion(req, sessionVersion) {
  if (!req.session) return;

  if (req.session.user) {
    req.session.user.sessionVersion = sessionVersion;
  }

  req.session.sessionVersion = sessionVersion;
}

async function renderUpdatePassword(res, req, options = {}) {
  return res.render("customer/u/security/updatePassword", {
    title: "Update Password",
    error: options.error || null,
    success: options.success || null,
    old: options.old || {},
    token: options.token || null,
    csrfToken: getCsrfToken(req),
    user: req.session?.user || res.locals.user || null,
  });
}

async function renderForgotPassword(res, req, options = {}) {
  return res.render("customer/u/security/forgotPassword", {
    title: "Forgot Password",
    error: options.error || null,
    success: options.success || null,
    old: options.old || {},
    token: options.token || null,
    otpEmail: options.otpEmail || null,
    otpStep: !!options.otpStep,
    resetStep: !!options.resetStep,
    csrfToken: getCsrfToken(req),
    user: req.session?.user || res.locals.user || null,
  });
}

function respondWithPasswordSuccess(req, res, payload = {}) {
  const body = {
    ok: true,
    message: payload.message || "Password updated successfully.",
    redirectUrl: payload.redirectUrl || "/customer/u/profile",
  };

  if (wantsJson(req)) {
    return res.status(200).json(body);
  }

  setFlash(req, "success", body.message);
  return res.redirect(body.redirectUrl);
}

function respondWithForgotPasswordOtpStep(req, res, payload = {}) {
  const body = {
    ok: true,
    otpStep: true,
    otpEmail: payload.otpEmail || null,
    message: payload.message || "OTP has been sent to your email address.",
  };

  if (wantsJson(req)) {
    return res.status(200).json(body);
  }

  return renderForgotPassword(res, req, {
    success: body.message,
    otpStep: true,
    resetStep: false,
    otpEmail: body.otpEmail,
    old: { email: body.otpEmail || "" },
  });
}

exports.getUpdatePasswordPage = async (req, res, next) => {
  try {
    const currentUser = getSessionCustomer(req);
    if (!currentUser) {
      return res.redirect("/customer/sign/in");
    }

    const freshUser = await findCustomerById(currentUser.id);
    if (!freshUser) {
      return res.redirect("/customer/sign/in");
    }

    return renderUpdatePassword(res, req, {
      old: {},
      success: req.session?.success || null,
    });
  } catch (err) {
    return next(err);
  }
};

exports.postUpdatePassword = async (req, res, next) => {
  try {
    const currentUser = getSessionCustomer(req);
    if (!currentUser) {
      return res.redirect("/customer/sign/in");
    }

    const freshUser = await findCustomerById(currentUser.id);
    if (!freshUser) {
      return res.redirect("/customer/sign/in");
    }

    if (!freshUser.password_hash) {
      return renderUpdatePassword(res, req, {
        error: "Password update is not available for this account.",
        old: {},
      });
    }

    const currentPassword = String(
      req.body?.currentPassword ||
        req.body?.old_password ||
        req.body?.current_password ||
        ""
    ).trim();

    const newPassword = String(
      req.body?.newPassword ||
        req.body?.new_password ||
        req.body?.password ||
        ""
    ).trim();

    if (!currentPassword) {
      return renderUpdatePassword(res, req, {
        error: "Please enter your current password.",
        old: {},
      });
    }

    if (!newPassword) {
      return renderUpdatePassword(res, req, {
        error: "Please enter your new password.",
        old: {},
      });
    }

    if (!isValidPassword(newPassword)) {
      return renderUpdatePassword(res, req, {
        error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters long.`,
        old: {},
      });
    }

    const matches = await comparePassword(currentPassword, freshUser.password_hash);
    if (!matches) {
      return renderUpdatePassword(res, req, {
        error: "Previous password is incorrect.",
        old: {},
      });
    }

    if (currentPassword === newPassword) {
      return renderUpdatePassword(res, req, {
        error: "New password must be different from the previous password.",
        old: {},
      });
    }

    const hashedPassword = await hashPassword(newPassword);
    const updatedUser = await updateCustomerPassword(freshUser.id, hashedPassword);

    if (!updatedUser) {
      return renderUpdatePassword(res, req, {
        error: "Unable to update password right now.",
        old: {},
      });
    }

    syncSessionPasswordVersion(req, updatedUser.session_version);
    setFlash(req, "success", "Password updated successfully.");

    return respondWithPasswordSuccess(req, res, {
      message: "Password updated successfully.",
      redirectUrl: "/customer/u/profile",
    });
  } catch (err) {
    return next(err);
  }
};

exports.getForgotPasswordPage = async (req, res, next) => {
  try {
    const pending = getPendingPasswordReset(req);

    return renderForgotPassword(res, req, {
      old: { email: pending?.email || "" },
      otpStep: !!pending,
      resetStep: !!pending?.verified,
      otpEmail: pending?.email || null,
      success: req.session?.success || null,
    });
  } catch (err) {
    return next(err);
  }
};

exports.postForgotPassword = async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body?.email || req.body?.new_email);

    if (!email || !isValidEmail(email)) {
      return renderForgotPassword(res, req, {
        error: "Please enter a valid email address.",
        old: { email },
        otpStep: false,
        resetStep: false,
      });
    }

    const account = await findCustomerByEmail(email);

    if (!account) {
      return renderForgotPassword(res, req, {
        error: "This email address is not registered.",
        old: { email },
        otpStep: false,
        resetStep: false,
      });
    }

    if (!account.password_hash) {
      return renderForgotPassword(res, req, {
        error: "Password reset is not available for this account.",
        old: { email },
        otpStep: false,
        resetStep: false,
      });
    }

    if (!req.session) {
      return renderForgotPassword(res, req, {
        error: "Session is not available.",
        old: { email },
        otpStep: false,
        resetStep: false,
      });
    }

    const otp = generateOtp();

    req.session.pendingPasswordReset = {
      userId: account.id,
      email: account.email,
      otp,
      otpAttempts: 0,
      verified: false,
      expiresAt: Date.now() + OTP_EXPIRES_MINUTES * 60 * 1000,
      createdAt: Date.now(),
    };

    const mail = buildOtpEmail(account.full_name, otp, {
      subject: "Password reset OTP",
      heading: "Reset your password",
      intro: "Your OTP is:",
      footer: `This OTP expires in ${OTP_EXPIRES_MINUTES} minutes.`,
    });

    try {
      await sendMail({
        to: account.email,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
      });
    } catch (mailErr) {
      console.error("Forgot password OTP failed:", mailErr);
      clearPendingPasswordReset(req);

      return renderForgotPassword(res, req, {
        error: "Unable to send OTP. Please try again.",
        old: { email },
        otpStep: false,
        resetStep: false,
      });
    }

    await saveSession(req);

    return respondWithForgotPasswordOtpStep(req, res, {
      otpEmail: account.email,
      message: "OTP has been sent. Please verify the code.",
    });
  } catch (err) {
    return next(err);
  }
};

exports.getVerifyForgotPasswordOtpPage = async (req, res, next) => {
  try {
    const pending = getPendingPasswordReset(req);

    if (!pending) {
      return res.redirect("/customer/u/security/forgotPassword");
    }

    return renderForgotPassword(res, req, {
      old: { email: pending.email },
      otpEmail: pending.email,
      otpStep: true,
      resetStep: false,
    });
  } catch (err) {
    return next(err);
  }
};

exports.postVerifyForgotPasswordOtp = async (req, res, next) => {
  try {
    const pending = getPendingPasswordReset(req);

    if (!pending) {
      return wantsJson(req)
        ? res.status(400).json({ ok: false, message: "OTP session expired." })
        : res.redirect("/customer/u/security/forgotPassword");
    }

    const enteredOtp = String(req.body?.otp || req.body?.code || "").trim();

    if (!enteredOtp) {
      return renderForgotPassword(res, req, {
        error: "Please enter the OTP.",
        old: { email: pending.email },
        otpEmail: pending.email,
        otpStep: true,
        resetStep: false,
      });
    }

    if (Date.now() > Number(pending.expiresAt)) {
      clearPendingPasswordReset(req);

      return renderForgotPassword(res, req, {
        error: "OTP expired. Please request a new one.",
        old: { email: pending.email },
        otpEmail: pending.email,
        otpStep: false,
        resetStep: false,
      });
    }

    const attempts = Number(pending.otpAttempts || 0) + 1;
    pending.otpAttempts = attempts;
    req.session.pendingPasswordReset = pending;

    if (attempts > OTP_MAX_ATTEMPTS) {
      clearPendingPasswordReset(req);

      return renderForgotPassword(res, req, {
        error: "Too many OTP attempts. Please request a new one.",
        old: { email: pending.email },
        otpEmail: pending.email,
        otpStep: false,
        resetStep: false,
      });
    }

    if (enteredOtp !== String(pending.otp)) {
      return renderForgotPassword(res, req, {
        error: "Invalid OTP.",
        old: { email: pending.email },
        otpEmail: pending.email,
        otpStep: true,
        resetStep: false,
      });
    }

    const account = await findCustomerById(pending.userId);
    if (!account) {
      clearPendingPasswordReset(req);
      return res.redirect("/customer/sign/in");
    }

    pending.verified = true;
    pending.verifiedAt = Date.now();
    req.session.pendingPasswordReset = pending;

    await saveSession(req);

    return renderForgotPassword(res, req, {
      success: "OTP verified. Set your new password.",
      old: { email: pending.email },
      otpEmail: pending.email,
      otpStep: true,
      resetStep: true,
    });
  } catch (err) {
    return next(err);
  }
};

exports.getResetForgotPasswordPage = async (req, res, next) => {
  try {
    const pending = getPendingPasswordReset(req);

    if (!pending || !pending.verified) {
      return res.redirect("/customer/u/security/forgotPassword");
    }

    return renderForgotPassword(res, req, {
      old: { email: pending.email },
      otpEmail: pending.email,
      otpStep: true,
      resetStep: true,
    });
  } catch (err) {
    return next(err);
  }
};

exports.postResetForgotPassword = async (req, res, next) => {
  try {
    const pending = getPendingPasswordReset(req);

    if (!pending || !pending.verified) {
      return wantsJson(req)
        ? res.status(400).json({ ok: false, message: "Reset session expired." })
        : res.redirect("/customer/u/security/forgotPassword");
    }

    const newPassword = String(
      req.body?.newPassword ||
        req.body?.new_password ||
        req.body?.password ||
        ""
    ).trim();

    const confirmPassword = String(
      req.body?.confirmPassword ||
        req.body?.confirm_password ||
        req.body?.password_confirmation ||
        ""
    ).trim();

    if (!newPassword) {
      return renderForgotPassword(res, req, {
        error: "Please enter your new password.",
        old: { email: pending.email },
        otpEmail: pending.email,
        otpStep: true,
        resetStep: true,
      });
    }

    if (!isValidPassword(newPassword)) {
      return renderForgotPassword(res, req, {
        error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters long.`,
        old: { email: pending.email },
        otpEmail: pending.email,
        otpStep: true,
        resetStep: true,
      });
    }

    if (confirmPassword && newPassword !== confirmPassword) {
      return renderForgotPassword(res, req, {
        error: "Passwords do not match.",
        old: { email: pending.email },
        otpEmail: pending.email,
        otpStep: true,
        resetStep: true,
      });
    }

    const account = await findCustomerById(pending.userId);
    if (!account || !account.password_hash) {
      clearPendingPasswordReset(req);
      return res.redirect("/customer/sign/in");
    }

    const hashedPassword = await hashPassword(newPassword);
    const updatedUser = await updateCustomerPassword(account.id, hashedPassword);

    if (!updatedUser) {
      return renderForgotPassword(res, req, {
        error: "Unable to reset password right now.",
        old: { email: pending.email },
        otpEmail: pending.email,
        otpStep: true,
        resetStep: true,
      });
    }

    clearPendingPasswordReset(req);
    setFlash(req, "success", "Password reset successfully. Please sign in.");

    return respondWithPasswordSuccess(req, res, {
      message: "Password reset successfully. Please sign in.",
      redirectUrl: "/customer/sign/in",
    });
  } catch (err) {
    return next(err);
  }
};

exports.postResendForgotPasswordOtp = async (req, res, next) => {
  try {
    const pending = getPendingPasswordReset(req);

    if (!pending) {
      return wantsJson(req)
        ? res.status(400).json({ ok: false, message: "OTP session expired." })
        : res.redirect("/customer/u/security/forgotPassword");
    }

    const account = await findCustomerById(pending.userId);
    if (!account) {
      clearPendingPasswordReset(req);
      return res.redirect("/customer/sign/in");
    }

    const otp = generateOtp();
    pending.otp = otp;
    pending.otpAttempts = 0;
    pending.verified = false;
    pending.expiresAt = Date.now() + OTP_EXPIRES_MINUTES * 60 * 1000;
    req.session.pendingPasswordReset = pending;

    const mail = buildOtpEmail(account.full_name || pending.email, otp, {
      subject: "Password reset OTP",
      heading: "Reset your password",
      intro: "Your OTP is:",
      footer: `This OTP expires in ${OTP_EXPIRES_MINUTES} minutes.`,
    });

    try {
      await sendMail({
        to: pending.email,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
      });
    } catch (mailErr) {
      console.error("Resend forgot password OTP failed:", mailErr);
      return renderForgotPassword(res, req, {
        error: "Unable to resend OTP. Please try again.",
        old: { email: pending.email },
        otpEmail: pending.email,
        otpStep: true,
        resetStep: false,
      });
    }

    await saveSession(req);

    if (wantsJson(req)) {
      return res.status(200).json({
        ok: true,
        otpStep: true,
        otpEmail: pending.email,
        message: "A new OTP has been sent.",
      });
    }

    return renderForgotPassword(res, req, {
      success: "A new OTP has been sent.",
      old: { email: pending.email },
      otpEmail: pending.email,
      otpStep: true,
      resetStep: false,
    });
  } catch (err) {
    return next(err);
  }
};

exports.findCustomerById = findCustomerById;
exports.findCustomerByEmail = findCustomerByEmail;
exports.getCsrfToken = getCsrfToken;
exports.buildOtpEmail = buildOtpEmail;