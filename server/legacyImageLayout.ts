import fs from 'node:fs';
import path from 'node:path';
import type { SqliteStore } from './db.js';
import { getDataDir } from './db.js';
import { getLegacyProductImagesDir, getProductImagesDir } from './productImageStorage.js';

/** One-time layout: move disk files and DB refs off `data/images/` (conflicts with tsx + tsconfig paths). */
export function migrateLegacyProductPhotoLayout(db: SqliteStore): void {
  const legacyDir = getLegacyProductImagesDir();
  const newDir = getProductImagesDir();
  if (!fs.existsSync(legacyDir)) return;

  fs.mkdirSync(newDir, { recursive: true });

  const rows = db.prepare('SELECT id, image FROM products').all() as { id: string; image: string }[];
  const update = db.prepare('UPDATE products SET image = ? WHERE id = ?');

  for (const row of rows) {
    const image = row.image ?? '';
    if (!image.startsWith('file:products/')) continue;
    const fileName = image.slice('file:products/'.length);
    const legacyPath = path.join(legacyDir, fileName);
    const newPath = path.join(newDir, fileName);
    if (fs.existsSync(legacyPath) && !fs.existsSync(newPath)) {
      fs.renameSync(legacyPath, newPath);
    }
    update.run(`file:product-photos/${fileName}`, row.id);
  }

  try {
    const remaining = fs.readdirSync(legacyDir);
    if (remaining.length === 0) {
      fs.rmdirSync(legacyDir);
      const imagesRoot = path.join(getDataDir(), 'images');
      if (fs.existsSync(imagesRoot) && fs.readdirSync(imagesRoot).length === 0) {
        fs.rmdirSync(imagesRoot);
      }
    }
  } catch {
    // non-fatal
  }
}
