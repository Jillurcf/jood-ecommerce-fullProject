import crypto from "crypto";
import Stripe from "stripe";
import { prisma } from "../../lib/prisma.js";
import { Prisma } from "@prisma/client";
import { computePrices } from "../catalog/pricing.util.js";
import { env } from "../../config/index.js";
import {
  generateOrderNumber,
  generateTrackingId,
  generatePaymentReference,
  CURRENCY,
  sanitize,
  sanitizePhone,
  maskCardDisplay
} from "./checkout.config.js";
import { createAppError } from "../../common/errors.js";
const toNum = (v, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};
let _stripe = null;
function getStripe() {
  if (_stripe) return _stripe;
  if (!env.STRIPE_SECRET_KEY) return null;
  _stripe = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: "2025-05-27.basil" });
  return _stripe;
}
function getClientIP(req) {
  const fwd = req.headers?.["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.trim()) return fwd.split(",")[0].trim();
  if (Array.isArray(fwd) && fwd.length) return String(fwd[0]).trim();
  return String(req.ip || "");
}
function validateAddress(addr, label) {
  if (!addr) throw createAppError(422, "VALIDATION_ERROR", `${label} address is required`);
  if (!sanitize(addr.country)) throw createAppError(422, "VALIDATION_ERROR", `${label} country is required`);
  if (!sanitize(addr.emirate)) throw createAppError(422, "VALIDATION_ERROR", `${label} emirate is required`);
  if (!sanitize(addr.city)) throw createAppError(422, "VALIDATION_ERROR", `${label} city is required`);
  if (!sanitize(addr.address_line1)) throw createAppError(422, "VALIDATION_ERROR", `${label} address line 1 is required`);
}
function buildOrderAddress(addr, ip) {
  if (!addr) return {};
  const hasLat = addr.latitude != null && isFinite(Number(addr.latitude));
  const hasLng = addr.longitude != null && isFinite(Number(addr.longitude));
  const locationSource = hasLat && hasLng ? "gps" : sanitize(addr.location_source) || "manual";
  const result = {
    country: sanitize(addr.country),
    emirate: sanitize(addr.emirate),
    city: sanitize(addr.city),
    address_line1: sanitize(addr.address_line1),
    address_line2: sanitize(addr.address_line2),
    landmark: sanitize(addr.landmark),
    postal_code: sanitize(addr.postal_code),
    latitude: addr.latitude ?? null,
    longitude: addr.longitude ?? null,
    google_place_id: sanitize(addr.google_place_id),
    formatted_address: sanitize(addr.formatted_address),
    location_label: sanitize(addr.location_label),
    location_source: locationSource
  };
  if (ip) result.ip = ip;
  return result;
}
function resolveCheckoutIdentity(req) {
  if (!req.user || req.user.type !== "customer") {
    throw createAppError(401, "UNAUTHORIZED", "Authentication required");
  }
  const row = req.user.row;
  const email = row?.email;
  if (!email) throw createAppError(401, "UNAUTHORIZED", "Customer email not found");
  const id = req.cartIdentity;
  return {
    userId: req.user.id,
    email: email.toLowerCase(),
    guestToken: id?.guestToken ?? null,
    customerName: row?.full_name ?? "",
    phone: row?.phone ?? null
  };
}
async function claimGuestCartRows(tx, email, guestToken) {
  if (!guestToken) return;
  await tx.$executeRaw`
    UPDATE cart SET user_id = ${email}, updated_at = NOW()
    WHERE user_id = '' AND guest_token = ${guestToken} AND status = 'active'
  `;
}
async function fetchActiveCartRows(tx, identity) {
  const rows = await tx.cart.findMany({
    where: {
      status: "active",
      OR: [
        { userId: identity.email },
        ...identity.guestToken ? [{ guestToken: identity.guestToken }] : []
      ]
    },
    include: {
      variant: {
        include: {
          product: { select: { name: true, slug: true, mainImage: true } },
          media: { orderBy: { id: "asc" }, take: 1 }
        }
      }
    },
    orderBy: { createdAt: "asc" }
  });
  return rows;
}
async function lockCartRows(tx, identity) {
  const cartRows = await tx.$queryRaw`
    SELECT id FROM cart
    WHERE status = 'active' AND (
      user_id = ${identity.email}
      ${identity.guestToken ? Prisma.sql`OR guest_token = ${identity.guestToken}` : Prisma.empty}
    )
    ORDER BY created_at ASC
    FOR UPDATE
  `;
  if (!cartRows.length) {
    throw createAppError(422, "EMPTY_CART", "Cart is empty");
  }
  const cartIds = cartRows.map((r) => r.id);
  const rows = await tx.cart.findMany({
    where: { id: { in: cartIds } },
    include: {
      variant: {
        include: {
          product: { select: { name: true, slug: true, mainImage: true } },
          media: { orderBy: { id: "asc" }, take: 1 }
        }
      }
    },
    orderBy: { createdAt: "asc" }
  });
  return rows;
}
async function lockVariant(tx, variantId) {
  const rows = await tx.$queryRaw`
    SELECT id, price, stock, discount_type, discount_value, vat_rate, vat_included, name, sku
    FROM product_variants WHERE id = ${variantId} LIMIT 1 FOR UPDATE
  `;
  const row = rows[0];
  if (!row) throw createAppError(404, "VARIANT_NOT_FOUND", "Variant not found");
  return {
    id: row.id,
    price: toNum(row.price),
    stock: Number(row.stock || 0),
    discountType: row.discount_type,
    discountValue: toNum(row.discount_value),
    vatRate: toNum(row.vat_rate, 5),
    vatIncluded: row.vat_included ?? true,
    name: row.name,
    sku: row.sku
  };
}
async function conditionalDecrementStock(tx, variantId, quantity) {
  const result = await tx.$executeRaw`
    UPDATE product_variants SET stock = stock - ${quantity}, updated_at = NOW()
    WHERE id = ${variantId} AND stock >= ${quantity}
  `;
  if (Number(result) === 0) {
    throw createAppError(409, "INSUFFICIENT_STOCK", "Insufficient stock");
  }
}
async function getOrCreateTrackingId(tx, identity, generatedId) {
  const rows = await tx.cart.findMany({
    where: {
      status: "active",
      OR: [
        { userId: identity.email },
        ...identity.guestToken ? [{ guestToken: identity.guestToken }] : []
      ]
    },
    select: { id: true, trackingId: true },
    orderBy: { updatedAt: "desc" }
  });
  if (!rows.length) return { trackingId: generatedId };
  const trackingId = rows[0].trackingId || generatedId;
  const distinct = new Set(rows.map((r) => r.trackingId));
  if (distinct.size > 1) {
    const idsToNormalize = rows.filter((r) => r.trackingId !== trackingId).map((r) => r.id);
    if (idsToNormalize.length) {
      await tx.cart.updateMany({
        where: { id: { in: idsToNormalize } },
        data: { trackingId, updatedAt: /* @__PURE__ */ new Date() }
      });
    }
  }
  return { trackingId };
}
function encryptCardNumber(num) {
  if (!num) return null;
  const key = env.CARD_ENCRYPTION_KEY;
  if (!key) return null;
  try {
    let keyBuf;
    if (/^[0-9a-fA-F]{64}$/.test(key)) keyBuf = Buffer.from(key, "hex");
    else if (/^[A-Za-z0-9+/]{44}==$/.test(key) || /^[A-Za-z0-9+/]{43}=$/.test(key)) keyBuf = Buffer.from(key, "base64");
    else {
      const strBuf = Buffer.from(key, "utf8");
      keyBuf = strBuf.length === 32 ? strBuf : strBuf.length < 32 ? Buffer.concat([strBuf, Buffer.alloc(32 - strBuf.length)]) : strBuf.slice(0, 32);
    }
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", keyBuf, iv);
    const enc = Buffer.concat([cipher.update(String(num), "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `v1:${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
  } catch (err) {
    console.error("Card encryption failed:", err);
    return null;
  }
}
function cardFingerprint(num, provider, cardholder, expiry) {
  const source = num ? String(num) : `${provider}:${cardholder}:${expiry}`;
  return crypto.createHash("sha256").update(source).digest("hex");
}
async function savePaymentMethodForLater(tx, userId, addr) {
  const cardNumber = addr && "card_number" in addr ? addr.card_number : void 0;
  if (cardNumber == null || String(cardNumber) === "") return null;
  const cardholder = addr && "cardholder_name" in addr ? sanitize(addr.cardholder_name) : "";
  const expiryMonth = addr && "expiry_month" in addr ? sanitize(addr.expiry_month) : "";
  const expiryYear = addr && "expiry_year" in addr ? sanitize(addr.expiry_year) : "";
  const brand = addr && "card_brand" in addr ? sanitize(addr.card_brand) : "";
  const last4 = String(cardNumber).replace(/\D/g, "").slice(-4);
  const fingerprint = cardFingerprint(String(cardNumber), "stripe", cardholder, `${expiryMonth}/${expiryYear}`);
  const enc = encryptCardNumber(String(cardNumber));
  const existing = await tx.customerPaymentMethod.findFirst({ where: { userId, cardFingerprint: fingerprint } });
  if (existing) {
    if (existing.isDefault !== true && !existing.id) {
    }
    return existing.id;
  }
  const created = await tx.customerPaymentMethod.create({
    data: {
      userId,
      methodType: "card",
      provider: "stripe",
      cardholderName: cardholder || null,
      cardBrand: brand || null,
      cardLast4: last4 || null,
      cardFingerprint: fingerprint,
      cardNumberEnc: enc,
      expiryMonth: expiryMonth || null,
      expiryYear: expiryYear || null,
      displayName: maskCardDisplay(brand, last4) || null
    }
  });
  return created.id;
}
function computeLine(row) {
  const v = row.variant;
  if (!v) throw createAppError(422, "INVALID_CART_ITEM", "Cart item has no variant");
  const price = toNum(v.price);
  const salePrice = toNum(v.salePrice);
  const vatRate = toNum(v.vatRate, 5);
  const { finalPrice, discountValue, vatValue } = computePrices(
    price || null,
    salePrice || null,
    v.discountType,
    v.discountValue != null ? toNum(v.discountValue) : null,
    vatRate,
    v.vatIncluded ?? true
  );
  const qty = row.quantity;
  return {
    unitPrice: finalPrice,
    discountAmount: +(discountValue * qty).toFixed(2),
    vatAmount: +(vatValue * qty).toFixed(2),
    lineTotal: +(finalPrice * qty).toFixed(2)
  };
}
async function getCheckoutData(identity) {
  const cartRows = await prisma.cart.findMany({
    where: {
      status: "active",
      OR: [
        { userId: identity.email },
        ...identity.guestToken ? [{ guestToken: identity.guestToken }] : []
      ]
    },
    include: {
      variant: {
        include: {
          product: { select: { name: true, slug: true, mainImage: true } },
          media: { orderBy: { id: "asc" }, take: 1 }
        }
      }
    },
    orderBy: { createdAt: "asc" }
  });
  if (!cartRows.length) {
    throw createAppError(422, "EMPTY_CART", "Cart is empty");
  }
  const items = cartRows.map((row) => {
    const v = row.variant;
    const product = v?.product;
    const line = v ? computeLine(row) : { unitPrice: 0, discountAmount: 0, vatAmount: 0, lineTotal: 0 };
    return {
      cart_id: row.id,
      product_id: row.productId,
      variant_id: row.variantId,
      product_name: product?.name ?? null,
      variant_name: v?.displayName ?? v?.name ?? null,
      sku: v?.sku ?? null,
      image: v?.media[0]?.filename ?? product?.mainImage ?? null,
      quantity: row.quantity,
      unit_price: line.unitPrice,
      discount_amount: line.discountAmount,
      vat_amount: line.vatAmount,
      line_total: line.lineTotal,
      stock: v?.stock ?? 0
    };
  });
  const subtotal = items.reduce((s, i) => s + i.unit_price * i.quantity, 0);
  const totalDiscount = items.reduce((s, i) => s + i.discount_amount, 0);
  const totalVat = items.reduce((s, i) => s + i.vat_amount, 0);
  const grandTotal = items.reduce((s, i) => s + i.line_total, 0);
  const savedAddresses = await prisma.userAddress.findMany({
    where: { userId: identity.userId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      addressType: true,
      isDefault: true,
      address: true,
      addressLine1: true,
      landmark: true,
      city: true,
      emirate: true,
      country: true,
      postalCode: true
    }
  });
  const savedPaymentMethods = await prisma.customerPaymentMethod.findMany({
    where: { userId: identity.userId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      methodType: true,
      provider: true,
      cardholderName: true,
      cardBrand: true,
      cardLast4: true,
      expiryMonth: true,
      expiryYear: true,
      displayName: true,
      isDefault: true
    }
  });
  return {
    items,
    summary: {
      subtotal: +subtotal.toFixed(2),
      discount: +totalDiscount.toFixed(2),
      vat: +totalVat.toFixed(2),
      grand_total: +grandTotal.toFixed(2),
      currency: CURRENCY,
      item_count: items.length
    },
    saved_addresses: savedAddresses,
    saved_payment_methods: savedPaymentMethods.map((pm) => ({
      ...pm,
      display_name: pm.displayName || maskCardDisplay(pm.cardBrand, pm.cardLast4)
    }))
  };
}
function validateCustomerInfo(customer_name, phone) {
  const name = sanitize(customer_name);
  if (!name) throw createAppError(422, "CUSTOMER_NAME_REQUIRED", "Customer name is required");
  const p = sanitizePhone(phone);
  if (!p) throw createAppError(422, "PHONE_REQUIRED", "Phone number is required");
  return { customerName: name, phone: p };
}
async function placeCodOrder(identity, input) {
  validateAddress(input.billing_address, "Billing");
  validateAddress(input.shipping_address, "Shipping");
  // Fall back to the authenticated account's name/phone when the client omits them,
  // so the authoritative customer identity is always captured (fixes COD flow).
  const customer = validateCustomerInfo(input.customer_name || identity.customerName, input.phone || identity.phone);
  const ip = input.ip || "";
  const orderNumber = generateOrderNumber();
  const trackingId = generateTrackingId();
  const paymentRef = generatePaymentReference();
  return prisma.$transaction(async (tx) => {
    await claimGuestCartRows(tx, identity.email, identity.guestToken);
    const tracking = await getOrCreateTrackingId(tx, identity, trackingId);
    const effectiveTrackingId = tracking.trackingId;
    const orderTrackingId = effectiveTrackingId;
    const cartRows = await lockCartRows(tx, identity);
    if (!cartRows.length) throw createAppError(422, "EMPTY_CART", "Cart is empty");
    const lines = [];
    let subtotal = 0;
    let totalDiscount = 0;
    let totalVat = 0;
    let grandTotal = 0;
    for (const row of cartRows) {
      if (!row.variantId) throw createAppError(422, "INVALID_CART_ITEM", "Cart item missing variant");
      const locked = await lockVariant(tx, row.variantId);
      if (row.quantity > locked.stock) {
        throw createAppError(409, "INSUFFICIENT_STOCK", `Only ${locked.stock} available for "${locked.name || row.variantId}"`);
      }
      const line = computeLine(row);
      lines.push({ cart: row, line, variantId: row.variantId });
      subtotal += line.unitPrice * row.quantity;
      totalDiscount += line.discountAmount;
      totalVat += line.vatAmount;
      grandTotal += line.lineTotal;
    }
    const order = await tx.order.create({
      data: {
        userId: identity.userId,
        guestToken: identity.guestToken,
        orderNumber,
        trackingId: orderTrackingId,
        paymentReference: paymentRef,
        customerName: customer.customerName,
        email: identity.email,
        phone: customer.phone,
        currency: CURRENCY,
        subtotalAmount: +subtotal.toFixed(2),
        discountAmount: +totalDiscount.toFixed(2),
        vatAmount: +totalVat.toFixed(2),
        grandTotal: +grandTotal.toFixed(2),
        paymentMethod: "cod",
        paymentStatus: "pending",
        orderStatus: "placed",
        gatewayProvider: "manual",
        billingAddress: buildOrderAddress(input.billing_address, ip),
        shippingAddress: buildOrderAddress(input.shipping_address, ip),
        notes: sanitize(input.notes)
      }
    });
    for (const { cart: c, line: l, variantId: vid } of lines) {
      await tx.orderItem.create({
        data: {
          orderId: order.id,
          cartId: c.id,
          productId: c.productId,
          variantId: vid,
          productName: c.variant?.product?.name ?? null,
          variantName: c.variant?.displayName ?? c.variant?.name ?? null,
          sku: c.variant?.sku ?? null,
          quantity: c.quantity,
          unitPrice: +l.unitPrice.toFixed(2),
          discountAmount: +l.discountAmount.toFixed(2),
          vatAmount: +l.vatAmount.toFixed(2),
          lineTotal: +l.lineTotal.toFixed(2)
        }
      });
    }
    await tx.orderPayment.create({
      data: {
        orderId: order.id,
        provider: "manual",
        paymentMethod: "cod",
        transactionReference: paymentRef,
        amount: +grandTotal.toFixed(2),
        currency: CURRENCY,
        status: "pending",
        gatewayResponse: { payment_source: "manual_entry", gateway_provider: "manual", note: "Cash on delivery" }
      }
    });
    for (const { cart: c, variantId: vid } of lines) {
      await conditionalDecrementStock(tx, vid, c.quantity);
    }
    const cartIds = lines.map((l) => l.cart.id);
    await tx.cart.updateMany({
      where: { id: { in: cartIds } },
      data: { status: "ordered", orderId: order.id, orderedAt: /* @__PURE__ */ new Date(), updatedAt: /* @__PURE__ */ new Date() }
    });
    if (input.save_billing) {
      await saveAddress(tx, identity.userId, input.billing_address, "billing");
    }
    if (input.save_shipping) {
      await saveAddress(tx, identity.userId, input.shipping_address, "shipping");
    }
    const savedPaymentMethodId = await savePaymentMethodForLater(tx, identity.userId, input.billing_address);
    return {
      order_number: order.orderNumber,
      tracking_id: order.trackingId,
      payment_reference: order.paymentReference,
      grand_total: +grandTotal.toFixed(2),
      currency: CURRENCY,
      payment_method: "cod",
      order_status: order.orderStatus,
      payment_status: order.paymentStatus,
      total_items: lines.length,
      total_amount: +grandTotal.toFixed(2),
      saved_payment_method_id: savedPaymentMethodId
    };
  });
}
async function createStripeCheckoutSession(identity, input) {
  const stripe = getStripe();
  if (!stripe) throw createAppError(500, "STRIPE_NOT_CONFIGURED", "Stripe is not configured");
  validateAddress(input.billing_address, "Billing");
  validateAddress(input.shipping_address, "Shipping");
  // Fall back to the authenticated account's name/phone when the client omits them,
  // so the authoritative customer identity is always captured (fixes card flow).
  const customer = validateCustomerInfo(input.customer_name || identity.customerName, input.phone || identity.phone);
  const ip = input.ip || "";
  const orderNumber = generateOrderNumber();
  const trackingId = generateTrackingId();
  const paymentRef = generatePaymentReference();
  return prisma.$transaction(async (tx) => {
    await claimGuestCartRows(tx, identity.email, identity.guestToken);
    const tracking = await getOrCreateTrackingId(tx, identity, trackingId);
    const orderTrackingId = tracking.trackingId;
    const cartRows = await lockCartRows(tx, identity);
    if (!cartRows.length) throw createAppError(422, "EMPTY_CART", "Cart is empty");
    const lines = [];
    let subtotal = 0;
    let totalDiscount = 0;
    let totalVat = 0;
    let grandTotal = 0;
    for (const row of cartRows) {
      if (!row.variantId) throw createAppError(422, "INVALID_CART_ITEM", "Cart item missing variant");
      const locked = await lockVariant(tx, row.variantId);
      if (row.quantity > locked.stock) {
        throw createAppError(409, "INSUFFICIENT_STOCK", `Only ${locked.stock} available for "${locked.name || row.variantId}"`);
      }
      const line = computeLine(row);
      lines.push({ cart: row, line, variantId: row.variantId });
      subtotal += line.unitPrice * row.quantity;
      totalDiscount += line.discountAmount;
      totalVat += line.vatAmount;
      grandTotal += line.lineTotal;
    }
    const order = await tx.order.create({
      data: {
        userId: identity.userId,
        guestToken: identity.guestToken,
        orderNumber,
        trackingId: orderTrackingId,
        paymentReference: paymentRef,
        customerName: customer.customerName,
        email: identity.email,
        phone: customer.phone,
        currency: CURRENCY,
        subtotalAmount: +subtotal.toFixed(2),
        discountAmount: +totalDiscount.toFixed(2),
        vatAmount: +totalVat.toFixed(2),
        grandTotal: +grandTotal.toFixed(2),
        paymentMethod: "card",
        paymentStatus: "initiated",
        orderStatus: "pending_payment",
        gatewayProvider: "stripe",
        billingAddress: buildOrderAddress(input.billing_address, ip),
        shippingAddress: buildOrderAddress(input.shipping_address, ip),
        notes: sanitize(input.notes)
      }
    });
    for (const { cart: c, line: l, variantId: vid } of lines) {
      await tx.orderItem.create({
        data: {
          orderId: order.id,
          cartId: c.id,
          productId: c.productId,
          variantId: vid,
          productName: c.variant?.product?.name ?? null,
          variantName: c.variant?.displayName ?? c.variant?.name ?? null,
          sku: c.variant?.sku ?? null,
          quantity: c.quantity,
          unitPrice: +l.unitPrice.toFixed(2),
          discountAmount: +l.discountAmount.toFixed(2),
          vatAmount: +l.vatAmount.toFixed(2),
          lineTotal: +l.lineTotal.toFixed(2)
        }
      });
    }
    await tx.orderPayment.create({
      data: {
        orderId: order.id,
        provider: "stripe",
        paymentMethod: "card",
        transactionReference: paymentRef,
        amount: +grandTotal.toFixed(2),
        currency: CURRENCY,
        status: "initiated",
        gatewayResponse: {
          gateway_provider: "stripe",
          payment_method: "card",
          payment_source: "stripe_checkout",
          stripe_order_number: order.orderNumber,
          stripe_payment_reference: paymentRef
        }
      }
    });
    const cartIds = lines.map((l) => l.cart.id);
    await tx.cart.updateMany({
      where: { id: { in: cartIds } },
      data: { status: "ordered", orderId: order.id, orderedAt: /* @__PURE__ */ new Date(), updatedAt: /* @__PURE__ */ new Date() }
    });
    const successUrl = `${env.APP_URL}/api/checkout/success/${order.orderNumber}?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${env.FRONTEND_URL}/checkout`;
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      currency: CURRENCY.toLowerCase(),
      customer_email: identity.email || void 0,
      client_reference_id: String(order.id),
      line_items: lines.map(({ cart: c, line: l }) => ({
        price_data: {
          currency: CURRENCY.toLowerCase(),
          product_data: {
            name: c.variant?.displayName || c.variant?.name || c.variant?.product?.name || "Product",
            metadata: c.variant?.sku ? { sku: c.variant.sku } : void 0
          },
          unit_amount: Math.round(l.unitPrice * 100)
          // Stripe uses fils
        },
        quantity: c.quantity
      })),
      metadata: {
        order_id: String(order.id),
        order_number: order.orderNumber,
        user_id: String(identity.userId)
      },
      success_url: successUrl,
      cancel_url: cancelUrl
    });
    const gatewayResponse = {
      stripe_session_id: session.id,
      stripe_checkout_url: session.url
    };
    if (session.payment_intent) {
      gatewayResponse.stripe_payment_intent_id = session.payment_intent;
    }
    await tx.orderPayment.updateMany({
      where: { orderId: order.id },
      data: { gatewayResponse }
    });
    if (input.save_billing) {
      await saveAddress(tx, identity.userId, input.billing_address, "billing");
    }
    if (input.save_shipping) {
      await saveAddress(tx, identity.userId, input.shipping_address, "shipping");
    }
    return {
      order_number: order.orderNumber,
      tracking_id: order.trackingId,
      payment_reference: order.paymentReference,
      grand_total: +grandTotal.toFixed(2),
      currency: CURRENCY,
      stripe_checkout_url: session.url,
      stripe_session_id: session.id,
      checkout_url: session.url,
      url: session.url,
      redirect_url: session.url,
      total_amount: +grandTotal.toFixed(2),
      total_items: lines.length
    };
  });
}
async function saveAddress(tx, userId, addr, type) {
  const existing = await tx.userAddress.findFirst({
    where: {
      userId,
      city: sanitize(addr.city),
      addressLine1: sanitize(addr.address_line1)
    }
  });
  if (existing) return;
  await tx.userAddress.create({
    data: {
      userId,
      addressType: type,
      isDefault: false,
      address: `${sanitize(addr.address_line1)}, ${sanitize(addr.city)}`,
      addressLine1: sanitize(addr.address_line1),
      landmark: sanitize(addr.landmark),
      city: sanitize(addr.city),
      emirate: sanitize(addr.emirate),
      country: sanitize(addr.country),
      postalCode: sanitize(addr.postal_code)
    }
  });
}
async function getOrderSuccess(orderNumber, userId) {
  const order = await prisma.order.findFirst({
    where: { orderNumber, userId },
    include: {
      items: {
        include: {
          product: { select: { name: true, mainImage: true } },
          variant: { select: { name: true, displayName: true, sku: true } }
        }
      },
      payments: true
    }
  });
  if (!order) throw createAppError(404, "ORDER_NOT_FOUND", "Order not found");
  return order;
}
async function getOrderTracking(orderNumber, userId) {
  const order = await prisma.order.findFirst({
    where: { orderNumber, userId },
    select: {
      orderNumber: true,
      trackingId: true,
      paymentReference: true,
      orderStatus: true,
      paymentStatus: true,
      paymentMethod: true,
      grandTotal: true,
      currency: true,
      createdAt: true,
      updatedAt: true,
      items: {
        select: {
          productName: true,
          variantName: true,
          quantity: true,
          unitPrice: true,
          lineTotal: true
        }
      }
    }
  });
  if (!order) throw createAppError(404, "ORDER_NOT_FOUND", "Order not found");
  return order;
}
async function getSavedPaymentMethods(userId) {
  return prisma.customerPaymentMethod.findMany({
    where: { userId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      methodType: true,
      provider: true,
      cardholderName: true,
      cardBrand: true,
      cardLast4: true,
      expiryMonth: true,
      expiryYear: true,
      displayName: true,
      isDefault: true
    }
  });
}
async function getSavedAddresses(userId) {
  return prisma.userAddress.findMany({
    where: { userId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }]
  });
}
async function findOrderByStripeSessionId(sessionId) {
  const rows = await prisma.$queryRaw`
    SELECT op.id
    FROM order_payments op
    WHERE JSON_UNQUOTE(JSON_EXTRACT(op.gateway_response, '$.stripe_session_id')) = ${sessionId}
    LIMIT 1
  `;
  if (!rows.length) return null;
  return prisma.orderPayment.findFirst({
    where: { id: rows[0].id },
    include: { order: true }
  });
}
async function findOrderByStripePaymentIntent(paymentIntentId) {
  const rows = await prisma.$queryRaw`
    SELECT op.id
    FROM order_payments op
    WHERE JSON_UNQUOTE(JSON_EXTRACT(op.gateway_response, '$.stripe_payment_intent_id')) = ${paymentIntentId}
    LIMIT 1
  `;
  if (!rows.length) return null;
  return prisma.orderPayment.findFirst({
    where: { id: rows[0].id },
    include: { order: true }
  });
}
async function findOrderByOrderNumber(orderNumber) {
  return prisma.order.findFirst({
    where: { orderNumber },
    include: { payments: true, items: true }
  });
}
async function handleCheckoutSessionCompleted(session) {
  const orderId = session.metadata?.order_id;
  if (!orderId) return;
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const existing = await prisma.orderPayment.findFirst({ where: { orderId: Number(orderId) } });
  const base = existing?.gatewayResponse || {};
  const update = {
    ...base,
    stripe_session_id: session.id,
    stripe_payment_intent_id: session.payment_intent ? String(session.payment_intent) : base.stripe_payment_intent_id,
    last_webhook_event: "checkout.session.completed",
    last_webhook_received_at: now
  };
  await prisma.orderPayment.updateMany({
    where: { orderId: Number(orderId) },
    data: { gatewayResponse: update }
  });
}
async function handlePaymentIntentSucceeded(paymentIntent) {
  const orderId = paymentIntent.metadata?.order_id;
  if (!orderId) return;
  const existing = await prisma.order.findFirst({
    where: { id: Number(orderId) },
    select: { paymentStatus: true, orderStatus: true }
  });
  if (!existing) return;
  const paidStatuses = ["paid", "completed", "captured", "successful", "success"];
  if (paidStatuses.includes(existing.paymentStatus || "")) return;
  return prisma.$transaction(async (tx) => {
    const items = await tx.orderItem.findMany({
      where: { orderId: Number(orderId) },
      select: { variantId: true, quantity: true }
    });
    for (const item of items) {
      if (!item.variantId) continue;
      await tx.$executeRaw`
        UPDATE product_variants SET stock = stock - ${item.quantity}, updated_at = NOW()
        WHERE id = ${item.variantId} AND stock >= ${item.quantity}
      `;
    }
    await tx.order.update({
      where: { id: Number(orderId) },
      data: { paymentStatus: "paid", orderStatus: "confirmed", updatedAt: /* @__PURE__ */ new Date() }
    });
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const existingPm = await tx.orderPayment.findFirst({ where: { orderId: Number(orderId) } });
    const base = existingPm?.gatewayResponse || {};
    await tx.orderPayment.updateMany({
      where: { orderId: Number(orderId) },
      data: {
        status: "paid",
        updatedAt: /* @__PURE__ */ new Date(),
        gatewayResponse: {
          ...base,
          stripe_payment_intent_id: paymentIntent.id,
          payment_status: "paid",
          order_status: "confirmed",
          stock_reduced: true,
          last_webhook_event: "payment_intent.succeeded",
          last_webhook_received_at: now
        }
      }
    });
  });
}
async function handlePaymentIntentFailed(paymentIntent) {
  const orderId = paymentIntent.metadata?.order_id;
  if (!orderId) return;
  const now = (/* @__PURE__ */ new Date()).toISOString();
  return prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: Number(orderId) },
      data: { paymentStatus: "failed", orderStatus: "payment_failed", updatedAt: /* @__PURE__ */ new Date() }
    });
    const existingPm = await tx.orderPayment.findFirst({ where: { orderId: Number(orderId) } });
    const base = existingPm?.gatewayResponse || {};
    await tx.orderPayment.updateMany({
      where: { orderId: Number(orderId) },
      data: {
        status: "failed",
        updatedAt: /* @__PURE__ */ new Date(),
        gatewayResponse: {
          ...base,
          stripe_payment_intent_id: paymentIntent.id,
          payment_status: "failed",
          order_status: "payment_failed",
          last_webhook_event: "payment_intent.payment_failed",
          last_webhook_received_at: now
        }
      }
    });
  });
}
export {
  createStripeCheckoutSession,
  findOrderByOrderNumber,
  findOrderByStripePaymentIntent,
  findOrderByStripeSessionId,
  getCheckoutData,
  getOrderSuccess,
  getOrderTracking,
  getSavedAddresses,
  getSavedPaymentMethods,
  handleCheckoutSessionCompleted,
  handlePaymentIntentFailed,
  handlePaymentIntentSucceeded,
  placeCodOrder,
  resolveCheckoutIdentity
};
