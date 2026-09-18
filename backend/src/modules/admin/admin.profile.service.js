import { prisma } from "../../lib/prisma.js";
import { createAppError } from "../../common/errors.js";
import {
  normalizeEmail,
  sanitizeText,
  isValidFullName,
  isValidPhone,
  isAdminStrongPassword,
  hashPassword,
  verifyPassword,
  OTP_EXPIRES_MINUTES,
  OTP_MAX_ATTEMPTS
} from "../auth/auth.config.js";
import { hashToken, safeHashEquals, generateOtp } from "../auth/auth.config.js";
import { sendMail } from "../../lib/mailer.js";
function sanitizeAdmin(row) {
  const { otpHash: _, resetPasswordToken: __, resetPasswordExpires: ___, ...safe } = row;
  return safe;
}
async function getProfile(adminId) {
  const admin = await prisma.adminAccount.findUnique({ where: { id: adminId } });
  if (!admin) throw createAppError(404, "NOT_FOUND", "Admin not found");
  return { admin: sanitizeAdmin(admin) };
}
async function updateProfile(adminId, input) {
  const admin = await prisma.adminAccount.findUnique({ where: { id: adminId } });
  if (!admin) throw createAppError(404, "NOT_FOUND", "Admin not found");
  const fullName = input.full_name !== void 0 ? sanitizeText(input.full_name) : admin.fullName;
  const phone = input.phone !== void 0 ? sanitizeText(input.phone) : admin.phone;
  if (fullName && !isValidFullName(fullName)) {
    throw createAppError(422, "VALIDATION_ERROR", "Full name must be 2\u201380 characters");
  }
  if (phone && !isValidPhone(phone)) {
    throw createAppError(422, "VALIDATION_ERROR", "Invalid phone number");
  }
  if (fullName === admin.fullName && phone === admin.phone) {
    return { admin: sanitizeAdmin(admin), message: "No changes detected" };
  }
  const updated = await prisma.adminAccount.update({
    where: { id: adminId },
    data: {
      fullName: fullName || admin.fullName,
      phone: phone || admin.phone,
      isOnline: true,
      lastActivityAt: /* @__PURE__ */ new Date()
    }
  });
  return { admin: sanitizeAdmin(updated), message: "Profile updated successfully" };
}
async function heartbeat(adminId) {
  const updated = await prisma.adminAccount.update({
    where: { id: adminId },
    data: { isOnline: true, lastActivityAt: /* @__PURE__ */ new Date() },
    select: { id: true, isOnline: true, lastActivityAt: true, updatedAt: true }
  });
  return updated;
}
async function setOffline(adminId) {
  const updated = await prisma.adminAccount.update({
    where: { id: adminId },
    data: { isOnline: false, lastLogoutAt: /* @__PURE__ */ new Date(), lastActivityAt: /* @__PURE__ */ new Date() },
    select: { id: true, isOnline: true, lastLogoutAt: true, updatedAt: true }
  });
  return updated;
}
async function getMe(adminId) {
  const admin = await prisma.adminAccount.findUnique({ where: { id: adminId } });
  if (!admin) throw createAppError(404, "NOT_FOUND", "Admin not found");
  return {
    type: "admin",
    id: admin.id,
    admin_id: admin.adminId,
    full_name: admin.fullName,
    email: admin.email,
    phone: admin.phone,
    role: admin.role,
    status: admin.status,
    email_verified: admin.emailVerified,
    is_online: admin.isOnline,
    last_login_at: admin.lastLoginAt,
    created_at: admin.createdAt
  };
}
async function requestEmailChange(adminId, newEmail) {
  const admin = await prisma.adminAccount.findUnique({ where: { id: adminId } });
  if (!admin) throw createAppError(404, "NOT_FOUND", "Admin not found");
  const email = normalizeEmail(newEmail);
  if (!email) throw createAppError(422, "VALIDATION_ERROR", "Valid email is required");
  const existingCustomer = await prisma.customerAccount.findUnique({ where: { email } });
  if (existingCustomer && existingCustomer.id !== adminId) {
    throw createAppError(409, "CONFLICT", "Email already in use");
  }
  const existingAdmin = await prisma.adminAccount.findUnique({ where: { email } });
  if (existingAdmin && existingAdmin.id !== adminId) {
    throw createAppError(409, "CONFLICT", "Email already in use");
  }
  const otp = generateOtp();
  const otpHashVal = hashToken(otp);
  const expires = new Date(Date.now() + OTP_EXPIRES_MINUTES * 60 * 1e3);
  await prisma.adminAccount.update({
    where: { id: adminId },
    data: {
      otpHash: otpHashVal,
      otpExpiresAt: expires,
      otpAttempts: 0,
      otpSentAt: /* @__PURE__ */ new Date()
    }
  });
  try {
    await sendMail({
      to: admin.email,
      subject: "Jood \u2014 Email Change Verification",
      html: `<p>Your verification code is: <b>${otp}</b>. It expires in ${OTP_EXPIRES_MINUTES} minutes.</p>`
    });
  } catch (err) {
    console.warn("Failed to send email change OTP:", err);
  }
  return { message: "Verification code sent", expires_at: expires };
}
async function resendEmailOtp(adminId) {
  const admin = await prisma.adminAccount.findUnique({ where: { id: adminId } });
  if (!admin) throw createAppError(404, "NOT_FOUND", "Admin not found");
  const otp = generateOtp();
  const otpHashVal = hashToken(otp);
  const expires = new Date(Date.now() + OTP_EXPIRES_MINUTES * 60 * 1e3);
  await prisma.adminAccount.update({
    where: { id: adminId },
    data: {
      otpHash: otpHashVal,
      otpExpiresAt: expires,
      otpAttempts: 0,
      otpSentAt: /* @__PURE__ */ new Date()
    }
  });
  try {
    await sendMail({
      to: admin.email,
      subject: "Jood \u2014 Email Change Verification",
      html: `<p>Your verification code is: <b>${otp}</b>. It expires in ${OTP_EXPIRES_MINUTES} minutes.</p>`
    });
  } catch (err) {
    console.warn("Failed to resend email change OTP:", err);
  }
  return { message: "Verification code resent" };
}
async function verifyAndChangeEmail(adminId, otp) {
  const admin = await prisma.adminAccount.findUnique({ where: { id: adminId } });
  if (!admin) throw createAppError(404, "NOT_FOUND", "Admin not found");
  if (!admin.otpHash || !admin.otpExpiresAt) {
    throw createAppError(400, "INVALID_STATE", "No pending email change");
  }
  if (/* @__PURE__ */ new Date() > admin.otpExpiresAt) {
    throw createAppError(400, "OTP_EXPIRED", "Verification code expired");
  }
  if ((admin.otpAttempts ?? 0) >= OTP_MAX_ATTEMPTS) {
    throw createAppError(429, "RATE_LIMITED", "Too many verification attempts");
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
      otpHash: null,
      otpExpiresAt: null,
      otpAttempts: 0,
      otpSentAt: null,
      sessionVersion: { increment: 1 }
    }
  });
  return { sessionVersion: updated.sessionVersion };
}
async function updatePassword(adminId, input) {
  const admin = await prisma.adminAccount.findUnique({ where: { id: adminId } });
  if (!admin) throw createAppError(404, "NOT_FOUND", "Admin not found");
  if (!input.current_password || !input.new_password) {
    throw createAppError(422, "VALIDATION_ERROR", "Current and new password are required");
  }
  if (input.new_password !== input.confirm_password) {
    throw createAppError(422, "VALIDATION_ERROR", "Passwords do not match");
  }
  if (!isAdminStrongPassword(input.new_password)) {
    throw createAppError(422, "VALIDATION_ERROR", "Password must be \u22658 chars with upper, lower, number, and special character");
  }
  if (!admin.password) {
    throw createAppError(400, "INVALID_STATE", "No password set for this account");
  }
  const valid = await verifyPassword(input.current_password, admin.password);
  if (!valid) {
    throw createAppError(400, "INVALID_PASSWORD", "Current password is incorrect");
  }
  const newHash = await hashPassword(input.new_password);
  const updated = await prisma.adminAccount.update({
    where: { id: adminId },
    data: {
      password: newHash,
      sessionVersion: { increment: 1 },
      loginAttempts: 0,
      lockUntil: null
    }
  });
  return { sessionVersion: updated.sessionVersion };
}
export {
  getMe,
  getProfile,
  heartbeat,
  requestEmailChange,
  resendEmailOtp,
  setOffline,
  updatePassword,
  updateProfile,
  verifyAndChangeEmail
};
