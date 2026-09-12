/** Max size for product images stored as data URLs in IndexedDB (~2.5 MB). */
export const MAX_PRODUCT_IMAGE_BYTES = 2.5 * 1024 * 1024;

/** Max file size for store logo uploads (~512 KB). */
export const MAX_STORE_LOGO_BYTES = 512 * 1024;

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const ALLOWED_STORE_LOGO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/**
 * Reads a user-picked image file as a data URL (offline-friendly).
 * Uses the browser file picker (native on every OS).
 */
export function readImageFileAsDataUrl(file: File, maxBytes = MAX_PRODUCT_IMAGE_BYTES): Promise<string> {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return Promise.reject(
      new Error('Unsupported type. Use JPEG, PNG, WebP, GIF, or SVG.'),
    );
  }
  if (file.size > maxBytes) {
    return Promise.reject(
      new Error(
        `Image is too large (${Math.round(file.size / 1024)} KB). Maximum is ${Math.round(maxBytes / 1024)} KB.`,
      ),
    );
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') resolve(result);
      else reject(new Error('Could not read the file.'));
    };
    reader.onerror = () => reject(new Error('Could not read the file.'));
    reader.readAsDataURL(file);
  });
}

/** Reads a store logo file with stricter type and size limits. */
export function readStoreLogoFileAsDataUrl(file: File): Promise<string> {
  if (!ALLOWED_STORE_LOGO_TYPES.has(file.type)) {
    return Promise.reject(new Error('Unsupported type. Use JPEG, PNG, or WebP.'));
  }
  return readImageFileAsDataUrl(file, MAX_STORE_LOGO_BYTES);
}
