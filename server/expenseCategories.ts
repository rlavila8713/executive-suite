import type { SqliteStore } from './db.js';
import { newId } from './db.js';
import { ApiError } from './apiError.js';

export const INVENTORY_CONSUMPTION_CATEGORY_CODE = 'INVENTORY_CONSUMPTION';

export type ExpenseCategoryRow = {
  id: string;
  name: string;
  code: string;
  is_system: number;
  created_at: number;
};

export function migrateExpenseCategoriesSchema(db: SqliteStore): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS expense_categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT NOT NULL UNIQUE,
      is_system INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_expense_categories_name ON expense_categories(name COLLATE NOCASE);
  `);
  seedSystemExpenseCategories(db);
}

function seedSystemExpenseCategories(db: SqliteStore): void {
  const existing = db
    .prepare('SELECT id FROM expense_categories WHERE code = ? LIMIT 1')
    .get(INVENTORY_CONSUMPTION_CATEGORY_CODE);
  if (existing) return;
  db.prepare(
    'INSERT INTO expense_categories (id, name, code, is_system, created_at) VALUES (?, ?, ?, 1, ?)',
  ).run(
    newId(),
    'Consumo de inventario',
    INVENTORY_CONSUMPTION_CATEGORY_CODE,
    Date.now(),
  );
}

export function rowToExpenseCategory(row: ExpenseCategoryRow) {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    isSystem: row.is_system === 1,
    createdAt: row.created_at,
  };
}

export function listExpenseCategories(db: SqliteStore) {
  const rows = db.prepare('SELECT * FROM expense_categories ORDER BY is_system DESC, name').all() as ExpenseCategoryRow[];
  return rows.map(rowToExpenseCategory);
}

export function getExpenseCategoryById(db: SqliteStore, id: string) {
  const row = db.prepare('SELECT * FROM expense_categories WHERE id = ?').get(id) as ExpenseCategoryRow | undefined;
  return row ? rowToExpenseCategory(row) : null;
}

export function getExpenseCategoryByCode(db: SqliteStore, code: string) {
  const row = db.prepare('SELECT * FROM expense_categories WHERE code = ?').get(code) as ExpenseCategoryRow | undefined;
  return row ? rowToExpenseCategory(row) : null;
}

export function createExpenseCategory(db: SqliteStore, name: string): ReturnType<typeof rowToExpenseCategory> {
  const trimmed = name.trim();
  if (!trimmed) throw new ApiError(400, 'Name required');
  const code = trimmed
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 48);
  if (!code) throw new ApiError(400, 'Invalid name');
  const clash = db.prepare('SELECT id FROM expense_categories WHERE code = ? OR name = ? COLLATE NOCASE').get(code, trimmed);
  if (clash) throw new ApiError(409, 'Duplicate expense category', 'ERR_DUPLICATE_EXPENSE_CATEGORY');
  const id = newId();
  const now = Date.now();
  db.prepare('INSERT INTO expense_categories (id, name, code, is_system, created_at) VALUES (?, ?, ?, 0, ?)').run(
    id,
    trimmed,
    code,
    now,
  );
  return rowToExpenseCategory(db.prepare('SELECT * FROM expense_categories WHERE id = ?').get(id) as ExpenseCategoryRow);
}

export function renameExpenseCategory(db: SqliteStore, id: string, name: string): ReturnType<typeof rowToExpenseCategory> {
  const row = db.prepare('SELECT * FROM expense_categories WHERE id = ?').get(id) as ExpenseCategoryRow | undefined;
  if (!row) throw new ApiError(404, 'Category not found');
  if (row.is_system === 1) throw new ApiError(409, 'System category cannot be renamed', 'ERR_EXPENSE_CATEGORY_SYSTEM');
  const trimmed = name.trim();
  if (!trimmed) throw new ApiError(400, 'Name required');
  const clash = db
    .prepare('SELECT id FROM expense_categories WHERE name = ? COLLATE NOCASE AND id != ?')
    .get(trimmed, id);
  if (clash) throw new ApiError(409, 'Duplicate expense category', 'ERR_DUPLICATE_EXPENSE_CATEGORY');
  db.prepare('UPDATE expense_categories SET name = ? WHERE id = ?').run(trimmed, id);
  return rowToExpenseCategory(db.prepare('SELECT * FROM expense_categories WHERE id = ?').get(id) as ExpenseCategoryRow);
}

export function deleteExpenseCategory(db: SqliteStore, id: string): void {
  const row = db.prepare('SELECT * FROM expense_categories WHERE id = ?').get(id) as ExpenseCategoryRow | undefined;
  if (!row) throw new ApiError(404, 'Category not found');
  if (row.is_system === 1) throw new ApiError(409, 'System category cannot be deleted', 'ERR_EXPENSE_CATEGORY_SYSTEM');
  const used = db.prepare('SELECT COUNT(*) AS c FROM expenses WHERE category = ?').get(row.name) as { c: number };
  if (used.c > 0) {
    throw new ApiError(409, 'Category in use', `ERR_EXPENSE_CATEGORY_IN_USE|${used.c}`);
  }
  db.prepare('DELETE FROM expense_categories WHERE id = ?').run(id);
}
