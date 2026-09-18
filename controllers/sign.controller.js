"use strict";

require("dotenv").config();

const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const { pool } = require("../includes/conn");

const SALT_ROUNDS = 12;
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const EMAIL_VERIFY_HOURS = 24;
const RESET_PASSWORD_MINUTES = 30;
const OTP_EXPIRES_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;
const SESSION_MAX_AGE = 30 * 24 * 60 * 60 * 1000;

const VIEW_SIGN_IN = "customer/sign/in";
const VIEW_SIGN_UP = "customer/sign/up";
const VIEW_VERIFY_OTP = "customer/verify-otp";
const VIEW_FORGOT_PASSWORD = "customer/sign/forgot-password";
const VIEW_RESET_PASSWORD = "customer/sign/reset-password";

const APP_URL_RAW = String(process.env.APP_URL || "").trim().replace(/\/$/, "");
const FROM_EMAIL =
  process.env.FROM_EMAIL || process.env.SMTP_USER || "no-reply@example.com";

const CUSTOMER_SELECT_FIELDS = `
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
  session_version,
  email_verification_token,
  email_verification_expires,
  reset_password_token,
  reset_password_expires
`;

const CUSTOMER_PUBLIC_FIELDS = `
  id,
  user_id,
  full_name,
  email,
  phone,
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
`;

const schemaColumnCache = new Map();

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
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
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

function generateUserId(fullName) {
  const baseName =
    sanitizeText(fullName)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 12) || "user";

  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const random = crypto.randomBytes(4).toString("hex");
  return `${baseName}_${date}_${random}`;
}

function generateSecureToken() {
  return crypto.randomBytes(32).toString("hex");
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

function generateOtp() {
  return String(crypto.randomInt(100000, 1000000));
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

function getGuestContext(req) {
  const guestId = sanitizeText(
    req.headers?.["x-guest-id"] ||
      req.body?.guest_id ||
      req.query?.guest_id ||
      req.guestId ||
      req.session?.guestId ||
      req.session?.guest_id ||
      req.cookies?.guest_id ||
      ""
  );

  const guestToken = sanitizeText(
    req.headers?.["x-guest-token"] ||
      req.body?.guest_token ||
      req.query?.guest_token ||
      req.guestToken ||
      req.session?.guestToken ||
      req.session?.guest_token ||
      req.cookies?.guest_token ||
      ""
  );

  return {
    guestId: guestId || null,
    guestToken: guestToken || null,
  };
}

function renderAuthView(res, req, view, title, options = {}) {
  return res.render(view, {
    title,
    error: options.error || null,
    success: options.success || null,
    old: options.old || {},
    token: options.token || null,
    otpEmail: options.otpEmail || null,
    csrfToken: getCsrfToken(req),
  });
}

function renderSignIn(res, req, options = {}) {
  return renderAuthView(res, req, VIEW_SIGN_IN, "Sign In", options);
}

function renderSignUp(res, req, options = {}) {
  return renderAuthView(res, req, VIEW_SIGN_UP, "Sign Up", options);
}

function renderOtpPage(res, req, options = {}) {
  return renderAuthView(res, req, VIEW_VERIFY_OTP, "Verify OTP", options);
}

function renderForgotPassword(res, req, options = {}) {
  return renderAuthView(res, req, VIEW_FORGOT_PASSWORD, "Forgot Password", options);
}

function renderResetPassword(res, req, options = {}) {
  return renderAuthView(res, req, VIEW_RESET_PASSWORD, "Reset Password", options);
}

function setFlash(req, type, message) {
  if (!req.session) return;
  req.session[type] = message;
}

function minutesUntilUnlock(lockUntil) {
  if (!lockUntil) return 0;
  const lock = new Date(lockUntil);
  if (Number.isNaN(lock.getTime())) return 0;
  const diffMs = lock.getTime() - Date.now();
  return diffMs > 0 ? Math.ceil(diffMs / 60000) : 0;
}

function isLockedOut(user) {
  return minutesUntilUnlock(user?.lock_until) > 0;
}

function lockoutMessage(user) {
  const remaining = minutesUntilUnlock(user?.lock_until);
  if (remaining <= 0) return "Too many failed attempts. Please try again later.";
  return `Too many failed attempts. Please try again in ${remaining} minute${
    remaining > 1 ? "s" : ""
  }.`;
}

function getPendingSignup(req) {
  const pending = req.session?.pendingSignup || null;
  if (!pending) return null;

  if (pending.expiresAt && Date.now() > Number(pending.expiresAt)) {
    return null;
  }

  return pending;
}

function clearPendingSignup(req) {
  if (!req.session) return;
  delete req.session.pendingSignup;
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

function buildVerificationEmail(req, fullName, token) {
  const link = buildUrl(req, `/customer/verify-email?token=${encodeURIComponent(token)}`);
  const safeName = sanitizeText(fullName) || "User";

  return {
    subject: "Verify your email address",
    text: `Hello ${safeName},\n\nVerify your email here:\n${link}\n\nThis link expires in ${EMAIL_VERIFY_HOURS} hours.`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#222">
        <h2>Verify your email</h2>
        <p>Hello ${safeName},</p>
        <p>Please verify your email address to activate your account.</p>
        <p><a href="${link}" target="_blank" rel="noopener noreferrer">Verify Email</a></p>
        <p>This link expires in ${EMAIL_VERIFY_HOURS} hours.</p>
      </div>
    `,
  };
}

function buildResetPasswordEmail(req, fullName, token) {
  const link = buildUrl(req, `/customer/reset-password?token=${encodeURIComponent(token)}`);
  const safeName = sanitizeText(fullName) || "User";

  return {
    subject: "Reset your password",
    text: `Hello ${safeName},\n\nReset your password here:\n${link}\n\nThis link expires in ${RESET_PASSWORD_MINUTES} minutes.`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#222">
        <h2>Reset your password</h2>
        <p>Hello ${safeName},</p>
        <p>Use the link below to reset your password.</p>
        <p><a href="${link}" target="_blank" rel="noopener noreferrer">Reset Password</a></p>
        <p>This link expires in ${RESET_PASSWORD_MINUTES} minutes.</p>
      </div>
    `,
  };
}

async function findCustomerByEmail(email) {
  const result = await pool.query(
    `
      SELECT ${CUSTOMER_SELECT_FIELDS}
      FROM customer_accounts
      WHERE LOWER(email) = LOWER($1)
      LIMIT 1
    `,
    [email]
  );
  return result.rows[0] || null;
}

async function findCustomerByPhone(phone) {
  const result = await pool.query(
    `
      SELECT ${CUSTOMER_PUBLIC_FIELDS}
      FROM customer_accounts
      WHERE phone = $1
      LIMIT 1
    `,
    [phone]
  );
  return result.rows[0] || null;
}

async function findCustomerByGoogleId(googleId) {
  const result = await pool.query(
    `
      SELECT ${CUSTOMER_PUBLIC_FIELDS}
      FROM customer_accounts
      WHERE google_id = $1
      LIMIT 1
    `,
    [googleId]
  );
  return result.rows[0] || null;
}

async function findCustomerById(id) {
  const result = await pool.query(
    `
      SELECT ${CUSTOMER_PUBLIC_FIELDS}
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

async function emailAlreadyExists(email) {
  return Boolean(await findAnyAccountByEmail(email));
}

async function incrementLoginAttempts(userId) {
  const result = await pool.query(
    `
      UPDATE customer_accounts
      SET login_attempts = COALESCE(login_attempts, 0) + 1,
          last_attempt_time = NOW(),
          lock_until = CASE
            WHEN COALESCE(login_attempts, 0) + 1 >= $2
              THEN NOW() + ($3 * INTERVAL '1 minute')
            ELSE NULL
          END,
          updated_at = NOW()
      WHERE id = $1
      RETURNING login_attempts, last_attempt_time, lock_until
    `,
    [userId, MAX_LOGIN_ATTEMPTS, LOCK_MINUTES]
  );
  return result.rows[0] || null;
}

async function applySuccessfulLoginState(userId, provider) {
  const result = await pool.query(
    `
      UPDATE customer_accounts
      SET login_attempts = 0,
          last_attempt_time = NULL,
          lock_until = NULL,
          is_online = TRUE,
          last_login_at = NOW(),
          last_activity_at = NOW(),
          provider = $2,
          status = CASE
            WHEN status = 'deleted' THEN status
            ELSE 'active'
          END,
          session_version = COALESCE(session_version, 1) + 1,
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `,
    [userId, provider]
  );
  return result.rows[0] || null;
}

async function markOffline(userId) {
  await pool.query(
    `
      UPDATE customer_accounts
      SET is_online = FALSE,
          last_logout_at = NOW(),
          last_activity_at = NOW(),
          updated_at = NOW()
      WHERE id = $1
    `,
    [userId]
  );
}

async function clearResetToken(userId) {
  await pool.query(
    `
      UPDATE customer_accounts
      SET reset_password_token = NULL,
          reset_password_expires = NULL,
          updated_at = NOW()
      WHERE id = $1
    `,
    [userId]
  );
}

async function activateVerifiedEmail(userId) {
  await pool.query(
    `
      UPDATE customer_accounts
      SET email_verified = TRUE,
          status = 'active',
          email_verification_token = NULL,
          email_verification_expires = NULL,
          updated_at = NOW()
      WHERE id = $1
    `,
    [userId]
  );
}

async function tableHasColumn(client, tableName, columnName) {
  const cacheKey = `${tableName}.${columnName}`;
  if (schemaColumnCache.has(cacheKey)) return schemaColumnCache.get(cacheKey);

  const result = await client.query(
    `
      SELECT 1
      FROM information_schema.columns
      WHERE table_name = $1
        AND column_name = $2
      LIMIT 1
    `,
    [tableName, columnName]
  );

  const exists = result.rows.length > 0;
  schemaColumnCache.set(cacheKey, exists);
  return exists;
}

async function ensureCustomerUserId(client, user) {
  if (user?.user_id) return user.user_id;

  const newUserId = generateUserId(user?.full_name || "customer");

  const result = await client.query(
    `
      UPDATE customer_accounts
      SET user_id = $2,
          updated_at = NOW()
      WHERE id = $1
        AND (user_id IS NULL OR user_id = '')
      RETURNING user_id
    `,
    [user.id, newUserId]
  );

  return result.rows[0]?.user_id || newUserId;
}

async function mergeGuestRowsToCustomer(client, tableName, userId, guestContext, matchMode = "both") {
  const guestId = sanitizeText(guestContext?.guestId || "");
  const guestToken = sanitizeText(guestContext?.guestToken || "");

  const hasUserId = await tableHasColumn(client, tableName, "user_id");
  if (!hasUserId) return 0;

  const hasGuestId = await tableHasColumn(client, tableName, "guest_id");
  const hasGuestToken = await tableHasColumn(client, tableName, "guest_token");

  const guestConditions = [];
  const params = [];
  let idx = 2;

  if ((matchMode === "guest_id" || matchMode === "both") && guestId && hasGuestId) {
    guestConditions.push(`guest_id = $${idx++}`);
    params.push(guestId);
  }

  if ((matchMode === "guest_token" || matchMode === "both") && guestToken && hasGuestToken) {
    guestConditions.push(`guest_token = $${idx++}`);
    params.push(guestToken);
  }

  if (!guestConditions.length) return 0;

  const setParts = ["user_id = $1"];
  if (await tableHasColumn(client, tableName, "updated_at")) {
    setParts.push("updated_at = NOW()");
  }

  const sql = `
    UPDATE ${tableName}
    SET ${setParts.join(", ")}
    WHERE COALESCE(user_id::text, '') = ''
      AND (${guestConditions.join(" OR ")})
  `;

  const result = await client.query(sql, [userId, ...params]);
  return Number(result.rowCount || 0);
}

async function normalizeCartRowsToEmail(client, email, aliases = []) {
  const cartEmail = normalizeEmail(email);
  if (!cartEmail) return 0;

  const hasUserId = await tableHasColumn(client, "cart", "user_id");
  if (!hasUserId) return 0;

  const values = aliases
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .filter((value) => value !== cartEmail);

  if (!values.length) return 0;

  const setParts = ["user_id = $1"];
  if (await tableHasColumn(client, "cart", "updated_at")) {
    setParts.push("updated_at = NOW()");
  }
  const statusFilter = await tableHasColumn(client, "cart", "status")
    ? "AND status = 'active'"
    : "";

  const result = await client.query(
    `
    UPDATE cart
    SET ${setParts.join(", ")}
    WHERE user_id::text = ANY($2::text[])
      ${statusFilter}
    `,
    [cartEmail, values]
  );

  return Number(result.rowCount || 0);
}

async function mergeGuestCartWishlistToCustomer(userId, guestContext) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const cartRows = await mergeGuestRowsToCustomer(client, "cart", userId, guestContext);
    const wishlistRows = await mergeGuestRowsToCustomer(
      client,
      "wishlist",
      userId,
      guestContext
    );
    await client.query("COMMIT");
    return { cartRows, wishlistRows };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

function loginCustomer(req, user, provider = "local", rememberMe = false, guestContext = null) {
  return new Promise((resolve, reject) => {
    if (!req.session) {
      return reject(new Error("Session is not available."));
    }

    req.session.regenerate((err) => {
      if (err) return reject(err);

      const sessionUser = {
        id: user.id,
        user_id: user.user_id || null,
        full_name: user.full_name || null,
        email: user.email || null,
        phone: user.phone || null,
        google_id: user.google_id || null,
        role: "customer",
        provider,
        loginAt: new Date().toISOString(),
        sessionVersion: user.session_version || 1,
      };

      req.session.user = sessionUser;
      req.session.userId = user.id;
      req.session.userUserId = user.user_id || null;
      req.session.userName = user.full_name || null;
      req.session.userEmail = user.email || null;
      req.session.userPhone = user.phone || null;
      req.session.userRole = "customer";
      req.session.isAuthenticated = true;
      req.session.authProvider = provider;
      req.session.loginAt = sessionUser.loginAt;
      req.session.sessionVersion = sessionUser.sessionVersion;

      if (guestContext?.guestToken) {
        req.session.guestToken = guestContext.guestToken;
      }
      if (guestContext?.guestId) {
        req.session.guestId = guestContext.guestId;
      }

      if (rememberMe) {
        req.session.cookie.maxAge = SESSION_MAX_AGE;
      } else {
        req.session.cookie.expires = false;
      }

      req.session.save((saveErr) => {
        if (saveErr) return reject(saveErr);
        resolve(sessionUser);
      });
    });
  });
}

async function finalizeLogin(req, user, provider = "local", rememberMe = false) {
  const guestContext = getGuestContext(req);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const freshUser = await applySuccessfulLoginState(user.id, provider);
    if (!freshUser) {
      throw new Error("Unable to finalize login.");
    }

    const customerUserId = await ensureCustomerUserId(client, freshUser);
    freshUser.user_id = customerUserId;
    const cartUserId = normalizeEmail(freshUser.email);

    await mergeGuestRowsToCustomer(client, "cart", cartUserId, guestContext, "guest_token");
    await normalizeCartRowsToEmail(client, cartUserId, [freshUser.id, customerUserId]);
    await mergeGuestRowsToCustomer(client, "wishlist", freshUser.id, guestContext, "guest_id");

    await client.query("COMMIT");

    await loginCustomer(req, freshUser, provider, rememberMe, guestContext);
    return freshUser;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

function normalizeGoogleProfile(profile = {}) {
  const googleId = String(profile.google_id || profile.sub || profile.id || "").trim();
  const email = normalizeEmail(
    profile.email || profile.emails?.[0]?.value || profile._json?.email || ""
  );
  const fullName = sanitizeText(
    profile.displayName ||
      [profile.name?.givenName, profile.name?.familyName].filter(Boolean).join(" ") ||
      profile.full_name ||
      profile._json?.name ||
      ""
  );
  const photo = profile.photos?.[0]?.value || profile.picture || profile._json?.picture || null;

  return { googleId, email, fullName, photo };
}

async function createGoogleCustomer(profile) {
  const google = normalizeGoogleProfile(profile);

  if (!google.googleId) {
    throw new Error("Google profile is missing an id.");
  }

  if (!google.email || !isValidEmail(google.email)) {
    throw new Error("Google profile is missing a valid email.");
  }

  const emailExists = await emailAlreadyExists(google.email);
  if (emailExists) {
    const err = new Error("You already have an account. Please sign in.");
    err.code = "ACCOUNT_EXISTS";
    throw err;
  }

  const userId = generateUserId(google.fullName || "customer");
  const result = await pool.query(
    `
      INSERT INTO customer_accounts
        (
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
          session_version,
          created_at,
          updated_at
        )
      VALUES
        (
          $1::text,
          $2::text,
          $3::text,
          NULL,
          NULL,
          $4::text,
          'google',
          'active',
          TRUE,
          FALSE,
          0,
          NULL,
          NULL,
          NULL,
          NULL,
          NULL,
          FALSE,
          1,
          NOW(),
          NOW()
        )
      RETURNING
        id,
        user_id,
        full_name,
        email,
        phone,
        google_id,
        provider,
        status,
        email_verified,
        phone_verified,
        login_attempts,
        last_attempt_time,
        lock_until,
        last_login_at,
        last_activity_at,
        is_online,
        session_version
    `,
    [userId, google.fullName || "Customer", google.email, google.googleId]
  );

  return result.rows[0];
}

async function insertCustomerAccount({ client = pool, userId, fullName, email, phone, passwordHash }) {
  return client.query(
    `
      INSERT INTO customer_accounts
        (
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
          session_version,
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
          NULL,
          'local',
          'active',
          TRUE,
          FALSE,
          0,
          NULL,
          NULL,
          NULL,
          NULL,
          NULL,
          FALSE,
          1,
          NOW(),
          NOW()
        )
      RETURNING
        id,
        user_id,
        full_name,
        email,
        phone,
        google_id,
        provider,
        status,
        email_verified,
        phone_verified,
        login_attempts,
        last_attempt_time,
        lock_until,
        last_login_at,
        last_activity_at,
        is_online,
        session_version
    `,
    [userId, fullName, email, phone || null, passwordHash]
  );
}

function accountExistsMessage() {
  return "You already have an account. Please sign in.";
}

exports.getSignInPage = (req, res) => {
  const currentUser = getSessionCustomer(req);
  if (currentUser) return res.redirect("/customer/u/profile");
  return renderSignIn(res, req);
};

exports.getSignUpPage = (req, res) => {
  const currentUser = getSessionCustomer(req);
  if (currentUser) return res.redirect("/customer/u/profile");
  return renderSignUp(res, req);
};

exports.postSignIn = async (req, res, next) => {
  try {
    const currentUser = getSessionCustomer(req);
    if (currentUser) {
      return res.redirect("/customer/u/profile");
    }

    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || "");
    const rememberMe =
      req.body?.remember_me === "1" ||
      req.body?.remember_me === "on" ||
      req.body?.rememberMe === "on";

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

    const user = await findCustomerByEmail(email);
    if (!user || !user.password_hash) {
      return renderSignIn(res, req, {
        error: "Invalid email or password.",
        old: { email },
      });
    }

    if (user.status === "deleted") {
      return renderSignIn(res, req, {
        error: "Your account has been removed.",
        old: { email },
      });
    }

    if (isLockedOut(user)) {
      return renderSignIn(res, req, {
        error: lockoutMessage(user),
        old: { email },
      });
    }

    const passwordOk = await bcrypt.compare(password, user.password_hash);
    if (!passwordOk) {
      const updated = await incrementLoginAttempts(user.id);
      return renderSignIn(res, req, {
        error: updated && updated.lock_until ? lockoutMessage(updated) : "Invalid email or password.",
        old: { email },
      });
    }

    if (!user.email_verified) {
      return renderSignIn(res, req, {
        error: "Please verify your email before signing in.",
        old: { email },
      });
    }

    if (user.status && user.status !== "active") {
      return renderSignIn(res, req, {
        error: "Your account is not active.",
        old: { email },
      });
    }

    await finalizeLogin(req, user, "local", rememberMe);
    setFlash(req, "success", "Signed in successfully.");
    return res.redirect("/customer/u/profile");
  } catch (err) {
    return next(err);
  }
};

exports.postSignUp = async (req, res, next) => {
  try {
    const currentUser = getSessionCustomer(req);
    if (currentUser) {
      return res.redirect("/customer/u/profile");
    }

    const fullName = sanitizeText(req.body?.full_name || req.body?.fullName);
    const email = normalizeEmail(req.body?.email);
    const phoneRaw = req.body?.phone || req.body?.phone_number || "";
    const phone = normalizePhone(phoneRaw);
    const password = String(req.body?.password || "");
    const confirmPassword = String(req.body?.confirm_password || req.body?.confirmPassword || "");
    const agreeTerms =
      req.body?.agree_terms === "1" ||
      req.body?.agree_terms === "on" ||
      req.body?.terms === "on";

    if (!isValidFullName(fullName)) {
      return renderSignUp(res, req, {
        error: "Please enter your full name.",
        old: { fullName, email, phone },
      });
    }

    if (!email || !isValidEmail(email)) {
      return renderSignUp(res, req, {
        error: "Please enter a valid email address.",
        old: { fullName, email, phone },
      });
    }

    if (phone && !isValidPhone(phone)) {
      return renderSignUp(res, req, {
        error: "Please enter a valid phone number.",
        old: { fullName, email, phone },
      });
    }

    if (!isStrongPassword(password)) {
      return renderSignUp(res, req, {
        error: "Password must be at least 8 characters long.",
        old: { fullName, email, phone },
      });
    }

    if (password !== confirmPassword) {
      return renderSignUp(res, req, {
        error: "Passwords do not match.",
        old: { fullName, email, phone },
      });
    }

    if (!agreeTerms) {
      return renderSignUp(res, req, {
        error: "Please accept the terms and conditions.",
        old: { fullName, email, phone },
      });
    }

    const existingAny = await findAnyAccountByEmail(email);
    if (existingAny) {
      return renderSignUp(res, req, {
        error: accountExistsMessage(),
        old: { fullName, email, phone },
      });
    }

    if (phone) {
      const existingPhone = await findCustomerByPhone(phone);
      if (existingPhone) {
        return renderSignUp(res, req, {
          error: "This phone number is already registered.",
          old: { fullName, email, phone },
        });
      }
    }

    if (!req.session) {
      return renderSignUp(res, req, {
        error: "Session is not available.",
        old: { fullName, email, phone },
      });
    }

    const otp = generateOtp();
    req.session.pendingSignup = {
      fullName,
      email,
      phone: phone || null,
      password,
      otp,
      otpAttempts: 0,
      expiresAt: Date.now() + OTP_EXPIRES_MINUTES * 60 * 1000,
      createdAt: Date.now(),
    };

    const mail = buildOtpEmail(fullName, otp);
    try {
      await sendMail({
        to: email,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
      });
    } catch (mailErr) {
      console.error("OTP email failed:", mailErr);
    }

    req.session.save((saveErr) => {
      if (saveErr) {
        clearPendingSignup(req);
        return next(saveErr);
      }

      return res.redirect(303, "/customer/verify-otp");
    });
  } catch (err) {
    return next(err);
  }
};

exports.getOtpPage = (req, res) => {
  const pending = getPendingSignup(req);
  if (!pending) {
    return res.redirect("/customer/sign/up");
  }

  return renderOtpPage(res, req, {
    old: { email: pending.email },
    otpEmail: pending.email,
  });
};

exports.postVerifyOtp = async (req, res, next) => {
  try {
    const pending = getPendingSignup(req);

    if (!pending) {
      return res.redirect("/customer/sign/up");
    }

    const enteredOtp = String(req.body?.otp || req.body?.code || "").trim();

    if (!enteredOtp) {
      return renderOtpPage(res, req, {
        error: "Please enter the OTP.",
        old: { email: pending.email },
        otpEmail: pending.email,
      });
    }

    if (Date.now() > Number(pending.expiresAt)) {
      clearPendingSignup(req);
      return renderOtpPage(res, req, {
        error: "OTP expired. Please sign up again.",
      });
    }

    const attempts = Number(pending.otpAttempts || 0) + 1;
    pending.otpAttempts = attempts;
    req.session.pendingSignup = pending;

    if (attempts > OTP_MAX_ATTEMPTS) {
      clearPendingSignup(req);
      return renderOtpPage(res, req, {
        error: "Too many OTP attempts. Please sign up again.",
      });
    }

    if (enteredOtp !== String(pending.otp)) {
      return renderOtpPage(res, req, {
        error: "Invalid OTP.",
        old: { email: pending.email },
        otpEmail: pending.email,
      });
    }

    const existingAny = await findAnyAccountByEmail(pending.email);
    if (existingAny) {
      clearPendingSignup(req);
      return renderOtpPage(res, req, {
        error: accountExistsMessage(),
      });
    }

    if (pending.phone) {
      const duplicatePhone = await findCustomerByPhone(pending.phone);
      if (duplicatePhone) {
        clearPendingSignup(req);
        return renderOtpPage(res, req, {
          error: "This phone number is already registered.",
        });
      }
    }

    const passwordHash = await bcrypt.hash(pending.password, SALT_ROUNDS);
    const userId = generateUserId(pending.fullName);
    const guestContext = getGuestContext(req);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const insertResult = await insertCustomerAccount({
        client,
        userId,
        fullName: pending.fullName,
        email: pending.email,
        phone: pending.phone,
        passwordHash,
      });

      const createdUser = insertResult.rows[0];
      const cartUserId = normalizeEmail(createdUser.email);
      await mergeGuestRowsToCustomer(client, "cart", cartUserId, guestContext, "guest_token");
      await normalizeCartRowsToEmail(client, cartUserId, [createdUser.id, createdUser.user_id]);
      await mergeGuestRowsToCustomer(client, "wishlist", createdUser.id, guestContext, "guest_id");

      await client.query("COMMIT");
      clearPendingSignup(req);

      await loginCustomer(req, createdUser, "local", false, guestContext);
      setFlash(req, "success", "Account created successfully.");
      return res.redirect("/customer/u/profile");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    return next(err);
  }
};

exports.postResendOtp = async (req, res, next) => {
  try {
    const pending = getPendingSignup(req);

    if (!pending) {
      return res.redirect("/customer/sign/up");
    }

    const otp = generateOtp();
    pending.otp = otp;
    pending.otpAttempts = 0;
    pending.expiresAt = Date.now() + OTP_EXPIRES_MINUTES * 60 * 1000;
    req.session.pendingSignup = pending;

    const mail = buildOtpEmail(pending.fullName, otp);

    try {
      await sendMail({
        to: pending.email,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
      });
    } catch (mailErr) {
      console.error("Resend OTP email failed:", mailErr);
      return renderOtpPage(res, req, {
        error: "Unable to resend OTP. Please try again.",
        old: { email: pending.email },
        otpEmail: pending.email,
      });
    }

    return renderOtpPage(res, req, {
      success: "A new OTP has been sent.",
      old: { email: pending.email },
      otpEmail: pending.email,
    });
  } catch (err) {
    return next(err);
  }
};

exports.verifyEmail = async (req, res, next) => {
  try {
    const token = String(req.query?.token || req.body?.token || "").trim();

    if (!token) {
      return renderSignIn(res, req, {
        error: "Invalid verification token.",
      });
    }

    const tokenHash = hashToken(token);

    const result = await pool.query(
      `
        SELECT id, full_name, email
        FROM customer_accounts
        WHERE email_verification_token = $1
          AND email_verification_expires > NOW()
        LIMIT 1
      `,
      [tokenHash]
    );

    const user = result.rows[0];
    if (!user) {
      return renderSignIn(res, req, {
        error: "Verification link is invalid or expired.",
      });
    }

    await activateVerifiedEmail(user.id);
    return renderSignIn(res, req, {
      success: "Your email has been verified. You can now sign in.",
    });
  } catch (err) {
    return next(err);
  }
};

exports.postResendVerification = async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body?.email);

    if (!email || !isValidEmail(email)) {
      return renderSignIn(res, req, {
        error: "Please enter a valid email address.",
        old: { email },
      });
    }

    const user = await findCustomerByEmail(email);

    if (!user) {
      return renderSignIn(res, req, {
        success: "If the account exists, a verification email has been sent.",
        old: { email },
      });
    }

    if (user.email_verified) {
      return renderSignIn(res, req, {
        success: "Your email is already verified. Please sign in.",
        old: { email },
      });
    }

    const verificationToken = generateSecureToken();
    const verificationTokenHash = hashToken(verificationToken);
    const verificationExpires = new Date(Date.now() + EMAIL_VERIFY_HOURS * 60 * 60 * 1000);

    await pool.query(
      `
        UPDATE customer_accounts
        SET email_verification_token = $2,
            email_verification_expires = $3,
            updated_at = NOW()
        WHERE id = $1
      `,
      [user.id, verificationTokenHash, verificationExpires]
    );

    try {
      const mail = buildVerificationEmail(req, user.full_name, verificationToken);
      await sendMail({
        to: user.email,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
      });
    } catch (mailErr) {
      console.error("Resend verification email failed:", mailErr);
    }

    return renderSignIn(res, req, {
      success: "If the account exists, a verification email has been sent.",
      old: { email },
    });
  } catch (err) {
    return next(err);
  }
};

exports.getForgotPasswordPage = (req, res) => {
  return renderForgotPassword(res, req);
};

exports.postForgotPassword = async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body?.email);

    if (!email || !isValidEmail(email)) {
      return renderForgotPassword(res, req, {
        error: "Please enter a valid email address.",
        old: { email },
      });
    }

    const user = await findCustomerByEmail(email);

    if (!user || user.status === "deleted") {
      return renderForgotPassword(res, req, {
        success: "If the account exists, a password reset email has been sent.",
        old: { email },
      });
    }

    const resetToken = generateSecureToken();
    const resetTokenHash = hashToken(resetToken);
    const resetExpires = new Date(Date.now() + RESET_PASSWORD_MINUTES * 60 * 1000);

    await pool.query(
      `
        UPDATE customer_accounts
        SET reset_password_token = $2,
            reset_password_expires = $3,
            updated_at = NOW()
        WHERE id = $1
      `,
      [user.id, resetTokenHash, resetExpires]
    );

    try {
      const mail = buildResetPasswordEmail(req, user.full_name, resetToken);
      await sendMail({
        to: user.email,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
      });
    } catch (mailErr) {
      console.error("Reset password email failed:", mailErr);
    }

    return renderForgotPassword(res, req, {
      success: "If the account exists, a password reset email has been sent.",
      old: { email },
    });
  } catch (err) {
    return next(err);
  }
};

exports.getResetPasswordPage = async (req, res, next) => {
  try {
    const token = String(req.query?.token || "").trim();

    if (!token) {
      return renderResetPassword(res, req, {
        error: "Invalid or missing reset token.",
      });
    }

    const tokenHash = hashToken(token);

    const result = await pool.query(
      `
        SELECT id
        FROM customer_accounts
        WHERE reset_password_token = $1
          AND reset_password_expires > NOW()
        LIMIT 1
      `,
      [tokenHash]
    );

    if (!result.rows[0]) {
      return renderResetPassword(res, req, {
        error: "Reset link is invalid or expired.",
      });
    }

    return renderResetPassword(res, req, {
      token,
    });
  } catch (err) {
    return next(err);
  }
};

exports.postResetPassword = async (req, res, next) => {
  try {
    const token = String(req.body?.token || "").trim();
    const password = String(req.body?.password || "");
    const confirmPassword = String(req.body?.confirm_password || req.body?.confirmPassword || "");

    if (!token) {
      return renderResetPassword(res, req, {
        error: "Invalid reset token.",
      });
    }

    if (!isStrongPassword(password)) {
      return renderResetPassword(res, req, {
        token,
        error: "Password must be at least 8 characters long.",
      });
    }

    if (password !== confirmPassword) {
      return renderResetPassword(res, req, {
        token,
        error: "Passwords do not match.",
      });
    }

    const tokenHash = hashToken(token);

    const result = await pool.query(
      `
        SELECT id, email
        FROM customer_accounts
        WHERE reset_password_token = $1
          AND reset_password_expires > NOW()
        LIMIT 1
      `,
      [tokenHash]
    );

    const user = result.rows[0];
    if (!user) {
      return renderResetPassword(res, req, {
        error: "Reset link is invalid or expired.",
      });
    }

    const newPasswordHash = await bcrypt.hash(password, SALT_ROUNDS);

    await pool.query(
      `
        UPDATE customer_accounts
        SET password_hash = $2,
            reset_password_token = NULL,
            reset_password_expires = NULL,
            login_attempts = 0,
            last_attempt_time = NULL,
            lock_until = NULL,
            is_online = FALSE,
            last_logout_at = NOW(),
            updated_at = NOW()
        WHERE id = $1
      `,
      [user.id, newPasswordHash]
    );

    await clearResetToken(user.id);

    return renderResetPassword(res, req, {
      success: "Your password has been reset successfully. Please sign in.",
    });
  } catch (err) {
    return next(err);
  }
};

exports.logoutCustomer = async (req, res) => {
  if (!req.session) {
    return res.redirect("/");
  }

  try {
    const current = getSessionCustomer(req);
    if (current?.id) {
      await markOffline(current.id);
    }
  } catch (err) {
    console.error("Logout status update failed:", err);
  }

  req.session.destroy(() => {
    res.clearCookie("user_session");
    res.clearCookie("connect.sid");
    return res.redirect("/");
  });
};

exports.getCurrentCustomer = async (req, res, next) => {
  try {
    const current = getSessionCustomer(req);

    if (!current) {
      return res.status(401).json({ ok: false, loggedIn: false });
    }

    const user = await findCustomerById(current.id);

    if (!user) {
      return res.status(401).json({ ok: false, loggedIn: false });
    }

    if (
      req.session?.sessionVersion &&
      Number(req.session.sessionVersion) !== Number(user.session_version || 1)
    ) {
      req.session.destroy(() => {});
      return res.status(401).json({ ok: false, loggedIn: false });
    }

    if (user.status !== "active" || !user.email_verified) {
      req.session.destroy(() => {});
      return res.status(401).json({ ok: false, loggedIn: false });
    }

    await pool.query(
      `
        UPDATE customer_accounts
        SET last_activity_at = NOW(),
            updated_at = NOW()
        WHERE id = $1
      `,
      [user.id]
    );

    return res.json({
      ok: true,
      loggedIn: true,
      user: {
        id: user.id,
        user_id: user.user_id || null,
        full_name: user.full_name,
        email: user.email,
        phone: user.phone || null,
        google_id: user.google_id || null,
        status: user.status || null,
        provider: user.provider || null,
        email_verified: !!user.email_verified,
        phone_verified: !!user.phone_verified,
        is_online: !!user.is_online,
        session_version: user.session_version || 1,
      },
    });
  } catch (err) {
    return next(err);
  }
};

exports.googleAuthSuccess = async (req, res, next) => {
  try {
    const currentUser = getSessionCustomer(req);
    if (currentUser) {
      return res.redirect("/customer/u/profile");
    }

    const profile = req.user || req.authInfo || {};
    const googleUser = normalizeGoogleProfile(profile);

    if (!googleUser.googleId || !googleUser.email) {
      return renderSignIn(res, req, {
        error: "Unable to sign in with Google.",
      });
    }

    const linkedUser = await findCustomerByGoogleId(googleUser.googleId);
    if (linkedUser) {
      if (linkedUser.status === "deleted") {
        return renderSignIn(res, req, {
          error: "Your account has been removed.",
        });
      }

      const freshUser = await findCustomerById(linkedUser.id);
      if (!freshUser) {
        return renderSignIn(res, req, {
          error: "Unable to complete Google sign-in.",
        });
      }

      await finalizeLogin(req, freshUser, "google", true);
      setFlash(req, "success", "Signed in successfully with Google.");
      return res.redirect("/customer/u/profile");
    }

    const emailExists = await emailAlreadyExists(googleUser.email);
    if (emailExists) {
      return renderSignIn(res, req, {
        error: accountExistsMessage(),
      });
    }

    const createdUser = await createGoogleCustomer(profile);
    const freshUser = await findCustomerById(createdUser.id);

    if (!freshUser) {
      return renderSignIn(res, req, {
        error: "Unable to complete Google sign-in.",
      });
    }

    await finalizeLogin(req, freshUser, "google", true);
    setFlash(req, "success", "Signed in successfully with Google.");
    return res.redirect("/customer/u/profile");
  } catch (err) {
    if (err?.code === "ACCOUNT_EXISTS") {
      return renderSignIn(res, req, {
        error: err.message || accountExistsMessage(),
      });
    }
    return next(err);
  }
};

exports.googleCallback = exports.googleAuthSuccess;
exports.postGoogleSignIn = exports.googleAuthSuccess;

exports.findCustomerByEmail = findCustomerByEmail;
exports.findCustomerById = findCustomerById;
exports.findCustomerByPhone = findCustomerByPhone;
exports.findCustomerByGoogleId = findCustomerByGoogleId;
exports.getCsrfToken = getCsrfToken;
