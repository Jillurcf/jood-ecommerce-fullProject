import { describe, it, expect } from "vitest";
import {
  computePrices,
  resolveDiscountPercent,
  getStockLabel,
  getStockStatus
} from "../modules/catalog/pricing.util.js";
describe("resolveDiscountPercent", () => {
  it("returns 0 for no discount type", () => {
    expect(resolveDiscountPercent(null, null, 100)).toBe(0);
    expect(resolveDiscountPercent(void 0, void 0, 100)).toBe(0);
    expect(resolveDiscountPercent("", 0, 100)).toBe(0);
  });
  it("returns the raw value for percent/percentage types", () => {
    expect(resolveDiscountPercent("percent", 10, 100)).toBe(10);
    expect(resolveDiscountPercent("percentage", 25, 200)).toBe(25);
  });
  it("calculates percentage from fixed/amount discount", () => {
    expect(resolveDiscountPercent("fixed", 50, 200)).toBe(25);
    expect(resolveDiscountPercent("amount", 25, 100)).toBe(25);
  });
  it("returns 0 for fixed discount when price is 0", () => {
    expect(resolveDiscountPercent("fixed", 50, 0)).toBe(0);
  });
});
describe("computePrices", () => {
  it("returns base price with no discount and VAT included (default)", () => {
    const result = computePrices(100, 0, null, null, 5, true);
    expect(result.finalPrice).toBe(100);
    expect(result.discountValue).toBe(0);
    expect(result.vatValue).toBe(0);
  });
  it("applies percent discount correctly", () => {
    const result = computePrices(200, 0, "percent", 10, 5, true);
    expect(result.discountValue).toBe(20);
    expect(result.finalPrice).toBe(180);
  });
  it("applies fixed discount correctly", () => {
    const result = computePrices(200, 0, "fixed", 50, 5, true);
    expect(result.discountValue).toBe(50);
    expect(result.finalPrice).toBe(150);
  });
  it("infers discount from sale_price when no discount_type", () => {
    const result = computePrices(100, 80, null, null, 5, true);
    expect(result.discountValue).toBe(16);
    expect(result.finalPrice).toBe(64);
  });
  it("adds VAT when vat_included is false", () => {
    const result = computePrices(100, 0, null, null, 5, false);
    expect(result.vatValue).toBe(5);
    expect(result.finalPrice).toBe(105);
  });
  it("adds VAT after discount when vat_included is false", () => {
    const result = computePrices(200, 0, "percent", 10, 5, false);
    expect(result.discountValue).toBe(20);
    expect(result.vatValue).toBe(9);
    expect(result.finalPrice).toBe(189);
  });
  it("handles zero price gracefully", () => {
    const result = computePrices(0, 0, null, null, 5, true);
    expect(result.finalPrice).toBe(0);
    expect(result.discountValue).toBe(0);
  });
  it("handles null/undefined inputs gracefully", () => {
    const result = computePrices(null, void 0, null, void 0, null, void 0);
    expect(result.finalPrice).toBe(0);
  });
  it("sale_price takes precedence over price for base calculation", () => {
    const result = computePrices(200, 100, "percent", 10, 0, true);
    expect(result.discountValue).toBe(10);
    expect(result.finalPrice).toBe(90);
  });
});
describe("getStockLabel", () => {
  it("returns Out of Stock for 0 or negative", () => {
    expect(getStockLabel(0, 5)).toBe("Out of Stock");
    expect(getStockLabel(-1, 5)).toBe("Out of Stock");
    expect(getStockLabel(null, 5)).toBe("Out of Stock");
  });
  it("returns limited stock for low quantities", () => {
    expect(getStockLabel(3, 5)).toBe("3 (Limited Stock!)");
    expect(getStockLabel(5, 5)).toBe("5 (Limited Stock!)");
  });
  it("returns available for stock above threshold", () => {
    expect(getStockLabel(10, 5)).toBe("10 available");
    expect(getStockLabel(100, 5)).toBe("100 available");
  });
  it("uses default threshold of 5", () => {
    expect(getStockLabel(5, void 0)).toBe("5 (Limited Stock!)");
    expect(getStockLabel(6, void 0)).toBe("6 available");
  });
});
describe("getStockStatus", () => {
  it("returns out_of_stock for 0", () => {
    expect(getStockStatus(0, 5)).toBe("out_of_stock");
  });
  it("returns low_stock at or below threshold", () => {
    expect(getStockStatus(3, 5)).toBe("low_stock");
    expect(getStockStatus(5, 5)).toBe("low_stock");
  });
  it("returns in_stock above threshold", () => {
    expect(getStockStatus(10, 5)).toBe("in_stock");
  });
});
