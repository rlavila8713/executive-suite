import type {
  AppSettings,
  CashSession,
  CheckoutPayload,
  Expense,
  LicenseInfo,
  LicensePlanId,
  LicenseRequestPayload,
  Product,
  ProductCategory,
  ProductLocation,
  ProductSubcategory,
  Transaction,
} from '../types';
import type { ExecutiveSuiteBackup } from '../lib/backup';
import { getApiUrl } from './config';
import { getDeviceId } from '../lib/deviceId';

export class ApiConnectionError extends Error {
  constructor(message = 'Cannot reach local API server') {
    super(message);
    this.name = 'ApiConnectionError';
  }
}

export class ApiRequestError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

export type HealthResponse = {
  status: string;
  version: string;
  port: number;
  lanUrls: string[];
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(getApiUrl(path), {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        'X-Device-Id': getDeviceId(),
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiConnectionError();
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  let body: { error?: string; code?: string } | T = {};
  if (text) {
    try {
      body = JSON.parse(text) as typeof body;
    } catch {
      body = { error: text };
    }
  }

  if (!res.ok) {
    const err = body as { error?: string; code?: string };
    throw new ApiRequestError(err.error ?? `Request failed (${res.status})`, res.status, err.code);
  }

  return body as T;
}

export type ProductImportResult = {
  created: {
    categories: number;
    subcategories: number;
    locations: number;
    products: number;
  };
  errors: { row: number; message: string }[];
};

export type ProductImportValidation = {
  summary: {
    new: number;
    duplicateExisting: number;
    duplicateInFile: number;
  };
  rows: { row: number; status: 'new' | 'duplicate_existing' | 'duplicate_in_file'; code?: string }[];
};

export const api = {
  health: () => request<HealthResponse>('/health'),

  getProducts: (options?: { includeImages?: boolean }) =>
    request<Product[]>(
      `/api/products${options?.includeImages === false ? '?includeImages=false' : '?includeImages=true'}`,
    ),
  createProduct: (product: Omit<Product, 'id'>) =>
    request<Product>('/api/products', { method: 'POST', body: JSON.stringify(product) }),
  updateProduct: (id: string, updates: Partial<Product>) =>
    request<Product>(`/api/products/${id}`, { method: 'PATCH', body: JSON.stringify(updates) }),
  updateProductStock: (id: string, stock: number) =>
    request<Product>(`/api/products/${id}/stock`, { method: 'PATCH', body: JSON.stringify({ stock }) }),
  receiveProductStock: (
    id: string,
    payload: { quantity: number; unitCost: number; price: number },
  ) =>
    request<{
      product: Product;
      previousStock: number;
      previousCost: number;
      newStock: number;
      newCost: number;
      receivedQuantity: number;
      receivedUnitCost: number;
    }>(`/api/products/${id}/receive`, { method: 'POST', body: JSON.stringify(payload) }),
  deleteProduct: (id: string) => request<void>(`/api/products/${id}`, { method: 'DELETE' }),

  importProducts: (rows: {
    name: string;
    category: string;
    subcategory: string;
    price: number;
    cost: number;
    stock: number;
    location?: string;
    sku?: string;
  }[]) =>
    request<ProductImportResult>('/api/import/products', { method: 'POST', body: JSON.stringify({ rows }) }),

  validateProductImport: (rows: {
    name: string;
    category: string;
    subcategory: string;
    price: number;
    cost: number;
    stock: number;
    location?: string;
    sku?: string;
  }[]) =>
    request<ProductImportValidation>('/api/import/products/validate', {
      method: 'POST',
      body: JSON.stringify({ rows }),
    }),

  getCategories: () => request<ProductCategory[]>('/api/categories'),
  createCategory: (name: string) =>
    request<ProductCategory>('/api/categories', { method: 'POST', body: JSON.stringify({ name }) }),
  renameCategory: (id: string, name: string) =>
    request<ProductCategory>(`/api/categories/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) }),
  deleteCategory: (id: string) => request<void>(`/api/categories/${id}`, { method: 'DELETE' }),

  getSubcategories: (categoryId?: string) =>
    request<ProductSubcategory[]>(
      categoryId ? `/api/subcategories?categoryId=${encodeURIComponent(categoryId)}` : '/api/subcategories',
    ),
  createSubcategory: (row: { categoryId: string; name: string; code: string }) =>
    request<ProductSubcategory>('/api/subcategories', { method: 'POST', body: JSON.stringify(row) }),
  updateSubcategory: (id: string, updates: { name?: string; code?: string }) =>
    request<ProductSubcategory>(`/api/subcategories/${id}`, { method: 'PATCH', body: JSON.stringify(updates) }),
  deleteSubcategory: (id: string) => request<void>(`/api/subcategories/${id}`, { method: 'DELETE' }),

  getLocations: () => request<ProductLocation[]>('/api/locations'),
  createLocation: (name: string) =>
    request<ProductLocation>('/api/locations', { method: 'POST', body: JSON.stringify({ name }) }),
  updateLocation: (id: string, name: string) =>
    request<ProductLocation>(`/api/locations/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) }),
  deleteLocation: (id: string) => request<void>(`/api/locations/${id}`, { method: 'DELETE' }),

  getNextSku: (categoryId: string, subcategoryId: string) =>
    request<{ sku: string }>(
      `/api/products/next-sku?categoryId=${encodeURIComponent(categoryId)}&subcategoryId=${encodeURIComponent(subcategoryId)}`,
    ),

  getTransactions: () => request<Transaction[]>('/api/transactions'),
  createTransaction: (row: Omit<Transaction, 'id'>) =>
    request<Transaction>('/api/transactions', { method: 'POST', body: JSON.stringify(row) }),
  updateTransaction: (id: string, updates: Partial<Transaction>) =>
    request<Transaction>(`/api/transactions/${id}`, { method: 'PATCH', body: JSON.stringify(updates) }),
  deleteTransaction: (id: string) => request<void>(`/api/transactions/${id}`, { method: 'DELETE' }),
  reverseSale: (id: string) =>
    request<Transaction>(`/api/transactions/${id}/reverse`, { method: 'POST' }),
  processSale: (payload: CheckoutPayload) =>
    request<Transaction>('/api/sales', { method: 'POST', body: JSON.stringify(payload) }),

  getExpenses: () => request<Expense[]>('/api/expenses'),
  createExpense: (row: Omit<Expense, 'id'>) =>
    request<Expense>('/api/expenses', { method: 'POST', body: JSON.stringify(row) }),
  updateExpense: (id: string, updates: Partial<Expense>) =>
    request<Expense>(`/api/expenses/${id}`, { method: 'PATCH', body: JSON.stringify(updates) }),
  deleteExpense: (id: string) => request<void>(`/api/expenses/${id}`, { method: 'DELETE' }),

  getSettings: () => request<AppSettings>('/api/settings'),
  updateSettings: (patch: Partial<Omit<AppSettings, 'id'>>) =>
    request<AppSettings>('/api/settings', { method: 'PATCH', body: JSON.stringify(patch) }),

  getCashSessions: () => request<CashSession[]>('/api/cash-sessions'),
  openCashSession: (openingCash: number) =>
    request<CashSession>('/api/cash-sessions', { method: 'POST', body: JSON.stringify({ openingCash }) }),
  closeCashSession: (id: string, closingCash: number) =>
    request<CashSession>(`/api/cash-sessions/${id}/close`, {
      method: 'POST',
      body: JSON.stringify({ closingCash }),
    }),

  exportBackup: () => request<ExecutiveSuiteBackup>('/api/backup'),
  importBackup: (data: ExecutiveSuiteBackup) =>
    request<{ ok: boolean }>('/api/backup/import', { method: 'POST', body: JSON.stringify(data) }),

  getLicense: () => request<LicenseInfo>('/api/license'),
  requestLicense: (planId: LicensePlanId) =>
    request<{ requestCode: string; payload: LicenseRequestPayload }>('/api/license/request', {
      method: 'POST',
      body: JSON.stringify({ planId }),
    }),
  activateLicense: (licenseKey: string) =>
    request<{ license: LicenseInfo; expenseId: string; paidUntil: number }>('/api/license/activate', {
      method: 'POST',
      body: JSON.stringify({ licenseKey }),
    }),

  factoryReset: () => request<{ ok: boolean }>('/api/admin/factory-reset', { method: 'POST' }),
};
