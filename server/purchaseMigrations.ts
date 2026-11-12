import type { SqliteStore } from './db.js';

export function migratePurchasesSchema(db: SqliteStore): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS suppliers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      address TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(name);

    CREATE TABLE IF NOT EXISTS purchase_orders (
      id TEXT PRIMARY KEY,
      supplier_id TEXT REFERENCES suppliers(id),
      invoice_number TEXT,
      notes TEXT NOT NULL DEFAULT '',
      purchased_at INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      warehouse_posted_at INTEGER,
      submitted_for_review_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_purchase_orders_purchased_at ON purchase_orders(purchased_at);
    CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders(status);
    CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier ON purchase_orders(supplier_id);

    CREATE TABLE IF NOT EXISTS purchase_lines (
      id TEXT PRIMARY KEY,
      purchase_id TEXT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
      product_id TEXT REFERENCES products(id),
      name TEXT NOT NULL,
      barcode TEXT,
      unit_cost REAL NOT NULL,
      quantity REAL NOT NULL,
      unit_of_measure TEXT NOT NULL DEFAULT 'unidad',
      warehouse_received_qty REAL NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_purchase_lines_purchase_id ON purchase_lines(purchase_id);
    CREATE INDEX IF NOT EXISTS idx_purchase_lines_product_id ON purchase_lines(product_id);

    CREATE TABLE IF NOT EXISTS purchase_invoice_images (
      id TEXT PRIMARY KEY,
      purchase_id TEXT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
      mime_type TEXT NOT NULL,
      storage_path TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_purchase_invoice_images_purchase ON purchase_invoice_images(purchase_id);

    CREATE INDEX IF NOT EXISTS idx_warehouse_movements_purchase_ref
      ON warehouse_movements(reference_type, reference_id);
  `);

  const cols = db.prepare(`PRAGMA table_info(purchase_orders)`).all() as { name: string }[];
  if (!cols.some((c) => c.name === 'submitted_for_review_at')) {
    db.exec(`ALTER TABLE purchase_orders ADD COLUMN submitted_for_review_at INTEGER`);
  }
}
