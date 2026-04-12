import Dexie, { type EntityTable } from 'dexie';
import type { AppSettings, Expense, Product, Transaction } from '../types';
import {
  DEFAULT_APP_SETTINGS,
  MOCK_EXPENSES,
  MOCK_PRODUCTS,
  MOCK_TRANSACTIONS,
} from '../constants';

export class ExecutiveSuiteDB extends Dexie {
  products!: EntityTable<Product, 'id'>;
  transactions!: EntityTable<Transaction, 'id'>;
  expenses!: EntityTable<Expense, 'id'>;
  appSettings!: EntityTable<AppSettings, 'id'>;

  constructor() {
    super('executive-suite');
    this.version(1).stores({
      products: 'id, sku, category',
      transactions: 'id, createdAt, orderNumber',
      expenses: 'id, category, date',
    });
    this.version(2).stores({
      appSettings: 'id',
    });
  }
}

export const db = new ExecutiveSuiteDB();

/** Opens IndexedDB and seeds demo rows for any empty table. */
export async function ensureSeeded(): Promise<void> {
  await db.open();
  await db.transaction('rw', db.products, db.transactions, db.expenses, db.appSettings, async () => {
    if ((await db.products.count()) === 0) {
      await db.products.bulkAdd(MOCK_PRODUCTS);
    }
    if ((await db.transactions.count()) === 0) {
      await db.transactions.bulkAdd(MOCK_TRANSACTIONS);
    }
    if ((await db.expenses.count()) === 0) {
      await db.expenses.bulkAdd(MOCK_EXPENSES);
    }
    if ((await db.appSettings.count()) === 0) {
      await db.appSettings.add(DEFAULT_APP_SETTINGS);
    }
  });
}

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2, 11);
}

export { newId };
