import { createAppError, AppError } from "../../common/errors.js";
import {
  ACCESS_COOKIE,
  verifyAccessToken
} from "./token.service.js";
import { loadAuthAccount } from "./auth.service.js";
import { adminActivityTracker } from "./pending.store.js";
import {
  ADMIN_SESSION_MAX_AGE_MS,
  MASTER_ROLE,
  SUPER_ROLE,
  ADMIN_ROLE,
  SUB_ADMIN_ROLE
} from "./auth.config.js";
async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization;
    const bearer = header?.startsWith("Bearer ") ? header.slice(7) : void 0;
    const token = bearer || req.cookies?.[ACCESS_COOKIE];
    if (!token) {
      req.auth = null;
      req.user = null;
      return next();
    }
    const payload = verifyAccessToken(token);
    if (!payload) {
      req.auth = null;
      req.user = null;
      return next();
    }
    const account = await loadAuthAccount(payload);
    if (!account) {
      req.auth = null;
      req.user = null;
      return next();
    }
    if (account.sessionVersion !== payload.sv) {
      return next(createAppError(401, "SESSION_EXPIRED", "Session expired. Please sign in again."));
    }
    if (account.type === "admin") {
      if (payload.la && Date.now() - payload.la > ADMIN_SESSION_MAX_AGE_MS) {
        adminActivityTracker.delete(account.id);
        return next(createAppError(401, "SESSION_EXPIRED", "Session expired. Please sign in again."));
      }
      if (adminActivityTracker.isIdle(account.id)) {
        adminActivityTracker.delete(account.id);
        return next(createAppError(401, "SESSION_EXPIRED", "Session idle for too long. Please sign in again."));
      }
      adminActivityTracker.touch(account.id);
    }
    req.auth = payload;
    req.user = {
      type: account.type,
      id: account.id,
      role: account.role,
      status: account.status,
      emailVerified: account.emailVerified,
      sessionVersion: account.sessionVersion,
      row: account.row
    };
    return next();
  } catch (err) {
    return next(err instanceof AppError ? err : createAppError(401, "UNAUTHORIZED", "Unable to verify session."));
  }
}
function requireAuth(req, _res, next) {
  if (!req.user) {
    return next(createAppError(401, "UNAUTHORIZED", "Authentication required."));
  }
  return next();
}
function requireAdmin(req, _res, next) {
  if (!req.user) {
    return next(createAppError(401, "UNAUTHORIZED", "Authentication required."));
  }
  if (req.user.type !== "admin") {
    return next(createAppError(403, "FORBIDDEN", "Admin access required."));
  }
  if (req.user.status !== "active") {
    return next(createAppError(403, "ACCOUNT_INACTIVE", "Your account is not active."));
  }
  return next();
}
function requireAdminRoles(roles) {
  const allowed = new Set(roles);
  return (req, _res, next) => {
    requireAdmin(req, _res, (err) => {
      if (err) return next(err);
      const role = req.user.role;
      if (!allowed.has(role)) {
        return next(createAppError(403, "FORBIDDEN", "You do not have permission to perform this action."));
      }
      return next();
    });
  };
}
const requireSuperOrMaster = requireAdminRoles([SUPER_ROLE, MASTER_ROLE]);
const requireAdminManager = requireAdminRoles([SUPER_ROLE, MASTER_ROLE, ADMIN_ROLE]);
const requireUserManager = requireAdminRoles([SUPER_ROLE, MASTER_ROLE, ADMIN_ROLE, SUB_ADMIN_ROLE]);
const isMasterAdmin = requireAdminRoles([MASTER_ROLE]);
export {
  authenticate,
  isMasterAdmin,
  requireAdmin,
  requireAdminManager,
  requireAdminRoles,
  requireAuth,
  requireSuperOrMaster,
  requireUserManager
};
