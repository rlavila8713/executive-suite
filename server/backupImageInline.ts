import { isFileImageRef, readFileImageRef } from './productImageStorage.js';

/** Inline file-backed images for JSON backup export. */
export function inlineProductImageForBackup(image: string): string {
  if (!isFileImageRef(image)) return image;
  const file = readFileImageRef(image);
  if (!file) return image;
  return `data:${file.contentType};base64,${file.data.toString('base64')}`;
}
