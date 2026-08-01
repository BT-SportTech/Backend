import { mkdirSync } from 'fs';
import { diskStorage } from 'multer';
import { extname } from 'path';

export const EVENT_IMAGE_UPLOAD_DIR = 'uploads/event-images';

const allowedMimeTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

mkdirSync(EVENT_IMAGE_UPLOAD_DIR, { recursive: true });

export const eventImageStorage = diskStorage({
  destination: EVENT_IMAGE_UPLOAD_DIR,
  filename: (_req, file, callback) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    callback(null, `${unique}${extname(file.originalname).toLowerCase()}`);
  },
});

export function eventImageFileFilter(
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
