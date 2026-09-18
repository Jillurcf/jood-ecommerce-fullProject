// controllers/frontend-search.controller.js
const { pool } = require("../includes/conn");

/**
 * Universal search controller
 * Searches across parent categories, categories, and products
 */
exports.getUniversalSearch = async (req, res) => {
  try {
    const qRaw = req.query.q?.trim() || "";
    if (!qRaw) return res.json({ success: true, items: [] });

    const searchTerm = `%${qRaw}%`;

    // Helper to standardize search result items
    const formatItem = (row, type) => ({
      type,
      id: row.id || null,
      name: row.name || row.brand || "Unknown",
      slug: row.slug || row.brand || null,
      brand: row.brand || null,
    });

    let items = [];

    // --- Parent Categories ---
    const parentsQuery = `
      SELECT id, name, slug
      FROM parent_categories
      WHERE status = $1 AND name ILIKE $2
      ORDER BY display_order ASC NULLS LAST
      LIMIT 5
    `;
    const parents = await pool.query(parentsQuery, [true, searchTerm]);
    items.push(...parents.rows.map(r => formatItem(r, "parent")));

    // --- Categories ---
    const categoriesQuery = `
      SELECT id, name, slug
      FROM categories
      WHERE status = $1 AND name ILIKE $2
      ORDER BY name ASC
      LIMIT 5
    `;
    const categories = await pool.query(categoriesQuery, [true, searchTerm]);
    items.push(...categories.rows.map(r => formatItem(r, "category")));

    // --- Products (search by name OR brand) ---
    // Handles text/varchar status or boolean
    // --- Products (search by name OR brand) ---
const productsQuery = `
  SELECT id, name, slug, brand
  FROM products
  WHERE status = 'published'
    AND (COALESCE(name,'') ILIKE $1 OR COALESCE(brand,'') ILIKE $1)
  ORDER BY name ASC
  LIMIT 10
`;
const products = await pool.query(productsQuery, [searchTerm]);
items.push(...products.rows.map(r => formatItem(r, "product")));

    // --- Limit total results to 10 ---
    if (items.length > 10) items = items.slice(0, 10);

    return res.json({ success: true, items });

  } catch (err) {
    console.error("Universal search error:", err);
    return res.status(500).json({
      success: false,
      items: [],
      error: "Failed to perform search",
    });
  }
};
