import { prisma } from "../../lib/prisma.js";
import { createAppError } from "../../common/errors.js";
import { sanitizeText } from "../auth/auth.config.js";
async function listSupport(query) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(5, Number(query.limit) || 20));
  const offset = (page - 1) * limit;
  const q = sanitizeText(query.q || "");
  const supportWhere = {};
  if (q) {
    supportWhere.OR = [
      { name: { contains: q } },
      { email: { contains: q } },
      { subject: { contains: q } },
      { orderNumber: { contains: q } }
    ];
  }
  if (query.status) supportWhere.status = sanitizeText(query.status);
  const contactWhere = {};
  if (q) {
    contactWhere.OR = [
      { name: { contains: q } },
      { email: { contains: q } },
      { subject: { contains: q } }
    ];
  }
  const type = sanitizeText(query.type || "all");
  let supportItems = [];
  let contactItems = [];
  let supportTotal = 0;
  let contactTotal = 0;
  if (type === "all" || type === "support") {
    const [items, total] = await Promise.all([
      prisma.supportRequest.findMany({
        where: supportWhere,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset
      }),
      prisma.supportRequest.count({ where: supportWhere })
    ]);
    supportItems = items;
    supportTotal = total;
  }
  if (type === "all" || type === "contact") {
    const [items, total] = await Promise.all([
      prisma.contact.findMany({
        where: contactWhere,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset
      }),
      prisma.contact.count({ where: contactWhere })
    ]);
    contactItems = items;
    contactTotal = total;
  }
  const merged = [
    ...supportItems.map((s) => ({
      id: s.id,
      type: "support",
      name: s.name,
      email: s.email,
      subject: s.subject,
      status: s.status,
      created_at: s.createdAt,
      order_number: s.orderNumber
    })),
    ...contactItems.map((c) => ({
      id: c.id,
      type: "contact",
      name: c.name,
      email: c.email,
      subject: c.subject,
      status: "open",
      created_at: c.createdAt,
      order_number: null
    }))
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return {
    items: merged,
    pagination: {
      page,
      limit,
      total: supportTotal + contactTotal,
      totalPages: Math.ceil((supportTotal + contactTotal) / limit)
    }
  };
}
async function getSupportDetail(id) {
  const support = await prisma.supportRequest.findUnique({ where: { id } });
  if (support) return { type: "support", item: support };
  const contact = await prisma.contact.findUnique({ where: { id } });
  if (contact) return { type: "contact", item: contact };
  throw createAppError(404, "NOT_FOUND", "Item not found");
}
async function updateSupportStatus(id, status) {
  const newStatus = sanitizeText(status);
  if (!newStatus) throw createAppError(422, "VALIDATION_ERROR", "Status is required");
  const support = await prisma.supportRequest.findUnique({ where: { id } });
  if (support) {
    const updated = await prisma.supportRequest.update({
      where: { id },
      data: { status: newStatus }
    });
    return { type: "support", item: updated, message: "Status updated" };
  }
  const contact = await prisma.contact.findUnique({ where: { id } });
  if (contact) {
    return { type: "contact", item: contact, message: "Contact messages do not support status updates" };
  }
  throw createAppError(404, "NOT_FOUND", "Item not found");
}
export {
  getSupportDetail,
  listSupport,
  updateSupportStatus
};
