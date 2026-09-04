import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Product,
  CartItem,
  Transaction,
  Screen,
  AppSettings,
  CheckoutPayload,
  Expense,
  ProductCategory,
  ProductSubcategory,
  ProductLocation,
  CashSession,
} from '../types';
import { DEFAULT_APP_SETTINGS } from '../constants';
import { api, ApiConnectionError, ApiRequestError } from '../api/client';
import { useApiConnection, useApiPolling } from '../api/connection';

export function useAppState() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('dashboard');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [appSettings, setAppSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [productCategories, setProductCategories] = useState<ProductCategory[]>([]);
  const [productSubcategories, setProductSubcategories] = useState<ProductSubcategory[]>([]);
  const [productLocations, setProductLocations] = useState<ProductLocation[]>([]);
  const [cashSessions, setCashSessions] = useState<CashSession[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshAll = useCallback(async () => {
    const [p, t, e, s, c, subs, locs, cs] = await Promise.all([
      api.getProducts(),
      api.getTransactions(),
      api.getExpenses(),
      api.getSettings(),
      api.getCategories(),
      api.getSubcategories(),
      api.getLocations(),
      api.getCashSessions(),
    ]);
    setProducts(p);
    setTransactions(t);
    setExpenses(e);
    setAppSettings(s);
    setProductCategories(c);
    setProductSubcategories(subs);
    setProductLocations(locs);
    setCashSessions(cs);
  }, []);

  const refreshAfterMutation = useCallback(async () => {
    try {
      await refreshAll();
    } catch (err) {
      console.error('Failed to refresh data after mutation', err);
    }
  }, [refreshAll]);

  const checkHealth = useCallback(async () => {
    try {
      await api.health();
      return true;
    } catch {
      return false;
    }
  }, []);

  const { connected, checking, verify } = useApiConnection(checkHealth);

  const loadData = useCallback(async () => {
    try {
      await refreshAll();
    } catch (err) {
      if (!(err instanceof ApiConnectionError)) {
        console.error('Failed to load data from API', err);
      }
    } finally {
      setLoading(false);
    }
  }, [refreshAll]);

  useEffect(() => {
    void loadData();
  }, [loadData, connected]);

  useApiPolling(refreshAll, connected);

  const guardMutation = useCallback(() => {
    if (!connected) throw new ApiConnectionError();
  }, [connected]);

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
    guardMutation();
    const newTransaction = await api.processSale(payload);
    clearCart();
    await refreshAfterMutation();
    return newTransaction;
  };

  const addProduct = async (product: Omit<Product, 'id'>) => {
    guardMutation();
    await api.createProduct(product);
    await refreshAfterMutation();
  };

  const updateProduct = async (id: string, updates: Partial<Product>) => {
    guardMutation();
    if (updates.stock !== undefined && Object.keys(updates).length === 1) {
      await api.updateProductStock(id, updates.stock);
    } else {
      await api.updateProduct(id, updates);
    }
    await refreshAfterMutation();
  };

  const receiveProductStock = async (
    id: string,
    payload: { quantity: number; unitCost: number; price: number },
  ) => {
    guardMutation();
    await api.receiveProductStock(id, payload);
    await refreshAfterMutation();
  };

  const deleteProduct = async (id: string) => {
    guardMutation();
    await api.deleteProduct(id);
    void refreshAfterMutation();
  };

  const importProducts = async (
    rows: {
      name: string;
      category: string;
      subcategory: string;
      price: number;
      cost: number;
      stock: number;
      location?: string;
      sku?: string;
    }[],
  ) => {
    guardMutation();
    const result = await api.importProducts(rows);
    await refreshAfterMutation();
    return result;
  };

  const addExpense = async (row: Omit<Expense, 'id'>) => {
    guardMutation();
    await api.createExpense(row);
    await refreshAfterMutation();
  };

  const updateExpense = async (id: string, updates: Partial<Expense>) => {
    guardMutation();
    await api.updateExpense(id, updates);
    await refreshAfterMutation();
  };

  const deleteExpense = async (id: string) => {
    guardMutation();
    await api.deleteExpense(id);
    void refreshAfterMutation();
  };

  const addTransaction = async (row: Omit<Transaction, 'id'>) => {
    guardMutation();
    await api.createTransaction(row);
    await refreshAfterMutation();
  };

  const updateTransaction = async (id: string, updates: Partial<Transaction>) => {
    guardMutation();
    await api.updateTransaction(id, updates);
    await refreshAfterMutation();
  };

  const reverseSale = async (id: string) => {
    guardMutation();
    try {
      await api.reverseSale(id);
    } catch (err) {
      if (err instanceof ApiRequestError && err.code) {
        throw new Error(err.code);
      }
      throw err;
    }
    await refreshAfterMutation();
  };

  const updateAppSettings = async (patch: Partial<Omit<AppSettings, 'id'>>) => {
    guardMutation();
    const updated = await api.updateSettings(patch);
    setAppSettings(updated);
  };

  const addProductCategory = async (name: string) => {
    guardMutation();
    try {
      await api.createCategory(name);
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === 'ERR_DUPLICATE_CATEGORY') {
        throw new Error('ERR_DUPLICATE_CATEGORY');
      }
      throw err;
    }
    await refreshAfterMutation();
  };

  const renameProductCategory = async (id: string, newName: string) => {
    guardMutation();
    try {
      await api.renameCategory(id, newName);
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === 'ERR_DUPLICATE_CATEGORY') {
        throw new Error('ERR_DUPLICATE_CATEGORY');
      }
      throw err;
    }
    await refreshAfterMutation();
  };

  const openCashSession = async (openingCash: number) => {
    guardMutation();
    try {
      await api.openCashSession(openingCash);
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === 'ERR_CASH_SESSION_OPEN') {
        throw new Error('ERR_CASH_SESSION_OPEN');
      }
      throw err;
    }
    await refreshAfterMutation();
  };

  const closeCashSession = async (id: string, closingCash: number) => {
    guardMutation();
    await api.closeCashSession(id, closingCash);
    await refreshAfterMutation();
  };

  const deleteProductCategory = async (id: string) => {
    guardMutation();
    try {
      await api.deleteCategory(id);
    } catch (err) {
      if (err instanceof ApiRequestError && err.code?.startsWith('ERR_CATEGORY_IN_USE')) {
        throw new Error(err.code);
      }
      throw err;
    }
    void refreshAfterMutation();
  };

  const addSubcategory = async (row: { categoryId: string; name: string; code: string }) => {
    guardMutation();
    try {
      await api.createSubcategory(row);
    } catch (err) {
      if (err instanceof ApiRequestError) {
        if (err.code === 'ERR_DUPLICATE_SUBCATEGORY') throw new Error('ERR_DUPLICATE_SUBCATEGORY');
        if (err.code === 'ERR_DUPLICATE_SUBCATEGORY_CODE') throw new Error('ERR_DUPLICATE_SUBCATEGORY_CODE');
      }
      throw err;
    }
    await refreshAfterMutation();
  };

  const updateSubcategory = async (id: string, updates: { name?: string; code?: string }) => {
    guardMutation();
    try {
      await api.updateSubcategory(id, updates);
    } catch (err) {
      if (err instanceof ApiRequestError) {
        if (err.code === 'ERR_DUPLICATE_SUBCATEGORY') throw new Error('ERR_DUPLICATE_SUBCATEGORY');
        if (err.code === 'ERR_DUPLICATE_SUBCATEGORY_CODE') throw new Error('ERR_DUPLICATE_SUBCATEGORY_CODE');
      }
      throw err;
    }
    await refreshAfterMutation();
  };

  const deleteSubcategory = async (id: string) => {
    guardMutation();
    try {
      await api.deleteSubcategory(id);
    } catch (err) {
      if (err instanceof ApiRequestError && err.code?.startsWith('ERR_SUBCATEGORY_IN_USE')) {
        throw new Error(err.code);
      }
      throw err;
    }
    void refreshAfterMutation();
  };

  const addLocation = async (name: string) => {
    guardMutation();
    try {
      await api.createLocation(name);
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === 'ERR_DUPLICATE_LOCATION') {
        throw new Error('ERR_DUPLICATE_LOCATION');
      }
      throw err;
    }
    await refreshAfterMutation();
  };

  const updateLocation = async (id: string, name: string) => {
    guardMutation();
    try {
      await api.updateLocation(id, name);
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === 'ERR_DUPLICATE_LOCATION') {
        throw new Error('ERR_DUPLICATE_LOCATION');
      }
      throw err;
    }
    await refreshAfterMutation();
  };

  const deleteLocation = async (id: string) => {
    guardMutation();
    await api.deleteLocation(id);
    void refreshAfterMutation();
  };

  const fetchNextSku = async (categoryId: string, subcategoryId: string) => {
    guardMutation();
    const { sku } = await api.getNextSku(categoryId, subcategoryId);
    return sku;
  };

  const refreshData = useCallback(async () => {
    await refreshAll();
  }, [refreshAll]);

  const stableAppSettings = useMemo(
    () => ({ ...DEFAULT_APP_SETTINGS, ...appSettings }),
    [appSettings],
  );

  return {
    currentScreen,
    setCurrentScreen,
    products,
    cart,
    transactions,
    expenses,
    appSettings: stableAppSettings,
    productCategories,
    productSubcategories,
    productLocations,
    cashSessions,
    loading,
    apiConnected: connected,
    apiChecking: checking,
    retryApiConnection: verify,
    refreshData,
    openCashSession,
    closeCashSession,
    addToCart,
    removeFromCart,
    updateCartQuantity,
    clearCart,
    processSale,
    addProduct,
    updateProduct,
    receiveProductStock,
    deleteProduct,
    importProducts,
    addExpense,
    updateExpense,
    deleteExpense,
    addTransaction,
    updateTransaction,
    reverseSale,
    updateAppSettings,
    addProductCategory,
    renameProductCategory,
    deleteProductCategory,
    addSubcategory,
    updateSubcategory,
    deleteSubcategory,
    addLocation,
    updateLocation,
    deleteLocation,
    fetchNextSku,
  };
}

export { ApiConnectionError };
