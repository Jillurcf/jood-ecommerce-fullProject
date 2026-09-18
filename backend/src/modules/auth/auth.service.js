import { prisma } from "../../lib/prisma.js";
import { createAppError } from "../../common/errors.js";
import { sendMail } from "../../lib/mailer.js";
import {
  EMAIL_VERIFY_HOURS,
  FRONTEND_URL,
  generateOtp,
  generateSecureToken,
  generateUserIdFromName,
  hashPassword,
  hashToken,
  isAdminStrongPassword,
  isLockedOut,
  isValidEmail,
  isValidFullName,
  isValidPhone,
  isStrongPassword,
  lockoutMessage,
  LOCK_MINUTES,
  MAX_LOGIN_ATTEMPTS,
  normalizeEmail,
  normalizePhone,
  OTP_EXPIRES_MINUTES,
  OTP_MAX_ATTEMPTS,
  RESET_PASSWORD_MINUTES,
  safeHashEquals,
  sanitizeText,
  verifyPassword
} from "./auth.config.js";
import {
  adminRecoveryStore,
  pendingSignupStore,
  isRefreshJtiRevoked,
  revokeRefreshJti
} from "./pending.store.js";
import { issueTokenPair } from "./token.service.js";
function toPublicCustomer(row) {
  return {
    id: row.id,
    user_id: row.userId,
    full_name: row.fullName,
    email: row.email,
    phone: row.phone,
    google_id: row.googleId,
    provider: row.provider,
    status: row.status,
    email_verified: row.emailVerified,
    phone_verified: row.phoneVerified,
    is_online: row.isOnline,
    last_login_at: row.lastLoginAt,
    session_version: row.sessionVersion
  };
}
function toPublicAdmin(row) {
  return {
    id: row.id,
    admin_id: row.adminId,
    full_name: row.fullName,
    email: row.email,
    phone: row.phone,
    role: row.role,
    status: row.status,
    email_verified: row.emailVerified,
    is_online: row.isOnline,
    last_login_at: row.lastLoginAt,
    last_activity_at: row.lastActivityAt,
    session_version: row.sessionVersion
  };
}
function buildResetPasswordMail(target, token) {
  const link = `${FRONTEND_URL}/reset-password?token=${encodeURIComponent(token)}`;
  return {
    subject: "Reset your password",
    text: `Hello,

Reset your password here:
${link}

This link expires in ${RESET_PASSWORD_MINUTES} minutes.`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#222">
        <h2>Reset your password</h2>
        <p>Use the link below to reset your password.</p>
        <p><a href="${link}" target="_blank" rel="noopener noreferrer">Reset Password</a></p>
        <p>This link expires in ${RESET_PASSWORD_MINUTES} minutes.</p>
      </div>
    `
  };
}
function buildVerificationMail(target, token) {
  const link = `${FRONTEND_URL}/verify-email?token=${encodeURIComponent(token)}`;
  return {
    subject: "Verify your email address",
    text: `Hello,

Verify your email here:
${link}

This link expires in ${EMAIL_VERIFY_HOURS} hours.`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#222">
        <h2>Verify your email</h2>
        <p>Please verify your email address to activate your account.</p>
        <p><a href="${link}" target="_blank" rel="noopener noreferrer">Verify Email</a></p>
        <p>This link expires in ${EMAIL_VERIFY_HOURS} hours.</p>
      </div>
    `
  };
}
function buildOtpMail(otp) {
  return {
    subject: "Your verification OTP",
    text: `Your OTP is: ${otp}

This OTP expires in ${OTP_EXPIRES_MINUTES} minutes.`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#222">
        <h2>Verify your email</h2>
        <p>Your OTP is:</p>
        <div style="font-size:28px;font-weight:700;letter-spacing:6px">${otp}</div>
        <p>This OTP expires in ${OTP_EXPIRES_MINUTES} minutes.</p>
      </div>
    `
  };
}
async function findAnyAccountByEmail(email) {
  const normalized = normalizeEmail(email);
  const customer = await prisma.customerAccount.findFirst({
    where: { email: normalized },
    select: { id: true }
  });
  if (customer) return { id: customer.id, source: "customer_accounts" };
  const admin = await prisma.adminAccount.findFirst({
    where: { email: normalized },
    select: { id: true }
  });
  if (admin) return { id: admin.id, source: "admin_accounts" };
  return null;
}
async function findCustomerByEmail(email) {
  return prisma.customerAccount.findFirst({ where: { email: normalizeEmail(email) } });
}
async function findCustomerByPhone(phone) {
  return prisma.customerAccount.findFirst({ where: { phone } });
}
async function findCustomerById(id) {
  return prisma.customerAccount.findUnique({ where: { id } });
}
async function findAdminByEmail(email) {
  return prisma.adminAccount.findFirst({ where: { email: normalizeEmail(email) } });
}
async function findAdminById(id) {
  return prisma.adminAccount.findUnique({ where: { id } });
}
async function mergeGuestData({
  email,
  numericId,
  guestToken,
  guestId
}) {
  if (!guestToken && !guestId) return;
  await prisma.$transaction(async (tx) => {
    if (guestToken) {
      await tx.cart.updateMany({
        where: {
          AND: [{ userId: { equals: "" } }, { guestToken }]
        },
        data: { userId: email }
      });
      await tx.cart.updateMany({
        where: {
          AND: [{ status: "active" }, { userId: { in: [String(numericId), email] } }]
        },
        data: { userId: email }
      });
    }
    if (guestId) {
      await tx.wishlist.updateMany({
        where: { guestId },
        data: { userId: numericId }
      });
    }
  });
}
async function customerSignup(input) {
  const fullName = sanitizeText(input.full_name);
  const email = normalizeEmail(input.email);
  const phone = normalizePhone(input.phone || "");
  if (!isValidFullName(fullName)) {
    throw createAppError(422, "VALIDATION_ERROR", "Please enter your full name.");
  }
  if (!email || !isValidEmail(email)) {
    throw createAppError(422, "VALIDATION_ERROR", "Please enter a valid email address.");
  }
  if (phone && !isValidPhone(phone)) {
    throw createAppError(422, "VALIDATION_ERROR", "Please enter a valid phone number.");
  }
  if (!isStrongPassword(input.password)) {
    throw createAppError(
      422,
      "VALIDATION_ERROR",
      "Password must be at least 8 characters long."
    );
  }
  if (input.password !== input.confirm_password) {
    throw createAppError(422, "VALIDATION_ERROR", "Passwords do not match.");
  }
  if (!input.agree_terms) {
    throw createAppError(422, "VALIDATION_ERROR", "Please accept the terms and conditions.");
  }
  const existing = await findAnyAccountByEmail(email);
  if (existing) {
    throw createAppError(409, "ACCOUNT_EXISTS", "You already have an account. Please sign in.");
  }
  if (phone) {
    const existingPhone = await findCustomerByPhone(phone);
    if (existingPhone) {
      throw createAppError(409, "PHONE_EXISTS", "This phone number is already registered.");
    }
  }
  const otp = generateOtp();
  pendingSignupStore.set(email, {
    fullName,
    email,
    phone: phone || null,
    password: input.password,
    otp,
    otpAttempts: 0,
    expiresAt: Date.now() + OTP_EXPIRES_MINUTES * 60 * 1e3,
    createdAt: Date.now()
  });
  const mail = buildOtpMail(otp);
  try {
    await sendMail({ to: email, subject: mail.subject, html: mail.html, text: mail.text });
  } catch (err) {
    console.error("OTP email failed:", err);
  }
  return { email, needsOtp: true };
}
async function customerVerifyOtp(emailInput, otpInput, guest) {
  const email = normalizeEmail(emailInput);
  const pending = pendingSignupStore.get(email);
  if (!pending) {
    throw createAppError(422, "NO_PENDING_SIGNUP", "No pending registration found. Please sign up again.");
  }
  const enteredOtp = String(otpInput || "").trim();
  if (!enteredOtp) {
    throw createAppError(422, "VALIDATION_ERROR", "Please enter the OTP.");
  }
  if (Date.now() > Number(pending.expiresAt)) {
    pendingSignupStore.delete(email);
    throw createAppError(422, "OTP_EXPIRED", "OTP expired. Please sign up again.");
  }
  const attempts = Number(pending.otpAttempts || 0) + 1;
  pending.otpAttempts = attempts;
  pendingSignupStore.set(email, pending, pending.expiresAt - Date.now());
  if (attempts > OTP_MAX_ATTEMPTS) {
    pendingSignupStore.delete(email);
    throw createAppError(422, "OTP_MAX_ATTEMPTS", "Too many OTP attempts. Please sign up again.");
  }
  if (enteredOtp !== String(pending.otp)) {
    throw createAppError(422, "INVALID_OTP", "Invalid OTP.");
  }
  const existing = await findAnyAccountByEmail(pending.email);
  if (existing) {
    pendingSignupStore.delete(email);
    throw createAppError(409, "ACCOUNT_EXISTS", "You already have an account. Please sign in.");
  }
  if (pending.phone) {
    const duplicatePhone = await findCustomerByPhone(pending.phone);
    if (duplicatePhone) {
      pendingSignupStore.delete(email);
      throw createAppError(409, "PHONE_EXISTS", "This phone number is already registered.");
    }
  }
  const passwordHash = await hashPassword(pending.password);
  const userId = generateUserIdFromName(pending.fullName);
  const session = await prisma.$transaction(async (tx) => {
    const created = await tx.customerAccount.create({
      data: {
        userId,
        fullName: pending.fullName,
        email: pending.email,
        phone: pending.phone,
        passwordHash,
        provider: "local",
        status: "active",
        emailVerified: true,
        sessionVersion: 1
      }
    });
    if (guest?.guestToken) {
      await tx.cart.updateMany({
        where: { userId: { equals: "" }, guestToken: guest.guestToken },
        data: { userId: pending.email }
      });
      await tx.cart.updateMany({
        where: { status: "active", userId: { in: [String(created.id), pending.email] } },
        data: { userId: pending.email }
      });
    }
    if (guest?.guestId) {
      await tx.wishlist.updateMany({
        where: { guestId: guest.guestId },
        data: { userId: created.id }
      });
    }
    return created;
  });
  pendingSignupStore.delete(email);
  const tokens = issueTokenPair({
    id: session.id,
    type: "customer",
    sessionVersion: 1,
    loginAt: Date.now()
  });
  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    sessionVersion: 1,
    user: toPublicCustomer(session)
  };
}
async function customerResendOtp(emailInput) {
  const email = normalizeEmail(emailInput);
  const pending = pendingSignupStore.get(email);
  if (!pending) {
    throw createAppError(422, "NO_PENDING_SIGNUP", "No pending registration found. Please sign up again.");
  }
  const otp = generateOtp();
  pending.otp = otp;
  pending.otpAttempts = 0;
  pending.expiresAt = Date.now() + OTP_EXPIRES_MINUTES * 60 * 1e3;
  pendingSignupStore.set(email, pending, OTP_EXPIRES_MINUTES * 60 * 1e3);
  const mail = buildOtpMail(otp);
  try {
    await sendMail({ to: email, subject: mail.subject, html: mail.html, text: mail.text });
  } catch (err) {
    console.error("Resend OTP email failed:", err);
    throw createAppError(500, "EMAIL_FAILED", "Unable to resend OTP. Please try again.");
  }
  return { email, needsOtp: true };
}
async function customerLogin(emailInput, password, rememberMe = false, guest) {
  const email = normalizeEmail(emailInput);
  if (!email || !isValidEmail(email)) {
    throw createAppError(422, "VALIDATION_ERROR", "Please enter a valid email address.");
  }
  if (!password) {
    throw createAppError(422, "VALIDATION_ERROR", "Please enter your password.");
  }
  const user = await findCustomerByEmail(email);
  if (!user || !user.passwordHash) {
    throw createAppError(401, "INVALID_CREDENTIALS", "Invalid email or password.");
  }
  if (user.status === "deleted") {
    throw createAppError(403, "ACCOUNT_REMOVED", "Your account has been removed.");
  }
  if (isLockedOut(user.lockUntil)) {
    throw createAppError(423, "ACCOUNT_LOCKED", lockoutMessage(user.lockUntil));
  }
  const passwordOk = await verifyPassword(password, user.passwordHash);
  if (!passwordOk) {
    const updated = await incrementLoginAttempts(user.id);
    if (updated?.lockUntil) {
      throw createAppError(423, "ACCOUNT_LOCKED", lockoutMessage(updated.lockUntil));
    }
    throw createAppError(401, "INVALID_CREDENTIALS", "Invalid email or password.");
  }
  if (!user.emailVerified) {
    throw createAppError(403, "EMAIL_NOT_VERIFIED", "Please verify your email before signing in.");
  }
  if (user.status && user.status !== "active") {
    throw createAppError(403, "ACCOUNT_INACTIVE", "Your account is not active.");
  }
  const fresh = await prisma.customerAccount.update({
    where: { id: user.id },
    data: {
      loginAttempts: 0,
      lastAttemptTime: null,
      lockUntil: null,
      isOnline: true,
      lastLoginAt: /* @__PURE__ */ new Date(),
      lastActivityAt: /* @__PURE__ */ new Date(),
      sessionVersion: { increment: 1 }
    }
  });
  await mergeGuestData({
    email: fresh.email,
    numericId: fresh.id,
    guestToken: guest?.guestToken,
    guestId: guest?.guestId
  });
  const tokens = issueTokenPair({
    id: fresh.id,
    type: "customer",
    sessionVersion: fresh.sessionVersion,
    loginAt: Date.now()
  });
  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    sessionVersion: fresh.sessionVersion,
    user: toPublicCustomer(fresh)
  };
}
async function incrementLoginAttempts(userId) {
  const row = await prisma.customerAccount.update({
    where: { id: userId },
    data: { loginAttempts: { increment: 1 }, lastAttemptTime: /* @__PURE__ */ new Date() }
  });
  if (row.loginAttempts >= MAX_LOGIN_ATTEMPTS) {
    return prisma.customerAccount.update({
      where: { id: userId },
      data: { lockUntil: new Date(Date.now() + LOCK_MINUTES * 60 * 1e3) }
    });
  }
  return row;
}
async function customerVerifyEmail(tokenInput) {
  const token = String(tokenInput || "").trim();
  if (!token) {
    throw createAppError(422, "VALIDATION_ERROR", "Invalid verification token.");
  }
  const tokenHash = hashToken(token);
  const row = await prisma.customerAccount.findFirst({
    where: {
      emailVerificationToken: tokenHash,
      emailVerificationExpires: { gt: /* @__PURE__ */ new Date() }
    }
  });
  if (!row) {
    throw createAppError(422, "INVALID_VERIFICATION_TOKEN", "Verification link is invalid or expired.");
  }
  await prisma.customerAccount.update({
    where: { id: row.id },
    data: {
      emailVerified: true,
      status: "active",
      emailVerificationToken: null,
      emailVerificationExpires: null
    }
  });
  return { email: row.email };
}
async function customerResendVerification(emailInput) {
  const email = normalizeEmail(emailInput);
  if (!email || !isValidEmail(email)) {
    throw createAppError(422, "VALIDATION_ERROR", "Please enter a valid email address.");
  }
  const user = await findCustomerByEmail(email);
  if (!user) return { sent: true };
  if (user.emailVerified) return { alreadyVerified: true };
  const verificationToken = generateSecureToken();
  const verificationExpires = new Date(Date.now() + EMAIL_VERIFY_HOURS * 60 * 60 * 1e3);
  await prisma.customerAccount.update({
    where: { id: user.id },
    data: {
      emailVerificationToken: hashToken(verificationToken),
      emailVerificationExpires: verificationExpires
    }
  });
  const mail = buildVerificationMail(user.email, verificationToken);
  try {
    await sendMail({ to: user.email, subject: mail.subject, html: mail.html, text: mail.text });
  } catch (err) {
    console.error("Resend verification email failed:", err);
  }
  return { sent: true };
}
async function customerForgotPassword(emailInput) {
  const email = normalizeEmail(emailInput);
  if (!email || !isValidEmail(email)) {
    throw createAppError(422, "VALIDATION_ERROR", "Please enter a valid email address.");
  }
  const user = await findCustomerByEmail(email);
  if (!user || user.status === "deleted") {
    return { sent: true };
  }
  const resetToken = generateSecureToken();
  const resetExpires = new Date(Date.now() + RESET_PASSWORD_MINUTES * 60 * 1e3);
  await prisma.customerAccount.update({
    where: { id: user.id },
    data: {
      resetPasswordToken: hashToken(resetToken),
      resetPasswordExpires: resetExpires
    }
  });
  const mail = buildResetPasswordMail(user.email, resetToken);
  try {
    await sendMail({ to: user.email, subject: mail.subject, html: mail.html, text: mail.text });
  } catch (err) {
    console.error("Reset password email failed:", err);
  }
  return { sent: true };
}
async function customerValidateResetToken(tokenInput) {
  const token = String(tokenInput || "").trim();
  const tokenHash = hashToken(token);
  const row = await prisma.customerAccount.findFirst({
    where: {
      resetPasswordToken: tokenHash,
      resetPasswordExpires: { gt: /* @__PURE__ */ new Date() }
    },
    select: { id: true, email: true }
  });
  if (!row) return null;
  return { valid: true, email: row.email };
}
async function customerResetPassword(tokenInput, password, confirmPassword) {
  if (!tokenInput) {
    throw createAppError(422, "VALIDATION_ERROR", "Invalid reset token.");
  }
  if (!isStrongPassword(password)) {
    throw createAppError(422, "VALIDATION_ERROR", "Password must be at least 8 characters long.");
  }
  if (password !== confirmPassword) {
    throw createAppError(422, "VALIDATION_ERROR", "Passwords do not match.");
  }
  const token = String(tokenInput).trim();
  const tokenHash = hashToken(token);
  const user = await prisma.customerAccount.findFirst({
    where: { resetPasswordToken: tokenHash, resetPasswordExpires: { gt: /* @__PURE__ */ new Date() } },
    select: { id: true, email: true }
  });
  if (!user) {
    throw createAppError(422, "INVALID_RESET_TOKEN", "Reset link is invalid or expired.");
  }
  const newPasswordHash = await hashPassword(password);
  await prisma.customerAccount.update({
    where: { id: user.id },
    data: {
      passwordHash: newPasswordHash,
      resetPasswordToken: null,
      resetPasswordExpires: null,
      loginAttempts: 0,
      lastAttemptTime: null,
      lockUntil: null,
      isOnline: false,
      lastLogoutAt: /* @__PURE__ */ new Date()
    }
  });
  return { email: user.email };
}
async function customerLogout(id) {
  await prisma.customerAccount.update({
    where: { id },
    data: {
      isOnline: false,
      lastLogoutAt: /* @__PURE__ */ new Date(),
      lastActivityAt: /* @__PURE__ */ new Date(),
      sessionVersion: { increment: 1 }
    }
  });
}
async function adminSignIn(emailInput, passwordInput) {
  const email = normalizeEmail(emailInput);
  const password = String(passwordInput || "").trim();
  if (!email || !isValidEmail(email)) {
    throw createAppError(422, "VALIDATION_ERROR", "Please enter a valid email address.");
  }
  if (!password) {
    throw createAppError(422, "VALIDATION_ERROR", "Please enter your password.");
  }
  const admin = await findAdminByEmail(email);
  if (!admin) {
    throw createAppError(401, "INVALID_CREDENTIALS", "Admin account not found.");
  }
  if (admin.status === "deleted") {
    throw createAppError(403, "ACCOUNT_REMOVED", "This account has been removed.");
  }
  if (admin.status !== "active") {
    throw createAppError(403, "ACCOUNT_INACTIVE", "This account is not active.");
  }
  if (!admin.emailVerified) {
    throw createAppError(403, "EMAIL_NOT_VERIFIED", "Email is not verified.");
  }
  if (isLockedOut(admin.lockUntil)) {
    throw createAppError(423, "ACCOUNT_LOCKED", lockoutMessage(admin.lockUntil));
  }
  if (!admin.password) {
    throw createAppError(403, "PASSWORD_NOT_SET", "Password is not configured for this account.");
  }
  const passwordOk = await verifyPassword(password, admin.password);
  if (!passwordOk) {
    const updated = await incrementAdminLoginAttempts(admin.id);
    const attempts = Number(updated?.loginAttempts || 0);
    if (attempts > OTP_MAX_ATTEMPTS) {
      const fresh = await findAdminById(admin.id);
      throw createAppError(423, "ACCOUNT_LOCKED", lockoutMessage(fresh?.lockUntil));
    }
    throw createAppError(
      401,
      "INVALID_CREDENTIALS",
      `Invalid password. Attempts left: ${Math.max(0, OTP_MAX_ATTEMPTS - attempts)}`
    );
  }
  await prisma.adminAccount.update({
    where: { id: admin.id },
    data: { loginAttempts: 0, lastAttemptTime: null, lockUntil: null }
  });
  const otp = generateOtp();
  const otpHash = hashToken(otp);
  const expiresAt = new Date(Date.now() + OTP_EXPIRES_MINUTES * 60 * 1e3);
  await prisma.adminAccount.update({
    where: { id: admin.id },
    data: { otpHash, otpExpiresAt: expiresAt, otpAttempts: 0, otpSentAt: /* @__PURE__ */ new Date() }
  });
  const mail = buildOtpMail(otp);
  try {
    await sendMail({
      to: admin.email,
      subject: "Your admin login OTP",
      html: mail.html,
      text: mail.text
    });
  } catch (err) {
    console.error("Admin OTP email failed:", err);
    await prisma.adminAccount.update({
      where: { id: admin.id },
      data: { otpHash: null, otpExpiresAt: null }
    });
    throw createAppError(500, "EMAIL_FAILED", "Unable to send OTP email right now. Please try again.");
  }
  return { email, needsOtp: true };
}
async function adminVerifyOtp(emailInput, otpInput) {
  const email = normalizeEmail(emailInput);
  const enteredOtp = String(otpInput || "").trim();
  if (!enteredOtp) {
    throw createAppError(422, "VALIDATION_ERROR", "Please enter the OTP.");
  }
  const admin = await findAdminByEmail(email);
  if (!admin || admin.status === "deleted" || admin.status !== "active") {
    throw createAppError(401, "INVALID_OTP", "Unable to verify OTP.");
  }
  if (isLockedOut(admin.lockUntil)) {
    throw createAppError(423, "ACCOUNT_LOCKED", lockoutMessage(admin.lockUntil));
  }
  if (!admin.otpHash || !admin.otpExpiresAt) {
    throw createAppError(401, "OTP_NOT_REQUESTED", "No OTP in progress. Please sign in again.");
  }
  if (Date.now() > new Date(admin.otpExpiresAt).getTime()) {
    await clearAdminOtp(admin.id);
    throw createAppError(422, "OTP_EXPIRED", "OTP expired. Please sign in again.");
  }
  if (!safeHashEquals(hashToken(enteredOtp), admin.otpHash)) {
    const updated = await incrementAdminOtpAttempts(admin.id);
    const attempts = Number(updated?.otpAttempts || 0);
    if (attempts > OTP_MAX_ATTEMPTS) {
      const fresh = await findAdminById(admin.id);
      throw createAppError(423, "ACCOUNT_LOCKED", lockoutMessage(fresh?.lockUntil));
    }
    throw createAppError(
      401,
      "INVALID_OTP",
      `Invalid OTP. Attempts left: ${Math.max(0, OTP_MAX_ATTEMPTS - attempts)}`
    );
  }
  await clearAdminOtp(admin.id);
  const freshAdmin = await prisma.adminAccount.update({
    where: { id: admin.id },
    data: {
      loginAttempts: 0,
      lastAttemptTime: null,
      lockUntil: null,
      isOnline: true,
      lastLoginAt: /* @__PURE__ */ new Date(),
      lastActivityAt: /* @__PURE__ */ new Date(),
      sessionVersion: { increment: 1 }
    }
  });
  const tokens = issueTokenPair({
    id: freshAdmin.id,
    type: "admin",
    role: freshAdmin.role,
    sessionVersion: freshAdmin.sessionVersion,
    loginAt: Date.now()
  });
  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    sessionVersion: freshAdmin.sessionVersion,
    admin: toPublicAdmin(freshAdmin),
    role: freshAdmin.role
  };
}
async function adminResendOtp(emailInput) {
  const email = normalizeEmail(emailInput);
  const admin = await findAdminByEmail(email);
  if (!admin || admin.status !== "active") {
    throw createAppError(401, "ADMIN_NOT_FOUND", "Unable to resend OTP.");
  }
  if (isLockedOut(admin.lockUntil)) {
    throw createAppError(423, "ACCOUNT_LOCKED", lockoutMessage(admin.lockUntil));
  }
  const otp = generateOtp();
  const expiresAt = new Date(Date.now() + OTP_EXPIRES_MINUTES * 60 * 1e3);
  await prisma.adminAccount.update({
    where: { id: admin.id },
    data: { otpHash: hashToken(otp), otpExpiresAt: expiresAt, otpAttempts: 0, otpSentAt: /* @__PURE__ */ new Date() }
  });
  const mail = buildOtpMail(otp);
  try {
    await sendMail({ to: admin.email, subject: "Your admin login OTP", html: mail.html, text: mail.text });
  } catch (err) {
    console.error("Admin resend OTP email failed:", err);
    await clearAdminOtp(admin.id);
    throw createAppError(500, "EMAIL_FAILED", "Unable to resend OTP. Please try again.");
  }
  return { email, needsOtp: true };
}
async function adminLogout(id) {
  await prisma.adminAccount.update({
    where: { id },
    data: {
      isOnline: false,
      lastLogoutAt: /* @__PURE__ */ new Date(),
      lastActivityAt: /* @__PURE__ */ new Date(),
      sessionVersion: { increment: 1 }
    }
  });
}
async function clearAdminOtp(adminId) {
  await prisma.adminAccount.update({
    where: { id: adminId },
    data: { otpHash: null, otpExpiresAt: null, otpAttempts: 0, lockUntil: null }
  });
}
async function incrementAdminLoginAttempts(adminId) {
  const row = await prisma.adminAccount.update({
    where: { id: adminId },
    data: {
      loginAttempts: { increment: 1 },
      lastAttemptTime: /* @__PURE__ */ new Date()
    }
  });
  if (row.loginAttempts > OTP_MAX_ATTEMPTS) {
    return prisma.adminAccount.update({
      where: { id: adminId },
      data: { lockUntil: new Date(Date.now() + LOCK_MINUTES * 60 * 1e3) }
    });
  }
  return row;
}
async function incrementAdminOtpAttempts(adminId) {
  const row = await prisma.adminAccount.update({
    where: { id: adminId },
    data: {
      otpAttempts: { increment: 1 },
      lastAttemptTime: /* @__PURE__ */ new Date()
    }
  });
  if (row.otpAttempts > OTP_MAX_ATTEMPTS) {
    return prisma.adminAccount.update({
      where: { id: adminId },
      data: {
        lockUntil: new Date(Date.now() + LOCK_MINUTES * 60 * 1e3)
      }
    });
  }
  return row;
}
function buildRecoveryOtpMail(otp) {
  return {
    subject: "Your Password Recovery OTP",
    text: `Your OTP is: ${otp}

This OTP expires in ${OTP_EXPIRES_MINUTES} minutes.`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#222">
        <h2>Password Recovery</h2>
        <p>You requested to reset your password. Use the OTP below.</p>
        <div style="font-size:28px;font-weight:700;letter-spacing:6px">${otp}</div>
        <p>This OTP expires in ${OTP_EXPIRES_MINUTES} minutes.</p>
      </div>
    `
  };
}
async function adminForgotPassword({ identifier, recovery_mode }) {
  const email = normalizeEmail(identifier);
  const recoveryMode = recovery_mode === "link" ? "link" : "otp";
  if (!email || !isValidEmail(email)) {
    throw createAppError(422, "VALIDATION_ERROR", "Please enter your email address.");
  }
  const user = await findAdminByEmail(email);
  if (!user || user.status === "deleted" || user.status !== "active") {
    return { sent: true };
  }
  const existing = adminRecoveryStore.get(email);
  if (recoveryMode === "otp" && existing?.lastSentAt && Date.now() - existing.lastSentAt < 60 * 1e3) {
    throw createAppError(429, "RATE_LIMITED", "Please wait a moment before requesting another OTP.");
  }
  if (recoveryMode === "otp") {
    const otp = generateOtp();
    const otpExpiresAt = new Date(Date.now() + OTP_EXPIRES_MINUTES * 60 * 1e3);
    await prisma.adminAccount.update({
      where: { id: user.id },
      data: { resetPasswordToken: hashToken(otp), resetPasswordExpires: otpExpiresAt }
    });
    const mail2 = buildRecoveryOtpMail(otp);
    try {
      await sendMail({ to: user.email, subject: mail2.subject, html: mail2.html, text: mail2.text });
    } catch (err) {
      console.error("Recovery OTP send failed:", err);
      throw createAppError(500, "EMAIL_FAILED", "Unable to send OTP right now. Please try again later.");
    }
    adminRecoveryStore.set(email, {
      userId: user.id,
      identifier: email,
      recoveryMode: "otp",
      attempts: 0,
      verified: false,
      verifiedAt: null,
      lastSentAt: Date.now(),
      expiresAt: Date.now() + 15 * 60 * 1e3,
      otpExpiresAt: otpExpiresAt.getTime()
    });
    return { sent: true, recovery_mode: "otp" };
  }
  const resetToken = generateSecureToken();
  const tokenExpiresAt = new Date(Date.now() + 15 * 60 * 1e3);
  await prisma.adminAccount.update({
    where: { id: user.id },
    data: { resetPasswordToken: hashToken(resetToken), resetPasswordExpires: tokenExpiresAt }
  });
  const link = `${FRONTEND_URL}/admin/reset-password?token=${encodeURIComponent(resetToken)}`;
  const mail = {
    subject: "Reset Your Password",
    text: `Reset your password here:
${link}

This link expires in 15 minutes.`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#222">
        <h2>Reset Your Password</h2>
        <p>Click the link below to reset your password.</p>
        <p><a href="${link}" style="display:inline-block;background:#1f2937;color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:8px;">Reset Password</a></p>
        <p>This link expires in 15 minutes and can only be used once.</p>
      </div>
    `
  };
  try {
    await sendMail({ to: user.email, subject: mail.subject, html: mail.html, text: mail.text });
  } catch (err) {
    console.error("Recovery link send failed:", err);
    throw createAppError(500, "EMAIL_FAILED", "Unable to send reset link right now. Please try again later.");
  }
  adminRecoveryStore.set(email, {
    userId: user.id,
    identifier: email,
    recoveryMode: "link",
    attempts: 0,
    verified: false,
    verifiedAt: null,
    lastSentAt: Date.now(),
    expiresAt: Date.now() + 15 * 60 * 1e3,
    otpExpiresAt: tokenExpiresAt.getTime()
  });
  return { sent: true, recovery_mode: "link" };
}
async function adminVerifyRecoveryOtp(emailInput, otpInput) {
  const email = normalizeEmail(emailInput);
  const recovery = adminRecoveryStore.get(email);
  if (!recovery || recovery.recoveryMode !== "otp") {
    throw createAppError(422, "NO_RECOVERY_SESSION", "No password recovery in progress.");
  }
  if (!recovery.otpExpiresAt || Date.now() > recovery.otpExpiresAt) {
    await prisma.adminAccount.update({
      where: { id: recovery.userId },
      data: { resetPasswordToken: null, resetPasswordExpires: null }
    });
    adminRecoveryStore.delete(email);
    throw createAppError(422, "OTP_EXPIRED", "OTP expired. Please request a new one.");
  }
  recovery.attempts = Number(recovery.attempts || 0) + 1;
  adminRecoveryStore.set(email, recovery, recovery.expiresAt - Date.now());
  if (recovery.attempts > OTP_MAX_ATTEMPTS) {
    await prisma.adminAccount.update({
      where: { id: recovery.userId },
      data: { resetPasswordToken: null, resetPasswordExpires: null }
    });
    adminRecoveryStore.delete(email);
    throw createAppError(422, "OTP_MAX_ATTEMPTS", "Too many OTP attempts. Please request a new OTP.");
  }
  const account = await findAdminById(recovery.userId);
  if (!account || account.status === "deleted" || !account.resetPasswordToken || !account.resetPasswordExpires) {
    adminRecoveryStore.delete(email);
    throw createAppError(422, "INVALID_RECOVERY", "Recovery session is invalid. Please try again.");
  }
  if (!safeHashEquals(hashToken(String(otpInput || "").trim()), account.resetPasswordToken)) {
    throw createAppError(401, "INVALID_OTP", "Invalid OTP.");
  }
  recovery.verified = true;
  recovery.verifiedAt = Date.now();
  adminRecoveryStore.set(email, recovery, recovery.expiresAt - Date.now());
  return { verified: true };
}
async function adminResendRecoveryOtp(emailInput) {
  const email = normalizeEmail(emailInput);
  const recovery = adminRecoveryStore.get(email);
  if (!recovery || recovery.recoveryMode !== "otp") {
    throw createAppError(422, "NO_RECOVERY_SESSION", "No password recovery in progress.");
  }
  if (recovery.lastSentAt && Date.now() - recovery.lastSentAt < 60 * 1e3) {
    throw createAppError(429, "RATE_LIMITED", "Please wait a moment before requesting another OTP.");
  }
  const user = await findAdminById(recovery.userId);
  if (!user || user.status === "deleted") {
    adminRecoveryStore.delete(email);
    throw createAppError(401, "ADMIN_NOT_FOUND", "Unable to resend OTP.");
  }
  const otp = generateOtp();
  const otpExpiresAt = new Date(Date.now() + OTP_EXPIRES_MINUTES * 60 * 1e3);
  await prisma.adminAccount.update({
    where: { id: user.id },
    data: { resetPasswordToken: hashToken(otp), resetPasswordExpires: otpExpiresAt }
  });
  const mail = buildRecoveryOtpMail(otp);
  try {
    await sendMail({ to: user.email, subject: mail.subject, html: mail.html, text: mail.text });
  } catch (err) {
    console.error("Resend recovery OTP failed:", err);
    throw createAppError(500, "EMAIL_FAILED", "Unable to resend OTP right now. Please try again later.");
  }
  recovery.attempts = 0;
  recovery.otpExpiresAt = otpExpiresAt.getTime();
  recovery.lastSentAt = Date.now();
  adminRecoveryStore.set(email, recovery, recovery.expiresAt - Date.now());
  return { sent: true };
}
async function adminValidateResetToken(tokenInput) {
  const token = String(tokenInput || "").trim();
  if (!token) return null;
  const tokenHash = hashToken(token);
  const user = await prisma.adminAccount.findFirst({
    where: { resetPasswordToken: tokenHash },
    select: { id: true, email: true, status: true, resetPasswordExpires: true }
  });
  if (!user || user.status === "deleted" || !user.resetPasswordExpires || Date.now() > new Date(user.resetPasswordExpires).getTime()) {
    return null;
  }
  return { valid: true, email: user.email };
}
async function adminResetPassword(input) {
  if (!isAdminStrongPassword(input.password)) {
    throw createAppError(
      422,
      "VALIDATION_ERROR",
      "Password must be at least 8 characters long and include 1 uppercase letter, 1 lowercase letter, 1 number, and 1 special character."
    );
  }
  if (input.password !== input.confirm_password) {
    throw createAppError(422, "VALIDATION_ERROR", "Passwords do not match.");
  }
  const passwordHash = await hashPassword(input.password);
  if (input.token) {
    const tokenHash = hashToken(input.token);
    const user = await prisma.adminAccount.findFirst({
      where: { resetPasswordToken: tokenHash },
      select: { id: true, email: true, status: true, resetPasswordExpires: true }
    });
    if (!user || user.status === "deleted" || !user.resetPasswordExpires || Date.now() > new Date(user.resetPasswordExpires).getTime()) {
      throw createAppError(422, "INVALID_RESET_TOKEN", "Reset link is invalid or expired.");
    }
    await setAdminNewPassword(user.id, passwordHash);
    return { email: user.email };
  }
  const email = normalizeEmail(input.email ?? "");
  const recovery = adminRecoveryStore.get(email);
  if (!recovery || !recovery.verified) {
    throw createAppError(422, "RECOVERY_NOT_VERIFIED", "Please verify the OTP before resetting your password.");
  }
  await setAdminNewPassword(recovery.userId, passwordHash);
  adminRecoveryStore.delete(email);
  return { email };
}
async function setAdminNewPassword(adminId, newPasswordHash) {
  await prisma.adminAccount.update({
    where: { id: adminId },
    data: {
      password: newPasswordHash,
      resetPasswordToken: null,
      resetPasswordExpires: null,
      loginAttempts: 0,
      lastAttemptTime: null,
      lockUntil: null,
      isOnline: false,
      lastLogoutAt: /* @__PURE__ */ new Date(),
      sessionVersion: { increment: 1 }
    }
  });
}
async function findCustomerByGoogleId(googleId) {
  return prisma.customerAccount.findFirst({ where: { googleId } });
}
async function googleLogin(profile, guest) {
  if (!profile.googleId || !profile.email || !isValidEmail(profile.email)) {
    throw createAppError(400, "GOOGLE_PROFILE_INVALID", "Unable to sign in with Google.");
  }
  const linkedUser = await findCustomerByGoogleId(profile.googleId);
  if (linkedUser) {
    if (linkedUser.status === "deleted") {
      throw createAppError(403, "ACCOUNT_REMOVED", "Your account has been removed.");
    }
    return finalizeGoogleCustomer(linkedUser.id, guest);
  }
  const emailExists = await findAnyAccountByEmail(profile.email);
  if (emailExists) {
    throw createAppError(409, "ACCOUNT_EXISTS", "You already have an account. Please sign in.");
  }
  const userId = generateUserIdFromName(profile.fullName || "customer");
  const created = await prisma.customerAccount.create({
    data: {
      userId,
      fullName: profile.fullName || "Customer",
      email: profile.email,
      googleId: profile.googleId,
      provider: "google",
      status: "active",
      emailVerified: true,
      sessionVersion: 1
    }
  });
  return finalizeGoogleCustomer(created.id, guest);
}
async function finalizeGoogleCustomer(customerId, guest) {
  const fresh = await prisma.customerAccount.update({
    where: { id: customerId },
    data: {
      loginAttempts: 0,
      lastAttemptTime: null,
      lockUntil: null,
      isOnline: true,
      lastLoginAt: /* @__PURE__ */ new Date(),
      lastActivityAt: /* @__PURE__ */ new Date(),
      provider: "google",
      status: { set: "active" },
      sessionVersion: { increment: 1 }
    }
  });
  await mergeGuestData({
    email: fresh.email,
    numericId: fresh.id,
    guestToken: guest?.guestToken,
    guestId: guest?.guestId
  });
  const tokens = issueTokenPair({
    id: fresh.id,
    type: "customer",
    sessionVersion: fresh.sessionVersion,
    loginAt: Date.now()
  });
  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    sessionVersion: fresh.sessionVersion,
    user: toPublicCustomer(fresh)
  };
}
async function loadAuthAccount(payload) {
  if (payload.type === "customer") {
    const row2 = await findCustomerById(Number(payload.sub));
    if (!row2) return null;
    return {
      type: "customer",
      id: row2.id,
      role: "customer",
      status: row2.status,
      emailVerified: row2.emailVerified,
      sessionVersion: row2.sessionVersion,
      lastLoginAt: row2.lastLoginAt,
      row: row2
    };
  }
  const row = await findAdminById(Number(payload.sub));
  if (!row) return null;
  return {
    type: "admin",
    id: row.id,
    role: row.role,
    status: row.status,
    emailVerified: row.emailVerified,
    sessionVersion: row.sessionVersion,
    lastLoginAt: row.lastLoginAt,
    row
  };
}
async function revokeSessionOnRefreshReuse(payload) {
  if (payload.type === "admin") {
    await prisma.adminAccount.update({
      where: { id: Number(payload.sub) },
      data: { sessionVersion: { increment: 1 } }
    });
    return;
  }
  await prisma.customerAccount.update({
    where: { id: Number(payload.sub) },
    data: { sessionVersion: { increment: 1 } }
  });
}
function refreshReuseState(payload) {
  return isRefreshJtiRevoked(payload.jti);
}
function markRefreshRotated(jti) {
  revokeRefreshJti(jti);
}
export {
  adminForgotPassword,
  adminLogout,
  adminResendOtp,
  adminResendRecoveryOtp,
  adminResetPassword,
  adminSignIn,
  adminValidateResetToken,
  adminVerifyOtp,
  adminVerifyRecoveryOtp,
  customerForgotPassword,
  customerLogin,
  customerLogout,
  customerResendOtp,
  customerResendVerification,
  customerResetPassword,
  customerSignup,
  customerValidateResetToken,
  customerVerifyEmail,
  customerVerifyOtp,
  findCustomerByGoogleId,
  googleLogin,
  loadAuthAccount,
  markRefreshRotated,
  refreshReuseState,
  revokeSessionOnRefreshReuse,
  toPublicAdmin,
  toPublicCustomer
};
