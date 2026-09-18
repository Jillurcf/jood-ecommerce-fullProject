/**
 * multerCategory.js
 * ==================================================
 * Secure, production-ready file upload for parent categories
 * Compatible with server.js and parent-category.controller.js
 * ==================================================
 */

const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ------------------------
// Upload directory
// ------------------------
const UPLOAD_DIR = path.resolve(__dirname, '../public/uploads/categories');

// Ensure upload directory exists
try {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
} catch (err) {
  console.warn('Warning: Failed to create upload directory:', UPLOAD_DIR, err.message);
}

// ------------------------
// Storage settings
// ------------------------
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    // Sanitize original filename
    const safeName = file.originalname.replace(/[^\w.-]/g, '_');
    const uniqueName = `${crypto.randomBytes(16).toString('hex')}_${safeName}`;
    cb(null, uniqueName);
  }
});

// ------------------------
// File type filter
// ------------------------
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif/;
  const mimeValid = allowedTypes.test(file.mimetype.toLowerCase());
  const extValid = allowedTypes.test(path.extname(file.originalname).toLowerCase());

  if (mimeValid && extValid) return cb(null, true);
  cb(new Error('Only image files are allowed (jpeg, jpg, png, gif)'));
};

// ------------------------
// Multer instance
// ------------------------
const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB max
  fileFilter
});

// ------------------------
// Optional authentication middleware
// ------------------------
// Uncomment if login/session is enabled in server.js
// const { verifyAdmin } = require('../middleware/auth');
// upload.use(verifyAdmin);

// ------------------------
// Export
// ------------------------
module.exports = upload;
