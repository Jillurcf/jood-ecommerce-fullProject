import { describe, it, expect } from "vitest";
import {
  generateOrderNumber,
  generateTrackingId,
  generatePaymentReference,
  ALLOWED_PAYMENT_METHODS,
  ALLOWED_GATEWAY_PROVIDERS,
  sanitize,
  sanitizeEmail,
  sanitizePhone,
  sanitizeDigits,
  maskCardNumber,
  maskCardDisplay,
  formatLocalDate
} from "../modules/checkout/checkout.config.js";
describe("checkout \u2014 ID generators (legacy parity)", () => {
  it("generates order number in ORD-YYYYMMDD-XXXXXXXX format (uppercase hex)", () => {
    const n = generateOrderNumber();
    expect(n).toMatch(/^ORD-20\d{6}-[0-9A-F]{8}$/);
  });
  it("generates tracking id in TRK-10-hex format", () => {
    const t = generateTrackingId();
    expect(t).toMatch(/^TRK-[0-9A-F]{10}$/);
  });
  it("generates payment reference in PAY-10-hex format", () => {
    const p = generatePaymentReference();
    expect(p).toMatch(/^PAY-[0-9A-F]{10}$/);
  });
});
describe("checkout \u2014 config constants", () => {
  it("allows cod and card", () => {
    expect(ALLOWED_PAYMENT_METHODS.has("cod")).toBe(true);
    expect(ALLOWED_PAYMENT_METHODS.has("card")).toBe(true);
  });
  it("allows manual and stripe gateways", () => {
    expect(ALLOWED_GATEWAY_PROVIDERS.has("manual")).toBe(true);
    expect(ALLOWED_GATEWAY_PROVIDERS.has("stripe")).toBe(true);
  });
});
describe("checkout \u2014 sanitizers", () => {
  it("sanitize trims and stringifies", () => {
    expect(sanitize("  hello ")).toBe("hello");
    expect(sanitize(null)).toBe("");
    expect(sanitize(void 0)).toBe("");
    expect(sanitize(123)).toBe("123");
  });
  it("sanitizeEmail lowercases and validates", () => {
    expect(sanitizeEmail(" Foo@Bar.COM ")).toBe("foo@bar.com");
    expect(sanitizeEmail("not-an-email")).toBe("");
  });
  it("sanitizePhone allows digits, +, -, spaces, parens and requires >= 5 chars", () => {
    expect(sanitizePhone(" +971 50 123 4567 ")).toBe("+971 50 123 4567");
    expect(sanitizePhone("123")).toBe("");
  });
  it("sanitizeDigits keeps only digits", () => {
    expect(sanitizeDigits("4242 4242 4242 4242")).toBe("4242424242424242");
  });
});
describe("checkout \u2014 card masking", () => {
  it("maskCardNumber returns last 4 with **** prefix", () => {
    expect(maskCardNumber("4242 4242 4242 4242")).toBe("**** 4242");
  });
  it("maskCardNumber returns **** for short numbers", () => {
    expect(maskCardNumber("123")).toBe("****");
    expect(maskCardNumber(null)).toBe("");
    expect(maskCardNumber("")).toBe("");
  });
  it("maskCardDisplay shows brand + last4", () => {
    expect(maskCardDisplay("Visa", "4242")).toBe("Visa **4242");
    expect(maskCardDisplay(null, null)).toBe("Card ******");
  });
});
describe("checkout \u2014 date helpers", () => {
  it("formatLocalDate returns YYYYMMDD", () => {
    expect(formatLocalDate(/* @__PURE__ */ new Date("2026-09-03T10:00:00Z"))).toBe("20260903");
  });
});
