"use strict";

const { pool } = require("../includes/conn");
const crypto = require("crypto");
const Stripe = require("stripe");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2023-08-16",
});

/* =========================================================
   CONFIG
========================================================= */

const ONLY_ACTIVE_VARIANTS_FOR_SELECTION = true;

const ALLOWED_PAYMENT_METHODS = new Set(["cod", "card"]);
const ALLOWED_GATEWAY_PROVIDERS = new Set([
  "manual",
  "stripe",
  "checkout_com",
  "telr",
  "paypal",
  "paytabs",
]);

const DEBUG_CHECKOUT_IDENTITY =
  String(process.env.DEBUG_CHECKOUT_IDENTITY || "") === "1";

const CUSTOMER_PAYMENT_METHODS_TABLE = "customer_payment_methods";
const USER_ADDRESSES_TABLE = "user_addresses";
const CART_TABLE = "cart";
const ORDERS_TABLE = "orders";
const ORDER_ITEMS_TABLE = "order_items";
const ORDER_PAYMENTS_TABLE = "order_payments";
const PRODUCT_VARIANTS_TABLE = "product_variants";
const PRODUCTS_TABLE = "products";
const VARIANT_MEDIA_TABLE = "variant_media";

/* =========================================================
   SMALL HELPERS
========================================================= */

function toNum(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function sanitizeText(v, max = 255) {
  if (v === null || typeof v === "undefined") return "";
  return String(v).trim().slice(0, max);
}

function sanitizeEmail(v) {
  const s = sanitizeText(v, 150);
  if (!s) return "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : "";
}

function sanitizePhone(v) {
  return sanitizeText(v, 30).replace(/[^\d+\-\s()]/g, "");
}

function sanitizeDigits(v, max = 32) {
  return sanitizeText(v, max).replace(/\D/g, "");
}

function sanitizeIban(v) {
  return sanitizeText(v, 34).replace(/\s+/g, "").toUpperCase();
}

function sanitizeDecimal(v, fallback = null) {
  if (v === null || typeof v === "undefined" || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeBoolean(v) {
  return v === true || v === 1 || v === "1" || v === "true" || v === "on";
}

function maskCardNumber(cardNumber) {
  const digits = sanitizeDigits(cardNumber, 19);
  if (!digits) return "";
  if (digits.length <= 4) return digits;
  return `**** **** **** ${digits.slice(-4)}`;
}

function maskIban(iban) {
  const clean = sanitizeIban(iban);
  if (!clean) return "";
  if (clean.length <= 6) return clean;
  return clean.slice(0, 2) + "****" + clean.slice(-4);
}

function generateOrderNumber() {
  return (
    "ORD-" +
    new Date().toISOString().slice(0, 10).replace(/-/g, "") +
    "-" +
    crypto.randomBytes(4).toString("hex").toUpperCase()
  );
}

function generatePaymentReference() {
  return "PAY-" + crypto.randomBytes(6).toString("hex").toUpperCase();
}

function generateTrackingId() {
  return "TRK-" + crypto.randomBytes(5).toString("hex").toUpperCase();
}

function invalidInput(res, message = "Invalid input", code = "INVALID_INPUT", debug = null) {
  const payload = { success: false, message, error_code: code };
  if (debug) payload.debug = debug;
  return res.status(400).json(payload);
}

function getClientIP(req) {
  const xff = sanitizeText(req.headers?.["x-forwarded-for"], 200);
  if (xff) return xff.split(",")[0].trim();
  return req.ip || req.socket?.remoteAddress || null;
}

function debugIdentity(req, stage) {
  if (!DEBUG_CHECKOUT_IDENTITY) return;
  console.log(`[checkout][${stage}] sessionID:`, req.sessionID || null);
  console.log(`[checkout][${stage}] hasSession:`, !!req.session);
  console.log(`[checkout][${stage}] user:`, req.session?.user || null);
  console.log(`[checkout][${stage}] userId:`, req.session?.userId || null);
}

function resolveGuestToken(req) {
  return sanitizeText(
    req.headers?.["x-guest-token"] ||
      req.body?.guest_token ||
      req.query?.guest_token ||
      req.cookies?.guest_token ||
      req.guestToken ||
      req.session?.guestToken ||
      req.session?.guest_token ||
      "",
    255
  );
}

function emitSocket(req, eventName, payload = {}) {
  try {
    const io = req?.app?.get ? req.app.get("io") : null;
    if (io) io.emit(eventName, payload);
  } catch (err) {
    console.warn(`[checkout][socket] ${eventName} emit failed:`, err?.message || err);
  }
}

/* =========================================================
   SESSION IDENTITY
========================================================= */

function getSessionCustomer(req) {
  if (req.session?.user?.id) return req.session.user;

  if (req.session?.userId) {
    return {
      id: req.session.userId,
      user_id: req.session.userUserId || null,
      full_name: req.session.userName || null,
      email: req.session.userEmail || null,
      phone: req.session.userPhone || null,
      role: req.session.userRole || "customer",
      provider: req.session.authProvider || "local",
      loginAt: req.session.loginAt || null,
      sessionVersion: req.session.sessionVersion || 1,
    };
  }

  return null;
}

function resolveIdentity(req) {
  debugIdentity(req, "resolveIdentity");

  const customer = getSessionCustomer(req);

  if (!customer?.id) {
    return {
      error: true,
      message: "Please sign in first.",
      error_code: "AUTH_REQUIRED",
      debug: {
        sessionID: req.sessionID || null,
        hasSession: !!req.session,
        userId: req.session?.userId || null,
      },
    };
  }
  const cartUserId = sanitizeEmail(customer.email || req.session?.userEmail || "");
  if (!cartUserId) {
    return {
      error: true,
      message: "Unable to resolve cart owner email.",
      error_code: "CART_IDENTITY_REQUIRED",
    };
  }

  return {
    error: false,
    userId: Number(customer.id),
    cartUserId,
    guestToken: resolveGuestToken(req) || null,
    customer,
  };
}

/* =========================================================
   PRICE / ADDRESS / PAYMENT HELPERS
========================================================= */

function resolveDiscountPercent(discount_type, discount_value, price) {
  const dv = toNum(discount_value, 0);
  const p = toNum(price, 0);
  if (!discount_type) return 0;

  const t = String(discount_type).toLowerCase();
  if (t === "percent" || t === "percentage") return dv;
  if (t === "fixed" || t === "amount") return p > 0 ? (dv / p) * 100 : 0;
  return 0;
}

function calculateFinalPrice(basePrice = 0, discountPercent = 0, vatPercent = 0) {
  const bp = toNum(basePrice, 0);
  const d = toNum(discountPercent, 0);
  const v = toNum(vatPercent, 0);

  const discountValue = +(bp * (d / 100));
  const taxedBase = +(bp - discountValue);
  const vatValue = +(taxedBase * (v / 100));
  const finalPrice = +(taxedBase + vatValue).toFixed(2);

  return { finalPrice, discountValue, vatValue };
}

function buildAddressObject(body) {
  const latitude = sanitizeDecimal(body.latitude, null);
  const longitude = sanitizeDecimal(body.longitude, null);

  return {
    country: sanitizeText(body.country, 80),
    emirate: sanitizeText(body.emirate, 80),
    city: sanitizeText(body.city, 80),
    area: sanitizeText(body.area, 120),
    address_line1: sanitizeText(body.address_line1, 160),
    address_line2: sanitizeText(body.address_line2, 160),
    postal_code: sanitizeText(body.postal_code, 30),
    landmark: sanitizeText(body.landmark, 120),
    google_place_id: sanitizeText(body.google_place_id, 120),
    formatted_address: sanitizeText(body.formatted_address, 300),
    location_label: sanitizeText(body.location_label, 120),
    location_source: sanitizeText(body.location_source, 30) || "manual",
    latitude,
    longitude,
  };
}

function buildOrderJsonAddress(address) {
  return {
    country: address.country || null,
    emirate: address.emirate || null,
    city: address.city || null,
    area: address.area || null,
    address_line1: address.address_line1 || null,
    address_line2: address.address_line2 || null,
    postal_code: address.postal_code || null,
    landmark: address.landmark || null,
    google_place_id: address.google_place_id || null,
    formatted_address: address.formatted_address || null,
    location_label: address.location_label || null,
    location_source: address.location_source || null,
    latitude: address.latitude,
    longitude: address.longitude,
  };
}

function buildDefaultView(data = {}) {
  return {
    cartItems: [],
    summary: {
      itemCount: 0,
      subtotal: 0,
      discountTotal: 0,
      vatTotal: 0,
      grandTotal: 0,
      currency: "AED",
    },
    errorMessage: null,
    successMessage: null,
    orderPlaced: false,
    orderNumber: null,
    orderData: null,
    customer: null,
    csrfToken: "",
    checkoutSteps: [],
    verificationChecklist: [
      "Identity resolved",
      "Cart validated",
      "Stock checked",
      "Address captured",
      "Payment method selected",
    ],
    savedPaymentMethods: [],
    savedAddresses: [],
    selectedSavedPaymentMethod: null,
    selectedSavedAddress: null,
    profile: null,
    trackerUrl: null,
    trackingId: null,
    ...data,
  };
}

function buildCustomerProfile(req) {
  const user = req.session?.user || null;
  if (!user && !req.session?.userId) return null;

  return {
    id: req.session?.userId || user?.id || null,
    name: sanitizeText(user?.full_name || req.session?.userName || "", 150),
    email: sanitizeEmail(user?.email || req.session?.userEmail || ""),
    phone: sanitizePhone(user?.phone || req.session?.userPhone || ""),
    company_name: sanitizeText(user?.company_name, 150),
  };
}

/* =========================================================
   SAVED ADDRESSES / PAYMENTS
========================================================= */

async function fetchSavedPaymentMethods(client, userId) {
  if (!userId) return [];
  try {
    const r = await client.query(
      `
      SELECT
        id,
        COALESCE(display_name, provider, 'Saved method') AS label,
        method_type,
        provider,
        cardholder_name,
        card_brand,
        card_last4,
        expiry_month,
        expiry_year,
        account_email,
        is_default,
        created_at,
        updated_at
      FROM ${CUSTOMER_PAYMENT_METHODS_TABLE}
      WHERE user_id = $1
      ORDER BY COALESCE(is_default, FALSE) DESC, created_at DESC
      `,
      [userId]
    );

    return (r.rows || []).map((row) => ({
      id: row.id,
      label: row.label || "Saved method",
      method_type: row.method_type || "card",
      provider: row.provider || "manual",
      cardholder_name: row.cardholder_name || "",
      brand: row.card_brand || null,
      last4: row.card_last4 || null,
      expiry:
        row.expiry_month && row.expiry_year
          ? `${row.expiry_month}/${row.expiry_year}`
          : null,
      account_email: row.account_email || null,
      is_default: !!row.is_default,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));
  } catch {
    return [];
  }
}

async function fetchSavedAddresses(client, userId) {
  if (!userId) return [];
  try {
    const r = await client.query(
      `
      SELECT
        id,
        COALESCE(NULLIF(address, ''), 'Saved address') AS label,
        email,
        address,
        city,
        country,
        is_default,
        created_at,
        updated_at
      FROM ${USER_ADDRESSES_TABLE}
      WHERE user_id = $1
      ORDER BY COALESCE(is_default, FALSE) DESC, created_at DESC
      `,
      [userId]
    );

    return (r.rows || []).map((row) => ({
      id: row.id,
      label: row.label || "Saved address",
      email: row.email || null,
      address: row.address || "",
      city: row.city || "",
      country: row.country || "",
      is_default: !!row.is_default,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));
  } catch {
    return [];
  }
}

function parseCardExpiry(cardExpiry) {
  const clean = sanitizeText(cardExpiry, 10);
  const parts = clean.split("/").map((x) => x.trim()).filter(Boolean);
  return {
    month: parts[0] || null,
    year: parts[1] || null,
  };
}

async function savePaymentMethodForLater(client, userId, body, paymentInfo, meta = {}) {
  const saveForLater =
    normalizeBoolean(body.save_payment_for_later) ||
    normalizeBoolean(body.save_payment_method);

  if (!saveForLater || !userId) return null;

  const methodType = sanitizeText(
    paymentInfo.payment_method || body.payment_method,
    30
  ).toLowerCase();

  if (methodType !== "card") return null;

  const provider =
    sanitizeText(paymentInfo.gateway_provider || body.gateway_provider, 30)
      .toLowerCase() || "manual";

  const cardholderName = sanitizeText(body.cardholder_name || body.card_name, 120);
  const cardNumber = sanitizeDigits(body.card_number, 19);
  const cardExpiry = sanitizeText(body.card_expiry, 10);
  const accountEmail = sanitizeEmail(body.account_email);
  const displayName =
    sanitizeText(body.display_name, 120) ||
    (methodType === "card"
      ? `${provider.toUpperCase()} ${maskCardNumber(cardNumber)}`
      : provider.toUpperCase());

  const isDefault =
    normalizeBoolean(body.is_default_payment) ||
    normalizeBoolean(body.set_default_payment);

  let cardBrand = paymentInfo.card_brand || provider;
  let cardLast4 = paymentInfo.card_last4 || null;
  let cardFingerprint = null;
  let cardNumberEnc = null;
  let expiryMonth = null;
  let expiryYear = null;

  if (methodType === "card") {
    cardLast4 = cardLast4 || (cardNumber ? cardNumber.slice(-4) : null);
    cardFingerprint = crypto
      .createHash("sha256")
      .update(cardNumber || `${provider}:${cardholderName}:${cardExpiry}`)
      .digest("hex");
    cardNumberEnc = encryptValue(cardNumber);
    const expiry = parseCardExpiry(cardExpiry);
    expiryMonth = expiry.month;
    expiryYear = expiry.year;
  }

  try {
    const result = await client.query(
      `
      INSERT INTO ${CUSTOMER_PAYMENT_METHODS_TABLE} (
        user_id,
        method_type,
        provider,
        cardholder_name,
        card_brand,
        card_last4,
        card_fingerprint,
        card_number_enc,
        expiry_month,
        expiry_year,
        display_name,
        account_email,
        is_default,
        meta,
        created_at,
        updated_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW(),NOW())
      RETURNING id
      `,
      [
        userId,
        methodType,
        provider,
        methodType === "card" ? cardholderName || null : null,
        cardBrand,
        cardLast4,
        cardFingerprint,
        cardNumberEnc,
        expiryMonth,
        expiryYear,
        displayName,
        methodType === "card" ? null : accountEmail || null,
        isDefault,
        JSON.stringify({
          ...meta,
          saved_from: "checkout",
          source: "checkout.controller",
        }),
      ]
    );

    return result.rows[0] || null;
  } catch (err) {
    console.warn("[checkout] savePaymentMethodForLater failed:", err?.message || err);
    return null;
  }
}

async function saveAddressForLater(client, userId, body, address, meta = {}) {
  const saveForLater =
    normalizeBoolean(body.save_address_for_later) ||
    normalizeBoolean(body.save_address);

  if (!saveForLater || !userId) return null;

  const email = sanitizeEmail(body.email || body.address_email || "");
  const combinedAddress = sanitizeText(
    body.address ||
      address.formatted_address ||
      [address.address_line1, address.address_line2, address.area, address.city, address.country]
        .filter(Boolean)
        .join(", "),
    300
  );

  try {
    const result = await client.query(
      `
      INSERT INTO ${USER_ADDRESSES_TABLE} (
        user_id,
        email,
        address,
        city,
        country,
        is_default,
        created_at,
        updated_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,NOW(),NOW())
      RETURNING id
      `,
      [
        userId,
        email || null,
        combinedAddress || null,
        address.city || null,
        address.country || null,
        normalizeBoolean(body.is_default_address),
      ]
    );

    return result.rows[0] || null;
  } catch (err) {
    console.warn("[checkout] saveAddressForLater failed:", err?.message || err);
    return null;
  }
}

/* =========================================================
   PAYMENT DETAILS / CART RESOLUTION
========================================================= */

function buildPaymentDetails(paymentMethod, body, savedPaymentMethods = []) {
  const method = String(paymentMethod || "").toLowerCase();
  const savedPaymentMethodId = sanitizeText(body.saved_payment_method_id, 60);
  const selectedSavedMethod = savedPaymentMethodId
    ? savedPaymentMethods.find((m) => String(m.id) === savedPaymentMethodId) || null
    : null;

  if (selectedSavedMethod) {
    return {
      error: false,
      data: {
        payment_method: selectedSavedMethod.method_type || method || "card",
        payment_source: "saved_method",
        saved_payment_method_id: selectedSavedMethod.id,
        saved_payment_method_label: selectedSavedMethod.label || null,
        card_last4: selectedSavedMethod.last4 || null,
        card_brand: selectedSavedMethod.brand || null,
        card_expiry: selectedSavedMethod.expiry || null,
        gateway_provider: selectedSavedMethod.provider || "manual",
      },
    };
  }

  if (method === "card") {
    const gatewayProvider =
      sanitizeText(body.gateway_provider, 30).toLowerCase() || "manual";

    if (!ALLOWED_GATEWAY_PROVIDERS.has(gatewayProvider)) {
      return {
        error: true,
        message: "Invalid gateway provider",
        code: "INVALID_GATEWAY_PROVIDER",
      };
    }

    return {
      error: false,
      data: {
        payment_method: "card",
        payment_source: "manual_entry",
        gateway_provider: gatewayProvider,
        card_last4:
          sanitizeDigits(body.card_last4 || body.card_number, 19).slice(-4) ||
          null,
        card_expiry: sanitizeText(body.card_expiry, 10) || null,
        cardholder_name:
          sanitizeText(body.cardholder_name || body.card_name, 120) || null,
      },
    };
  }

  return {
    error: false,
    data: {
      payment_method: "cod",
      payment_source: "manual_entry",
      gateway_provider: "manual",
      note: "Cash on delivery",
    },
  };
}

async function getOrCreateTrackingId(client, cartUserId) {
  const q = `
    SELECT DISTINCT ON (tracking_id) tracking_id, updated_at
    FROM ${CART_TABLE}
    WHERE user_id = $1
      AND status = 'active'
    ORDER BY tracking_id, updated_at DESC
  `;
  const r = await client.query(q, [cartUserId]);

  if (!r.rows.length) return generateTrackingId();

  const trackingId = r.rows[0].tracking_id;

  if (r.rows.length > 1) {
    await client.query(
      `
      UPDATE ${CART_TABLE}
      SET tracking_id = $1,
          updated_at = NOW()
      WHERE user_id = $2
        AND status = 'active'
      `,
      [trackingId, cartUserId]
    );
  }

  return trackingId;
}

async function fetchActiveCartRows(client, cartUserId, lock = false) {
  let q = `
    SELECT
      c.id,
      c.tracking_id,
      c.product_id AS cart_product_id,
      c.variant_id,
      c.quantity,
      c.price,
      c.status,
      c.created_at,
      c.updated_at
    FROM ${CART_TABLE} c
    WHERE c.status = 'active'
      AND c.user_id = $1
  `;

  q += `
    ORDER BY c.created_at ASC
    ${lock ? "FOR UPDATE OF c" : ""}
  `;

  const r = await client.query(q, [cartUserId]);
  return r.rows || [];
}

async function claimGuestCartRows(client, cartUserId, guestToken) {
  if (!cartUserId || !guestToken) return 0;

  const result = await client.query(
    `
    UPDATE ${CART_TABLE}
    SET user_id = $1,
        updated_at = NOW()
    WHERE guest_token = $2
      AND status = 'active'
      AND COALESCE(user_id::text, '') = ''
    `,
    [cartUserId, guestToken]
  );

  return Number(result.rowCount || 0);
}

async function resolveCheckoutItem(client, cartRow, lockVariant = false) {
  const cartProductId =
    cartRow.cart_product_id != null ? Number(cartRow.cart_product_id) : null;
  const variantId = cartRow.variant_id != null ? Number(cartRow.variant_id) : null;

  let variantRow = null;

  if (variantId) {
    const q = `
      SELECT
        pv.id AS variant_id,
        pv.product_id,
        pv.name AS variant_name,
        pv.sku,
        pv.price,
        pv.sale_price,
        pv.discount_type,
        pv.discount_value,
        pv.vat_rate,
        pv.vat_included,
        pv.stock,
        pv.is_active,
        p.name AS product_name,
        p.brand AS product_brand,
        (
          SELECT filename
          FROM ${VARIANT_MEDIA_TABLE}
          WHERE variant_id = pv.id
          ORDER BY id ASC
          LIMIT 1
        ) AS variant_image
      FROM ${PRODUCT_VARIANTS_TABLE} pv
      LEFT JOIN ${PRODUCTS_TABLE} p ON p.id = pv.product_id
      WHERE pv.id = $1
      ${cartProductId ? "AND pv.product_id = $2" : ""}
      ${lockVariant ? "FOR UPDATE OF pv" : ""}
      LIMIT 1
    `;
    const params = cartProductId ? [variantId, cartProductId] : [variantId];
    const r = await client.query(q, params);

    if (!r.rows.length) {
      throw {
        code: "VARIANT_NOT_FOUND",
        message: "Variant not found during checkout",
        debug: { variant_id: variantId, product_id: cartProductId },
      };
    }

    variantRow = r.rows[0];
  } else {
    if (!cartProductId) {
      throw {
        code: "INVALID_CART_ROW",
        message: "Cart row missing product reference",
        debug: { cart_id: cartRow.id },
      };
    }

    const activeFilter = ONLY_ACTIVE_VARIANTS_FOR_SELECTION
      ? "AND pv.is_active = TRUE"
      : "";

    const q = `
      SELECT
        pv.id AS variant_id,
        pv.product_id,
        pv.name AS variant_name,
        pv.sku,
        pv.price,
        pv.sale_price,
        pv.discount_type,
        pv.discount_value,
        pv.vat_rate,
        pv.vat_included,
        pv.stock,
        pv.is_active,
        p.name AS product_name,
        p.brand AS product_brand,
        (
          SELECT filename
          FROM ${VARIANT_MEDIA_TABLE}
          WHERE variant_id = pv.id
          ORDER BY id ASC
          LIMIT 1
        ) AS variant_image
      FROM ${PRODUCT_VARIANTS_TABLE} pv
      LEFT JOIN ${PRODUCTS_TABLE} p ON p.id = pv.product_id
      WHERE pv.product_id = $1
      ${activeFilter}
      ORDER BY pv.is_default DESC, pv.price ASC, pv.id ASC
      ${lockVariant ? "FOR UPDATE OF pv" : ""}
      LIMIT 1
    `;
    const r = await client.query(q, [cartProductId]);

    if (!r.rows.length) {
      throw {
        code: "PRODUCT_NOT_FOUND",
        message: "No available variant found for product during checkout",
        debug: { product_id: cartProductId, cart_id: cartRow.id },
      };
    }

    variantRow = r.rows[0];
  }

  if (!variantRow.is_active && ONLY_ACTIVE_VARIANTS_FOR_SELECTION) {
    throw {
      code: "VARIANT_NOT_ACTIVE",
      message: "Variant is not active",
      debug: {
        variant_id: variantRow.variant_id,
        product_id: variantRow.product_id,
      },
    };
  }

  const basePrice = Number(variantRow.price ?? 0);
  const discountPercent = resolveDiscountPercent(
    variantRow.discount_type,
    variantRow.discount_value,
    basePrice
  );
  const vatPercent = Number(variantRow.vat_rate ?? 0);
  const priceInfo = calculateFinalPrice(basePrice, discountPercent, vatPercent);

  const qty = Number(cartRow.quantity || 0);
  const lineTotal = +(priceInfo.finalPrice * qty).toFixed(2);
  const lineDiscount = +(priceInfo.discountValue * qty).toFixed(2);
  const lineVat = +(priceInfo.vatValue * qty).toFixed(2);
  const lineBase = +(basePrice * qty).toFixed(2);

  return {
    cart_id: Number(cartRow.id),
    cart_product_id: cartProductId,
    product_id: Number(variantRow.product_id),
    variant_id: Number(variantRow.variant_id),
    product_name: variantRow.product_name || "Product",
    variant_name: variantRow.variant_name || null,
    sku: variantRow.sku || null,
    brand: variantRow.product_brand || null,
    image: variantRow.variant_image || null,
    quantity: qty,
    stock: Number(variantRow.stock || 0),
    base_price: basePrice,
    discount_percent: discountPercent,
    vat_percent: vatPercent,
    unit_price: priceInfo.finalPrice,
    discount_amount: lineDiscount,
    vat_amount: lineVat,
    base_amount: lineBase,
    line_total: lineTotal,
  };
}

async function buildCheckoutSummary(client, cartUserId) {
  const cartRows = await fetchActiveCartRows(client, cartUserId, false);
  const items = [];
  let subtotal = 0;
  let discountTotal = 0;
  let vatTotal = 0;
  let grandTotal = 0;

  for (const row of cartRows) {
    const item = await resolveCheckoutItem(client, row, false);
    items.push(item);
    subtotal += item.base_amount;
    discountTotal += item.discount_amount;
    vatTotal += item.vat_amount;
    grandTotal += item.line_total;
  }
  return {
    cartItems: items,
    summary: {
      itemCount: items.reduce((a, b) => a + Number(b.quantity || 0), 0),
      subtotal: +subtotal.toFixed(2),
      discountTotal: +discountTotal.toFixed(2),
      vatTotal: +vatTotal.toFixed(2),
      grandTotal: +grandTotal.toFixed(2),
      currency: "AED",
    },
  };
}

async function buildCheckoutPageModel(req, client, identity) {
  await claimGuestCartRows(client, identity.cartUserId, identity.guestToken);

  const [viewData, savedPaymentMethods, savedAddresses, trackingId] =
    await Promise.all([
      buildCheckoutSummary(client, identity.cartUserId),
      fetchSavedPaymentMethods(client, identity.userId),
      fetchSavedAddresses(client, identity.userId),
      getOrCreateTrackingId(client, identity.cartUserId),
    ]);

  const selectedSavedPaymentMethod =
    savedPaymentMethods.find((m) => m.is_default) || savedPaymentMethods[0] || null;
  const selectedSavedAddress =
    savedAddresses.find((a) => a.is_default) || savedAddresses[0] || null;

  return buildDefaultView({
    ...viewData,
    csrfToken: req.csrfToken ? req.csrfToken() : "",
    customer: identity.customer || null,
    profile: buildCustomerProfile(req), 
    savedPaymentMethods,
    savedAddresses,
    selectedSavedPaymentMethod,
    selectedSavedAddress,
    trackingId,
    checkoutSteps: [
      { key: "cart", label: "Cart Review", done: true },
      { key: "details", label: "Billing & Shipping", done: false },
      { key: "payment", label: "Payment Method", done: false },
      // { key: "review", label: "Review & Confirm", done: false },
    ],
  });
}

function normalizeAppUrl() {
  return (process.env.APP_URL || "http://localhost:4000").replace(/\/+$/, "");
}

function buildStripeLineItems(items) {
  return items.map((item) => ({
    price_data: {
      currency: "aed",
      product_data: {
        name: item.product_name || "Product",
        description: item.variant_name || undefined,
      },
      unit_amount: Math.round((Number(item.unit_price) || 0) * 100),
    },
    quantity: Number(item.quantity || 1),
  }));
}

function buildGatewayPayload({
  orderNumber,
  paymentReference,
  paymentMethod,
  gatewayProvider,
  grandTotal,
  customer_name,
  email,
  phone,
}) {
  return {
    order_number: orderNumber,
    payment_reference: paymentReference,
    payment_method: paymentMethod,
    gateway_provider: gatewayProvider,
    amount: grandTotal,
    currency: "AED",
    customer: {
      name: customer_name,
      email: email || null,
      phone,
    },
  };
}


exports.getCheckoutPage = async (req, res) => {
  let client;
  try {
    const identity = resolveIdentity(req);
    if (identity.error) {
      return res.status(401).render(
        "customer/checkout",
        buildDefaultView({
          errorMessage: identity.message,
          csrfToken: req.csrfToken ? req.csrfToken() : "",
          customer: null,
        })
      );
    }

    client = await pool.connect();
    const viewData = await buildCheckoutPageModel(req, client, identity);
    return res.render("customer/checkout", viewData);
  } catch (err) {
    console.error("GET CHECKOUT ERROR:", err && err.stack ? err.stack : err);
    return res.status(500).render(
      "customer/checkout",
      buildDefaultView({
        errorMessage: "Failed to load checkout page",
        csrfToken: req.csrfToken ? req.csrfToken() : "",
      })
    );
  } finally {
    if (client) client.release();
  }
};

exports.getCheckoutData = async (req, res) => {
  let client;
  try {
    const identity = resolveIdentity(req);
    if (identity.error) {
      return res.status(401).json(identity);
    }

    client = await pool.connect();
    const model = await buildCheckoutPageModel(req, client, identity);
    return res.json({ success: true, data: model });
  } catch (err) {
    console.error("GET CHECKOUT DATA ERROR:", err && err.stack ? err.stack : err);
    return res.status(500).json({ success: false, message: "Failed to load checkout data" });
  } finally {
    if (client) client.release();
  }
};

exports.createPaymentSession = async (req, res) => {
  let client;
  try {
    const identity = resolveIdentity(req);
    if (identity.error) {
      return res.status(401).json(identity);
    }

    const userId = identity.userId;
    const cartUserId = identity.cartUserId;

    const payment_method = sanitizeText(req.body.payment_method, 30).toLowerCase();
    if (payment_method !== "card") {
      return invalidInput(res, "Only card payments are supported through Stripe checkout.", "INVALID_PAYMENT_METHOD");
    }

    const gateway_provider = sanitizeText(req.body.gateway_provider, 30).toLowerCase() || "stripe";
    if (gateway_provider !== "stripe") {
      return invalidInput(res, "Invalid gateway provider", "INVALID_GATEWAY_PROVIDER");
    }

    const customer_name = sanitizeText(req.body.customer_name, 150);
    const email = sanitizeEmail(req.body.email);
    const phone = sanitizePhone(req.body.phone);

    if (!customer_name) return invalidInput(res, "Customer name is required", "CUSTOMER_NAME_REQUIRED");
    if (!phone) return invalidInput(res, "Phone is required", "PHONE_REQUIRED");

    const billingAddress = buildAddressObject(req.body);
    const shippingAddress = buildAddressObject(req.body);
    const notes = sanitizeText(req.body.notes, 500);

    if (
      !billingAddress.country ||
      !billingAddress.emirate ||
      !billingAddress.city ||
      !billingAddress.address_line1 ||
      !shippingAddress.address_line1
    ) {
      return invalidInput(
        res,
        "Country, Emirate, City and Address are required",
        "ADDRESS_REQUIRED"
      );
    }

    if (billingAddress.latitude !== null && billingAddress.longitude !== null) {
      billingAddress.location_source = billingAddress.location_source || "gps";
    }
    if (shippingAddress.latitude !== null && shippingAddress.longitude !== null) {
      shippingAddress.location_source = shippingAddress.location_source || "gps";
    }

    client = await pool.connect();
    await client.query("BEGIN");

    await claimGuestCartRows(client, cartUserId, identity.guestToken);
    const trackingId = await getOrCreateTrackingId(client, cartUserId);
    const lockedCartRows = await fetchActiveCartRows(client, cartUserId, true);

    if (!lockedCartRows.length) {
      await client.query("ROLLBACK").catch(() => {});
      return invalidInput(res, "Cart is empty", "CART_EMPTY");
    }

    const items = [];
    let subtotal = 0;
    let discountTotal = 0;
    let vatTotal = 0;
    let grandTotal = 0;
    let totalQty = 0;

    for (const row of lockedCartRows) {
      const item = await resolveCheckoutItem(client, row, true);

      if (item.quantity < 1) {
        throw {
          code: "INVALID_QTY",
          message: "Invalid item quantity in cart",
          debug: { cart_id: item.cart_id },
        };
      }

      if (item.quantity > item.stock) {
        throw {
          code: "INSUFFICIENT_STOCK",
          message: `Only ${item.stock} item(s) available for ${item.product_name}`,
          debug: {
            cart_id: item.cart_id,
            variant_id: item.variant_id,
            requested: item.quantity,
            stock: item.stock,
          },
        };
      }

      items.push(item);
      subtotal += item.base_amount;
      discountTotal += item.discount_amount;
      vatTotal += item.vat_amount;
      grandTotal += item.line_total;
      totalQty += item.quantity;
    }

    subtotal = +subtotal.toFixed(2);
    discountTotal = +discountTotal.toFixed(2);
    vatTotal = +vatTotal.toFixed(2);
    grandTotal = +grandTotal.toFixed(2);

    const orderNumber = generateOrderNumber();
    const paymentReference = generatePaymentReference();

    const order_status = "pending_payment";
    const payment_status = "initiated";

    const orderInsert = await client.query(
      `
      INSERT INTO ${ORDERS_TABLE} (
        order_number,
        tracking_id,
        user_id,
        customer_name,
        email,
        phone,
        payment_method,
        payment_status,
        order_status,
        currency,
        subtotal_amount,
        discount_amount,
        vat_amount,
        grand_total,
        billing_address,
        shipping_address,
        notes,
        payment_reference,
        gateway_provider,
        created_at,
        updated_at
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,'AED',$10,$11,$12,$13,$14::jsonb,$15::jsonb,$16,$17,$18,NOW(),NOW()
      )
      RETURNING id, order_number, tracking_id
      `,
      [
        orderNumber,
        trackingId,
        userId,
        customer_name,
        email || null,
        phone,
        payment_method,
        payment_status,
        order_status,
        subtotal,
        discountTotal,
        vatTotal,
        grandTotal,
        JSON.stringify({ ...buildOrderJsonAddress(billingAddress), ip: getClientIP(req) }),
        JSON.stringify({ ...buildOrderJsonAddress(shippingAddress), ip: getClientIP(req) }),
        notes || null,
        paymentReference,
        gateway_provider,
      ]
    );

    const orderId = orderInsert.rows[0].id;
    const finalOrderNumber = orderInsert.rows[0].order_number;
    const finalTrackingId = orderInsert.rows[0].tracking_id || trackingId;

    for (const item of items) {
      await client.query(
        `
        INSERT INTO ${ORDER_ITEMS_TABLE} (
          order_id,
          cart_id,
          product_id,
          variant_id,
          product_name,
          variant_name,
          sku,
          quantity,
          unit_price,
          discount_amount,
          vat_amount,
          line_total,
          created_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())
        `,
        [
          orderId,
          item.cart_id,
          item.product_id,
          item.variant_id,
          item.product_name,
          item.variant_name,
          item.sku,
          item.quantity,
          item.unit_price,
          item.discount_amount,
          item.vat_amount,
          item.line_total,
        ]
      );
    }

    await client.query(
      `
      INSERT INTO ${ORDER_PAYMENTS_TABLE} (
        order_id,
        provider,
        payment_method,
        transaction_reference,
        amount,
        currency,
        status,
        gateway_response,
        created_at,
        updated_at
      )
      VALUES ($1,$2,$3,$4,$5,'AED',$6,$7::jsonb,NOW(),NOW())
      RETURNING id
      `,
      [
        orderId,
        gateway_provider,
        payment_method,
        paymentReference,
        grandTotal,
        payment_status,
        JSON.stringify({
          gateway_provider,
          payment_method,
          payment_source: "stripe_checkout",
          stripe_order_number: finalOrderNumber,
          stripe_payment_reference: paymentReference,
          amounts: {
            subtotal,
            discountTotal,
            vatTotal,
            grandTotal,
          },
        }),
      ]
    );

    await client.query(
      `
      UPDATE ${CART_TABLE}
      SET status = 'ordered',
          order_id = $1,
          ordered_at = NOW(),
          updated_at = NOW()
      WHERE id = ANY($2::bigint[])
      `,
      [orderId, lockedCartRows.map((r) => r.id)]
    );

    await saveAddressForLater(
      client,
      userId,
      req.body,
      billingAddress,
      { order_number: finalOrderNumber }
    );

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      line_items: buildStripeLineItems(items),
      customer_email: email || undefined,
      client_reference_id: String(orderId),
      metadata: {
        order_id: String(orderId),
        order_number: finalOrderNumber,
        user_id: String(userId),
      },
      success_url: `${normalizeAppUrl()}/customer/checkout/success/${encodeURIComponent(finalOrderNumber)}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${normalizeAppUrl()}/customer/checkout`,
    });

    await client.query(
      `
      UPDATE ${ORDER_PAYMENTS_TABLE}
      SET gateway_response = COALESCE(gateway_response, '{}'::jsonb) || $1::jsonb,
          updated_at = NOW()
      WHERE order_id = $2
      `,
      [
        JSON.stringify({
          stripe_session_id: session.id,
          stripe_payment_intent_id: session.payment_intent || null,
          stripe_checkout_url: session.url || null,
          updated_at: new Date().toISOString(),
        }),
        orderId,
      ]
    );

    await client.query("COMMIT");

    return res.json({
      success: true,
      redirect_url: session.url,
      checkout_url: session.url,
      url: session.url,
      session_id: session.id,
      order_number: finalOrderNumber,
      tracking_id: finalTrackingId,
      total_amount: grandTotal,
      total_items: totalQty,
    });
  } catch (err) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    console.error("CREATE PAYMENT SESSION ERROR:", err && err.stack ? err.stack : err);
    return res.status(500).json({
      success: false,
      message: "Failed to create Stripe payment session.",
      error_code: "STRIPE_SESSION_FAILED",
      debug: err.message || null,
    });
  } finally {
    if (client) client.release();
  }
};

// Customer Clicks Pay
//         │
//         ▼
// Validate User
//         │
//         ▼
// Validate Cart
//         │
//         ▼
// Check Stock
//         │
//         ▼
// Calculate Totals
//         │
//         ▼
// Create Order
//         │
//         ▼
// Create Order Items
//         │
//         ▼
// Create Payment Record
//         │
//         ▼
// Create Stripe Session
//         │
//         ▼
// Save Session ID
//         │
//         ▼
// COMMIT
//         │
//         ▼
// Return Stripe URL
//         │
//         ▼
// Customer Redirected To Stripe
//         │
//         ▼
// Pays By Visa/MasterCard
//         │
//         ▼
// Stripe Redirects To Success Page
//         │
//         ▼
// Webhook Marks Order As Paid

exports.placeOrder = async (req, res) => {
  let client;

  try {
    debugIdentity(req, "placeOrder:start");

    const identity = resolveIdentity(req);
    if (identity.error) {
      if (req.accepts("html")) {
        return res.status(401).render(
          "customer/checkout",
          buildDefaultView({
            errorMessage: identity.message,
            csrfToken: req.csrfToken ? req.csrfToken() : "",
            customer: null,
          })
        );
      }
      return res.status(401).json(identity);
    }

    const userId = identity.userId;
    const cartUserId = identity.cartUserId;

    const payment_method = sanitizeText(req.body.payment_method, 30).toLowerCase();
    if (!ALLOWED_PAYMENT_METHODS.has(payment_method)) {
      return invalidInput(res, "Invalid payment method", "INVALID_PAYMENT_METHOD");
    }

    const gateway_provider =
      sanitizeText(req.body.gateway_provider, 30).toLowerCase() || "manual";
    if (!ALLOWED_GATEWAY_PROVIDERS.has(gateway_provider)) {
      return invalidInput(res, "Invalid gateway provider", "INVALID_GATEWAY_PROVIDER");
    }

    if (payment_method === "card") {
      if (req.accepts("html")) {
        return res.status(400).render(
          "customer/checkout",
          buildDefaultView({
            errorMessage:
              "Online card payments are handled through Stripe checkout. Please use the secure payment button.",
            csrfToken: req.csrfToken ? req.csrfToken() : "",
            customer: identity.customer || null,
          })
        );
      }

      return invalidInput(
        res,
        "Online card payments are handled through Stripe checkout. Please use the secure payment button.",
        "STRIPE_CHECKOUT_REQUIRED"
      );
    }

    client = await pool.connect();

    const savedPaymentMethods = await fetchSavedPaymentMethods(client, userId);
    const paymentDetails = buildPaymentDetails(payment_method, req.body, savedPaymentMethods);
    if (paymentDetails.error) {
      return invalidInput(res, paymentDetails.message, paymentDetails.code);
    }

    const customer_name = sanitizeText(req.body.customer_name, 150);
    const email = sanitizeEmail(req.body.email);
    const phone = sanitizePhone(req.body.phone);

    if (!customer_name) return invalidInput(res, "Customer name is required", "CUSTOMER_NAME_REQUIRED");
    if (!phone) return invalidInput(res, "Phone is required", "PHONE_REQUIRED");

    const billingAddress = buildAddressObject(req.body);
    const shippingAddress = buildAddressObject(req.body);
    const notes = sanitizeText(req.body.notes, 500);

    if (
      !billingAddress.country ||
      !billingAddress.emirate ||
      !billingAddress.city ||
      !billingAddress.address_line1 || !shippingAddress.address_line1
    ) {
      return invalidInput(
        res,
        "Country, Emirate, City and Address are required",
        "ADDRESS_REQUIRED"
      );
    }

    if (billingAddress.latitude !== null && billingAddress.longitude !== null) {
      billingAddress.location_source = billingAddress.location_source || "gps";
    }
    if (shippingAddress.latitude !== null && shippingAddress.longitude !== null) {
      shippingAddress.location_source = shippingAddress.location_source || "gps";
    }

    await client.query("BEGIN");

    await claimGuestCartRows(client, cartUserId, identity.guestToken);
    const trackingId = await getOrCreateTrackingId(client, cartUserId);
    const lockedCartRows = await fetchActiveCartRows(client, cartUserId, true);

    if (!lockedCartRows.length) {
      await client.query("ROLLBACK").catch(() => {});
      if (req.accepts("html")) {
        return res.status(400).render(
          "customer/checkout",
          buildDefaultView({
            errorMessage: "Cart is empty",
            csrfToken: req.csrfToken ? req.csrfToken() : "",
            customer: identity.customer || null,
          })
        );
      }

      return res.status(400).json({
        success: false,
        message: "Cart is empty",
        error_code: "CART_EMPTY",
      });
    }

    const items = [];
    let subtotal = 0;
    let discountTotal = 0;
    let vatTotal = 0;
    let grandTotal = 0;
    let totalQty = 0;

    for (const row of lockedCartRows) {
      const item = await resolveCheckoutItem(client, row, true);

      if (item.quantity < 1) {
        throw {
          code: "INVALID_QTY",
          message: "Invalid item quantity in cart",
          debug: { cart_id: item.cart_id },
        };
      }

      if (item.quantity > item.stock) {
        throw {
          code: "INSUFFICIENT_STOCK",
          message: `Only ${item.stock} item(s) available for ${item.product_name}`,
          debug: {
            cart_id: item.cart_id,
            variant_id: item.variant_id,
            requested: item.quantity,
            stock: item.stock,
          },
        };
      }

      items.push(item);
      subtotal += item.base_amount;
      discountTotal += item.discount_amount;
      vatTotal += item.vat_amount;
      grandTotal += item.line_total;
      totalQty += item.quantity;
    }

    subtotal = +subtotal.toFixed(2);
    discountTotal = +discountTotal.toFixed(2);
    vatTotal = +vatTotal.toFixed(2);
    grandTotal = +grandTotal.toFixed(2);

    const orderNumber = generateOrderNumber();
    const paymentReference = generatePaymentReference();

    const order_status = payment_method === "cod" ? "placed" : "pending_payment";
    const payment_status = payment_method === "cod" ? "pending" : "initiated";

    const orderInsert = await client.query(
      `
      INSERT INTO ${ORDERS_TABLE} (
        order_number,
        tracking_id,
        user_id,
        customer_name,
        email,
        phone,
        payment_method,
        payment_status,
        order_status,
        currency,
        subtotal_amount,
        discount_amount,
        vat_amount,
        grand_total,
        billing_address,
        shipping_address,
        notes,
        payment_reference,
        gateway_provider,
        created_at,
        updated_at
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,'AED',$10,$11,$12,$13,$14::jsonb,$15::jsonb,$16,$17,$18,NOW(),NOW()
      )
      RETURNING id, order_number, tracking_id
      `,
      [
        orderNumber,
        trackingId,
        userId,
        customer_name,
        email || null,
        phone,
        payment_method,
        payment_status,
        order_status,
        subtotal,
        discountTotal,
        vatTotal,
        grandTotal,
        JSON.stringify({ ...buildOrderJsonAddress(billingAddress), ip: getClientIP(req) }),
        JSON.stringify({ ...buildOrderJsonAddress(shippingAddress), ip: getClientIP(req) }),
        notes || null,
        paymentReference,
        gateway_provider,
      ]
    );

    const orderId = orderInsert.rows[0].id;
    const finalOrderNumber = orderInsert.rows[0].order_number;
    const finalTrackingId = orderInsert.rows[0].tracking_id || trackingId;

    for (const item of items) {
      await client.query(
        `
        INSERT INTO ${ORDER_ITEMS_TABLE} (
          order_id,
          cart_id,
          product_id,
          variant_id,
          product_name,
          variant_name,
          sku,
          quantity,
          unit_price,
          discount_amount,
          vat_amount,
          line_total,
          created_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())
        `,
        [
          orderId,
          item.cart_id,
          item.product_id,
          item.variant_id,
          item.product_name,
          item.variant_name,
          item.sku,
          item.quantity,
          item.unit_price,
          item.discount_amount,
          item.vat_amount,
          item.line_total,
        ]
      );

      const stockUpdate = await client.query(
        `
        UPDATE ${PRODUCT_VARIANTS_TABLE}
        SET stock = stock - $1
        WHERE id = $2
          AND stock >= $1
        RETURNING id
        `,
        [item.quantity, item.variant_id]
      );

      if (!stockUpdate.rows.length) {
        throw {
          code: "INSUFFICIENT_STOCK",
          message: `Stock changed during checkout for ${item.product_name}`,
          debug: { variant_id: item.variant_id, cart_id: item.cart_id },
        };
      }
    }

    const gatewayPayload = buildGatewayPayload({
      orderNumber: finalOrderNumber,
      paymentReference,
      paymentMethod: payment_method,
      gatewayProvider: gateway_provider,
      grandTotal,
      customer_name,
      email,
      phone,
    });

    await client.query(
      `
      INSERT INTO ${ORDER_PAYMENTS_TABLE} (
        order_id,
        provider,
        payment_method,
        transaction_reference,
        amount,
        currency,
        status,
        gateway_response,
        created_at,
        updated_at
      )
      VALUES ($1,$2,$3,$4,$5,'AED',$6,$7::jsonb,NOW(),NOW())
      `,
      [
        orderId,
        gateway_provider,
        payment_method,
        paymentReference,
        grandTotal,
        payment_method === "cod" ? "pending" : "initiated",
        JSON.stringify({
          gateway_provider,
          payment_method,
          payment_source: paymentDetails.data.payment_source,
          saved_payment_method_id:
            paymentDetails.data.saved_payment_method_id || null,
          note:
            payment_method === "cod"
              ? "Cash on delivery"
              : "Card payment",
                    details: paymentDetails.data,
          gateway_payload: gatewayPayload,
        }),
      ]
    );

    await client.query(
      `
      UPDATE ${CART_TABLE}
      SET status = 'ordered',
          order_id = $1,
          ordered_at = NOW(),
          updated_at = NOW()
      WHERE id = ANY($2::bigint[])
      `,
      [orderId, lockedCartRows.map((r) => r.id)]
    );

    const savedAddressId = await saveAddressForLater(
      client,
      userId,
      req.body,
      billingAddress,
      { order_number: finalOrderNumber }
    );

    const savedPaymentMethodId = await savePaymentMethodForLater(
      client,
      userId,
      req.body,
      paymentDetails.data,
      { order_number: finalOrderNumber }
    );

    await client.query("COMMIT");

    const trackerUrl = `/track-order/${encodeURIComponent(finalTrackingId)}`;

    emitSocket(req, "orderCreated", {
      order_number: finalOrderNumber,
      tracking_id: finalTrackingId,
      order_id: orderId,
      userId,
      total_amount: grandTotal,
      payment_method,
      payment_status,
      order_status,
      trackerUrl,
    });

    emitSocket(req, "orderTrackingUpdated", {
      order_number: finalOrderNumber,
      tracking_id: finalTrackingId,
      stage: "placed",
      status: order_status,
      payment_status,
      userId,
    });

    emitSocket(req, "cartUpdated", {
      userId,
      order_number: finalOrderNumber,
      tracking_id: finalTrackingId,
      action: "ordered",
    });

    // if (req.accepts("html")) {
    //   return res.redirect(`/checkout/success/${encodeURIComponent(finalOrderNumber)}`);
    // }
    if (req.accepts("html")) {
      return res.redirect(`/customer/checkout/success/${encodeURIComponent(finalOrderNumber)}`);
    }

    return res.json({
      success: true,
      message: "Order placed successfully",
      order_number: finalOrderNumber,
      tracking_id: finalTrackingId,
      payment_reference: paymentReference,
      payment_method,
      gateway_provider,
      payment_status,
      order_status,
      total_items: totalQty,
      total_amount: grandTotal,
      tracker_url: trackerUrl,
      saved_address_id: savedAddressId?.id || null,
      saved_payment_method_id: savedPaymentMethodId?.id || null,
    });
  } catch (err) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    console.error("PLACE ORDER ERROR:", err && err.stack ? err.stack : err);

    const message =
      err.code === "INSUFFICIENT_STOCK"
        ? err.message
        : err.code === "VARIANT_NOT_FOUND"
        ? err.message
        : err.code === "VARIANT_NOT_ACTIVE"
        ? err.message
        : err.code === "CART_EMPTY"
        ? err.message
        : err.code === "INVALID_QTY"
        ? err.message
        : err.code === "CARD_DETAILS_REQUIRED"
        ? err.message
        : err.code === "CARD_NUMBER_INVALID"
        ? err.message
        : err.code === "CARD_EXPIRY_INVALID"
        ? err.message
        : err.code === "CARD_CVV_INVALID"
        ? err.message
        : err.code === "INVALID_GATEWAY_PROVIDER"
        ? err.message
        : err.code === "AUTH_REQUIRED"
        ? err.message
        : err.code === "ADDRESS_REQUIRED"
        ? err.message
        : err.code === "CUSTOMER_NAME_REQUIRED"
        ? err.message
        : err.code === "PHONE_REQUIRED"
        ? err.message
        : "Server error";

    if (req.accepts("html")) {
      let viewData = buildDefaultView({
        errorMessage: message,
        csrfToken: req.csrfToken ? req.csrfToken() : "",
        customer: req.session?.user || null,
      });

      try {
        const identity = resolveIdentity(req);
        if (!identity.error) {
          const client2 = await pool.connect();
          try {
            viewData = buildDefaultView({
              ...viewData,
              ...(await buildCheckoutPageModel(req, client2, identity)),
            });
          } finally {
            client2.release();
          }
        }
      } catch {
        // ignore
      }

      return res.status(400).render("customer/checkout", viewData);
    }

    return res.status(500).json({
      success: false,
      message,
      error_code: err.code || "SERVER_ERROR",
      debug: err.debug || null,
    });
  } finally {
    if (client) client.release();
  }
};

exports.getOrderSuccess = async (req, res) => {
  let client;
  try {
    debugIdentity(req, "getOrderSuccess:start");

    const identity = resolveIdentity(req);
    if (identity.error) {
      return res.status(401).render(
        "customer/checkout",
        buildDefaultView({
          errorMessage: identity.message,
          csrfToken: req.csrfToken ? req.csrfToken() : "",
        })
      );
    }

    const orderNumber = sanitizeText(req.params.order_number, 32);
    if (!orderNumber) {
      return res.status(400).render(
        "customer/checkout",
        buildDefaultView({
          errorMessage: "Invalid order number",
          csrfToken: req.csrfToken ? req.csrfToken() : "",
        })
      );
    }

    client = await pool.connect();

    const r = await client.query(
      `
      SELECT id, order_number, tracking_id, customer_name, phone, email, grand_total, currency, payment_method, payment_status, order_status, created_at
      FROM ${ORDERS_TABLE}
      WHERE order_number = $1
        AND user_id = $2
      LIMIT 1
      `,
      [orderNumber, identity.userId]
    );

    if (!r.rows.length) {
      return res.status(404).render(
        "customer/checkout",
        buildDefaultView({
          errorMessage: "Order not found",
          csrfToken: req.csrfToken ? req.csrfToken() : "",
        })
      );
    }

    const order = r.rows[0];
    const trackerUrl = `/track-order/${encodeURIComponent(order.tracking_id || order.order_number)}`;

    const successMessage =
      order.payment_method === "cod"
        ? "Thank you for your order. Your order has been confirmed and will be processed shortly. Payment will be collected when your order is delivered."
        : order.payment_status === "paid"
          ? "Thank you for your payment. Your order has been confirmed and is now being prepared for dispatch."
          : "Your order has been received and your payment is currently being processed. We'll notify you as soon as payment confirmation is complete.";
          
    return res.render(
      "customer/checkout",
      buildDefaultView({
        successMessage,
        orderPlaced: true,
        orderNumber: order.order_number,
        orderData: order,
        trackingId: order.tracking_id || null,
        trackerUrl,
        csrfToken: req.csrfToken ? req.csrfToken() : "",
        customer: req.session?.user || null,
      })
    );
  } catch (err) {
    console.error("ORDER SUCCESS ERROR:", err && err.stack ? err.stack : err);
    return res.status(500).render(
      "customer/checkout",
      buildDefaultView({
        errorMessage: "Server error",
        csrfToken: req.csrfToken ? req.csrfToken() : "",
      })
    );
  } finally {
    if (client) client.release();
  }
};

exports.getOrderTrackData = async (req, res) => {
  let client;
  try {
    const identity = resolveIdentity(req);
    if (identity.error) {
      return res.status(401).json(identity);
    }

    const orderNumber = sanitizeText(
      req.params.order_number || req.query.order_number,
      40
    );
    const trackingId = sanitizeText(
      req.params.tracking_id || req.query.tracking_id,
      40
    );

    if (!orderNumber && !trackingId) {
      return invalidInput(
        res,
        "Order number or tracking ID is required",
        "TRACKER_IDENTIFIER_REQUIRED"
      );
    }

    client = await pool.connect();

    const r = await client.query(
      `
      SELECT
        id,
        order_number,
        tracking_id,
        customer_name,
        grand_total,
        currency,
        payment_method,
        payment_status,
        order_status,
        created_at,
        updated_at
      FROM ${ORDERS_TABLE}
      WHERE (
        ($1 IS NOT NULL AND order_number = $1)
        OR
        ($2 IS NOT NULL AND tracking_id = $2)
      )
      AND user_id = $3
      LIMIT 1
      `,
      [orderNumber || null, trackingId || null, identity.userId]
    );

    if (!r.rows.length) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
        error_code: "ORDER_NOT_FOUND",
      });
    }

    const order = r.rows[0];

    emitSocket(req, "orderTrackingViewed", {
      order_number: order.order_number,
      tracking_id: order.tracking_id,
      userId: identity.userId,
      viewed_at: new Date().toISOString(),
    });

    return res.json({
      success: true,
      data: order,
    });
  } catch (err) {
    console.error("GET ORDER TRACK DATA ERROR:", err && err.stack ? err.stack : err);
    return res.status(500).json({ success: false, message: "Failed to load tracker data" });
  } finally {
    if (client) client.release();
  }
};

exports.getCheckoutSummary = exports.getCheckoutData;
exports.getCheckoutModel = exports.getCheckoutData;
exports.placeCheckoutOrder = exports.placeOrder;
exports.getOrderSuccessPage = exports.getOrderSuccess;

/* =========================================================
   SAVED DATA FOR FRONTEND AUTOFILL
========================================================= */

exports.getSavedPaymentMethods = async (req, res, next) => {
  let client;
  try {
    const identity = resolveIdentity(req);
    if (identity.error) {
      return res.status(401).json({ success: false, message: identity.message });
    }

    client = await pool.connect();
    const savedPaymentMethods = await fetchSavedPaymentMethods(client, identity.userId);
    return res.json({ success: true, data: savedPaymentMethods });
  } catch (err) {
    return next(err);
  } finally {
    if (client) client.release();
  }
};

exports.getSavedAddresses = async (req, res, next) => {
  let client;
  try {
    const identity = resolveIdentity(req);
    if (identity.error) {
      return res.status(401).json({ success: false, message: identity.message });
    }

    client = await pool.connect();
    const savedAddresses = await fetchSavedAddresses(client, identity.userId);
    return res.json({ success: true, data: savedAddresses });
  } catch (err) {
    return next(err);
  } finally {
    if (client) client.release();
  }
};

/* =========================================================
   EXTRA HELPERS
========================================================= */

function encryptValue(value) {
  const key = process.env.CARD_ENCRYPTION_KEY;
  if (!key) return null;

  const clean = key.trim();
  let keyBuf = null;

  if (/^[a-f0-9]{64}$/i.test(clean)) {
    keyBuf = Buffer.from(clean, "hex");
  } else {
    const buf = Buffer.from(clean, "base64");
    if (buf.length === 32) keyBuf = buf;
  }

  if (!keyBuf) return null;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", keyBuf, iv);
  const encrypted = Buffer.concat([
    cipher.update(String(value ?? ""), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

exports.__private = {
  toNum,
  sanitizeText,
  sanitizeEmail,
  sanitizePhone,
  sanitizeDigits,
  sanitizeIban,
  maskCardNumber,
  maskIban,
  generateOrderNumber,
  generatePaymentReference,
  generateTrackingId,
  resolveIdentity,
  getSessionCustomer,
  buildAddressObject,
  buildPaymentDetails,
  fetchSavedPaymentMethods,
  fetchSavedAddresses,
  savePaymentMethodForLater,
  saveAddressForLater,
  buildCheckoutPageModel,
  fetchActiveCartRows,
  resolveCheckoutItem,
  buildCheckoutSummary,
  encryptValue,
};
