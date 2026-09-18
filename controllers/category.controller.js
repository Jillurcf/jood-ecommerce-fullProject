require("dotenv").config();
const { pool } = require("../includes/conn");
const fs = require("fs").promises;
const path = require("path");

const UPLOAD_DIR = path.resolve(__dirname, "..", "uploads", "categories");

// Ensure upload directory exists
try {
  require("fs").mkdirSync(UPLOAD_DIR, { recursive: true });
} catch (err) {
  console.warn("Warning: Failed to create upload directory:", UPLOAD_DIR, err.message);
}

/* --------------------------
   Helpers
-------------------------- */
const slugify = (text = "") =>
  String(text)
    .toLowerCase()
    .trim()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

function parseStatus(v) {
  if (typeof v === "boolean") return v;
  if (v == null) return false;
  const s = String(v).trim().toLowerCase();
  return ["1", "true", "yes", "active", "on"].includes(s);
}

function isAjaxRequest(req) {
  return req.xhr || (req.headers.accept && req.headers.accept.indexOf("json") !== -1);
}

function safeJoin(filename) {
  if (!filename || typeof filename !== "string") return null;
  const full = path.resolve(UPLOAD_DIR, filename);
  return full.startsWith(UPLOAD_DIR) ? full : null;
}

async function removeFile(filename) {
  try {
    const full = safeJoin(filename);
    if (!full) return false;
    await fs.unlink(full).catch(err => {
      if (err.code !== "ENOENT") throw err;
    });
    return true;
  } catch (err) {
    throw err;
  }
}

function safeJSONParse(val) {
  if (!val) return [];
  try { return JSON.parse(val); } catch { return []; }
}

/* =========================
   GET: Categories Page
========================= */
exports.getCategories = async (req, res) => {
  try {
    const { rows: categories } = await pool.query(`
      SELECT
        c.id,
        c.parent_id,
        pc.name AS parent_name,
        c.name,
        c.slug,
        c.description,
        c.status,
        c.image,
        c.created_at,
        c.updated_at
      FROM categories c
      LEFT JOIN parent_categories pc ON pc.id = c.parent_id
      ORDER BY c.id DESC
    `);

    const { rows: parentCategories } = await pool.query(`
      SELECT id, name, status FROM parent_categories ORDER BY name ASC
    `);

    if (isAjaxRequest(req)) return res.json({ success: true, categories });

    res.render("admin/category", {
      categories: categories || [],
      parentCategories: parentCategories || [],
      error: null,
      success: null,
      formData: {},
      csrfToken: req.csrfToken()
    });
  } catch (err) {
    console.error("getCategories error:", err);
    if (isAjaxRequest(req)) return res.status(500).json({ success: false, message: "Failed to load categories" });

    res.render("admin/category", {
      categories: [],
      parentCategories: [],
      error: "Failed to load categories",
      success: null,
      formData: {},
      csrfToken: req.csrfToken()
    });
  }
};

/* =========================
   POST: Add / Update Category (with optional image)
========================= */
exports.saveCategory = async (req, res) => {
  const io = req.app?.get("io");
  const { id, name = "", slug: rawSlug, description, parent_id, status } = req.body || {};
  const uploadedFile = req.file?.filename;

  if (!name.trim()) return res.status(400).json({ success: false, message: "Category name is required" });

  const active = parseStatus(status);
  const slug = rawSlug?.trim() ? slugify(rawSlug) : slugify(name);
  const parentIdNum = parent_id ? parseInt(parent_id, 10) : null;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Validate parent exists
    if (parentIdNum) {
      const { rowCount } = await client.query("SELECT 1 FROM parent_categories WHERE id=$1", [parentIdNum]);
      if (!rowCount) {
        await client.query("ROLLBACK");
        return res.status(400).json({ success: false, message: "Parent category does not exist" });
      }
    }

    if (id) {
      // UPDATE category
      const { rows: existingRows } = await client.query("SELECT id, image FROM categories WHERE id=$1 FOR UPDATE", [id]);
      if (!existingRows.length) {
        await client.query("ROLLBACK");
        return res.status(404).json({ success: false, message: "Category not found" });
      }

      let finalImage = existingRows[0].image || null;
      if (uploadedFile) {
        finalImage = uploadedFile;
        if (existingRows[0].image) {
          try { await removeFile(existingRows[0].image); } catch (err) { console.warn("Failed removing old image:", err.message); }
        }
      }

      await client.query(
        `UPDATE categories SET
          parent_id=$1, name=$2, slug=$3, description=$4, status=$5, image=$6, updated_at=NOW()
          WHERE id=$7`,
        [parentIdNum, name.trim(), slug, description || null, active, finalImage, id]
      );

      const { rows: updatedRows } = await client.query("SELECT * FROM categories WHERE id=$1", [id]);
      await client.query("COMMIT");

      const updated = updatedRows[0];
      if (io?.emit) io.emit("categoryAddedOrUpdated", updated);
      return res.json({ success: true, message: "Category updated successfully", category: updated });
    }

    // INSERT category: check duplicates
    const { rows: dup } = await client.query(
      "SELECT 1 FROM categories WHERE LOWER(name)=LOWER($1) AND parent_id IS NOT DISTINCT FROM $2 LIMIT 1",
      [name.trim(), parentIdNum]
    );
    if (dup.length) {
      await client.query("ROLLBACK");
      return res.status(409).json({ success: false, message: "Category already exists under this parent" });
    }

    const { rows: insertedRows } = await client.query(
      `INSERT INTO categories
        (parent_id, name, slug, description, status, image, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,NOW(),NOW())
        RETURNING *`,
      [parentIdNum, name.trim(), slug, description || null, active, uploadedFile]
    );

    await client.query("COMMIT");
    const saved = insertedRows[0];
    if (io?.emit) io.emit("categoryAddedOrUpdated", saved);
    return res.status(201).json({ success: true, message: "Category added successfully", category: saved });

  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("saveCategory error:", err);
    return res.status(500).json({ success: false, message: "Failed to save category" });
  } finally {
    client.release();
  }
};

/* =========================
   DELETE: Category & related products/variants
========================= */
exports.deleteCategory = async (req, res) => {
  const io = req.app?.get("io");
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ success: false, message: "Invalid category ID" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: catRows } = await client.query("SELECT id, image FROM categories WHERE id=$1 FOR UPDATE", [id]);
    if (!catRows.length) { await client.query("ROLLBACK"); return res.status(404).json({ success: false, message: "Category not found" }); }

    const catImage = catRows[0].image;

    // Fetch products under category
    const { rows: products } = await client.query(
      "SELECT id, main_image, gallery, variant_images, product_videos FROM products WHERE category_id=$1",
      [id]
    );
    const productIds = products.map(p => p.id);

    if (productIds.length) {
      const { rows: variants } = await client.query(
        "SELECT id FROM product_variants WHERE product_id = ANY($1)",
        [productIds]
      );
      const variantIds = variants.map(v => v.id);

      if (variantIds.length) await client.query("DELETE FROM variant_media WHERE variant_id = ANY($1)", [variantIds]);
      await client.query("DELETE FROM product_variants WHERE product_id = ANY($1)", [productIds]);
      await client.query("DELETE FROM products WHERE id = ANY($1)", [productIds]);
    }

    await client.query("DELETE FROM categories WHERE id=$1", [id]);
    await client.query("COMMIT");

    // Remove images from disk
    if (catImage) await removeFile(catImage).catch(() => {});
    products.forEach(p => {
      if (p.main_image) removeFile(p.main_image).catch(() => {});
      safeJSONParse(p.gallery).forEach(f => removeFile(f).catch(() => {}));
      safeJSONParse(p.variant_images).forEach(f => removeFile(f).catch(() => {}));
      safeJSONParse(p.product_videos).forEach(f => removeFile(f).catch(() => {}));
    });

    if (io?.emit) io.emit("categoryDeleted", { id });
    return res.json({ success: true, message: "Category, products, and variants deleted successfully" });

  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("deleteCategory error:", err);
    return res.status(500).json({ success: false, message: "Failed to delete category and related products" });
  } finally {
    client.release();
  }
};

/* =========================
   DELETE: Remove only category image
========================= */
exports.removeCategoryImage = async (req, res) => {
  const io = req.app?.get("io");
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ success: false, message: "Invalid category ID" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query("SELECT image FROM categories WHERE id=$1 FOR UPDATE", [id]);
    if (!rows.length) { await client.query("ROLLBACK"); return res.status(404).json({ success: false, message: "Category not found" }); }

    const image = rows[0].image;
    if (!image) { await client.query("ROLLBACK"); return res.json({ success: true, message: "No image to remove" }); }

    await client.query("UPDATE categories SET image=NULL, updated_at=NOW() WHERE id=$1", [id]);
    await client.query("COMMIT");

    await removeFile(image).catch(() => {});
    if (io?.emit) io.emit("categoryImageRemoved", { id });
    return res.json({ success: true, message: "Image removed" });

  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("removeCategoryImage error:", err);
    return res.status(500).json({ success: false, message: "Failed to remove image" });
  } finally {
    client.release();
  }
};

/* =========================
   AJAX: Search Categories
========================= */
exports.searchCategory = async (req, res) => {
  const q = req.query?.q?.trim();
  if (!q) return res.json([]);

  try {
    const { rows } = await pool.query(
      "SELECT id, name FROM categories WHERE LOWER(name) LIKE LOWER($1) ORDER BY name ASC LIMIT 10",
      [`%${q}%`]
    );
    return res.json(rows);
  } catch (err) {
    console.error("searchCategory error:", err);
    return res.json([]);
  }
};
