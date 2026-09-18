"use strict";

const express = require("express");
const rateLimit = require("express-rate-limit");

const router = express.Router();
const controller = require("../../controllers/u/addresses.controller");

/* =========================
   BODY PARSERS (SAFE LIMITS)
========================= */
router.use(express.json({ limit: "10kb" }));
router.use(express.urlencoded({ extended: false, limit: "10kb" }));

/* =========================
   RATE LIMITER (ANTI ABUSE)
========================= */
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

router.use(limiter);

/* =========================
   HELPERS
========================= */
function isJson(req) {
  return (
    req.xhr ||
    String(req.headers?.accept || "").includes("application/json")
  );
}

function requireCustomer(req, res, next) {
  const id = req.session?.user?.id || req.session?.userId;

  if (!id) {
    if (isJson(req)) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }
    return res.redirect("/");
  }

  return next();
}

function sanitize(req, _res, next) {
  if (req.body && typeof req.body === "object") {
    for (const key of Object.keys(req.body)) {
      const val = req.body[key];
      if (typeof val === "string") {
        req.body[key] = val
          .trim()
          .replace(/\s+/g, " ")
          .slice(0, 500);
      }
    }
  }
  return next();
}

/* =========================
   AUTH MIDDLEWARE
========================= */
router.use(requireCustomer);

/* =========================
   READ ROUTES
========================= */
router.get("/", controller.addressesPage);
router.get("/json", controller.getAddresses);

/* =========================
   MUTATION ROUTES
========================= */

/* Add / Update / Delete */
router.post("/add", sanitize, controller.addAddress);
router.post("/update", sanitize, controller.updateAddress);
router.post("/delete", sanitize, controller.deleteAddress);

/* =========================
   PIN / UNPIN SYSTEM
========================= */

/* Set as default (PIN) */
router.post("/default", sanitize, controller.setDefaultAddress);
router.post("/set-default", sanitize, controller.setDefaultAddress);

/* UNPIN (remove default flag only) */
router.post("/unpin", sanitize, controller.unpinAddress);

/* =========================
   PERMANENT ADDRESS (REAL TIME UPDATE)
========================= */
router.post(
  "/update-primary",
  sanitize,
  controller.updatePrimaryAddress
);

/* =========================
   INVALID ROUTES
========================= */
router.all("*", (req, res) => {
  if (isJson(req)) {
    return res.status(404).json({
      success: false,
      message: "Not found",
    });
  }
  return res.status(404).send("Not found");
});

/* =========================
   ERROR HANDLER
========================= */
router.use((err, req, res, _next) => {
  console.error("Addresses Route Error:", err);

  if (
    err?.code === "EBADCSRFTOKEN" ||
    err?.name === "ForbiddenError"
  ) {
    if (isJson(req)) {
      return res.status(403).json({
        success: false,
        message: "Invalid CSRF token",
      });
    }
    return res.status(403).send("Invalid CSRF token");
  }

  return res.status(500).json({
    success: false,
    message: "Server error",
  });
});

module.exports = router;