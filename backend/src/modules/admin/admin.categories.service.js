import { prisma } from "../../lib/prisma.js";
import { createAppError } from "../../common/errors.js";
import { sanitizeText } from "../auth/auth.config.js";
import fs from "fs";
import path from "path";
function slugify(text) {
  return sanitizeText(text).toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/[\s-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120) || "category";
}
async function ensureUniqueParentSlug(base, excludeId) {
  let slug = base;
  let suffix = 0;
  while (true) {
    const existing = await prisma.parentCategory.findUnique({ where: { slug } });
    if (!existing || excludeId && existing.id === excludeId) return slug;
    suffix++;
    slug = `${base}-${suffix}`;
  }
}
async function ensureUniqueCategorySlug(base, excludeId) {
  let slug = base;
  let suffix = 0;
  while (true) {
    const existing = await prisma.category.findUnique({ where: { slug } });
    if (!existing || excludeId && existing.id === excludeId) return slug;
    suffix++;
    slug = `${base}-${suffix}`;
  }
}
async function listParentCategories() {
  const items = await prisma.parentCategory.findMany({
    include: {
      _count: { select: { categories: true, products: true } }
    },
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }]
  });
  return { parent_categories: items };
}
async function getParentCategory(id) {
  const item = await prisma.parentCategory.findUnique({
    where: { id },
    include: {
      categories: { orderBy: { name: "asc" } },
      _count: { select: { products: true } }
    }
  });
  if (!item) throw createAppError(404, "NOT_FOUND", "Parent category not found");
  return { parent_category: item };
}
async function createParentCategory(input) {
  const name = sanitizeText(input.name);
  if (!name) throw createAppError(422, "VALIDATION_ERROR", "Name is required");
  const slug = await ensureUniqueParentSlug(input.slug || slugify(name));
  const item = await prisma.parentCategory.create({
    data: {
      name,
      slug,
      displayOrder: input.display_order ?? null,
      status: input.status ?? true,
      metaTitle: input.meta_title || null,
      metaDescription: input.meta_description || null,
      image: input.image || null
    }
  });
  return { parent_category: item, message: "Parent category created" };
}
async function updateParentCategory(id, input) {
  const existing = await prisma.parentCategory.findUnique({ where: { id } });
  if (!existing) throw createAppError(404, "NOT_FOUND", "Parent category not found");
  const slug = input.slug ? await ensureUniqueParentSlug(slugify(input.slug), id) : existing.slug;
  const item = await prisma.parentCategory.update({
    where: { id },
    data: {
      name: input.name ? sanitizeText(input.name) : existing.name,
      slug,
      displayOrder: input.display_order !== void 0 ? input.display_order : existing.displayOrder,
      status: input.status !== void 0 ? input.status : existing.status,
      metaTitle: input.meta_title !== void 0 ? input.meta_title : existing.metaTitle,
      metaDescription: input.meta_description !== void 0 ? input.meta_description : existing.metaDescription,
      image: input.image !== void 0 ? input.image : existing.image
    }
  });
  return { parent_category: item, message: "Parent category updated" };
}
async function deleteParentCategory(id) {
  const existing = await prisma.parentCategory.findUnique({
    where: { id },
    include: { _count: { select: { categories: true, products: true } } }
  });
  if (!existing) throw createAppError(404, "NOT_FOUND", "Parent category not found");
  if (existing._count.products > 0) {
    throw createAppError(409, "CONFLICT", "Cannot delete parent category with associated products");
  }
  if (existing.image) {
    try {
      const filePath = path.join(process.cwd(), "uploads", existing.image);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch {
    }
  }
  await prisma.parentCategory.delete({ where: { id } });
  return { message: "Parent category deleted" };
}
async function removeParentCategoryImage(id) {
  const existing = await prisma.parentCategory.findUnique({ where: { id } });
  if (!existing) throw createAppError(404, "NOT_FOUND", "Parent category not found");
  if (existing.image) {
    try {
      const filePath = path.join(process.cwd(), "uploads", existing.image);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch {
    }
  }
  await prisma.parentCategory.update({ where: { id }, data: { image: null } });
  return { message: "Image removed" };
}
async function listCategories(parentId) {
  const where = {};
  if (parentId) where.parentId = parentId;
  const items = await prisma.category.findMany({
    where,
    include: {
      parent: { select: { id: true, name: true, slug: true } },
      _count: { select: { products: true } }
    },
    orderBy: { name: "asc" }
  });
  return { categories: items };
}
async function getCategory(id) {
  const item = await prisma.category.findUnique({
    where: { id },
    include: {
      parent: { select: { id: true, name: true, slug: true } },
      _count: { select: { products: true } }
    }
  });
  if (!item) throw createAppError(404, "NOT_FOUND", "Category not found");
  return { category: item };
}
async function createCategory(input) {
  const name = sanitizeText(input.name);
  if (!name) throw createAppError(422, "VALIDATION_ERROR", "Name is required");
  if (input.parent_id) {
    const parent = await prisma.parentCategory.findUnique({ where: { id: input.parent_id } });
    if (!parent) throw createAppError(404, "NOT_FOUND", "Parent category not found");
  }
  const slug = await ensureUniqueCategorySlug(input.slug || slugify(name));
  const item = await prisma.category.create({
    data: {
      parentId: input.parent_id || null,
      name,
      slug,
      description: input.description || null,
      status: input.status ?? true,
      image: input.image || null
    }
  });
  return { category: item, message: "Category created" };
}
async function updateCategory(id, input) {
  const existing = await prisma.category.findUnique({ where: { id } });
  if (!existing) throw createAppError(404, "NOT_FOUND", "Category not found");
  if (input.parent_id) {
    const parent = await prisma.parentCategory.findUnique({ where: { id: input.parent_id } });
    if (!parent) throw createAppError(404, "NOT_FOUND", "Parent category not found");
  }
  const slug = input.slug ? await ensureUniqueCategorySlug(slugify(input.slug), id) : existing.slug;
  const item = await prisma.category.update({
    where: { id },
    data: {
      parentId: input.parent_id !== void 0 ? input.parent_id || null : existing.parentId,
      name: input.name ? sanitizeText(input.name) : existing.name,
      slug,
      description: input.description !== void 0 ? input.description : existing.description,
      status: input.status !== void 0 ? input.status : existing.status,
      image: input.image !== void 0 ? input.image : existing.image
    }
  });
  return { category: item, message: "Category updated" };
}
async function deleteCategory(id) {
  const existing = await prisma.category.findUnique({
    where: { id },
    include: { _count: { select: { products: true } } }
  });
  if (!existing) throw createAppError(404, "NOT_FOUND", "Category not found");
  if (existing._count.products > 0) {
    throw createAppError(409, "CONFLICT", "Cannot delete category with associated products");
  }
  if (existing.image) {
    try {
      const filePath = path.join(process.cwd(), "uploads", existing.image);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch {
    }
  }
  await prisma.category.delete({ where: { id } });
  return { message: "Category deleted" };
}
async function removeCategoryImage(id) {
  const existing = await prisma.category.findUnique({ where: { id } });
  if (!existing) throw createAppError(404, "NOT_FOUND", "Category not found");
  if (existing.image) {
    try {
      const filePath = path.join(process.cwd(), "uploads", existing.image);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch {
    }
  }
  await prisma.category.update({ where: { id }, data: { image: null } });
  return { message: "Image removed" };
}
export {
  createCategory,
  createParentCategory,
  deleteCategory,
  deleteParentCategory,
  getCategory,
  getParentCategory,
  listCategories,
  listParentCategories,
  removeCategoryImage,
  removeParentCategoryImage,
  updateCategory,
  updateParentCategory
};
