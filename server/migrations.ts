import type { SqliteStore } from './db.js';

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function tableColumns(db: SqliteStore, table: string): string[] {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return rows.map((r) => r.name);
}

function hasColumn(db: SqliteStore, table: string, column: string): boolean {
  return tableColumns(db, table).includes(column);
}

/** Apply additive schema changes for catalog v2 (subcategories, locations, product fields). */
export function migrateCatalogSchema(db: SqliteStore): void {
  if (!hasColumn(db, 'categories', 'code')) {
    db.exec(`ALTER TABLE categories ADD COLUMN code TEXT NOT NULL DEFAULT ''`);
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS subcategories (
      id TEXT PRIMARY KEY,
      category_id TEXT NOT NULL,
      name TEXT NOT NULL,
      code TEXT NOT NULL,
      FOREIGN KEY (category_id) REFERENCES categories(id)
    );
    CREATE INDEX IF NOT EXISTS idx_subcategories_category ON subcategories(category_id);

    CREATE TABLE IF NOT EXISTS locations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE
    );
  `);

  const productCols: [string, string][] = [
    ['category_id', "TEXT NOT NULL DEFAULT ''"],
    ['subcategory_id', "TEXT NOT NULL DEFAULT ''"],
    ['subcategory', "TEXT NOT NULL DEFAULT ''"],
    ['status', "TEXT NOT NULL DEFAULT 'active'"],
    ['unit_of_measure', "TEXT NOT NULL DEFAULT 'unidad'"],
    ['location_id', 'TEXT'],
    ['barcode', 'TEXT'],
  ];

  for (const [col, def] of productCols) {
    if (!hasColumn(db, 'products', col)) {
      db.exec(`ALTER TABLE products ADD COLUMN ${col} ${def}`);
    }
  }

  // Backfill category codes
  const cats = db.prepare('SELECT id, name, code FROM categories').all() as {
    id: string;
    name: string;
    code: string;
  }[];
  for (const cat of cats) {
    if (!cat.code?.trim()) {
      db.prepare('UPDATE categories SET code = ? WHERE id = ?').run(codeFromCategoryName(cat.name), cat.id);
    }
    const subCount = db.prepare('SELECT COUNT(*) AS c FROM subcategories WHERE category_id = ?').get(cat.id) as {
      c: number;
    };
    if (subCount.c === 0) {
      db.prepare('INSERT INTO subcategories (id, category_id, name, code) VALUES (?, ?, ?, ?)').run(
        newId(),
        cat.id,
        'General',
        'GEN',
      );
    }
  }
}

export function codeFromCategoryName(name: string): string {
  const cleaned = name.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ]/g, '');
  if (!cleaned) return 'XX';
  if (cleaned.length === 1) return cleaned.toUpperCase();
  return cleaned.substring(0, 2).toUpperCase();
}
