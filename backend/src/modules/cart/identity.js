import crypto from "crypto";
const GUEST_TOKEN_COOKIE = "guest_token";
const GUEST_ID_COOKIE = "guest_id";
function customerEmail(req) {
  const user = req.user;
  if (user && user.type === "customer") {
    const row = user.row;
    const email = row?.email;
    if (email) return String(email).trim().toLowerCase();
  }
  return null;
}
function customerId(req) {
  const user = req.user;
  if (user && user.type === "customer") {
    const id = user.id;
    if (Number.isFinite(id) && id > 0) return id;
  }
  return null;
}
const clean = (v) => v !== null && v !== void 0 && String(v).trim() ? String(v).trim() : null;
function rawGuestToken(req) {
  return {
    guestToken: clean(
      req.headers["x-guest-token"] || req.body?.guest_token || req.query?.guest_token || req.cookies?.[GUEST_TOKEN_COOKIE] || req.cookies?.guest_token
    ),
    guestId: clean(
      req.headers["x-guest-id"] || req.body?.guest_id || req.query?.guest_id || req.cookies?.[GUEST_ID_COOKIE] || req.cookies?.guest_id
    )
  };
}
function buildIdentity(req, providedToken, providedGuestId) {
  const email = customerEmail(req);
  const numericId = customerId(req);
  const raw = rawGuestToken(req);
  return {
    // Cart keying — email when logged in, else guest token.
    userId: email,
    cartUserId: email ?? "",
    guestToken: providedToken ?? raw.guestToken,
    // Wishlist keying — numeric id when logged in, else guest id.
    numericId,
    guestId: numericId != null ? null : providedGuestId ?? raw.guestId,
    isCustomer: numericId != null
  };
}
function resolveCartIdentity(req) {
  if (req.cartIdentity) return req.cartIdentity;
  return buildIdentity(req);
}
function guestTokenMiddleware(req, res, next) {
  try {
    const raw = rawGuestToken(req);
    const isCustomer = customerId(req) != null;
    if (!raw.guestToken) {
      const newToken = req.cookies?.[GUEST_TOKEN_COOKIE] || crypto.randomUUID();
      raw.guestToken = String(newToken);
      res.setHeader("x-guest-token", raw.guestToken);
      res.cookie(GUEST_TOKEN_COOKIE, raw.guestToken, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 30 * 24 * 60 * 60 * 1e3
      });
    }
    if (!raw.guestId && !isCustomer) {
      raw.guestId = raw.guestToken;
      res.cookie(GUEST_ID_COOKIE, raw.guestId, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 30 * 24 * 60 * 60 * 1e3
      });
    } else if (raw.guestId && !isCustomer) {
      res.cookie(GUEST_ID_COOKIE, raw.guestId, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 30 * 24 * 60 * 60 * 1e3
      });
    }
    req.cartIdentity = buildIdentity(req, raw.guestToken, raw.guestId);
    return next();
  } catch (err) {
    console.error("Guest token middleware error:", err);
    return next();
  }
}
export {
  GUEST_ID_COOKIE,
  GUEST_TOKEN_COOKIE,
  guestTokenMiddleware,
  resolveCartIdentity
};
