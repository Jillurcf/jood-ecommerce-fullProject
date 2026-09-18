// routes/help-request.routes.js
'use strict';

const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const csrf = require('csurf');

const helpController = require('../controllers/help-request.controller');
const { uploadHelpAttachment } = require('../middleware/upload.help');

// ===============================
// AJAX DETECTION HELPER
// ===============================
const isAjaxRequest = (req) =>
  req.xhr ||
  (req.headers.accept && req.headers.accept.includes('application/json')) ||
  req.get('X-Requested-With') === 'XMLHttpRequest' ||
  (req.headers['content-type'] && req.headers['content-type'].includes('application/json'));

// ===============================
// CSRF PROTECTION (cookie-based)
// ===============================
const csrfProtection = csrf({
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  },
});

// ===============================
// RATE LIMITER (anti-spam)
// ===============================
const helpLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 6,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    const msg = 'Too many requests, please try again later.';
    if (isAjaxRequest(req)) return res.status(429).json({ success: false, message: msg });
    return res.status(429).send(msg);
  },
});

// ===============================
// VALIDATION CHAIN
// ===============================
const validationChain = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 150 })
    .withMessage('Name must be between 2 and 150 characters'),

  body('email')
    .trim()
    .isEmail()
    .withMessage('Valid email address is required')
    .isLength({ max: 254 })
    .normalizeEmail(),

  body('phone')
    .optional({ checkFalsy: true })
    .trim()
    .matches(/^\+?[0-9\-\s]{6,20}$/)
    .withMessage('Invalid phone number format'),

  body('orderNumber')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 50 }),

  body('category')
    .trim()
    .notEmpty()
    .withMessage('Please select a category')
    .isLength({ max: 100 }),

  body('subject')
    .trim()
    .isLength({ min: 3, max: 200 })
    .withMessage('Subject must be between 3 and 200 characters'),

  body('message')
    .trim()
    .isLength({ min: 5, max: 5000 })
    .withMessage('Message must be between 5 and 5000 characters'),

  body('preferredContact')
    .optional()
    .isIn(['email', 'phone'])
    .withMessage('Invalid preferred contact method'),
];

// ===============================
// GET Help Request Page
// ===============================
router.get('/', csrfProtection, (req, res, next) => {
  try {
    return helpController.helpRequestPage(req, res);
  } catch (err) {
    console.error('Help request GET error:', err);
    next(err);
  }
});

// ===============================
// POST Help Request Submission
// ===============================
router.post(
  '/submit',
  csrfProtection,
  helpLimiter,
  uploadHelpAttachment.single('attachment'),
  validationChain,
  async (req, res) => {
    let file = req.file;

    try {
      const errors = validationResult(req);

      // -------------------------
      // VALIDATION ERRORS
      // -------------------------
      if (!errors.isEmpty()) {
        if (file?.path) {
          fs.unlink(file.path, (err) => {
            if (err) console.error('Failed to remove file after validation error:', err);
          });
        }

        const errMsg = errors.array().map((e) => e.msg).join('. ');
        if (isAjaxRequest(req)) {
          return res.status(422).json({ success: false, message: errMsg, errors: errors.array() });
        }

        return res.status(422).render('customer/support-and-help/help-request', {
          csrfToken: req.csrfToken ? req.csrfToken() : null,
          errors: errors.array(),
          oldInput: req.body,
          pageTitle: 'Help Request',
        });
      }

      // -------------------------
      // SUBMIT TO CONTROLLER
      // -------------------------
      const result = await helpController.submitHelpRequest(req);

      if (isAjaxRequest(req)) return res.json(result);

      if (result?.success) {
        return res.redirect('/customer/support/help-request?sent=1');
      }

      return res.status(500).render('customer/support-and-help/help-request', {
        csrfToken: req.csrfToken ? req.csrfToken() : null,
        errors: [{ msg: result?.message || 'Failed to submit help request.' }],
        oldInput: req.body,
        pageTitle: 'Help Request',
      });
    } catch (err) {
      // -------------------------
      // MULTER ERRORS
      // -------------------------
      if (err instanceof multer.MulterError) {
        if (file?.path) fs.unlink(file.path, () => {});
        const msg = err.message || 'File upload error';
        return isAjaxRequest(req)
          ? res.status(400).json({ success: false, message: msg })
          : res.status(400).render('customer/support-and-help/help-request', {
              csrfToken: req.csrfToken ? req.csrfToken() : null,
              errors: [{ msg }],
              oldInput: req.body,
              pageTitle: 'Help Request',
            });
      }

      // -------------------------
      // CSRF ERRORS
      // -------------------------
      if (err?.code === 'EBADCSRFTOKEN' || err?.status === 403) {
        console.error('CSRF error on help request:', err);
        return isAjaxRequest(req)
          ? res.status(403).json({ success: false, message: 'Invalid CSRF token' })
          : res.status(403).send('Invalid CSRF token');
      }

      // -------------------------
      // OTHER SERVER ERRORS
      // -------------------------
      console.error('Help Request Server Error:', err);
      if (file?.path) {
        fs.unlink(file.path, (uerr) => {
          if (uerr) console.error('Failed to remove file after server error:', uerr);
        });
      }

      return isAjaxRequest(req)
        ? res.status(500).json({ success: false, message: 'Server error. Please try again later.' })
        : res.status(500).render('customer/support-and-help/help-request', {
            csrfToken: req.csrfToken ? req.csrfToken() : null,
            errors: [{ msg: 'Server error. Please try again later.' }],
            oldInput: req.body,
            pageTitle: 'Help Request',
          });
    }
  }
);

module.exports = router;
