"use strict";

const { pool } = require("../../includes/conn");

const MAX_ADDRESS_LEN = 255;
const MAX_CITY_LEN = 100;
const MAX_COUNTRY_LEN = 100;

/* =========================
   RESPONSE HELPERS
========================= */

function wantsJson(req) {
  return req.xhr || String(req.headers?.accept || "").includes("application/json");
}

function sendUnauthorized(req, res) {
  if (wantsJson(req)) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized",
    });
  }
  return res.redirect("/");
}

function sendBadRequest(req, res, message = "Invalid request") {
  if (wantsJson(req)) {
    return res.status(400).json({
      success: false,
      message,
    });
  }
  return res.status(400).send(message);
}

function sendForbidden(req, res, message = "Forbidden") {
  if (wantsJson(req)) {
    return res.status(403).json({
      success: false,
      message,
    });
  }
  return res.status(403).send(message);
}

function sendServerError(res, label, err) {
  console.error(`${label}:`, err);
  return res.status(500).json({
    success: false,
    message: "Server error",
  });
}

function emitIfPossible(req, eventName, payload) {
  try {
    req.app.get("io")?.emit(eventName, payload);
  } catch (err) {
    console.error(`Socket emit failed (${eventName}):`, err);
  }
}

/* =========================
   AUTH HELPERS
========================= */

function getAccountId(req) {
  const raw = req.session?.user?.id ?? req.session?.userId;
  const id = Number.parseInt(raw, 10);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

async function getAuthAccount(req) {
  const accountId = getAccountId(req);
  if (!accountId) return null;

  const { rows } = await pool.query(
    `
      SELECT
        id,
        user_id,
        email,
        address,
        city,
        country
      FROM customer_accounts
      WHERE id = $1
      LIMIT 1
    `,
    [accountId]
  );

  return rows[0] || null;
}

/* =========================
   SANITIZATION / VALIDATION
========================= */

function cleanText(value, maxLen) {
  if (value === undefined || value === null) return null;

  const text = String(value)
    .replace(/\u0000/g, "")
    .replace(/[\u0001-\u001f\u007f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, maxLen);

  return text.length ? text : null;
}

function validateLocation(address, city, country) {
  return (
    typeof address === "string" &&
    typeof city === "string" &&
    typeof country === "string" &&
    address.length > 0 &&
    city.length > 0 &&
    country.length > 0 &&
    address.length <= MAX_ADDRESS_LEN &&
    city.length <= MAX_CITY_LEN &&
    country.length <= MAX_COUNTRY_LEN
  );
}

function isValidId(value) {
  const n = Number.parseInt(value, 10);
  return Number.isSafeInteger(n) && n > 0;
}

function getCleanAddressPayload(req) {
  const address = cleanText(req.body?.address, MAX_ADDRESS_LEN);
  const city = cleanText(req.body?.city, MAX_CITY_LEN);
  const country = cleanText(req.body?.country, MAX_COUNTRY_LEN);

  if (!validateLocation(address, city, country)) {
    return null;
  }

  return { address, city, country };
}

/* =========================
   NORMALIZERS
========================= */

function normalizeSavedAddress(row) {
  if (!row) return null;

  return {
    id: row.id,
    user_id: row.user_id,
    email: row.email,
    address: row.address,
    city: row.city,
    country: row.country,
    is_default: Boolean(row.is_default),
    is_primary: false,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function normalizePrimaryAddress(account) {
  return {
    id: 0,
    user_id: account.user_id,
    email: account.email,
    address: account.address || null,
    city: account.city || null,
    country: account.country || null,
    is_default: true,
    is_primary: true,
  };
}

function buildAddressList(account, savedRows) {
  const saved = Array.isArray(savedRows)
    ? savedRows.map(normalizeSavedAddress).filter(Boolean)
    : [];

  return [normalizePrimaryAddress(account), ...saved];
}

async function fetchSavedAddresses(userId) {
  const { rows } = await pool.query(
    `
      SELECT
        id,
        user_id,
        email,
        address,
        city,
        country,
        is_default,
        created_at,
        updated_at
      FROM user_addresses
      WHERE user_id = $1
      ORDER BY is_default DESC, created_at DESC, id DESC
    `,
    [userId]
  );

  return rows.map(normalizeSavedAddress).filter(Boolean);
}

/* =========================
   CONTROLLERS
========================= */

exports.addressesPage = async (req, res) => {
  try {
    const account = await getAuthAccount(req);
    if (!account) return sendUnauthorized(req, res);

    const saved = await fetchSavedAddresses(account.user_id);
    const addresses = buildAddressList(account, saved);

    return res.render("customer/u/addresses", {
      user: account,
      addresses,
      csrfToken: typeof req.csrfToken === "function" ? req.csrfToken() : "",
    });
  } catch (err) {
    return sendServerError(res, "addressesPage", err);
  }
};

exports.getAddresses = async (req, res) => {
  try {
    if (!wantsJson(req)) return res.status(404).send("Not found");

    const account = await getAuthAccount(req);
    if (!account) return sendUnauthorized(req, res);

    const saved = await fetchSavedAddresses(account.user_id);
    const addresses = buildAddressList(account, saved);

    return res.json({
      success: true,
      data: addresses,
      total: addresses.length,
    });
  } catch (err) {
    console.error("getAddresses:", err);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

exports.updatePrimaryAddress = async (req, res) => {
  try {
    const account = await getAuthAccount(req);
    if (!account) return sendUnauthorized(req, res);

    const payload = getCleanAddressPayload(req);
    if (!payload) {
      return sendBadRequest(req, res, "Invalid address data");
    }

    const { rows } = await pool.query(
      `
        UPDATE customer_accounts
        SET address = $1,
            city = $2,
            country = $3
        WHERE id = $4
        RETURNING id, user_id, email, address, city, country
      `,
      [payload.address, payload.city, payload.country, account.id]
    );

    if (!rows[0]) {
      return sendBadRequest(req, res, "Update failed");
    }

    const updated = rows[0];

    emitIfPossible(req, "primaryAddressUpdated", {
      userId: updated.user_id,
      address: {
        id: 0,
        user_id: updated.user_id,
        email: updated.email,
        address: updated.address,
        city: updated.city,
        country: updated.country,
        is_primary: true,
        is_default: true,
      },
    });

    return res.json({
      success: true,
      message: "Permanent address updated",
      data: updated,
    });
  } catch (err) {
    return sendServerError(res, "updatePrimaryAddress", err);
  }
};

exports.addAddress = async (req, res) => {
  try {
    const account = await getAuthAccount(req);
    if (!account) return sendUnauthorized(req, res);

    const payload = getCleanAddressPayload(req);
    if (!payload) {
      return sendBadRequest(req, res, "Invalid address data");
    }

    const { rows } = await pool.query(
      `
        INSERT INTO user_addresses
          (user_id, email, address, city, country, is_default, created_at, updated_at)
        VALUES
          ($1, $2, $3, $4, $5, false, NOW(), NOW())
        RETURNING
          id, user_id, email, address, city, country, is_default, created_at, updated_at
      `,
      [account.user_id, account.email, payload.address, payload.city, payload.country]
    );

    const saved = normalizeSavedAddress(rows[0]);

    emitIfPossible(req, "addressAdded", {
      userId: account.user_id,
      address: saved,
    });

    return res.json({
      success: true,
      message: "Added successfully",
      data: saved,
    });
  } catch (err) {
    return sendServerError(res, "addAddress", err);
  }
};

exports.updateAddress = async (req, res) => {
  try {
    const account = await getAuthAccount(req);
    if (!account) return sendUnauthorized(req, res);

    const id = Number.parseInt(req.body?.id, 10);
    if (!isValidId(id)) {
      return sendBadRequest(req, res, "Invalid ID");
    }

    const payload = getCleanAddressPayload(req);
    if (!payload) {
      return sendBadRequest(req, res, "Invalid address data");
    }

    const { rows } = await pool.query(
      `
        UPDATE user_addresses
        SET address = $1,
            city = $2,
            country = $3,
            updated_at = NOW()
        WHERE id = $4
          AND user_id = $5
        RETURNING
          id, user_id, email, address, city, country, is_default, created_at, updated_at
      `,
      [payload.address, payload.city, payload.country, id, account.user_id]
    );

    if (!rows[0]) {
      return sendForbidden(req, res);
    }

    const updated = normalizeSavedAddress(rows[0]);

    emitIfPossible(req, "addressUpdated", {
      userId: account.user_id,
      address: updated,
    });

    return res.json({
      success: true,
      message: "Updated successfully",
      data: updated,
    });
  } catch (err) {
    return sendServerError(res, "updateAddress", err);
  }
};

exports.deleteAddress = async (req, res) => {
  try {
    const account = await getAuthAccount(req);
    if (!account) return sendUnauthorized(req, res);

    const id = Number.parseInt(req.body?.id, 10);
    if (!isValidId(id)) {
      return sendBadRequest(req, res, "Invalid ID");
    }

    const { rows } = await pool.query(
      `
        DELETE FROM user_addresses
        WHERE id = $1
          AND user_id = $2
        RETURNING id
      `,
      [id, account.user_id]
    );

    if (!rows[0]) {
      return sendForbidden(req, res);
    }

    emitIfPossible(req, "addressDeleted", {
      userId: account.user_id,
      id,
    });

    return res.json({
      success: true,
      message: "Deleted successfully",
      deletedId: id,
    });
  } catch (err) {
    return sendServerError(res, "deleteAddress", err);
  }
};

exports.setDefaultAddress = async (req, res) => {
  const client = await pool.connect();

  try {
    const account = await getAuthAccount(req);
    if (!account) return sendUnauthorized(req, res);

    const id = Number.parseInt(req.body?.id, 10);
    if (!isValidId(id)) {
      return sendBadRequest(req, res, "Invalid ID");
    }

    await client.query("BEGIN");

    await client.query(
      `
        UPDATE user_addresses
        SET is_default = false
        WHERE user_id = $1
      `,
      [account.user_id]
    );

    const { rows } = await client.query(
      `
        UPDATE user_addresses
        SET is_default = true,
            updated_at = NOW()
        WHERE id = $1
          AND user_id = $2
        RETURNING
          id, user_id, email, address, city, country, is_default, created_at, updated_at
      `,
      [id, account.user_id]
    );

    if (!rows[0]) {
      await client.query("ROLLBACK");
      return sendForbidden(req, res);
    }

    await client.query("COMMIT");

    const updated = normalizeSavedAddress(rows[0]);

    emitIfPossible(req, "addressDefaultChanged", {
      userId: account.user_id,
      address: updated,
    });

    return res.json({
      success: true,
      message: "Default updated",
      data: updated,
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    return sendServerError(res, "setDefaultAddress", err);
  } finally {
    client.release();
  }
};

exports.unpinAddress = async (req, res) => {
  const client = await pool.connect();

  try {
    const account = await getAuthAccount(req);
    if (!account) return sendUnauthorized(req, res);

    const id = Number.parseInt(req.body?.id, 10);
    if (!isValidId(id)) {
      return sendBadRequest(req, res, "Invalid ID");
    }

    await client.query("BEGIN");

    const { rows } = await client.query(
      `
        UPDATE user_addresses
        SET is_default = false,
            updated_at = NOW()
        WHERE id = $1
          AND user_id = $2
        RETURNING
          id, user_id, email, address, city, country, is_default, created_at, updated_at
      `,
      [id, account.user_id]
    );

    if (!rows[0]) {
      await client.query("ROLLBACK");
      return sendForbidden(req, res);
    }

    await client.query("COMMIT");

    const updated = normalizeSavedAddress(rows[0]);

    emitIfPossible(req, "addressUnpinned", {
      userId: account.user_id,
      address: updated,
    });

    return res.json({
      success: true,
      message: "Unpinned successfully",
      data: updated,
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    return sendServerError(res, "unpinAddress", err);
  } finally {
    client.release();
  }
};