import { prisma } from "../../lib/prisma.js";
import { createAppError } from "../../common/errors.js";
import {
  normalizeEmail,
  sanitizeText,
  isValidFullName,
  isValidPhone,
  generateUserIdFromName
} from "../auth/auth.config.js";
import { hashPassword } from "../auth/auth.config.js";
const SELECT_SAFE = {
  id: true,
  userId: true,
  fullName: true,
  email: true,
  phone: true,
  provider: true,
  status: true,
  emailVerified: true,
  isOnline: true,
  lastLoginAt: true,
  lastLogoutAt: true,
  createdAt: true,
  updatedAt: true
};
async function listUsers(query) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(5, Number(query.limit) || 20));
  const offset = (page - 1) * limit;
  const q = sanitizeText(query.q || "");
  const status = sanitizeText(query.status || "");
  const where = {};
  if (q) {
    where.OR = [
      { fullName: { contains: q } },
      { email: { contains: q } },
      { userId: { contains: q } },
      { phone: { contains: q } }
    ];
  }
  if (status) {
    where.status = status;
  }
  const [items, total] = await Promise.all([
    prisma.customerAccount.findMany({
      where,
      select: SELECT_SAFE,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset
    }),
    prisma.customerAccount.count({ where })
  ]);
  return {
    users: items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
  };
}
async function getUser(userId) {
  const user = await prisma.customerAccount.findUnique({
    where: { id: userId },
    select: SELECT_SAFE
  });
  if (!user) throw createAppError(404, "NOT_FOUND", "User not found");
  return { user };
}
async function createUser(input) {
  const fullName = sanitizeText(input.full_name);
  const email = normalizeEmail(input.email);
  const phone = sanitizeText(input.phone || "");
  if (!fullName || !isValidFullName(fullName)) {
    throw createAppError(422, "VALIDATION_ERROR", "Full name must be 2\u201380 characters");
  }
  if (!email) {
    throw createAppError(422, "VALIDATION_ERROR", "Valid email is required");
  }
  if (phone && !isValidPhone(phone)) {
    throw createAppError(422, "VALIDATION_ERROR", "Invalid phone number");
  }
  const existingCustomer = await prisma.customerAccount.findUnique({ where: { email } });
  if (existingCustomer) {
    throw createAppError(409, "CONFLICT", "An account with this email already exists");
  }
  const existingAdmin = await prisma.adminAccount.findUnique({ where: { email } });
  if (existingAdmin) {
    throw createAppError(409, "CONFLICT", "An account with this email already exists");
  }
  const password = input.password || generateUserIdFromName(fullName);
  const passwordHash = await hashPassword(password);
  const user = await prisma.customerAccount.create({
    data: {
      userId: generateUserIdFromName(fullName),
      fullName,
      email,
      phone: phone || null,
      passwordHash,
      provider: "local",
      status: "active",
      emailVerified: true
    },
    select: SELECT_SAFE
  });
  return { user, message: "User created successfully" };
}
async function updateUser(userId, input) {
  const user = await prisma.customerAccount.findUnique({ where: { id: userId } });
  if (!user) throw createAppError(404, "NOT_FOUND", "User not found");
  const data = {};
  if (input.full_name !== void 0) {
    const fullName = sanitizeText(input.full_name);
    if (fullName && !isValidFullName(fullName)) {
      throw createAppError(422, "VALIDATION_ERROR", "Full name must be 2\u201380 characters");
    }
    data.fullName = fullName || user.fullName;
  }
  if (input.phone !== void 0) {
    const phone = sanitizeText(input.phone);
    if (phone && !isValidPhone(phone)) {
      throw createAppError(422, "VALIDATION_ERROR", "Invalid phone number");
    }
    data.phone = phone || null;
  }
  if (input.status !== void 0) {
    data.status = input.status;
  }
  const updated = await prisma.customerAccount.update({
    where: { id: userId },
    data,
    select: SELECT_SAFE
  });
  return { user: updated, message: "User updated" };
}
async function blockUser(userId) {
  const user = await prisma.customerAccount.findUnique({ where: { id: userId } });
  if (!user) throw createAppError(404, "NOT_FOUND", "User not found");
  const updated = await prisma.customerAccount.update({
    where: { id: userId },
    data: {
      status: "blocked",
      isOnline: false,
      lastLogoutAt: /* @__PURE__ */ new Date(),
      sessionVersion: { increment: 1 }
    },
    select: SELECT_SAFE
  });
  return { user: updated, message: "User blocked" };
}
async function freezeUser(userId) {
  const user = await prisma.customerAccount.findUnique({ where: { id: userId } });
  if (!user) throw createAppError(404, "NOT_FOUND", "User not found");
  const updated = await prisma.customerAccount.update({
    where: { id: userId },
    data: {
      status: "inactive",
      isOnline: false,
      sessionVersion: { increment: 1 }
    },
    select: SELECT_SAFE
  });
  return { user: updated, message: "User frozen" };
}
async function deleteUser(userId) {
  const user = await prisma.customerAccount.findUnique({ where: { id: userId } });
  if (!user) throw createAppError(404, "NOT_FOUND", "User not found");
  const updated = await prisma.customerAccount.update({
    where: { id: userId },
    data: {
      status: "deleted",
      isOnline: false,
      lastLogoutAt: /* @__PURE__ */ new Date(),
      sessionVersion: { increment: 1 }
    },
    select: SELECT_SAFE
  });
  return { user: updated, message: "User deleted" };
}
export {
  blockUser,
  createUser,
  deleteUser,
  freezeUser,
  getUser,
  listUsers,
  updateUser
};
