import { describe, it, expect } from "vitest";
import { applyFilters } from "../modules/catalog/catalog.service.js";
function card(over) {
  return {
    id: "1",
    cart_key: "1:1",
    type: "variant",
    scope_type: "variant",
    product_id: "1",
    master_id: "1",
    variant_id: "1",
    wishlist_id: "1",
    name: "Test",
    slug: "test",
    product_name: "Test",
    product_slug: "test",
    master_product_code: "PROD-1",
    original_price: "100.00",
    sale_price: "0.00",
    final_price: "100.00",
    discount_value: "0.00",
    discount_percent: 0,
    vat_value: 0,
    vat_rate: 5,
    image: "",
    main_image: "",
    brand: "",
    model: "",
    mpn: "",
    product_type: "simple",
    stock: 10,
    low_stock_threshold: 5,
    stock_status: "10 available",
    rating: 0,
    condition: "",
    size: "",
    color: "",
    variant_options: {},
    attributes: [],
    attribute_groups: {},
    created_at: /* @__PURE__ */ new Date(),
    is_fav: false,
    in_cart_qty: 0,
    parent_category_id: null,
    parent_category_name: "",
    parent_category_slug: "",
    category_id: null,
    category_name: "",
    category_slug: "",
    ...over
  };
}
describe("applyFilters \u2014 in_stock_only (parity bug #1)", () => {
  const inStock = card({ id: "1", stock: 5 });
  const outOfStock = card({ id: "2", stock: 0 });
  it("excludes out-of-stock cards by default (in_stock_only default true)", () => {
    const result = applyFilters([inStock, outOfStock], {});
    expect(result.map((c) => c.id)).toEqual(["1"]);
  });
  it("includes out-of-stock cards when in_stock_only=false", () => {
    const result = applyFilters([inStock, outOfStock], { in_stock_only: "false" });
    expect(result.map((c) => c.id)).toEqual(["1", "2"]);
  });
  it("honours explicit in_stock_only=false and true values", () => {
    expect(applyFilters([outOfStock], { in_stock_only: "true" })).toHaveLength(0);
    expect(applyFilters([outOfStock], { in_stock_only: "false" })).toHaveLength(1);
  });
});
describe("applyFilters \u2014 rating (parity bug #2)", () => {
  it("rounds rating to half-star and filters included ratings", () => {
    const fourStar = card({ id: "1", rating: 4.4 });
    const fourFiveStar = card({ id: "2", rating: 4.6 });
    const fiveStar = card({ id: "3", rating: 5 });
    const result = applyFilters([fourStar, fourFiveStar, fiveStar], { rating: "4.5" });
    expect(result.map((c) => c.id)).toEqual(["1", "2"]);
  });
  it("does not filter ratings when rating is unknown (0)", () => {
    const unknown = card({ id: "1", rating: 0 });
    const result = applyFilters([unknown], { rating: "4" });
    expect(result).toHaveLength(1);
  });
  it("accepts rating of 5", () => {
    const result = applyFilters([card({ id: "1", rating: 5 })], { rating: "5" });
    expect(result).toHaveLength(1);
  });
});
