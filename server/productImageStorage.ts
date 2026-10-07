import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { getDataDir } from './db.js';

/** Stored in products.image when bytes live on disk (keeps SQLite export smaller). */
export const FILE_IMAGE_PREFIX = 'file:';

const NEW_PHOTO_DIR = 'product-photos';
const LEGACY_IMAGES_DIR = 'images';

export function getProductImagesDir(): string {
  return path.join(getDataDir(), NEW_PHOTO_DIR);
}

export function getLegacyProductImagesDir(): string {
  return path.join(getDataDir(), LEGACY_IMAGES_DIR, 'products');
}

export function isFileImageRef(image: string | null | undefined): boolean {
  return (image ?? '').trim().startsWith(FILE_IMAGE_PREFIX);
}

export function fileImageRelativePath(productId: string, contentType: string): string {
  const ext =
    contentType.includes('png')
      ? 'png'
      : contentType.includes('webp')
        ? 'webp'
        : contentType.includes('gif')
          ? 'gif'
          : 'jpg';
  return `${NEW_PHOTO_DIR}/${productId}.${ext}`;
}

/** Map SQLite `file:` reference to an absolute path (supports legacy `file:products/...`). */
export function absolutePathForImageRef(relativeFromRef: string): string {
  if (relativeFromRef.startsWith(`${NEW_PHOTO_DIR}/`)) {
    return path.join(getDataDir(), relativeFromRef);
  }
  if (relativeFromRef.startsWith('products/')) {
    return path.join(getDataDir(), LEGACY_IMAGES_DIR, relativeFromRef);
  }
  return path.join(getDataDir(), LEGACY_IMAGES_DIR, relativeFromRef);
}

/**
 * Writes image bytes to disk and returns the `file:` reference for SQLite.
 * Does not delete previous files (safe rollback).
 */
export function persistProductImageFile(productId: string, dataUrl: string): string {
  const trimmed = dataUrl.trim();
  const base64Match = /^data:([^;,]+);base64,(.+)$/i.exec(trimmed);
  if (!base64Match) {
    return trimmed;
  }
  const contentType = base64Match[1];
  const data = Buffer.from(base64Match[2], 'base64');
  const relative = fileImageRelativePath(productId, contentType);
  const abs = absolutePathForImageRef(relative);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const tmp = `${abs}.tmp`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, abs);
  return `${FILE_IMAGE_PREFIX}${relative}`;
}

export function readFileImageRef(imageRef: string): { contentType: string; data: Buffer } | null {
  if (!isFileImageRef(imageRef)) return null;
  const relative = imageRef.slice(FILE_IMAGE_PREFIX.length);
  const abs = absolutePathForImageRef(relative);
  if (!fs.existsSync(abs)) return null;
  const data = fs.readFileSync(abs);
  const ext = path.extname(abs).toLowerCase();
  const contentType =
    ext === '.png'
      ? 'image/png'
      : ext === '.webp'
        ? 'image/webp'
        : ext === '.gif'
          ? 'image/gif'
          : 'image/jpeg';
  return { contentType, data };
}

export function productImageVersionFromRef(image: string | null | undefined): string | null {
  const value = (image ?? '').trim();
  if (!value) return null;
  if (isFileImageRef(value)) {
    const abs = absolutePathForImageRef(value.slice(FILE_IMAGE_PREFIX.length));
    try {
      const stat = fs.statSync(abs);
      return createHash('sha1').update(`${value}:${stat.size}:${stat.mtimeMs}`).digest('hex').slice(0, 12);
    } catch {
      return createHash('sha1').update(value).digest('hex').slice(0, 12);
    }
  }
  return null;
}
