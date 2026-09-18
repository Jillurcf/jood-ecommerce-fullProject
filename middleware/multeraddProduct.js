const path = require("path");
const fs = require("fs");
const express = require("express");
const multer = require("multer");
const crypto = require("crypto");
const router = express.Router();

const { saveProductToDB } = require("../controllers/add-product.controller");

// सुनिश्चित upload folder exists
const UPLOAD_DIR = path.join(__dirname, "../public/uploads/products");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// --------------------
// Helpers
// --------------------
const randomHex = (len = 6) =>
  crypto.randomBytes(Math.ceil(len / 2)).toString("hex").slice(0, len);

const toPublicUrl = (filename) =>
  filename ? `/uploads/products/${path.basename(filename)}` : null;

// --------------------
// Multer storage
// --------------------
const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, UPLOAD_DIR),
  filename: (_, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const safeName = `${Date.now()}-${randomHex(6)}${ext}`;
    cb(null, safeName);
  },
});

// --------------------
// File filter
// --------------------
const upload = multer({
  storage,
  limits: {
    fileSize: 60 * 1024 * 1024, // 60MB
    files: 150,
  },
  fileFilter: (_, file, cb) => {
    if (file.mimetype.startsWith("image/") || file.mimetype.startsWith("video/"))
      cb(null, true);
    else cb(new Error("Only image and video files allowed"));
  },
});

// --------------------
// POST /admin/add-product
// --------------------
router.post("/add-product", upload.any(), async (req, res) => {
  try {
    const files = req.files || [];

    let mainImage = null;
    const gallery = [];
    const productVideos = [];
    const variantMediaByIndex = {};
    const legacyVariantImages = [];

    const variantRegex = /^variant_media\[(\d+)\]\[\]$/;

    for (const f of files) {
      const field = f.fieldname;
      const filename = f.filename; // ALWAYS SAFE

      if (field === "main_image") {
        if (!mainImage) mainImage = filename;
        else gallery.push(filename);
        continue;
      }

      if (field.startsWith("gallery")) {
        gallery.push(filename);
        continue;
      }

      if (field.startsWith("product_videos")) {
        productVideos.push(filename);
        continue;
      }

      if (field === "variant_image" || field === "variant_image[]") {
        legacyVariantImages.push(filename);
        continue;
      }

      const match = field.match(variantRegex);
      if (match) {
        const index = Number(match[1]);
        variantMediaByIndex[index] = variantMediaByIndex[index] || [];
        variantMediaByIndex[index].push(filename);
        continue;
      }

      // fallback by type
      if (f.mimetype.startsWith("image/")) gallery.push(filename);
      else if (f.mimetype.startsWith("video/")) productVideos.push(filename);
    }

    // If only legacy variant images provided
    if (legacyVariantImages.length && Object.keys(variantMediaByIndex).length === 0) {
      legacyVariantImages.forEach((img, i) => {
        variantMediaByIndex[i] = [img];
      });
    }

    // Convert to public URLs
    const galleryUrls = gallery.map(toPublicUrl);
    const videoUrls = productVideos.map(toPublicUrl);

    const variant_media_map = {};
    const variantImagesFlat = [];

    Object.keys(variantMediaByIndex)
      .sort((a, b) => Number(a) - Number(b))
      .forEach((key) => {
        const urls = variantMediaByIndex[key].map(toPublicUrl);
        variant_media_map[key] = urls;
        variantImagesFlat.push(...urls);
      });

    const payload = {
      ...req.body,
      main_image: toPublicUrl(mainImage),
      gallery: JSON.stringify(galleryUrls),
      product_videos: JSON.stringify(videoUrls),
      variant_media_map: JSON.stringify(variant_media_map),
      variantImages: JSON.stringify(variantImagesFlat), // legacy support
    };

    const savedProduct = await saveProductToDB(payload);

    res.json({ success: true, product: savedProduct });
  } catch (err) {
    console.error("Add product error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
