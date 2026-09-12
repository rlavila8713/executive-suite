import { productImageVersion, resolveProductImage } from './productImage.js';

/** Max decoded size for store logo bytes (shown on receipts and sidebar). */
export const MAX_STORE_LOGO_BYTES = 512 * 1024;

const ALLOWED_STORE_LOGO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function storeLogoPath(image: string | null | undefined): string | null {
  const version = productImageVersion(image);
  return version ? `/api/settings/logo?v=${version}` : null;
}

/** Validates and returns trimmed logo data URL, or empty string to clear. */
export function normalizeStoreLogo(image: unknown): string {
  const value = typeof image === 'string' ? image.trim() : '';
  if (!value) return '';

  const resolved = resolveProductImage(value);
  if (!resolved) {
    throw new Error('Invalid store logo image format.');
  }
  if (resolved.kind === 'redirect') {
    throw new Error('Remote image URLs are not supported for the store logo.');
  }
  const contentType = resolved.contentType.split(';')[0].trim().toLowerCase();
  if (!ALLOWED_STORE_LOGO_TYPES.has(contentType)) {
    throw new Error('Store logo must be JPEG, PNG, or WebP.');
  }
  if (resolved.data.length > MAX_STORE_LOGO_BYTES) {
    throw new Error(
      `Store logo is too large (${Math.round(resolved.data.length / 1024)} KB). Maximum is ${Math.round(MAX_STORE_LOGO_BYTES / 1024)} KB.`,
    );
  }
  return value;
}
