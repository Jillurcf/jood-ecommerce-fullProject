import { prisma } from "../../lib/prisma.js";
import { createAppError } from "../../common/errors.js";
import {
  MASTER_ROLE,
  SUPER_ROLE,
  ADMIN_ROLE,
  SUB_ADMIN_ROLE,
  VIEWER_ROLE,
  normalizeEmail,
  sanitizeText,
  isValidFullName,
  OTP_EXPIRES_MINUTES,
  OTP_MAX_ATTEMPTS,
  hashPassword
} from "../auth/auth.config.js";
import { hashToken, safeHashEquals, generateOtp, generateSecureToken } from "../auth/auth.config.js";
import { sendMail } from "../../lib/mailer.js";
const VALID_ROLES = /* @__PURE__ */ new Set([MASTER_ROLE, SUPER_ROLE, ADMIN_ROLE, SUB_ADMIN_ROLE, VIEWER_ROLE]);
const VALID_STATUSES = /* @__PURE__ */ new Set(["active", "inactive", "blocked", "deleted"]);
const SELECT_SAFE = {
  id: true,
  adminId: true,
  fullName: true,
  email: true,
  phone: true,
  role: true,
  status: true,
  emailVerified: true,
  isOnline: true,
  lastLoginAt: true,
  lastLogoutAt: true,
  lastActivityAt: true,
  sessionVersion: true,
  createdBy: true,
  createdAt: true,
  updatedAt: true
};
function slugifyName(name) {
  return sanitizeText(name).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12) || "admin";
}
function generateAdminId(name) {
  const slug = slugifyName(name);
  const date = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.random().toString(16).slice(2, 10);
  return `${slug}_${date}_${rand}`;
}
function canCreateRole(actorRole, targetRole) {
  if (actorRole === MASTER_ROLE) return VALID_ROLES.has(targetRole);
  if (actorRole === SUPER_ROLE) {
    return [ADMIN_ROLE, SUB_ADMIN_ROLE, VIEWER_ROLE].includes(targetRole);
  }
  return false;
}
function buildAdminOverviewRow(a) {
  return {
    id: a.id,
    admin_id: a.adminId,
    full_name: a.fullName,
    email: a.email,
    phone: a.phone,
    role: a.role,
    status: a.status,
    is_online: a.isOnline,
    last_login_at: a.lastLoginAt,
    created_at: a.createdAt
  };
}
async function getOverview() {
  const admins = await prisma.adminAccount.findMany({
    select: SELECT_SAFE,
    orderBy: [
      { role: "asc" },
      // master first alphabetically; we reorder below
      { createdAt: "desc" }
    ]
  });
  const roleOrder = {
    [MASTER_ROLE]: 1,
    [SUPER_ROLE]: 2,
    [ADMIN_ROLE]: 3,
    [SUB_ADMIN_ROLE]: 4,
    [VIEWER_ROLE]: 5
  };
  admins.sort((a, b) => (roleOrder[a.role] ?? 99) - (roleOrder[b.role] ?? 99));
  return { admins: admins.map(buildAdminOverviewRow) };
}
async function requestCreateAdmin(actorId, actorRole, input) {
  const fullName = sanitizeText(input.full_name);
  const email = normalizeEmail(input.email);
  const phone = sanitizeText(input.phone || "");
  const role = sanitizeText(input.role || ADMIN_ROLE);
  if (!fullName || !isValidFullName(fullName)) {
    throw createAppError(422, "VALIDATION_ERROR", "Full name must be 2\u201380 characters");
  }
  if (!email) {
    throw createAppError(422, "VALIDATION_ERROR", "Valid email is required");
  }
  if (!VALID_ROLES.has(role)) {
    throw createAppError(422, "VALIDATION_ERROR", "Invalid role");
  }
  if (!canCreateRole(actorRole, role)) {
    throw createAppError(403, "FORBIDDEN", "You do not have permission to create this role");
  }
  const existingAdmin = await prisma.adminAccount.findFirst({
    where: { email }
  });
  if (existingAdmin) {
    throw createAppError(409, "CONFLICT", "An admin with this email already exists");
  }
  if (role === MASTER_ROLE) {
    const count = await prisma.adminAccount.count({
      where: { role: MASTER_ROLE, status: { not: "deleted" } }
    });
    if (count >= 1) {
      throw createAppError(409, "CONFLICT", "Only one master admin is allowed");
    }
  }
  const otp = generateOtp();
  const otpHashVal = hashToken(otp);
  const expires = new Date(Date.now() + OTP_EXPIRES_MINUTES * 60 * 1e3);
  const actor = await prisma.adminAccount.findUnique({ where: { id: actorId } });
  if (!actor) throw createAppError(404, "NOT_FOUND", "Actor admin not found");
  const pendingToken = generateSecureToken();
  const pendingData = {
    step: "email_verification",
    fullName,
    email,
    phone,
    role,
    status: "active",
    createdBy: actorId,
    createdByEmail: actor.email,
    createdByName: actor.fullName,
    createdByRole: actor.role,
    targetOtpHash: otpHashVal,
    targetOtpExpiresAt: expires.toISOString(),
    targetOtpAttempts: 0,
    approvalOtpHash: null,
    approvalOtpExpiresAt: null,
    approvalOtpAttempts: 0
  };
  pendingAdminCreations.set(pendingToken, { data: pendingData, createdAt: Date.now() });
  try {
    await sendMail({
      to: email,
      subject: "Jood \u2014 Admin Account Verification",
      html: `<p>Hello ${fullName},</p><p>Your verification code is: <b>${otp}</b>. It expires in ${OTP_EXPIRES_MINUTES} minutes.</p>`
    });
  } catch (err) {
    console.warn("Failed to send admin creation OTP:", err);
  }
  return {
    pending_token: pendingToken,
    step: "email_verification",
    message: `Verification code sent to ${email}`
  };
}
const pendingAdminCreations = /* @__PURE__ */ new Map();
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of pendingAdminCreations) {
    if (now - val.createdAt > 10 * 60 * 1e3) {
      pendingAdminCreations.delete(key);
    }
  }
}, 6e4);
async function verifyCreateAdminOtp(actorId, pendingToken, otp, step) {
  const pending = pendingAdminCreations.get(pendingToken);
  if (!pending) {
    throw createAppError(400, "INVALID_STATE", "No pending admin creation or it expired");
  }
  const d = pending.data;
  if (step === "email_verification") {
    const hashStr = String(d.targetOtpHash || "");
    const expiresStr = String(d.targetOtpExpiresAt || "");
    if (!hashStr || !expiresStr) {
      throw createAppError(400, "INVALID_STATE", "No pending OTP");
    }
    if (new Date(expiresStr) < /* @__PURE__ */ new Date()) {
      throw createAppError(400, "OTP_EXPIRED", "Verification code expired");
    }
    if (d.targetOtpAttempts >= OTP_MAX_ATTEMPTS) {
      throw createAppError(429, "RATE_LIMITED", "Too many attempts");
    }
    if (!safeHashEquals(hashStr, hashToken(otp))) {
      d.targetOtpAttempts = (d.targetOtpAttempts || 0) + 1;
      throw createAppError(400, "INVALID_OTP", "Invalid verification code");
    }
    const actor = await prisma.adminAccount.findUnique({ where: { id: actorId } });
    if (!actor) throw createAppError(404, "NOT_FOUND", "Actor admin not found");
    const approvalOtp = generateOtp();
    const approvalHash = hashToken(approvalOtp);
    const approvalExpires = new Date(Date.now() + OTP_EXPIRES_MINUTES * 60 * 1e3);
    d.step = "approval_verification";
    d.approvalOtpHash = approvalHash;
    d.approvalOtpExpiresAt = approvalExpires.toISOString();
    d.approvalOtpAttempts = 0;
    try {
      await sendMail({
        to: actor.email,
        subject: "Jood \u2014 Admin Creation Approval",
        html: `<p>${actor.fullName},</p><p>An admin account for <b>${d.fullName}</b> (${d.email}) has been verified. Your approval code is: <b>${approvalOtp}</b>. It expires in ${OTP_EXPIRES_MINUTES} minutes.</p>`
      });
    } catch (err) {
      console.warn("Failed to send approval OTP:", err);
    }
    return { step: "approval_verification", message: `Approval code sent to ${actor.email}` };
  }
  if (step === "approval_verification") {
    const hashStr = String(d.approvalOtpHash || "");
    const expiresStr = String(d.approvalOtpExpiresAt || "");
    if (!hashStr || !expiresStr) {
      throw createAppError(400, "INVALID_STATE", "No pending approval");
    }
    if (new Date(expiresStr) < /* @__PURE__ */ new Date()) {
      throw createAppError(400, "OTP_EXPIRED", "Approval code expired");
    }
    if (d.approvalOtpAttempts >= OTP_MAX_ATTEMPTS) {
      throw createAppError(429, "RATE_LIMITED", "Too many approval attempts");
    }
    if (!safeHashEquals(hashStr, hashToken(otp))) {
      d.approvalOtpAttempts = (d.approvalOtpAttempts || 0) + 1;
      throw createAppError(400, "INVALID_OTP", "Invalid approval code");
    }
    const tempPassword = generateSecureToken().slice(0, 12) + "A1!";
    const passwordHash = await hashPassword(tempPassword);
    const newAdmin = await prisma.adminAccount.create({
      data: {
        adminId: generateAdminId(String(d.fullName)),
        fullName: String(d.fullName),
        email: normalizeEmail(String(d.email)),
        phone: String(d.phone || ""),
        password: passwordHash,
        role: String(d.role),
        status: "active",
        emailVerified: true,
        sessionVersion: 1,
        createdBy: actorId
      },
      select: SELECT_SAFE
    });
    try {
      await sendMail({
        to: newAdmin.email,
        subject: "Jood \u2014 Your Admin Account",
        html: `<p>Hello ${newAdmin.fullName},</p><p>Your admin account has been created.</p><p>Email: ${newAdmin.email}<br>Password: <b>${tempPassword}</b></p><p>Please change your password after first login.</p>`
      });
    } catch (err) {
      console.warn("Failed to send admin credentials email:", err);
    }
    pendingAdminCreations.delete(pendingToken);
    return { admin: newAdmin, message: "Admin created successfully" };
  }
  throw createAppError(422, "VALIDATION_ERROR", "Invalid step");
}
async function suspendAdmin(adminId) {
  const admin = await prisma.adminAccount.findUnique({ where: { id: adminId } });
  if (!admin) throw createAppError(404, "NOT_FOUND", "Admin not found");
  if (admin.role === MASTER_ROLE) {
    throw createAppError(403, "FORBIDDEN", "Cannot suspend the master admin");
  }
  const updated = await prisma.adminAccount.update({
    where: { id: adminId },
    data: {
      status: "blocked",
      isOnline: false,
      lockUntil: null,
      lastLogoutAt: /* @__PURE__ */ new Date(),
      sessionVersion: { increment: 1 }
    },
    select: SELECT_SAFE
  });
  return { admin: updated, message: "Admin suspended" };
}
async function activateAdmin(adminId) {
  const admin = await prisma.adminAccount.findUnique({ where: { id: adminId } });
  if (!admin) throw createAppError(404, "NOT_FOUND", "Admin not found");
  const updated = await prisma.adminAccount.update({
    where: { id: adminId },
    data: {
      status: "active",
      lockUntil: null,
      loginAttempts: 0
    },
    select: SELECT_SAFE
  });
  return { admin: updated, message: "Admin activated" };
}
async function forceLogoutAdmin(adminId) {
  const admin = await prisma.adminAccount.findUnique({ where: { id: adminId } });
  if (!admin) throw createAppError(404, "NOT_FOUND", "Admin not found");
  const updated = await prisma.adminAccount.update({
    where: { id: adminId },
    data: {
      isOnline: false,
      lastLogoutAt: /* @__PURE__ */ new Date(),
      sessionVersion: { increment: 1 }
    },
    select: SELECT_SAFE
  });
  return { admin: updated, message: "Admin logged out" };
}
async function listAdmins(query) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(5, Number(query.limit) || 20));
  const offset = (page - 1) * limit;
  const q = sanitizeText(query.q || "");
  const status = sanitizeText(query.status || "");
  const role = sanitizeText(query.role || "") || ADMIN_ROLE;
  const where = { role };
  if (q) {
    where.OR = [
      { fullName: { contains: q } },
      { email: { contains: q } },
      { adminId: { contains: q } },
      { phone: { contains: q } }
    ];
  }
  if (status && VALID_STATUSES.has(status)) {
    where.status = status;
  }
  const [items, total] = await Promise.all([
    prisma.adminAccount.findMany({
      where,
      select: SELECT_SAFE,
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: limit,
      skip: offset
    }),
    prisma.adminAccount.count({ where })
  ]);
  return {
    admins: items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
  };
}
async function listMasterAdmins(query) {
  return listAdmins({ ...query, role: MASTER_ROLE });
}
async function listSuperAdmins(query) {
  return listAdmins({ ...query, role: SUPER_ROLE });
}
async function approveAdmin(adminId, otp) {
  const admin = await prisma.adminAccount.findUnique({ where: { id: adminId } });
  if (!admin) throw createAppError(404, "NOT_FOUND", "Admin not found");
  if (!admin.otpHash || !admin.otpExpiresAt) {
    throw createAppError(400, "INVALID_STATE", "No pending approval");
  }
  if (/* @__PURE__ */ new Date() > admin.otpExpiresAt) {
    throw createAppError(400, "OTP_EXPIRED", "Verification code expired");
  }
  if ((admin.otpAttempts ?? 0) >= OTP_MAX_ATTEMPTS) {
    throw createAppError(429, "RATE_LIMITED", "Too many attempts");
  }
  if (!safeHashEquals(admin.otpHash, hashToken(otp))) {
    await prisma.adminAccount.update({
      where: { id: adminId },
      data: { otpAttempts: { increment: 1 } }
    });
    throw createAppError(400, "INVALID_OTP", "Invalid verification code");
  }
  const updated = await prisma.adminAccount.update({
    where: { id: adminId },
    data: {
      status: "active",
      otpHash: null,
      otpExpiresAt: null,
      otpAttempts: 0,
      otpSentAt: null
    },
    select: SELECT_SAFE
  });
  return { admin: updated, message: "Admin approved" };
}
export {
  activateAdmin,
  approveAdmin,
  forceLogoutAdmin,
  getOverview,
  listAdmins,
  listMasterAdmins,
  listSuperAdmins,
  requestCreateAdmin,
  suspendAdmin,
  verifyCreateAdminOtp
};
