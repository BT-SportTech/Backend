import { mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/** Vercel / Lambda filesystems are read-only except /tmp. */
export function isServerlessRuntime() {
  return Boolean(
    process.env.VERCEL ||
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.LAMBDA_TASK_ROOT,
  );
}

/** Root directory served at `/uploads/`. */
export function getUploadsRoot(): string {
  if (isServerlessRuntime()) {
    return join(tmpdir(), 'sporttech-uploads');
  }
  return join(process.cwd(), 'uploads');
}

export function ensureUploadDir(...segments: string[]): string {
  const dir = join(getUploadsRoot(), ...segments);
  mkdirSync(dir, { recursive: true });
  return dir;
}
