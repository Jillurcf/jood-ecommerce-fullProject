const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const uploadPath = path.join(__dirname, '../public/uploads/admin');
if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadPath),
  filename: (req, file, cb) => {
    const uniqueName = crypto.randomBytes(16).toString('hex') + '_' + file.originalname;
    cb(null, uniqueName);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif/;
  const mimetypeValid = allowedTypes.test(file.mimetype);
  const extValid = allowedTypes.test(file.originalname.toLowerCase());

  if (mimetypeValid && extValid) cb(null, true);
  else cb(new Error('Only images are allowed (jpeg, jpg, png, gif)'));
};

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter
});

module.exports = upload;
