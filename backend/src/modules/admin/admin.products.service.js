import { prisma } from "../../lib/prisma.js";
import { createAppError } from "../../common/errors.js";
import { sanitizeText } from "../auth/auth.config.js";
import fs from "fs";
import path from "path";
function slugify(text) {
  return sanitizeText(text).toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/[\s-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120) || "product";
}
async function generateProductId() {
  const count = await prisma.product.count();
  const next = count + 1;
  return `PROD${String(next).padStart(6, "0")}`;
}
async function ensureUniqueSlug(base, excludeId) {
  let slug = base;
  let suffix = 0;
  while (true) {
    const existing = await prisma.product.findUnique({ where: { slug } });
    if (!existing || excludeId && existing.id === excludeId) return slug;
    suffix++;
    slug = `${base}-${suffix}`;
  }
}
async function ensureAttribute(name, scopeType, productId, variantId) {
  const slug = sanitizeText(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const existing = await prisma.attribute.findFirst({
    where: {
      slug,
      scopeType,
      productId: productId ?? null,
      variantId: variantId ?? null
    }
  });
  if (existing) return existing;
  return prisma.attribute.create({
    data: {
      name: sanitizeText(name),
      slug,
      scopeType,
      productId: productId ?? null,
      variantId: variantId ?? null
    }
  });
}
async function ensureAttributeValue(attributeId, value) {
  const slug = sanitizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const existing = await prisma.attributeValue.findFirst({
    where: { attributeId, value: sanitizeText(value) }
  });
  if (existing) return existing;
  return prisma.attributeValue.create({
    data: { attributeId, value: sanitizeText(value), slug }
  });
}
async function attachVariantAttributes(variantId, attributes) {
  if (!attributes?.length) return;
  for (const attr of attributes) {
    if (!attr.name || !attr.value) continue;
    const attribute = await ensureAttribute(attr.name, "variant", void 0, variantId);
    const attrValue = await ensureAttributeValue(attribute.id, attr.value);
    await prisma.productVariantAttribute.upsert({
      where: { variantId_attributeId: { variantId, attributeId: attribute.id } },
      create: { variantId, attributeId: attribute.id, attributeValueId: attrValue.id },
      update: { attributeValueId: attrValue.id }
    });
  }
}
async function syncVariantMedia(variantId, mediaInput) {
  if (!mediaInput?.length) return;
  await prisma.variantMedia.deleteMany({ where: { variantId } });
  for (const m of mediaInput) {
    await prisma.variantMedia.create({
      data: {
        variantId,
        filename: m.filename,
        originalname: m.originalname || m.filename,
        mimetype: m.mimetype || "application/octet-stream",
        size: m.size || 0
      }
    });
  }
}
async function listProducts(query) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(5, Number(query.limit) || 20));
  const offset = (page - 1) * limit;
  const q = sanitizeText(query.q || "");
  const where = {};
  if (q) {
    where.OR = [
      { name: { contains: q } },
      { slug: { contains: q } },
      { brand: { contains: q } },
      { productId: { contains: q } }
    ];
  }
  if (query.status) {
    where.status = query.status;
  }
  if (query.parent_category_id) {
    where.parentCategoryId = query.parent_category_id;
  }
  if (query.category_id) {
    where.categoryId = query.category_id;
  }
  const [items, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: {
        variants: {
          select: { id: true, name: true, price: true, stock: true, isActive: true, isDefault: true },
          orderBy: { sortOrder: "asc" }
        },
        parentCategory: { select: { id: true, name: true, slug: true } },
        category: { select: { id: true, name: true, slug: true } }
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset
    }),
    prisma.product.count({ where })
  ]);
  return {
    products: items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
  };
}
async function searchProducts(q, limit = 20) {
  const term = sanitizeText(q);
  if (!term) return { products: [] };
  const products = await prisma.product.findMany({
    where: {
      OR: [
        { name: { contains: term } },
        { brand: { contains: term } },
        { productId: { contains: term } },
        { slug: { contains: term } }
      ]
    },
    include: {
      variants: {
        select: { id: true, name: true, price: true, stock: true },
        orderBy: { sortOrder: "asc" },
        take: 3
      }
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(limit, 50)
  });
  return { products };
}
async function getProduct(id) {
  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      variants: {
        include: {
          media: true,
          attributes: {
            include: {
              attribute: true,
              attributeValue: true
            }
          }
        },
        orderBy: { sortOrder: "asc" }
      },
      parentCategory: { select: { id: true, name: true, slug: true } },
      category: { select: { id: true, name: true, slug: true } }
    }
  });
  if (!product) throw createAppError(404, "PRODUCT_NOT_FOUND", "Product not found");
  return { product };
}
async function createProduct(input) {
  const name = sanitizeText(input.name);
  if (!name) throw createAppError(422, "VALIDATION_ERROR", "Product name is required");
  const slug = await ensureUniqueSlug(input.slug || slugify(name));
  const productId = await generateProductId();
  const product = await prisma.product.create({
    data: {
      productId,
      name,
      slug,
      productType: sanitizeText(input.product_type || "simple"),
      brand: sanitizeText(input.brand || "") || null,
      mpn: sanitizeText(input.mpn || "") || null,
      bullets: input.bullets || null,
      description: input.description || null,
      shortDescription: input.short_description || null,
      parentCategoryId: input.parent_category_id || null,
      categoryId: input.category_id || null,
      visibility: sanitizeText(input.visibility || "visible"),
      status: sanitizeText(input.status || "published"),
      metaKeywords: input.meta_keywords || null,
      metaTitle: input.meta_title || null,
      metaDescription: input.meta_description || null,
      mainImage: input.main_image || null
    }
  });
  if (input.variants?.length) {
    for (let i = 0; i < input.variants.length; i++) {
      const v = input.variants[i];
      const variant = await prisma.productVariant.create({
        data: {
          productId: product.id,
          name: sanitizeText(v.name || "") || null,
          displayName: sanitizeText(v.display_name || "") || null,
          sku: sanitizeText(v.sku || "") || null,
          price: v.price ?? 0,
          salePrice: v.sale_price ?? null,
          costPrice: v.cost_price ?? null,
          stock: v.stock ?? 0,
          lowStockThreshold: v.low_stock_threshold ?? 5,
          trackInventory: v.track_inventory ?? true,
          allowBackorders: v.allow_backorders ?? false,
          discountType: sanitizeText(v.discount_type || "") || null,
          discountValue: v.discount_value ?? null,
          vatRate: v.vat_rate ?? 5,
          vatIncluded: v.vat_included ?? true,
          barcode: sanitizeText(v.barcode || "") || null,
          barcodeType: sanitizeText(v.barcode_type || "") || null,
          weight: v.weight ?? null,
          weightUnit: sanitizeText(v.weight_unit || "") || null,
          length: v.length ?? null,
          width: v.width ?? null,
          height: v.height ?? null,
          dimensionUnit: sanitizeText(v.dimension_unit || "") || null,
          shippingClass: sanitizeText(v.shipping_class || "") || null,
          isActive: v.is_active ?? true,
          isDefault: i === 0 ? true : v.is_default ?? false,
          sortOrder: v.sort_order ?? i
        }
      });
      await attachVariantAttributes(variant.id, v.attributes || []);
      await syncVariantMedia(variant.id, v.media);
    }
  }
  return getProduct(product.id);
}
async function updateProduct(id, input) {
  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) throw createAppError(404, "PRODUCT_NOT_FOUND", "Product not found");
  const slug = input.slug ? await ensureUniqueSlug(slugify(input.slug), id) : existing.slug;
  const product = await prisma.product.update({
    where: { id },
    data: {
      name: input.name ? sanitizeText(input.name) : existing.name,
      slug,
      productType: input.product_type ? sanitizeText(input.product_type) : existing.productType,
      brand: input.brand !== void 0 ? sanitizeText(input.brand || "") || null : existing.brand,
      mpn: input.mpn !== void 0 ? sanitizeText(input.mpn || "") || null : existing.mpn,
      bullets: input.bullets !== void 0 ? input.bullets : existing.bullets,
      description: input.description !== void 0 ? input.description : existing.description,
      shortDescription: input.short_description !== void 0 ? input.short_description : existing.shortDescription,
      parentCategoryId: input.parent_category_id !== void 0 ? input.parent_category_id || null : existing.parentCategoryId,
      categoryId: input.category_id !== void 0 ? input.category_id || null : existing.categoryId,
      visibility: input.visibility ? sanitizeText(input.visibility) : existing.visibility,
      status: input.status ? sanitizeText(input.status) : existing.status,
      metaKeywords: input.meta_keywords !== void 0 ? input.meta_keywords : existing.metaKeywords,
      metaTitle: input.meta_title !== void 0 ? input.meta_title : existing.metaTitle,
      metaDescription: input.meta_description !== void 0 ? input.meta_description : existing.metaDescription,
      mainImage: input.main_image !== void 0 ? input.main_image : existing.mainImage
    }
  });
  if (input.variants) {
    const existingVariants = await prisma.productVariant.findMany({
      where: { productId: id }
    });
    const existingMap = new Map(existingVariants.map((v) => [v.id, v]));
    const existingSkuMap = new Map(existingVariants.filter((v) => v.sku).map((v) => [v.sku, v]));
    const seenIds = /* @__PURE__ */ new Set();
    for (let i = 0; i < input.variants.length; i++) {
      const v = input.variants[i];
      let variantId;
      let matched;
      if (v.id) matched = existingMap.get(v.id);
      if (!matched && v.sku) matched = existingSkuMap.get(v.sku);
      if (matched) {
        const updated = await prisma.productVariant.update({
          where: { id: matched.id },
          data: {
            name: v.name !== void 0 ? sanitizeText(v.name || "") : matched.name,
            displayName: v.display_name !== void 0 ? sanitizeText(v.display_name || "") : matched.displayName,
            sku: v.sku !== void 0 ? sanitizeText(v.sku || "") : matched.sku,
            price: v.price ?? matched.price,
            salePrice: v.sale_price !== void 0 ? v.sale_price : matched.salePrice,
            costPrice: v.cost_price !== void 0 ? v.cost_price : matched.costPrice,
            stock: v.stock !== void 0 ? v.stock : matched.stock,
            lowStockThreshold: v.low_stock_threshold ?? matched.lowStockThreshold,
            trackInventory: v.track_inventory ?? matched.trackInventory,
            allowBackorders: v.allow_backorders ?? matched.allowBackorders,
            discountType: v.discount_type !== void 0 ? sanitizeText(v.discount_type || "") : matched.discountType,
            discountValue: v.discount_value !== void 0 ? v.discount_value : matched.discountValue,
            vatRate: v.vat_rate ?? matched.vatRate,
            vatIncluded: v.vat_included ?? matched.vatIncluded,
            barcode: v.barcode !== void 0 ? sanitizeText(v.barcode || "") : matched.barcode,
            barcodeType: v.barcode_type !== void 0 ? sanitizeText(v.barcode_type || "") : matched.barcodeType,
            weight: v.weight !== void 0 ? v.weight : matched.weight,
            weightUnit: v.weight_unit !== void 0 ? sanitizeText(v.weight_unit || "") : matched.weightUnit,
            length: v.length !== void 0 ? v.length : matched.length,
            width: v.width !== void 0 ? v.width : matched.width,
            height: v.height !== void 0 ? v.height : matched.height,
            dimensionUnit: v.dimension_unit !== void 0 ? sanitizeText(v.dimension_unit || "") : matched.dimensionUnit,
            shippingClass: v.shipping_class !== void 0 ? sanitizeText(v.shipping_class || "") : matched.shippingClass,
            isActive: v.is_active ?? matched.isActive,
            isDefault: v.is_default ?? matched.isDefault,
            sortOrder: v.sort_order ?? matched.sortOrder
          }
        });
        variantId = updated.id;
        seenIds.add(updated.id);
      } else {
        const created = await prisma.productVariant.create({
          data: {
            productId: id,
            name: sanitizeText(v.name || "") || null,
            displayName: sanitizeText(v.display_name || "") || null,
            sku: sanitizeText(v.sku || "") || null,
            price: v.price ?? 0,
            salePrice: v.sale_price ?? null,
            costPrice: v.cost_price ?? null,
            stock: v.stock ?? 0,
            lowStockThreshold: v.low_stock_threshold ?? 5,
            trackInventory: v.track_inventory ?? true,
            allowBackorders: v.allow_backorders ?? false,
            discountType: sanitizeText(v.discount_type || "") || null,
            discountValue: v.discount_value ?? null,
            vatRate: v.vat_rate ?? 5,
            vatIncluded: v.vat_included ?? true,
            barcode: sanitizeText(v.barcode || "") || null,
            barcodeType: sanitizeText(v.barcode_type || "") || null,
            weight: v.weight ?? null,
            weightUnit: sanitizeText(v.weight_unit || "") || null,
            length: v.length ?? null,
            width: v.width ?? null,
            height: v.height ?? null,
            dimensionUnit: sanitizeText(v.dimension_unit || "") || null,
            shippingClass: sanitizeText(v.shipping_class || "") || null,
            isActive: v.is_active ?? true,
            isDefault: v.is_default ?? false,
            sortOrder: v.sort_order ?? i
          }
        });
        variantId = created.id;
        seenIds.add(created.id);
      }
      if (v.media) await syncVariantMedia(variantId, v.media);
      if (v.attributes) {
        await prisma.productVariantAttribute.deleteMany({ where: { variantId } });
        await attachVariantAttributes(variantId, v.attributes);
      }
    }
  }
  return getProduct(id);
}
async function deleteProduct(id) {
  const product = await prisma.product.findUnique({
    where: { id },
    include: { variants: { select: { id: true } } }
  });
  if (!product) throw createAppError(404, "PRODUCT_NOT_FOUND", "Product not found");
  await prisma.$transaction(async (tx) => {
    const variantIds = product.variants.map((v) => v.id);
    if (variantIds.length) {
      await tx.variantMedia.deleteMany({ where: { variantId: { in: variantIds } } });
      await tx.productVariantAttribute.deleteMany({ where: { variantId: { in: variantIds } } });
      await tx.productVariant.deleteMany({ where: { productId: id } });
    }
    await tx.product.delete({ where: { id } });
  });
  try {
    if (product.mainImage) {
      const filePath = path.join(process.cwd(), "uploads", product.mainImage);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    for (const v of product.variants) {
      const media = await prisma.variantMedia.findMany({ where: { variantId: v.id } });
      for (const m of media) {
        const filePath = path.join(process.cwd(), "uploads", m.filename);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      }
    }
  } catch (err) {
    console.warn("File cleanup error (non-fatal):", err);
  }
  return { message: "Product deleted" };
}
export {
  createProduct,
  deleteProduct,
  getProduct,
  listProducts,
  searchProducts,
  updateProduct
};
