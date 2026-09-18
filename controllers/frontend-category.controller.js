const { pool } = require("../includes/conn");

// GET: Category Menu Partial
exports.getCategoryMenu = async (req, res) => {
  try {
    // Use parameterized queries with boolean type
    const { rows: parents } = await pool.query(
      `SELECT id, name, slug
       FROM parent_categories
       WHERE status = $1
       ORDER BY display_order ASC NULLS LAST, id DESC`,
      [true] // parameterized boolean
    );

    if (!parents.length) return res.send("<p>No categories found.</p>");

    const { rows: children } = await pool.query(
      `SELECT id, parent_id, name, slug
       FROM categories
       WHERE status = $1
       ORDER BY id DESC`,
      [true] // parameterized boolean
    );

    // Map children by parent_id
    const childrenMap = children.reduce((map, child) => {
      const parentId = child.parent_id;
      if (!map[parentId]) map[parentId] = [];
      map[parentId].push({
        id: child.id,
        name: child.name,
        slug: child.slug,
      });
      return map;
    }, {});

    // Render partial inside views/partials securely
    return res.render("partials/category-menu", {
      parents: parents.map(p => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
      })),
      childrenMap,
    });

  } catch (err) {
    console.error("getCategoryMenu error:", err);
    return res.status(500).send("<p>Failed to load categories</p>");
  }
};
