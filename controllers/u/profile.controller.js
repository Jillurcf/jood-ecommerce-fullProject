"use strict";

const { pool } = require("../../includes/conn");

const MAX_FULL_NAME_LENGTH = 80;
const MAX_PHONE_LENGTH = 20;
const MAX_ADDRESS_LENGTH = 255;
const MAX_CITY_LENGTH = 100;
const MAX_COUNTRY_LENGTH = 100;
const MAX_BIO_LENGTH = 1000;

const CUSTOMER_SELECT_FIELDS = `
  id,
  user_id,
  full_name,
  email,
  phone,
  address,
  bio,
  city,
  country,
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
  provider,
  google_id,
  created_at,
  updated_at
`;

function cleanText(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim().replace(/\s+/g, " ");
}

function cleanNullableText(value) {
  const text = cleanText(value);
  return text ? text : null;
}

function truncateText(value, maxLength) {
  const text = cleanText(value);
  if (!text) return "";
  return text.slice(0, maxLength);
}

function normalizePhone(value) {
  const raw = cleanText(value);
  if (!raw) return null;

  const cleaned = raw.replace(/[^\d+]/g, "");
  if (cleaned.startsWith("+")) {
    const normalized = `+${cleaned.slice(1).replace(/\+/g, "")}`;
    return normalized.slice(0, MAX_PHONE_LENGTH);
  }

  const normalized = cleaned.replace(/\+/g, "");
  return normalized.slice(0, MAX_PHONE_LENGTH);
}

function isValidFullName(name) {
  const n = cleanText(name);
  return n.length >= 2 && n.length <= MAX_FULL_NAME_LENGTH;
}

function isValidPhone(phone) {
  if (!phone) return true;
  return /^\+?[0-9]{7,15}$/.test(phone);
}

function wantsJson(req) {
  return (
    req.xhr ||
    req.headers?.["x-requested-with"] === "XMLHttpRequest" ||
    String(req.headers?.accept || "").includes("application/json")
  );
}

function getCurrentUserId(req) {
  return req.session?.user?.id || req.session?.userId || null;
}

function syncSessionUser(req, updatedUser) {
  if (!req.session) return;

  if (!req.session.user) {
    req.session.user = {
      id: updatedUser.id,
      user_id: updatedUser.user_id || null,
      full_name: updatedUser.full_name || null,
      email: updatedUser.email || null,
      phone: updatedUser.phone || null,
      role: "customer",
      provider: updatedUser.provider || "local",
    };
  }

  req.session.user.id = updatedUser.id;
  req.session.user.user_id = updatedUser.user_id || null;
  req.session.user.full_name = updatedUser.full_name || null;
  req.session.user.email = updatedUser.email || null;
  req.session.user.phone = updatedUser.phone || null;
  req.session.user.provider =
    updatedUser.provider || req.session.user.provider || "local";

  req.session.userId = updatedUser.id;
  req.session.userUserId = updatedUser.user_id || null;
  req.session.userName = updatedUser.full_name || null;
  req.session.userEmail = updatedUser.email || null;
  req.session.userPhone = updatedUser.phone || null;
  req.session.userRole = "customer";
  req.session.isAuthenticated = true;
}

function sessionSave(req) {
  return new Promise((resolve, reject) => {
    if (!req.session || typeof req.session.save !== "function") {
      return resolve();
    }
    req.session.save((err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

async function getCustomerById(id) {
  const result = await pool.query(
    `
      SELECT ${CUSTOMER_SELECT_FIELDS}
      FROM customer_accounts
      WHERE id = $1
      LIMIT 1
    `,
    [id]
  );

  return result.rows[0] || null;
}

function buildStats() {
  return {
    orders: 0,
    pendingOrders: 0,
    wishlist: 0,
    spent: 0,
  };
}

function formatUserForResponse(user) {
  return {
    id: user.id,
    user_id: user.user_id || null,
    full_name: user.full_name || null,
    email: user.email || null,
    phone: user.phone || null,
    address: user.address || null,
    bio: user.bio || null,
    city: user.city || null,
    country: user.country || null,
    status: user.status || null,
    email_verified: !!user.email_verified,
    phone_verified: !!user.phone_verified,
    login_attempts: Number(user.login_attempts || 0),
    last_attempt_time: user.last_attempt_time || null,
    lock_until: user.lock_until || null,
    last_login_at: user.last_login_at || null,
    last_logout_at: user.last_logout_at || null,
    last_activity_at: user.last_activity_at || null,
    is_online: !!user.is_online,
    provider: user.provider || null,
    google_id: user.google_id || null,
    created_at: user.created_at || null,
    updated_at: user.updated_at || null,
  };
}

function renderProfileView(req, res, user) {
  return res.render("customer/u/profile", {
    user,
    stats: buildStats(),
    csrfToken: typeof req.csrfToken === "function" ? req.csrfToken() : null,
  });
}

function respondUnauthorized(req, res) {
  if (wantsJson(req)) {
    return res.status(401).json({ ok: false, message: "Unauthorized" });
  }
  return res.redirect("/customer/sign/in");
}

function respondNotFound(req, res) {
  if (wantsJson(req)) {
    return res.status(404).json({ ok: false, message: "User not found" });
  }
  if (req.session?.destroy) req.session.destroy(() => {});
  return res.redirect("/customer/sign/in");
}

/**
 * GET PROFILE PAGE
 */
exports.getProfilePage = async (req, res) => {
  try {
    const userId = getCurrentUserId(req);
    if (!userId) return respondUnauthorized(req, res);

    const user = await getCustomerById(userId);
    if (!user) return respondNotFound(req, res);

    return renderProfileView(req, res, user);
  } catch (err) {
    console.error("getProfilePage error:", err);
    if (wantsJson(req)) {
      return res.status(500).json({ ok: false, message: "Server error" });
    }
    return res.status(500).send("Server error");
  }
};

exports.getAccountPage = exports.getProfilePage;

/**
 * GET CURRENT ACCOUNT JSON
 */
exports.getAccount = async (req, res) => {
  try {
    const userId = getCurrentUserId(req);
    if (!userId) {
      return res.status(401).json({ ok: false, message: "Unauthorized" });
    }

    const user = await getCustomerById(userId);
    if (!user) {
      return res.status(404).json({ ok: false, message: "User not found" });
    }

    return res.status(200).json({
      ok: true,
      user: formatUserForResponse(user),
    });
  } catch (err) {
    console.error("getAccount error:", err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
};

/**
 * UPDATE PROFILE
 * Supports AJAX JSON and normal form submit.
 */
exports.updateProfile = async (req, res) => {
  try {
    const userId = getCurrentUserId(req);
    if (!userId) {
      return res.status(401).json({ ok: false, message: "Unauthorized" });
    }

    const currentUser = await getCustomerById(userId);
    if (!currentUser) {
      if (req.session?.destroy) req.session.destroy(() => {});
      return res.status(404).json({ ok: false, message: "User not found" });
    }

    const full_name = truncateText(
      req.body?.full_name ?? req.body?.fullName,
      MAX_FULL_NAME_LENGTH
    );
    const phone = normalizePhone(req.body?.phone ?? req.body?.phone_number);
    const address = cleanNullableText(req.body?.address);
    const bio = cleanNullableText(req.body?.bio);
    const city = cleanNullableText(req.body?.city);
    const country = cleanNullableText(req.body?.country);

    const addressSafe = address ? address.slice(0, MAX_ADDRESS_LENGTH) : null;
    const bioSafe = bio ? bio.slice(0, MAX_BIO_LENGTH) : null;
    const citySafe = city ? city.slice(0, MAX_CITY_LENGTH) : null;
    const countrySafe = country ? country.slice(0, MAX_COUNTRY_LENGTH) : null;

    if (!isValidFullName(full_name)) {
      return res.status(400).json({
        ok: false,
        message: "Full name is required and must be between 2 and 80 characters.",
      });
    }

    if (!isValidPhone(phone)) {
      return res.status(400).json({
        ok: false,
        message: "Please enter a valid phone number.",
      });
    }

    const result = await pool.query(
      `
        UPDATE customer_accounts
        SET
          full_name = $1,
          phone = $2,
          address = $3,
          bio = $4,
          city = $5,
          country = $6,
          is_online = TRUE,
          last_activity_at = NOW(),
          updated_at = NOW()
        WHERE id = $7
        RETURNING ${CUSTOMER_SELECT_FIELDS}
      `,
      [
        full_name,
        phone,
        addressSafe,
        bioSafe,
        citySafe,
        countrySafe,
        userId,
      ]
    );

    if (!result.rows.length) {
      return res.status(404).json({ ok: false, message: "User not found" });
    }

    const updatedUser = result.rows[0];
    syncSessionUser(req, updatedUser);
    await sessionSave(req);

    const payload = {
      ok: true,
      message: "Profile updated successfully",
      user: formatUserForResponse(updatedUser),
    };

    if (wantsJson(req)) {
      return res.status(200).json(payload);
    }

    return res.redirect("/customer/u/profile");
  } catch (err) {
    console.error("updateProfile error:", err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
};

exports.updateField = exports.updateProfile;

/**
 * REAL-TIME PRESENCE HEARTBEAT
 * Call every 10-30 seconds from frontend.
 */
exports.heartbeat = async (req, res) => {
  try {
    const userId = getCurrentUserId(req);
    if (!userId) {
      return res.status(401).json({ ok: false, message: "Unauthorized" });
    }

    const result = await pool.query(
      `
        UPDATE customer_accounts
        SET
          is_online = TRUE,
          last_activity_at = NOW(),
          updated_at = NOW()
        WHERE id = $1
        RETURNING id, is_online, last_activity_at
      `,
      [userId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ ok: false, message: "User not found" });
    }

    return res.status(200).json({
      ok: true,
      is_online: true,
      last_activity_at: result.rows[0].last_activity_at,
    });
  } catch (err) {
    console.error("heartbeat error:", err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
};

/**
 * Explicit offline endpoint.
 * Useful with navigator.sendBeacon on unload.
 */
exports.setOffline = async (req, res) => {
  try {
    const userId = getCurrentUserId(req);
    if (!userId) {
      return res.status(401).json({ ok: false, message: "Unauthorized" });
    }

    const result = await pool.query(
      `
        UPDATE customer_accounts
        SET
          is_online = FALSE,
          last_logout_at = NOW(),
          last_activity_at = NOW(),
          updated_at = NOW()
        WHERE id = $1
        RETURNING id, is_online, last_logout_at
      `,
      [userId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ ok: false, message: "User not found" });
    }

    return res.status(200).json({
      ok: true,
      is_online: false,
      last_logout_at: result.rows[0].last_logout_at,
    });
  } catch (err) {
    console.error("setOffline error:", err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
};