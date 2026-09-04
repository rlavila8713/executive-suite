import Dexie, { type EntityTable } from 'dexie';
import type { AppSettings, CashSession, Expense, Product, ProductCategory, Transaction } from '../types';
import {
  DEFAULT_APP_SETTINGS,
  DEFAULT_PRODUCT_CATEGORY_NAMES,
  MOCK_EXPENSES,
  MOCK_PRODUCTS,
  MOCK_TRANSACTIONS,
} from '../constants';
import { codeFromCategoryName } from '../lib/sku';

export class ExecutiveSuiteDB extends Dexie {
  products!: EntityTable<Product, 'id'>;
  transactions!: EntityTable<Transaction, 'id'>;
  expenses!: EntityTable<Expense, 'id'>;
  appSettings!: EntityTable<AppSettings, 'id'>;
  categories!: EntityTable<ProductCategory, 'id'>;
  cashSessions!: EntityTable<CashSession, 'id'>;

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
    this.version(3).stores({
      categories: 'id, name',
    });
    this.version(4)
      .stores({
        cashSessions: 'id, openedAt, closedAt',
      })
      .upgrade(async (trans) => {
        const tTable = trans.table('transactions');
        await tTable.toCollection().modify((row: Record<string, unknown>) => {
          if (row.paymentMethod != null) return;
          const pm = (row.receipt as { paymentMethod?: string } | undefined)?.paymentMethod;
          row.paymentMethod =
            pm === 'cash' || pm === 'card' || pm === 'transfer' || pm === 'other' ? pm : 'other';
        });
      });
  }
}

export const db = new ExecutiveSuiteDB();

/** Opens IndexedDB and seeds demo rows for any empty table. */
export async function ensureSeeded(): Promise<void> {
  await db.open();
  await db.transaction(
    'rw',
    [db.products, db.transactions, db.expenses, db.appSettings, db.categories, db.cashSessions],
    async () => {
      if ((await db.categories.count()) === 0) {
        if ((await db.products.count()) === 0) {
          await db.categories.bulkAdd(
            DEFAULT_PRODUCT_CATEGORY_NAMES.map((name) => ({ id: newId(), name, code: codeFromCategoryName(name) })),
          );
        } else {
          const prods = await db.products.toArray();
          const names = [
            ...new Set(prods.map((p) => p.category.trim()).filter(Boolean)),
          ].sort((a, b) => a.localeCompare(b));
          if (names.length > 0) {
            await db.categories.bulkAdd(names.map((name) => ({ id: newId(), name, code: codeFromCategoryName(name) })));
          }
        }
      }
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
    },
  );
}

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2, 11);
}

export { newId };
