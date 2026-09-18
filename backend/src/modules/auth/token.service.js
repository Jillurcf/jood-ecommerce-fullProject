import jwt from "jsonwebtoken";
import crypto from "crypto";
import { env } from "../../config/index.js";
const ACCESS_COOKIE = "jood_access";
const REFRESH_COOKIE = "jood_refresh";
function signToken(payload, secret, expiresIn) {
  const options = {
    expiresIn,
    issuer: "jood-api"
  };
  return jwt.sign(payload, secret, options);
}
function issueTokenPair(input) {
  const jti = input.jti || cryptoRandomToken(14);
  const base = {
    sub: input.id,
    type: input.type,
    role: input.role,
    sv: input.sessionVersion,
    la: input.loginAt,
    jti
  };
  return {
    accessToken: signToken(base, env.JWT_ACCESS_SECRET, env.ACCESS_TOKEN_TTL),
    refreshToken: signToken(
      { ...base, role: input.role },
      env.JWT_REFRESH_SECRET,
      env.REFRESH_TOKEN_TTL
    )
  };
}
function verifyAccessToken(token) {
  try {
    return jwt.verify(token, env.JWT_ACCESS_SECRET, { issuer: "jood-api" });
  } catch {
    return null;
  }
}
function verifyRefreshToken(token) {
  try {
    return jwt.verify(token, env.JWT_REFRESH_SECRET, {
      issuer: "jood-api"
    });
  } catch {
    return null;
  }
}
function decodeToken(token) {
  try {
    return jwt.decode(token);
  } catch {
    return null;
  }
}
function cookieSecure() {
  if (env.COOKIE_SECURE === "true") return true;
  if (env.COOKIE_SECURE === "false") return false;
  return env.NODE_ENV === "production";
}
function cookieBaseOptions() {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: cookieSecure()
  };
}
function setAuthCookies(res, pair, rememberMe = false) {
  const accessMs = ttlToMs(env.ACCESS_TOKEN_TTL, 15 * 60 * 1e3);
  const refreshMs = rememberMe ? ttlToMs(env.REFRESH_TOKEN_TTL, 30 * 24 * 60 * 60 * 1e3) : 0;
  res.cookie(ACCESS_COOKIE, pair.accessToken, {
    ...cookieBaseOptions(),
    path: "/",
    maxAge: accessMs
  });
  res.cookie(REFRESH_COOKIE, pair.refreshToken, {
    ...cookieBaseOptions(),
    path: "/api/auth",
    ...refreshMs > 0 ? { maxAge: refreshMs } : {}
  });
}
function clearAuthCookies(res) {
  res.clearCookie(ACCESS_COOKIE, { ...cookieBaseOptions(), path: "/" });
  res.clearCookie(REFRESH_COOKIE, { ...cookieBaseOptions(), path: "/api/auth" });
}
function ttlToMs(ttl, fallback) {
  const match = /^(\d+)([smhd])$/.exec(String(ttl || "").trim());
  if (!match) return fallback;
  const value = Number(match[1]);
  const unit = match[2];
  if (unit === "s") return value * 1e3;
  if (unit === "m") return value * 60 * 1e3;
  if (unit === "h") return value * 60 * 60 * 1e3;
  if (unit === "d") return value * 24 * 60 * 60 * 1e3;
  return fallback;
}
function cryptoRandomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("hex");
}
export {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  clearAuthCookies,
  cryptoRandomToken,
  decodeToken,
  issueTokenPair,
  setAuthCookies,
  ttlToMs,
  verifyAccessToken,
  verifyRefreshToken
};
