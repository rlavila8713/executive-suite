import { db } from '../db/database';
import type { AppSettings, Expense, Product, Transaction } from '../types';
import { DEFAULT_APP_SETTINGS } from '../constants';

export const BACKUP_SCHEMA_VERSION = 1;

export type ExecutiveSuiteBackup = {
  schemaVersion: typeof BACKUP_SCHEMA_VERSION;
  exportedAt: string;
  app: 'executive-suite';
  products: Product[];
  transactions: Transaction[];
  expenses: Expense[];
  appSettings: AppSettings;
};

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function isProduct(x: unknown): x is Product {
  if (!isRecord(x)) return false;
  return (
    typeof x.id === 'string' &&
    typeof x.name === 'string' &&
    typeof x.sku === 'string' &&
    typeof x.category === 'string' &&
    typeof x.price === 'number' &&
    typeof x.cost === 'number' &&
    typeof x.stock === 'number' &&
    typeof x.image === 'string'
  );
}

function isTransaction(x: unknown): x is Transaction {
  if (!isRecord(x)) return false;
  return (
    typeof x.id === 'string' &&
    typeof x.orderNumber === 'string' &&
    typeof x.customer === 'string' &&
    typeof x.amount === 'number' &&
    typeof x.status === 'string' &&
    typeof x.timestamp === 'string' &&
    typeof x.type === 'string' &&
    typeof x.createdAt === 'number'
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
  return (
    x.id === 'main' &&
    typeof x.storeName === 'string' &&
    typeof x.branch === 'string' &&
    typeof x.currency === 'string' &&
    typeof x.taxRate === 'number' &&
    typeof x.darkMode === 'boolean' &&
    typeof x.lowStockNotifications === 'boolean' &&
    typeof x.managerName === 'string' &&
    typeof x.managerTitle === 'string'
  );
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
  if (raw.schemaVersion !== BACKUP_SCHEMA_VERSION) {
    throw new Error(`Unsupported backup version: ${String(raw.schemaVersion)}. Expected ${BACKUP_SCHEMA_VERSION}.`);
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
  return raw as ExecutiveSuiteBackup;
}

export async function buildBackupSnapshot(): Promise<ExecutiveSuiteBackup> {
  await db.open();
  const [products, transactions, expenses, settingsRows] = await Promise.all([
    db.products.toArray(),
    db.transactions.toArray(),
    db.expenses.toArray(),
    db.appSettings.toArray(),
  ]);
  const appSettings = settingsRows[0] ?? DEFAULT_APP_SETTINGS;
  return {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    app: 'executive-suite',
    products,
    transactions,
    expenses,
    appSettings,
  };
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

/** Replaces all local tables with the backup contents. */
export async function restoreBackupSnapshot(data: ExecutiveSuiteBackup): Promise<void> {
  const appSettings: AppSettings = {
    ...DEFAULT_APP_SETTINGS,
    ...data.appSettings,
    id: 'main',
  };

  await db.transaction('rw', db.products, db.transactions, db.expenses, db.appSettings, async () => {
    await db.products.clear();
    await db.transactions.clear();
    await db.expenses.clear();
    await db.appSettings.clear();

    if (data.products.length) await db.products.bulkAdd(data.products);
    if (data.transactions.length) await db.transactions.bulkAdd(data.transactions);
    if (data.expenses.length) await db.expenses.bulkAdd(data.expenses);
    await db.appSettings.add(appSettings);
  });
}

export async function readBackupFromFile(file: File): Promise<ExecutiveSuiteBackup> {
  const text = await file.text();
  return parseBackupJson(text);
}
