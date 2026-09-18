// routes/admin-products.js
'use strict';

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { pool } = require('../includes/conn');

// Controller (delegates create/update/search/getProducts etc)
const productController = require('../controllers/add-product.controller');

/* ------------------------------------------------------------------ */
/* Schema bootstrap                                                   */
/* ------------------------------------------------------------------ */

const createStmts = [
  `CREATE TABLE IF NOT EXISTS attributes (
     id SERIAL PRIMARY KEY,
     name VARCHAR(100) NOT NULL,
     slug VARCHAR(100) NOT NULL UNIQUE,
     created_at TIMESTAMP DEFAULT now()
   );`,
  `CREATE TABLE IF NOT EXISTS attribute_values (
     id SERIAL PRIMARY KEY,
     attribute_id INT NOT NULL,
     value VARCHAR(100) NOT NULL,
     slug VARCHAR(100),
     sort_order INT DEFAULT 0,
     created_at TIMESTAMP DEFAULT now(),
     CONSTRAINT fk_attribute FOREIGN KEY (attribute_id)
       REFERENCES attributes(id) ON DELETE CASCADE,
     CONSTRAINT unique_attr_value UNIQUE (attribute_id, value)
   );`,
  `CREATE TABLE IF NOT EXISTS product_variant_attributes (
     id SERIAL PRIMARY KEY,
     variant_id INT NOT NULL,
     attribute_id INT NOT NULL,
     attribute_value_id INT NOT NULL,
     created_at TIMESTAMP DEFAULT now(),
     CONSTRAINT fk_variant FOREIGN KEY (variant_id)
       REFERENCES product_variants(id) ON DELETE CASCADE,
     CONSTRAINT fk_attr FOREIGN KEY (attribute_id)
       REFERENCES attributes(id) ON DELETE CASCADE,
     CONSTRAINT fk_attr_value FOREIGN KEY (attribute_value_id)
       REFERENCES attribute_values(id) ON DELETE CASCADE,
     CONSTRAINT unique_variant_attribute UNIQUE (variant_id, attribute_id)
   );`
];

(async () => {
  try {
    for (const q of createStmts) {
      await pool.query(q);
    }

    await pool.query(`
      DO $$
      BEGIN
          IF NOT EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_name='product_variants' AND column_name='cost_price'
          ) THEN
              ALTER TABLE product_variants ADD COLUMN cost_price NUMERIC(10,2);
          END IF;

          IF NOT EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_name='product_variants' AND column_name='sale_price'
          ) THEN
              ALTER TABLE product_variants ADD COLUMN sale_price NUMERIC(10,2);
          END IF;

          IF NOT EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_name='product_variants' AND column_name='discount_type'
          ) THEN
              ALTER TABLE product_variants ADD COLUMN discount_type VARCHAR(20);
          END IF;

          IF NOT EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_name='product_variants' AND column_name='discount_value'
          ) THEN
              ALTER TABLE product_variants ADD COLUMN discount_value NUMERIC(10,2);
          END IF;

          IF NOT EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_name='product_variants' AND column_name='vat_rate'
          ) THEN
              ALTER TABLE product_variants ADD COLUMN vat_rate NUMERIC(5,2) DEFAULT 5;
          END IF;

          IF NOT EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_name='product_variants' AND column_name='vat_included'
          ) THEN
              ALTER TABLE product_variants ADD COLUMN vat_included BOOLEAN DEFAULT true;
          END IF;

          IF NOT EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_name='product_variants' AND column_name='stock'
          ) THEN
              ALTER TABLE product_variants ADD COLUMN stock INT DEFAULT 0;
          END IF;

          IF NOT EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_name='product_variants' AND column_name='low_stock_threshold'
          ) THEN
              ALTER TABLE product_variants ADD COLUMN low_stock_threshold INT DEFAULT 0;
          END IF;

          IF NOT EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_name='product_variants' AND column_name='track_inventory'
          ) THEN
              ALTER TABLE product_variants ADD COLUMN track_inventory BOOLEAN DEFAULT true;
          END IF;

          IF NOT EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_name='product_variants' AND column_name='allow_backorders'
          ) THEN
              ALTER TABLE product_variants ADD COLUMN allow_backorders BOOLEAN DEFAULT false;
          END IF;

          IF NOT EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_name='product_variants' AND column_name='barcode'
          ) THEN
              ALTER TABLE product_variants ADD COLUMN barcode VARCHAR(100);
          END IF;

          IF NOT EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_name='product_variants' AND column_name='barcode_type'
          ) THEN
              ALTER TABLE product_variants ADD COLUMN barcode_type VARCHAR(50);
          END IF;

          IF NOT EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_name='product_variants' AND column_name='weight'
          ) THEN
              ALTER TABLE product_variants ADD COLUMN weight NUMERIC(10,3);
          END IF;

          IF NOT EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_name='product_variants' AND column_name='weight_unit'
          ) THEN
              ALTER TABLE product_variants ADD COLUMN weight_unit VARCHAR(10) DEFAULT 'kg';
          END IF;

          IF NOT EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_name='product_variants' AND column_name='length'
          ) THEN
              ALTER TABLE product_variants ADD COLUMN length NUMERIC(10,2);
          END IF;

          IF NOT EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_name='product_variants' AND column_name='width'
          ) THEN
              ALTER TABLE product_variants ADD COLUMN width NUMERIC(10,2);
          END IF;

          IF NOT EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_name='product_variants' AND column_name='height'
          ) THEN
              ALTER TABLE product_variants ADD COLUMN height NUMERIC(10,2);
          END IF;

          IF NOT EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_name='product_variants' AND column_name='dimension_unit'
          ) THEN
              ALTER TABLE product_variants ADD COLUMN dimension_unit VARCHAR(10) DEFAULT 'cm';
          END IF;

          IF NOT EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_name='product_variants' AND column_name='shipping_class'
          ) THEN
              ALTER TABLE product_variants ADD COLUMN shipping_class VARCHAR(100);
          END IF;

          IF NOT EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_name='product_variants' AND column_name='is_active'
          ) THEN
              ALTER TABLE product_variants ADD COLUMN is_active BOOLEAN DEFAULT true;
          END IF;

          IF NOT EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_name='product_variants' AND column_name='is_default'
          ) THEN
              ALTER TABLE product_variants ADD COLUMN is_default BOOLEAN DEFAULT false;
          END IF;

          IF NOT EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_name='product_variants' AND column_name='sort_order'
          ) THEN
              ALTER TABLE product_variants ADD COLUMN sort_order INT DEFAULT 0;
          END IF;

          IF NOT EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_name='product_variants' AND column_name='display_name'
          ) THEN
              ALTER TABLE product_variants ADD COLUMN display_name VARCHAR(255);
          END IF;

          IF NOT EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_name='product_variants' AND column_name='created_at'
          ) THEN
              ALTER TABLE product_variants ADD COLUMN created_at TIMESTAMP DEFAULT now();
          END IF;

          IF NOT EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_name='product_variants' AND column_name='updated_at'
          ) THEN
              ALTER TABLE product_variants ADD COLUMN updated_at TIMESTAMP DEFAULT now();
          END IF;
      END
      $$;
    `);

    console.log('Product schema verified/updated');
  } catch (err) {
    console.error('Schema setup failed:', err);
  }
})();

/* ------------------------------------------------------------------ */
/* Upload directory                                                   */
/* ------------------------------------------------------------------ */

const UPLOAD_DIR = path.join(__dirname, '../public/uploads/products');
try {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
} catch (_) {
  /* ignore */
}

/* ------------------------------------------------------------------ */
/* Multer config                                                      */
/* ------------------------------------------------------------------ */

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, UPLOAD_DIR),
  filename: (_, file, cb) => {
    const ext = path.extname(file.originalname || '');
    const base = path
      .basename(file.originalname || 'file', ext)
      .replace(/\s+/g, '-')
      .replace(/[^\w\-]/g, '')
      .toLowerCase()
      .slice(0, 80);

    cb(null, `${Date.now()}-${base}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 60 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    if (!file || !file.mimetype) return cb(null, false);
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) return cb(null, true);
    return cb(new Error('Only image and video files are allowed'));
  }
});

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

function safeJSONParse(val) {
  if (val == null) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === 'object') return [val];
  if (typeof val !== 'string') return [];
  try {
    const parsed = JSON.parse(val.trim());
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return val.split(',').map((s) => s.trim()).filter(Boolean);
  }
}

function fileBasename(raw) {
  if (!raw) return null;
  try {
    return path.basename(String(raw));
  } catch {
    return null;
  }
}

function filePublicUrl(raw) {
  const b = fileBasename(raw);
  return b ? `/uploads/products/${b}` : null;
}

async function deleteFileIfExistsAsync(fullPath) {
  try {
    if (!fullPath) return;
    await fs.promises.unlink(fullPath).catch(() => {});
  } catch (err) {
    console.warn('Failed to delete file:', fullPath, err);
  }
}

function multerMiddleware(req, res, next) {
  upload.any()(req, res, (err) => {
    if (err) return next(err);
    next();
  });
}

async function cleanupOrphanAttributeValues(client) {
  await client.query(`
    DELETE FROM attribute_values av
    WHERE NOT EXISTS (
      SELECT 1 FROM product_variant_attributes pva
      WHERE pva.attribute_value_id = av.id
    )
  `);
}

async function cleanupOrphanAttributes(client) {
  await client.query(`
    DELETE FROM attributes a
    WHERE NOT EXISTS (
      SELECT 1 FROM attribute_values av
      WHERE av.attribute_id = a.id
    )
  `);
}

async function fetchProductAttributes(productId) {
  if (!productId) return [];
  const { rows } = await pool.query(
    `
    SELECT DISTINCT
      a.id,
      a.name,
      a.slug
    FROM product_variants pv
    JOIN product_variant_attributes pva ON pva.variant_id = pv.id
    JOIN attributes a ON a.id = pva.attribute_id
    WHERE pv.product_id = $1
    ORDER BY a.name ASC
    `,
    [productId]
  );
  return rows || [];
}

async function fetchProductVariants(productId) {
  if (!productId) return [];
  const variantsRes = await pool.query(
    `
    SELECT pv.*,
      COALESCE((
        SELECT json_agg(json_build_object('attribute', a.name, 'value', av.value))
        FROM product_variant_attributes pva
        JOIN attributes a ON a.id = pva.attribute_id
        JOIN attribute_values av ON av.id = pva.attribute_value_id
        WHERE pva.variant_id = pv.id
      ), '[]') AS attributes,
      COALESCE((
        SELECT json_agg(json_build_object(
          'id', vm.id,
          'filename', vm.filename,
          'originalname', vm.originalname,
          'mimetype', vm.mimetype,
          'size', vm.size
        ))
        FROM variant_media vm
        WHERE vm.variant_id = pv.id
      ), '[]') AS media
    FROM product_variants pv
    WHERE pv.product_id = $1
    ORDER BY pv.id ASC
    `,
    [productId]
  );

  return (variantsRes.rows || []).map((v) => {
    const mediaRaw = Array.isArray(v.media) ? v.media : [];
    const media = mediaRaw
      .map((m) => (m && m.filename ? {
        id: m.id || null,
        filename: fileBasename(m.filename),
        originalname: m.originalname || null,
        mimetype: m.mimetype || null,
        size: m.size || null
      } : null))
      .filter(Boolean);

    const attrs = Array.isArray(v.attributes)
      ? v.attributes.map((a) => ({ attribute: a.attribute || a.name || '', value: a.value || '' }))
      : [];

    return { ...v, media, attributes: attrs };
  });
}

/* ------------------------------------------------------------------ */
/* Routes                                                             */
/* ------------------------------------------------------------------ */

router.get('/_test', (req, res) => res.send('admin-products router OK'));

router.get('/add-product', asyncHandler(async (req, res) => {
  const [parentsRes, catsRes] = await Promise.all([
    pool.query('SELECT id, name FROM parent_categories ORDER BY name'),
    pool.query('SELECT id, name, parent_id FROM categories ORDER BY name')
  ]);

  res.render('admin/add-product', {
    parentCategories: parentsRes.rows || [],
    categories: catsRes.rows || [],
    product: {},
    productVariants: [],
    productAttributes: [],
    csrfToken: res.locals.csrfToken
  });
}));

router.get('/add-product/:id/edit', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).send('Invalid product ID');

  const [parentsRes, catsRes, prodRes] = await Promise.all([
    pool.query('SELECT id, name FROM parent_categories ORDER BY name'),
    pool.query('SELECT id, name, parent_id FROM categories ORDER BY name'),
    pool.query('SELECT * FROM products WHERE id = $1', [id])
  ]);

  if (!prodRes.rows.length) return res.status(404).render('admin/404');

  const product = prodRes.rows[0];
  product.gallery = safeJSONParse(product.gallery).map(fileBasename).filter(Boolean);
  product.product_videos = safeJSONParse(product.product_videos).map(fileBasename).filter(Boolean);
  product.variant_images = safeJSONParse(product.variant_images).map(fileBasename).filter(Boolean);

  const [productVariants, productAttributes] = await Promise.all([
    fetchProductVariants(id),
    fetchProductAttributes(id)
  ]);

  res.render('admin/add-product', {
    parentCategories: parentsRes.rows || [],
    categories: catsRes.rows || [],
    product,
    productVariants,
    productAttributes,
    csrfToken: res.locals.csrfToken
  });
}));

router.post('/add-product', multerMiddleware, asyncHandler(async (req, res, next) => {
  return productController.createOrUpdateProduct(req, res, next);
}));

router.get('/product-list', asyncHandler(async (req, res) => {
  const page = Math.max(parseInt(req.query.page || '1', 10), 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit || '50', 10), 1), 200);
  const offset = (page - 1) * limit;

  const q = await pool.query(
    `
    SELECT p.id, p.product_id, p.name, p.slug, p.status, p.main_image,
           p.display_locations, p.display_timing, p.mpn,
           pc.name AS parent_name, c.name AS category_name
    FROM products p
    LEFT JOIN parent_categories pc ON pc.id = p.parent_category_id
    LEFT JOIN categories c ON c.id = p.category_id
    ORDER BY p.id DESC
    LIMIT $1 OFFSET $2
    `,
    [limit, offset]
  );

  const rows = (q.rows || []).map((r) => ({
    ...r,
    main_image: r.main_image ? filePublicUrl(r.main_image) : null
  }));

  res.render('admin/product-list', {
    products: rows,
    pagination: { page, limit },
    csrfToken: res.locals.csrfToken
  });
}));

router.get('/product-detail/:id', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).send('Invalid product ID');

  const productRes = await pool.query(
    `
    SELECT p.*, pc.name AS parent_name, c.name AS category_name
    FROM products p
    LEFT JOIN parent_categories pc ON pc.id = p.parent_category_id
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE p.id = $1
    `,
    [id]
  );

  if (!productRes.rows.length) return res.status(404).send('Product not found');

  const product = productRes.rows[0];
  product.gallery = safeJSONParse(product.gallery).map(fileBasename).filter(Boolean);
  product.product_videos = safeJSONParse(product.product_videos).map(fileBasename).filter(Boolean);

  const variants = await fetchProductVariants(id);

  res.render('admin/product-detail', {
    product,
    variants,
    productAttributes: await fetchProductAttributes(id),
    csrfToken: res.locals.csrfToken
  });
}));

router.patch('/products/:id/status', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ success: false, message: 'Invalid ID' });

  const r = await pool.query('SELECT status FROM products WHERE id = $1', [id]);
  if (!r.rows.length) return res.status(404).json({ success: false, message: 'Not found' });

  const current = String(r.rows[0].status || '').toLowerCase();
  const nextStatus = current === 'published' ? 'draft' : 'published';

  await pool.query('UPDATE products SET status = $1, updated_at = NOW() WHERE id = $2', [nextStatus, id]);

  if (req.app && req.app.get('io')) {
    req.app.get('io').emit('productStatusUpdated', { id, status: nextStatus });
  }

  res.json({ success: true, status: nextStatus });
}));

router.delete('/products/:id', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ success: false, message: 'Invalid ID' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const productRes = await client.query(
      'SELECT id, main_image, gallery, product_videos, variant_images FROM products WHERE id = $1 FOR UPDATE',
      [id]
    );

    if (!productRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const product = productRes.rows[0];

    const varRes = await client.query(
      'SELECT id FROM product_variants WHERE product_id = $1',
      [id]
    );
    const variantIds = (varRes.rows || []).map((r) => r.id).filter(Boolean);

    if (variantIds.length) {
      const vm = await client.query(
        'SELECT filename FROM variant_media WHERE variant_id = ANY($1::int[])',
        [variantIds]
      );

      for (const row of vm.rows || []) {
        const b = fileBasename(row.filename);
        if (b) {
          await deleteFileIfExistsAsync(path.join(UPLOAD_DIR, b));
        }
      }

      await client.query('DELETE FROM variant_media WHERE variant_id = ANY($1::int[])', [variantIds]);
      await client.query('DELETE FROM product_variant_attributes WHERE variant_id = ANY($1::int[])', [variantIds]);
      await client.query('DELETE FROM product_variants WHERE product_id = $1', [id]);
    }

    const productFiles = [
      ...(safeJSONParse(product.gallery)),
      ...(safeJSONParse(product.product_videos)),
      ...(safeJSONParse(product.variant_images)),
      product.main_image
    ].filter(Boolean);

    for (const f of productFiles) {
      const b = fileBasename(f);
      if (b) {
        await deleteFileIfExistsAsync(path.join(UPLOAD_DIR, b));
      }
    }

    const deleted = await client.query('DELETE FROM products WHERE id = $1', [id]);
    if (!deleted.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    await cleanupOrphanAttributeValues(client);
    await cleanupOrphanAttributes(client);

    await client.query('COMMIT');

    if (req.app && req.app.get('io')) {
      req.app.get('io').emit('productDeleted', { id });
    }

    return res.json({ success: true, message: 'Product deleted successfully' });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Error deleting product:', err);
    return res.status(500).json({ success: false, message: 'Server error while deleting product' });
  } finally {
    client.release();
  }
}));

router.get('/products/search', (req, res) => productController.searchProduct(req, res));
router.get('/api/products', (req, res) => productController.getProducts(req, res));

module.exports = router;