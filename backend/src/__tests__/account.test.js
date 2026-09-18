import { describe, it, expect, vi } from "vitest";
import { prisma } from "../lib/prisma.js";
import {
  toProfile,
  getProfile,
  updateProfile,
  getAddresses,
  createAddress,
  updateAddress,
  deleteAddress,
  setDefaultAddress,
  getPaymentMethods,
  deletePaymentMethod,
  getBilling,
  getTransactionHistory,
  getOrders,
  getOrderDetail,
  requestEmailChange,
  verifyAndChangeEmail,
  updatePassword
} from "../modules/account/account.service.js";
const validCustomer = {
  id: 42,
  userId: "user_20260101_abcdefgh",
  fullName: "Jane Doe",
  email: "jane@example.com",
  phone: "+971501234567",
  bio: null,
  address: "Main St 1",
  city: "Dubai",
  country: "UAE",
  status: "active",
  emailVerified: true,
  phoneVerified: false,
  isOnline: false,
  provider: "local",
  passwordHash: "hashed",
  createdAt: /* @__PURE__ */ new Date(),
  updatedAt: /* @__PURE__ */ new Date()
};
describe("account \xB7 profile", () => {
  it("getProfile returns the user for a valid id", async () => {
    vi.mocked(prisma.customerAccount.findUnique).mockResolvedValueOnce(validCustomer);
    const profile = await getProfile(42);
    expect(profile.id).toBe(42);
    expect(profile.full_name).toBe("Jane Doe");
    expect(profile.email).toBe("jane@example.com");
  });
  it("getProfile throws 404 for unknown id", async () => {
    vi.mocked(prisma.customerAccount.findUnique).mockResolvedValueOnce(null);
    await expect(getProfile(999)).rejects.toMatchObject({ statusCode: 404 });
  });
  it("updateProfile persists editable fields and marks online", async () => {
    vi.mocked(prisma.customerAccount.update).mockResolvedValueOnce({
      ...validCustomer,
      fullName: "Jane Doe Updated",
      isOnline: true
    });
    const result = await updateProfile(42, { full_name: "Jane Doe Updated" });
    expect(result.full_name).toBe("Jane Doe Updated");
    const call = vi.mocked(prisma.customerAccount.update).mock.calls[0][0];
    expect(call.data.fullName).toBe("Jane Doe Updated");
    expect(call.data.isOnline).toBe(true);
  });
  it("updateProfile rejects an invalid full name (2-80 chars)", async () => {
    await expect(updateProfile(42, { full_name: "X" })).rejects.toMatchObject({ statusCode: 422 });
  });
  it("updateProfile rejects an invalid phone", async () => {
    await expect(updateProfile(42, { phone: "12" })).rejects.toMatchObject({ statusCode: 422 });
  });
  it("toProfile maps columns without leaking sensitive fields", () => {
    const p = toProfile(validCustomer);
    expect(p.user_id).toBe("user_20260101_abcdefgh");
    expect(p.email_verified).toBe(true);
    expect(p.provider).toBe("local");
    expect(p).not.toHaveProperty("passwordHash");
  });
});
describe("account \xB7 orders", () => {
  it("getOrders returns paginated items scoped by userId", async () => {
    vi.mocked(prisma.order.findMany).mockResolvedValueOnce([
      { id: 1, orderNumber: "ORD-2026010100000001", grandTotal: 100, currency: "AED" }
    ]);
    vi.mocked(prisma.order.count).mockResolvedValueOnce(1);
    const data = await getOrders(42, 1, 20);
    expect(data.pagination.total).toBe(1);
    expect(vi.mocked(prisma.order.findMany).mock.calls[0][0].where).toMatchObject({ userId: 42 });
  });
  it("getOrderDetail returns order scoped by userId+orderNumber", async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValueOnce({
      id: 1,
      orderNumber: "ORD-1",
      items: [],
      payments: [
        { id: 1, provider: "stripe", paymentMethod: "card", transactionReference: "pi_123", amount: 100, status: "paid" }
      ]
    });
    const detail = await getOrderDetail(42, "ORD-1");
    expect(detail.orderNumber).toBe("ORD-1");
    const where = vi.mocked(prisma.order.findFirst).mock.calls[0][0].where;
    expect(where).toMatchObject({ userId: 42, orderNumber: "ORD-1" });
  });
  it("getOrderDetail throws 404 when not found", async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValueOnce(null);
    await expect(getOrderDetail(42, "NOPE")).rejects.toMatchObject({ statusCode: 404 });
  });
});
describe("account \xB7 addresses", () => {
  it("exposes the customer primary as id 0 (legacy parity)", async () => {
    vi.mocked(prisma.customerAccount.findUnique).mockResolvedValueOnce({
      id: 42,
      email: "jane@example.com",
      address: "Main St",
      city: "Dubai",
      country: "UAE"
    });
    vi.mocked(prisma.userAddress.findMany).mockResolvedValueOnce([
      {
        id: 5,
        userId: 42,
        address: "Addr A",
        addressLine1: null,
        landmark: null,
        city: "DXB",
        emirate: null,
        country: "UAE",
        postalCode: null,
        addressType: "home",
        isDefault: true,
        email: null,
        createdAt: /* @__PURE__ */ new Date(),
        updatedAt: /* @__PURE__ */ new Date()
      }
    ]);
    const list = await getAddresses(42);
    expect(list[0].id).toBe(0);
    expect(list[0].is_primary).toBe(true);
    expect(list[1].id).toBe(5);
    expect(list[1].is_default).toBe(true);
  });
  it("createAddress validates required address/city/country", async () => {
    vi.mocked(prisma.userAddress.create).mockResolvedValueOnce({ id: 1 });
    await expect(createAddress(42, { address: "", city: "Dubai", country: "UAE" })).rejects.toMatchObject({ statusCode: 422 });
    await expect(createAddress(42, { address: "A", city: "", country: "UAE" })).rejects.toMatchObject({ statusCode: 422 });
  });
  it("updateAddress is IDOR-safe (only this user)", async () => {
    vi.mocked(prisma.userAddress.findFirst).mockResolvedValueOnce(null);
    await expect(updateAddress(42, 9, { address: "A", city: "B", country: "C" })).rejects.toMatchObject({ statusCode: 404 });
    const where = vi.mocked(prisma.userAddress.findFirst).mock.calls[0][0].where;
    expect(where).toMatchObject({ id: 9, userId: 42 });
  });
  it("setDefaultAddress unsets others then sets target", async () => {
    vi.mocked(prisma.userAddress.findFirst).mockResolvedValueOnce({ id: 3 });
    vi.mocked(prisma.userAddress.updateMany).mockResolvedValueOnce({ count: 2 });
    vi.mocked(prisma.userAddress.update).mockResolvedValueOnce({ id: 3, isDefault: true });
    vi.mocked(prisma.$transaction).mockImplementationOnce(
      (input) => Promise.resolve(input.map(() => void 0))
    );
    const res = await setDefaultAddress(42, 3);
    expect(res.is_default).toBe(true);
  });
  it("deleteAddress is IDOR-safe and removes", async () => {
    vi.mocked(prisma.userAddress.findFirst).mockResolvedValueOnce({ id: 2 });
    vi.mocked(prisma.userAddress.delete).mockResolvedValueOnce({});
    const res = await deleteAddress(42, 2);
    expect(res.id).toBe(2);
  });
});
describe("account \xB7 payment methods", () => {
  it("getPaymentMethods masks the card and never leaks the encrypted number", async () => {
    vi.mocked(prisma.customerPaymentMethod.findMany).mockResolvedValueOnce([
      {
        id: 1,
        methodType: "card",
        provider: "stripe",
        cardholderName: "Jane",
        cardBrand: "visa",
        cardLast4: "4242",
        expiryMonth: 12,
        expiryYear: 2030,
        displayName: null,
        accountEmail: "jane@example.com",
        isDefault: true,
        createdAt: /* @__PURE__ */ new Date(),
        cardNumberEnc: "encrypted-secret"
      }
    ]);
    const methods = await getPaymentMethods(42);
    expect(methods[0].card_last4).toBe("4242");
    expect(methods[0].card_number_masked).toContain("4242");
    expect(methods[0]).not.toHaveProperty("card_number_enc");
    expect(methods[0]).not.toHaveProperty("cardNumberEnc");
  });
  it("deletePaymentMethod is IDOR-safe", async () => {
    vi.mocked(prisma.customerPaymentMethod.findFirst).mockResolvedValueOnce(null);
    await expect(deletePaymentMethod(42, 55)).rejects.toMatchObject({ statusCode: 404 });
  });
});
describe("account \xB7 billing", () => {
  it("getBilling returns payment summary + recent orders", async () => {
    vi.mocked(prisma.$queryRawUnsafe).mockResolvedValueOnce([
      {
        total_spent: 250,
        total_orders_paid: 2n,
        pending_payments: 1n,
        refund_total: null,
        refunded_count: 0n,
        this_month_spent: 250
      }
    ]);
    vi.mocked(prisma.order.findFirst).mockResolvedValueOnce({ id: 1, orderNumber: "ORD-1" });
    vi.mocked(prisma.order.findFirst).mockResolvedValueOnce({ createdAt: /* @__PURE__ */ new Date() });
    vi.mocked(prisma.order.findFirst).mockResolvedValueOnce({ createdAt: /* @__PURE__ */ new Date() });
    vi.mocked(prisma.order.findMany).mockResolvedValueOnce([{ id: 1, orderNumber: "ORD-1" }]);
    const billing = await getBilling(42);
    expect(Number(billing.paymentSummary.totalOrdersPaid)).toBe(2);
    expect(billing.recentOrders.length).toBeGreaterThanOrEqual(1);
  });
});
describe("account \xB7 transaction history", () => {
  it("getTransactionHistory scopes by userId and paginates", async () => {
    vi.mocked(prisma.order.findMany).mockResolvedValueOnce([{ id: 1, orderNumber: "ORD-1" }]);
    vi.mocked(prisma.order.count).mockResolvedValueOnce(5);
    const data = await getTransactionHistory(42, { page: 1, limit: 10 });
    expect(data.pagination.total).toBe(5);
    expect(data.transactionRows).toHaveLength(1);
    expect(vi.mocked(prisma.order.findMany).mock.calls[0][0].where).toMatchObject({ userId: 42 });
  });
});
describe("account \xB7 security", () => {
  it("requestEmailChange rejects when no password is set (Google account)", async () => {
    vi.mocked(prisma.customerAccount.findUnique).mockResolvedValueOnce({ ...validCustomer, passwordHash: null });
    await expect(requestEmailChange(42, "new@example.com")).rejects.toThrow();
  });
  it("requestEmailChange rejects email reused across customer+admin tables", async () => {
    vi.mocked(prisma.customerAccount.findUnique).mockResolvedValueOnce(validCustomer);
    vi.mocked(prisma.customerAccount.findFirst).mockResolvedValueOnce({ id: 99 });
    await expect(requestEmailChange(42, "taken@example.com")).rejects.toMatchObject({ statusCode: 409 });
  });
  it("requestEmailChange rejects when new email equals current", async () => {
    vi.mocked(prisma.customerAccount.findUnique).mockResolvedValueOnce(validCustomer);
    await expect(requestEmailChange(42, "jane@example.com")).rejects.toMatchObject({ statusCode: 422 });
  });
  it("verifyAndChangeEmail rejects an unknown pending challenge", async () => {
    await expect(verifyAndChangeEmail(42, "123456")).rejects.toMatchObject({ statusCode: 422 });
  });
  it("updatePassword requires a matching current password", async () => {
    vi.mocked(prisma.customerAccount.findUnique).mockResolvedValue(validCustomer);
    await expect(
      updatePassword(42, { current_password: "wrong", new_password: "NewPassword1!", confirm_password: "NewPassword1!" })
    ).rejects.toMatchObject({ statusCode: 422 });
  });
  it("updatePassword rejects a weak new password (>=8)", async () => {
    vi.mocked(prisma.customerAccount.findUnique).mockResolvedValue(validCustomer);
    await expect(
      updatePassword(42, { current_password: "CurrentPassword1!", new_password: "short", confirm_password: "short" })
    ).rejects.toMatchObject({ statusCode: 422 });
  });
  it("updatePassword is IDOR-safe: scopes the lookup by the caller id", async () => {
    vi.mocked(prisma.customerAccount.findUnique).mockResolvedValue(validCustomer);
    await expect(
      updatePassword(42, { current_password: "CurrentPassword1!", new_password: "NewPassword1!", confirm_password: "NewPassword1!" })
    ).rejects.toMatchObject({ statusCode: 422 });
    const call = vi.mocked(prisma.customerAccount.findUnique).mock.calls[0][0];
    expect(call.where.id).toBe(42);
  });
});
