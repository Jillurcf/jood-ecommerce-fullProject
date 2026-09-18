"use strict";

const { pool } = require("../../../includes/conn");

const MAX_FULL_NAME_LENGTH = 80;
const MAX_PHONE_LENGTH = 20;

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

const VIEW_PROFILE = "admin/a/profile/myprofile";
const PATH_SIGN_IN = "/admin/a/sign/in";

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

  // Keep only digits and plus signs, then normalize.
  const cleaned = raw.replace(/[^\d+]/g, "");

  if (cleaned.startsWith("+")) {
    const normalized = `+${cleaned.slice(1).replace(/\+/g, "")}`;
    return normalized.slice(0, MAX_PHONE_LENGTH);
  }

  const normalized = cleaned.replace(/\+/g, "");
  return normalized.slice(0, MAX_PHONE_LENGTH) || null;
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

function getCurrentAdminId(req) {
  return (
    req.session?.admin?.id ||
    req.session?.adminId ||
    req.session?.admin?.admin_id || // fallback only if your session stores PK here by mistake
    null
  );
}

function getSessionAdminSnapshot(req) {
  return req.session?.admin || null;
}

function mergeAdminWithSession(admin, req) {
  const sessionAdmin = getSessionAdminSnapshot(req);

  return {
    ...admin,
    // If DB row is missing admin_id, use session value for display.
    admin_id: admin?.admin_id || sessionAdmin?.admin_id || null,
    // Keep session-derived values available if needed in the template.
    _session_admin_id: sessionAdmin?.admin_id || null,
  };
}

function syncSessionAdmin(req, updatedAdmin) {
  if (!req.session) return;

  if (!req.session.admin) {
    req.session.admin = {
      id: updatedAdmin.id,
      admin_id: updatedAdmin.admin_id || null,
      full_name: updatedAdmin.full_name || null,
      email: updatedAdmin.email || null,
      phone: updatedAdmin.phone || null,
      role: updatedAdmin.role || "admin",
      sessionVersion: updatedAdmin.session_version || 1,
      loginAt: req.session.loginAt || new Date().toISOString(),
    };
  }

  req.session.admin.id = updatedAdmin.id;
  req.session.admin.admin_id = updatedAdmin.admin_id || null;
  req.session.admin.full_name = updatedAdmin.full_name || null;
  req.session.admin.email = updatedAdmin.email || null;
  req.session.admin.phone = updatedAdmin.phone || null;
  req.session.admin.role = updatedAdmin.role || req.session.admin.role || "admin";
  req.session.admin.sessionVersion = updatedAdmin.session_version || 1;

  req.session.adminId = updatedAdmin.id;
  req.session.adminAdminId = updatedAdmin.admin_id || null;
  req.session.adminName = updatedAdmin.full_name || null;
  req.session.adminEmail = updatedAdmin.email || null;
  req.session.adminPhone = updatedAdmin.phone || null;
  req.session.adminRole = updatedAdmin.role || "admin";
  req.session.sessionVersion = updatedAdmin.session_version || 1;
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

async function getAdminById(id) {
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

function buildStats() {
  return {
    orders: 0,
    pendingOrders: 0,
    wishlist: 0,
    spent: 0,
  };
}

function formatAdminForResponse(admin, req = null) {
  const sessionAdmin = req ? getSessionAdminSnapshot(req) : null;

  return {
    id: admin.id,
    admin_id: admin.admin_id || sessionAdmin?.admin_id || null,
    full_name: admin.full_name || null,
    email: admin.email || null,
    phone: admin.phone || null,
    role: admin.role || null,
    status: admin.status || null,
    email_verified: !!admin.email_verified,
    login_attempts: Number(admin.login_attempts || 0),
    last_attempt_time: admin.last_attempt_time || null,
    lock_until: admin.lock_until || null,
    last_login_at: admin.last_login_at || null,
    last_logout_at: admin.last_logout_at || null,
    last_activity_at: admin.last_activity_at || null,
    is_online: !!admin.is_online,
    session_version: Number(admin.session_version || 1),
    created_by: admin.created_by || null,
    created_at: admin.created_at || null,
    updated_at: admin.updated_at || null,
  };
}

function renderProfileView(req, res, admin) {
  const mergedAdmin = mergeAdminWithSession(admin, req);

  return res.render(VIEW_PROFILE, {
    admin: mergedAdmin,
    user: mergedAdmin, // keeps older EJS files working
    sessionAdmin: getSessionAdminSnapshot(req),
    stats: buildStats(),
    csrfToken: typeof req.csrfToken === "function" ? req.csrfToken() : null,
  });
}

function respondUnauthorized(req, res) {
  if (wantsJson(req)) {
    return res.status(401).json({ ok: false, message: "Unauthorized" });
  }
  return res.redirect(PATH_SIGN_IN);
}

function respondNotFound(req, res) {
  if (wantsJson(req)) {
    return res.status(404).json({ ok: false, message: "Admin not found" });
  }
  if (req.session?.destroy) req.session.destroy(() => {});
  return res.redirect(PATH_SIGN_IN);
}

/**
 * GET PROFILE PAGE
 */
exports.getProfilePage = async (req, res) => {
  try {
    const adminId = getCurrentAdminId(req);
    if (!adminId) return respondUnauthorized(req, res);

    const admin = await getAdminById(adminId);
    if (!admin) return respondNotFound(req, res);

    return renderProfileView(req, res, admin);
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
    const adminId = getCurrentAdminId(req);
    if (!adminId) {
      return res.status(401).json({ ok: false, message: "Unauthorized" });
    }

    const admin = await getAdminById(adminId);
    if (!admin) {
      return res.status(404).json({ ok: false, message: "Admin not found" });
    }

    const mergedAdmin = mergeAdminWithSession(admin, req);

    return res.status(200).json({
      ok: true,
      admin: formatAdminForResponse(mergedAdmin, req),
      user: formatAdminForResponse(mergedAdmin, req), // compatibility with old frontend
    });
  } catch (err) {
    console.error("getAccount error:", err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
};

/**
 * UPDATE PROFILE
 * Safe editable fields only:
 *  - full_name
 *  - phone
 */
exports.updateProfile = async (req, res) => {
  try {
    const adminId = getCurrentAdminId(req);
    if (!adminId) {
      return res.status(401).json({ ok: false, message: "Unauthorized" });
    }

    const currentAdmin = await getAdminById(adminId);
    if (!currentAdmin) {
      if (req.session?.destroy) req.session.destroy(() => {});
      return res.status(404).json({ ok: false, message: "Admin not found" });
    }

    const full_name = truncateText(
      req.body?.full_name ?? req.body?.fullName,
      MAX_FULL_NAME_LENGTH
    );
    const phone = normalizePhone(req.body?.phone ?? req.body?.phone_number);

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

    const currentFullName = cleanText(currentAdmin.full_name);
    const currentPhone = currentAdmin.phone ? cleanText(currentAdmin.phone) : null;
    const incomingPhone = phone ? cleanText(phone) : null;

    // Avoid unnecessary writes if nothing changed.
    if (currentFullName === full_name && currentPhone === incomingPhone) {
      const mergedAdmin = mergeAdminWithSession(currentAdmin, req);

      const payload = {
        ok: true,
        message: "No changes detected",
        admin: formatAdminForResponse(mergedAdmin, req),
        user: formatAdminForResponse(mergedAdmin, req),
      };

      if (wantsJson(req)) {
        return res.status(200).json(payload);
      }

      return res.redirect("/admin/a/profile/myprofile");
    }

    const result = await pool.query(
      `
        UPDATE admin_accounts
        SET
          full_name = $1,
          phone = $2,
          is_online = TRUE,
          last_activity_at = NOW(),
          updated_at = NOW()
        WHERE id = $3
        RETURNING ${ADMIN_SELECT_FIELDS}
      `,
      [full_name, phone, adminId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ ok: false, message: "Admin not found" });
    }

    const updatedAdmin = result.rows[0];
    syncSessionAdmin(req, updatedAdmin);
    await sessionSave(req);

    const mergedUpdatedAdmin = mergeAdminWithSession(updatedAdmin, req);

    const payload = {
      ok: true,
      message: "Profile updated successfully",
      admin: formatAdminForResponse(mergedUpdatedAdmin, req),
      user: formatAdminForResponse(mergedUpdatedAdmin, req), // compatibility with old frontend
    };

    if (wantsJson(req)) {
      return res.status(200).json(payload);
    }

    return res.redirect("/admin/a/profile/myprofile");
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
    const adminId = getCurrentAdminId(req);
    if (!adminId) {
      return res.status(401).json({ ok: false, message: "Unauthorized" });
    }

    const result = await pool.query(
      `
        UPDATE admin_accounts
        SET
          is_online = TRUE,
          last_activity_at = NOW(),
          updated_at = NOW()
        WHERE id = $1
        RETURNING id, is_online, last_activity_at, updated_at
      `,
      [adminId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ ok: false, message: "Admin not found" });
    }

    return res.status(200).json({
      ok: true,
      is_online: true,
      last_activity_at: result.rows[0].last_activity_at,
      updated_at: result.rows[0].updated_at,
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
    const adminId = getCurrentAdminId(req);
    if (!adminId) {
      return res.status(401).json({ ok: false, message: "Unauthorized" });
    }

    const result = await pool.query(
      `
        UPDATE admin_accounts
        SET
          is_online = FALSE,
          last_logout_at = NOW(),
          last_activity_at = NOW(),
          updated_at = NOW()
        WHERE id = $1
        RETURNING id, is_online, last_logout_at, updated_at
      `,
      [adminId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ ok: false, message: "Admin not found" });
    }

    return res.status(200).json({
      ok: true,
      is_online: false,
      last_logout_at: result.rows[0].last_logout_at,
      updated_at: result.rows[0].updated_at,
    });
  } catch (err) {
    console.error("setOffline error:", err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
};