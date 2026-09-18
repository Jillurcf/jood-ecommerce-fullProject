"use strict";

const { pool } = require("../../includes/conn");

/**
 * Admin self-account controller
 * Based on admin_accounts table from sign.controller.js
 * Safe editable fields only
 */

const ALLOWED_FIELDS = new Set([
  "full_name",
  "phone",
]);

function sanitizeText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function normalizePhone(value) {
  const clean = String(value || "").trim();
  return clean || null;
}

function getCurrentAdmin(req) {
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
        session_version,
        created_by,
        created_at,
        updated_at
      FROM admin_accounts
      WHERE id = $1
      LIMIT 1
    `,
    [id]
  );

  return result.rows[0] || null;
}

async function updateAdminField(adminId, field, value) {
  const query = `
    UPDATE admin_accounts
    SET ${field} = $1,
        updated_at = NOW()
    WHERE id = $2
    RETURNING
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
      session_version,
      created_by,
      created_at,
      updated_at
  `;

  const result = await pool.query(query, [value, adminId]);
  return result.rows[0] || null;
}

/**
 * GET /admin/a/account
 */
exports.getAccountPage = async (req, res, next) => {
  try {
    const adminSession = getCurrentAdmin(req);

    if (!adminSession?.id) {
      return res.redirect("/admin/a/sign/in");
    }

    const admin = await findAdminById(adminSession.id);

    if (!admin) {
      return res.redirect("/admin/a/sign/in");
    }

    // Example stats — replace with real queries later if needed
    const stats = {
      orders: 0,
      wishlist: 0,
      saved: 0,
    };

    return res.render("admin/a/account", {
      admin,
      stats,
      activePage: "account",
    });
  } catch (err) {
    return next(err);
  }
};

/**
 * GET /admin/a/account/me
 */
exports.getAccount = async (req, res, next) => {
  try {
    const adminSession = getCurrentAdmin(req);

    if (!adminSession?.id) {
      return res.status(401).json({
        ok: false,
        message: "Unauthorized",
      });
    }

    const admin = await findAdminById(adminSession.id);

    if (!admin) {
      return res.status(404).json({
        ok: false,
        message: "Admin not found",
      });
    }

    return res.json({
      ok: true,
      admin,
    });
  } catch (err) {
    return next(err);
  }
};

/**
 * PATCH /admin/a/account/update
 * Body:
 *  - field: "full_name" | "phone"
 *  - value: string
 */
exports.updateField = async (req, res, next) => {
  try {
    const adminSession = getCurrentAdmin(req);

    if (!adminSession?.id) {
      return res.status(401).json({
        ok: false,
        message: "Unauthorized",
      });
    }

    const { field, value } = req.body || {};

    if (!field || typeof value === "undefined") {
      return res.status(400).json({
        ok: false,
        message: "Invalid request",
      });
    }

    if (!ALLOWED_FIELDS.has(field)) {
      return res.status(403).json({
        ok: false,
        message: "Field not allowed to update",
      });
    }

    let cleanValue = String(value).trim();

    if (field === "full_name") {
      cleanValue = sanitizeText(cleanValue);

      if (cleanValue.length < 2) {
        return res.status(400).json({
          ok: false,
          message: "Full name must be at least 2 characters",
        });
      }
    }

    if (field === "phone") {
      cleanValue = normalizePhone(cleanValue);
    }

    const updated = await updateAdminField(adminSession.id, field, cleanValue);

    if (!updated) {
      return res.status(404).json({
        ok: false,
        message: "Admin not found",
      });
    }

    // Keep session in sync
    if (req.session?.admin) {
      req.session.admin[field] = cleanValue;
    }

    if (field === "full_name" && req.session) {
      req.session.adminName = cleanValue;
    }

    if (field === "phone" && req.session) {
      req.session.adminPhone = cleanValue;
    }

    return res.json({
      ok: true,
      message: "Updated successfully",
      data: updated,
    });
  } catch (err) {
    console.error("Admin account update error:", err);
    return res.status(500).json({
      ok: false,
      message: "Server error",
    });
  }
};