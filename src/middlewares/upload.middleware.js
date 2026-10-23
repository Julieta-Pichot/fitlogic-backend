import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import { ValidationError } from '../errors/AppError.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOADS_ROOT = path.resolve(__dirname, '../../uploads');

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

const MAX_FILE_SIZE = 5 * 1024 * 1024;

export const ensureUploadDir = (gimnasioId) => {
  const dir = path.join(UPLOADS_ROOT, String(gimnasioId));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
};

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const gimnasioId = req.user?.gimnasioId ?? 'temp';
    const dir = ensureUploadDir(gimnasioId);
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uniqueSuffix}${ext}`);
  },
});

const fileFilter = (_req, file, cb) => {
  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    cb(new ValidationError('Tipo de archivo no permitido. Use PDF, JPG, PNG o WEBP'));
    return;
  }

  cb(null, true);
};

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE },
});

export const UPLOADS_PATH = UPLOADS_ROOT;

// ---------------------------------------------------------------------------
// Fotos de recetas: carpeta propia, servida estáticamente en /uploads/recetas
// ---------------------------------------------------------------------------

export const RECIPES_UPLOADS_PATH = path.join(UPLOADS_ROOT, 'recetas');
export const RECIPE_PHOTO_URL_PREFIX = '/uploads/recetas/';

const IMAGE_EXTENSIONS = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

const recipeStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdirSync(RECIPES_UPLOADS_PATH, { recursive: true });
    cb(null, RECIPES_UPLOADS_PATH);
  },
  // Nombre único generado por el servidor: nunca se usa el nombre que manda el cliente.
  filename: (_req, file, cb) => cb(null, `${randomUUID()}${IMAGE_EXTENSIONS[file.mimetype]}`),
});

export const recipeUpload = multer({
  storage: recipeStorage,
  fileFilter: (_req, file, cb) => {
    if (!IMAGE_EXTENSIONS[file.mimetype]) {
      cb(new ValidationError('Tipo de imagen no permitido. Use JPG, PNG o WEBP'));
      return;
    }
    cb(null, true);
  },
  limits: { fileSize: MAX_FILE_SIZE, files: 1 },
});

// El mimetype lo declara el cliente: se confirma mirando los primeros bytes del archivo.
const hasImageSignature = (filePath) => {
  const header = Buffer.alloc(12);
  const fd = fs.openSync(filePath, 'r');
  try {
    fs.readSync(fd, header, 0, 12, 0);
  } finally {
    fs.closeSync(fd);
  }

  const isJpeg = header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
  const isPng = header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isWebp = header.subarray(0, 4).toString('ascii') === 'RIFF' && header.subarray(8, 12).toString('ascii') === 'WEBP';
  return isJpeg || isPng || isWebp;
};

export const validateRecipeImage = (req, _res, next) => {
  if (req.file && !hasImageSignature(req.file.path)) {
    fs.promises.unlink(req.file.path).catch(() => {});
    return next(new ValidationError('El archivo no es una imagen válida (JPG, PNG o WEBP)'));
  }
  return next();
};

// Borra del disco una foto de receta (solo si está dentro de la carpeta de recetas).
export const removeRecipePhoto = async (foto) => {
  if (!foto || !foto.startsWith(RECIPE_PHOTO_URL_PREFIX)) return;
  const target = path.join(RECIPES_UPLOADS_PATH, path.basename(foto));
  await fs.promises.unlink(target).catch(() => {});
};
