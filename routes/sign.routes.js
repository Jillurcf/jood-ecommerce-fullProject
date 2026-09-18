"use strict";

require("dotenv").config();

const express = require("express");
const passport = require("passport");
const { Strategy: GoogleStrategy } = require("passport-google-oauth20");
const { pool } = require("../includes/conn");
const signController = require("../controllers/sign.controller");

const router = express.Router();

// ==================================================
// ENV
// ==================================================
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_CALLBACK_URL =
  process.env.GOOGLE_CALLBACK_URL ||
  "http://localhost:4000/customer/auth/google/callback";

// ==================================================
// HELPERS
// ==================================================
function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function sanitizeText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function generateUserId(fullName) {
  const baseName =
    sanitizeText(fullName)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 12) || "user";

  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const random = Math.floor(10000000 + Math.random() * 90000000);

  return `${baseName}_${date}_${random}`;
}

function getSessionCustomer(req) {
  if (req.session?.user?.id) return req.session.user;

  if (req.session?.userId) {
    return {
      id: req.session.userId,
      user_id: req.session.userUserId || null,
      full_name: req.session.userName || null,
      email: req.session.userEmail || null,
      phone: req.session.userPhone || null,
      role: req.session.userRole || "customer",
      provider: req.session.authProvider || "local",
      loginAt: req.session.loginAt || null,
      sessionVersion: req.session.sessionVersion || 1,
    };
  }

  return null;
}

function isCustomerLoggedIn(req) {
  return Boolean(getSessionCustomer(req));
}

function setFlash(req, type, message) {
  if (!req.session) return;
  req.session[type] = message;
}

function redirectIfLoggedIn(req, res, next) {
  if (isCustomerLoggedIn(req)) {
    return res.redirect("/customer/u/profile");
  }
  return next();
}

function ensureGoogleReady(req, res, next) {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return res.status(503).send("Google login is not configured on the server.");
  }
  return next();
}

function setCustomerSession(req, user, provider = "local") {
  return new Promise((resolve, reject) => {
    if (!req.session) {
      return reject(new Error("Session is unavailable."));
    }

    req.session.regenerate((err) => {
      if (err) return reject(err);

      const sessionUser = {
        id: user.id,
        user_id: user.user_id || null,
        full_name: user.full_name || null,
        email: user.email || null,
        phone: user.phone || null,
        google_id: user.google_id || null,
        role: "customer",
        provider,
        loginAt: new Date().toISOString(),
        sessionVersion: user.session_version || 1,
      };

      req.session.user = sessionUser;
      req.session.userId = user.id;
      req.session.userUserId = user.user_id || null;
      req.session.userName = user.full_name || null;
      req.session.userEmail = user.email || null;
      req.session.userPhone = user.phone || null;
      req.session.userRole = "customer";
      req.session.isAuthenticated = true;
      req.session.authProvider = provider;
      req.session.loginAt = sessionUser.loginAt;
      req.session.sessionVersion = sessionUser.sessionVersion;

      req.session.save((saveErr) => {
        if (saveErr) return reject(saveErr);
        resolve(sessionUser);
      });
    });
  });
}

async function findCustomerByEmail(email) {
  const result = await pool.query(
    `
      SELECT
        id,
        user_id,
        full_name,
        email,
        phone,
        google_id,
        password_hash,
        provider,
        status,
        email_verified,
        session_version
      FROM customer_accounts
      WHERE LOWER(email) = LOWER($1)
      LIMIT 1
    `,
    [email]
  );

  return result.rows[0] || null;
}

async function findCustomerByGoogleId(googleId) {
  const result = await pool.query(
    `
      SELECT
        id,
        user_id,
        full_name,
        email,
        phone,
        google_id,
        password_hash,
        provider,
        status,
        email_verified,
        session_version
      FROM customer_accounts
      WHERE google_id = $1
      LIMIT 1
    `,
    [googleId]
  );

  return result.rows[0] || null;
}

async function findCustomerById(id) {
  const result = await pool.query(
    `
      SELECT
        id,
        user_id,
        full_name,
        email,
        phone,
        google_id,
        password_hash,
        provider,
        status,
        email_verified,
        session_version
      FROM customer_accounts
      WHERE id = $1
      LIMIT 1
    `,
    [id]
  );

  return result.rows[0] || null;
}

async function upsertGoogleCustomer(profile) {
  const email = normalizeEmail(profile.emails?.[0]?.value);
  const fullName = sanitizeText(profile.displayName || "") || "Google User";
  const googleId = profile.id;

  if (!email) {
    throw new Error("Google account did not return an email.");
  }

  let user = await findCustomerByGoogleId(googleId);

  if (!user) {
    user = await findCustomerByEmail(email);
  }

  if (!user) {
    const newUserId = generateUserId(fullName);

    const insert = await pool.query(
      `
        INSERT INTO customer_accounts
          (
            user_id,
            full_name,
            email,
            google_id,
            password_hash,
            provider,
            status,
            email_verified,
            login_attempts,
            is_online,
            session_version,
            created_at,
            updated_at
          )
        VALUES
          (
            $1,
            $2,
            $3,
            $4,
            NULL,
            'google',
            'active',
            TRUE,
            0,
            FALSE,
            1,
            NOW(),
            NOW()
          )
        RETURNING
          id,
          user_id,
          full_name,
          email,
          phone,
          google_id,
          provider,
          status,
          email_verified,
          session_version
      `,
      [newUserId, fullName, email, googleId]
    );

    return insert.rows[0];
  }

  const updates = [];
  const values = [];

  if (!user.google_id) {
    updates.push(`google_id = $${values.length + 1}`);
    values.push(googleId);
  }

  if (!user.full_name && fullName) {
    updates.push(`full_name = $${values.length + 1}`);
    values.push(fullName);
  }

  if (!user.user_id) {
    updates.push(`user_id = $${values.length + 1}`);
    values.push(generateUserId(fullName));
  }

  if (!user.provider || user.provider === "local") {
    updates.push(`provider = 'google'`);
  }

  if (updates.length > 0) {
    values.push(user.id);

    await pool.query(
      `
        UPDATE customer_accounts
        SET ${updates.join(", ")},
            updated_at = NOW()
        WHERE id = $${values.length}
      `,
      values
    );

    const refreshed = await findCustomerById(user.id);
    return refreshed || user;
  }

  return user;
}

// ==================================================
// GOOGLE STRATEGY
// ==================================================
if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: GOOGLE_CLIENT_ID,
        clientSecret: GOOGLE_CLIENT_SECRET,
        callbackURL: GOOGLE_CALLBACK_URL,
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const user = await upsertGoogleCustomer(profile);

          if (user.status && user.status !== "active") {
            return done(null, false, {
              message: "Your account is not active.",
            });
          }

          return done(null, user);
        } catch (err) {
          return done(err);
        }
      }
    )
  );
} else {
  console.error(
    "Google OAuth is not configured. Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET."
  );
}

// ==================================================
// SMALL ROUTE HELPERS
// ==================================================
function bindGet(paths, ...handlers) {
  paths.forEach((path) => router.get(path, ...handlers));
}

function bindPost(paths, ...handlers) {
  paths.forEach((path) => router.post(path, ...handlers));
}

// ==================================================
// PAGE ROUTES
// ==================================================
bindGet(["/", "/home"], (req, res) => res.redirect("/customer/sign/in"));

bindGet(
  ["/sign/in", "/in"],
  redirectIfLoggedIn,
  signController.getSignInPage
);

bindGet(
  ["/sign/up", "/up"],
  redirectIfLoggedIn,
  signController.getSignUpPage
);

bindGet(
  ["/verify-otp", "/sign/verify-otp"],
  redirectIfLoggedIn,
  signController.getOtpPage
);

bindGet(
  ["/forgot-password", "/sign/forgot-password"],
  signController.getForgotPasswordPage
);

bindGet(
  ["/reset-password", "/sign/reset-password"],
  signController.getResetPasswordPage
);

// ==================================================
// LOCAL AUTH ROUTES
// ==================================================
bindPost(["/sign/in", "/in"], signController.postSignIn);
bindPost(["/sign/up", "/up"], signController.postSignUp);

// OTP verification flow
bindPost(["/verify-otp", "/sign/verify-otp"], signController.postVerifyOtp);
bindPost(["/resend-otp"], signController.postResendOtp);

// ==================================================
// EMAIL VERIFICATION ROUTES
// ==================================================
bindGet(["/verify-email", "/sign/verify-email"], signController.verifyEmail);
bindPost(
  ["/resend-verification", "/sign/resend-verification"],
  signController.postResendVerification
);

// ==================================================
// PASSWORD RESET ROUTES
// ==================================================
bindPost(
  ["/forgot-password", "/sign/forgot-password"],
  signController.postForgotPassword
);
bindPost(
  ["/reset-password", "/sign/reset-password"],
  signController.postResetPassword
);

// ==================================================
// GOOGLE AUTH ROUTES
// ==================================================
bindGet(
  ["/auth/google", "/google"],
  ensureGoogleReady,
  passport.authenticate("google", {
    scope: ["profile", "email"],
    session: false,
  })
);

bindGet(
  ["/auth/google/callback", "/google/callback"],
  ensureGoogleReady,
  passport.authenticate("google", {
    failureRedirect: "/customer/sign/in",
    session: false,
  }),
  async (req, res, next) => {
    try {
      if (!req.user) {
        setFlash(req, "error", "Google sign-in failed.");
        return res.redirect("/customer/sign/in");
      }

      return signController.googleAuthSuccess(req, res, next);
    } catch (err) {
      return next(err);
    }
  }
);

// ==================================================
// SESSION / ACCOUNT ROUTES
// ==================================================
bindGet(["/logout"], signController.logoutCustomer);
bindGet(["/current"], signController.getCurrentCustomer);

// ==================================================
// OPTIONAL TEST ROUTE
// ==================================================
router.get("/check", (req, res) => {
  const current = getSessionCustomer(req);

  if (!current) {
    return res.status(401).json({ ok: false, loggedIn: false });
  }

  return res.json({
    ok: true,
    loggedIn: true,
    user: current,
  });
});

module.exports = router;
