import fs from 'node:fs';
import path from 'node:path';
import initSqlJs, { type Database as SqlDatabase } from 'sql.js';
import {
  DEFAULT_APP_SETTINGS,
  DEFAULT_PRODUCT_CATEGORY_NAMES,
  MOCK_EXPENSES,
  MOCK_PRODUCTS,
  MOCK_TRANSACTIONS,
} from './constants.js';
import { codeFromCategoryName, migrateCatalogSchema } from './migrations.js';

export function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2, 11);
}

export function getDataDir(): string {
  return process.env.DATA_DIR ?? path.join(process.cwd(), 'data');
}

export function getDbPath(): string {
  return path.join(getDataDir(), 'executive-suite.sqlite');
}

class Statement {
  constructor(
    private db: SqlDatabase,
    private sql: string,
    private shouldPersist: () => void,
  ) {}

  all(...params: unknown[]): Record<string, unknown>[] {
    const stmt = this.db.prepare(this.sql);
    try {
      if (params.length) stmt.bind(params);
      const rows: Record<string, unknown>[] = [];
      while (stmt.step()) {
        rows.push(stmt.getAsObject() as Record<string, unknown>);
      }
      return rows;
    } finally {
      stmt.free();
    }
  }

  get(...params: unknown[]): Record<string, unknown> | undefined {
    return this.all(...params)[0];
  }

  run(...params: unknown[]): { changes: number } {
    this.db.run(this.sql, params as (string | number | null)[]);
    const changes = this.db.getRowsModified();
    this.shouldPersist();
    return { changes };
  }
}

export class SqliteStore {
  private inTransaction = false;

  constructor(
    private db: SqlDatabase,
    private persist: () => void,
  ) {}

  private persistIfNeeded(): void {
    if (!this.inTransaction) this.persist();
  }

  prepare(sql: string): Statement {
    return new Statement(this.db, sql, () => this.persistIfNeeded());
  }

  exec(sql: string): void {
    this.db.exec(sql);
    this.persistIfNeeded();
  }

  runInTransaction(fn: () => void): void {
    this.inTransaction = true;
    this.db.run('BEGIN');
    try {
      fn();
      this.db.run('COMMIT');
      this.persist();
    } catch (err) {
      try {
        this.db.run('ROLLBACK');
      } catch {
        // ignore rollback errors
      }
      throw err;
    } finally {
      this.inTransaction = false;
    }
  }
}

let store: SqliteStore | null = null;
let initPromise: Promise<void> | null = null;

function persistDb(db: SqlDatabase): void {
  const dataDir = getDataDir();
  fs.mkdirSync(dataDir, { recursive: true });
  const data = db.export();
  fs.writeFileSync(getDbPath(), Buffer.from(data));
}

export async function initDb(): Promise<void> {
  if (store) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const SQL = await initSqlJs();
    const dbPath = getDbPath();
    fs.mkdirSync(getDataDir(), { recursive: true });
    const db = fs.existsSync(dbPath)
      ? new SQL.Database(fs.readFileSync(dbPath))
      : new SQL.Database();
    const sqliteStore = new SqliteStore(db, () => persistDb(db));
    initSchema(sqliteStore);
    migrateCatalogSchema(sqliteStore);
    ensureSeeded(sqliteStore);
    persistDb(db);
    store = sqliteStore;
  })();

  return initPromise;
}

export function getDb(): SqliteStore {
  if (!store) throw new Error('Database not initialized. Call initDb() first.');
  return store;
}

export function closeDb(): void {
  store = null;
  initPromise = null;
}

function initSchema(db: SqliteStore): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      sku TEXT NOT NULL,
      category TEXT NOT NULL,
      price REAL NOT NULL,
      cost REAL NOT NULL,
      stock INTEGER NOT NULL DEFAULT 0,
      image TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
    CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      order_number TEXT NOT NULL,
      customer TEXT NOT NULL,
      amount REAL NOT NULL,
      status TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      type TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      payment_method TEXT,
      receipt_json TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);

    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      amount REAL NOT NULL,
      category TEXT NOT NULL,
      date TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      id TEXT PRIMARY KEY DEFAULT 'main',
      store_name TEXT NOT NULL,
      branch TEXT NOT NULL,
      currency TEXT NOT NULL,
      tax_rate REAL NOT NULL,
      card_qr_payload TEXT NOT NULL DEFAULT '',
      dark_mode INTEGER NOT NULL DEFAULT 0,
      low_stock_notifications INTEGER NOT NULL DEFAULT 1,
      manager_name TEXT NOT NULL,
      manager_title TEXT NOT NULL,
      locale TEXT NOT NULL DEFAULT 'es'
    );

    CREATE TABLE IF NOT EXISTS cash_sessions (
      id TEXT PRIMARY KEY,
      opened_at INTEGER NOT NULL,
      closed_at INTEGER,
      opening_cash REAL NOT NULL,
      closing_cash REAL,
      total_cash_sales REAL NOT NULL DEFAULT 0,
      total_card_sales REAL NOT NULL DEFAULT 0,
      total_transfer_sales REAL NOT NULL DEFAULT 0,
      total_other_sales REAL NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_cash_sessions_opened_at ON cash_sessions(opened_at);
  `);
}

function ensureSeeded(db: SqliteStore): void {
  const productCount = db.prepare('SELECT COUNT(*) AS c FROM products').get() as { c: number };
  const categoryCount = db.prepare('SELECT COUNT(*) AS c FROM categories').get() as { c: number };
  const txCount = db.prepare('SELECT COUNT(*) AS c FROM transactions').get() as { c: number };
  const expenseCount = db.prepare('SELECT COUNT(*) AS c FROM expenses').get() as { c: number };
  const settingsCount = db.prepare('SELECT COUNT(*) AS c FROM app_settings').get() as { c: number };

  db.runInTransaction(() => {
    if (categoryCount.c === 0) {
      if (productCount.c === 0) {
        for (const name of DEFAULT_PRODUCT_CATEGORY_NAMES) {
          const catId = newId();
          const code = codeFromCategoryName(name);
          db.prepare('INSERT INTO categories (id, name, code) VALUES (?, ?, ?)').run(catId, name, code);
          db.prepare('INSERT INTO subcategories (id, category_id, name, code) VALUES (?, ?, ?, ?)').run(
            newId(),
            catId,
            'General',
            'GEN',
          );
        }
      } else {
        const prods = db.prepare('SELECT DISTINCT category FROM products').all() as { category: string }[];
        const names = [...new Set(prods.map((p) => p.category.trim()).filter(Boolean))].sort();
        for (const name of names) {
          const catId = newId();
          const code = codeFromCategoryName(name);
          db.prepare('INSERT OR IGNORE INTO categories (id, name, code) VALUES (?, ?, ?)').run(catId, name, code);
        }
      }
    }

    if (productCount.c === 0) {
      const insertProduct = db.prepare(
        'INSERT INTO products (id, name, sku, category, price, cost, stock, image) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      );
      for (const p of MOCK_PRODUCTS) {
        insertProduct.run(p.id, p.name, p.sku, p.category, p.price, p.cost, p.stock, p.image);
      }
    }

    if (txCount.c === 0) {
      const insertTx = db.prepare(
        `INSERT INTO transactions (id, order_number, customer, amount, status, timestamp, type, created_at, payment_method, receipt_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const tx of MOCK_TRANSACTIONS) {
        insertTx.run(
          tx.id,
          tx.orderNumber,
          tx.customer,
          tx.amount,
          tx.status,
          tx.timestamp,
          tx.type,
          tx.createdAt,
          tx.paymentMethod ?? null,
          tx.receipt ? JSON.stringify(tx.receipt) : null,
        );
      }
    }

    if (expenseCount.c === 0) {
      const insertExpense = db.prepare(
        'INSERT INTO expenses (id, title, amount, category, date) VALUES (?, ?, ?, ?, ?)',
      );
      for (const e of MOCK_EXPENSES) {
        insertExpense.run(e.id, e.title, e.amount, e.category, e.date);
      }
    }

    if (settingsCount.c === 0) {
      const s = DEFAULT_APP_SETTINGS;
      db.prepare(
        `INSERT INTO app_settings (id, store_name, branch, currency, tax_rate, card_qr_payload, dark_mode, low_stock_notifications, manager_name, manager_title, locale)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        s.id,
        s.storeName,
        s.branch,
        s.currency,
        s.taxRate,
        s.cardQrPayload,
        s.darkMode ? 1 : 0,
        s.lowStockNotifications ? 1 : 0,
        s.managerName,
        s.managerTitle,
        s.locale,
      );
    }
  });
}

// --- Row mappers ---

export type ProductRow = {
  id: string;
  name: string;
  sku: string;
  category: string;
  price: number;
  cost: number;
  stock: number;
  image: string;
  category_id?: string;
  subcategory_id?: string;
  subcategory?: string;
  status?: string;
  unit_of_measure?: string;
  location_id?: string | null;
  barcode?: string | null;
};

export function rowToProduct(row: ProductRow) {
  return {
    id: row.id,
    name: row.name,
    sku: row.sku,
    category: row.category,
    price: row.price,
    cost: row.cost,
    stock: row.stock,
    image: row.image,
    categoryId: row.category_id ?? '',
    subcategoryId: row.subcategory_id ?? '',
    subcategory: row.subcategory ?? '',
    status: (row.status ?? 'active') as 'active' | 'inactive' | 'pending',
    unitOfMeasure: (row.unit_of_measure ?? 'unidad') as
      | 'unidad'
      | 'par'
      | 'caja'
      | 'paquete'
      | 'metro'
      | 'kg'
      | 'litro',
    locationId: row.location_id ?? null,
    barcode: row.barcode ?? null,
  };
}

export function rowToCategory(row: { id: string; name: string; code?: string }) {
  return {
    id: row.id,
    name: row.name,
    code: row.code ?? codeFromCategoryName(row.name),
  };
}

export function rowToTransaction(row: {
  id: string;
  order_number: string;
  customer: string;
  amount: number;
  status: string;
  timestamp: string;
  type: string;
  created_at: number;
  payment_method: string | null;
  receipt_json: string | null;
}) {
  return {
    id: row.id,
    orderNumber: row.order_number,
    customer: row.customer,
    amount: row.amount,
    status: row.status,
    timestamp: row.timestamp,
    type: row.type,
    createdAt: row.created_at,
    paymentMethod: row.payment_method ?? undefined,
    receipt: row.receipt_json ? JSON.parse(row.receipt_json) : undefined,
  };
}

export function rowToExpense(row: { id: string; title: string; amount: number; category: string; date: string }) {
  return { id: row.id, title: row.title, amount: row.amount, category: row.category, date: row.date };
}

export function rowToCashSession(row: {
  id: string;
  opened_at: number;
  closed_at: number | null;
  opening_cash: number;
  closing_cash: number | null;
  total_cash_sales: number;
  total_card_sales: number;
  total_transfer_sales: number;
  total_other_sales: number;
}) {
  return {
    id: row.id,
    openedAt: row.opened_at,
    closedAt: row.closed_at,
    openingCash: row.opening_cash,
    closingCash: row.closing_cash,
    totalCashSales: row.total_cash_sales,
    totalCardSales: row.total_card_sales,
    totalTransferSales: row.total_transfer_sales,
    totalOtherSales: row.total_other_sales,
  };
}

export function rowToAppSettings(row: {
  id: string;
  store_name: string;
  branch: string;
  currency: string;
  tax_rate: number;
  card_qr_payload: string;
  dark_mode: number;
  low_stock_notifications: number;
  manager_name: string;
  manager_title: string;
  locale: string;
}) {
  return {
    id: 'main' as const,
    storeName: row.store_name,
    branch: row.branch,
    currency: row.currency,
    taxRate: row.tax_rate,
    cardQrPayload: row.card_qr_payload,
    darkMode: row.dark_mode === 1,
    lowStockNotifications: row.low_stock_notifications === 1,
    managerName: row.manager_name,
    managerTitle: row.manager_title,
    locale: row.locale as 'es' | 'en',
  };
}
