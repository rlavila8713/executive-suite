import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Product,
  CartItem,
  Transaction,
  Screen,
  AppSettings,
  CheckoutPayload,
  Expense,
} from '../types';
import { db, newId } from '../db/database';
import { DEFAULT_APP_SETTINGS } from '../constants';

export function useAppState() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('dashboard');
  const [cart, setCart] = useState<CartItem[]>([]);

  const products =
    useLiveQuery(() => db.products.orderBy('id').toArray(), []) ?? [];
  const transactions =
    useLiveQuery(() => db.transactions.orderBy('createdAt').reverse().toArray(), []) ?? [];
  const expenses = useLiveQuery(() => db.expenses.orderBy('date').reverse().toArray(), []) ?? [];
  const appSettings =
    useLiveQuery(() => db.appSettings.get('main'), []) ?? DEFAULT_APP_SETTINGS;

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

  const processSale = async (payload: CheckoutPayload): Promise<void> => {
    const subtotal = cart.reduce((acc, item) => acc + item.price * item.quantity, 0);
    const amount = payload.amount > 0 ? payload.amount : subtotal;
    const newTransaction: Transaction = {
      id: newId(),
      orderNumber: `#${Math.floor(Math.random() * 90000) + 10000}`,
      customer: payload.customerName.trim() || 'Walk-in Customer',
      amount,
      status: 'completed',
      timestamp: 'Just now',
      type: 'sale',
      createdAt: Date.now(),
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
    await db.transactions.delete(id);
  };

  const updateAppSettings = async (patch: Partial<Omit<AppSettings, 'id'>>) => {
    const existing = await db.appSettings.get('main');
    if (!existing) {
      await db.appSettings.put({ ...DEFAULT_APP_SETTINGS, ...patch, id: 'main' });
    } else {
      await db.appSettings.update('main', patch);
    }
  };

  return {
    currentScreen,
    setCurrentScreen,
    products,
    cart,
    transactions,
    expenses,
    appSettings,
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
  };
}
