import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Product,
  CartItem,
  Transaction,
  Screen,
  AppSettings,
  CheckoutPayload,
  Expense,
  ProductCategory,
  CashSession,
} from '../types';
import { db, newId } from '../db/database';
import { DEFAULT_APP_SETTINGS } from '../constants';
import { computeSessionPaymentTotals } from '../lib/reporting';

export function useAppState() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('dashboard');
  const [cart, setCart] = useState<CartItem[]>([]);

  const products =
    useLiveQuery(() => db.products.orderBy('id').toArray(), []) ?? [];
  const transactions =
    useLiveQuery(() => db.transactions.orderBy('createdAt').reverse().toArray(), []) ?? [];
  const expenses = useLiveQuery(() => db.expenses.orderBy('date').reverse().toArray(), []) ?? [];
  const appSettingsRow = useLiveQuery(() => db.appSettings.get('main'), []);
  const appSettings = useMemo(
    () => ({ ...DEFAULT_APP_SETTINGS, ...(appSettingsRow ?? {}) }),
    [appSettingsRow],
  );
  const productCategories =
    useLiveQuery(() => db.categories.orderBy('name').toArray(), []) ?? [];
  const cashSessions =
    useLiveQuery(() => db.cashSessions.orderBy('openedAt').reverse().toArray(), []) ?? [];

  const nameClashes = async (name: string, exceptId?: string) => {
    const lower = name.trim().toLowerCase();
    const rows = await db.categories.toArray();
    return rows.some((c) => c.id !== exceptId && c.name.trim().toLowerCase() === lower);
  };

  const addToCart = (product: Product) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item,
        );
      }
      return [...prev, { ...product, quantity: 1 }];
    });
  };

  const removeFromCart = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.id !== productId));
  };

  const updateCartQuantity = (productId: string, delta: number) => {
    setCart((prev) =>
      prev.map((item) => {
        if (item.id === productId) {
          const newQty = Math.max(1, item.quantity + delta);
          return { ...item, quantity: newQty };
        }
        return item;
      }),
    );
  };

  const clearCart = () => setCart([]);

  const processSale = async (payload: CheckoutPayload): Promise<Transaction> => {
    const amount = payload.amount > 0 ? payload.amount : payload.receipt.total;
    const newTransaction: Transaction = {
      id: newId(),
      orderNumber: `#${Math.floor(Math.random() * 90000) + 10000}`,
      customer: payload.customerName.trim() || 'Walk-in Customer',
      amount,
      status: 'completed',
      timestamp: 'Just now',
      type: 'sale',
      createdAt: Date.now(),
      receipt: payload.receipt,
      paymentMethod: payload.receipt.paymentMethod,
    };

    await db.transaction('rw', db.transactions, db.products, async () => {
      await db.transactions.add(newTransaction);
      for (const item of cart) {
        const p = await db.products.get(item.id);
        if (p) {
          await db.products.update(item.id, {
            stock: Math.max(0, p.stock - item.quantity),
          });
        }
      }
    });

    clearCart();
    return newTransaction;
  };

  const addProduct = async (product: Omit<Product, 'id'>) => {
    await db.products.add({ ...product, id: newId() });
  };

  const updateProduct = async (id: string, updates: Partial<Product>) => {
    await db.products.update(id, updates);
  };

  const deleteProduct = async (id: string) => {
    await db.products.delete(id);
  };

  const addExpense = async (row: Omit<Expense, 'id'>) => {
    await db.expenses.add({ ...row, id: newId() });
  };

  const updateExpense = async (id: string, updates: Partial<Expense>) => {
    await db.expenses.update(id, updates);
  };

  const deleteExpense = async (id: string) => {
    await db.expenses.delete(id);
  };

  const addTransaction = async (row: Omit<Transaction, 'id'>) => {
    await db.transactions.add({ ...row, id: newId() });
  };

  const updateTransaction = async (id: string, updates: Partial<Transaction>) => {
    await db.transactions.update(id, updates);
  };

  const deleteTransaction = async (id: string) => {
    await db.transactions.where('id').equals(id).delete();
  };

  const updateAppSettings = async (patch: Partial<Omit<AppSettings, 'id'>>) => {
    const existing = await db.appSettings.get('main');
    if (!existing) {
      await db.appSettings.put({ ...DEFAULT_APP_SETTINGS, ...patch, id: 'main' });
    } else {
      await db.appSettings.update('main', patch);
    }
  };

  const addProductCategory = async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (await nameClashes(trimmed)) {
      throw new Error('ERR_DUPLICATE_CATEGORY');
    }
    const row: ProductCategory = { id: newId(), name: trimmed };
    await db.categories.add(row);
  };

  const renameProductCategory = async (id: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    const row = await db.categories.get(id);
    if (!row) return;
    if (trimmed === row.name) return;
    if (await nameClashes(trimmed, id)) {
      throw new Error('ERR_DUPLICATE_CATEGORY');
    }
    await db.transaction('rw', db.products, db.categories, async () => {
      const affected = await db.products.where('category').equals(row.name).toArray();
      for (const p of affected) {
        await db.products.update(p.id, { category: trimmed });
      }
      await db.categories.update(id, { name: trimmed });
    });
  };

  const openCashSession = async (openingCash: number) => {
    const openCount = await db.cashSessions.filter((s) => s.closedAt == null).count();
    if (openCount > 0) {
      throw new Error('ERR_CASH_SESSION_OPEN');
    }
    const row: CashSession = {
      id: newId(),
      openedAt: Date.now(),
      closedAt: null,
      openingCash,
      closingCash: null,
      totalCashSales: 0,
      totalCardSales: 0,
      totalTransferSales: 0,
      totalOtherSales: 0,
    };
    await db.cashSessions.add(row);
  };

  const closeCashSession = async (id: string, closingCash: number) => {
    const s = await db.cashSessions.get(id);
    if (!s || s.closedAt != null) return;
    const closedAt = Date.now();
    const allTx = await db.transactions.toArray();
    const totals = computeSessionPaymentTotals(allTx, s.openedAt, closedAt);
    await db.cashSessions.update(id, {
      closedAt,
      closingCash,
      ...totals,
    });
  };

  const deleteProductCategory = async (id: string) => {
    const row = await db.categories.get(id);
    if (!row) return;
    const n = await db.products.where('category').equals(row.name).count();
    if (n > 0) {
      throw new Error(`ERR_CATEGORY_IN_USE|${n}|${encodeURIComponent(row.name)}`);
    }
    await db.categories.delete(id);
  };

  return {
    currentScreen,
    setCurrentScreen,
    products,
    cart,
    transactions,
    expenses,
    appSettings,
    productCategories,
    cashSessions,
    openCashSession,
    closeCashSession,
    addToCart,
    removeFromCart,
    updateCartQuantity,
    clearCart,
    processSale,
    addProduct,
    updateProduct,
    deleteProduct,
    addExpense,
    updateExpense,
    deleteExpense,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    updateAppSettings,
    addProductCategory,
    renameProductCategory,
    deleteProductCategory,
  };
}
