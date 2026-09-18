import { ADMIN_IDLE_LIMIT_MS } from "./auth.config.js";
const CLEANUP_INTERVAL_MS = 60 * 1e3;
class TtlStore {
  constructor(ttlMs) {
    this.ttlMs = ttlMs;
    setInterval(() => this.cleanup(), CLEANUP_INTERVAL_MS).unref();
  }
  ttlMs;
  store = /* @__PURE__ */ new Map();
  set(key, value, ttlMs = this.ttlMs) {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }
  get(key) {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }
  delete(key) {
    this.store.delete(key);
  }
  cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) this.store.delete(key);
    }
  }
}
const OTP_EXPIRES_MS = 10 * 60 * 1e3;
const RECOVERY_SESSION_MS = 15 * 60 * 1e3;
const pendingSignupStore = new TtlStore(OTP_EXPIRES_MS);
const adminRecoveryStore = new TtlStore(RECOVERY_SESSION_MS);
const REFRESH_JTI_TTL_MS = 30 * 24 * 60 * 60 * 1e3;
const REFRESH_ROTATION_GRACE_MS = 10 * 1e3;
const revokedRefreshStore = new TtlStore(REFRESH_JTI_TTL_MS);
function revokeRefreshJti(jti) {
  if (!jti) return;
  revokedRefreshStore.set(jti, { revokedAt: Date.now() }, REFRESH_JTI_TTL_MS);
}
function isRefreshJtiRevoked(jti) {
  if (!jti) return null;
  const entry = revokedRefreshStore.get(jti);
  if (!entry) return null;
  return Date.now() - entry.revokedAt > REFRESH_ROTATION_GRACE_MS ? "revoked" : "grace";
}
class ActivityTracker {
  constructor(idleMs) {
    this.idleMs = idleMs;
    setInterval(() => this.cleanup(), CLEANUP_INTERVAL_MS).unref();
  }
  idleMs;
  map = /* @__PURE__ */ new Map();
  isIdle(adminId) {
    const last = this.map.get(adminId);
    if (last == null) return false;
    return Date.now() - last > this.idleMs;
  }
  touch(adminId) {
    this.map.set(adminId, Date.now());
  }
  delete(adminId) {
    this.map.delete(adminId);
  }
  cleanup() {
    const now = Date.now();
    for (const [id, ts] of this.map) {
      if (now - ts > this.idleMs) this.map.delete(id);
    }
  }
}
const adminActivityTracker = new ActivityTracker(ADMIN_IDLE_LIMIT_MS);
export {
  OTP_EXPIRES_MS,
  RECOVERY_SESSION_MS,
  REFRESH_JTI_TTL_MS,
  REFRESH_ROTATION_GRACE_MS,
  adminActivityTracker,
  adminRecoveryStore,
  isRefreshJtiRevoked,
  pendingSignupStore,
  revokeRefreshJti
};
