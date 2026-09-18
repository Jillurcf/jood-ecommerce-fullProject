
// ✔ Verifies Stripe is real
// ✔ Finds matching order
// ✔ Confirms payment success/failure
// ✔ Updates order status
// ✔ Reduces stock only when paid


"use strict";

const { pool } = require("../includes/conn");
const Stripe = require("stripe");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2023-08-16",
});

function jsonError(res, message, code = "WEBHOOK_ERROR", statusCode = 400) {
  return res.status(statusCode).json({ success: false, message, error_code: code });
}

function normalizeAppUrl() {
  return (process.env.APP_URL || "http://localhost:4000").replace(/\/+$/, "");
}

async function findStripeOrder(client, stripeSessionId, stripePaymentIntentId, metadataOrderId) {
  const query = `
    SELECT
      o.id AS order_id,
      o.order_number,
      o.order_status,
      o.payment_status,
      o.user_id,
      o.tracking_id,
      p.id AS payment_id,
      p.status AS payment_record_status,
      COALESCE(p.gateway_response, '{}'::jsonb) AS gateway_response
    FROM orders o
    JOIN order_payments p ON p.order_id = o.id
    WHERE (
      (COALESCE(p.gateway_response->>'stripe_session_id', '') = $1)
      OR (COALESCE(p.gateway_response->>'stripe_payment_intent_id', '') = $2)
      OR ($3 IS NOT NULL AND o.id::text = $3)
    )
    LIMIT 1
  `;
  const values = [stripeSessionId || "", stripePaymentIntentId || "", metadataOrderId || null];
  const result = await client.query(query, values);
  return result.rows[0] || null;
}

async function reduceStockForOrder(client, orderId) {
  const items = await client.query(
    `
      SELECT variant_id, quantity
      FROM order_items
      WHERE order_id = $1
    `,
    [orderId]
  );

  for (const row of items.rows) {
    const update = await client.query(
      `
        UPDATE product_variants
        SET stock = stock - $1
        WHERE id = $2
          AND stock >= $1
        RETURNING id
      `,
      [row.quantity, row.variant_id]
    );

    if (!update.rows.length) {
      throw new Error(
        `Stock was not sufficient for variant ${row.variant_id} when finalizing Stripe payment.`
      );
    }
  }
}

exports.handleStripeWebhook = async (req, res) => {
  const sig = req.headers["stripe-signature"];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error("Stripe webhook secret is not configured.");
    return jsonError(res, "Stripe webhook secret is not configured.", "WEBHOOK_SECRET_MISSING", 500);
  }

  if (!sig) {
    return jsonError(res, "Missing Stripe signature header.", "WEBHOOK_SIGNATURE_MISSING", 400);
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error("Stripe webhook signature verification failed:", err.message);
    return jsonError(res, "Stripe webhook verification failed.", "WEBHOOK_VERIFICATION_FAILED", 400);
  }

  const eventType = event.type;
  const eventObject = event.data?.object || {};
  const stripeSessionId = eventObject.id || null;
  const stripePaymentIntentId = eventObject.payment_intent || eventObject.id || null;
  const metadataOrderId = eventObject.metadata?.order_id || null;

  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");

    const order = await findStripeOrder(
      client,
      eventType === "checkout.session.completed" ? eventObject.id : null,
      eventType === "payment_intent.succeeded" || eventType === "payment_intent.payment_failed"
        ? eventObject.id
        : null,
      metadataOrderId
    );

    if (!order) {
      await client.query("COMMIT");
      console.warn("Stripe webhook received for unknown order or payment.", {
        type: eventType,
        sessionId: stripeSessionId,
        paymentIntentId: stripePaymentIntentId,
        metadataOrderId,
      });
      return res.json({ received: true });
    }

    const currentResponse = order.gateway_response || {};

    if (eventType === "checkout.session.completed") {
      const updateFields = {
        stripe_session_id: eventObject.id,
        stripe_payment_intent_id: eventObject.payment_intent || currentResponse.stripe_payment_intent_id || null,
        last_webhook_event: eventType,
        last_webhook_received_at: new Date().toISOString(),
      };

      await client.query(
        `
          UPDATE order_payments
          SET gateway_response = COALESCE(gateway_response, '{}'::jsonb) || $1::jsonb,
              updated_at = NOW()
          WHERE id = $2
        `,
        [JSON.stringify(updateFields), order.payment_id]
      );

      await client.query("COMMIT");
      return res.json({ received: true });
    }

    if (eventType === "payment_intent.succeeded") {
      if (order.payment_status === "paid" && order.order_status === "confirmed") {
        await client.query("COMMIT");
        return res.json({ received: true });
      }

      await reduceStockForOrder(client, order.order_id);

      const updateFields = {
        stripe_payment_intent_id: eventObject.id,
        stripe_session_id: eventObject.metadata?.stripe_session_id || currentResponse.stripe_session_id || null,
        payment_status: "paid",
        order_status: "confirmed",
        stock_reduced: true,
        last_webhook_event: eventType,
        last_webhook_received_at: new Date().toISOString(),
      };

      await client.query(
        `
          UPDATE orders
          SET payment_status = 'paid',
              order_status = 'confirmed',
              updated_at = NOW()
          WHERE id = $1
        `,
        [order.order_id]
      );

      await client.query(
        `
          UPDATE order_payments
          SET status = 'paid',
              gateway_response = COALESCE(gateway_response, '{}'::jsonb) || $1::jsonb,
              updated_at = NOW()
          WHERE id = $2
        `,
        [JSON.stringify(updateFields), order.payment_id]
      );

      await client.query("COMMIT");
      return res.json({ received: true });
    }

    if (eventType === "payment_intent.payment_failed") {
      if (order.payment_status === "failed" && order.order_status === "payment_failed") {
        await client.query("COMMIT");
        return res.json({ received: true });
      }

      const updateFields = {
        stripe_payment_intent_id: eventObject.id,
        stripe_session_id: eventObject.metadata?.stripe_session_id || currentResponse.stripe_session_id || null,
        payment_status: "failed",
        order_status: "payment_failed",
        last_webhook_event: eventType,
        last_webhook_received_at: new Date().toISOString(),
      };

      await client.query(
        `
          UPDATE orders
          SET payment_status = 'failed',
              order_status = 'payment_failed',
              updated_at = NOW()
          WHERE id = $1
        `,
        [order.order_id]
      );

      await client.query(
        `
          UPDATE order_payments
          SET status = 'failed',
              gateway_response = COALESCE(gateway_response, '{}'::jsonb) || $1::jsonb,
              updated_at = NOW()
          WHERE id = $2
        `,
        [JSON.stringify(updateFields), order.payment_id]
      );

      await client.query("COMMIT");
      return res.json({ received: true });
    }

    await client.query("COMMIT");
    return res.json({ received: true });
  } catch (err) {
    if (client) {
      await client.query("ROLLBACK").catch(() => {});
    }
    console.error("Stripe webhook processing error:", err && err.stack ? err.stack : err);
    return jsonError(res, "Stripe webhook processing failed.", "WEBHOOK_PROCESSING_FAILED", 500);
  } finally {
    if (client) client.release();
  }
};
