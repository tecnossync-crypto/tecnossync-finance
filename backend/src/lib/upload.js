const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const ROOT = process.env.UPLOAD_DIR || path.join(__dirname, '..', '..', 'uploads');

// Cada empresa tiene su carpeta; el nombre es aleatorio para que no sea adivinable.
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(ROOT, String(req.cid));
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, crypto.randomBytes(16).toString('hex') + path.extname(file.originalname).toLowerCase()),
});

const ALLOWED = ['.pdf', '.png', '.jpg', '.jpeg', '.webp', '.heic'];

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, ALLOWED.includes(path.extname(file.originalname).toLowerCase())),
});

// Ruta relativa guardada en DB -> ruta absoluta, garantizando que pertenece a la empresa
const resolveFile = (cid, rel) => {
  if (!rel) return null;
  const abs = path.resolve(ROOT, rel);
  return abs.startsWith(path.resolve(ROOT, String(cid)) + path.sep) ? abs : null;
};

const relPath = (cid, file) => path.join(String(cid), file.filename);

module.exports = { upload, resolveFile, relPath };
