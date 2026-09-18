"use strict";

const crypto = require("crypto");
const { pool } = require("../../includes/conn");

/**
 * Get the active logged-in user ID if present.
 * Supports request user and session fallback.
 */
const getCurrentUserId = (req) => {
  const id = req.user?.id ?? req.session?.userId ?? req.session?.user?.id ?? null;

  if (id === null || id === undefined || id === "") return null;
  return id;
};

/**
 * Return a safe positive integer or null.
 */
const parsePositiveInt = (value) => {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};

/**
 * Get or assign a persistent guest token.
 * - Logged-in users do not use guest tokens
 * - Prefers session token
 * - Falls back to x-guest-token header
 * - Generates a UUID only when needed
 */
const getGuestToken = (req) => {
  const userId = getCurrentUserId(req);
  if (userId) return null;

  if (typeof req.session?.guestToken === "string" && req.session.guestToken.trim()) {
    return req.session.guestToken.trim();
  }

  const headerToken = req.headers["x-guest-token"];
  if (typeof headerToken === "string") {
    const token = headerToken.trim();
    if (token && token.length <= 128) {
      if (req.session) req.session.guestToken = token;
      return token;
    }
  }

  const newToken = crypto.randomUUID();
  if (req.session) req.session.guestToken = newToken;
  return newToken;
};
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
 * Resolve the current wishlist identity.
 * Logged-in users use user_id, guests use guest_id.
 */
const getWishlistIdentity = (req) => {
  const userId = getCurrentUserId(req);

  if (userId) {
    return {
      isUser: true,
      column: "user_id",
      value: userId,
      guestToken: null,
    };
  }

  const guestToken = getGuestToken(req);
  return {
    isUser: false,
    column: "guest_id",
    value: guestToken,
    guestToken,
  };
};

/**
 * Normalize image path safely.
 */
const normalizeImage = (raw) => {
  if (!raw) return "/uploads/products/default.jpg";

  let img = String(raw).trim().replace(/\\/g, "/");

  if (img.startsWith("http://") || img.startsWith("https://") || img.startsWith("//")) {
    return img;
  }

  if (img.startsWith("/")) return img;

  return "/uploads/products/" + img;
};

/**
 * Emit wishlist update events safely.
 * Emits globally and to optional rooms if your app uses them.
 */
const emitWishlistUpdate = (io, payload) => {
  if (!io || typeof io.emit !== "function") return;

  const eventPayload = {
    variant_id: payload.variant_id,
    userId: payload.userId ?? null,
    guestId: payload.guestId ?? null,
    is_fav: !!payload.is_fav,
    action: payload.action ?? null,
  };

  try {
    io.emit("wishlistUpdated", eventPayload);

    if (payload.userId !== null && payload.userId !== undefined) {
      io.to(`user:${payload.userId}`).emit("wishlistUpdated", eventPayload);
    }

    if (payload.guestId) {
      io.to(`guest:${payload.guestId}`).emit("wishlistUpdated", eventPayload);
    }
  } catch (err) {
    console.warn("Wishlist emit failed:", err?.message || err);
  }
};

/**
 * Toggle wishlist item (add/remove).
 * Supports logged-in users and guests.
 */
exports.toggleWishlist = async (req, res, io = null) => {
  const identity = getWishlistIdentity(req);
  const userId = identity.isUser ? identity.value : null;
  const guestId = identity.isUser ? null : identity.guestToken;

  const rawVariantId = req.body?.variant_id ?? req.body?.variantId;
  const variantId = parsePositiveInt(rawVariantId);

  if (!variantId) {
    return res.status(400).json({
      success: false,
      error: "Missing or invalid variant_id",
    });
  }

  if (!userId && !guestId) {
    return res.status(400).json({
      success: false,
      error: "Missing user or guest identity",
    });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const existingQuery = `
      SELECT id, variant_id
      FROM wishlist
      WHERE variant_id = $1 AND ${identity.column} = $2
      LIMIT 1
      FOR UPDATE
    `;

    const existingRes = await client.query(existingQuery, [variantId, identity.value]);

    let action = "added";
    let is_fav = true;
    let rowData = null;

    if (existingRes.rows.length > 0) {
      const delRes = await client.query(
        `DELETE FROM wishlist
         WHERE id = $1
         RETURNING id, variant_id`,
        [existingRes.rows[0].id]
      );

      rowData = delRes.rows[0] ?? existingRes.rows[0];
      action = "removed";
      is_fav = false;
    } else {
      const insertQuery = `
        INSERT INTO wishlist (variant_id, ${identity.column})
        VALUES ($1, $2)
        RETURNING id, variant_id
      `;

      const insertRes = await client.query(insertQuery, [variantId, identity.value]);
      rowData = insertRes.rows[0] ?? null;
      action = "added";
      is_fav = true;
    }

    await client.query("COMMIT");

    emitWishlistUpdate(io, {
      variant_id: variantId,
      userId,
      guestId,
      is_fav,
      action,
    });

    return res.json({
      success: true,
      action,
      is_fav,
      guestId: guestId ?? null,
      data: rowData
        ? {
            id: rowData.id,
            variant_id: rowData.variant_id,
          }
        : null,
    });
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch (_) {}

    console.error("WishlistToggleError:", err?.stack || err);
    return res.status(500).json({
      success: false,
      error: "Database error",
    });
  } finally {
    client.release();
  }
};

/**
 * Get all wishlist variant IDs for the current user or guest.
 */
exports.getWishlistIds = async (req) => {
  const identity = getWishlistIdentity(req);

  if (!identity.value) return [];

  try {
    const result = await pool.query(
      `SELECT variant_id
       FROM wishlist
       WHERE ${identity.column} = $1
       ORDER BY id DESC`,
      [identity.value]
    );

    return (result.rows || [])
      .map((row) => Number(row.variant_id))
      .filter((v) => Number.isSafeInteger(v) && v > 0);
  } catch (err) {
    console.error("WishlistGetIdsError:", err?.stack || err);
    return [];
  }
};

/**
 * Get full wishlist data for the current user or guest.
 */
exports.getWishlist = async (req, res) => {
  const identity = getWishlistIdentity(req);

  if (!identity.value) {
    return res.status(400).json({
      success: false,
      error: "Missing user or guest identity",
    });
  }

  try {
    const query = `
      SELECT 
        w.id AS wishlist_id,
        w.variant_id,
        pv.id AS pv_id,
        pv.product_id AS product_id,
        pv.name AS variant_name,
        pv.sku AS sku,
        p.brand AS brand,
        CASE 
  WHEN vm.filename IS NOT NULL THEN CONCAT('/uploads/variants/', vm.filename)
  ELSE NULL
END AS image
      FROM wishlist w
      LEFT JOIN product_variants pv
        ON pv.id = w.variant_id
      LEFT JOIN products p
        ON p.id = pv.product_id
      LEFT JOIN LATERAL (
        SELECT filename
        FROM variant_media
        WHERE variant_id = pv.id
        ORDER BY id ASC
        LIMIT 1
      ) vm ON true

      WHERE w.${identity.column} = $1
      ORDER BY w.id DESC
    `;

    const result = await pool.query(query, [identity.value]);
    const rows = result.rows || [];

    const items = rows.map((row) => ({
      wishlist_id: row.wishlist_id,
      variant_id: Number(row.variant_id),
      product_id: row.product_id ? Number(row.product_id) : null,
      name: row.variant_name ?? null,
      brand: row.brand ?? null,
      sku: row.sku ?? null,
      variant_image: normalizeImage(row.vm_image)
    }));

    return res.json({
      success: true,
      data: items.map((item) => item.variant_id),
      items,
      total: items.length,
      guestId: identity.isUser ? null : identity.guestToken,
    });
  } catch (err) {
    console.error("WishlistGetError:", err?.stack || err);
    return res.status(500).json({
      success: false,
      error: "Database error",
    });
  }
};

/**
 * Merge guest wishlist into a logged-in user after login/signup.
 * Keeps user wishlist clean and removes guest rows after merge.
 */
exports.assignGuestWishlistToUser = async (userId, guestToken) => {
  if (!userId || !guestToken) return;

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const result = await client.query(
      `
      UPDATE wishlist
      SET user_id = $1,
          updated_at = NOW()
      WHERE TRIM(guest_id) = TRIM($2)
        AND (user_id IS NULL OR user_id <> $1)
      RETURNING id, user_id, guest_id
      `,
      [userId, guestToken]
    );

    console.log("Wishlist updated rows:", result.rowCount);
    console.log("Updated data:", result.rows);

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Wishlist merge error:", err);
  } finally {
    client.release();
  }
};