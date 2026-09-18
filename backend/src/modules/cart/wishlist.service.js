import { prisma } from "../../lib/prisma.js";
import { Prisma } from "@prisma/client";
const sanitize = (v) => {
  if (v === null || v === void 0) return "";
  return String(v).trim();
};
const normalizeImage = (raw) => {
  const value = sanitize(raw);
  if (!value) return "/uploads/products/default.jpg";
  const img = value.replace(/\\/g, "/");
  if (img.startsWith("http://") || img.startsWith("https://") || img.startsWith("//") || img.startsWith("/")) {
    return img;
  }
  return "/uploads/products/" + img;
};
function wishlistIdWhere(id) {
  if (id.numericId != null) return { userId: id.numericId };
  if (id.guestId) return { guestId: id.guestId };
  return {};
}
async function getWishlist(id) {
  const where = wishlistIdWhere(id);
  if (!where.userId && !where.guestId) {
    return { ids: [], items: [] };
  }
  const rows = await prisma.wishlist.findMany({
    where,
    orderBy: { id: "desc" },
    include: {
      variant: {
        include: {
          product: true,
          media: { orderBy: { id: "asc" }, take: 1 }
        }
      }
    }
  });
  const ids = rows.map((r) => Number(r.variantId)).filter((v) => Number.isSafeInteger(v) && v > 0);
  const items = rows.map((row) => ({
    wishlist_id: row.id,
    variant_id: Number(row.variantId),
    product_id: row.variant?.productId ?? null,
    name: row.variant?.name ?? null,
    brand: row.variant?.product?.brand ?? null,
    sku: row.variant?.sku ?? null,
    variant_image: normalizeImage(row.variant?.media[0]?.filename ?? row.variant?.product?.mainImage ?? null)
  }));
  return { ids, items };
}
async function toggleWishlist(id, variantId) {
  const where = wishlistIdWhere(id);
  if (!where.userId && !where.guestId) {
    return { action: "removed", is_fav: false };
  }
  return prisma.$transaction(async (tx) => {
    const identityColumn = where.userId != null ? "user_id" : "guest_id";
    const identityValue = where.userId ?? where.guestId;
    const existingRows = await tx.$queryRaw`
      SELECT id FROM wishlist
      WHERE variant_id = ${variantId}
        AND ${Prisma.raw(identityColumn)} = ${identityValue}
      LIMIT 1
      FOR UPDATE
    `;
    if (existingRows.length) {
      const existingId = Number(existingRows[0].id);
      await tx.wishlist.delete({ where: { id: existingId } });
      return { action: "removed", is_fav: false, row: { id: existingId, variant_id: variantId } };
    }
    const created = await tx.wishlist.create({
      data: where.userId != null ? { variantId, userId: where.userId } : { variantId, guestId: where.guestId },
      select: { id: true }
    });
    return { action: "added", is_fav: true, row: { id: created.id, variant_id: variantId } };
  });
}
async function getWishlistIds(id) {
  try {
    const result = await getWishlist(id);
    return result.ids;
  } catch {
    return [];
  }
}
export {
  getWishlist,
  getWishlistIds,
  toggleWishlist
};
