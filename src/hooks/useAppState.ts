import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  LicenseInfo,
  LicensePlanId,
} from '../types';
import { DEFAULT_APP_SETTINGS } from '../constants';
import { api, ApiConnectionError, ApiRequestError } from '../api/client';
import { useApiConnection, useApiPolling } from '../api/connection';
import { removeById, upsertById } from '../lib/utils';

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
  const [licenseInfo, setLicenseInfo] = useState<LicenseInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const refreshGen = useRef(0);

  const refreshAll = useCallback(async () => {
    const gen = ++refreshGen.current;
    const [p, t, e, s, c, subs, locs, cs, lic] = await Promise.all([
      api.getProducts({ includeImages: false }),
      api.getTransactions(),
      api.getExpenses(),
      api.getSettings(),
      api.getCategories(),
      api.getSubcategories(),
      api.getLocations(),
      api.getCashSessions(),
      api.getLicense(),
    ]);
    if (gen !== refreshGen.current) return;
    setProducts(p);
    setTransactions(t);
    setExpenses(e);
    setAppSettings(s);
    setProductCategories(c);
    setProductSubcategories(subs);
    setProductLocations(locs);
    setCashSessions(cs);
    setLicenseInfo(lic);
    setCart((prev) =>
      prev.map((item) => {
        const fresh = p.find((product) => product.id === item.id);
        return fresh ? { ...fresh, quantity: item.quantity } : item;
      }),
    );
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

  const beginLocalCommit = useCallback(() => {
    refreshGen.current += 1;
  }, []);

  const applyProduct = useCallback(
    (product: Product) => {
      beginLocalCommit();
      const listed = product.imageUrl ? { ...product, image: '' } : product;
      setProducts((prev) => upsertById(prev, listed));
      setCart((prev) =>
        prev.map((item) => (item.id === listed.id ? { ...listed, quantity: item.quantity } : item)),
      );
    },
    [beginLocalCommit],
  );

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
    beginLocalCommit();
    setTransactions((prev) => [newTransaction, ...prev]);
    clearCart();
    await refreshAfterMutation();
    return newTransaction;
  };

  const addProduct = async (product: Omit<Product, 'id'>) => {
    guardMutation();
    const created = await api.createProduct(product);
    applyProduct(created);
    void refreshAfterMutation();
  };

  const updateProduct = async (id: string, updates: Partial<Product>) => {
    guardMutation();
    const updated =
      updates.stock !== undefined && Object.keys(updates).length === 1
        ? await api.updateProductStock(id, updates.stock)
        : await api.updateProduct(id, updates);
    applyProduct(updated);
    void refreshAfterMutation();
  };

  const receiveProductStock = async (
    id: string,
    payload: { quantity: number; unitCost: number; price: number },
  ) => {
    guardMutation();
    const result = await api.receiveProductStock(id, payload);
    applyProduct(result.product);
    void refreshAfterMutation();
  };

  const deleteProduct = async (id: string) => {
    guardMutation();
    await api.deleteProduct(id);
    beginLocalCommit();
    setProducts((prev) => removeById(prev, id));
    setCart((prev) => prev.filter((item) => item.id !== id));
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
    const created = await api.createExpense(row);
    beginLocalCommit();
    setExpenses((prev) => upsertById(prev, created));
    void refreshAfterMutation();
  };

  const updateExpense = async (id: string, updates: Partial<Expense>) => {
    guardMutation();
    const updated = await api.updateExpense(id, updates);
    beginLocalCommit();
    setExpenses((prev) => upsertById(prev, updated));
    void refreshAfterMutation();
  };

  const deleteExpense = async (id: string) => {
    guardMutation();
    await api.deleteExpense(id);
    beginLocalCommit();
    setExpenses((prev) => removeById(prev, id));
    void refreshAfterMutation();
  };

  const addTransaction = async (row: Omit<Transaction, 'id'>) => {
    guardMutation();
    const created = await api.createTransaction(row);
    beginLocalCommit();
    setTransactions((prev) => [created, ...prev.filter((tx) => tx.id !== created.id)]);
    void refreshAfterMutation();
  };

  const updateTransaction = async (id: string, updates: Partial<Transaction>) => {
    guardMutation();
    const updated = await api.updateTransaction(id, updates);
    beginLocalCommit();
    setTransactions((prev) => upsertById(prev, updated));
    void refreshAfterMutation();
  };

  const reverseSale = async (id: string) => {
    guardMutation();
    try {
      const reversed = await api.reverseSale(id);
      beginLocalCommit();
      setTransactions((prev) => upsertById(prev, reversed));
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
    beginLocalCommit();
    setAppSettings(updated);
  };

  const addProductCategory = async (name: string) => {
    guardMutation();
    try {
      const created = await api.createCategory(name);
      beginLocalCommit();
      setProductCategories((prev) => upsertById(prev, created));
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
      const updated = await api.renameCategory(id, newName);
      beginLocalCommit();
      setProductCategories((prev) => upsertById(prev, updated));
      setProducts((prev) =>
        prev.map((product) =>
          product.categoryId === id ? { ...product, category: updated.name } : product,
        ),
      );
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === 'ERR_DUPLICATE_CATEGORY') {
        throw new Error('ERR_DUPLICATE_CATEGORY');
      }
      throw err;
    }
    void refreshAfterMutation();
  };

  const openCashSession = async (openingCash: number) => {
    guardMutation();
    try {
      const created = await api.openCashSession(openingCash);
      beginLocalCommit();
      setCashSessions((prev) => upsertById(prev, created));
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === 'ERR_CASH_SESSION_OPEN') {
        throw new Error('ERR_CASH_SESSION_OPEN');
      }
      throw err;
    }
    void refreshAfterMutation();
  };

  const closeCashSession = async (id: string, closingCash: number) => {
    guardMutation();
    const updated = await api.closeCashSession(id, closingCash);
    beginLocalCommit();
    setCashSessions((prev) => upsertById(prev, updated));
    void refreshAfterMutation();
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
    beginLocalCommit();
    setProductCategories((prev) => removeById(prev, id));
    setProductSubcategories((prev) => prev.filter((sub) => sub.categoryId !== id));
    void refreshAfterMutation();
  };

  const addSubcategory = async (row: { categoryId: string; name: string; code: string }) => {
    guardMutation();
    try {
      const created = await api.createSubcategory(row);
      beginLocalCommit();
      setProductSubcategories((prev) => upsertById(prev, created));
    } catch (err) {
      if (err instanceof ApiRequestError) {
        if (err.code === 'ERR_DUPLICATE_SUBCATEGORY') throw new Error('ERR_DUPLICATE_SUBCATEGORY');
        if (err.code === 'ERR_DUPLICATE_SUBCATEGORY_CODE') throw new Error('ERR_DUPLICATE_SUBCATEGORY_CODE');
      }
      throw err;
    }
    void refreshAfterMutation();
  };

  const updateSubcategory = async (id: string, updates: { name?: string; code?: string }) => {
    guardMutation();
    try {
      const updated = await api.updateSubcategory(id, updates);
      beginLocalCommit();
      setProductSubcategories((prev) => upsertById(prev, updated));
      setProducts((prev) =>
        prev.map((product) =>
          product.subcategoryId === id ? { ...product, subcategory: updated.name } : product,
        ),
      );
    } catch (err) {
      if (err instanceof ApiRequestError) {
        if (err.code === 'ERR_DUPLICATE_SUBCATEGORY') throw new Error('ERR_DUPLICATE_SUBCATEGORY');
        if (err.code === 'ERR_DUPLICATE_SUBCATEGORY_CODE') throw new Error('ERR_DUPLICATE_SUBCATEGORY_CODE');
      }
      throw err;
    }
    void refreshAfterMutation();
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
    beginLocalCommit();
    setProductSubcategories((prev) => removeById(prev, id));
    void refreshAfterMutation();
  };

  const addLocation = async (name: string) => {
    guardMutation();
    try {
      const created = await api.createLocation(name);
      beginLocalCommit();
      setProductLocations((prev) => upsertById(prev, created));
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === 'ERR_DUPLICATE_LOCATION') {
        throw new Error('ERR_DUPLICATE_LOCATION');
      }
      throw err;
    }
    void refreshAfterMutation();
  };

  const updateLocation = async (id: string, name: string) => {
    guardMutation();
    try {
      const updated = await api.updateLocation(id, name);
      beginLocalCommit();
      setProductLocations((prev) => upsertById(prev, updated));
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === 'ERR_DUPLICATE_LOCATION') {
        throw new Error('ERR_DUPLICATE_LOCATION');
      }
      throw err;
    }
    void refreshAfterMutation();
  };

  const deleteLocation = async (id: string) => {
    guardMutation();
    await api.deleteLocation(id);
    beginLocalCommit();
    setProductLocations((prev) => removeById(prev, id));
    setProducts((prev) =>
      prev.map((product) => (product.locationId === id ? { ...product, locationId: null } : product)),
    );
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

  const requestLicense = async (planId: LicensePlanId) => {
    guardMutation();
    return api.requestLicense(planId);
  };

  const activateLicenseKey = async (licenseKey: string) => {
    guardMutation();
    const result = await api.activateLicense(licenseKey);
    beginLocalCommit();
    setLicenseInfo(result.license);
    void refreshAfterMutation();
    return result;
  };

  const factoryReset = async () => {
    guardMutation();
    await api.factoryReset();
    beginLocalCommit();
    await refreshAll();
  };

  const licenseUsable =
    licenseInfo != null && (licenseInfo.status === 'trial' || licenseInfo.status === 'active');

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
    licenseInfo,
    licenseUsable,
    loading,
    apiConnected: connected,
    apiChecking: checking,
    retryApiConnection: verify,
    refreshData,
    requestLicense,
    activateLicense: activateLicenseKey,
    factoryReset,
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
