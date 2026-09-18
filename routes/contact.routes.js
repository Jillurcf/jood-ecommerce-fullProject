// routes/contact.routes.js
const express = require("express");
const router = express.Router();
const { body, validationResult } = require("express-validator");
const rateLimit = require("express-rate-limit");
const csrf = require("csurf");

const contactController = require("../controllers/contact.controller");

// =========================
// HELPERS
// =========================
const isAjaxRequest = (req) =>
  req.xhr ||
  (req.headers.accept || "").includes("application/json") ||
  req.get("X-Requested-With") === "XMLHttpRequest" ||
  (req.headers["content-type"] || "").includes("application/json");

const containsLink = (value = "") =>
  /(https?:\/\/|www\.|\.com|\.net|\.org|\.co|ftp:\/\/|mailto:|tel:)/i.test(
    String(value)
  );

const hasHtml = (value = "") => /<[^>]*>/g.test(String(value));

const noLinks = (value = "") => !containsLink(value);
const noHtml = (value = "") => !hasHtml(value);

// =========================
// CSRF PROTECTION
// =========================
const csrfProtection = csrf({
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  },
});

// =========================
// RATE LIMITER
// =========================
const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    const msg = "Too many submissions. Please try again later.";
    if (isAjaxRequest(req)) {
      return res.status(429).json({ success: false, message: msg });
    }
    return res.status(429).send(msg);
  },
});

// =========================
// GET CONTACT PAGE
// =========================
router.get("/contact-us", csrfProtection, contactController.contactUs);

// =========================
// POST CONTACT FORM
// =========================
router.post(
  "/contact-submit",
  csrfProtection,
  contactLimiter,
  [
    body("name")
      .trim()
      .isLength({ min: 2, max: 150 })
      .withMessage("Name must be 2-150 characters")
      .matches(/^[A-Za-z\s'-]+$/)
      .withMessage("Name can contain letters only")
      .custom(noLinks)
      .withMessage("Links are not allowed in name")
      .custom(noHtml)
      .withMessage("Invalid characters in name"),

    body("email")
      .trim()
      .isEmail()
      .withMessage("Valid email required")
      .normalizeEmail()
      .custom(noLinks)
      .withMessage("Invalid email value"),

    body("subject")
      .trim()
      .isLength({ min: 3, max: 200 })
      .withMessage("Subject must be 3-200 characters")
      .custom(noLinks)
      .withMessage("Links are not allowed in subject")
      .custom(noHtml)
      .withMessage("Invalid characters in subject")
      .matches(/^[A-Za-z0-9\s'.,!?&()\-_/]+$/)
      .withMessage("Subject can contain text only"),

    body("message")
      .trim()
      .isLength({ min: 5, max: 5000 })
      .withMessage("Message must be 5-5000 characters")
      .custom(noLinks)
      .withMessage("Links are not allowed in message")
      .custom(noHtml)
      .withMessage("HTML is not allowed in message"),
  ],
  async (req, res) => {
    const page = "customer/support-and-help/contact-us";
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      const errMsg = errors.array().map((e) => e.msg).join(" ");

      if (isAjaxRequest(req)) {
        return res.status(422).json({
          success: false,
          message: errMsg,
          errors: errors.array(),
        });
      }

      return res.status(422).render(page, {
        csrfToken: req.csrfToken(),
        errors: errors.array(),
        oldInput: req.body,
        pageTitle: "Contact Us",
      });
    }

    try {
      // Controller expects req
      const result = await contactController.submitContact(req);

      if (isAjaxRequest(req)) {
        return res.json(result);
      }

      if (result.success) {
        return res.redirect("/customer/support-and-help/contact-us?sent=1");
      }

      return res.status(400).render(page, {
        csrfToken: req.csrfToken(),
        errors: [{ msg: result.message }],
        oldInput: req.body,
        pageTitle: "Contact Us",
      });
    } catch (error) {
      console.error("Contact Submit Error:", error);

      const msg = "Something went wrong. Please try again later.";

      if (isAjaxRequest(req)) {
        return res.status(500).json({ success: false, message: msg });
      }

      return res.status(500).render(page, {
        csrfToken: req.csrfToken(),
        errors: [{ msg }],
        oldInput: req.body,
        pageTitle: "Contact Us",
      });
    }
  }
);

module.exports = router;