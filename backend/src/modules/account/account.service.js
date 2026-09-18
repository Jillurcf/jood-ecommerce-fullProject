import { prisma } from "../../lib/prisma.js";
import { createAppError } from "../../common/errors.js";
import { sendMail } from "../../lib/mailer.js";
import {
  generateOtp,
  hashPassword,
  hashToken,
  isStrongPassword,
  isValidEmail,
  isValidFullName,
  isValidPhone,
  normalizeEmail,
  normalizePhone,
  safeHashEquals,
  sanitizeText,
  verifyPassword
} from "../auth/auth.config.js";
import { issueTokenPair } from "../auth/token.service.js";
import { maskCardDisplay } from "../checkout/checkout.config.js";
const OTP_EXPIRES_MINUTES = 10;
const PAID_STATUSES = ["paid", "completed", "captured", "successful", "success"];
const PENDING_STATUSES = ["pending", "initiated", "pending_payment"];
const REFUNDED_STATUSES = ["refunded", "refund", "partially_refunded"];
const toNum = (v, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};
function toProfile(row) {
  const r = row || {};
  return {
    id: Number(r.id),
    user_id: r.userId ? String(r.userId) : null,
    full_name: String(r.fullName ?? ""),
    email: String(r.email ?? ""),
    phone: r.phone ? String(r.phone) : null,
    bio: r.bio ? String(r.bio) : null,
    address: r.address ? String(r.address) : null,
    city: r.city ? String(r.city) : null,
    country: r.country ? String(r.country) : null,
    status: r.status ? String(r.status) : null,
    email_verified: Boolean(r.emailVerified),
    phone_verified: r.phoneVerified == null ? null : Boolean(r.phoneVerified),
    is_online: Boolean(r.isOnline),
    provider: r.provider ? String(r.provider) : null,
    created_at: r.createdAt ? new Date(r.createdAt) : null,
    updated_at: r.updatedAt ? new Date(r.updatedAt) : null
  };
}
async function getProfile(userId) {
  const row = await prisma.customerAccount.findUnique({ where: { id: userId } });
  if (!row) throw createAppError(404, "NOT_FOUND", "Account not found");
  return toProfile(row);
}
async function updateProfile(userId, input) {
  const data = {};
  const checkName = (fullName) => {
    if (fullName !== void 0 && !isValidFullName(fullName)) {
      throw createAppError(422, "VALIDATION_ERROR", "Full name must be between 2 and 80 characters");
    }
  };
  checkName(input.full_name);
  if (input.full_name !== void 0) data.fullName = sanitizeText(input.full_name);
  if (input.phone !== void 0) {
    const phone = normalizePhone(input.phone);
    if (phone && !isValidPhone(phone)) {
      throw createAppError(422, "VALIDATION_ERROR", "Phone number is invalid");
    }
    data.phone = phone || null;
  }
  if (input.bio !== void 0) data.bio = String(input.bio).slice(0, 1e3) || null;
  if (input.address !== void 0) data.address = String(input.address).slice(0, 255) || null;
  if (input.city !== void 0) data.city = String(input.city).slice(0, 100) || null;
  if (input.country !== void 0) data.country = String(input.country).slice(0, 100) || null;
  data.isOnline = true;
  data.lastActivityAt = /* @__PURE__ */ new Date();
  const row = await prisma.customerAccount.update({
    where: { id: userId },
    data
  });
  return toProfile(row);
}
async function getOrders(userId, page = 1, limit = 20) {
  const safePage = Math.max(1, toNum(page, 1));
  const safeLimit = Math.min(100, Math.max(1, toNum(limit, 20)));
  const skip = (safePage - 1) * safeLimit;
  const where = { userId };
  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: safeLimit,
      select: {
        id: true,
        orderNumber: true,
        trackingId: true,
        paymentReference: true,
        customerName: true,
        email: true,
        grandTotal: true,
        currency: true,
        paymentMethod: true,
        paymentStatus: true,
        orderStatus: true,
        gatewayProvider: true,
        createdAt: true,
        updatedAt: true
      }
    }),
    prisma.order.count({ where })
  ]);
  const totalPages = Math.max(1, Math.ceil(total / safeLimit));
  return {
    items: orders,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages,
      hasPrev: safePage > 1,
      hasNext: safePage < totalPages,
      prevPage: safePage > 1 ? safePage - 1 : null,
      nextPage: safePage < totalPages ? safePage + 1 : null
    }
  };
}
async function getOrderDetail(userId, orderNumber) {
  const order = await prisma.order.findFirst({
    where: { orderNumber, userId },
    include: {
      items: { orderBy: { id: "asc" } },
      payments: {
        select: {
          id: true,
          provider: true,
          paymentMethod: true,
          transactionReference: true,
          amount: true,
          currency: true,
          status: true,
          createdAt: true
        }
      }
    }
  });
  if (!order) throw createAppError(404, "NOT_FOUND", "Order not found");
  return order;
}
function validateAddressInput(input) {
  if (input.address === void 0 || !String(input.address).trim()) {
    throw createAppError(422, "VALIDATION_ERROR", "Address is required");
  }
  if (String(input.address).length > 255) {
    throw createAppError(422, "VALIDATION_ERROR", "Address must be 255 characters or fewer");
  }
  if (input.city === void 0 || !String(input.city).trim()) {
    throw createAppError(422, "VALIDATION_ERROR", "City is required");
  }
  if (String(input.city).length > 100) {
    throw createAppError(422, "VALIDATION_ERROR", "City must be 100 characters or fewer");
  }
  if (input.country === void 0 || !String(input.country).trim()) {
    throw createAppError(422, "VALIDATION_ERROR", "Country is required");
  }
  if (String(input.country).length > 100) {
    throw createAppError(422, "VALIDATION_ERROR", "Country must be 100 characters or fewer");
  }
}
async function getAddresses(userId) {
  const account = await prisma.customerAccount.findUnique({
    where: { id: userId },
    select: { id: true, email: true, address: true, city: true, country: true }
  });
  const saved = await prisma.userAddress.findMany({
    where: { userId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      userId: true,
      email: true,
      address: true,
      addressLine1: true,
      landmark: true,
      city: true,
      emirate: true,
      country: true,
      postalCode: true,
      addressType: true,
      isDefault: true,
      createdAt: true,
      updatedAt: true
    }
  });
  const primary = {
    id: 0,
    user_id: userId,
    email: account?.email ?? null,
    address: account?.address ?? "",
    city: account?.city ?? "",
    country: account?.country ?? "",
    is_default: true,
    is_primary: true
  };
  const mapped = saved.map((a) => ({
    id: a.id,
    user_id: a.userId,
    email: a.email,
    address: a.address,
    address_line1: a.addressLine1,
    landmark: a.landmark,
    city: a.city,
    emirate: a.emirate,
    country: a.country,
    postal_code: a.postalCode,
    address_type: a.addressType,
    is_default: a.isDefault,
    created_at: a.createdAt,
    updated_at: a.updatedAt
  }));
  return [primary, ...mapped];
}
async function createAddress(userId, input) {
  validateAddressInput(input);
  const row = await prisma.userAddress.create({
    data: {
      userId,
      email: input.email ? sanitizeText(input.email) : null,
      addressType: input.address_type ? sanitizeText(input.address_type) : null,
      address: sanitizeText(input.address),
      addressLine1: input.address_line1 ? sanitizeText(input.address_line1) : null,
      landmark: input.landmark ? sanitizeText(input.landmark) : null,
      city: sanitizeText(input.city),
      emirate: input.emirate ? sanitizeText(input.emirate) : null,
      country: sanitizeText(input.country),
      postalCode: input.postal_code ? sanitizeText(input.postal_code) : null,
      isDefault: false
    }
  });
  return row;
}
async function updateAddress(userId, id, input) {
  validateAddressInput(input);
  const exists = await prisma.userAddress.findFirst({ where: { id, userId }, select: { id: true } });
  if (!exists) throw createAppError(404, "NOT_FOUND", "Address not found");
  return prisma.userAddress.update({
    where: { id },
    data: {
      address: sanitizeText(input.address),
      city: sanitizeText(input.city),
      country: sanitizeText(input.country),
      addressLine1: input.address_line1 ? sanitizeText(input.address_line1) : void 0,
      landmark: input.landmark ? sanitizeText(input.landmark) : void 0,
      emirate: input.emirate ? sanitizeText(input.emirate) : void 0,
      postalCode: input.postal_code ? sanitizeText(input.postal_code) : void 0,
      addressType: input.address_type ? sanitizeText(input.address_type) : void 0,
      email: input.email ? sanitizeText(input.email) : void 0
    }
  });
}
async function deleteAddress(userId, id) {
  const exists = await prisma.userAddress.findFirst({ where: { id, userId }, select: { id: true } });
  if (!exists) throw createAppError(404, "NOT_FOUND", "Address not found");
  await prisma.userAddress.delete({ where: { id } });
  return { id };
}
async function setDefaultAddress(userId, id) {
  const exists = await prisma.userAddress.findFirst({ where: { id, userId }, select: { id: true } });
  if (!exists) throw createAppError(404, "NOT_FOUND", "Address not found");
  await prisma.$transaction([
    prisma.userAddress.updateMany({ where: { userId }, data: { isDefault: false } }),
    prisma.userAddress.update({ where: { id }, data: { isDefault: true } })
  ]);
  return { id, is_default: true };
}
async function getPaymentMethods(userId) {
  const rows = await prisma.customerPaymentMethod.findMany({
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
      accountEmail: true,
      isDefault: true,
      createdAt: true
    }
  });
  return rows.map((r) => ({
    id: r.id,
    method_type: r.methodType,
    provider: r.provider,
    cardholder_name: r.cardholderName,
    card_brand: r.cardBrand,
    card_last4: r.cardLast4,
    card_number_masked: `**** **** **** ${r.cardLast4 || "****"}`,
    display_name: r.displayName || maskCardDisplay(r.cardBrand, r.cardLast4),
    expiry_month: r.expiryMonth,
    expiry_year: r.expiryYear,
    account_email: r.accountEmail,
    is_default: r.isDefault,
    created_at: r.createdAt
  }));
}
async function deletePaymentMethod(userId, id) {
  const exists = await prisma.customerPaymentMethod.findFirst({
    where: { id, userId },
    select: { id: true }
  });
  if (!exists) throw createAppError(404, "NOT_FOUND", "Payment method not found");
  await prisma.customerPaymentMethod.delete({ where: { id } });
  return { id };
}
const orderSummaryRaw = (userId) => {
  const paid = PAID_STATUSES.map((s) => `'${s}'`).join(",");
  const pending = PENDING_STATUSES.map((s) => `'${s}'`).join(",");
  const refunded = REFUNDED_STATUSES.map((s) => `'${s}'`).join(",");
  return prisma.$queryRawUnsafe(`
    SELECT
      COALESCE(SUM(CASE WHEN payment_status IN (${paid}) THEN grand_total ELSE 0 END), 0) AS total_spent,
      COUNT(CASE WHEN payment_status IN (${paid}) THEN 1 END) AS total_orders_paid,
      COUNT(CASE WHEN payment_status IN (${pending}) THEN 1 END) AS pending_payments,
      COALESCE(SUM(CASE WHEN payment_status IN (${refunded}) THEN grand_total ELSE 0 END), 0) AS refund_total,
      COUNT(CASE WHEN payment_status IN (${refunded}) THEN 1 END) AS refunded_count,
      COALESCE(SUM(CASE WHEN payment_status IN (${paid}) AND created_at >= DATE_FORMAT(NOW(), '%Y-%m-01') THEN grand_total ELSE 0 END), 0) AS this_month_spent
    FROM orders
    WHERE user_id = ?
  `, userId);
};
async function getBilling(userId) {
  const [summaryRows] = await orderSummaryRaw(userId);
  const summary = summaryRows || {
    total_spent: null,
    total_orders_paid: 0n,
    pending_payments: 0n,
    refund_total: null,
    refunded_count: 0n,
    this_month_spent: null
  };
  const [lastOrder, recentOrders, firstOrder, lastPaid] = await Promise.all([
    prisma.order.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } }),
    prisma.order.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 5 }),
    prisma.order.findFirst({ where: { userId }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
    prisma.order.findFirst({
      where: { userId, paymentStatus: { in: PAID_STATUSES } },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true }
    })
  ]);
  const orderSerializer = (o) => {
    if (!o) return null;
    return {
      id: o.id,
      order_number: o.orderNumber,
      tracking_id: o.trackingId,
      payment_reference: o.paymentReference,
      customer_name: o.customerName,
      email: o.email,
      grand_total: o.grandTotal,
      currency: o.currency,
      payment_method: o.paymentMethod,
      payment_status: o.paymentStatus,
      order_status: o.orderStatus,
      gateway_provider: o.gatewayProvider,
      billing_address: o.billingAddress,
      shipping_address: o.shippingAddress,
      created_at: o.createdAt,
      updated_at: o.updatedAt
    };
  };
  return {
    paymentSummary: {
      totalSpent: summary.total_spent,
      totalOrdersPaid: Number(summary.total_orders_paid || 0),
      pendingPayments: Number(summary.pending_payments || 0),
      refundTotal: summary.refund_total,
      thisMonthSpent: summary.this_month_spent,
      firstOrderAt: firstOrder?.createdAt ?? null,
      lastPaidAt: lastPaid?.createdAt ?? null
    },
    lastOrder: orderSerializer(lastOrder),
    recentOrders: recentOrders.map(orderSerializer)
  };
}
async function getTransactionHistory(userId, query) {
  const page = Math.max(1, toNum(query.page, 1));
  const limit = Math.min(50, Math.max(1, toNum(query.limit, 10)));
  const sort = String(query.sort || "desc") === "asc" ? "asc" : "desc";
  const skip = (page - 1) * limit;
  const where = { userId };
  if (query.status) where.paymentStatus = String(query.status);
  if (query.payment_method) where.paymentMethod = String(query.payment_method);
  if (query.gateway_provider) where.gatewayProvider = String(query.gateway_provider);
  if (query.order_number) where.orderNumber = String(query.order_number);
  if (query.from || query.to) {
    const gt = {};
    if (query.from) gt.gte = new Date(query.from);
    if (query.to) gt.lte = new Date(query.to);
    where.createdAt = gt;
  }
  if (query.q) {
    const term = String(query.q);
    where.OR = [
      { orderNumber: { contains: term } },
      { trackingId: { contains: term } },
      { paymentReference: { contains: term } },
      { customerName: { contains: term } }
    ];
  }
  const [rows, total] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: [{ createdAt: sort }, { id: sort }],
      skip,
      take: limit,
      select: {
        id: true,
        orderNumber: true,
        trackingId: true,
        customerName: true,
        createdAt: true,
        updatedAt: true,
        grandTotal: true,
        currency: true,
        paymentMethod: true,
        paymentStatus: true,
        orderStatus: true,
        gatewayProvider: true,
        paymentReference: true
      }
    }),
    prisma.order.count({ where })
  ]);
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return {
    transactionRows: rows,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasPrev: page > 1,
      hasNext: page < totalPages,
      prevPage: page > 1 ? page - 1 : null,
      nextPage: page < totalPages ? page + 1 : null
    }
  };
}
async function getTransactionSummary(userId) {
  const [summaryRows] = await orderSummaryRaw(userId);
  const summary = summaryRows || {
    total_spent: null,
    total_orders_paid: 0n,
    pending_payments: 0n,
    refund_total: null,
    refunded_count: 0n,
    this_month_spent: null
  };
  return {
    totalCount: Number(await prisma.order.count({ where: { userId } })),
    totalAmount: summary.total_spent,
    paidCount: Number(summary.total_orders_paid || 0),
    pendingCount: Number(summary.pending_payments || 0),
    refundedCount: Number(summary.refunded_count || 0),
    thisMonthSpent: summary.this_month_spent
  };
}
const pendingEmailStore = /* @__PURE__ */ new Map();
async function requestEmailChange(userId, newEmailInput) {
  const current = await prisma.customerAccount.findUnique({ where: { id: userId } });
  if (!current) throw createAppError(404, "NOT_FOUND", "Account not found");
  if (!current.passwordHash) {
    throw createAppError(422, "VALIDATION_ERROR", "This account has no password set");
  }
  const newEmail = normalizeEmail(newEmailInput);
  if (!isValidEmail(newEmail)) {
    throw createAppError(422, "VALIDATION_ERROR", "A valid email is required");
  }
  if (newEmail === normalizeEmail(current.email)) {
    throw createAppError(422, "VALIDATION_ERROR", "New email must differ from the current one");
  }
  const [customerHit, adminHit] = await Promise.all([
    prisma.customerAccount.findFirst({ where: { email: newEmail }, select: { id: true } }),
    prisma.adminAccount.findFirst({ where: { email: newEmail }, select: { id: true } })
  ]);
  if (customerHit || adminHit) {
    throw createAppError(409, "CONFLICT", "This email is already in use");
  }
  const otp = generateOtp();
  const key = `email:${userId}`;
  pendingEmailStore.set(key, {
    userId,
    currentEmail: current.email,
    newEmail,
    otp,
    otpHash: hashToken(otp),
    otpAttempts: 0,
    expiresAt: Date.now() + OTP_EXPIRES_MINUTES * 60 * 1e3
  });
  await sendMail({
    to: newEmail,
    subject: "Your verification code",
    text: `Your JOOD verification code is ${otp}. It expires in ${OTP_EXPIRES_MINUTES} minutes.`
  });
  return { needsOtp: true, email: newEmail };
}
async function resendEmailOtp(userId) {
  const key = `email:${userId}`;
  const pending = pendingEmailStore.get(key);
  if (!pending) throw createAppError(422, "VALIDATION_ERROR", "No pending email change");
  const otp = generateOtp();
  pending.otp = otp;
  pending.otpHash = hashToken(otp);
  pending.otpAttempts = 0;
  pending.expiresAt = Date.now() + OTP_EXPIRES_MINUTES * 60 * 1e3;
  await sendMail({
    to: pending.newEmail,
    subject: "Your verification code",
    text: `Your JOOD verification code is ${otp}. It expires in ${OTP_EXPIRES_MINUTES} minutes.`
  });
  return { needsOtp: true };
}
async function verifyAndChangeEmail(userId, otpInput) {
  const key = `email:${userId}`;
  const pending = pendingEmailStore.get(key);
  if (!pending) throw createAppError(422, "VALIDATION_ERROR", "No pending email change");
  if (Date.now() > pending.expiresAt) {
    pendingEmailStore.delete(key);
    throw createAppError(422, "VALIDATION_ERROR", "Verification code expired. Please request a new one.");
  }
  if (!safeHashEquals(pending.otpHash, hashToken(String(otpInput || "")))) {
    pending.otpAttempts += 1;
    if (pending.otpAttempts >= 5) {
      pendingEmailStore.delete(key);
      throw createAppError(422, "VALIDATION_ERROR", "Too many attempts. Please request a new code.");
    }
    throw createAppError(422, "VALIDATION_ERROR", "Invalid verification code");
  }
  const row = await prisma.customerAccount.update({
    where: { id: userId },
    data: {
      email: pending.newEmail,
      emailVerified: true,
      sessionVersion: { increment: 1 }
    },
    select: { id: true, sessionVersion: true }
  });
  pendingEmailStore.delete(key);
  const pair = issueTokenPair({
    id: row.id,
    type: "customer",
    sessionVersion: row.sessionVersion
  });
  return { sessionVersion: row.sessionVersion, pair };
}
async function updatePassword(userId, input) {
  const current = await prisma.customerAccount.findUnique({ where: { id: userId } });
  if (!current) throw createAppError(404, "NOT_FOUND", "Account not found");
  if (!current.passwordHash) {
    throw createAppError(422, "VALIDATION_ERROR", "This account has no password set");
  }
  if (!await verifyPassword(input.current_password || "", current.passwordHash)) {
    throw createAppError(422, "VALIDATION_ERROR", "Current password is incorrect");
  }
  const newPassword = String(input.new_password || "");
  if (!isStrongPassword(newPassword)) {
    throw createAppError(422, "VALIDATION_ERROR", "New password must be at least 8 characters");
  }
  if (newPassword === input.current_password) {
    throw createAppError(422, "VALIDATION_ERROR", "New password must differ from the current password");
  }
  if (newPassword !== String(input.confirm_password || "")) {
    throw createAppError(422, "VALIDATION_ERROR", "Passwords do not match");
  }
  const passwordHash = await hashPassword(newPassword);
  const row = await prisma.customerAccount.update({
    where: { id: userId },
    data: {
      passwordHash,
      sessionVersion: { increment: 1 }
    },
    select: { id: true, sessionVersion: true }
  });
  const pair = issueTokenPair({
    id: row.id,
    type: "customer",
    sessionVersion: row.sessionVersion
  });
  return { sessionVersion: row.sessionVersion, pair };
}
export {
  OTP_EXPIRES_MINUTES,
  createAddress,
  deleteAddress,
  deletePaymentMethod,
  getAddresses,
  getBilling,
  getOrderDetail,
  getOrders,
  getPaymentMethods,
  getProfile,
  getTransactionHistory,
  getTransactionSummary,
  requestEmailChange,
  resendEmailOtp,
  setDefaultAddress,
  toProfile,
  updateAddress,
  updatePassword,
  updateProfile,
  verifyAndChangeEmail
};
