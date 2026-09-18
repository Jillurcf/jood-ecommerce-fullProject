// middleware/upload.help.js
'use strict';

/**
 * Multer middleware for secure support attachments with error detection
 *
 * - Limits: 1 file, 8MB
 * - Allowed types: jpg, jpeg, png, pdf, mp4
 * - Generates random safe filenames
 * - Logs errors for debugging
 */

const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const fsPromises = fs.promises;

// -------------------------
// Configuration
// -------------------------
const UPLOAD_DIR =
  process.env.HELP_UPLOAD_DIR ||
  path.resolve(__dirname, '../public/uploads/support-help');

// Ensure upload directory exists
async function ensureUploadDir() {
  try {
    await fsPromises.mkdir(UPLOAD_DIR, { recursive: true, mode: 0o750 });
    console.log(`Upload directory ready at: ${UPLOAD_DIR}`);
  } catch (err) {
    console.error(`Failed to create upload directory "${UPLOAD_DIR}":`, err);
    throw new Error(`Cannot create upload directory: ${err.message}`);
  }
}

// Synchronous create at module load (fails fast)
if (!fs.existsSync(UPLOAD_DIR)) {
  try {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true, mode: 0o750 });
    console.log(`Upload directory created: ${UPLOAD_DIR}`);
  } catch (err) {
    console.error(`Failed to create upload directory at startup:`, err);
    throw err;
  }
}

// -------------------------
// Allowed types
// -------------------------
const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'application/pdf',
  'video/mp4',
]);

const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.pdf', '.mp4']);

// -------------------------
// Helpers
// -------------------------
function sanitizeOriginalName(name = '') {
  const base = path
    .basename(name)
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9\.\-\_]/g, '');
  return base.length > 100 ? base.slice(0, 100) : base;
}

function generateSafeFilename(originalName) {
  const ext = path.extname(originalName).toLowerCase();
  const safeExt = ALLOWED_EXT.has(ext) ? ext : '';
  const rnd = crypto.randomBytes(10).toString('hex');
  return `${Date.now()}-${rnd}${safeExt}`;
}

async function removeUploadedFile(filePath) {
  if (!filePath) return;
  try {
    const abs = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(process.cwd(), filePath);
    await fsPromises.unlink(abs);
    console.log(`Removed uploaded file: ${abs}`);
  } catch (err) {
    console.warn('Failed to remove uploaded file:', err);
  }
}

// -------------------------
// Multer storage
// -------------------------
const storage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, UPLOAD_DIR);
  },
  filename(req, file, cb) {
    try {
      const orig = sanitizeOriginalName(file.originalname);
      const filename = generateSafeFilename(orig);
      cb(null, filename);
    } catch (err) {
      console.error('Error generating filename:', err);
      cb(err);
    }
  },
});

// -------------------------
// File filter
// -------------------------
function fileFilter(req, file, cb) {
  try {
    const mimetype = file?.mimetype || '';
    const ext = path.extname(file.originalname || '').toLowerCase();

    if (!ALLOWED_MIME.has(mimetype) || !ALLOWED_EXT.has(ext)) {
      const err = new multer.MulterError('LIMIT_UNEXPECTED_FILE', file.fieldname);
      err.message = `Invalid file type "${ext}" (${mimetype}). Allowed types: ${Array.from(ALLOWED_EXT).join(
        ', '
      )}`;
      console.error('File rejected:', err.message);
      return cb(err, false);
    }

    return cb(null, true);
  } catch (err) {
    console.error('Error in fileFilter:', err);
    const merr = new multer.MulterError('LIMIT_UNEXPECTED_FILE', file?.fieldname || 'attachment');
    merr.message = 'Invalid file.';
    return cb(merr, false);
  }
}

// -------------------------
// Multer instance
// -------------------------
const uploadHelpAttachment = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 8 * 1024 * 1024, // 8MB
    files: 1,
  },
});

// -------------------------
// Exports
// -------------------------
module.exports = {
  uploadHelpAttachment,
  removeUploadedFile,
  ensureUploadDir,
  UPLOAD_DIR,
  ALLOWED_MIME: Array.from(ALLOWED_MIME),
  ALLOWED_EXT: Array.from(ALLOWED_EXT),
};
