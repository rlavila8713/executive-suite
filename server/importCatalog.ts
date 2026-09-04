import type { SqliteStore } from './db.js';
import { newId } from './db.js';
import { PLACEHOLDER_PRODUCT_IMAGE } from './constants.js';
import { codeFromCategoryName } from './migrations.js';

export type ProductImportInput = {
  name: string;
  category: string;
  subcategory: string;
  price: number;
  cost: number;
  stock: number;
  location?: string;
  sku?: string;
};

export type ImportRowError = { row: number; message: string };

export type ProductImportResult = {
  created: {
    categories: number;
    subcategories: number;
    locations: number;
    products: number;
  };
  errors: ImportRowError[];
};

type CategoryRow = { id: string; name: string; code: string };
type SubcategoryRow = { id: string; category_id: string; name: string; code: string };
type LocationRow = { id: string; name: string };

function codeFromSubcategoryName(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ]/g, '').toUpperCase();
  if (!cleaned) return 'GEN';
  return cleaned.slice(0, 3).padEnd(3, 'X');
}

function uniqueSubcategoryCode(db: SqliteStore, categoryId: string, baseName: string): string {
  let code = codeFromSubcategoryName(baseName);
  let n = 0;
  while (true) {
    const tryCode = n === 0 ? code : `${code.slice(0, 2)}${n}`;
    const clash = db
      .prepare('SELECT id FROM subcategories WHERE category_id = ? AND code = ?')
      .get(categoryId, tryCode);
    if (!clash) return tryCode.slice(0, 8);
    n++;
    if (n > 99) return `${Date.now().toString(36).slice(-4)}`.toUpperCase();
  }
}

function nextSkuForSubcategory(
  db: SqliteStore,
  cat: CategoryRow,
  sub: { code: string },
  reserved: Set<string>,
): string {
  const catCode = (cat.code || codeFromCategoryName(cat.name)).toUpperCase();
  const subCode = sub.code.toUpperCase();
  const prefix = `${catCode}-${subCode}-`;
  const products = db.prepare('SELECT sku FROM products').all() as { sku: string }[];
  let maxSeq = 0;
  for (const p of products) {
    if (!p.sku.startsWith(prefix)) continue;
    const seq = parseInt(p.sku.slice(prefix.length), 10);
    if (!Number.isNaN(seq) && seq > maxSeq) maxSeq = seq;
  }
  for (const sku of reserved) {
    if (!sku.startsWith(prefix)) continue;
    const seq = parseInt(sku.slice(prefix.length), 10);
    if (!Number.isNaN(seq) && seq > maxSeq) maxSeq = seq;
  }
  return `${prefix}${String(maxSeq + 1).padStart(6, '0')}`;
}

function findCategory(map: Map<string, CategoryRow>, name: string): CategoryRow | undefined {
  return map.get(name.trim().toLowerCase());
}

function findSubcategory(
  map: Map<string, SubcategoryRow>,
  categoryId: string,
  name: string,
): SubcategoryRow | undefined {
  return map.get(`${categoryId}|${name.trim().toLowerCase()}`);
}

function findLocation(map: Map<string, LocationRow>, name: string): LocationRow | undefined {
  return map.get(name.trim().toLowerCase());
}

function ensureCategory(
  db: SqliteStore,
  map: Map<string, CategoryRow>,
  name: string,
  stats: ProductImportResult['created'],
): CategoryRow {
  const existing = findCategory(map, name);
  if (existing) return existing;

  const trimmed = name.trim();
  const id = newId();
  const code = codeFromCategoryName(trimmed);
  db.prepare('INSERT INTO categories (id, name, code) VALUES (?, ?, ?)').run(id, trimmed, code);
  db.prepare('INSERT INTO subcategories (id, category_id, name, code) VALUES (?, ?, ?, ?)').run(
    newId(),
    id,
    'General',
    'GEN',
  );
  stats.categories++;
  stats.subcategories++;

  const row: CategoryRow = { id, name: trimmed, code };
  map.set(trimmed.toLowerCase(), row);
  return row;
}

function ensureSubcategory(
  db: SqliteStore,
  catMap: Map<string, CategoryRow>,
  subMap: Map<string, SubcategoryRow>,
  categoryName: string,
  subcategoryName: string,
  stats: ProductImportResult['created'],
): SubcategoryRow {
  const cat = ensureCategory(db, catMap, categoryName, stats);
  const existing = findSubcategory(subMap, cat.id, subcategoryName);
  if (existing) return existing;

  const trimmed = subcategoryName.trim();
  const id = newId();
  const code = uniqueSubcategoryCode(db, cat.id, trimmed);
  db.prepare('INSERT INTO subcategories (id, category_id, name, code) VALUES (?, ?, ?, ?)').run(
    id,
    cat.id,
    trimmed,
    code,
  );
  stats.subcategories++;

  const row: SubcategoryRow = { id, category_id: cat.id, name: trimmed, code };
  subMap.set(`${cat.id}|${trimmed.toLowerCase()}`, row);
  return row;
}

function ensureLocation(
  db: SqliteStore,
  map: Map<string, LocationRow>,
  name: string,
  stats: ProductImportResult['created'],
): LocationRow {
  const existing = findLocation(map, name);
  if (existing) return existing;

  const trimmed = name.trim();
  const id = newId();
  db.prepare('INSERT INTO locations (id, name) VALUES (?, ?)').run(id, trimmed);
  stats.locations++;
  const row: LocationRow = { id, name: trimmed };
  map.set(trimmed.toLowerCase(), row);
  return row;
}

export function importProductsFromRows(db: SqliteStore, rows: ProductImportInput[]): ProductImportResult {
  const result: ProductImportResult = {
    created: { categories: 0, subcategories: 0, locations: 0, products: 0 },
    errors: [],
  };

  const catMap = new Map<string, CategoryRow>();
  for (const c of db.prepare('SELECT id, name, code FROM categories').all() as CategoryRow[]) {
    catMap.set(c.name.trim().toLowerCase(), c);
  }

  const subMap = new Map<string, SubcategoryRow>();
  for (const s of db.prepare('SELECT id, category_id, name, code FROM subcategories').all() as SubcategoryRow[]) {
    subMap.set(`${s.category_id}|${s.name.trim().toLowerCase()}`, s);
  }

  const locMap = new Map<string, LocationRow>();
  for (const l of db.prepare('SELECT id, name FROM locations').all() as LocationRow[]) {
    locMap.set(l.name.trim().toLowerCase(), l);
  }

  const reservedSkus = new Set<string>();

  db.runInTransaction(() => {
    for (let i = 0; i < rows.length; i++) {
      const rowNum = i + 2;
      const row = rows[i];
      try {
        const cat = ensureCategory(db, catMap, row.category, result.created);
        const sub = ensureSubcategory(db, catMap, subMap, row.category, row.subcategory, result.created);

        let locationId: string | null = null;
        if (row.location?.trim()) {
          locationId = ensureLocation(db, locMap, row.location, result.created).id;
        }

        let sku = row.sku?.trim() ?? '';
        if (sku) {
          const clash = db.prepare('SELECT id FROM products WHERE sku = ?').get(sku);
          if (clash || reservedSkus.has(sku)) {
            result.errors.push({ row: rowNum, message: `ERR_DUPLICATE_SKU|${sku}` });
            continue;
          }
        } else {
          sku = nextSkuForSubcategory(db, cat, sub, reservedSkus);
        }
        reservedSkus.add(sku);

        const id = newId();
        db.prepare(
          `INSERT INTO products (id, name, sku, category, price, cost, stock, image, category_id, subcategory_id, subcategory, status, unit_of_measure, location_id, barcode)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 'unidad', ?, NULL)`,
        ).run(
          id,
          row.name.trim(),
          sku,
          cat.name,
          row.price,
          row.cost,
          Math.floor(row.stock),
          PLACEHOLDER_PRODUCT_IMAGE,
          cat.id,
          sub.id,
          sub.name,
          locationId,
        );
        result.created.products++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        result.errors.push({ row: rowNum, message: msg });
      }
    }
  });

  return result;
}
