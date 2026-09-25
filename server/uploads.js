import multer from 'multer';
import crypto from 'node:crypto';
import path from 'node:path';
import { existsSync, mkdirSync, openSync, readSync, closeSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const uploadsDir = path.join(__dirname, 'uploads');
if (!existsSync(uploadsDir)) mkdirSync(uploadsDir, { recursive: true });

const extOf = (name, fallback) => {
  const m = /\.([a-z0-9]+)$/i.exec(String(name || ''));
  return m ? '.' + m[1].toLowerCase() : fallback;
};

export const SAFE_NAME = /^[a-f0-9]{16}\.(pdf|doc|docx|jpg|jpeg|png|webp)$/;

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = extOf(file.originalname, extOf(file.mimetype === 'application/pdf' ? 'x.pdf' : 'x.bin', '.bin'));
    cb(null, crypto.randomBytes(8).toString('hex') + ext);
  },
});

const maxMb = Number(process.env.MAX_UPLOAD_MB || 10) * 1024 * 1024;

export const pdfUpload = multer({
  storage,
  limits: { fileSize: maxMb, files: 1 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf' && /\.pdf$/i.test(file.originalname)) cb(null, true);
    else cb(new Error('PDF_ONLY'));
  },
});

export const imgUpload = multer({
  storage,
  limits: { fileSize: maxMb, files: 1 },
  fileFilter: (req, file, cb) => {
    const okType = /^image\/(jpeg|png|webp)$/.test(file.mimetype);
    const okExt = /\.(jpe?g|png|webp)$/i.test(file.originalname);
    if (okType && okExt) cb(null, true);
    else cb(new Error('IMAGE_ONLY'));
  },
});

export function filePath(name) {
  if (!SAFE_NAME.test(name || '')) return null;
  return path.join(uploadsDir, name);
}

/**
 * Verify a small signature after multer has written the file. MIME type and
 * extension checks alone can be spoofed by a client.
 */
export function validFileSignature(file, kind) {
  let fd;
  try {
    fd = openSync(file, 'r');
    const bytes = Buffer.alloc(1024);
    const length = readSync(fd, bytes, 0, bytes.length, 0);
    const data = bytes.subarray(0, length);
    if (kind === 'pdf') return data.includes(Buffer.from('%PDF-'));
    if (kind === 'image') {
      const isJpeg = data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
      const isPng = data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47;
      const isWebp = data.subarray(0, 4).toString('ascii') === 'RIFF' && data.subarray(8, 12).toString('ascii') === 'WEBP';
      return isJpeg || isPng || isWebp;
    }
    return false;
  } catch {
    return false;
  } finally {
    if (fd !== undefined) { try { closeSync(fd); } catch {} }
  }
}