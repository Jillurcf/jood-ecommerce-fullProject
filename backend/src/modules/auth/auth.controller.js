import { env } from "../../config/index.js";
import { createAppError } from "../../common/errors.js";
import { sendSuccess } from "../../common/response.js";
import {
  appBaseUrl,
  GOOGLE_AUTH_URL,
  GOOGLE_TOKEN_URL,
  GOOGLE_USERINFO_URL
} from "./auth.config.js";
import * as service from "./auth.service.js";
import {
  clearAuthCookies,
  issueTokenPair,
  setAuthCookies,
  verifyAccessToken,
  verifyRefreshToken
} from "./token.service.js";
const t = (v) => String(v ?? "").trim();
function guestContextFrom(req) {
  const token = req.headers["x-guest-token"] || req.body?.guest_token || req.query?.guest_token || req.cookies?.guest_token;
  const guestId = req.headers["x-guest-id"] || req.body?.guest_id || req.query?.guest_id || req.cookies?.guest_id;
  if (!token && !guestId) return void 0;
  return { guestToken: token || null, guestId: guestId || null };
}
function googleCallbackUrl() {
  return env.GOOGLE_CALLBACK_URL || `${appBaseUrl()}/api/auth/customer/google/callback`;
}
function encodeState(guest) {
  if (!guest) return "";
  return Buffer.from(JSON.stringify(guest)).toString("base64url");
}
function decodeState(state) {
  if (!state) return void 0;
  try {
    const parsed = JSON.parse(Buffer.from(state, "base64url").toString("utf8"));
    return {
      guestToken: parsed?.guestToken || null,
      guestId: parsed?.guestId || null
    };
  } catch {
    return void 0;
  }
}
function toPublic(value) {
  return value;
}
async function customerSignUp(req, res) {
  const result = await service.customerSignup({
    full_name: t(req.body?.full_name),
    email: t(req.body?.email),
    phone: t(req.body?.phone),
    password: String(req.body?.password ?? ""),
    confirm_password: String(req.body?.confirm_password ?? ""),
    agree_terms: Boolean(req.body?.agree_terms)
  });
  return sendSuccess(res, result, "Sign up . Enter the OTP sent to your email.", 200);
}
async function customerVerifyOtp(req, res) {
  const session = await service.customerVerifyOtp(
    t(req.body?.email),
    t(req.body?.otp),
    guestContextFrom(req)
  );
  setAuthCookies(res, {
    accessToken: session.accessToken,
    refreshToken: session.refreshToken
  });
  return sendSuccess(res, { user: toPublic(session.user) }, "Account created successfully.", 201);
}
async function customerResendOtp(req, res) {
  const result = await service.customerResendOtp(t(req.body?.email));
  return sendSuccess(res, result, "A new OTP has been sent to your email.");
}
async function customerSignIn(req, res) {
  if (req.body?.payload?.type === "google") {
    return googleSignIn(req, res);
  }
  const rememberMe = Boolean(req.body?.remember_me ?? req.body?.remember);
  const session = await service.customerLogin(
    t(req.body?.email),
    String(req.body?.password ?? ""),
    rememberMe,
    guestContextFrom(req)
  );
  setAuthCookies(res, {
    accessToken: session.accessToken,
    refreshToken: session.refreshToken
  }, rememberMe);
  return sendSuccess(res, { user: toPublic(session.user) }, "Signed in successfully.", 200);
}
async function customerVerifyEmail(req, res) {
  const token = t(req.query?.token);
  const result = await service.customerVerifyEmail(token);
  return sendSuccess(res, result, "Email verified successfully. You can now sign in.");
}
async function customerResendVerification(req, res) {
  const result = await service.customerResendVerification(t(req.body?.email));
  return sendSuccess(res, result, "Verification email sent.");
}
async function customerForgotPassword(req, res) {
  const result = await service.customerForgotPassword(t(req.body?.email));
  return sendSuccess(res, result, "If your email is registered, a reset link has been sent.");
}
async function customerGetResetPassword(req, res) {
  const valid = await service.customerValidateResetToken(t(req.query?.token));
  if (!valid) {
    throw createAppError(422, "INVALID_RESET_TOKEN", "Reset link is invalid or expired.");
  }
  return sendSuccess(res, valid, "Reset token is valid.");
}
async function customerPostResetPassword(req, res) {
  const result = await service.customerResetPassword(
    t(req.body?.token),
    String(req.body?.password ?? ""),
    String(req.body?.confirm_password ?? "")
  );
  return sendSuccess(res, { email: result.email }, "Password updated. Please sign in.");
}
function requireGoogleConfig() {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw createAppError(500, "GOOGLE_NOT_CONFIGURED", "Google sign-in is not configured.");
  }
}
async function googleSignIn(req, res) {
  requireGoogleConfig();
  const guest = guestContextFrom(req);
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: googleCallbackUrl(),
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    prompt: "select_account"
  });
  const state = encodeState(guest);
  if (state) params.set("state", state);
  return res.redirect(`${GOOGLE_AUTH_URL}?${params.toString()}`);
}
async function googleCallback(req, res) {
  const errorRedirect = (code2, message) => {
    const params = new URLSearchParams({ status: "error", error_code: code2, message });
    return res.redirect(`${env.FRONTEND_URL}/auth/callback?${params.toString()}`);
  };
  const code = t(req.query?.code);
  const oauthError = t(req.query?.error);
  if (oauthError) {
    return errorRedirect("GOOGLE_DENIED", oauthError);
  }
  if (!code) {
    return errorRedirect("GOOGLE_MISSING_CODE", "Google sign-in was cancelled.");
  }
  requireGoogleConfig();
  try {
    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: googleCallbackUrl(),
        grant_type: "authorization_code"
      })
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      return errorRedirect("GOOGLE_TOKEN_ERROR", tokenData.error || "Unable to complete sign-in.");
    }
    const infoRes = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });
    const info = await infoRes.json();
    if (!infoRes.ok || !info.sub || !info.email) {
      return errorRedirect("GOOGLE_PROFILE_ERROR", info.error || "Unable to load Google profile.");
    }
    const session = await service.googleLogin(
      {
        googleId: info.sub,
        email: info.email,
        fullName: info.name || info.email,
        photo: info.picture || null
      },
      decodeState(t(req.query?.state))
    );
    setAuthCookies(res, {
      accessToken: session.accessToken,
      refreshToken: session.refreshToken
    });
    const params = new URLSearchParams({ status: "success", email: info.email });
    return res.redirect(`${env.FRONTEND_URL}/auth/callback?${params.toString()}`);
  } catch (err) {
    const error = err;
    return errorRedirect(error.errorCode || "GOOGLE_FAILED", error.message || "Google sign-in failed.");
  }
}
async function adminSignIn(req, res) {
  const result = await service.adminSignIn(t(req.body?.email), String(req.body?.password ?? ""));
  return sendSuccess(res, result, "Password verified. Enter the OTP sent to your email.");
}
async function adminVerifyOtp(req, res) {
  const session = await service.adminVerifyOtp(t(req.body?.email), t(req.body?.otp));
  setAuthCookies(res, {
    accessToken: session.accessToken,
    refreshToken: session.refreshToken
  });
  return sendSuccess(res, { admin: toPublic(session.admin), role: session.role }, "Signed in successfully.");
}
async function adminResendOtp(req, res) {
  const result = await service.adminResendOtp(t(req.body?.email));
  return sendSuccess(res, result, "A new OTP has been sent to your email.");
}
async function adminForgotPassword(req, res) {
  const result = await service.adminForgotPassword({
    identifier: t(req.body?.identifier || req.body?.email),
    recovery_mode: t(req.body?.recovery_mode) || "otp"
  });
  return sendSuccess(res, result, "If the account exists, recovery instructions were sent.");
}
async function adminVerifyRecoveryOtp(req, res) {
  const result = await service.adminVerifyRecoveryOtp(t(req.body?.email), t(req.body?.otp));
  return sendSuccess(res, result, "OTP verified. You can now reset your password.");
}
async function adminResendRecoveryOtp(req, res) {
  const result = await service.adminResendRecoveryOtp(t(req.body?.email));
  return sendSuccess(res, result, "A new OTP has been sent to your email.");
}
async function adminResetPassword(req, res) {
  const result = await service.adminResetPassword({
    email: t(req.body?.email),
    token: t(req.body?.token || req.query?.token),
    password: String(req.body?.password ?? ""),
    confirm_password: String(req.body?.confirm_password ?? "")
  });
  return sendSuccess(res, result, "Password updated. Please sign in.");
}
async function adminGetResetPassword(req, res) {
  const token = t(req.query?.token);
  if (!token) {
    throw createAppError(422, "VALIDATION_ERROR", "Reset token is required.");
  }
  const valid = await service.adminValidateResetToken(token);
  if (!valid) {
    throw createAppError(422, "INVALID_RESET_TOKEN", "Reset link is invalid or expired.");
  }
  return sendSuccess(res, valid, "Reset token is valid.");
}
async function refresh(req, res) {
  const token = req.cookies?.jood_refresh;
  if (!token) {
    throw createAppError(401, "UNAUTHORIZED", "Missing refresh token.");
  }
  const payload = verifyRefreshToken(token);
  if (!payload) {
    clearAuthCookies(res);
    throw createAppError(401, "UNAUTHORIZED", "Invalid or expired refresh token.");
  }
  const account = await service.loadAuthAccount(payload);
  if (!account || account.sessionVersion !== payload.sv) {
    clearAuthCookies(res);
    throw createAppError(401, "SESSION_EXPIRED", "Session expired. Please sign in again.");
  }
  if (account.status === "deleted" || account.status !== "active") {
    clearAuthCookies(res);
    throw createAppError(401, "ACCOUNT_INACTIVE", "Your account is not active.");
  }
  const reuse = service.refreshReuseState(payload);
  if (reuse === "revoked") {
    await service.revokeSessionOnRefreshReuse(payload);
    clearAuthCookies(res);
    throw createAppError(401, "SESSION_EXPIRED", "Session expired. Please sign in again.");
  }
  service.markRefreshRotated(payload.jti);
  const pair = issueTokenPair({
    id: account.id,
    type: account.type,
    role: account.role === "customer" ? void 0 : account.role,
    sessionVersion: account.sessionVersion,
    loginAt: payload.la
  });
  setAuthCookies(res, pair, Boolean(req.body?.remember_me));
  return sendSuccess(res, {
    type: account.type,
    id: account.id,
    role: account.role
  });
}
async function me(req, res) {
  if (!req.user) {
    throw createAppError(401, "UNAUTHORIZED", "Not authenticated.");
  }
  const u = req.user;
  if (u.type === "customer") {
    const user = {
      id: u.id,
      user_id: String(u.row.userId ?? ""),
      full_name: String(u.row.fullName ?? ""),
      email: String(u.row.email ?? ""),
      phone: u.row.phone ? String(u.row.phone) : null,
      google_id: u.row.googleId ? String(u.row.googleId) : null,
      provider: String(u.row.provider ?? ""),
      status: String(u.row.status ?? ""),
      email_verified: Boolean(u.row.emailVerified),
      phone_verified: u.row.phoneVerified == null ? null : Boolean(u.row.phoneVerified),
      is_online: Boolean(u.row.isOnline),
      last_login_at: u.row.lastLoginAt ? new Date(u.row.lastLoginAt) : null,
      session_version: Number(u.row.sessionVersion ?? 1)
    };
    return sendSuccess(res, { type: "customer", user });
  }
  const admin = {
    id: u.id,
    admin_id: String(u.row.adminId ?? ""),
    full_name: String(u.row.fullName ?? ""),
    email: String(u.row.email ?? ""),
    phone: u.row.phone ? String(u.row.phone) : null,
    role: String(u.row.role ?? ""),
    status: String(u.row.status ?? ""),
    email_verified: Boolean(u.row.emailVerified),
    is_online: Boolean(u.row.isOnline),
    last_login_at: u.row.lastLoginAt ? new Date(u.row.lastLoginAt) : null,
    last_activity_at: u.row.lastActivityAt ? new Date(u.row.lastActivityAt) : null,
    session_version: Number(u.row.sessionVersion ?? 1)
  };
  return sendSuccess(res, { type: "admin", admin });
}
async function customerLogout(req, res) {
  if (req.user?.id) {
    await service.customerLogout(req.user.id);
    service.markRefreshRotated(req.auth?.jti);
  }
  clearAuthCookies(res);
  return sendSuccess(res, void 0, "Signed out successfully.");
}
async function adminLogout(req, res) {
  if (req.user?.id) {
    await service.adminLogout(req.user.id);
    service.markRefreshRotated(req.auth?.jti);
  }
  clearAuthCookies(res);
  return sendSuccess(res, void 0, "Signed out successfully.");
}
async function googleLogout(req, res) {
  return customerLogout(req, res);
}
async function verifyOnly(req, res) {
  const access = req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : req.cookies?.jood_access;
  if (!access) {
    throw createAppError(401, "UNAUTHORIZED", "Missing access token.");
  }
  const payload = verifyAccessToken(access);
  if (!payload) {
    throw createAppError(401, "UNAUTHORIZED", "Invalid or expired access token.");
  }
  const account = await service.loadAuthAccount(payload);
  if (!account || account.sessionVersion !== payload.sv) {
    throw createAppError(401, "SESSION_EXPIRED", "Session expired. Please sign in again.");
  }
  return sendSuccess(res, { type: account.type, id: account.id, role: account.role });
}
export {
  adminForgotPassword,
  adminGetResetPassword,
  adminLogout,
  adminResendOtp,
  adminResendRecoveryOtp,
  adminResetPassword,
  adminSignIn,
  adminVerifyOtp,
  adminVerifyRecoveryOtp,
  customerForgotPassword,
  customerGetResetPassword,
  customerLogout,
  customerPostResetPassword,
  customerResendOtp,
  customerResendVerification,
  customerSignIn,
  customerSignUp,
  customerVerifyEmail,
  customerVerifyOtp,
  googleCallback,
  googleLogout,
  googleSignIn,
  me,
  refresh,
  verifyOnly
};
