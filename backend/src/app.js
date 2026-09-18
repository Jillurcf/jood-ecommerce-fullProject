import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { env } from "./config/index.js";
import { errorHandler } from "./common/errors.middleware.js";
import { sendSuccess } from "./common/response.js";
import { requestLogger } from "./middleware/requestLogger.js";
import { prisma } from "./lib/prisma.js";
import authRoutes from "./modules/auth/auth.routes.js";
import catalogRoutes from "./modules/catalog/catalog.routes.js";
import cartRoutes from "./modules/cart/cart.routes.js";
import wishlistRoutes from "./modules/cart/wishlist.routes.js";
import checkoutRoutes from "./modules/checkout/checkout.routes.js";
import webhookRoutes from "./modules/checkout/webhook.routes.js";
import accountRoutes from "./modules/account/account.routes.js";
import adminRoutes from "./modules/admin/admin.routes.js";
import { authenticate } from "./modules/auth/middleware.js";
import { guestTokenMiddleware } from "./modules/cart/identity.js";
import { visitorTracker } from "./middleware/visitorTracker.js";
const app = express();
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdn.jsdelivr.net"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdn.jsdelivr.net"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", env.FRONTEND_URL, "ws:", "wss:"]
    }
  },
  crossOriginEmbedderPolicy: false
}));
app.use(cors({
  origin: env.FRONTEND_URL,
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Guest-Token"]
}));
app.use("/webhooks", webhookRoutes);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookieParser());
app.get("/api/health", async (_req, res) => {
  let db = "up";
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    db = "down";
  }
  sendSuccess(res, {
    status: db === "up" ? "ok" : "degraded",
    db,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    uptime: process.uptime(),
    memory_mb: Math.round(process.memoryUsage().rss / 1024 / 1024 * 10) / 10,
    node: process.version
  });
});
app.use(requestLogger);
app.use(authenticate);
app.use(guestTokenMiddleware);
app.use(visitorTracker);
app.use("/api/auth", authRoutes);
app.use("/api", catalogRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/wishlist", wishlistRoutes);
app.use("/api/checkout", checkoutRoutes);
app.use("/api/account", accountRoutes);
app.use("/api/admin", adminRoutes);
app.use((_req, res) => {
  res.status(404).json({ success: false, message: "Not found", error_code: "NOT_FOUND" });
});
app.use(errorHandler);
var app_default = app;
export {
  app_default as default
};
