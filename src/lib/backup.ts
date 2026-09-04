import { api } from '../api/client';
import type {
  AppSettings,
  CashSession,
  Expense,
  Product,
  ProductCategory,
  SaleReceipt,
  SaleReceiptLine,
  Transaction,
} from '../types';
import { DEFAULT_APP_SETTINGS, DEFAULT_PRODUCT_CATEGORY_NAMES, MOCK_PRODUCTS } from '../constants';

const DEXIE_MIGRATED_KEY = 'executive-suite.dexieMigrated';

function wasDexieMigrated(): boolean {
  try {
    return localStorage.getItem(DEXIE_MIGRATED_KEY) === '1';
  } catch {
    return false;
  }
}

function markDexieMigrated(): void {
  try {
    localStorage.setItem(DEXIE_MIGRATED_KEY, '1');
  } catch {
    // ignore quota / private-mode failures
  }
}

/** True when the API still has only the demo seed, not user-created catalog rows. */
function apiIsFreshSeed(products: Product[], categories: ProductCategory[]): boolean {
  const mockIds = new Set(MOCK_PRODUCTS.map((p) => p.id));
  if (products.some((p) => !mockIds.has(p.id))) return false;
  if (products.length > MOCK_PRODUCTS.length) return false;
  const defaultNames = new Set<string>(DEFAULT_PRODUCT_CATEGORY_NAMES);
  return !categories.some((c) => !defaultNames.has(c.name));
}

/** Current export format. Imports still accept schema version 1–3. */
export const BACKUP_SCHEMA_VERSION = 4;

export type ExecutiveSuiteBackup = {
  schemaVersion: 1 | 2 | 3 | 4;
  exportedAt: string;
  app: 'executive-suite';
  products: Product[];
  transactions: Transaction[];
  expenses: Expense[];
  appSettings: AppSettings;
  /** Omitted on v1 backups; restore infers from product rows when missing or empty. */
  productCategories?: ProductCategory[];
  productSubcategories?: import('../types').ProductSubcategory[];
  productLocations?: import('../types').ProductLocation[];
  /** Cash drawer sessions (schema ≥ 3). */
  cashSessions?: CashSession[];
};

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function isProduct(x: unknown): x is Product {
  if (!isRecord(x)) return false;
  const extendedOk =
    (x.categoryId === undefined || typeof x.categoryId === 'string') &&
    (x.subcategoryId === undefined || typeof x.subcategoryId === 'string') &&
    (x.status === undefined || typeof x.status === 'string') &&
    (x.unitOfMeasure === undefined || typeof x.unitOfMeasure === 'string') &&
    (x.locationId === undefined || x.locationId === null || typeof x.locationId === 'string') &&
    (x.barcode === undefined || x.barcode === null || typeof x.barcode === 'string');
  return (
    typeof x.id === 'string' &&
    typeof x.name === 'string' &&
    typeof x.sku === 'string' &&
    typeof x.category === 'string' &&
    typeof x.price === 'number' &&
    typeof x.cost === 'number' &&
    typeof x.stock === 'number' &&
    typeof x.image === 'string' &&
    extendedOk
  );
}

function isSaleReceiptLine(x: unknown): x is SaleReceiptLine {
  if (!isRecord(x)) return false;
  const pidOk = x.productId === undefined || typeof x.productId === 'string';
  const snapOk = x.unitCostSnapshot === undefined || typeof x.unitCostSnapshot === 'number';
  return (
    typeof x.name === 'string' &&
    typeof x.sku === 'string' &&
    typeof x.quantity === 'number' &&
    typeof x.unitPrice === 'number' &&
    typeof x.lineTotal === 'number' &&
    pidOk &&
    snapOk
  );
}

function isSaleReceipt(x: unknown): x is SaleReceipt {
  if (!isRecord(x)) return false;
  if (!Array.isArray(x.lines) || !x.lines.every(isSaleReceiptLine)) return false;
  return (
    typeof x.storeName === 'string' &&
    typeof x.branch === 'string' &&
    typeof x.currency === 'string' &&
    typeof x.subtotal === 'number' &&
    typeof x.tax === 'number' &&
    typeof x.taxRatePercent === 'number' &&
    typeof x.total === 'number' &&
    (x.paymentMethod === 'cash' ||
      x.paymentMethod === 'card' ||
      x.paymentMethod === 'transfer' ||
      x.paymentMethod === 'other')
  );
}

function isTransaction(x: unknown): x is Transaction {
  if (!isRecord(x)) return false;
  const receiptOk = x.receipt === undefined || isSaleReceipt(x.receipt);
  const pmOk =
    x.paymentMethod === undefined ||
    x.paymentMethod === 'cash' ||
    x.paymentMethod === 'card' ||
    x.paymentMethod === 'transfer' ||
    x.paymentMethod === 'other';
  return (
    typeof x.id === 'string' &&
    typeof x.orderNumber === 'string' &&
    typeof x.customer === 'string' &&
    typeof x.amount === 'number' &&
    typeof x.status === 'string' &&
    typeof x.timestamp === 'string' &&
    typeof x.type === 'string' &&
    typeof x.createdAt === 'number' &&
    receiptOk &&
    pmOk
  );
}

function isCashSession(x: unknown): x is CashSession {
  if (!isRecord(x)) return false;
  return (
    typeof x.id === 'string' &&
    typeof x.openedAt === 'number' &&
    (x.closedAt === null || typeof x.closedAt === 'number') &&
    typeof x.openingCash === 'number' &&
    (x.closingCash === null || typeof x.closingCash === 'number') &&
    typeof x.totalCashSales === 'number' &&
    typeof x.totalCardSales === 'number' &&
    typeof x.totalTransferSales === 'number' &&
    typeof x.totalOtherSales === 'number'
  );
}

function isExpense(x: unknown): x is Expense {
  if (!isRecord(x)) return false;
  return (
    typeof x.id === 'string' &&
    typeof x.title === 'string' &&
    typeof x.amount === 'number' &&
    typeof x.category === 'string' &&
    typeof x.date === 'string'
  );
}

function isAppSettings(x: unknown): x is AppSettings {
  if (!isRecord(x)) return false;
  const localeOk = x.locale === undefined || x.locale === 'es' || x.locale === 'en';
  const cardQrOk = x.cardQrPayload === undefined || typeof x.cardQrPayload === 'string';
  return (
    x.id === 'main' &&
    typeof x.storeName === 'string' &&
    typeof x.branch === 'string' &&
    typeof x.currency === 'string' &&
    typeof x.taxRate === 'number' &&
    cardQrOk &&
    typeof x.darkMode === 'boolean' &&
    typeof x.lowStockNotifications === 'boolean' &&
    typeof x.managerName === 'string' &&
    typeof x.managerTitle === 'string' &&
    localeOk
  );
}

function isProductCategory(x: unknown): x is ProductCategory {
  if (!isRecord(x)) return false;
  return typeof x.id === 'string' && typeof x.name === 'string' && (x.code === undefined || typeof x.code === 'string');
}

export function parseBackupJson(text: string): ExecutiveSuiteBackup {
  let raw: unknown;
  try {
    raw = JSON.parse(text) as unknown;
  } catch {
    throw new Error('The file is not valid JSON.');
  }
  if (!isRecord(raw)) throw new Error('Backup must be a JSON object.');
  if (raw.app !== 'executive-suite') {
    throw new Error('This file is not an Executive Suite backup.');
  }
  if (raw.schemaVersion !== 1 && raw.schemaVersion !== 2 && raw.schemaVersion !== 3 && raw.schemaVersion !== 4) {
    throw new Error(`Unsupported backup version: ${String(raw.schemaVersion)}. Expected 1, 2, 3, or 4.`);
  }
  if (raw.productCategories !== undefined && raw.productCategories !== null) {
    if (!Array.isArray(raw.productCategories) || !raw.productCategories.every(isProductCategory)) {
      throw new Error('Invalid "productCategories" array.');
    }
  }
  if (!Array.isArray(raw.products) || !raw.products.every(isProduct)) {
    throw new Error('Invalid or missing "products" array.');
  }
  if (!Array.isArray(raw.transactions) || !raw.transactions.every(isTransaction)) {
    throw new Error('Invalid or missing "transactions" array.');
  }
  if (!Array.isArray(raw.expenses) || !raw.expenses.every(isExpense)) {
    throw new Error('Invalid or missing "expenses" array.');
  }
  if (!isAppSettings(raw.appSettings)) {
    throw new Error('Invalid or missing "appSettings" object.');
  }
  if (raw.cashSessions !== undefined && raw.cashSessions !== null) {
    if (!Array.isArray(raw.cashSessions) || !raw.cashSessions.every(isCashSession)) {
      throw new Error('Invalid "cashSessions" array.');
    }
  }
  return raw as ExecutiveSuiteBackup;
}

export async function buildBackupSnapshot(): Promise<ExecutiveSuiteBackup> {
  return api.exportBackup();
}

export function downloadBackupFile(data: ExecutiveSuiteBackup): void {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  a.href = url;
  a.download = `executive-suite-backup-${stamp}.json`;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Replaces all server data with the backup contents. */
export async function restoreBackupSnapshot(data: ExecutiveSuiteBackup): Promise<void> {
  await api.importBackup(data);
}

export async function readBackupFromFile(file: File): Promise<ExecutiveSuiteBackup> {
  const text = await file.text();
  return parseBackupJson(text);
}

/**
 * Migrate legacy IndexedDB data to the API server once.
 * Must not run on every refresh: importBackup replaces the entire SQLite database.
 */
export async function migrateDexieToApi(): Promise<boolean> {
  try {
    if (wasDexieMigrated()) return false;

    const { db } = await import('../db/database');
    await db.open();
    const [products, transactions, expenses, settingsRows, productCategories, cashSessions] = await Promise.all([
      db.products.toArray(),
      db.transactions.toArray(),
      db.expenses.toArray(),
      db.appSettings.toArray(),
      db.categories.toArray(),
      db.cashSessions.toArray(),
    ]);
    const hasData =
      products.length > 0 ||
      transactions.length > 0 ||
      expenses.length > 0 ||
      productCategories.length > 0 ||
      cashSessions.length > 0;

    const discardIndexedDb = async (): Promise<false> => {
      try {
        await db.delete();
      } catch {
        // leftover IndexedDB is harmless once the flag is set
      }
      markDexieMigrated();
      return false;
    };

    if (!hasData) return discardIndexedDb();

    let apiProducts: Product[];
    let apiCategories: ProductCategory[];
    try {
      [apiProducts, apiCategories] = await Promise.all([api.getProducts(), api.getCategories()]);
    } catch {
      return false;
    }

    // API already has user data — never clobber it with a stale IndexedDB snapshot.
    if (!apiIsFreshSeed(apiProducts, apiCategories)) return discardIndexedDb();

    const appSettings = settingsRows[0] ?? DEFAULT_APP_SETTINGS;
    await api.importBackup({
      schemaVersion: BACKUP_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      app: 'executive-suite',
      products,
      transactions,
      expenses,
      appSettings,
      productCategories,
      cashSessions,
    });
    await db.delete();
    markDexieMigrated();
    return true;
  } catch {
    return false;
  }
}
