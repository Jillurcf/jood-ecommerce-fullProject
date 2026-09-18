import { describe, it, expect, vi } from "vitest";
import { prisma } from "../lib/prisma.js";
import {
  resolveCartIdentity,
  guestTokenMiddleware,
  GUEST_TOKEN_COOKIE,
  GUEST_ID_COOKIE
} from "../modules/cart/identity.js";
import { getCartQuantityMap, getCart } from "../modules/cart/cart.service.js";
import { getWishlist, getWishlistIds, toggleWishlist } from "../modules/cart/wishlist.service.js";
function makeReq(over) {
  return {
    user: over.user ?? null,
    headers: over.headers ?? {},
    body: over.body ?? {},
    query: over.query ?? {},
    cookies: over.cookies ?? {},
    cartIdentity: void 0
  };
}
function makeRes() {
  const res = {
    _headers: {},
    _cookies: [],
    setHeader(name, value) {
      this._headers[name] = value;
    },
    cookie(name, value) {
      this._cookies.push({ name, value });
    }
  };
  return res;
}
const cu = { type: "customer", id: 42, row: { email: "  User@Example.COM  " } };
describe("cart/wishlist identity model", () => {
  it("keys cart by lowercased customer email when logged in", () => {
    const id = resolveCartIdentity(makeReq({ user: cu }));
    expect(id.userId).toBe("user@example.com");
    expect(id.cartUserId).toBe("user@example.com");
    expect(id.numericId).toBe(42);
    expect(id.isCustomer).toBe(true);
    expect(id.numericId).toBe(42);
  });
  it("uses guest token (not email) for cart when unauthenticated", () => {
    const req = makeReq({ headers: { "x-guest-token": "tok-123" } });
    const id = resolveCartIdentity(req);
    expect(id.userId).toBeNull();
    expect(id.guestToken).toBe("tok-123");
    expect(id.isCustomer).toBe(false);
  });
  it("unauthenticated guest has empty cartUserId (parity merge key) and no numeric id", () => {
    const id = resolveCartIdentity(makeReq({ headers: { "x-guest-token": "tok-123" } }));
    expect(id.cartUserId).toBe("");
    expect(id.numericId).toBeNull();
  });
  it("resolves guest token source priority: header > body > query > cookie (spec \xA71)", () => {
    const id = resolveCartIdentity(
      makeReq({
        headers: { "x-guest-token": "from-header" },
        body: { guest_token: "from-body" },
        query: { guest_token: "from-query" },
        cookies: { guest_token: "from-cookie" }
      })
    );
    expect(id.guestToken).toBe("from-header");
  });
  it("falls back from header->body->query->cookie in order", () => {
    expect(resolveCartIdentity(makeReq({ body: { guest_token: "b" } })).guestToken).toBe("b");
    expect(resolveCartIdentity(makeReq({ query: { guest_token: "q" } })).guestToken).toBe("q");
    expect(resolveCartIdentity(makeReq({ cookies: { guest_token: "c" } })).guestToken).toBe("c");
  });
});
describe("guestTokenMiddleware", () => {
  it("issues a header + HttpOnly cookie when no token is present (spec \xA71)", () => {
    const res = makeRes();
    let nextCalled = false;
    guestTokenMiddleware(makeReq({}), res, () => {
      nextCalled = true;
    });
    expect(nextCalled).toBe(true);
    expect(res._headers["x-guest-token"]).toBeTruthy();
    expect(res._cookies.some((c) => c.name === GUEST_TOKEN_COOKIE)).toBe(true);
  });
  it("issues a guest id cookie aligned to the token for guest wishlists", () => {
    const res = makeRes();
    guestTokenMiddleware(makeReq({ headers: { "x-guest-token": "tok-xyz" } }), res, () => {
    });
    const idCookie = res._cookies.find((c) => c.name === GUEST_ID_COOKIE);
    expect(idCookie?.value).toBe("tok-xyz");
  });
  it("does not issue guest id cookie for logged-in customers", () => {
    const res = makeRes();
    guestTokenMiddleware(makeReq({ user: cu }), res, () => {
    });
    expect(res._cookies.some((c) => c.name === GUEST_ID_COOKIE)).toBe(false);
  });
  it("never throws (wrapped in try/catch) even on bad input", () => {
    const res = makeRes();
    expect(() => guestTokenMiddleware(makeReq({}), res, () => {
    })).not.toThrow();
  });
});
describe("cart read helpers", () => {
  it("getCart returns empty array for empty cart", async () => {
    vi.mocked(prisma.cart.findMany).mockResolvedValueOnce([]);
    const rows = await getCart({ userId: null, cartUserId: "", guestToken: "tok", numericId: null, guestId: "tok", isCustomer: false });
    expect(rows).toEqual([]);
  });
  it("getCartQuantityMap keys by product_id:variant_id (spec: per-card enrichment)", async () => {
    vi.mocked(prisma.cart.findMany).mockResolvedValueOnce([
      {
        id: 1,
        trackingId: "TRK-1",
        userId: "",
        guestToken: "tok",
        productId: 3,
        variantId: 9,
        quantity: 4,
        price: 100,
        status: "active",
        orderId: null,
        orderedAt: null,
        createdAt: /* @__PURE__ */ new Date(),
        updatedAt: /* @__PURE__ */ new Date(),
        variant: {
          id: 9,
          productId: 3,
          name: "Red 128GB",
          displayName: "Red 128GB",
          sku: "SKU-001",
          price: 100,
          salePrice: 0,
          costPrice: 0,
          stock: 50,
          lowStockThreshold: 5,
          trackInventory: true,
          allowBackorders: false,
          discountType: null,
          discountValue: null,
          vatRate: 5,
          vatIncluded: true,
          barcode: null,
          barcodeType: null,
          weight: null,
          weightUnit: null,
          length: null,
          width: null,
          height: null,
          dimensionUnit: null,
          shippingClass: null,
          isActive: true,
          isDefault: true,
          sortOrder: 0,
          createdAt: /* @__PURE__ */ new Date(),
          updatedAt: /* @__PURE__ */ new Date(),
          product: {
            id: 3,
            productId: "PROD-00000003",
            name: "Test Product",
            slug: "test-product",
            productType: "simple",
            brand: "TestBrand",
            mpn: null,
            bullets: null,
            description: null,
            shortDescription: null,
            parentCategoryId: 1,
            categoryId: 1,
            visibility: true,
            status: "published",
            metaKeywords: null,
            metaTitle: null,
            metaDescription: null,
            mainImage: "/uploads/products/default.jpg",
            productVideos: null,
            displayLocations: null,
            displayTiming: null,
            createdAt: /* @__PURE__ */ new Date(),
            updatedAt: /* @__PURE__ */ new Date()
          },
          media: []
        }
      }
    ]);
    const map = await getCartQuantityMap({
      userId: null,
      cartUserId: "",
      guestToken: "tok",
      numericId: null,
      guestId: "tok",
      isCustomer: false
    });
    expect(map.get("3:9")).toBe(4);
  });
});
describe("wishlist", () => {
  it("getWishlist returns empty for unauthenticated visitor with no guest id (non-fatal)", async () => {
    const { ids, items } = await getWishlist({
      userId: null,
      cartUserId: "",
      guestToken: null,
      numericId: null,
      guestId: null,
      isCustomer: false
    });
    expect(ids).toEqual([]);
    expect(items).toEqual([]);
  });
  it("getWishlist returns [] (non-fatal) when identity lookup fails", async () => {
    vi.mocked(prisma.wishlist.findMany).mockRejectedValueOnce(new Error("db down"));
    const ids = await getWishlistIds({
      userId: null,
      cartUserId: "",
      guestToken: "tok",
      numericId: null,
      guestId: "tok",
      isCustomer: false
    });
    expect(ids).toEqual([]);
  });
  it("toggleWishlist inserts when no existing row -> action added (FOR UPDATE path)", async () => {
    const store = prisma.__getTxMockStore();
    if (store) {
      if (!store.wishlist) store.wishlist = {};
      store.wishlist.create = vi.fn().mockResolvedValue({ id: 7 });
      store.wishlist.delete = vi.fn().mockResolvedValue({});
    }
    const result = await toggleWishlist(
      { userId: null, cartUserId: "", guestToken: "tok", numericId: null, guestId: "tok", isCustomer: false },
      5
    );
    expect(result.action).toBe("added");
    expect(result.is_fav).toBe(true);
  });
  it("toggleWishlist deletes when a row exists -> action removed", async () => {
    const store = prisma.__getTxMockStore();
    if (store) {
      if (!store.wishlist) store.wishlist = {};
      store.wishlist.delete = vi.fn().mockResolvedValue({});
      store.wishlist.create = vi.fn().mockResolvedValue({ id: 7 });
      store.$queryRaw = vi.fn().mockResolvedValue([{ id: 7 }]);
    }
    const result = await toggleWishlist(
      { userId: null, cartUserId: "", guestToken: "tok", numericId: null, guestId: "tok", isCustomer: false },
      5
    );
    expect(result.action).toBe("removed");
    expect(result.is_fav).toBe(false);
    expect(store.wishlist.delete).toHaveBeenCalledWith({ where: { id: 7 } });
  });
});
