import { isPlaceholderProductImage } from './productImage.js';
import { isFileImageRef, persistProductImageFile } from './productImageStorage.js';
import { logStructured } from './structuredLog.js';

/** Store new raster images on disk; keep placeholders and remote URLs in SQLite. */
export function normalizeProductImageForStore(productId: string, image: string): string {
  const value = (image ?? '').trim();
  if (!value || isPlaceholderProductImage(value)) return value;
  if (isFileImageRef(value) || value.startsWith('http://') || value.startsWith('https://')) {
    return value;
  }
  if (value.startsWith('data:image/svg')) return value;
  if (value.startsWith('data:')) {
    logStructured('IMAGE_UPLOAD_START', { productId, bytes: value.length });
    try {
      const ref = persistProductImageFile(productId, value);
      logStructured('IMAGE_UPLOAD_SUCCESS', { productId, refKind: 'file' });
      return ref;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logStructured('IMAGE_UPLOAD_FAILURE', { productId, error: message });
      throw err;
    }
  }
  return value;
}
