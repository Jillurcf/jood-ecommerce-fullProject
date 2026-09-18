import Stripe from "stripe";
import { env } from "../../config/index.js";
import * as service from "./checkout.service.js";
import { emitFromApp } from "./checkout.events.js";
let _stripe = null;
function getStripe() {
  if (_stripe) return _stripe;
  if (!env.STRIPE_SECRET_KEY) return null;
  _stripe = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: "2025-05-27.basil" });
  return _stripe;
}
const processedEvents = /* @__PURE__ */ new Set();
const MAX_PROCESSED_EVENTS = 1e4;
async function handleStripeWebhook(req, res) {
  const stripe = getStripe();
  if (!stripe) {
    console.error("[Stripe Webhook] Stripe not configured");
    return res.status(500).json({ error: "Stripe not configured" });
  }
  const sig = req.headers["stripe-signature"];
  if (!sig) {
    return res.status(400).json({ error: "Missing stripe-signature header" });
  }
  if (!env.STRIPE_WEBHOOK_SECRET) {
    console.error("[Stripe Webhook] STRIPE_WEBHOOK_SECRET not configured");
    return res.status(500).json({ error: "Webhook secret not configured" });
  }
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("[Stripe Webhook] Signature verification failed:", err);
    return res.status(400).json({ error: "Invalid signature" });
  }
  if (processedEvents.has(event.id)) {
    return res.status(200).json({ received: true });
  }
  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        await service.handleCheckoutSessionCompleted(session);
        break;
      }
      case "payment_intent.succeeded": {
        const paymentIntent = event.data.object;
        await service.handlePaymentIntentSucceeded(paymentIntent);
        const orderId = paymentIntent.metadata?.order_id;
        if (orderId) {
          emitFromApp(req.app, "orderTrackingUpdated", {
            order_id: Number(orderId),
            order_status: "confirmed",
            payment_status: "paid"
          });
        }
        break;
      }
      case "payment_intent.payment_failed": {
        const paymentIntent = event.data.object;
        await service.handlePaymentIntentFailed(paymentIntent);
        const orderId = paymentIntent.metadata?.order_id;
        if (orderId) {
          emitFromApp(req.app, "orderTrackingUpdated", {
            order_id: Number(orderId),
            order_status: "payment_failed",
            payment_status: "failed"
          });
        }
        break;
      }
      default:
        break;
    }
    processedEvents.add(event.id);
    if (processedEvents.size > MAX_PROCESSED_EVENTS) {
      const toDelete = Array.from(processedEvents).slice(0, 1e3);
      for (const id of toDelete) processedEvents.delete(id);
    }
    return res.status(200).json({ received: true });
  } catch (err) {
    console.error(`[Stripe Webhook] Error processing ${event.type}:`, err);
    return res.status(200).json({ received: true, error: "Processing error" });
  }
}
export {
  handleStripeWebhook
};
