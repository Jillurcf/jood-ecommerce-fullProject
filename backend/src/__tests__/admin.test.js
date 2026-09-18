import { describe, it, expect, vi } from "vitest";
import { prisma } from "../lib/prisma.js";
import {
  getOverview,
  requestCreateAdmin,
  suspendAdmin,
  activateAdmin,
  forceLogoutAdmin,
  listAdmins,
  approveAdmin
} from "../modules/admin/admin.accounts.service.js";
import {
  listUsers,
  getUser,
  createUser,
  blockUser,
  freezeUser,
  deleteUser
} from "../modules/admin/admin.users.service.js";
const adminBase = {
  id: 1,
  adminId: "master_20260101_abcdef01",
  fullName: "Master Admin",
  email: "master@jood.com",
  phone: "+971500000000",
  role: "master_admin",
  status: "active",
  emailVerified: true,
  isOnline: true,
  lastLoginAt: /* @__PURE__ */ new Date(),
  lastLogoutAt: null,
  lastActivityAt: /* @__PURE__ */ new Date(),
  sessionVersion: 1,
  createdBy: null,
  createdAt: /* @__PURE__ */ new Date(),
  updatedAt: /* @__PURE__ */ new Date()
};
describe("admin accounts management", () => {
  it("suspendAdmin blocks + bumps session_version and forbids master suspension", async () => {
    vi.mocked(prisma.adminAccount.findUnique).mockResolvedValueOnce({ ...adminBase, role: "master_admin" });
    await expect(suspendAdmin(1)).rejects.toMatchObject({ statusCode: 403 });
    vi.mocked(prisma.adminAccount.findUnique).mockResolvedValueOnce({ ...adminBase, id: 2, role: "admin" });
    vi.mocked(prisma.adminAccount.update).mockResolvedValueOnce({
      ...adminBase,
      id: 2,
      role: "admin",
      status: "blocked",
      sessionVersion: 2
    });
    const res = await suspendAdmin(2);
    expect(res.admin.status).toBe("blocked");
    expect(res.admin.sessionVersion).toBe(2);
    const updateData = vi.mocked(prisma.adminAccount.update).mock.calls[0][0].data;
    expect(updateData.sessionVersion).toMatchObject({ increment: 1 });
  });
  it("activateAdmin clears lock and login attempts", async () => {
    vi.mocked(prisma.adminAccount.findUnique).mockResolvedValueOnce({ ...adminBase, id: 2, role: "admin", status: "blocked" });
    vi.mocked(prisma.adminAccount.update).mockResolvedValueOnce({ ...adminBase, id: 2, status: "active" });
    const res = await activateAdmin(2);
    expect(res.admin.status).toBe("active");
    const data = vi.mocked(prisma.adminAccount.update).mock.calls.at(-1)[0].data;
    expect(data.loginAttempts).toBe(0);
  });
  it("forceLogoutAdmin bumps session_version and goes offline", async () => {
    vi.mocked(prisma.adminAccount.findUnique).mockResolvedValueOnce(adminBase);
    vi.mocked(prisma.adminAccount.update).mockResolvedValueOnce({ ...adminBase, isOnline: false, sessionVersion: 2 });
    const res = await forceLogoutAdmin(1);
    expect(res.admin.isOnline).toBe(false);
    const data = vi.mocked(prisma.adminAccount.update).mock.calls[0][0].data;
    expect(data.sessionVersion).toMatchObject({ increment: 1 });
  });
  it("requestCreateAdmin enforces max one master_admin (409)", async () => {
    vi.mocked(prisma.adminAccount.findFirst).mockResolvedValueOnce(null);
    vi.mocked(prisma.adminAccount.count).mockResolvedValueOnce(1);
    await expect(
      requestCreateAdmin(1, "master_admin", { full_name: "New Master", email: "nm@jood.com", role: "master_admin" })
    ).rejects.toMatchObject({ statusCode: 409 });
  });
  it("requestCreateAdmin only lets master create any role; super cannot create master", async () => {
    await expect(
      requestCreateAdmin(1, "super_admin", { full_name: "Valid Name", email: "t@jood.com", role: "master_admin" })
    ).rejects.toMatchObject({ statusCode: 403 });
  });
  it("requestCreateAdmin validates role set (422)", async () => {
    await expect(
      requestCreateAdmin(1, "master_admin", { full_name: "T", email: "t@jood.com", role: "not_a_role" })
    ).rejects.toMatchObject({ statusCode: 422 });
  });
  it("getOverview orders admins by role and returns safe columns", async () => {
    vi.mocked(prisma.adminAccount.findMany).mockResolvedValueOnce([
      { ...adminBase, id: 2, role: "admin" },
      { ...adminBase, id: 1, role: "master_admin" }
    ]);
    const { admins } = await getOverview();
    expect(admins[0].role).toBe("master_admin");
    expect(admins[0]).not.toHaveProperty("password");
  });
  it("listAdmins filters by role with pagination", async () => {
    vi.mocked(prisma.adminAccount.findMany).mockResolvedValue([adminBase]);
    vi.mocked(prisma.adminAccount.count).mockResolvedValue(0);
    const { admins, pagination } = await listAdmins({ page: 1, limit: 20, role: "admin" });
    expect(Array.isArray(admins)).toBe(true);
    expect(pagination.total).toBe(0);
    const where = vi.mocked(prisma.adminAccount.findMany).mock.calls.at(-1)[0].where;
    expect(where.role).toBe("admin");
  });
  it("approveAdmin rejects expired approval", async () => {
    vi.mocked(prisma.adminAccount.findUnique).mockResolvedValueOnce({
      ...adminBase,
      otpHash: "h",
      otpExpiresAt: new Date(Date.now() - 1e3)
    });
    await expect(approveAdmin(1, "123456")).rejects.toMatchObject({ statusCode: 400 });
  });
});
describe("admin users (customer) management", () => {
  it("listUsers paginates and returns safe columns", async () => {
    vi.mocked(prisma.customerAccount.findMany).mockResolvedValueOnce([{ id: 1, email: "u@jood.com" }]);
    vi.mocked(prisma.customerAccount.count).mockResolvedValueOnce(7);
    const { users, pagination } = await listUsers({ page: 1, limit: 10 });
    expect(pagination.total).toBe(7);
    expect(users).toHaveLength(1);
  });
  it("getUser throws 404 for unknown id", async () => {
    vi.mocked(prisma.customerAccount.findUnique).mockResolvedValueOnce(null);
    await expect(getUser(999)).rejects.toMatchObject({ statusCode: 404 });
  });
  it("createUser rejects email reused across customer+admin tables", async () => {
    vi.mocked(prisma.customerAccount.findUnique).mockResolvedValueOnce(null);
    vi.mocked(prisma.adminAccount.findUnique).mockResolvedValueOnce({ id: 1 });
    await expect(createUser({ full_name: "New User", email: "nu@jood.com", password: "StrongPass1!" })).rejects.toMatchObject({ statusCode: 409 });
  });
  it("createUser validates full name", async () => {
    await expect(createUser({ full_name: "X", email: "nu@jood.com" })).rejects.toMatchObject({ statusCode: 422 });
  });
  it("blockUser sets blocked + bumps session_version", async () => {
    vi.mocked(prisma.customerAccount.findUnique).mockResolvedValueOnce({ id: 5, fullName: "U", email: "u@jood.com" });
    vi.mocked(prisma.customerAccount.update).mockResolvedValueOnce({ id: 5, status: "blocked" });
    const res = await blockUser(5);
    expect(res.user.status).toBe("blocked");
    const data = vi.mocked(prisma.customerAccount.update).mock.calls[0][0].data;
    expect(data.sessionVersion).toMatchObject({ increment: 1 });
  });
  it("freezeUser sets inactive", async () => {
    vi.mocked(prisma.customerAccount.findUnique).mockResolvedValueOnce({ id: 5, fullName: "U", email: "u@jood.com" });
    vi.mocked(prisma.customerAccount.update).mockResolvedValueOnce({ id: 5, status: "inactive" });
    const res = await freezeUser(5);
    expect(res.user.status).toBe("inactive");
  });
  it("deleteUser sets deleted + bumps session_version", async () => {
    vi.mocked(prisma.customerAccount.findUnique).mockResolvedValueOnce({ id: 5, fullName: "U", email: "u@jood.com" });
    vi.mocked(prisma.customerAccount.update).mockResolvedValueOnce({ id: 5, status: "deleted" });
    const res = await deleteUser(5);
    expect(res.user.status).toBe("deleted");
    const data = vi.mocked(prisma.customerAccount.update).mock.calls[0][0].data;
    expect(data.sessionVersion).toMatchObject({ increment: 1 });
  });
});
