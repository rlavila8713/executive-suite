/** Max size for product images stored as data URLs in IndexedDB (~2.5 MB). */
export const MAX_PRODUCT_IMAGE_BYTES = 2.5 * 1024 * 1024;

/** Max file size for store logo uploads (~512 KB). */
export const MAX_STORE_LOGO_BYTES = 512 * 1024;

/** Target max dimension for product photos before upload. */
export const PRODUCT_IMAGE_MAX_DIMENSION = 800;

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const ALLOWED_STORE_LOGO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not decode image.'));
    };
    img.src = url;
  });
}

/** Resize and compress raster images for catalog upload (keeps GIF as-is). */
export async function compressProductImageFile(file: File, maxDim = PRODUCT_IMAGE_MAX_DIMENSION): Promise<Blob> {
  if (file.type === 'image/gif') return file;
  const img = await loadImageFromFile(file);
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not prepare image.');
  ctx.drawImage(img, 0, 0, w, h);
  const mime = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
  const quality = mime === 'image/jpeg' ? 0.82 : undefined;
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not compress image.'))),
      mime,
      quality,
    );
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') resolve(result);
      else reject(new Error('Could not read the file.'));
    };
    reader.onerror = () => reject(new Error('Could not read the file.'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Reads a user-picked image file as a data URL (offline-friendly).
 * Product images are resized/compressed before encoding.
 */
export async function readImageFileAsDataUrl(file: File, maxBytes = MAX_PRODUCT_IMAGE_BYTES): Promise<string> {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return Promise.reject(
      new Error('Unsupported type. Use JPEG, PNG, WebP, GIF, or SVG.'),
    );
  }
  const blob = await compressProductImageFile(file);
  if (blob.size > maxBytes) {
    return Promise.reject(
      new Error(
        `Image is too large (${Math.round(blob.size / 1024)} KB). Maximum is ${Math.round(maxBytes / 1024)} KB.`,
      ),
    );
  }
  return blobToDataUrl(blob);
}

/** Reads a store logo file with stricter type and size limits. */
export function readStoreLogoFileAsDataUrl(file: File): Promise<string> {
  if (!ALLOWED_STORE_LOGO_TYPES.has(file.type)) {
    return Promise.reject(new Error('Unsupported type. Use JPEG, PNG, or WebP.'));
  }
  return readImageFileAsDataUrl(file, MAX_STORE_LOGO_BYTES);
}
