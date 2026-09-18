"use strict";

const path = require("path");
const fs = require("fs").promises;
const { pool } = require("../includes/conn");
const recentProductsController = require("./recent-product.controller");

const UPLOAD_DIR = path.join(__dirname, "../public/uploads/products");
fs.mkdir(UPLOAD_DIR, { recursive: true }).catch(() => { /* ignore */ });

/* =========================================================
   MIGRATIONS
   - keeps the original tables
   - adds scope_type, product_id, variant_id to attributes
   ========================================================= */
async function runMigrations() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Original tables + new scoped attribute columns
    await client.query(`
      CREATE TABLE IF NOT EXISTS attributes (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        slug VARCHAR(100) NOT NULL,
        scope_type VARCHAR(20) NOT NULL DEFAULT 'global',
        product_id INT NULL,
        variant_id INT NULL,
        created_at TIMESTAMP DEFAULT now()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS attribute_values (
        id SERIAL PRIMARY KEY,
        attribute_id INT NOT NULL,
        value VARCHAR(100) NOT NULL,
        slug VARCHAR(100),
        sort_order INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT now(),
        CONSTRAINT fk_attribute FOREIGN KEY (attribute_id)
          REFERENCES attributes(id) ON DELETE CASCADE,
        CONSTRAINT unique_attr_value UNIQUE (attribute_id, value)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS product_variant_attributes (
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
      );
    `);

    // If your old attributes table had UNIQUE(slug), remove it so scoped rows can share the same slug.
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'attributes_slug_key'
        ) THEN
          ALTER TABLE attributes DROP CONSTRAINT attributes_slug_key;
        END IF;
      END $$;
    `);

    await client.query(`ALTER TABLE attributes ADD COLUMN IF NOT EXISTS scope_type VARCHAR(20) NOT NULL DEFAULT 'global';`);
    await client.query(`ALTER TABLE attributes ADD COLUMN IF NOT EXISTS product_id INT NULL;`);
    await client.query(`ALTER TABLE attributes ADD COLUMN IF NOT EXISTS variant_id INT NULL;`);

    // Add FKs safely; ignore duplicates if they already exist.
    await client.query(`
      DO $$
      BEGIN
        ALTER TABLE attributes
          ADD CONSTRAINT fk_attributes_product
          FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
      EXCEPTION WHEN duplicate_object THEN
        NULL;
      END $$;
    `);

    await client.query(`
      DO $$
      BEGIN
        ALTER TABLE attributes
          ADD CONSTRAINT fk_attributes_variant
          FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE;
      EXCEPTION WHEN duplicate_object THEN
        NULL;
      END $$;
    `);

    await client.query(`CREATE INDEX IF NOT EXISTS idx_attributes_scope_type ON attributes(scope_type);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_attributes_product_id ON attributes(product_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_attributes_variant_id ON attributes(variant_id);`);

    await client.query("COMMIT");
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (e) { /* ignore */ }
    console.error("migration error:", err && err.message ? err.message : err);
  } finally {
    client.release();
  }
}

runMigrations().catch(err => {
  console.error("runMigrations crashed:", err && err.message ? err.message : err);
});

/* =========================================================
   HELPERS
   ========================================================= */
const toInt = (v, d = null) => {
  if (v === undefined || v === null || v === "") return d;
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) ? n : d;
};

const toFloat = (v, d = 0) => {
  if (v === undefined || v === null || v === "") return d;
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : d;
};

const str = (v, max = 255) => {
  if (v === undefined || v === null) return "";
  return String(v).trim().slice(0, max);
};

const basename = (p) => {
  if (p === undefined || p === null || p === "") return null;
  try { return path.basename(String(p)); } catch { return null; }
};

const tryParseJSON = (s) => {
  try { return JSON.parse(s); } catch { return null; }
};

const slugify = (v) => {
  const s = str(v, 100).toLowerCase();
  return s
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
};

const normalizeScopeType = (v, fallback = "global") => {
  const s = str(v, 20).toLowerCase();
  if (s === "product" || s === "variant" || s === "global") return s;
  return fallback;
};

function normalizeLocations(loc) {
  if (!loc) return [];

  if (Array.isArray(loc)) {
    return loc.flatMap(v => {
      if (typeof v === "string" && v.trim().startsWith("[")) {
        try { return JSON.parse(v); } catch { return []; }
      }
      return v;
    }).map(v => String(v).trim()).filter(Boolean);
  }

  if (typeof loc === "string") {
    const s = loc.trim();
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) return parsed.map(v => String(v).trim()).filter(Boolean);
      if (parsed && typeof parsed === "object") loc = parsed;
    } catch {
      return s.split(",").map(x => String(x).trim()).filter(Boolean);
    }
  }

  if (typeof loc === "object") {
    const vals = Object.values(loc)
      .filter(v => (typeof v === "string" || typeof v === "number"))
      .map(v => String(v).trim())
      .filter(Boolean);
    if (vals.length) return vals;

    const keys = Object.keys(loc || {})
      .filter(k => {
        const v = loc[k];
        return v === true || v === 1 || v === "1" || v === "true" || (typeof v === "string" && String(v).trim() !== "");
      })
      .map(k => String(k).trim())
      .filter(Boolean);
    if (keys.length) return keys;
  }

  return [];
}

function normalizeTiming(t) {
  if (!t) return null;
  if (typeof t === "object") return t;
  if (typeof t === "string") {
    try { return JSON.parse(t); } catch { return null; }
  }
  return null;
}

function normalizeProductRow(row = {}) {
  if (!row) return row;
  try {
    const normalized = { ...row };
    normalized.display_locations = normalizeLocations(row.display_locations);
    const tt = normalizeTiming(row.display_timing);
    normalized.display_timing = (tt && typeof tt === "object") ? tt : {};
    normalized.has_timer = !!(normalized.display_timing && typeof normalized.display_timing === "object" && Object.keys(normalized.display_timing).length > 0);
    return normalized;
  } catch {
    return row;
  }
}

function parseFileList(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val.map(basename).filter(Boolean);
  if (typeof val === "object") {
    try {
      const arr = Object.values(val).flat();
      return arr.map(basename).filter(Boolean);
    } catch {
      return [];
    }
  }
  if (typeof val === "string") {
    const s = val.trim();
    if (!s) return [];
    const parsed = tryParseJSON(s);
    if (Array.isArray(parsed)) return parsed.map(basename).filter(Boolean);
    if (s.includes(",")) return s.split(",").map(p => basename(p.trim())).filter(Boolean);
    return [basename(s)].filter(Boolean);
  }
  return [];
}

function parseVariantMediaMap(raw) {
  const out = {};
  if (!raw) return out;

  if (typeof raw === "object") {
    for (const key of Object.keys(raw)) {
      const idx = Number(key);
      if (!Number.isFinite(idx)) continue;
      const arr = Array.isArray(raw[key]) ? raw[key] : [raw[key]];
      out[idx] = arr.map((item) => {
        if (!item) return null;
        if (typeof item === "object") {
          return {
            filename: basename(item.filename || item.file || item),
            originalname: item.originalname || null,
            mimetype: item.mimetype || null,
            size: item.size || null,
            id: item.id || null
          };
        }
        return { filename: basename(item) };
      }).filter(Boolean);
    }
    return out;
  }

  if (typeof raw === "string") {
    const s = raw.trim();
    if (!s) return out;
    const parsed = tryParseJSON(s);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parseVariantMediaMap(parsed);
    if (Array.isArray(parsed)) {
      parsed.forEach((p, i) => {
        out[i] = out[i] || [];
        out[i].push({ filename: basename(p) });
      });
      return out;
    }
    if (s.includes(",")) {
      s.split(",").map(p => p.trim()).filter(Boolean).forEach((p, i) => {
        out[i] = out[i] || [];
        out[i].push({ filename: basename(p) });
      });
      return out;
    }
    out[0] = [{ filename: basename(s) }];
    return out;
  }

  return out;
}

function normalizeAttributeItem(item) {
  if (!item) return null;

  if (typeof item === "string") {
    const parsed = tryParseJSON(item);
    if (parsed !== null) return normalizeAttributeItem(parsed);
    return null;
  }

  if (Array.isArray(item)) {
    // Support [[attribute, value], ...] style only very defensively.
    if (item.length >= 2 && typeof item[0] !== "object" && typeof item[1] !== "object") {
      return {
        attribute: str(item[0], 255),
        value: str(item[1], 255),
        scope_type: "variant",
        product_id: null,
        variant_id: null
      };
    }
    return item.map(normalizeAttributeItem).flat().filter(Boolean);
  }

  if (typeof item === "object") {
    if (item.attribute || item.name || item.key) {
      return {
        attribute: str(item.attribute || item.name || item.key, 255),
        value: str(item.value || item.v || item.val, 255),
        scope_type: normalizeScopeType(item.scope_type || item.scopeType, "variant"),
        product_id: toInt(item.product_id ?? item.productId, null),
        variant_id: toInt(item.variant_id ?? item.variantId, null)
      };
    }

    const arr = [];
    for (const k of Object.keys(item)) {
      const v = item[k];
      if (v === undefined || v === null) continue;
      arr.push({
        attribute: str(k, 255),
        value: str(v, 255),
        scope_type: "variant",
        product_id: null,
        variant_id: null
      });
    }
    return arr.length ? arr : null;
  }

  return null;
}

function parseVariantAttributes(raw) {
  const out = {};
  if (!raw) return out;

  if (typeof raw === "string") {
    const parsed = tryParseJSON(raw);
    if (parsed !== null) raw = parsed;
    else return out;
  }

  const pushNormalized = (idx, val) => {
    const normalized = normalizeAttributeItem(val);
    if (!normalized) return;
    if (!out[idx]) out[idx] = [];
    if (Array.isArray(normalized)) out[idx].push(...normalized.filter(Boolean));
    else out[idx].push(normalized);
  };

  if (Array.isArray(raw)) {
    raw.forEach((item, idx) => {
      if (item == null) return;
      pushNormalized(idx, item);
    });
    return out;
  }

  if (typeof raw === "object") {
    for (const k of Object.keys(raw)) {
      const idx = Number(k);
      if (!Number.isFinite(idx)) continue;
      pushNormalized(idx, raw[k]);
    }
    return out;
  }

  return out;
}

function buildFileMapFromInput(files = [], data = {}) {
  const map = { main_image: null, product_videos: [], variant_media: {}, other: [] };
  const fileList = Array.isArray(files)
    ? files
    : (files && typeof files === "object" ? Object.values(files).flat() : []);

  for (const f of fileList) {
    if (!f || !f.fieldname) continue;
    const field = f.fieldname;
    const filename = basename(f.filename || f.path || f.originalname || f.name);
    if (!filename) continue;

    if (field === "main_image" || field === "main_media") {
      if (!map.main_image) map.main_image = filename;
      else map.other.push({ field, filename });
      continue;
    }

    if (field.startsWith("product_videos") || field.startsWith("videos")) {
      map.product_videos.push(filename);
      continue;
    }

    let m = field.match(/^variant_media\[(\d+)\](\[\])?$/);
    if (m) {
      const idx = Number(m[1]);
      map.variant_media[idx] = map.variant_media[idx] || [];
      map.variant_media[idx].push({
        filename,
        originalname: f.originalname || null,
        mimetype: f.mimetype || null,
        size: f.size || null,
        field
      });
      continue;
    }

    m = field.match(/^variant_media[_\[]?(\d+)[\]]?$/);
    if (m) {
      const idx = Number(m[1]);
      map.variant_media[idx] = map.variant_media[idx] || [];
      map.variant_media[idx].push({
        filename,
        originalname: f.originalname || null,
        mimetype: f.mimetype || null,
        size: f.size || null,
        field
      });
      continue;
    }

    if (field === "variant_image" || field === "variant_image[]") {
      let i = 0;
      while (map.variant_media[i] && map.variant_media[i].length) i++;
      map.variant_media[i] = map.variant_media[i] || [];
      map.variant_media[i].push({
        filename,
        originalname: f.originalname || null,
        mimetype: f.mimetype || null,
        size: f.size || null
      });
      continue;
    }

    map.other.push({ field, filename, originalname: f.originalname || null });
  }

  if (!map.main_image) {
    const m = data.main_image || data.mainImage || null;
    if (m) map.main_image = basename(m);
  }

  if (!map.product_videos.length) {
    const vids = data.product_videos || data.productVideos || null;
    const parsed = parseFileList(vids);
    if (parsed.length) map.product_videos = parsed;
  }

  const vmRaw = data.variant_media_map || data.variant_media || data.variantMediaMap || data.variantMedia || null;
  const parsedVariantMap = parseVariantMediaMap(vmRaw);
  if (Object.keys(parsedVariantMap).length) {
    for (const k of Object.keys(parsedVariantMap)) {
      const idx = Number(k);
      map.variant_media[idx] = map.variant_media[idx] || [];
      parsedVariantMap[idx].forEach((itm) => {
        if (itm && itm.filename) {
          map.variant_media[idx].push({
            filename: basename(itm.filename),
            originalname: itm.originalname || null,
            mimetype: itm.mimetype || null,
            size: itm.size || null,
            id: itm.id || null
          });
        }
      });
    }
  }

  if (!Object.keys(map.variant_media).length) {
    const legacy = parseFileList(data.variantImages || data.variant_images || data.variant_image || null);
    if (legacy.length) {
      legacy.forEach((fn, i) => {
        map.variant_media[i] = map.variant_media[i] || [];
        map.variant_media[i].push({ filename: basename(fn) });
      });
    }
  }

  return map;
}

function parseDisplayFields(data = {}) {
  const out = { locations: [], timing: {} };
  const locs = [];

  if (Array.isArray(data.display_locations)) {
    for (const item of data.display_locations) {
      if (item === undefined || item === null) continue;
      if (typeof item === "string") {
        const s = item.trim();
        const parsed = tryParseJSON(s);
        if (Array.isArray(parsed)) parsed.forEach(p => { if (p != null) locs.push(String(p).trim()); });
        else if (s.includes(",")) s.split(",").map(x => x.trim()).filter(Boolean).forEach(x => locs.push(x));
        else if (s) locs.push(s);
      } else {
        locs.push(String(item));
      }
    }
  } else if (typeof data.display_locations === "string") {
    const s = data.display_locations.trim();
    if (s) {
      const parsed = tryParseJSON(s);
      if (Array.isArray(parsed)) parsed.forEach(p => { if (p != null) locs.push(String(p).trim()); });
      else if (s.includes(",")) s.split(",").map(x => x.trim()).filter(Boolean).forEach(x => locs.push(x));
      else locs.push(s);
    }
  } else if (typeof data.display_locations === "object" && data.display_locations !== null) {
    const obj = data.display_locations;
    if (Array.isArray(obj)) obj.forEach(x => { if (x != null) locs.push(String(x).trim()); });
    else {
      for (const k of Object.keys(obj)) {
        const v = obj[k];
        if (v === true || v === "true" || v === 1 || v === "1") locs.push(String(k).trim());
        else if (typeof v === "string" && String(v).trim()) locs.push(String(v).trim());
      }
    }
  }

  out.locations = Array.from(new Set(locs.filter(Boolean)));

  const allKeys = Object.keys(data || {});
  for (const k of allKeys) {
    const m = k.match(/^(start|end|priority)_(.+)$/);
    if (!m) continue;
    const kind = m[1];
    const loc = m[2];
    out.timing[loc] = out.timing[loc] || {};

    let val = data[k];
    if (Array.isArray(val)) {
      const candidate = val.find(v => v != null && String(v).trim() !== "");
      val = candidate !== undefined ? candidate : val[0];
    }

    if (kind === "priority") {
      out.timing[loc].priority = Number(val || 0);
      continue;
    }

    let s = val == null ? null : String(val);
    if (s && s.includes(",")) {
      const parts = s.split(",").map(p => p.trim()).filter(Boolean);
      s = parts.length ? parts[0] : null;
    }
    out.timing[loc][kind] = s || null;
  }

  return out;
}

/* =========================================================
   MEDIA / ATTRIBUTE HELPERS
   ========================================================= */
async function _attachVariantMedia(client, variantId, files = [], io = null) {
  if (!variantId || !Array.isArray(files) || !files.length) return [];

  const q = `
    INSERT INTO variant_media (variant_id, filename, originalname, mimetype, size, created_at)
    VALUES ($1, $2, $3, $4, $5, now())
    RETURNING id, variant_id, filename, originalname, mimetype, size
  `;

  const attached = [];
  for (const f of files) {
    const filename = basename(f.filename || f.file || "");
    if (!filename) continue;
    const originalname = f.originalname || null;
    const mimetype = f.mimetype || null;
    const size = f.size || null;

    const res = await client.query(q, [variantId, filename, originalname, mimetype, size]);
    if (res.rows && res.rows[0]) attached.push(res.rows[0]);
  }

  if (io && attached.length) {
    try { io.emit("variant_media:attached", { variantId, files: attached }); } catch { /* ignore */ }
  }

  return attached;
}

async function _updateOrAttachVariantMedia(client, variantId, mediaItems = [], io = null) {
  if (!variantId || !Array.isArray(mediaItems) || !mediaItems.length) return [];

  const attached = [];
  for (const m of mediaItems) {
    if (!m || !m.filename) continue;
    const filename = basename(m.filename);
    const originalname = m.originalname || null;
    const mimetype = m.mimetype || null;
    const size = m.size || null;

    const res = await client.query(
      "SELECT id FROM variant_media WHERE variant_id=$1 AND filename=$2 LIMIT 1",
      [variantId, filename]
    );

    let mediaId = null;
    if (res.rows.length) {
      mediaId = res.rows[0].id;
      await client.query(
        "UPDATE variant_media SET originalname=$1, mimetype=$2, size=$3 WHERE id=$4",
        [originalname, mimetype, size, mediaId]
      );
    } else {
      const insRes = await client.query(
        `INSERT INTO variant_media (variant_id, filename, originalname, mimetype, size, created_at)
         VALUES ($1,$2,$3,$4,$5, now())
         RETURNING id`,
        [variantId, filename, originalname, mimetype, size]
      );
      mediaId = insRes.rows[0].id;
    }

    attached.push({ id: mediaId, filename, originalname, mimetype, size });
  }

  if (io && attached.length) {
    try { io.emit("variant_media:attached", { variantId, files: attached }); } catch { /* ignore */ }
  }

  return attached;
}

async function ensureAttribute(client, name, opts = {}) {
  if (!name) return null;

  const sanitized = String(name).trim();
  if (!sanitized) return null;

  const slug = slugify(sanitized);
  const scopeType = normalizeScopeType(opts.scope_type || opts.scopeType || "global", "global");
  const productId = toInt(opts.product_id ?? opts.productId, null);
  const variantId = toInt(opts.variant_id ?? opts.variantId, null);

  // Scoped lookup first
  const foundRes = await client.query(
    `SELECT id FROM attributes
     WHERE slug=$1 AND scope_type=$2
       AND COALESCE(product_id, 0) = COALESCE($3, 0)
       AND COALESCE(variant_id, 0) = COALESCE($4, 0)
     LIMIT 1`,
    [slug, scopeType, productId, variantId]
  );
  if (foundRes.rows && foundRes.rows[0]) return foundRes.rows[0].id;

  const insRes = await client.query(
    `INSERT INTO attributes (name, slug, scope_type, product_id, variant_id, created_at)
     VALUES ($1, $2, $3, $4, $5, now())
     RETURNING id`,
    [sanitized, slug, scopeType, productId, variantId]
  );

  return insRes.rows && insRes.rows[0] ? insRes.rows[0].id : null;
}

async function ensureAttributeValue(client, attributeId, value) {
  if (!attributeId || value === undefined || value === null || String(value).trim() === "") return null;

  const sanitized = String(value).trim();
  const slug = slugify(sanitized);

  try {
    const sql = `
      INSERT INTO attribute_values (attribute_id, value, slug, created_at)
      VALUES ($1, $2, $3, now())
      ON CONFLICT (attribute_id, value) DO UPDATE SET slug = EXCLUDED.slug
      RETURNING id
    `;
    const res = await client.query(sql, [attributeId, sanitized, slug]);
    if (res && res.rows && res.rows[0] && res.rows[0].id) return res.rows[0].id;

    const found = (await client.query(
      "SELECT id FROM attribute_values WHERE attribute_id=$1 AND value=$2 LIMIT 1",
      [attributeId, sanitized]
    )).rows[0];
    return found ? found.id : null;
  } catch (err) {
    try {
      const found = (await client.query(
        "SELECT id FROM attribute_values WHERE attribute_id=$1 AND value=$2 LIMIT 1",
        [attributeId, sanitized]
      )).rows[0];
      if (found && found.id) return found.id;
    } catch { /* ignore */ }
    console.error("ensureAttributeValue error:", err && err.message ? err.message : err);
    return null;
  }
}

async function attachVariantAttributes(client, productId, variantId, attributes = [], io = null) {
  if (!variantId || !Array.isArray(attributes) || !attributes.length) return [];

  const attached = [];
  for (const a of attributes) {
    try {
      if (!a) continue;

      const attributeName = str(a.attribute || a.name || a.key, 255);
      const attributeValue = str(a.value || a.v || a.val, 255);
      if (!attributeName || !attributeValue) continue;

      const scopeType = normalizeScopeType(a.scope_type || a.scopeType || "variant", "variant");
      const attrProductId = toInt(a.product_id ?? a.productId, productId || null);
      const attrVariantId = toInt(a.variant_id ?? a.variantId, variantId || null);

      const attrId = await ensureAttribute(client, attributeName, {
        scope_type: scopeType,
        product_id: attrProductId,
        variant_id: attrVariantId
      });
      if (!attrId) continue;

      const valId = await ensureAttributeValue(client, attrId, attributeValue);
      if (!valId) continue;

      await client.query(
        `INSERT INTO product_variant_attributes (variant_id, attribute_id, attribute_value_id, created_at)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (variant_id, attribute_id)
         DO UPDATE SET attribute_value_id = EXCLUDED.attribute_value_id, created_at = EXCLUDED.created_at`,
        [variantId, attrId, valId]
      );

      attached.push({
        variantId,
        productId,
        attribute: attributeName,
        value: attributeValue,
        scope_type: scopeType,
        attribute_id: attrId,
        attribute_value_id: valId,
        product_id: attrProductId,
        variant_id: attrVariantId
      });
    } catch (err) {
      console.error("attachVariantAttributes error:", err && err.message ? err.message : err);
      throw err;
    }
  }

  if (io && attached.length) {
    try { io.emit("variant_attributes:attached", { variantId, attributes: attached }); } catch { /* ignore */ }
  }

  return attached;
}

/* =========================================================
   VARIANT SYNC
   ========================================================= */
async function _syncVariantsForProduct_incrementOnly(client, productId, data = {}, fileMap = {}, io = null) {
  const names = Array.isArray(data.variant_name) ? data.variant_name : (data.variant_name ? [data.variant_name] : []);
  const skus = Array.isArray(data.variant_sku) ? data.variant_sku : (data.variant_sku ? [data.variant_sku] : []);
  const prices = Array.isArray(data.variant_price) ? data.variant_price : (data.variant_price ? [data.variant_price] : []);
  const stocks = Array.isArray(data.variant_stock) ? data.variant_stock : (data.variant_stock ? [data.variant_stock] : []);
  const ids = Array.isArray(data.variant_id) ? data.variant_id : (data.variant_id ? [data.variant_id] : []);
  const costPrices = Array.isArray(data.variant_cost_price) ? data.variant_cost_price : (data.variant_cost_price ? [data.variant_cost_price] : []);
  const salePrices = Array.isArray(data.variant_sale_price) ? data.variant_sale_price : (data.variant_sale_price ? [data.variant_sale_price] : []);
  const discountTypes = Array.isArray(data.variant_discount_type) ? data.variant_discount_type : (data.variant_discount_type ? [data.variant_discount_type] : []);
  const discountValues = Array.isArray(data.variant_discount_value) ? data.variant_discount_value : (data.variant_discount_value ? [data.variant_discount_value] : []);
  const vatRates = Array.isArray(data.variant_vat_rate) ? data.variant_vat_rate : (data.variant_vat_rate ? [data.variant_vat_rate] : []);
  const vatIncludeds = Array.isArray(data.variant_vat_included) ? data.variant_vat_included : (data.variant_vat_included ? [data.variant_vat_included] : []);
  const lengths = Array.isArray(data.variant_length) ? data.variant_length : (data.variant_length ? [data.variant_length] : []);
  const widths = Array.isArray(data.variant_width) ? data.variant_width : (data.variant_width ? [data.variant_width] : []);
  const heights = Array.isArray(data.variant_height) ? data.variant_height : (data.variant_height ? [data.variant_height] : []);
  const weights = Array.isArray(data.variant_weight) ? data.variant_weight : (data.variant_weight ? [data.variant_weight] : []);
  const weightUnits = Array.isArray(data.variant_weight_unit) ? data.variant_weight_unit : (data.variant_weight_unit ? [data.variant_weight_unit] : []);
  const dimensionUnits = Array.isArray(data.variant_dimension_unit) ? data.variant_dimension_unit : (data.variant_dimension_unit ? [data.variant_dimension_unit] : []);
  const shippingClasses = Array.isArray(data.variant_shipping_class) ? data.variant_shipping_class : (data.variant_shipping_class ? [data.variant_shipping_class] : []);
  const barcodes = Array.isArray(data.variant_barcode) ? data.variant_barcode : (data.variant_barcode ? [data.variant_barcode] : []);
  const barcodeTypes = Array.isArray(data.variant_barcode_type) ? data.variant_barcode_type : (data.variant_barcode_type ? [data.variant_barcode_type] : []);
  const lowStockThresholds = Array.isArray(data.variant_low_stock_threshold) ? data.variant_low_stock_threshold : (data.variant_low_stock_threshold ? [data.variant_low_stock_threshold] : []);
  const trackInventoryArr = Array.isArray(data.variant_track_inventory) ? data.variant_track_inventory : (data.variant_track_inventory ? [data.variant_track_inventory] : []);
  const allowBackordersArr = Array.isArray(data.variant_allow_backorders) ? data.variant_allow_backorders : (data.variant_allow_backorders ? [data.variant_allow_backorders] : []);
  const sortOrders = Array.isArray(data.variant_sort_order) ? data.variant_sort_order : (data.variant_sort_order ? [data.variant_sort_order] : []);
  const displayNames = Array.isArray(data.variant_display_name) ? data.variant_display_name : (data.variant_display_name ? [data.variant_display_name] : []);
  const isActiveArr = Array.isArray(data.variant_is_active) ? data.variant_is_active : (data.variant_is_active ? [data.variant_is_active] : []);
  const isDefaultArr = Array.isArray(data.variant_is_default) ? data.variant_is_default : (data.variant_is_default ? [data.variant_is_default] : []);

  const existingRes = await client.query(
    `SELECT id, sku, stock, name, price, cost_price, sale_price, discount_type, discount_value,
            vat_rate, vat_included, low_stock_threshold, track_inventory, allow_backorders,
            barcode, barcode_type, weight, weight_unit, length, width, height,
            dimension_unit, shipping_class, is_active, is_default, sort_order, display_name
     FROM product_variants WHERE product_id=$1`,
    [productId]
  );

  const existing = existingRes.rows || [];
  const byId = {};
  const bySku = {};
  existing.forEach(r => {
    if (r && r.id) byId[String(r.id)] = r;
    if (r && r.sku) bySku[String(r.sku)] = r;
  });

  const variantAttributesMap = parseVariantAttributes(data.variant_attributes || data.variantAttributes || data.variant_attributes_map || null) || {};
  const fmVariantMedia = (fileMap && fileMap.variant_media) ? fileMap.variant_media : {};
  const attrMapCount = Math.max(0, ...Object.keys(variantAttributesMap).map(k => Number(k) + 1).filter(n => Number.isFinite(n)));
  const fmCount = Math.max(0, ...Object.keys(fmVariantMedia).map(k => Number(k) + 1).filter(n => Number.isFinite(n)));

  const count = Math.max(
    names.length, skus.length, prices.length, stocks.length, ids.length,
    costPrices.length, salePrices.length, lengths.length, widths.length, heights.length,
    weights.length, shippingClasses.length, attrMapCount, fmCount
  );

  for (let i = 0; i < count; i++) {
    try {
      const rawId = ids[i];
      const id = rawId ? Number(rawId) : null;
      const name = names[i] !== undefined ? str(names[i], 255) : null;
      const sku = skus[i] !== undefined ? str(skus[i], 128) : null;
      const price = prices[i] !== undefined && prices[i] !== "" ? toFloat(prices[i], null) : null;
      const inc = toInt(stocks[i], 0);
      const cost_price = costPrices[i] !== undefined && costPrices[i] !== "" ? toFloat(costPrices[i], null) : null;
      const sale_price = salePrices[i] !== undefined && salePrices[i] !== "" ? toFloat(salePrices[i], null) : null;
      const discount_type = discountTypes[i] !== undefined ? String(discountTypes[i]) : null;
      const discount_value = discountValues[i] !== undefined && discountValues[i] !== "" ? toFloat(discountValues[i], null) : null;
      const vat_rate = vatRates[i] !== undefined && vatRates[i] !== "" ? toFloat(vatRates[i], null) : null;
      const vat_included = vatIncludeds[i] !== undefined ? (String(vatIncludeds[i]) === 'true' || vatIncludeds[i] === true) : null;
      const length = lengths[i] !== undefined && lengths[i] !== "" ? toFloat(lengths[i], null) : null;
      const width = widths[i] !== undefined && widths[i] !== "" ? toFloat(widths[i], null) : null;
      const height = heights[i] !== undefined && heights[i] !== "" ? toFloat(heights[i], null) : null;
      const weight = weights[i] !== undefined && weights[i] !== "" ? toFloat(weights[i], null) : null;
      const weight_unit = weightUnits[i] !== undefined ? String(weightUnits[i]) : null;
      const dimension_unit = dimensionUnits[i] !== undefined ? String(dimensionUnits[i]) : null;
      const shipping_class = shippingClasses[i] !== undefined ? str(shippingClasses[i], 64) : null;
      const barcode = barcodes[i] !== undefined ? str(barcodes[i], 100) : null;
      const barcode_type = barcodeTypes[i] !== undefined ? str(barcodeTypes[i], 50) : null;
      const low_stock_threshold = toInt(lowStockThresholds[i], null);
      const track_inventory = trackInventoryArr[i] !== undefined ? (String(trackInventoryArr[i]) === 'true' || trackInventoryArr[i] === true) : null;
      const allow_backorders = allowBackordersArr[i] !== undefined ? (String(allowBackordersArr[i]) === 'true' || allowBackordersArr[i] === true) : null;
      const sort_order = toInt(sortOrders[i], 0);
      const display_name = displayNames[i] !== undefined ? str(displayNames[i], 255) : null;
      const is_active = isActiveArr[i] !== undefined ? (String(isActiveArr[i]) === 'true' || isActiveArr[i] === true) : null;
      const is_default = isDefaultArr[i] !== undefined ? (String(isDefaultArr[i]) === 'true' || isDefaultArr[i] === true) : null;

      const mediaForIndex = fmVariantMedia[i] || [];
      const normalizedMedia = (mediaForIndex || []).map(m => {
        if (!m) return null;
        if (typeof m === "string") return { filename: basename(m), originalname: null, mimetype: null, size: null };
        return {
          filename: basename(m.filename || m.file || ""),
          originalname: m.originalname || null,
          mimetype: m.mimetype || null,
          size: m.size || null
        };
      }).filter(Boolean);

      let targetId = null;
      let existingVariant = null;
      if (id && byId[String(id)]) {
        existingVariant = byId[String(id)];
        targetId = existingVariant.id;
      }
      if (!targetId && sku && bySku[String(sku)]) {
        existingVariant = bySku[String(sku)];
        targetId = existingVariant.id;
      }

      const attributesForIndex = Array.isArray(variantAttributesMap[i]) ? variantAttributesMap[i] : [];

      const rawInputs = [
        names[i], skus[i], prices[i], stocks[i], costPrices[i], salePrices[i],
        discountTypes[i], discountValues[i], vatRates[i], vatIncludeds[i],
        lengths[i], widths[i], heights[i], weights[i], shippingClasses[i],
        barcodes[i], barcodeTypes[i], lowStockThresholds[i],
        trackInventoryArr[i], allowBackordersArr[i],
        sortOrders[i], displayNames[i], isActiveArr[i], isDefaultArr[i]
      ];

      const hasRaw = rawInputs.some(x => x !== undefined && x !== null && String(x).trim() !== "");
      const hasMedia = Array.isArray(normalizedMedia) && normalizedMedia.length > 0;
      const hasAttributes = Array.isArray(attributesForIndex) && attributesForIndex.length > 0;
      if (!hasRaw && !hasMedia && !hasAttributes) continue;

      if (targetId) {
        const currentStock = Number(existingVariant.stock) || 0;
        const newStock = currentStock + (Number(inc) || 0);

        await client.query(
          `UPDATE product_variants SET
             name = COALESCE(NULLIF($1, ''), name),
             sku = COALESCE(NULLIF($2, ''), sku),
             price = COALESCE($3::numeric, price),
             cost_price = COALESCE($4::numeric, cost_price),
             sale_price = COALESCE($5::numeric, sale_price),
             discount_type = COALESCE(NULLIF($6,''), discount_type),
             discount_value = COALESCE($7::numeric, discount_value),
             vat_rate = COALESCE($8::numeric, vat_rate),
             vat_included = COALESCE($9::boolean, vat_included),
             length = COALESCE($10::numeric, length),
             width = COALESCE($11::numeric, width),
             height = COALESCE($12::numeric, height),
             weight = COALESCE($13::numeric, weight),
             weight_unit = COALESCE(NULLIF($14,''), weight_unit),
             dimension_unit = COALESCE(NULLIF($15,''), dimension_unit),
             shipping_class = COALESCE(NULLIF($16,''), shipping_class),
             barcode = COALESCE(NULLIF($17,''), barcode),
             barcode_type = COALESCE(NULLIF($18,''), barcode_type),
             low_stock_threshold = COALESCE($19::int, low_stock_threshold),
             track_inventory = COALESCE($20::boolean, track_inventory),
             allow_backorders = COALESCE($21::boolean, allow_backorders),
             is_active = COALESCE($22::boolean, is_active),
             is_default = COALESCE($23::boolean, is_default),
             sort_order = COALESCE($24::int, sort_order),
             display_name = COALESCE(NULLIF($25,''), display_name),
             stock = $26::int,
             updated_at = now()
           WHERE id = $27`,
          [
            name, sku, price, cost_price, sale_price, discount_type, discount_value, vat_rate, vat_included,
            length, width, height, weight, weight_unit, dimension_unit, shipping_class,
            barcode, barcode_type, low_stock_threshold, track_inventory, allow_backorders,
            is_active, is_default, sort_order, display_name, newStock, targetId
          ]
        );

        if (normalizedMedia.length) {
          await _updateOrAttachVariantMedia(client, targetId, normalizedMedia, io);
        }

        if (attributesForIndex.length) {
          await attachVariantAttributes(client, productId, targetId, attributesForIndex, io);
        }

        if (io) {
          try { io.emit("variant:updated", { productId, variantId: targetId, fields: { price: price, stock: newStock } }); } catch { /* ignore */ }
        }
        continue;
      }

      const insQ = `INSERT INTO product_variants
        (product_id, name, sku, price, stock, cost_price, sale_price, discount_type, discount_value,
         vat_rate, vat_included, low_stock_threshold, track_inventory, allow_backorders,
         barcode, barcode_type, weight, weight_unit, length, width, height, dimension_unit,
         shipping_class, is_active, is_default, sort_order, display_name, created_at, updated_at)
        VALUES
        ($1,$2,$3,$4::numeric,$5::integer,$6::numeric,$7::numeric,$8,$9::numeric,
         $10::numeric,$11::boolean,$12::int,$13::boolean,$14::boolean,
         $15,$16,$17::numeric,$18,$19::numeric,$20::numeric,$21::numeric,$22,
         $23,$24,$25,$26,$27, now(), now())
        RETURNING *`;

      const insVals = [
        productId, name, sku, price, inc != null ? inc : 0, cost_price, sale_price, discount_type,
        discount_value, vat_rate, vat_included, low_stock_threshold, track_inventory, allow_backorders,
        barcode, barcode_type, weight, weight_unit, length, width, height, dimension_unit,
        shipping_class, is_active, is_default, sort_order, display_name
      ];

      const insRes = await client.query(insQ, insVals);
      const newVariant = insRes.rows[0];

      if (normalizedMedia.length) {
        try { await _attachVariantMedia(client, newVariant.id, normalizedMedia, io); } catch (e) { console.warn("attachVariantMedia (insert) failed:", e && e.message ? e.message : e); }
      }

      if (attributesForIndex.length) {
        try { await attachVariantAttributes(client, productId, newVariant.id, attributesForIndex, io); } catch (e) { console.warn("attachVariantAttributes (insert) failed:", e && e.message ? e.message : e); }
      }

      if (io) {
        try { io.emit("variant:created", { productId, variant: newVariant }); } catch { /* ignore */ }
      }
    } catch (err) {
      console.error("Error processing variant index", i, err && err.message ? err.message : err);
      continue;
    }
  }
}

async function _syncVariantsForProduct(client, productId, data = {}, fileMap = {}, mode = "increment", io = null) {
  mode = String(mode || "increment").toLowerCase();
  if (mode === "create") mode = "merge";
  if (mode === "update") mode = "merge";
  if (mode === "imagesonly") mode = "increment";
  return _syncVariantsForProduct_incrementOnly(client, productId, data, fileMap, io);
}

/* =========================================================
   SAVE PRODUCT
   ========================================================= */
async function saveProductToDB(data = {}, fileMap = null, options = {}) {
  const io = options && options.io ? options.io : null;
  const client = await pool.connect();

  try {
    const fm = (fileMap && typeof fileMap === "object") ? fileMap : buildFileMapFromInput([], data);
    const main_image = fm.main_image ? basename(fm.main_image) : (data.main_image ? basename(data.main_image) : null);
    const productVideos = Array.isArray(fm.product_videos) && fm.product_videos.length
      ? fm.product_videos.map(basename).filter(Boolean)
      : parseFileList(data.product_videos || data.productVideos);
    const { locations: displayLocationsArr, timing: displayTimingMap } = parseDisplayFields(data);

    await client.query("BEGIN");

    let productIdFromBody = toInt(data.id, null);
    let productCodeFromBody = data.product_id ? String(data.product_id).trim() : null;
    const imagesOnly = !!(options.imagesOnly || data.images_only === "1" || data.images_only === "true" || data.images_only === true);
    if (imagesOnly && !productIdFromBody) throw new Error("images_only operation requires an existing product id");

    let existingProduct = null;
    if (productIdFromBody) {
      const r = await client.query("SELECT * FROM products WHERE id=$1 FOR UPDATE", [productIdFromBody]);
      if (r.rows.length) existingProduct = r.rows[0];
    }
    if (!existingProduct && productCodeFromBody) {
      const r = await client.query("SELECT * FROM products WHERE product_id=$1 FOR UPDATE", [productCodeFromBody]);
      if (r.rows.length) {
        existingProduct = r.rows[0];
        productIdFromBody = existingProduct.id;
      }
    }

    if (imagesOnly) {
      if (!existingProduct) throw new Error("Product not found for images-only update");

      const variantsRes = await client.query("SELECT id FROM product_variants WHERE product_id=$1 ORDER BY id ASC", [existingProduct.id]);
      const variantRows = variantsRes.rows || [];

      const removeMain = data.remove_main_image === "1" || data.remove_main_image === "true" || data.remove_main_image === true;
      if (removeMain && existingProduct.main_image) {
        const mainFile = basename(existingProduct.main_image);
        try {
          const full = path.resolve(path.join(UPLOAD_DIR, mainFile));
          if (full.startsWith(path.resolve(UPLOAD_DIR))) await fs.unlink(full).catch(() => { });
        } catch { /* ignore */ }
      }

      const finalMainImage = fm.main_image ? fm.main_image : (removeMain ? null : existingProduct.main_image);

      const updateRes = await client.query(
        `UPDATE products
           SET main_image=$1,
               product_videos = COALESCE($2::jsonb, product_videos),
               updated_at=now()
         WHERE id=$3 RETURNING *`,
        [finalMainImage, (productVideos && productVideos.length) ? JSON.stringify(productVideos) : null, existingProduct.id]
      );
      const updatedProduct = updateRes.rows[0];

      // Replace selected variant media rows if requested
      const replaceIndicesRaw = data.replace_variant_media_indices || data.replace_variant_media_index || null;
      const replaceIndices = Array.isArray(replaceIndicesRaw)
        ? replaceIndicesRaw.map(Number).filter(n => Number.isFinite(n))
        : (replaceIndicesRaw !== null && replaceIndicesRaw !== undefined && replaceIndicesRaw !== ""
          ? [Number(replaceIndicesRaw)].filter(n => Number.isFinite(n))
          : []);

      if (replaceIndices.length) {
        for (const idx of replaceIndices) {
          const targetVariant = variantRows[idx] || null;
          if (!targetVariant) continue;

          const rowsToDelete = (await client.query("SELECT id, filename FROM variant_media WHERE variant_id=$1", [targetVariant.id])).rows || [];
          for (const r of rowsToDelete) {
            try {
              const full = path.resolve(path.join(UPLOAD_DIR, basename(r.filename)));
              if (full.startsWith(path.resolve(UPLOAD_DIR))) await fs.unlink(full).catch(() => {});
            } catch { /* ignore */ }
          }
          const ids = rowsToDelete.map(r => r.id).filter(Boolean);
          if (ids.length) await client.query("DELETE FROM variant_media WHERE id = ANY($1::int[])", [ids]);
          if (io) try { io.emit("variant_media:deleted", { variantId: targetVariant.id, ids }); } catch { /* ignore */ }
        }
      }

      const fmVariantMedia = fm.variant_media || {};
      const fmIndices = Object.keys(fmVariantMedia).map(k => Number(k)).filter(n => Number.isFinite(n));
      for (const idx of fmIndices) {
        const filesForIdx = Array.isArray(fmVariantMedia[idx]) ? fmVariantMedia[idx] : [];
        if (!filesForIdx.length) continue;
        const targetVariant = variantRows[idx] || null;
        if (!targetVariant) continue;
        const attached = await _attachVariantMedia(client, targetVariant.id, filesForIdx, io);
        if (io && attached.length) {
          try { io.emit("variant_media:attached", { variantId: targetVariant.id, files: attached }); } catch { /* ignore */ }
        }
      }

      if (Array.isArray(data.removed_variant_media_ids) && data.removed_variant_media_ids.length) {
        const rm = data.removed_variant_media_ids.map(Number).filter(Boolean);
        if (rm.length) {
          const rows = (await client.query("SELECT id, filename FROM variant_media WHERE id = ANY($1::int[])", [rm])).rows || [];
          for (const r of rows) {
            try {
              const full = path.resolve(path.join(UPLOAD_DIR, basename(r.filename)));
              if (full.startsWith(path.resolve(UPLOAD_DIR))) await fs.unlink(full).catch(() => { });
            } catch { /* ignore */ }
          }
          await client.query("DELETE FROM variant_media WHERE id = ANY($1::int[])", [rm]);
          if (io) { try { io.emit("variant_media:deleted", { ids: rm }); } catch { /* ignore */ } }
        }
      }

      await client.query("COMMIT");
      const prodRes = await client.query("SELECT * FROM products WHERE id=$1", [existingProduct.id]);
      const updatedNormalized = normalizeProductRow(prodRes.rows[0]);

      if (io) {
        try { io.emit("product:updated", updatedNormalized); } catch { /* ignore */ }
        try { await recentProductsController.emitProductUpdated(io, existingProduct.id, null); } catch { /* ignore */ }
        try { await recentProductsController.emitRecentProductsUpdate(io); } catch { /* ignore */ }
      }

      return updatedNormalized;
    }

    const name = str(data.name || data.product_name, 255);
    if (!existingProduct && !name) throw new Error("Product name is required");
    const editMode = (options.editMode || data.editMode || "increment").toString();

    if (productIdFromBody) {
      const existingRes = await client.query("SELECT * FROM products WHERE id=$1 FOR UPDATE", [productIdFromBody]);
      if (!existingRes.rows.length) throw new Error("Product not found for update");
      const existing = existingRes.rows[0];

      if (editMode === "overwrite") {
        const updateQ = `UPDATE products SET
          name = $1, slug = $2, product_type = $3, brand = $4, mpn = $5, bullets = $6, description = $7,
          parent_category_id = $8, category_id = $9, short_description = $10, visibility = $11,
          meta_keywords = $12, meta_title = $13, meta_description = $14,
          main_image = $15, product_videos = $16::jsonb,
          display_locations = $17::jsonb, display_timing = $18::jsonb,
          updated_at = now()
        WHERE id = $19 RETURNING *`;

        const vals = [
          name,
          str(data.slug, 255),
          str(data.product_type, 32) || "simple",
          str(data.brand, 128),
          str(data.mpn, 128) || null,
          str(data.bullets, 2000),
          data.description || null,
          toInt(data.parent_category_id, null),
          toInt(data.category_id, null),
          str(data.short_description, 1000),
          str(data.visibility, 32) || "search",
          str(data.meta_keywords, 512),
          str(data.meta_title, 70),
          str(data.meta_description, 320),
          main_image,
          productVideos.length ? JSON.stringify(productVideos) : null,
          displayLocationsArr.length ? JSON.stringify(displayLocationsArr) : JSON.stringify([]),
          Object.keys(displayTimingMap).length ? JSON.stringify(displayTimingMap) : JSON.stringify({}),
          existing.id
        ];

        const updatedRes = await client.query(updateQ, vals);
        const updatedProduct = updatedRes.rows[0];
        await _syncVariantsForProduct(client, updatedProduct.id, data, { variant_media: fm.variant_media || {} }, editMode, io);
        await client.query("COMMIT");

        const normalized = normalizeProductRow(updatedProduct);
        if (io) {
          try { io.emit("product:updated", normalized); } catch { /* ignore */ }
          try { await recentProductsController.emitProductUpdated(io, updatedProduct.id, null); } catch { /* ignore */ }
          try { await recentProductsController.emitRecentProductsUpdate(io); } catch { /* ignore */ }
        }
        return normalized;
      }

      if (editMode === "merge") {
        const updateQ = `UPDATE products SET
            name=$1,
            slug=COALESCE(NULLIF($2,''), slug),
            mpn=COALESCE(NULLIF($3,''), mpn),
            meta_title=COALESCE(NULLIF($4,''), meta_title),
            meta_description=COALESCE(NULLIF($5,''), meta_description),
            main_image=COALESCE(NULLIF($6,''), main_image),
            product_videos = COALESCE($7::jsonb, product_videos),
            display_locations = $8::jsonb,
            display_timing = $9::jsonb,
            updated_at=now()
          WHERE id=$10 RETURNING *`;

        const vals = [
          name,
          str(data.slug, 255),
          str(data.mpn, 128) || null,
          str(data.meta_title, 70),
          str(data.meta_description, 320),
          main_image,
          productVideos.length ? JSON.stringify(productVideos) : null,
          displayLocationsArr.length ? JSON.stringify(displayLocationsArr) : null,
          Object.keys(displayTimingMap).length ? JSON.stringify(displayTimingMap) : null,
          existing.id
        ];

        const updatedRes = await client.query(updateQ, vals);
        const updatedProduct = updatedRes.rows[0];
        await _syncVariantsForProduct(client, updatedProduct.id, data, { variant_media: fm.variant_media || {} }, editMode, io);
        await client.query("COMMIT");

        const normalized = normalizeProductRow(updatedProduct);
        if (io) {
          try { io.emit("product:updated", normalized); } catch { /* ignore */ }
          try { await recentProductsController.emitProductUpdated(io, updatedProduct.id, null); } catch { /* ignore */ }
          try { await recentProductsController.emitRecentProductsUpdate(io); } catch { /* ignore */ }
        }
        return normalized;
      }

      const upd = await client.query(
        `UPDATE products SET display_locations = COALESCE($1::jsonb, display_locations), display_timing = COALESCE($2::jsonb, display_timing), updated_at=now() WHERE id=$3 RETURNING *`,
        [displayLocationsArr.length ? JSON.stringify(displayLocationsArr) : null, Object.keys(displayTimingMap).length ? JSON.stringify(displayTimingMap) : null, existing.id]
      );
      const updatedProduct = upd.rows[0];
      await _syncVariantsForProduct(client, existing.id, data, { variant_media: fm.variant_media || {} }, "increment", io);
      await client.query("COMMIT");

      const normalized = normalizeProductRow(updatedProduct);
      if (io) {
        try { io.emit("product:updated", normalized); } catch { /* ignore */ }
        try { await recentProductsController.emitProductUpdated(io, updatedProduct.id, null); } catch { /* ignore */ }
        try { await recentProductsController.emitRecentProductsUpdate(io); } catch { /* ignore */ }
      }
      return normalized;
    }

    // create new product
    const insertQ = `INSERT INTO products (
        name, slug, product_type, brand, mpn, bullets, description,
        parent_category_id, category_id, short_description, visibility,
        meta_keywords, meta_title, meta_description, main_image, product_videos,
        display_locations, display_timing, created_at, updated_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,
        $8,$9,$10,$11,
        $12,$13,$14,$15,$16,
        $17,$18, now(), now()
      ) RETURNING id`;

    const insertVals = [
      name,
      str(data.slug, 255),
      str(data.product_type, 32) || "simple",
      str(data.brand, 128),
      str(data.mpn, 128) || null,
      str(data.bullets, 2000),
      data.description || null,
      toInt(data.parent_category_id, null),
      toInt(data.category_id, null),
      str(data.short_description, 1000),
      str(data.visibility, 32) || "search",
      str(data.meta_keywords, 512),
      str(data.meta_title, 70),
      str(data.meta_description, 320),
      main_image,
      productVideos.length ? JSON.stringify(productVideos) : null,
      displayLocationsArr.length ? JSON.stringify(displayLocationsArr) : JSON.stringify([]),
      Object.keys(displayTimingMap).length ? JSON.stringify(displayTimingMap) : JSON.stringify({})
    ];

    const insertRes = await client.query(insertQ, insertVals);
    const insertedId = insertRes.rows[0].id;
    const prodId = "PROD" + String(insertedId).padStart(6, "0");
    const updRes = await client.query("UPDATE products SET product_id=$1 WHERE id=$2 RETURNING *", [prodId, insertedId]);
    const product = updRes.rows[0];

    await _syncVariantsForProduct(client, product.id, data, { variant_media: fm.variant_media || {} }, editMode, io);
    await client.query("COMMIT");

    const normalized = normalizeProductRow(product);
    if (io) {
      try { io.emit("product:created", normalized); } catch { /* ignore */ }
      try { await recentProductsController.emitProductAdded(io, product.id, null); } catch { /* ignore */ }
      try { await recentProductsController.emitRecentProductsUpdate(io); } catch { /* ignore */ }
    }
    return normalized;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => { });
    console.error("saveProductToDB error:", err && err.message ? err.message : err);
    throw err;
  } finally {
    client.release();
  }
}

/* =========================================================
   CONTROLLERS
   ========================================================= */
exports.createOrUpdateProduct = async (req, res) => {
  try {
    const io = (req && req.app && req.app.get) ? req.app.get("io") : null;
    let files = [];
    if (Array.isArray(req.files)) files = req.files;
    else if (req.files && typeof req.files === "object") files = Object.values(req.files).flat();
    const fileMap = buildFileMapFromInput(files, req.body || {});
    const editMode = (req.body && req.body.editMode) ? req.body.editMode : undefined;
    const imagesOnly = !!(req.body && (req.body.images_only === "1" || req.body.images_only === "true" || req.body.images_only === true));
    const product = await exports.saveProductToDB(req.body || {}, fileMap, { editMode, imagesOnly, io });
    return res.json({ success: true, product });
  } catch (e) {
    console.error("createOrUpdateProduct:", e && e.message ? e.message : e);
    return res.status(500).json({ success: false, message: e && e.message ? e.message : "Server error" });
  }
};

exports.getProducts = async (req, res) => {
  try {
    const page = Math.max(toInt(req.query.page, 1), 1);
    const limit = Math.min(toInt(req.query.limit, 20), 200);
    const offset = (page - 1) * limit;

    const [dataRes, countRes] = await Promise.all([
      pool.query(
        "SELECT id, product_id, name, slug, mpn, main_image, display_locations, display_timing, created_at FROM products ORDER BY id DESC LIMIT $1 OFFSET $2",
        [limit, offset]
      ),
      pool.query("SELECT COUNT(*)::int as total FROM products")
    ]);

    const products = (dataRes.rows || []).map(normalizeProductRow);
    return res.json({
      success: true,
      products,
      pagination: {
        page,
        limit,
        total: countRes.rows[0].total,
        totalPages: Math.ceil(countRes.rows[0].total / limit)
      }
    });
  } catch (e) {
    console.error("getProducts:", e && e.message ? e.message : e);
    return res.status(500).json({ success: false, message: e && e.message ? e.message : "Server error" });
  }
};

exports.getProductById = async (req, res) => {
  try {
    const id = toInt(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: "Invalid id" });

    const prodRes = await pool.query("SELECT * FROM products WHERE id=$1", [id]);
    if (!prodRes.rows.length) return res.status(404).json({ success: false, message: "Product not found" });

    const product = normalizeProductRow(prodRes.rows[0]);

    const variantsRes = await pool.query(
      `SELECT id, sku, stock, name, price, cost_price, sale_price, discount_type, discount_value,
              vat_rate, vat_included, low_stock_threshold, track_inventory, allow_backorders,
              barcode, barcode_type, weight, weight_unit, length, width, height, dimension_unit,
              shipping_class, is_active, is_default, sort_order, display_name
       FROM product_variants WHERE product_id=$1 ORDER BY id ASC`,
      [id]
    );

    const variants = variantsRes.rows || [];
    const variantIds = variants.map(v => v.id).filter(Boolean);

    const variantMediaMap = {};
    if (variantIds.length) {
      const vmRes = await pool.query(
        "SELECT variant_id, id, filename, originalname, mimetype, size FROM variant_media WHERE variant_id = ANY($1::int[]) ORDER BY id ASC",
        [variantIds]
      );
      vmRes.rows.forEach(r => {
        variantMediaMap[r.variant_id] = variantMediaMap[r.variant_id] || [];
        variantMediaMap[r.variant_id].push({
          id: r.id,
          filename: r.filename,
          originalname: r.originalname,
          mimetype: r.mimetype,
          size: r.size
        });
      });
    }

    const variantAttributesMap = {};
    if (variantIds.length) {
      const vaRes = await pool.query(
        `SELECT pva.variant_id,
                a.name as attribute_name,
                av.value as attribute_value,
                a.scope_type,
                a.product_id,
                a.variant_id as attribute_variant_id
         FROM product_variant_attributes pva
         JOIN attributes a ON a.id = pva.attribute_id
         JOIN attribute_values av ON av.id = pva.attribute_value_id
         WHERE pva.variant_id = ANY($1::int[])
         ORDER BY pva.id ASC`,
        [variantIds]
      );
      vaRes.rows.forEach(r => {
        variantAttributesMap[r.variant_id] = variantAttributesMap[r.variant_id] || [];
        variantAttributesMap[r.variant_id].push({
          attribute: r.attribute_name,
          value: r.attribute_value,
          scope_type: r.scope_type,
          product_id: r.product_id,
          variant_id: r.attribute_variant_id
        });
      });
    }

    const variantsWithMedia = variants.map(v => ({
      ...v,
      media: variantMediaMap[v.id] || [],
      attributes: variantAttributesMap[v.id] || []
    }));

    return res.json({ success: true, product, variants: variantsWithMedia });
  } catch (e) {
    console.error("getProductById:", e && e.message ? e.message : e);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.searchProduct = async (req, res) => {
  try {
    const q = str(req.query.q || "");
    if (!q) return res.json({ success: true, products: [] });

    const rows = (await pool.query(
      "SELECT id, product_id, name, slug, mpn FROM products WHERE name ILIKE $1 OR mpn ILIKE $1 LIMIT 50",
      [`%${q}%`]
    )).rows;

    return res.json({ success: true, products: rows });
  } catch (e) {
    console.error("searchProduct:", e && e.message ? e.message : e);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.deleteProduct = async (req, res) => {
  const client = await pool.connect();
  try {
    const io = req.app && req.app.get ? req.app.get("io") : null;
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: "Invalid product id" });

    await client.query("BEGIN");

    const prodRes = await client.query(`SELECT main_image, product_videos FROM products WHERE id=$1 FOR UPDATE`, [id]);
    if (!prodRes.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    const product = prodRes.rows[0];
    const mediaRows = (await client.query(
      `SELECT vm.id, vm.filename
       FROM variant_media vm
       JOIN product_variants pv ON pv.id = vm.variant_id
       WHERE pv.product_id=$1`,
      [id]
    )).rows || [];

    for (const r of mediaRows) {
      try {
        const full = path.resolve(path.join(UPLOAD_DIR, basename(r.filename)));
        if (full.startsWith(path.resolve(UPLOAD_DIR))) await fs.unlink(full).catch(() => {});
      } catch { /* ignore */ }
    }

    await client.query("DELETE FROM variant_media WHERE variant_id IN (SELECT id FROM product_variants WHERE product_id=$1)", [id]);
    await client.query("DELETE FROM product_variant_attributes WHERE variant_id IN (SELECT id FROM product_variants WHERE product_id=$1)", [id]);
    await client.query("DELETE FROM product_variants WHERE product_id=$1", [id]);
    await client.query("DELETE FROM products WHERE id=$1", [id]);
    await client.query("COMMIT");

    const normalizeFilesInput = (val) => {
      if (!val) return [];
      if (Array.isArray(val)) return val.map(path.basename).filter(Boolean);
      try {
        const s = String(val);
        if (s.startsWith("[")) {
          const arr = JSON.parse(s);
          if (Array.isArray(arr)) return arr.map(path.basename).filter(Boolean);
        }
      } catch { /* ignore */ }
      if (String(val).includes(",")) return String(val).split(",").map(p => path.basename(p.trim())).filter(Boolean);
      return [path.basename(val)].filter(Boolean);
    };

    const filesToDelete = [product.main_image].filter(Boolean).concat(normalizeFilesInput(product.product_videos));
    for (const f of filesToDelete.filter(Boolean)) {
      try {
        const full = path.resolve(path.join(UPLOAD_DIR, path.basename(f)));
        if (full.startsWith(path.resolve(UPLOAD_DIR))) await fs.unlink(full).catch(() => { });
      } catch { /* ignore */ }
    }

    if (io) {
      try { io.emit("product:deleted", { id }); } catch { /* ignore */ }
      try { await recentProductsController.emitProductDeleted(io, id); } catch { /* ignore */ }
      try { await recentProductsController.emitRecentProductsUpdate(io); } catch { /* ignore */ }
    }

    return res.json({ success: true });
  } catch (e) {
    await client.query("ROLLBACK").catch(() => { });
    console.error("deleteProduct:", e && e.message ? e.message : e);
    return res.status(500).json({ success: false, message: "Server error" });
  } finally {
    client.release();
  }
};

exports.saveProductToDB = saveProductToDB;
