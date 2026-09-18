"use strict";

const { pool } = require("../../includes/conn");

// ======================================================
// HELPERS
// ======================================================

function getAuthUser(req) {
  const userId = req.session?.user?.id || req.session?.userId;

  if (!userId || Number.isNaN(Number(userId))) {
    return null;
  }

  return {
    id: Number(userId)
  };
}

function validateOrderId(id) {
  const orderId = Number(id);

  if (!Number.isInteger(orderId) || orderId <= 0) {
    return null;
  }

  return orderId;
}

function safeJsonParse(value, fallback = []) {
  try {
    if (!value) return fallback;

    if (Array.isArray(value)) {
      return value;
    }

    if (typeof value === "object") {
      return value;
    }

    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeOrderProducts(order = {}) {
  const sources = [
    order.items,
    order.products,
    order.order_items,
    order.items_json,
    order.products_json,
    order.order_items_json,
    order.product_details
  ];

  for (const source of sources) {
    const parsed = safeJsonParse(source, null);

    if (Array.isArray(parsed)) {
      return parsed;
    }
  }

  return [];
}

function normalizeStatus(status) {
  return String(status || "pending")
    .trim()
    .toLowerCase();
}

function canCancelOrder(status) {
  return [
    "pending",
    "confirmed",
    "processing",
    "ongoing"
  ].includes(normalizeStatus(status));
}

// ======================================================
// GET CUSTOMER ORDERS
// ======================================================

exports.getOrders = async (req, res) => {
  let client;

  try {
    const user = getAuthUser(req);

    if (!user) {
      return res.redirect("/customer/sign/in");
    }

    client = await pool.connect();

    const ordersResult = await client.query(
      `
      SELECT *
      FROM orders
      WHERE user_id = $1
      ORDER BY id DESC
      `,
      [user.id]
    );

    return res.render("customer/u/orders", {
      title: "My Orders",
      orders: ordersResult.rows || [],
      user: req.session?.user || null,
      querySection: req.query.section || "all",
      csrfToken: req.csrfToken ? req.csrfToken() : ""
    });
  } catch (error) {
    console.error("getOrders:", error);

    return res.status(500).render("errors/500", {
      message: "Unable to load orders."
    });
  } finally {
    if (client) client.release();
  }
};

// ======================================================
// GET ORDER DETAILS
// ======================================================

exports.getOrderById = async (req, res) => {
  let client;

  try {
    const user = getAuthUser(req);

    if (!user) {
      return res.redirect("/customer/sign/in");
    }

    const orderId = validateOrderId(req.params.id);

    if (!orderId) {
      return res.redirect("/customer/u/orders");
    }

    client = await pool.connect();

    const result = await client.query(
      `
      SELECT *
      FROM orders
      WHERE id = $1
      AND user_id = $2
      LIMIT 1
      `,
      [orderId, user.id]
    );

    if (!result.rows.length) {
      return res.redirect("/customer/u/orders");
    }

    const order = result.rows[0];

    return res.render("customer/u/order-details", {
      title: `Order #${order.id}`,
      order,
      products: normalizeOrderProducts(order),
      user: req.session?.user || null,
      csrfToken: req.csrfToken ? req.csrfToken() : ""
    });
  } catch (error) {
    console.error("getOrderById:", error);

    return res.status(500).render("errors/500", {
      message: "Unable to load order details."
    });
  } finally {
    if (client) client.release();
  }
};

// ======================================================
// CANCEL ORDER
// ======================================================

exports.cancelOrder = async (req, res) => {
  let client;

  try {
    const user = getAuthUser(req);

    if (!user) {
      return res.redirect("/customer/sign/in");
    }

    const orderId = validateOrderId(req.params.id);

    if (!orderId) {
      return res.redirect("/customer/u/orders");
    }

    client = await pool.connect();

    await client.query("BEGIN");

    const orderResult = await client.query(
      `
      SELECT
        id,
        user_id,
        status
      FROM orders
      WHERE id = $1
      AND user_id = $2
      LIMIT 1
      `,
      [orderId, user.id]
    );

    if (!orderResult.rows.length) {
      await client.query("ROLLBACK");
      return res.redirect("/customer/u/orders");
    }

    const order = orderResult.rows[0];

    if (!canCancelOrder(order.status)) {
      await client.query("ROLLBACK");
      return res.redirect(`/customer/u/orders/${orderId}`);
    }

    await client.query(
      `
      UPDATE orders
      SET
        status = 'cancelled',
        updated_at = NOW(),
        cancelled_at = NOW()
      WHERE id = $1
      AND user_id = $2
      `,
      [orderId, user.id]
    );

    await client.query("COMMIT");

    return res.redirect(`/customer/u/orders/${orderId}`);
  } catch (error) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch {}
    }

    console.error("cancelOrder:", error);

    return res.status(500).render("errors/500", {
      message: "Unable to cancel order."
    });
  } finally {
    if (client) client.release();
  }
};

// ======================================================
// STATUS OPTIONS API
// ======================================================

exports.getOrderStatusOptions = async (req, res) => {
  try {
    const user = getAuthUser(req);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized"
      });
    }

    return res.json({
      success: true,
      data: [
        "pending",
        "confirmed",
        "processing",
        "ongoing",
        "completed",
        "cancelled",
        "refunded"
      ]
    });
  } catch (error) {
    console.error("getOrderStatusOptions:", error);

    return res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
};