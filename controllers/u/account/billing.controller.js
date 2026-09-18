'use strict';

const crypto = require('crypto');
const { pool } = require('../../../includes/conn');

/**
 * =========================
 * CONFIG
 * =========================
 */
const OTP_TTL_MINUTES = 10;
const OTP_RESEND_SECONDS = 30;
const STEPUP_TTL_MINUTES = 15;

const ALLOWED_PURPOSES = new Set([
  'billing_update',
  'payment_method_add',
  'payment_method_update',
  'payment_method_remove',
  'payment_method_default',
]);

const ALLOWED_CHANNELS = new Set(['email', 'phone']);

const MAX_FULL_NAME_LENGTH = 80;
const MAX_COMPANY_NAME_LENGTH = 120;
const MAX_PHONE_LENGTH = 20;
const MAX_ADDRESS_LENGTH = 255;
const MAX_CITY_LENGTH = 100;
const MAX_COUNTRY_LENGTH = 100;
const MAX_BIO_LENGTH = 1000;
const MAX_POSTAL_CODE_LENGTH = 30;
const MAX_STATE_LENGTH = 100;

const ACCOUNT_VIEW = 'customer/u/account/billing';
const FALLBACK_REDIRECT = '/customer/u/account/billing';

/**
 * =========================
 * REQUEST / RESPONSE HELPERS
 * =========================
 */
function wantsJson(req) {
  return Boolean(
    req.xhr ||
      String(req.headers?.accept || '').includes('application/json') ||
      String(req.headers?.['content-type'] || '').includes('application/json')
  );
}

function reply(req, res, statusCode, payload, redirectUrl = FALLBACK_REDIRECT) {
  if (wantsJson(req)) {
    return res.status(statusCode).json(payload);
  }

  if (payload?.message) {
    flash(req, statusCode < 400 ? 'success' : 'error', payload.message);
  }

  return res.redirect(redirectUrl);
}

function toNum(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function sanitizeText(v, max = 255) {
  if (v == null) return '';
  return String(v).trim().slice(0, max);
}

function cleanNullableText(v, max = 255) {
  const s = sanitizeText(v, max);
  return s ? s : null;
}

function sanitizeEmail(v) {
  const s = sanitizeText(v, 150).toLowerCase();
  if (!s) return '';
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : '';
}

function sanitizePhone(v) {
  return sanitizeText(v, MAX_PHONE_LENGTH).replace(/[^\d+\-\s()]/g, '');
}

function onlyDigits(v, max = 12) {
  return sanitizeText(v, max).replace(/\D/g, '');
}

function normalizeBool(v) {
  if (typeof v === 'boolean') return v;
  const s = String(v ?? '').trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(s);
}

function getCurrentUserId(req) {
  const id = req.session?.user?.id ?? req.session?.userId ?? req.user?.id ?? null;
  const userId = Number(id);
  return Number.isFinite(userId) && userId > 0 ? userId : null;
}

function randomOtp() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

function hash(value) {
  const pepper = process.env.OTP_PEPPER || process.env.SESSION_SECRET || 'fallback-pepper';
  return crypto.createHmac('sha256', pepper).update(String(value)).digest('hex');
}

function constantTimeHexEqual(a, b) {
  try {
    const ab = Buffer.from(String(a), 'hex');
    const bb = Buffer.from(String(b), 'hex');
    if (ab.length !== bb.length) return false;
    return crypto.timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}

function parseDate(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isExpired(expiresAt) {
  const d = parseDate(expiresAt);
  if (!d) return true;
  return Date.now() > d.getTime();
}

function minutesFromNow(minutes) {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

function secondsSince(dateValue) {
  const d = parseDate(dateValue);
  if (!d) return Number.POSITIVE_INFINITY;
  return (Date.now() - d.getTime()) / 1000;
}

function maskEmail(email) {
  const s = String(email || '').trim();
  const [name, domain] = s.split('@');
  if (!name || !domain) return '***';
  const head = name.slice(0, 2);
  return `${head}${name.length > 2 ? '***' : ''}@${domain}`;
}

function maskPhone(phone) {
  const s = String(phone || '').replace(/\D/g, '');
  if (!s) return '***';
  const tail = s.slice(-3);
  return `${'*'.repeat(Math.max(0, s.length - 3))}${tail}`;
}

function maskTarget(target, channel) {
  return channel === 'phone' ? maskPhone(target) : maskEmail(target);
}

function flash(req, type, message) {
  if (!req.session) return;
  req.session.billingFlash = { type, message };
}

function consumeFlash(req) {
  const data = req.session?.billingFlash || null;
  if (req.session?.billingFlash) delete req.session.billingFlash;
  return data;
}

function requireAllowedPurpose(purpose) {
  return ALLOWED_PURPOSES.has(String(purpose || '').trim());
}

function requireAllowedChannel(channel) {
  return ALLOWED_CHANNELS.has(String(channel || '').trim());
}

function getUpdateToken(req) {
  return String(
    req.body?.stepup_token ||
      req.body?.stepupToken ||
      req.session?.billingStepupToken ||
      ''
  ).trim();
}

function getOtpChallengeId(req) {
  return String(
    req.body?.challenge_id ||
      req.body?.challengeId ||
      req.session?.billingOtpChallengeId ||
      ''
  ).trim();
}

function getOtpCode(req) {
  return onlyDigits(req.body?.otp || req.body?.code || req.body?.otp_code, 6);
}

function setStepUpSession(req, challengeId, purpose) {
  if (!req.session) return null;
  const token = randomToken(32);
  req.session.billingStepupToken = token;
  req.session.billingStepupPurpose = purpose;
  req.session.billingStepupChallengeId = challengeId;
  req.session.billingStepupExpiresAt = minutesFromNow(STEPUP_TTL_MINUTES);
  req.session.billingStepupUsedAt = null;
  return token;
}

function clearStepUpSession(req) {
  if (!req.session) return;
  delete req.session.billingStepupToken;
  delete req.session.billingStepupPurpose;
  delete req.session.billingStepupChallengeId;
  delete req.session.billingStepupExpiresAt;
  delete req.session.billingStepupUsedAt;
}

function requireStepUpSession(req) {
  const token = req.session?.billingStepupToken;
  const expiresAt = req.session?.billingStepupExpiresAt;
  const purpose = req.session?.billingStepupPurpose;

  if (!token || !expiresAt || purpose !== 'billing_update') return false;
  if (isExpired(expiresAt)) return false;
  return true;
}

function normalizeUpdateBody(body) {
  const payload = {};

  if (Object.prototype.hasOwnProperty.call(body, 'full_name') || Object.prototype.hasOwnProperty.call(body, 'fullName')) {
    payload.full_name = cleanNullableText(body.full_name ?? body.fullName, MAX_FULL_NAME_LENGTH);
  }

  if (Object.prototype.hasOwnProperty.call(body, 'company_name') || Object.prototype.hasOwnProperty.call(body, 'companyName')) {
    payload.company_name = cleanNullableText(body.company_name ?? body.companyName, MAX_COMPANY_NAME_LENGTH);
  }

  if (Object.prototype.hasOwnProperty.call(body, 'email')) {
    const email = sanitizeEmail(body.email);
    payload.email = email || null;
  }

  if (Object.prototype.hasOwnProperty.call(body, 'phone')) {
    const phone = sanitizePhone(body.phone);
    payload.phone = phone || null;
  }

  if (Object.prototype.hasOwnProperty.call(body, 'address') || Object.prototype.hasOwnProperty.call(body, 'address_line1')) {
    payload.address = cleanNullableText(body.address ?? body.address_line1, MAX_ADDRESS_LENGTH);
  }

  if (Object.prototype.hasOwnProperty.call(body, 'city')) {
    payload.city = cleanNullableText(body.city, MAX_CITY_LENGTH);
  }

  if (Object.prototype.hasOwnProperty.call(body, 'country')) {
    payload.country = cleanNullableText(body.country, MAX_COUNTRY_LENGTH);
  }

  if (Object.prototype.hasOwnProperty.call(body, 'bio')) {
    payload.bio = cleanNullableText(body.bio, MAX_BIO_LENGTH);
  }

  if (Object.prototype.hasOwnProperty.call(body, 'postal_code')) {
    payload.postal_code = cleanNullableText(body.postal_code, MAX_POSTAL_CODE_LENGTH);
  }

  if (Object.prototype.hasOwnProperty.call(body, 'state')) {
    payload.state = cleanNullableText(body.state, MAX_STATE_LENGTH);
  }

  if (Object.prototype.hasOwnProperty.call(body, 'is_default')) {
    payload.is_default = normalizeBool(body.is_default);
  }

  return payload;
}

function pickChangedFields(payload) {
  const allowed = [
    'full_name',
    'company_name',
    'email',
    'phone',
    'address',
    'city',
    'country',
    'bio',
    'postal_code',
    'state',
    'is_default',
  ];

  const out = {};
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(payload, key)) out[key] = payload[key];
  }
  return out;
}

function safeDateLabel(value, opts = {}) {
  const d = parseDate(value);
  if (!d) return 'Not available';
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    ...opts,
  });
}

function safeDateOnlyLabel(value) {
  const d = parseDate(value);
  if (!d) return 'Not available';
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function buildBillingViewData(req, user, addresses = [], paymentSummary = {}) {
  const notice = consumeFlash(req);

  return {
    user,
    addresses,
    successMessage: notice?.type === 'success' ? notice.message : '',
    errorMessage: notice?.type === 'error' ? notice.message : '',
    paymentSummary,
    stepupToken: req.session?.billingStepupToken || '',
    billingOtpChallengeId: req.session?.billingOtpChallengeId || '',
    billingOtpChannel: req.session?.billingOtpChannel || '',
    billingOtpPurpose: req.session?.billingOtpPurpose || '',
    billingOtpTargetMasked: req.session?.billingOtpTargetMasked || '',
    billingOtpExpiresAt: req.session?.billingOtpExpiresAt || '',
    billingStepupExpiresAt: req.session?.billingStepupExpiresAt || '',
    currentBillingRoute: '/customer/u/account/billing',
  };
}

/**
 * =========================
 * DB HELPERS
 * =========================
 */
async function getUser(client, userId) {
  const r = await client.query(
    `SELECT * FROM customer_accounts WHERE id = $1 LIMIT 1`,
    [userId]
  );
  return r.rows[0] || null;
}

async function getPaymentSummary(client, userId) {
  const paidStatuses = ['paid', 'completed', 'captured'];
  const refundedStatuses = ['refunded', 'refund', 'partially_refunded'];

  const summary = await client.query(
    `
    SELECT
      COALESCE(SUM(CASE WHEN payment_status = ANY($2) THEN grand_total ELSE 0 END), 0) AS total_spent,
      COALESCE(COUNT(CASE WHEN payment_status = ANY($2) THEN 1 END), 0) AS total_orders_paid,
      COALESCE(COUNT(CASE WHEN payment_status IN ('pending','initiated') THEN 1 END), 0) AS pending_payments,
      COALESCE(SUM(CASE WHEN payment_status = ANY($3) THEN grand_total ELSE 0 END), 0) AS refund_total,
      COALESCE(SUM(CASE
        WHEN payment_status = ANY($2)
          AND created_at >= date_trunc('month', NOW())
        THEN grand_total ELSE 0 END), 0) AS this_month_spent
    FROM orders
    WHERE user_id = $1
    `,
    [userId, paidStatuses, refundedStatuses]
  );

  const lastOrder = await client.query(
    `
    SELECT
      order_number,
      tracking_id,
      created_at,
      grand_total,
      currency,
      payment_method,
      payment_status,
      order_status,
      payment_reference,
      gateway_provider,
      billing_address,
      shipping_address,
      notes
    FROM orders
    WHERE user_id = $1
    ORDER BY created_at DESC, id DESC
    LIMIT 1
    `,
    [userId]
  );

  const recentOrders = await client.query(
    `
    SELECT
      order_number,
      tracking_id,
      created_at,
      grand_total,
      currency,
      payment_method,
      payment_status,
      order_status,
      payment_reference,
      gateway_provider
    FROM orders
    WHERE user_id = $1
    ORDER BY created_at DESC, id DESC
    LIMIT 5
    `,
    [userId]
  );

  return {
    totalSpent: Number(summary.rows[0]?.total_spent || 0),
    totalOrdersPaid: Number(summary.rows[0]?.total_orders_paid || 0),
    pendingPayments: Number(summary.rows[0]?.pending_payments || 0),
    refundTotal: Number(summary.rows[0]?.refund_total || 0),
    thisMonthSpent: Number(summary.rows[0]?.this_month_spent || 0),
    lastOrder: lastOrder.rows[0] || null,
    recentOrders: recentOrders.rows || [],
  };
}

/**
 * =========================
 * DELIVERY HELPER
 * =========================
 */
async function sendOtpOutOfBand(req, user, channel, target, code) {
  const sender = req.app?.locals?.sendBillingOtp;
  if (typeof sender === 'function') {
    await sender({ user, channel, target, code });
    return true;
  }

  if (process.env.NODE_ENV !== 'production') {
    console.warn(`[OTP DEV ONLY] channel=${channel} target=${target} code=${code}`);
    return true;
  }

  return false;
}

/**
 * =========================
 * CONTROLLERS
 * =========================
 */
exports.getBillingPage = async (req, res) => {
  let client;
  try {
    const userId = getCurrentUserId(req);
    if (!userId) return res.redirect('/customer/sign/in');

    client = await pool.connect();

    const user = await getUser(client, userId);
    if (!user) return res.redirect('/customer/sign/in');

    const addresses = await client.query(
      `
      SELECT *
      FROM user_addresses
      WHERE user_id = $1
      ORDER BY COALESCE(is_default, false) DESC, id DESC
      `,
      [userId]
    );

    const paymentSummary = await getPaymentSummary(client, userId);

    return res.render(
      ACCOUNT_VIEW,
      buildBillingViewData(req, user, addresses.rows, paymentSummary)
    );
  } catch (err) {
    console.error(err);
    return res.redirect(FALLBACK_REDIRECT);
  } finally {
    if (client) client.release();
  }
};

exports.getBillingData = async (req, res) => {
  let client;
  try {
    const userId = getCurrentUserId(req);
    if (!userId) {
      return res.status(401).json({ ok: false, success: false, error: 'AUTH_REQUIRED' });
    }

    client = await pool.connect();

    const user = await getUser(client, userId);
    if (!user) {
      return res.status(401).json({ ok: false, success: false, error: 'AUTH_REQUIRED' });
    }

    const addresses = await client.query(
      `
      SELECT *
      FROM user_addresses
      WHERE user_id = $1
      ORDER BY COALESCE(is_default, false) DESC, id DESC
      `,
      [userId]
    );

    const paymentSummary = await getPaymentSummary(client, userId);

    return res.json({
      ok: true,
      success: true,
      data: buildBillingViewData(req, user, addresses.rows, paymentSummary),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, success: false, error: 'SERVER_ERROR' });
  } finally {
    if (client) client.release();
  }
};

exports.requestOtp = async (req, res) => {
  let client;
  try {
    const userId = getCurrentUserId(req);
    if (!userId) return res.redirect('/customer/sign/in');

    const purpose = String(req.body?.purpose || req.query?.purpose || 'billing_update').trim();
    const channel = String(req.body?.channel || req.query?.channel || 'email').trim();

    if (!requireAllowedPurpose(purpose) || !requireAllowedChannel(channel)) {
      return reply(req, res, 400, {
        ok: false,
        success: false,
        error: 'INVALID_OTP_CONFIGURATION',
        message: 'Invalid OTP configuration.',
      });
    }

    client = await pool.connect();
    await client.query('BEGIN');

    const user = await getUser(client, userId);
    if (!user) {
      await client.query('ROLLBACK');
      return res.redirect('/customer/sign/in');
    }

    const target = channel === 'phone' ? sanitizePhone(user.phone) : sanitizeEmail(user.email);
    if (!target) {
      await client.query('ROLLBACK');
      return reply(req, res, 400, {
        ok: false,
        success: false,
        error: 'NO_OTP_TARGET',
        message: `No valid ${channel} found for OTP delivery.`,
      });
    }

    const last = await client.query(
      `
      SELECT created_at
      FROM security_otp_challenges
      WHERE user_id = $1
        AND purpose = $2
        AND channel = $3
      ORDER BY created_at DESC, id DESC
      LIMIT 1
      FOR UPDATE
      `,
      [userId, purpose, channel]
    );

    if (last.rows[0]) {
      const elapsed = secondsSince(last.rows[0].created_at);
      if (elapsed < OTP_RESEND_SECONDS) {
        await client.query('ROLLBACK');
        const waitSeconds = Math.ceil(OTP_RESEND_SECONDS - elapsed);
        return reply(req, res, 429, {
          ok: false,
          success: false,
          error: 'OTP_TOO_SOON',
          message: `Please wait ${waitSeconds} seconds before requesting another code.`,
        });
      }
    }

    const id = crypto.randomUUID();
    const code = randomOtp();
    const otpHash = hash(`${id}:${code}`);

    await client.query(
      `
      INSERT INTO security_otp_challenges
      (id, user_id, purpose, channel, target, otp_hash, attempt_count, max_attempts, expires_at, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, 0, 5, NOW() + INTERVAL '${OTP_TTL_MINUTES} minutes', NOW(), NOW())
      `,
      [id, userId, purpose, channel, target, otpHash]
    );

    const delivered = await sendOtpOutOfBand(req, user, channel, target, code);
    if (!delivered) {
      await client.query('ROLLBACK');
      return reply(req, res, 500, {
        ok: false,
        success: false,
        error: 'OTP_DELIVERY_FAILED',
        message: 'OTP could not be delivered right now.',
      });
    }

    await client.query('COMMIT');

    if (!req.session) {
      return reply(req, res, 500, {
        ok: false,
        success: false,
        error: 'SESSION_UNAVAILABLE',
        message: 'Session unavailable.',
      });
    }

    req.session.billingOtpChallengeId = id;
    req.session.billingOtpChannel = channel;
    req.session.billingOtpPurpose = purpose;
    req.session.billingOtpTargetMasked = maskTarget(target, channel);
    req.session.billingOtpExpiresAt = minutesFromNow(OTP_TTL_MINUTES);
    clearStepUpSession(req);

    return reply(req, res, 200, {
      ok: true,
      success: true,
      message: 'OTP sent successfully.',
      billingOtpChallengeId: id,
      billingOtpChannel: channel,
      billingOtpPurpose: purpose,
      billingOtpTargetMasked: req.session.billingOtpTargetMasked,
      billingOtpExpiresAt: req.session.billingOtpExpiresAt,
    });
  } catch (err) {
    if (client) {
      try { await client.query('ROLLBACK'); } catch {}
    }
    console.error(err);
    return reply(req, res, 500, {
      ok: false,
      success: false,
      error: 'SERVER_ERROR',
      message: 'Failed to send OTP.',
    });
  } finally {
    if (client) client.release();
  }
};

exports.verifyOtp = async (req, res) => {
  let client;
  try {
    const userId = getCurrentUserId(req);
    if (!userId) return res.redirect('/customer/sign/in');

    const challengeId = getOtpChallengeId(req);
    const code = getOtpCode(req);

    if (!challengeId || code.length !== 6) {
      return reply(req, res, 400, {
        ok: false,
        success: false,
        error: 'INVALID_INPUT',
        message: 'Enter a valid 6-digit OTP code.',
      });
    }

    client = await pool.connect();
    await client.query('BEGIN');

    const challengeRes = await client.query(
      `
      SELECT *
      FROM security_otp_challenges
      WHERE id = $1
        AND user_id = $2
        AND purpose = $3
        AND channel = $4
      LIMIT 1
      FOR UPDATE
      `,
      [challengeId, userId, 'billing_update', 'email']
    );

    const challenge = challengeRes.rows[0];
    if (!challenge) {
      await client.query('ROLLBACK');
      return reply(req, res, 400, {
        ok: false,
        success: false,
        error: 'OTP_INVALID',
        message: 'Invalid or expired OTP code.',
      });
    }

    if (isExpired(challenge.expires_at)) {
      await client.query('ROLLBACK');
      return reply(req, res, 400, {
        ok: false,
        success: false,
        error: 'OTP_EXPIRED',
        message: 'This OTP code has expired. Please request a new one.',
      });
    }

    const attempts = toNum(challenge.attempt_count, 0);
    const maxAttempts = toNum(challenge.max_attempts, 5);
    if (attempts >= maxAttempts) {
      await client.query('ROLLBACK');
      return reply(req, res, 429, {
        ok: false,
        success: false,
        error: 'OTP_LOCKED',
        message: 'Too many invalid attempts. Request a new OTP.',
      });
    }

    const expected = hash(`${challenge.id}:${code}`);
    const ok = constantTimeHexEqual(challenge.otp_hash, expected);

    if (!ok) {
      await client.query(
        `
        UPDATE security_otp_challenges
        SET attempt_count = attempt_count + 1,
            updated_at = NOW()
        WHERE id = $1
        `,
        [challenge.id]
      );

      const updatedAttempts = attempts + 1;
      await client.query('COMMIT');

      return reply(req, res, 400, {
        ok: false,
        success: false,
        error: updatedAttempts >= maxAttempts ? 'OTP_LOCKED' : 'OTP_INVALID',
        message:
          updatedAttempts >= maxAttempts
            ? 'Too many invalid attempts. Request a new OTP.'
            : 'Invalid OTP code.',
      });
    }

    const stepupToken = setStepUpSession(req, challenge.id, challenge.purpose);
    await client.query(
      `
      UPDATE security_otp_challenges
      SET updated_at = NOW()
      WHERE id = $1
      `,
      [challenge.id]
    );

    await client.query('COMMIT');

    if (!stepupToken) {
      return reply(req, res, 500, {
        ok: false,
        success: false,
        error: 'SESSION_ERROR',
        message: 'Could not complete step-up verification.',
      });
    }

    flash(req, 'success', 'OTP verified successfully.');
    return reply(req, res, 200, {
      ok: true,
      success: true,
      message: 'OTP verified successfully.',
      stepupToken,
      stepupExpiresAt: req.session.billingStepupExpiresAt,
    });
  } catch (err) {
    if (client) {
      try { await client.query('ROLLBACK'); } catch {}
    }
    console.error(err);
    return reply(req, res, 500, {
      ok: false,
      success: false,
      error: 'SERVER_ERROR',
      message: 'OTP verification failed.',
    });
  } finally {
    if (client) client.release();
  }
};

exports.updateBillingData = async (req, res) => {
  let client;
  try {
    const userId = getCurrentUserId(req);
    if (!userId) return res.redirect('/customer/sign/in');

    const providedToken = getUpdateToken(req);
    const sessionToken = String(req.session?.billingStepupToken || '').trim();

    if (!requireStepUpSession(req) || !providedToken || providedToken !== sessionToken) {
      return reply(req, res, 403, {
        ok: false,
        success: false,
        error: 'STEP_UP_REQUIRED',
        message: 'OTP verification is required before updating billing data.',
      });
    }

    client = await pool.connect();
    await client.query('BEGIN');

    const user = await getUser(client, userId);
    if (!user) {
      await client.query('ROLLBACK');
      return res.redirect('/customer/sign/in');
    }

    const input = pickChangedFields(normalizeUpdateBody(req.body || {}));
    const keys = Object.keys(input);

    if (keys.length === 0) {
      await client.query('ROLLBACK');
      return reply(req, res, 400, {
        ok: false,
        success: false,
        error: 'NO_CHANGES',
        message: 'No valid billing fields were provided.',
      });
    }

    if (Object.prototype.hasOwnProperty.call(input, 'email') && !input.email) {
      await client.query('ROLLBACK');
      return reply(req, res, 400, {
        ok: false,
        success: false,
        error: 'INVALID_EMAIL',
        message: 'Please enter a valid email address.',
      });
    }

    if (Object.prototype.hasOwnProperty.call(input, 'phone') && input.phone && input.phone.length < 6) {
      await client.query('ROLLBACK');
      return reply(req, res, 400, {
        ok: false,
        success: false,
        error: 'INVALID_PHONE',
        message: 'Please enter a valid phone number.',
      });
    }

    const allowedColumns = {
      full_name: 'full_name',
      company_name: 'company_name',
      email: 'email',
      phone: 'phone',
      address: 'address',
      city: 'city',
      country: 'country',
      bio: 'bio',
      postal_code: 'postal_code',
      state: 'state',
      is_default: 'is_default',
    };

    const setParts = [];
    const values = [];
    let idx = 1;

    for (const [key, column] of Object.entries(allowedColumns)) {
      if (!Object.prototype.hasOwnProperty.call(input, key)) continue;
      setParts.push(`${column} = $${idx++}`);
      values.push(input[key]);
    }

    if (setParts.length === 0) {
      await client.query('ROLLBACK');
      return reply(req, res, 400, {
        ok: false,
        success: false,
        error: 'NO_ALLOWED_FIELDS',
        message: 'No permitted billing fields were provided.',
      });
    }

    setParts.push('updated_at = NOW()');
    values.push(userId);

    await client.query(
      `
      UPDATE customer_accounts
      SET ${setParts.join(', ')}
      WHERE id = $${idx}
      `,
      values
    );

    const refreshedUser = await getUser(client, userId);
    await client.query('COMMIT');

    clearStepUpSession(req);
    flash(req, 'success', 'Billing details updated successfully.');

    return reply(req, res, 200, {
      ok: true,
      success: true,
      message: 'Billing details updated successfully.',
      user: refreshedUser || user,
      stepupToken: '',
    });
  } catch (err) {
    if (client) {
      try { await client.query('ROLLBACK'); } catch {}
    }
    console.error(err);
    return reply(req, res, 500, {
      ok: false,
      success: false,
      error: 'SERVER_ERROR',
      message: 'Failed to update billing details.',
    });
  } finally {
    if (client) client.release();
  }
};

exports.requireStepUpSession = requireStepUpSession;
exports.getCurrentUserId = getCurrentUserId;
exports.buildBillingViewData = buildBillingViewData;
