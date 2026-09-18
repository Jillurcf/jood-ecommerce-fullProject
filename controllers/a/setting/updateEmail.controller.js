'use strict';

require('dotenv').config();

const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { pool } = require('../../../includes/conn');

const OTP_EXPIRES_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;

const APP_URL_RAW = String(process.env.APP_URL || process.env.APP_BASE_URL || '').trim().replace(/\/+$/, '');
const FROM_EMAIL = process.env.FROM_EMAIL || process.env.SMTP_USER || 'no-reply@example.com';

const ADMIN_LOGIN_URL = '/admin/a/sign/in';
const ADMIN_PROFILE_URL = '/admin/a/profile';
const UPDATE_EMAIL_VIEW = 'admin/a/setting/updateEmail';
const UPDATE_EMAIL_PATH = '/admin/a/setting/updateEmail';

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function sanitizeText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email || ''));
}

function generateOtp() {
  return String(crypto.randomInt(100000, 1000000));
}

function getCsrfToken(req) {
  if (typeof req?.csrfToken !== 'function') return null;
  try {
    return req.csrfToken();
  } catch {
    return null;
  }
}

function wantsJson(req) {
  const accept = String(req.headers?.accept || '').toLowerCase();
  return (
    req.xhr ||
    accept.includes('application/json') ||
    String(req.headers?.['content-type'] || '').includes('application/json')
  );
}

function saveSession(req) {
  return new Promise((resolve, reject) => {
    if (!req.session || typeof req.session.save !== 'function') {
      return resolve();
    }

    req.session.save((err) => {
      if (err) return reject(err);
      return resolve();
    });
  });
}

function setFlash(req, type, message) {
  if (!req.session) return;
  req.session[type] = message;
}

function getBaseUrl(req) {
  if (APP_URL_RAW) return APP_URL_RAW;
  const proto = req?.headers?.['x-forwarded-proto'] || req?.protocol || 'http';
  const host = req?.get?.('host');
  return `${proto}://${host}`.replace(/\/+$/, '');
}

function buildUrl(req, routePath) {
  const base = getBaseUrl(req);
  const safePath = String(routePath || '').startsWith('/') ? routePath : `/${routePath}`;
  return `${base}${safePath}`;
}

function createMailer() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_PORT || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    throw new Error('SMTP is not configured.');
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
  const transporter = createMailer();
  await transporter.sendMail({
    from: FROM_EMAIL,
    to,
    subject,
    html,
    text,
  });
}

function buildOtpEmail(fullName, otp) {
  const safeName = sanitizeText(fullName) || 'Admin';

  return {
    subject: 'Your admin email verification OTP',
    text: `Hello ${safeName},\n\nYour OTP is: ${otp}\n\nThis OTP expires in ${OTP_EXPIRES_MINUTES} minutes.`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#222">
        <h2>Verify your admin email</h2>
        <p>Hello ${safeName},</p>
        <p>Your OTP is:</p>
        <div style="font-size:28px;font-weight:700;letter-spacing:6px">${otp}</div>
        <p>This OTP expires in ${OTP_EXPIRES_MINUTES} minutes.</p>
      </div>
    `,
  };
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
      role: req.session.adminRole || req.session.role || 'admin',
      status: req.session.adminStatus || 'active',
      loginAt: req.session.loginAt || null,
      sessionVersion: req.session.sessionVersion || 1,
    };
  }

  if (req.user?.id) {
    return {
      id: req.user.id,
      admin_id: req.user.admin_id || null,
      full_name: req.user.full_name || req.user.name || null,
      email: req.user.email || null,
      phone: req.user.phone || null,
      role: req.user.role || req.user.type || 'admin',
      status: req.user.status || 'active',
      loginAt: req.user.loginAt || null,
      sessionVersion: req.user.sessionVersion || 1,
    };
  }

  return null;
}

function isAdminUser(req) {
  const admin = getSessionAdmin(req);
  if (!admin?.id) return false;

  const role = String(
    admin.role ||
      req.session?.adminRole ||
      req.session?.role ||
      req.user?.role ||
      req.user?.type ||
      ''
  ).toLowerCase();

  return Boolean(
    req.session?.isAdmin === true ||
      req.user?.isAdmin === true ||
      role === 'admin' ||
      role === 'superadmin' ||
      role === 'super_admin' ||
      role === 'master_admin' ||
      role === 'staff' ||
      role === 'sub_admin'
  );
}

function requireAdmin(req) {
  if (isAdminUser(req)) return { error: false };
  return {
    error: true,
    statusCode: 401,
    error_code: 'UNAUTHORIZED',
    message: 'Admin access required.',
    redirectUrl: ADMIN_LOGIN_URL,
  };
}

function normalizeAdminSession(req, adminRow) {
  if (!req.session) return;

  const admin = {
    id: adminRow.id,
    admin_id: adminRow.admin_id || null,
    full_name: adminRow.full_name || null,
    email: adminRow.email || null,
    phone: adminRow.phone || null,
    role: adminRow.role || 'admin',
    status: adminRow.status || 'active',
    loginAt: req.session.admin?.loginAt || req.session.loginAt || null,
    sessionVersion: adminRow.session_version || req.session.sessionVersion || 1,
  };

  req.session.admin = admin;
  req.session.adminId = admin.id;
  req.session.adminAdminId = admin.admin_id;
  req.session.adminName = admin.full_name;
  req.session.adminEmail = admin.email;
  req.session.adminPhone = admin.phone;
  req.session.adminRole = admin.role;
  req.session.adminStatus = admin.status;
  req.session.isAdmin = true;
  req.session.user = admin;
}

function getPendingEmailUpdate(req) {
  const pending = req.session?.pendingAdminEmailUpdate || null;
  if (!pending) return null;

  if (pending.expiresAt && Date.now() > Number(pending.expiresAt)) {
    return null;
  }

  return pending;
}

function clearPendingEmailUpdate(req) {
  if (!req.session) return;
  delete req.session.pendingAdminEmailUpdate;
}

async function findAdminById(id) {
  const result = await pool.query(
    `
      SELECT
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
        session_version
      FROM admin_accounts
      WHERE id = $1
      LIMIT 1
    `,
    [id]
  );

  return result.rows[0] || null;
}

async function findAnyAccountByEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;

  const admin = await pool.query(
    `
      SELECT id, 'admin_accounts'::text AS source
      FROM admin_accounts
      WHERE LOWER(email) = LOWER($1)
      LIMIT 1
    `,
    [normalized]
  );

  return admin.rows[0] || null;
}

async function updateAdminEmail(adminId, newEmail) {
  const result = await pool.query(
    `
      UPDATE admin_accounts
      SET email = $2,
          email_verified = TRUE,
          updated_at = NOW()
      WHERE id = $1
      RETURNING
        id,
        admin_id,
        full_name,
        email,
        phone,
        role,
        status,
        email_verified,
        session_version
    `,
    [adminId, newEmail]
  );

  return result.rows[0] || null;
}

function syncSessionEmail(req, email) {
  if (!req.session) return;

  if (req.session.admin) {
    req.session.admin.email = email;
  }

  if (req.session.user) {
    req.session.user.email = email;
  }

  req.session.adminEmail = email;
  req.session.userEmail = email;
}

function renderUpdateEmail(res, req, options = {}) {
  return res.render(UPDATE_EMAIL_VIEW, {
    title: 'Update Email',
    error: options.error || null,
    success: options.success || null,
    old: options.old || {},
    token: options.token || null,
    otpEmail: options.otpEmail || null,
    otpStep: !!options.otpStep,
    csrfToken: getCsrfToken(req),
    admin: getSessionAdmin(req) || req.session?.admin || res.locals?.admin || null,
    user: getSessionAdmin(req) || req.session?.admin || res.locals?.admin || null,
  });
}

function renderOtpPage(res, req, options = {}) {
  return res.render(UPDATE_EMAIL_VIEW, {
    title: 'Update Email',
    error: options.error || null,
    success: options.success || null,
    old: options.old || {},
    token: options.token || null,
    otpEmail: options.otpEmail || null,
    otpStep: true,
    csrfToken: getCsrfToken(req),
    admin: getSessionAdmin(req) || req.session?.admin || res.locals?.admin || null,
    user: getSessionAdmin(req) || req.session?.admin || res.locals?.admin || null,
  });
}

function respondWithOtpStep(req, res, payload = {}) {
  const body = {
    ok: true,
    otpStep: true,
    otpEmail: payload.otpEmail || null,
    message: payload.message || 'OTP has been sent to the new email address.',
  };

  if (wantsJson(req)) {
    return res.status(200).json(body);
  }

  return renderUpdateEmail(res, req, {
    success: body.message,
    otpStep: true,
    otpEmail: body.otpEmail,
    old: { email: body.otpEmail || '' },
  });
}

function respondWithSuccess(req, res, payload = {}) {
  const body = {
    ok: true,
    message: payload.message || 'Email updated successfully.',
    redirectUrl: payload.redirectUrl || ADMIN_PROFILE_URL,
  };

  if (wantsJson(req)) {
    return res.status(200).json(body);
  }

  setFlash(req, 'success', body.message);
  return res.redirect(body.redirectUrl);
}

function denyAdmin(req, res, access) {
  if (wantsJson(req)) {
    return res.status(access.statusCode || 401).json({
      ok: false,
      success: false,
      error: access.error_code || 'UNAUTHORIZED',
      message: access.message || 'Admin access required.',
    });
  }

  return res.redirect(access.redirectUrl || ADMIN_LOGIN_URL);
}

exports.getUpdateEmailPage = async (req, res, next) => {
  try {
    const access = requireAdmin(req);
    if (access.error) return denyAdmin(req, res, access);

    const currentAdmin = getSessionAdmin(req);
    if (!currentAdmin?.id) return res.redirect(ADMIN_LOGIN_URL);

    const freshAdmin = await findAdminById(currentAdmin.id);
    if (!freshAdmin) {
      clearPendingEmailUpdate(req);
      return res.redirect(ADMIN_LOGIN_URL);
    }

    const pending = getPendingEmailUpdate(req);

    return renderUpdateEmail(res, req, {
      old: { email: freshAdmin.email || '' },
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
    const access = requireAdmin(req);
    if (access.error) return denyAdmin(req, res, access);

    const currentAdmin = getSessionAdmin(req);
    if (!currentAdmin?.id) return res.redirect(ADMIN_LOGIN_URL);

    const freshAdmin = await findAdminById(currentAdmin.id);
    if (!freshAdmin) {
      clearPendingEmailUpdate(req);
      return res.redirect(ADMIN_LOGIN_URL);
    }

    const newEmail = normalizeEmail(req.body?.email || req.body?.new_email);

    if (!newEmail || !isValidEmail(newEmail)) {
      return renderUpdateEmail(res, req, {
        error: 'Please enter a valid email address.',
        old: { email: newEmail },
        otpStep: false,
      });
    }

    if (normalizeEmail(freshAdmin.email) === newEmail) {
      return renderUpdateEmail(res, req, {
        error: 'This email is already your current email address.',
        old: { email: newEmail },
        otpStep: false,
      });
    }

    const existing = await findAnyAccountByEmail(newEmail);
    if (existing) {
      return renderUpdateEmail(res, req, {
        error: 'This email address is already registered.',
        old: { email: newEmail },
        otpStep: false,
      });
    }

    if (!req.session) {
      return renderUpdateEmail(res, req, {
        error: 'Session is not available.',
        old: { email: newEmail },
        otpStep: false,
      });
    }

    const otp = generateOtp();

    req.session.pendingAdminEmailUpdate = {
      adminId: freshAdmin.id,
      currentEmail: freshAdmin.email,
      newEmail,
      otp,
      otpAttempts: 0,
      expiresAt: Date.now() + OTP_EXPIRES_MINUTES * 60 * 1000,
      createdAt: Date.now(),
    };

    const mail = buildOtpEmail(freshAdmin.full_name, otp);

    try {
      await sendMail({
        to: newEmail,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
      });
    } catch (mailErr) {
      console.error('Admin email update OTP failed:', mailErr);
      clearPendingEmailUpdate(req);
      return renderUpdateEmail(res, req, {
        error: 'Unable to send OTP. Please try again.',
        old: { email: newEmail },
        otpStep: false,
      });
    }

    await saveSession(req);

    return respondWithOtpStep(req, res, {
      otpEmail: newEmail,
      message: 'OTP has been sent. Please verify the code from the new email inbox.',
    });
  } catch (err) {
    return next(err);
  }
};

exports.getVerifyEmailOtpPage = async (req, res, next) => {
  try {
    const access = requireAdmin(req);
    if (access.error) return denyAdmin(req, res, access);

    const pending = getPendingEmailUpdate(req);
    if (!pending) {
      return res.redirect(UPDATE_EMAIL_PATH);
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
    const access = requireAdmin(req);
    if (access.error) return denyAdmin(req, res, access);

    const pending = getPendingEmailUpdate(req);

    if (!pending) {
      return wantsJson(req)
        ? res.status(400).json({ ok: false, message: 'OTP session expired.' })
        : res.redirect(UPDATE_EMAIL_PATH);
    }

    const enteredOtp = String(req.body?.otp || req.body?.code || '').trim();

    if (!enteredOtp) {
      return renderOtpPage(res, req, {
        error: 'Please enter the OTP.',
        old: { email: pending.newEmail },
        otpEmail: pending.newEmail,
      });
    }

    if (Date.now() > Number(pending.expiresAt)) {
      clearPendingEmailUpdate(req);
      return renderOtpPage(res, req, {
        error: 'OTP expired. Please request a new one.',
        otpEmail: pending.newEmail,
      });
    }

    const attempts = Number(pending.otpAttempts || 0) + 1;
    pending.otpAttempts = attempts;
    req.session.pendingAdminEmailUpdate = pending;

    if (attempts > OTP_MAX_ATTEMPTS) {
      clearPendingEmailUpdate(req);
      return renderOtpPage(res, req, {
        error: 'Too many OTP attempts. Please request a new one.',
        otpEmail: pending.newEmail,
      });
    }

    if (enteredOtp !== String(pending.otp)) {
      return renderOtpPage(res, req, {
        error: 'Invalid OTP.',
        old: { email: pending.newEmail },
        otpEmail: pending.newEmail,
      });
    }

    const currentAdmin = getSessionAdmin(req);
    if (!currentAdmin || Number(currentAdmin.id) !== Number(pending.adminId)) {
      clearPendingEmailUpdate(req);
      return res.redirect(ADMIN_LOGIN_URL);
    }

    const conflict = await findAnyAccountByEmail(pending.newEmail);
    if (conflict) {
      clearPendingEmailUpdate(req);
      return renderOtpPage(res, req, {
        error: 'This email address is already registered.',
        old: { email: pending.newEmail },
        otpEmail: pending.newEmail,
      });
    }

    const updatedAdmin = await updateAdminEmail(pending.adminId, pending.newEmail);
    if (!updatedAdmin) {
      clearPendingEmailUpdate(req);
      return renderOtpPage(res, req, {
        error: 'Unable to update email right now.',
        otpEmail: pending.newEmail,
      });
    }

    normalizeAdminSession(req, updatedAdmin);
    syncSessionEmail(req, pending.newEmail);
    clearPendingEmailUpdate(req);
    setFlash(req, 'success', 'Email updated successfully.');

    return respondWithSuccess(req, res, {
      message: 'Email updated successfully.',
      redirectUrl: ADMIN_PROFILE_URL,
    });
  } catch (err) {
    return next(err);
  }
};

exports.postResendEmailOtp = async (req, res, next) => {
  try {
    const access = requireAdmin(req);
    if (access.error) return denyAdmin(req, res, access);

    const pending = getPendingEmailUpdate(req);

    if (!pending) {
      return wantsJson(req)
        ? res.status(400).json({ ok: false, message: 'OTP session expired.' })
        : res.redirect(UPDATE_EMAIL_PATH);
    }

    const currentAdmin = getSessionAdmin(req);
    if (!currentAdmin || Number(currentAdmin.id) !== Number(pending.adminId)) {
      clearPendingEmailUpdate(req);
      return res.redirect(ADMIN_LOGIN_URL);
    }

    const otp = generateOtp();
    pending.otp = otp;
    pending.otpAttempts = 0;
    pending.expiresAt = Date.now() + OTP_EXPIRES_MINUTES * 60 * 1000;
    req.session.pendingAdminEmailUpdate = pending;

    const mail = buildOtpEmail(currentAdmin.full_name || pending.currentEmail, otp);

    try {
      await sendMail({
        to: pending.newEmail,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
      });
    } catch (mailErr) {
      console.error('Resend admin email OTP failed:', mailErr);
      return renderOtpPage(res, req, {
        error: 'Unable to resend OTP. Please try again.',
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
        message: 'A new OTP has been sent.',
      });
    }

    return renderOtpPage(res, req, {
      success: 'A new OTP has been sent.',
      old: { email: pending.newEmail },
      otpEmail: pending.newEmail,
    });
  } catch (err) {
    return next(err);
  }
};

exports.findAdminById = findAdminById;
exports.getCsrfToken = getCsrfToken;
exports.buildOtpEmail = buildOtpEmail;
exports.getSessionAdmin = getSessionAdmin;
exports.requireAdmin = requireAdmin;
exports.buildUrl = buildUrl;
exports.getBaseUrl = getBaseUrl;
exports.normalizeAdminSession = normalizeAdminSession;
exports.clearPendingEmailUpdate = clearPendingEmailUpdate;
exports.getPendingEmailUpdate = getPendingEmailUpdate;
