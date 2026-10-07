import fs from 'node:fs';
import path from 'node:path';
import type { SqliteStore } from './db.js';
import { isPlaceholderProductImage } from './productImage.js';
import {
  FILE_IMAGE_PREFIX,
  getLegacyProductImagesDir,
  getProductImagesDir,
  isFileImageRef,
  persistProductImageFile,
} from './productImageStorage.js';

export type MigrateProductImagesResult = {
  dryRun: boolean;
  scanned: number;
  migrated: number;
  skipped: number;
  errors: { productId: string; message: string }[];
  orphansRemoved: number;
};

function isEmbeddedRasterImage(image: string): boolean {
  const v = image.trim();
  if (!v || isPlaceholderProductImage(v) || isFileImageRef(v)) return false;
  if (v.startsWith('http://') || v.startsWith('https://')) return false;
  return v.startsWith('data:image/') && !v.startsWith('data:image/svg');
}

export function migrateEmbeddedProductImagesToFiles(
  db: SqliteStore,
  options: { dryRun?: boolean; pruneOrphans?: boolean } = {},
): MigrateProductImagesResult {
  const dryRun = options.dryRun === true;
  const pruneOrphans = options.pruneOrphans !== false;
  const rows = db.prepare('SELECT id, image FROM products').all() as { id: string; image: string }[];

  const result: MigrateProductImagesResult = {
    dryRun,
    scanned: rows.length,
    migrated: 0,
    skipped: 0,
    errors: [],
    orphansRemoved: 0,
  };

  const referencedFiles = new Set<string>();

  for (const row of rows) {
    const image = row.image ?? '';
    if (isFileImageRef(image)) {
      referencedFiles.add(image.slice(FILE_IMAGE_PREFIX.length));
      result.skipped += 1;
      continue;
    }
    if (!isEmbeddedRasterImage(image)) {
      result.skipped += 1;
      continue;
    }

    if (dryRun) {
      result.migrated += 1;
      continue;
    }

    try {
      const ref = persistProductImageFile(row.id, image);
      db.prepare('UPDATE products SET image = ? WHERE id = ?').run(ref, row.id);
      referencedFiles.add(ref.slice(FILE_IMAGE_PREFIX.length));
      result.migrated += 1;
    } catch (err) {
      result.errors.push({
        productId: row.id,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (pruneOrphans && !dryRun) {
    result.orphansRemoved = pruneOrphanProductImageFiles(referencedFiles);
  }

  console.info(
    JSON.stringify({
      event: 'PRODUCT_IMAGE_MIGRATION',
      dryRun,
      migrated: result.migrated,
      orphansRemoved: result.orphansRemoved,
      errors: result.errors.length,
    }),
  );

  return result;
}

function pruneDirectory(dir: string, refPrefix: string, referenced: Set<string>): number {
  if (!fs.existsSync(dir)) return 0;
  let removed = 0;
  for (const name of fs.readdirSync(dir)) {
    const relative = `${refPrefix}/${name}`;
    if (referenced.has(relative)) continue;
    try {
      fs.unlinkSync(path.join(dir, name));
      removed += 1;
    } catch {
      // keep file if delete fails
    }
  }
  return removed;
}

export function pruneOrphanProductImageFiles(referencedRelativePaths: Set<string>): number {
  return (
    pruneDirectory(getProductImagesDir(), 'product-photos', referencedRelativePaths) +
    pruneDirectory(getLegacyProductImagesDir(), 'products', referencedRelativePaths)
  );
}
