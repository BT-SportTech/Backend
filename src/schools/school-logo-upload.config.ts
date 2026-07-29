import { mkdirSync } from 'fs';
import { diskStorage } from 'multer';
import { extname } from 'path';

export const SCHOOL_LOGO_UPLOAD_DIR = 'uploads/school-logos';

const allowedMimeTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

mkdirSync(SCHOOL_LOGO_UPLOAD_DIR, { recursive: true });

export const schoolLogoStorage = diskStorage({
  destination: SCHOOL_LOGO_UPLOAD_DIR,
  filename: (_req, file, callback) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    callback(null, `${unique}${extname(file.originalname).toLowerCase()}`);
  },
});

export function schoolLogoFileFilter(
  _req: Express.Request,
  file: Express.Multer.File,
  callback: (error: Error | null, acceptFile: boolean) => void,
) {
  if (!allowedMimeTypes.has(file.mimetype)) {
    callback(new Error('Only image files (JPEG, PNG, WebP, GIF) are allowed'), false);
    return;
  }
  callback(null, true);
}
