import { vi } from "vitest";
vi.mock("../lib/prisma.js", () => {
  const txMockStore = {};
  return {
    prisma: {
      $transaction: vi.fn(async (fn) => {
        const txModels = new Proxy({}, {
          get(_target, prop) {
            if (prop === "__txMockStore") return txMockStore;
            if (prop === "$queryRaw") return txMockStore.$queryRaw ?? vi.fn().mockResolvedValue([]);
            if (prop === "$executeRaw") return txMockStore.$executeRaw ?? vi.fn().mockResolvedValue(0);
            if (typeof prop === "string" && txMockStore[prop]) {
              return new Proxy({}, {
                get(_t, method) {
                  if (typeof method === "string") {
                    if (txMockStore[prop][method]) return txMockStore[prop][method];
                    return vi.fn().mockResolvedValue(null);
                  }
                  return vi.fn();
                }
              });
            }
            if (typeof prop === "string") {
              if (!txMockStore[prop]) txMockStore[prop] = {};
              return new Proxy({}, {
                get(_t, method) {
                  if (typeof method === "string") {
                    if (txMockStore[prop] && txMockStore[prop][method]) {
                      return txMockStore[prop][method];
                    }
                    return vi.fn().mockResolvedValue(null);
                  }
                  return vi.fn();
                }
              });
            }
            return vi.fn();
          }
        });
        return fn(txModels);
      }),
      __getTxMockStore: () => txMockStore,
      customerAccount: {
        findFirst: vi.fn().mockResolvedValue(null),
        findUnique: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
        count: vi.fn().mockResolvedValue(0)
      },
      adminAccount: {
        findFirst: vi.fn().mockResolvedValue(null),
        findUnique: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
        count: vi.fn().mockResolvedValue(0)
      },
      product: {
        findFirst: vi.fn().mockResolvedValue(null),
        findUnique: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
        count: vi.fn().mockResolvedValue(0)
      },
      productVariant: {
        findFirst: vi.fn().mockResolvedValue(null),
        findUnique: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
        count: vi.fn().mockResolvedValue(0)
      },
      category: {
        findFirst: vi.fn().mockResolvedValue(null),
        findUnique: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
        delete: vi.fn().mockResolvedValue({}),
        count: vi.fn().mockResolvedValue(0)
      },
      parentCategory: {
        findFirst: vi.fn().mockResolvedValue(null),
        findUnique: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
        delete: vi.fn().mockResolvedValue({}),
        count: vi.fn().mockResolvedValue(0)
      },
      cart: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({}),
        delete: vi.fn().mockResolvedValue({}),
        deleteMany: vi.fn().mockResolvedValue({})
      },
      wishlist: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({}),
        delete: vi.fn().mockResolvedValue({}),
        deleteMany: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({})
      },
      order: {
        findFirst: vi.fn().mockResolvedValue(null),
        findUnique: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
        count: vi.fn().mockResolvedValue(0)
      },
      orderItem: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({})
      },
      orderPayment: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({})
      },
      userAddress: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        delete: vi.fn().mockResolvedValue({})
      },
      customerPaymentMethod: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
        delete: vi.fn().mockResolvedValue({})
      },
      visitor: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
        upsert: vi.fn().mockResolvedValue({}),
        count: vi.fn().mockResolvedValue(0)
      },
      pageVisit: {
        create: vi.fn().mockResolvedValue({}),
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0)
      },
      $queryRaw: vi.fn().mockResolvedValue([]),
      $executeRaw: vi.fn().mockResolvedValue(0),
      $queryRawUnsafe: vi.fn().mockResolvedValue([]),
      $executeRawUnsafe: vi.fn().mockResolvedValue(0)
    }
  };
});
vi.mock("../lib/mailer.js", () => ({
  sendMail: vi.fn().mockResolvedValue({ messageId: "test-message-id" })
}));
vi.mock("../lib/emit.js", () => ({
  emitCartUpdated: vi.fn(),
  emitWishlistUpdated: vi.fn(),
  emitOrderCreated: vi.fn(),
  emitOrderTrackingUpdated: vi.fn(),
  emitOrderTrackingViewed: vi.fn(),
  emitProductCreated: vi.fn(),
  emitProductUpdated: vi.fn(),
  emitProductDeleted: vi.fn(),
  emitCategoryAddedOrUpdated: vi.fn(),
  emitCategoryDeleted: vi.fn(),
  emitDiscountProductsUpdated: vi.fn(),
  emitFrequentProductsUpdated: vi.fn(),
  emitFrequentProductAdded: vi.fn(),
  emitAdminEvent: vi.fn(),
  emitUserEvent: vi.fn(),
  emitPageVisit: vi.fn()
}));
vi.mock("../lib/socket.js", () => ({
  getIO: vi.fn().mockReturnValue(null),
  initSocketIO: vi.fn()
}));
vi.mock("../middleware/visitorTracker.js", () => ({
  visitorTracker: (_req, _res, next) => next()
}));
