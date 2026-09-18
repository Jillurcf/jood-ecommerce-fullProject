import { sendSuccess } from "../../common/response.js";
import { createAppError } from "../../common/errors.js";
import * as service from "./checkout.service.js";
import { emitOrderCreated, emitOrderTrackingViewed, emitCartUpdated } from "./checkout.events.js";
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
const getCheckoutData = asyncHandler(async (req, res) => {
  const identity = service.resolveCheckoutIdentity(req);
  const data = await service.getCheckoutData(identity);
  sendSuccess(res, data);
});
const placeOrder = asyncHandler(async (req, res) => {
  const identity = service.resolveCheckoutIdentity(req);
  const { payment_method, billing_address, shipping_address, notes, save_billing, save_shipping, customer_name, phone } = req.body ?? {};
  const method = String(payment_method || "").toLowerCase();
  if (method !== "cod") {
    if (method === "card") {
      throw createAppError(422, "STRIPE_CHECKOUT_REQUIRED", "Card payments must use the Stripe checkout button");
    }
    throw createAppError(422, "VALIDATION_ERROR", "Invalid payment method. Only COD is accepted on this endpoint");
  }
  const result = await service.placeCodOrder(identity, {
    billing_address,
    shipping_address,
    notes,
    save_billing,
    save_shipping,
    customer_name,
    phone
  });
  emitOrderCreated({
    order_number: result.order_number,
    userId: identity.userId,
    grand_total: result.grand_total,
    currency: result.currency
  });
  emitCartUpdated({ userId: identity.userId, guestToken: identity.guestToken });
  sendSuccess(res, result, "Order placed successfully", 201);
});
const createPaymentSession = asyncHandler(async (req, res) => {
  const identity = service.resolveCheckoutIdentity(req);
  const { payment_method, gateway_provider, billing_address, shipping_address, notes, save_billing, save_shipping, customer_name, phone } = req.body ?? {};
  const method = String(payment_method || "").toLowerCase();
  if (method !== "card") {
    throw createAppError(422, "VALIDATION_ERROR", "This endpoint only accepts card payments");
  }
  const gateway = String(gateway_provider || "").toLowerCase();
  if (gateway !== "stripe") {
    throw createAppError(422, "VALIDATION_ERROR", "Only Stripe gateway is supported");
  }
  const result = await service.createStripeCheckoutSession(identity, {
    billing_address,
    shipping_address,
    notes,
    save_billing,
    save_shipping,
    gateway_provider: gateway,
    customer_name,
    phone
  });
  sendSuccess(res, result, "Stripe checkout session created");
});
const getOrderSuccess = asyncHandler(async (req, res) => {
  const identity = service.resolveCheckoutIdentity(req);
  const orderNumber = String(req.params.orderNumber || "");
  if (!orderNumber) throw createAppError(422, "VALIDATION_ERROR", "Order number is required");
  const order = await service.getOrderSuccess(orderNumber, identity.userId);
  sendSuccess(res, order);
});
const getOrderTracking = asyncHandler(async (req, res) => {
  const identity = service.resolveCheckoutIdentity(req);
  const orderNumber = String(req.params.orderNumber || "");
  if (!orderNumber) throw createAppError(422, "VALIDATION_ERROR", "Order number is required");
  const data = await service.getOrderTracking(orderNumber, identity.userId);
  emitOrderTrackingViewed({
    order_number: orderNumber,
    user_id: identity.userId,
    viewed_at: (/* @__PURE__ */ new Date()).toISOString()
  });
  sendSuccess(res, data);
});
const getSavedPaymentMethods = asyncHandler(async (req, res) => {
  const identity = service.resolveCheckoutIdentity(req);
  const methods = await service.getSavedPaymentMethods(identity.userId);
  sendSuccess(res, methods);
});
const getSavedAddresses = asyncHandler(async (req, res) => {
  const identity = service.resolveCheckoutIdentity(req);
  const addresses = await service.getSavedAddresses(identity.userId);
  sendSuccess(res, addresses);
});
export {
  createPaymentSession,
  getCheckoutData,
  getOrderSuccess,
  getOrderTracking,
  getSavedAddresses,
  getSavedPaymentMethods,
  placeOrder
};
