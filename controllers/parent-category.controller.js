/**
 * controllers/parent-category.controller.js
 * ==================================================
 * Fully rewritten: professional, secure, and robust.
 * Compatible with server.js (login/session commented)
 * ==================================================
 */

require("dotenv").config();
const { pool } = require("../includes/conn");
const fs = require("fs").promises;
const path = require("path");

const UPLOAD_DIR = path.resolve(__dirname, "..", "uploads", "categories");

// Ensure upload directory exists (sync ok here)
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

/* =========================
   GET: Parent Categories
========================= */
exports.getParentCategories = async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT id, name, slug, display_order, status, meta_title, meta_description, image, created_at, updated_at
      FROM parent_categories
      ORDER BY display_order ASC NULLS LAST, id DESC
    `);

    if (isAjaxRequest(req)) return res.json({ success: true, categories: rows });

    return res.render("admin/parent-category", {
      categories: rows,
      error: null,
      success: null,
      formData: {},
      csrfToken: req.csrfToken()
    });
  } catch (err) {
    console.error("getParentCategories error:", err);
    if (isAjaxRequest(req)) return res.status(500).json({ success: false, message: "Failed to load categories" });

    return res.render("admin/parent-category", {
      categories: [],
      error: "Failed to load parent categories",
      success: null,
      formData: {},
      csrfToken: req.csrfToken()
    });
  }
};

/* =========================
   POST: Add / Update Parent Category
========================= */
exports.saveParentCategory = async (req, res) => {
  const io = req.app?.get("io");
  const { id, name = "", slug: rawSlug, display_order, status, meta_title, meta_description } = req.body || {};
  const uploadedFile = req.file?.filename;

  if (!name.trim()) return res.status(400).json({ success: false, message: "Name is required" });

  const order = Number(display_order) || 0;
  const active = parseStatus(status);
  const slug = rawSlug?.trim() ? slugify(rawSlug) : slugify(name);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    if (id) {
      // Update
      const { rows: existingRows } = await client.query("SELECT id, image FROM parent_categories WHERE id = $1 FOR UPDATE", [id]);
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
        `UPDATE parent_categories SET
          name=$1, slug=$2, display_order=$3, status=$4,
          meta_title=$5, meta_description=$6, image=$7, updated_at=NOW()
          WHERE id=$8`,
        [name.trim(), slug, order, active, meta_title, meta_description, finalImage, id]
      );

      const { rows: updatedRows } = await client.query("SELECT * FROM parent_categories WHERE id=$1", [id]);
      await client.query("COMMIT");

      const updated = updatedRows[0];
      if (io?.emit) io.emit("categoryAddedOrUpdated", updated);
      return res.json({ success: true, message: "Category updated successfully", category: updated });
    }

    // Insert: check duplicates
    const { rows: dup } = await client.query("SELECT 1 FROM parent_categories WHERE LOWER(name)=LOWER($1) LIMIT 1", [name.trim()]);
    if (dup.length) {
      await client.query("ROLLBACK");
      return res.status(409).json({ success: false, message: "Category already exists" });
    }

    const { rows: insertedRows } = await client.query(
      `INSERT INTO parent_categories
        (name, slug, display_order, status, meta_title, meta_description, image, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW())
        RETURNING *`,
      [name.trim(), slug, order, active, meta_title, meta_description, uploadedFile]
    );

    await client.query("COMMIT");
    const saved = insertedRows[0];
    if (io?.emit) io.emit("categoryAddedOrUpdated", saved);
    return res.status(201).json({ success: true, message: "Category added successfully", category: saved });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("saveParentCategory error:", err);
    return res.status(500).json({ success: false, message: "Failed to save category" });
  } finally {
    client.release();
  }
};

/* =========================
   DELETE: Parent Category
========================= */
exports.deleteParentCategory = async (req, res) => {
  const io = req.app?.get("io");
  const id = parseInt(req.params.id, 10);

  if (!Number.isFinite(id)) return res.status(400).json({ success: false, message: "Invalid ID" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Lock the parent category row
    const { rows: parentRows } = await client.query(
      "SELECT id, image FROM parent_categories WHERE id=$1 FOR UPDATE",
      [id]
    );
    if (!parentRows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, message: "Category not found" });
    }
    const parentImage = parentRows[0].image;

    // Fetch child categories
    const { rows: childRows } = await client.query("SELECT id FROM categories WHERE parent_id=$1", [id]);
    const childCategoryIds = childRows.map(r => r.id);

    // Fetch all product IDs under parent + child categories
    const productIdsResult = await client.query(
      `SELECT id, main_image, gallery, variant_images, product_videos 
       FROM products 
       WHERE parent_category_id=$1 ${childCategoryIds.length ? `OR category_id = ANY($2)` : ""}`,
      childCategoryIds.length ? [id, childCategoryIds] : [id]
    );

    const productIds = productIdsResult.rows.map(r => r.id);

    // Delete variants & variant_media for all products
    if (productIds.length) {
      // Get variant IDs
      const variantRows = await client.query(
        "SELECT id FROM product_variants WHERE product_id = ANY($1)",
        [productIds]
      );
      const variantIds = variantRows.rows.map(v => v.id);

      // Delete variant media
      if (variantIds.length) await client.query("DELETE FROM variant_media WHERE variant_id = ANY($1)", [variantIds]);

      // Delete variants
      await client.query("DELETE FROM product_variants WHERE product_id = ANY($1)", [productIds]);

      // Delete products
      await client.query("DELETE FROM products WHERE id = ANY($1)", [productIds]);
    }

    // Delete child categories
    if (childCategoryIds.length) await client.query("DELETE FROM categories WHERE parent_id = ANY($1)", [childCategoryIds]);

    // Delete parent category
    await client.query("DELETE FROM parent_categories WHERE id=$1", [id]);

    await client.query("COMMIT");

    // Remove images from disk
    for (const product of productIdsResult.rows) {
      if (product.main_image) removeFile(product.main_image).catch(() => {});
      safeJSONParse(product.gallery).forEach(f => removeFile(f).catch(() => {}));
      safeJSONParse(product.variant_images).forEach(f => removeFile(f).catch(() => {}));
      safeJSONParse(product.product_videos).forEach(f => removeFile(f).catch(() => {}));
    }

    if (parentImage) removeFile(parentImage).catch(() => {});

    if (io?.emit) io.emit("categoryDeleted", { id });

    return res.json({ success: true, message: "Parent category, child categories, products, and variants deleted successfully" });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("deleteParentCategory error:", err);
    return res.status(500).json({ success: false, message: "Failed to delete category and products" });
  } finally {
    client.release();
  }
};

// Helper to safely parse JSON arrays
function safeJSONParse(val) {
  if (!val) return [];
  try { return JSON.parse(val); } catch { return []; }
}

// removeFile helper should already exist in your utils


/* =========================
   DELETE: Remove only image
========================= */
exports.removeParentCategoryImage = async (req, res) => {
  const io = req.app?.get("io");
  const id = req.params.id; // already an integer

  if (!id) return res.status(400).json({ success: false, message: "Invalid ID" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query("SELECT image FROM parent_categories WHERE id=$1 FOR UPDATE", [id]);
    if (!rows.length) { await client.query("ROLLBACK"); return res.status(404).json({ success: false, message: "Category not found" }); }

    const image = rows[0].image;
    if (!image) { await client.query("ROLLBACK"); return res.json({ success: true, message: "No image to remove" }); }

    await client.query("UPDATE parent_categories SET image=NULL, updated_at=NOW() WHERE id=$1", [id]);
    await client.query("COMMIT");

    try { await removeFile(image); } catch (err) { console.warn("Failed removing image:", err.message); }
    if (io?.emit) io.emit("categoryImageRemoved", { id });

    return res.json({ success: true, message: "Image removed" });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("removeParentCategoryImage error:", err);
    return res.status(500).json({ success: false, message: "Failed to remove image" });
  } finally {
    client.release();
  }
};

/* =========================
   GET: AJAX search
========================= */
exports.searchParentCategory = async (req, res) => {
  const q = req.query?.q?.trim();
  if (!q) return res.json([]);

  try {
    const { rows } = await pool.query(
      "SELECT id, name FROM parent_categories WHERE LOWER(name) LIKE LOWER($1) ORDER BY name ASC LIMIT 10",
      [`%${q}%`]
    );
    return res.json(rows);
  } catch (err) {
    console.error("searchParentCategory error:", err);
    return res.json([]);
  }
};
