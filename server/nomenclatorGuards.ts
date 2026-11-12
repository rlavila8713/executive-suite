import type { SqliteStore } from './db.js';

export function countProductsUsingCategory(db: SqliteStore, categoryId: string, categoryName: string): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS c FROM products
       WHERE category_id = ? OR TRIM(category) = TRIM(?) COLLATE NOCASE`,
    )
    .get(categoryId, categoryName) as { c: number };
  return row.c ?? 0;
}

export function countProductsUsingSubcategory(db: SqliteStore, subcategoryId: string, subcategoryName: string): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS c FROM products
       WHERE subcategory_id = ? OR TRIM(subcategory) = TRIM(?) COLLATE NOCASE`,
    )
    .get(subcategoryId, subcategoryName) as { c: number };
  return row.c ?? 0;
}

export function countProductsUsingLocation(db: SqliteStore, locationId: string): number {
  const row = db.prepare('SELECT COUNT(*) AS c FROM products WHERE location_id = ?').get(locationId) as { c: number };
  return row.c ?? 0;
}

export function countTransactionsUsingCustomer(db: SqliteStore, customerId: string): number {
  const row = db.prepare('SELECT COUNT(*) AS c FROM transactions WHERE customer_id = ?').get(customerId) as {
    c: number;
  };
  return row.c ?? 0;
}

export function countWarehouseStockUnitsForProduct(db: SqliteStore, productId: string): number {
  const row = db
    .prepare('SELECT COALESCE(SUM(quantity), 0) AS q FROM warehouse_stock WHERE product_id = ?')
    .get(productId) as { q: number };
  return row.q ?? 0;
}
