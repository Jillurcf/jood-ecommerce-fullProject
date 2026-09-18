/**
 * ==================================================
 *  SERVER.JS — CLEAN, SECURE, PRODUCTION-READY
 *  Express + Socket.IO
 * ==================================================
 */

require("dotenv").config();

// --------------------
// CORE MODULES
// --------------------
const visitorTracker = require("./middleware/visitorTracker");
const express = require("express");
const path = require("path");
const http = require("http");

// --------------------
// SECURITY & UTILITIES
// --------------------
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const session = require("express-session");
const csrf = require("csurf");
const cookieParser = require("cookie-parser");
const compression = require("compression");
const passport = require("passport");

// --------------------
// SOCKET.IO
// --------------------
const { Server } = require("socket.io");

const app = express();
const translateText = require("./utils/translate");

app.use("/webhooks", require("./routes/webhooks.routes"));

app.get("/test-translate", async (req, res) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(403).send("Not allowed");
  }

  const result = await translateText("Hello world", "ar");

  res.json({
    original: "Hello world",
    translated: result
  });
});
// --------------------
// APP INITIALIZATION
// --------------------
const server = http.createServer(app);
const PORT = process.env.PORT || 4000;

const isProduction = process.env.NODE_ENV === "production";
const appOrigin = process.env.APP_URL || "http://localhost:4000";

// Trust reverse proxies (Nginx / Cloudflare / load balancers)
app.set("trust proxy", 1);

// ==================================================
// SOCKET.IO CONFIGURATION
// ==================================================
const io = new Server(server, {
  cors: {
    origin: [
      appOrigin,
      "http://localhost:4000",
      "http://127.0.0.1:5500",
      "http://localhost:3000",
    ],
    credentials: true,
  },
});

app.set("io", io);

// ==================================================
// SECURITY HEADERS
// ==================================================
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "default-src": ["'self'"],

        "script-src": [
          "'self'",
          "'unsafe-inline'",
          "https://cdnjs.cloudflare.com",
          "https://cdn.jsdelivr.net",
          "https://translate.google.com",
          "https://translate.googleapis.com",
          "https://www.google.com"
        ],

        "style-src": [
          "'self'",
          "'unsafe-inline'",
          "https://fonts.googleapis.com",
          "https://cdnjs.cloudflare.com"
        ],

        "img-src": [
          "'self'",
          "data:",
          "https://translate.googleapis.com",
          "https://translate.google.com"
        ],

        "font-src": [
          "'self'",
          "https://fonts.gstatic.com",
          "https://cdnjs.cloudflare.com"
        ],

        "connect-src": [
          "'self'",
          "https://translate.googleapis.com",
          "https://www.google.com"
        ],

        "frame-src": [
          "'self'",
          "https://translate.google.com",
          "https://www.google.com"
        ],

        "object-src": ["'none'"],
        "upgrade-insecure-requests": [],
      },
    },

    // ✅ IMPORTANT FIX
    frameguard: false,

    referrerPolicy: { policy: "no-referrer" },
    crossOriginEmbedderPolicy: false,
  })
);

app.disable("x-powered-by");

// ==================================================
// PERFORMANCE
// ==================================================
app.use(compression());

// ==================================================
// RATE LIMITING
// ==================================================
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProduction ? 100 : 1000,
  skip: (req) => !isProduction, // 👈 key line
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many requests. Please try again later.",
});

const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many login attempts. Please try again later.",
});

app.use("/admin/login", loginLimiter);
app.use("/admin", adminLimiter);

// ==================================================
// BODY PARSERS
// ==================================================
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: false, limit: "10kb" }));
app.use(cookieParser());
app.use("/api/translate", require("./routes/translate.routes"));
// ==================================================
// SESSIONS
// ==================================================
const adminSession = session({
  name: "admin_session",
  secret: process.env.ADMIN_SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
     secure: false, 
    //  later wanna change secure to isProduction
    sameSite: "lax",
        path: "/",
    maxAge: 1000 * 60 * 60 * 24 * 30,
  },
});

const userSession = session({
  name: "user_session",
  secret: process.env.USER_SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: false,
    sameSite: "lax",
    maxAge: 1000 * 60 * 60 * 24 * 30,
  },
});

// Apply sessions to their areas
app.use("/admin", adminSession);
app.use("/customer", userSession);

// Make session/user available in ALL EJS views
app.use((req, res, next) => {
  const user = req.session?.user || null;
  const admin = req.session?.admin || null;

  res.locals.session = req.session || null;

  // ✅ SINGLE SOURCE OF TRUTH
  res.locals.user = user;
  res.locals.admin = admin;

  // ✅ ALWAYS SAFE ID
  res.locals.userId = user?.id || req.session?.userId || null;
res.locals.adminId =
  admin?.admin_id ||
  admin?.id ||
  req.session?.admin?.admin_id ||
  req.session?.admin?.id ||
  null;

  res.locals.isCustomerLoggedIn = !!res.locals.userId;
  res.locals.isAdminLoggedIn = !!res.locals.adminId;

  res.locals.currentUserId = res.locals.userId;
  res.locals.currentAdminId = res.locals.adminId;

  // ✅ ADD THIS (IMPORTANT for your topbar)
  res.locals.currentUserName = user?.full_name || "Customer";

  next();
});

// Passport
app.use(passport.initialize());
// =====================
// VISITOR TRACKER (CORRECT PLACE)
// =====================
app.use(visitorTracker);

// IMPORTANT:
// Do not use passport.session() here unless you switch to a single global session strategy.
// Your project is using manual session login (req.session.user / req.session.userId).

// ==================================================
// SOCKET.IO SESSION INTEGRATION
// ==================================================
io.of("/admin").use((socket, next) => {
  adminSession(socket.request, {}, next);
});

io.of("/admin").on("connection", (socket) => {
  console.log("🔐 Admin socket connected:", socket.id);
  socket.on("disconnect", () => {
    console.log("❌ Admin socket disconnected:", socket.id);
  });
});

io.of("/customer").use((socket, next) => {
  userSession(socket.request, {}, next);
});

io.of("/customer").on("connection", (socket) => {
  console.log("🔐 Customer socket connected:", socket.id);
  socket.on("disconnect", () => {
    console.log("❌ Customer socket disconnected:", socket.id);
  });
});

// ==================================================
// FLASH MESSAGES
// ==================================================
app.use((req, res, next) => {
  if (req.session) { 
    res.locals.success = req.session.success || null;
    res.locals.error = req.session.error || null;

    delete req.session.success;
    delete req.session.error;
  } else {
    res.locals.success = null;
    res.locals.error = null;
  }

  next();
});

// ==================================================
// CSRF PROTECTION
// ==================================================
const csrfProtection = csrf({
  cookie: {
    key: "_csrf",
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
  },
});
// 1. API routes FIRST (NO CSRF)

// 2. Webhooks and API routes do not require CSRF
app.use((req, res, next) => {
  if (req.originalUrl.startsWith("/api") || req.originalUrl.startsWith("/webhooks")) return next();
  return csrfProtection(req, res, next);
});

app.use((req, res, next) => {
  res.locals.csrfToken = req.csrfToken();
  next();
});

// ==================================================
// VIEW ENGINE
// ==================================================
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// ==================================================
// STATIC FILES
// ==================================================
app.use(
  express.static(path.join(__dirname, "public"), {
    maxAge: "1d",
    dotfiles: "ignore",
    setHeaders: (res) => {
      res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    },
  })
);

app.use("/uploads", express.static(path.join(__dirname, "public/uploads")));

// app.get("/admin", (req, res) => {
//   res.render("admin/index"); // views/admin/index.ejs
// });
app.get("/admin/", (req, res) => {
  return res.redirect("/admin/a/sign/in");
});

app.use(
  "/admin/a",
  require("./routes/a/sign/sign.routes")
);
app.use("/admin/a/password", require("./routes/a/password/password.routes"));

// ==================================================
// GUEST TOKEN MIDDLEWARE (for carts, wishlists, checkout)
// ==================================================
const guestTokenMiddleware = require("./middleware/guestToken.middleware");
app.use(guestTokenMiddleware);

// ==================================================
// ROUTES
// ==================================================
app.use("/frontend/category", require("./routes/frontend-category.routes"));
app.use("/admin/a/profile/myprofile", require("./routes/a/profile/myprofile.routes"));
app.use("/admin/a/profile/add-admin", require("./routes/a/profile/add-admin.routes"));
app.use("/admin/a/profile/users", require("./routes/a/profile/users.routes"));
app.use("/admin/a/profile/admins", require("./routes/a/profile/admins.routes"));
app.use("/admin/a/profile/master-admins", require("./routes/a/profile/master-admins.routes"));
app.use("/admin/a/profile/super-admins", require("./routes/a/profile/super-admins.routes"));
app.use("/admin", require("./routes/parent-category.routes"));
app.use("/admin", require("./routes/category.routes"));
app.use("/admin", require("./routes/add-product.routes"));
app.use("/search", require("./routes/frontend-search.routes"));
app.use("/admin/a", require("./routes/a/dashboard/visitor.routes"));
app.use("/admin/a/account/dashboard", require("./routes/a/dashboard/dashboard.routes"));

app.use("/admin/a/account/billing", require("./routes/a/account/billing.routes"));
app.use("/admin/a/account/transaction-history", require("./routes/a/account/transaction-history.routes"));
app.use("/admin/a/setting/updateEmail", require("./routes/a/setting/updateEmail.routes"));
app.use("/admin/a/setting/updatePassword", require("./routes/a/setting/updatePassword.routes"));
app.use("/admin/a/orders", require("./routes/a/orders.routes"));
// Customer routes
app.use("/customer", require("./routes/customer.routes"));
app.use("/customer/support-and-help", require("./routes/contact.routes"));
app.use("/customer/support", require("./routes/help-request.routes"));

app.use("/customer/recent-product", require("./routes/recent-product.routes"));
app.use("/customer/frequent-products", require("./routes/frequent-products.routes"));
app.use("/customer/variant-product", require("./routes/variant-product.routes"));
app.use("/customer/product", require("./routes/product-detail.routes"));

app.use("/wishlist", require("./routes/u/wishlist.routes"));
app.use("/customer/cart", require("./routes/cart.routes"));
app.use("/customer/shop", require("./routes/shop.routes"));
app.use("/customer/checkout", require("./routes/checkout.routes"));

app.use("/customer", require("./routes/sign.routes"));
app.use("/customer/u/profile", require("./routes/u/profile.routes"));
// app.use("/customer/wishlist/products", require("./routes/wishlist.routes"));
app.use("/customer/wishlist/products", (req, res) => {
  return res.redirect(301, "/customer/u/wishlist/products" + req.originalUrl.replace("/customer/wishlist/products", ""));
});
app.use("/customer/u/orders", require("./routes/u/orders.routes"));
app.use("/customer/u/account/transaction-history", require("./routes/u/account/transaction-history.routes"));
app.use("/customer/u/account/payment-methods", require("./routes/u/account/payment-method.routes"));


/**
 * NEW ROUTE (ACTUAL HANDLER)
 */
const wishlistRoutes = require("./routes/u/wishlist.routes");

app.use("/customer/wishlist/products", wishlistRoutes);
app.use("/customer/u/wishlist/products", wishlistRoutes); // alias
app.use("/customer/u/addresses", require("./routes/u/addresses.routes"));
app.use("/customer/u/account/billing", require("./routes/u/account/billing.routes"));
app.use("/customer/u/security/updateEmail", require("./routes/u/security/updateEmail.routes"));
app.use("/customer/u/security/updatePassword", require("./routes/u/security/updatePassword.routes"));


app.get("/", (req, res) => res.redirect("/customer"));

// ==================================================
// SOCKET.IO GLOBAL
// ==================================================
io.on("connection", (socket) => {
  console.log("🔐 Socket connected:", socket.id);

  socket.on("disconnect", () => {
    console.log("❌ Socket disconnected:", socket.id);
  });
});

// ==================================================
// GLOBAL ERROR HANDLER
// ==================================================
app.use((err, req, res, next) => {
  console.error("💥 ERROR:", err.stack || err.message);

  if (err.code === "EBADCSRFTOKEN") {
    return res.status(403).send("Invalid CSRF token");
  }

  res.status(500).send("Something went wrong");
});

// ==================================================
// START SERVER
// ==================================================
server.listen(PORT, () => {
  console.log(`🚀 Server running securely on port ${PORT}`);
});

setInterval(() => {
  io.emit("socket_test", { ok: true, time: Date.now() });
}, 3000);