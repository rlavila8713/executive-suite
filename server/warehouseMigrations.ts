import type { SqliteStore } from './db.js';
import { newId } from './db.js';
import { DEFAULT_WAREHOUSE_NAME, MIGRATION_SECTION_NAME } from './warehouse.js';

export function migrateWarehouseSchema(db: SqliteStore): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS warehouses (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_warehouses_default ON warehouses(is_default);

    CREATE TABLE IF NOT EXISTS warehouse_sections (
      id TEXT PRIMARY KEY,
      warehouse_id TEXT NOT NULL,
      name TEXT NOT NULL,
      is_system INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (warehouse_id) REFERENCES warehouses(id)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_warehouse_sections_name
      ON warehouse_sections(warehouse_id, name COLLATE NOCASE);

    CREATE TABLE IF NOT EXISTS warehouse_stock (
      id TEXT PRIMARY KEY,
      warehouse_id TEXT NOT NULL,
      section_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 0,
      unit_cost REAL NOT NULL DEFAULT 0,
      updated_at INTEGER,
      FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
      FOREIGN KEY (section_id) REFERENCES warehouse_sections(id),
      FOREIGN KEY (product_id) REFERENCES products(id),
      UNIQUE (warehouse_id, product_id)
    );
    CREATE INDEX IF NOT EXISTS idx_warehouse_stock_section ON warehouse_stock(section_id);
    CREATE INDEX IF NOT EXISTS idx_warehouse_stock_product ON warehouse_stock(product_id);

    CREATE TABLE IF NOT EXISTS warehouse_movements (
      id TEXT PRIMARY KEY,
      warehouse_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      section_id TEXT,
      type TEXT NOT NULL,
      quantity_delta INTEGER NOT NULL,
      unit_cost REAL,
      balance_after INTEGER,
      reference_type TEXT,
      reference_id TEXT,
      notes TEXT,
      created_at INTEGER NOT NULL,
      created_by TEXT,
      FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    );
    CREATE INDEX IF NOT EXISTS idx_warehouse_movements_product ON warehouse_movements(product_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_warehouse_movements_warehouse ON warehouse_movements(warehouse_id, created_at);
  `);

  seedDefaultWarehouseAndStock(db);
}

function ensureWarehouseCostColumn(db: SqliteStore): void {
  const cols = db.prepare('PRAGMA table_info(products)').all() as { name: string }[];
  if (!cols.some((c) => c.name === 'warehouse_cost')) {
    db.exec(`ALTER TABLE products ADD COLUMN warehouse_cost REAL NOT NULL DEFAULT 0`);
  }
  db.prepare(
    `UPDATE products SET warehouse_cost = (
      SELECT ws.unit_cost FROM warehouse_stock ws WHERE ws.product_id = products.id LIMIT 1
    ) WHERE warehouse_cost = 0 AND EXISTS (SELECT 1 FROM warehouse_stock ws WHERE ws.product_id = products.id AND ws.quantity > 0)`,
  ).run();
}

function seedDefaultWarehouseAndStock(db: SqliteStore): void {
  ensureWarehouseCostColumn(db);
  let warehouseId: string;
  const existingWarehouse = db.prepare('SELECT id FROM warehouses WHERE is_default = 1 LIMIT 1').get() as
    | { id: string }
    | undefined;

  if (existingWarehouse) {
    warehouseId = existingWarehouse.id;
  } else {
    warehouseId = newId();
    const now = Date.now();
    db.prepare(
      'INSERT INTO warehouses (id, name, is_default, created_at, updated_at) VALUES (?, ?, 1, ?, ?)',
    ).run(warehouseId, DEFAULT_WAREHOUSE_NAME, now, now);
  }

  let migrationSectionId: string;
  const migrationSection = db
    .prepare(
      'SELECT id FROM warehouse_sections WHERE warehouse_id = ? AND name = ? COLLATE NOCASE LIMIT 1',
    )
    .get(warehouseId, MIGRATION_SECTION_NAME) as { id: string } | undefined;

  if (migrationSection) {
    migrationSectionId = migrationSection.id;
  } else {
    migrationSectionId = newId();
    db.prepare(
      'INSERT INTO warehouse_sections (id, warehouse_id, name, is_system, created_at) VALUES (?, ?, ?, 1, ?)',
    ).run(migrationSectionId, warehouseId, MIGRATION_SECTION_NAME, Date.now());
  }

  const products = db.prepare('SELECT id, cost FROM products').all() as { id: string; cost: number }[];
  const insertStock = db.prepare(
    `INSERT OR IGNORE INTO warehouse_stock (id, warehouse_id, section_id, product_id, quantity, unit_cost, updated_at)
     VALUES (?, ?, ?, ?, 0, ?, ?)`,
  );
  const now = Date.now();
  for (const p of products) {
    const whCost = (p as { warehouse_cost?: number }).warehouse_cost ?? p.cost ?? 0;
    insertStock.run(newId(), warehouseId, migrationSectionId, p.id, whCost, now);
  }
}
