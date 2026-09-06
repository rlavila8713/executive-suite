import type { Request, Response, NextFunction } from 'express';
import {
  factoryResetDb,
  getDb,
  newId,
  rowToAppSettings,
  rowToCashSession,
  rowToCategory,
  rowToExpense,
  rowToProduct,
  rowToTransaction,
  type SqliteStore,
} from './db.js';
import { computeSessionPaymentTotals } from './reporting.js';
import { computeWeightedAverageCost } from './inventoryCost.js';
import { DEFAULT_APP_SETTINGS } from './constants.js';
import { registerCatalogRoutes } from './catalogRoutes.js';
import { importProductsFromRows, validateProductImportRows, type ProductImportInput } from './importCatalog.js';
import { codeFromCategoryName } from './migrations.js';
import {
  activateLicense,
  buildLicenseRequest,
  getLicenseInfo,
  LicenseError,
  type LicensePlanId,
} from './license.js';
import { detectCashAnomalies } from './cashAnomalies.js';
import { resolveProductImage } from './productImage.js';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

function requireBody<T extends Record<string, unknown>>(body: unknown, fields: (keyof T)[]): T {
  if (!body || typeof body !== 'object') throw new ApiError(400, 'Request body required');
  const b = body as T;
  for (const f of fields) {
    if (b[f] === undefined) throw new ApiError(400, `Missing field: ${String(f)}`);
  }
  return b;
}

function nameClashes(db: SqliteStore, name: string, exceptId?: string): boolean {
  const lower = name.trim().toLowerCase();
  const rows = db.prepare('SELECT id, name FROM categories').all() as { id: string; name: string }[];
  return rows.some((c) => c.id !== exceptId && c.name.trim().toLowerCase() === lower);
}

function getOpenCashSessionId(db: SqliteStore): string | undefined {
  const row = db.prepare('SELECT id FROM cash_sessions WHERE closed_at IS NULL LIMIT 1').get() as
    | { id: string }
    | undefined;
  return row?.id;
}

type ReceiptLineRef = { productId?: string; sku?: string; quantity?: number };

function parseReceiptLines(receiptJson: string | null | undefined): ReceiptLineRef[] {
  if (!receiptJson) return [];
  try {
    const receipt = JSON.parse(receiptJson) as { lines?: ReceiptLineRef[] };
    return Array.isArray(receipt.lines) ? receipt.lines : [];
  } catch {
    return [];
  }
}

function countSalesUsingProduct(db: SqliteStore, productId: string, sku: string): { count: number; name: string } {
  const rows = db.prepare('SELECT receipt_json FROM transactions WHERE receipt_json IS NOT NULL').all() as {
    receipt_json: string;
  }[];
  let count = 0;
  for (const row of rows) {
    const used = parseReceiptLines(row.receipt_json).some(
      (line) => (line.productId && line.productId === productId) || (sku && line.sku === sku),
    );
    if (used) count += 1;
  }
  return { count, name: sku };
}

function wantsImageData(query: Request['query']): boolean {
  const value = query.includeImages;
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return true;
}

export function registerRoutes(router: import('express').Router): void {
  // --- Products ---
  router.get(
    '/products',
    asyncHandler(async (req, res) => {
      const db = getDb();
      const rows = db.prepare('SELECT * FROM products ORDER BY id').all();
      const includeImageData = wantsImageData(req.query);
      res.json(rows.map((r) => rowToProduct(r as Parameters<typeof rowToProduct>[0], { includeImageData })));
    }),
  );

  router.get(
    '/products/:id/image',
    asyncHandler(async (req, res) => {
      const db = getDb();
      const row = db.prepare('SELECT id, image FROM products WHERE id = ?').get(req.params.id) as
        | { id: string; image: string }
        | undefined;
      if (!row) throw new ApiError(404, 'Product not found');
      const resolved = resolveProductImage(row.image);
      if (!resolved) {
        res.status(404).json({ error: 'Product has no image' });
        return;
      }
      if (resolved.kind === 'redirect') {
        res.redirect(302, resolved.url);
        return;
      }
      res.setHeader('Content-Type', resolved.contentType);
      // Versioned URLs (`?v=`) are immutable; unversioned requests must revalidate.
      res.setHeader(
        'Cache-Control',
        typeof req.query.v === 'string' && req.query.v
          ? 'private, max-age=31536000, immutable'
          : 'private, no-cache',
      );
      res.send(resolved.data);
    }),
  );

  router.get(
    '/products/:id',
    asyncHandler(async (req, res) => {
      const db = getDb();
      const row = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
      if (!row) throw new ApiError(404, 'Product not found');
      res.json(rowToProduct(row as Parameters<typeof rowToProduct>[0]));
    }),
  );

  router.post(
    '/products',
    asyncHandler(async (req, res) => {
      const body = req.body as Record<string, unknown>;
      const name = String(body.name ?? '').trim();
      const sku = String(body.sku ?? '').trim();
      const category = String(body.category ?? '').trim();
      if (!name || !sku || !category) throw new ApiError(400, 'name, sku and category required');
      const price = Number(body.price);
      const cost = Number(body.cost);
      const stock = Number(body.stock);
      const image = String(body.image ?? '');
      if (!Number.isFinite(price) || !Number.isFinite(cost) || !Number.isFinite(stock)) {
        throw new ApiError(400, 'price, cost and stock must be numbers');
      }
      const db = getDb();
      const id = newId();
      const categoryId = String(body.categoryId ?? '');
      const subcategoryId = String(body.subcategoryId ?? '');
      const subcategory = String(body.subcategory ?? '');
      const status = String(body.status ?? 'active');
      const unitOfMeasure = String(body.unitOfMeasure ?? 'unidad');
      const locationId = body.locationId != null && body.locationId !== '' ? String(body.locationId) : null;
      const barcode = body.barcode != null && body.barcode !== '' ? String(body.barcode) : null;
      db.prepare(
        `INSERT INTO products (id, name, sku, category, price, cost, stock, image, category_id, subcategory_id, subcategory, status, unit_of_measure, location_id, barcode)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        name,
        sku,
        category,
        price,
        cost,
        stock,
        image,
        categoryId,
        subcategoryId,
        subcategory,
        status,
        unitOfMeasure,
        locationId,
        barcode,
      );
      const row = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
      res.status(201).json(rowToProduct(row as Parameters<typeof rowToProduct>[0]));
    }),
  );

  router.patch(
    '/products/:id',
    asyncHandler(async (req, res) => {
      const db = getDb();
      const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
      if (!existing) throw new ApiError(404, 'Product not found');
      const body = req.body as Record<string, unknown>;
      const fields: string[] = [];
      const values: unknown[] = [];
      const map: Record<string, string> = {
        name: 'name',
        sku: 'sku',
        category: 'category',
        price: 'price',
        cost: 'cost',
        stock: 'stock',
        image: 'image',
        categoryId: 'category_id',
        subcategoryId: 'subcategory_id',
        subcategory: 'subcategory',
        status: 'status',
        unitOfMeasure: 'unit_of_measure',
        locationId: 'location_id',
        barcode: 'barcode',
      };
      for (const [key, col] of Object.entries(map)) {
        if (body[key] !== undefined) {
          fields.push(`${col} = ?`);
          values.push(body[key]);
        }
      }
      if (fields.length === 0) throw new ApiError(400, 'No fields to update');
      values.push(req.params.id);
      db.prepare(`UPDATE products SET ${fields.join(', ')} WHERE id = ?`).run(...values);
      const row = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
      res.json(rowToProduct(row as Parameters<typeof rowToProduct>[0]));
    }),
  );

  router.patch(
    '/products/:id/stock',
    asyncHandler(async (req, res) => {
      const body = requireBody<{ stock: number }>(req.body, ['stock']);
      const db = getDb();
      const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
      if (!existing) throw new ApiError(404, 'Product not found');
      const stock = Math.max(0, Math.floor(body.stock));
      db.prepare('UPDATE products SET stock = ? WHERE id = ?').run(stock, req.params.id);
      const row = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
      res.json(rowToProduct(row as Parameters<typeof rowToProduct>[0]));
    }),
  );

  router.post(
    '/products/:id/receive',
    asyncHandler(async (req, res) => {
      const body = requireBody<{ quantity: number; unitCost: number; price: number }>(req.body, [
        'quantity',
        'unitCost',
        'price',
      ]);
      const quantity = Math.floor(Number(body.quantity));
      const unitCost = Number(body.unitCost);
      const price = Number(body.price);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        throw new ApiError(400, 'quantity must be a positive integer', 'ERR_INVALID_RECEIVE_QTY');
      }
      if (!Number.isFinite(unitCost) || unitCost < 0) {
        throw new ApiError(400, 'unitCost must be a non-negative number', 'ERR_INVALID_RECEIVE_COST');
      }
      if (!Number.isFinite(price) || price < 0) {
        throw new ApiError(400, 'price must be a non-negative number', 'ERR_INVALID_RECEIVE_PRICE');
      }

      const db = getDb();
      const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id) as
        | Parameters<typeof rowToProduct>[0]
        | undefined;
      if (!existing) throw new ApiError(404, 'Product not found');

      const previousStock = Number(existing.stock);
      const previousCost = Number(existing.cost);
      const newStock = previousStock + quantity;
      const newCost = computeWeightedAverageCost(previousStock, previousCost, quantity, unitCost);

      db.prepare('UPDATE products SET stock = ?, cost = ?, price = ? WHERE id = ?').run(
        newStock,
        newCost,
        price,
        req.params.id,
      );

      const row = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
      res.json({
        product: rowToProduct(row as Parameters<typeof rowToProduct>[0]),
        previousStock,
        previousCost,
        newStock,
        newCost,
        receivedQuantity: quantity,
        receivedUnitCost: unitCost,
      });
    }),
  );

  router.delete(
    '/products/:id',
    asyncHandler(async (req, res) => {
      const db = getDb();
      const product = db.prepare('SELECT id, name, sku FROM products WHERE id = ?').get(req.params.id) as
        | { id: string; name: string; sku: string }
        | undefined;
      if (!product) throw new ApiError(404, 'Product not found');
      const usage = countSalesUsingProduct(db, product.id, product.sku);
      if (usage.count > 0) {
        throw new ApiError(
          409,
          `Product in use by ${usage.count} sale(s)`,
          `ERR_PRODUCT_IN_USE|${usage.count}|${encodeURIComponent(product.name)}`,
        );
      }
      db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
      res.status(204).send();
    }),
  );

  router.post(
    '/import/products/validate',
    asyncHandler(async (req, res) => {
      const body = req.body as { rows?: ProductImportInput[] };
      if (!Array.isArray(body.rows) || body.rows.length === 0) {
        throw new ApiError(400, 'rows array required', 'ERR_IMPORT_EMPTY');
      }
      if (body.rows.length > 5000) {
        throw new ApiError(400, 'Maximum 5000 rows per import', 'ERR_IMPORT_TOO_LARGE');
      }
      const db = getDb();
      res.json(validateProductImportRows(db, body.rows));
    }),
  );

  router.post(
    '/import/products',
    asyncHandler(async (req, res) => {
      const body = req.body as { rows?: ProductImportInput[] };
      if (!Array.isArray(body.rows) || body.rows.length === 0) {
        throw new ApiError(400, 'rows array required', 'ERR_IMPORT_EMPTY');
      }
      if (body.rows.length > 5000) {
        throw new ApiError(400, 'Maximum 5000 rows per import', 'ERR_IMPORT_TOO_LARGE');
      }
      const db = getDb();
      const result = importProductsFromRows(db, body.rows);
      res.json(result);
    }),
  );

  // --- Categories ---
  router.get(
    '/categories',
    asyncHandler(async (_req, res) => {
      const db = getDb();
      const rows = db.prepare('SELECT * FROM categories ORDER BY name').all() as { id: string; name: string }[];
      res.json(rows.map(rowToCategory));
    }),
  );

  router.post(
    '/categories',
    asyncHandler(async (req, res) => {
      const body = req.body as { name?: string; code?: string };
      const trimmed = (body.name ?? '').trim();
      if (!trimmed) throw new ApiError(400, 'Category name required');
      const db = getDb();
      if (nameClashes(db, trimmed)) throw new ApiError(409, 'Duplicate category', 'ERR_DUPLICATE_CATEGORY');
      const id = newId();
      const code = (body.code ?? '').trim().toUpperCase() || codeFromCategoryName(trimmed);
      db.runInTransaction(() => {
        db.prepare('INSERT INTO categories (id, name, code) VALUES (?, ?, ?)').run(id, trimmed, code);
        db.prepare('INSERT INTO subcategories (id, category_id, name, code) VALUES (?, ?, ?, ?)').run(
          newId(),
          id,
          'General',
          'GEN',
        );
      });
      res.status(201).json({ id, name: trimmed, code });
    }),
  );

  router.patch(
    '/categories/:id',
    asyncHandler(async (req, res) => {
      const body = requireBody<{ name: string }>(req.body, ['name']);
      const trimmed = body.name.trim();
      if (!trimmed) throw new ApiError(400, 'Category name required');
      const db = getDb();
      const row = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id) as
        | { id: string; name: string }
        | undefined;
      if (!row) throw new ApiError(404, 'Category not found');
      if (trimmed === row.name) {
        res.json(rowToCategory(row));
        return;
      }
      if (nameClashes(db, trimmed, row.id)) {
        throw new ApiError(409, 'Duplicate category', 'ERR_DUPLICATE_CATEGORY');
      }
      db.runInTransaction(() => {
        db.prepare('UPDATE products SET category = ? WHERE category = ?').run(trimmed, row.name);
        db.prepare('UPDATE categories SET name = ? WHERE id = ?').run(trimmed, row.id);
      });
      const updated = db.prepare('SELECT * FROM categories WHERE id = ?').get(row.id) as { id: string; name: string; code: string };
      res.json(rowToCategory(updated));
    }),
  );

  router.delete(
    '/categories/:id',
    asyncHandler(async (req, res) => {
      const db = getDb();
      const row = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id) as
        | { id: string; name: string }
        | undefined;
      if (!row) throw new ApiError(404, 'Category not found');
      const count = db.prepare('SELECT COUNT(*) AS c FROM products WHERE category = ?').get(row.name) as { c: number };
      if (count.c > 0) {
        throw new ApiError(
          409,
          `Category in use by ${count.c} product(s)`,
          `ERR_CATEGORY_IN_USE|${count.c}|${encodeURIComponent(row.name)}`,
        );
      }
      db.prepare('DELETE FROM subcategories WHERE category_id = ?').run(req.params.id);
      db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
      res.status(204).send();
    }),
  );

  // --- Transactions ---
  router.get(
    '/transactions',
    asyncHandler(async (_req, res) => {
      const db = getDb();
      const rows = db.prepare('SELECT * FROM transactions ORDER BY created_at DESC').all();
      res.json(rows.map((r) => rowToTransaction(r as Parameters<typeof rowToTransaction>[0])));
    }),
  );

  router.post(
    '/transactions',
    asyncHandler(async (req, res) => {
      const body = req.body as Record<string, unknown>;
      const id = newId();
      const db = getDb();
      db.prepare(
        `INSERT INTO transactions (id, order_number, customer, amount, status, timestamp, type, created_at, payment_method, receipt_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        body.orderNumber,
        body.customer,
        body.amount,
        body.status,
        body.timestamp,
        body.type,
        body.createdAt ?? Date.now(),
        body.paymentMethod ?? null,
        body.receipt ? JSON.stringify(body.receipt) : null,
      );
      const row = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id);
      res.status(201).json(rowToTransaction(row as Parameters<typeof rowToTransaction>[0]));
    }),
  );

  router.patch(
    '/transactions/:id',
    asyncHandler(async (req, res) => {
      const db = getDb();
      const existing = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id) as
        | { status: string }
        | undefined;
      if (!existing) throw new ApiError(404, 'Transaction not found');
      const body = req.body as Record<string, unknown>;
      if (body.status === 'reversed' && existing.status !== 'reversed') {
        throw new ApiError(409, 'Use reverse endpoint to restore inventory', 'ERR_SALE_CANNOT_REVERSE');
      }
      const map: Record<string, string> = {
        orderNumber: 'order_number',
        customer: 'customer',
        amount: 'amount',
        status: 'status',
        timestamp: 'timestamp',
        type: 'type',
        createdAt: 'created_at',
        paymentMethod: 'payment_method',
      };
      const fields: string[] = [];
      const values: unknown[] = [];
      for (const [key, col] of Object.entries(map)) {
        if (body[key] !== undefined) {
          fields.push(`${col} = ?`);
          values.push(body[key]);
        }
      }
      if (body.receipt !== undefined) {
        fields.push('receipt_json = ?');
        values.push(JSON.stringify(body.receipt));
      }
      if (fields.length === 0) throw new ApiError(400, 'No fields to update');
      values.push(req.params.id);
      db.prepare(`UPDATE transactions SET ${fields.join(', ')} WHERE id = ?`).run(...values);
      const row = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id);
      res.json(rowToTransaction(row as Parameters<typeof rowToTransaction>[0]));
    }),
  );

  router.delete(
    '/transactions/:id',
    asyncHandler(async (_req, res) => {
      throw new ApiError(405, 'Sales cannot be deleted; reverse them instead', 'ERR_SALE_CANNOT_DELETE');
    }),
  );

  router.post(
    '/transactions/:id/reverse',
    asyncHandler(async (req, res) => {
      const db = getDb();
      const existing = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id) as
        | {
            id: string;
            type: string;
            status: string;
            receipt_json: string | null;
          }
        | undefined;
      if (!existing) throw new ApiError(404, 'Sale not found');
      if (existing.type !== 'sale') {
        throw new ApiError(409, 'Only completed sales can be reversed', 'ERR_SALE_CANNOT_REVERSE');
      }
      if (existing.status === 'reversed' || existing.status === 'refunded') {
        throw new ApiError(409, 'Sale already reversed', 'ERR_SALE_ALREADY_REVERSED');
      }
      if (existing.status !== 'completed') {
        throw new ApiError(409, 'Only completed sales can be reversed', 'ERR_SALE_CANNOT_REVERSE');
      }

      const lines = parseReceiptLines(existing.receipt_json);
      db.runInTransaction(() => {
        for (const line of lines) {
          const qty = Number(line.quantity);
          if (!Number.isFinite(qty) || qty <= 0) continue;
          let product: { id: string; stock: number } | undefined;
          if (line.productId) {
            product = db.prepare('SELECT id, stock FROM products WHERE id = ?').get(line.productId) as
              | { id: string; stock: number }
              | undefined;
          }
          if (!product && line.sku) {
            product = db.prepare('SELECT id, stock FROM products WHERE sku = ?').get(line.sku) as
              | { id: string; stock: number }
              | undefined;
          }
          if (product) {
            db.prepare('UPDATE products SET stock = ? WHERE id = ?').run(product.stock + qty, product.id);
          }
        }
        db.prepare('UPDATE transactions SET status = ? WHERE id = ?').run('reversed', req.params.id);
      });

      const row = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id);
      res.json(rowToTransaction(row as Parameters<typeof rowToTransaction>[0]));
    }),
  );

  // --- Sales (atomic checkout) ---
  router.post(
    '/sales',
    asyncHandler(async (req, res) => {
      const body = req.body as {
        customerName?: string;
        amount?: number;
        receipt?: {
          lines: { productId?: string; sku: string; quantity: number }[];
          paymentMethod?: string;
          total?: number;
        };
      };
      if (!body.receipt?.lines?.length) throw new ApiError(400, 'Receipt lines required');

      const db = getDb();
      if (!getOpenCashSessionId(db)) {
        throw new ApiError(409, 'Cash session must be open before selling', 'ERR_CASH_SESSION_REQUIRED');
      }
      const amount = body.amount && body.amount > 0 ? body.amount : (body.receipt.total ?? 0);
      const newTransaction = {
        id: newId(),
        orderNumber: `#${Math.floor(Math.random() * 90000) + 10000}`,
        customer: (body.customerName ?? '').trim() || 'Walk-in Customer',
        amount,
        status: 'completed' as const,
        timestamp: 'Just now',
        type: 'sale' as const,
        createdAt: Date.now(),
        receipt: body.receipt,
        paymentMethod: (body.receipt.paymentMethod ?? 'other') as 'cash' | 'card' | 'transfer' | 'other',
      };

      db.runInTransaction(() => {
        db.prepare(
          `INSERT INTO transactions (id, order_number, customer, amount, status, timestamp, type, created_at, payment_method, receipt_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          newTransaction.id,
          newTransaction.orderNumber,
          newTransaction.customer,
          newTransaction.amount,
          newTransaction.status,
          newTransaction.timestamp,
          newTransaction.type,
          newTransaction.createdAt,
          newTransaction.paymentMethod,
          JSON.stringify(newTransaction.receipt),
        );

        for (const line of body.receipt!.lines) {
          let product: { id: string; stock: number } | undefined;
          if (line.productId) {
            product = db.prepare('SELECT id, stock FROM products WHERE id = ?').get(line.productId) as
              | { id: string; stock: number }
              | undefined;
          }
          if (!product && line.sku) {
            product = db.prepare('SELECT id, stock FROM products WHERE sku = ?').get(line.sku) as
              | { id: string; stock: number }
              | undefined;
          }
          if (product) {
            const newStock = Math.max(0, product.stock - line.quantity);
            db.prepare('UPDATE products SET stock = ? WHERE id = ?').run(newStock, product.id);
          }
        }
      });

      res.status(201).json(newTransaction);
    }),
  );

  // --- Expenses ---
  router.get(
    '/expenses',
    asyncHandler(async (_req, res) => {
      const db = getDb();
      const rows = db.prepare('SELECT * FROM expenses ORDER BY date DESC').all();
      res.json(rows.map((r) => rowToExpense(r as Parameters<typeof rowToExpense>[0])));
    }),
  );

  router.post(
    '/expenses',
    asyncHandler(async (req, res) => {
      const body = requireBody<{ title: string; amount: number; category: string; date: string }>(
        req.body,
        ['title', 'amount', 'category', 'date'],
      );
      const db = getDb();
      const id = newId();
      db.prepare('INSERT INTO expenses (id, title, amount, category, date) VALUES (?, ?, ?, ?, ?)').run(
        id,
        body.title,
        body.amount,
        body.category,
        body.date,
      );
      const row = db.prepare('SELECT * FROM expenses WHERE id = ?').get(id);
      res.status(201).json(rowToExpense(row as Parameters<typeof rowToExpense>[0]));
    }),
  );

  router.patch(
    '/expenses/:id',
    asyncHandler(async (req, res) => {
      const db = getDb();
      const existing = db.prepare('SELECT * FROM expenses WHERE id = ?').get(req.params.id) as {
        locked?: number;
      };
      if (!existing) throw new ApiError(404, 'Expense not found');
      if (existing.locked === 1) {
        throw new ApiError(403, 'This expense cannot be modified', 'ERR_EXPENSE_LOCKED');
      }
      const body = req.body as Record<string, unknown>;
      const map: Record<string, string> = { title: 'title', amount: 'amount', category: 'category', date: 'date' };
      const fields: string[] = [];
      const values: unknown[] = [];
      for (const [key, col] of Object.entries(map)) {
        if (body[key] !== undefined) {
          fields.push(`${col} = ?`);
          values.push(body[key]);
        }
      }
      if (fields.length === 0) throw new ApiError(400, 'No fields to update');
      values.push(req.params.id);
      db.prepare(`UPDATE expenses SET ${fields.join(', ')} WHERE id = ?`).run(...values);
      const row = db.prepare('SELECT * FROM expenses WHERE id = ?').get(req.params.id);
      res.json(rowToExpense(row as Parameters<typeof rowToExpense>[0]));
    }),
  );

  router.delete(
    '/expenses/:id',
    asyncHandler(async (req, res) => {
      const db = getDb();
      const existing = db.prepare('SELECT * FROM expenses WHERE id = ?').get(req.params.id) as {
        locked?: number;
      };
      if (!existing) throw new ApiError(404, 'Expense not found');
      if (existing.locked === 1) {
        throw new ApiError(403, 'This expense cannot be deleted', 'ERR_EXPENSE_LOCKED');
      }
      const result = db.prepare('DELETE FROM expenses WHERE id = ?').run(req.params.id);
      if (result.changes === 0) throw new ApiError(404, 'Expense not found');
      res.status(204).send();
    }),
  );

  // --- Settings ---
  router.get(
    '/settings',
    asyncHandler(async (_req, res) => {
      const db = getDb();
      const row = db.prepare('SELECT * FROM app_settings WHERE id = ?').get('main');
      if (!row) {
        res.json(DEFAULT_APP_SETTINGS);
        return;
      }
      res.json(rowToAppSettings(row as Parameters<typeof rowToAppSettings>[0]));
    }),
  );

  router.patch(
    '/settings',
    asyncHandler(async (req, res) => {
      const db = getDb();
      const body = req.body as Record<string, unknown>;
      const existing = db.prepare('SELECT * FROM app_settings WHERE id = ?').get('main');
      if (!existing) {
        const s = { ...DEFAULT_APP_SETTINGS, ...body, id: 'main' };
        db.prepare(
          `INSERT INTO app_settings (id, store_name, branch, currency, tax_rate, card_qr_payload, dark_mode, low_stock_notifications, manager_name, manager_title, locale)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          'main',
          s.storeName,
          s.branch,
          s.currency,
          s.taxRate,
          s.cardQrPayload,
          s.darkMode ? 1 : 0,
          s.lowStockNotifications ? 1 : 0,
          s.managerName,
          s.managerTitle,
          s.locale,
        );
      } else {
        const map: Record<string, string> = {
          storeName: 'store_name',
          branch: 'branch',
          currency: 'currency',
          taxRate: 'tax_rate',
          cardQrPayload: 'card_qr_payload',
          darkMode: 'dark_mode',
          lowStockNotifications: 'low_stock_notifications',
          managerName: 'manager_name',
          managerTitle: 'manager_title',
          locale: 'locale',
        };
        const fields: string[] = [];
        const values: unknown[] = [];
        for (const [key, col] of Object.entries(map)) {
          if (body[key] !== undefined) {
            fields.push(`${col} = ?`);
            let val = body[key];
            if (key === 'darkMode' || key === 'lowStockNotifications') val = val ? 1 : 0;
            values.push(val);
          }
        }
        if (fields.length > 0) {
          values.push('main');
          db.prepare(`UPDATE app_settings SET ${fields.join(', ')} WHERE id = ?`).run(...values);
        }
      }
      const row = db.prepare('SELECT * FROM app_settings WHERE id = ?').get('main');
      res.json(rowToAppSettings(row as Parameters<typeof rowToAppSettings>[0]));
    }),
  );

  // --- Cash sessions ---
  router.get(
    '/cash-sessions',
    asyncHandler(async (_req, res) => {
      const db = getDb();
      const rows = db.prepare('SELECT * FROM cash_sessions ORDER BY opened_at DESC').all();
      res.json(rows.map((r) => rowToCashSession(r as Parameters<typeof rowToCashSession>[0])));
    }),
  );

  router.post(
    '/cash-sessions',
    asyncHandler(async (req, res) => {
      const body = requireBody<{ openingCash: number }>(req.body, ['openingCash']);
      const db = getDb();
      const openCount = db
        .prepare('SELECT COUNT(*) AS c FROM cash_sessions WHERE closed_at IS NULL')
        .get() as { c: number };
      if (openCount.c > 0) throw new ApiError(409, 'Cash session already open', 'ERR_CASH_SESSION_OPEN');
      const id = newId();
      const openedAt = Date.now();
      db.prepare(
        `INSERT INTO cash_sessions (id, opened_at, closed_at, opening_cash, closing_cash, total_cash_sales, total_card_sales, total_transfer_sales, total_other_sales)
         VALUES (?, ?, NULL, ?, NULL, 0, 0, 0, 0)`,
      ).run(id, openedAt, body.openingCash);
      const row = db.prepare('SELECT * FROM cash_sessions WHERE id = ?').get(id);
      res.status(201).json(rowToCashSession(row as Parameters<typeof rowToCashSession>[0]));
    }),
  );

  router.post(
    '/cash-sessions/:id/close',
    asyncHandler(async (req, res) => {
      const body = requireBody<{ closingCash: number }>(req.body, ['closingCash']);
      const db = getDb();
      const s = db.prepare('SELECT * FROM cash_sessions WHERE id = ?').get(req.params.id) as
        | Parameters<typeof rowToCashSession>[0]
        | undefined;
      if (!s || s.closed_at != null) throw new ApiError(404, 'Open cash session not found');
      const closedAt = Date.now();
      const allTx = db.prepare('SELECT * FROM transactions').all();
      const transactions = allTx.map((r) => rowToTransaction(r as Parameters<typeof rowToTransaction>[0]));
      const totals = computeSessionPaymentTotals(
        transactions as Parameters<typeof computeSessionPaymentTotals>[0],
        s.opened_at,
        closedAt,
      );
      const expectedCash = s.opening_cash + totals.totalCashSales;
      const variance = body.closingCash - expectedCash;
      const anomalies = detectCashAnomalies(s.opening_cash, body.closingCash, totals.totalCashSales);
      db.prepare(
        `UPDATE cash_sessions SET closed_at = ?, closing_cash = ?, total_cash_sales = ?, total_card_sales = ?, total_transfer_sales = ?, total_other_sales = ?,
         expected_cash = ?, cash_variance = ?, anomalies_json = ?
         WHERE id = ?`,
      ).run(
        closedAt,
        body.closingCash,
        totals.totalCashSales,
        totals.totalCardSales,
        totals.totalTransferSales,
        totals.totalOtherSales,
        expectedCash,
        variance,
        anomalies.length > 0 ? JSON.stringify(anomalies) : null,
        req.params.id,
      );
      const row = db.prepare('SELECT * FROM cash_sessions WHERE id = ?').get(req.params.id);
      res.json(rowToCashSession(row as Parameters<typeof rowToCashSession>[0]));
    }),
  );

  // --- License ---
  router.get(
    '/license',
    asyncHandler(async (req, res) => {
      const db = getDb();
      const deviceId = req.header('X-Device-Id')?.trim();
      res.json(getLicenseInfo(db, deviceId));
    }),
  );

  router.post(
    '/license/request',
    asyncHandler(async (req, res) => {
      const body = requireBody<{ planId: LicensePlanId }>(req.body, ['planId']);
      const db = getDb();
      const deviceId = req.header('X-Device-Id')?.trim();
      if (!deviceId) throw new ApiError(403, 'Device identification required', 'ERR_DEVICE_REQUIRED');
      const info = getLicenseInfo(db, deviceId);
      if (info.status === 'device_mismatch') {
        throw new ApiError(403, 'This license is bound to another device', 'ERR_DEVICE_MISMATCH');
      }
      const result = buildLicenseRequest(db, deviceId, body.planId);
      res.json(result);
    }),
  );

  router.post(
    '/license/activate',
    asyncHandler(async (req, res) => {
      const body = requireBody<{ licenseKey: string }>(req.body, ['licenseKey']);
      const db = getDb();
      const deviceId = req.header('X-Device-Id')?.trim();
      if (!deviceId) throw new ApiError(403, 'Device identification required', 'ERR_DEVICE_REQUIRED');
      const info = getLicenseInfo(db, deviceId);
      if (info.status === 'device_mismatch') {
        throw new ApiError(403, 'This license is bound to another device', 'ERR_DEVICE_MISMATCH');
      }
      try {
        const result = activateLicense(db, deviceId, body.licenseKey.trim());
        res.status(201).json({
          license: getLicenseInfo(db, deviceId),
          expenseId: result.expenseId,
          paidUntil: result.paidUntil,
        });
      } catch (err) {
        if (err instanceof LicenseError) {
          throw new ApiError(400, err.message, err.code);
        }
        throw err;
      }
    }),
  );

  // --- Admin ---
  router.post(
    '/admin/factory-reset',
    asyncHandler(async (_req, res) => {
      const db = getDb();
      factoryResetDb(db);
      res.json({ ok: true });
    }),
  );

  // --- Backup ---
  router.get(
    '/backup',
    asyncHandler(async (_req, res) => {
      const db = getDb();
      const products = db.prepare('SELECT * FROM products').all().map((r) => rowToProduct(r as Parameters<typeof rowToProduct>[0]));
      const transactions = db
        .prepare('SELECT * FROM transactions')
        .all()
        .map((r) => rowToTransaction(r as Parameters<typeof rowToTransaction>[0]));
      const expenses = db.prepare('SELECT * FROM expenses').all().map((r) => rowToExpense(r as Parameters<typeof rowToExpense>[0]));
      const productCategories = db
        .prepare('SELECT * FROM categories')
        .all()
        .map((r) => rowToCategory(r as { id: string; name: string; code?: string }));
      const subcategories = db.prepare('SELECT * FROM subcategories ORDER BY name').all() as {
        id: string;
        category_id: string;
        name: string;
        code: string;
      }[];
      const locations = db.prepare('SELECT * FROM locations ORDER BY name').all() as { id: string; name: string }[];
      const cashSessions = db
        .prepare('SELECT * FROM cash_sessions')
        .all()
        .map((r) => rowToCashSession(r as Parameters<typeof rowToCashSession>[0]));
      const settingsRow = db.prepare('SELECT * FROM app_settings WHERE id = ?').get('main');
      const appSettings = settingsRow
        ? rowToAppSettings(settingsRow as Parameters<typeof rowToAppSettings>[0])
        : DEFAULT_APP_SETTINGS;

      res.json({
        schemaVersion: 4,
        exportedAt: new Date().toISOString(),
        app: 'executive-suite',
        products,
        transactions,
        expenses,
        appSettings,
        productCategories,
        productSubcategories: subcategories.map((s) => ({
          id: s.id,
          categoryId: s.category_id,
          name: s.name,
          code: s.code,
        })),
        productLocations: locations.map((l) => ({ id: l.id, name: l.name })),
        cashSessions,
      });
    }),
  );

  router.post(
    '/backup/import',
    asyncHandler(async (req, res) => {
      const data = req.body;
      if (!data || data.app !== 'executive-suite') throw new ApiError(400, 'Invalid backup');
      const db = getDb();

      db.runInTransaction(() => {
        db.prepare('DELETE FROM products').run();
        db.prepare('DELETE FROM transactions').run();
        db.prepare('DELETE FROM expenses').run();
        db.prepare('DELETE FROM categories').run();
        db.prepare('DELETE FROM subcategories').run();
        db.prepare('DELETE FROM locations').run();
        db.prepare('DELETE FROM cash_sessions').run();
        db.prepare('DELETE FROM app_settings').run();

        const insertProduct = db.prepare(
          `INSERT INTO products (id, name, sku, category, price, cost, stock, image, category_id, subcategory_id, subcategory, status, unit_of_measure, location_id, barcode)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        );
        for (const p of data.products ?? []) {
          insertProduct.run(
            p.id,
            p.name,
            p.sku,
            p.category,
            p.price,
            p.cost,
            p.stock,
            p.image,
            p.categoryId ?? '',
            p.subcategoryId ?? '',
            p.subcategory ?? '',
            p.status ?? 'active',
            p.unitOfMeasure ?? 'unidad',
            p.locationId ?? null,
            p.barcode ?? null,
          );
        }

        const insertTx = db.prepare(
          `INSERT INTO transactions (id, order_number, customer, amount, status, timestamp, type, created_at, payment_method, receipt_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        );
        for (const tx of data.transactions ?? []) {
          insertTx.run(
            tx.id,
            tx.orderNumber,
            tx.customer,
            tx.amount,
            tx.status,
            tx.timestamp,
            tx.type,
            tx.createdAt,
            tx.paymentMethod ?? null,
            tx.receipt ? JSON.stringify(tx.receipt) : null,
          );
        }

        const insertExpense = db.prepare(
          'INSERT INTO expenses (id, title, amount, category, date, locked) VALUES (?, ?, ?, ?, ?, ?)',
        );
        for (const e of data.expenses ?? []) {
          insertExpense.run(e.id, e.title, e.amount, e.category, e.date, e.locked ? 1 : 0);
        }

        const categories = data.productCategories?.length
          ? data.productCategories
          : [...new Set((data.products ?? []).map((p: { category: string }) => p.category.trim()).filter(Boolean))].map(
              (name: string) => ({ id: newId(), name, code: codeFromCategoryName(name) }),
            );
        const insertCat = db.prepare('INSERT INTO categories (id, name, code) VALUES (?, ?, ?)');
        for (const c of categories) {
          const code = (c as { code?: string }).code ?? codeFromCategoryName(c.name);
          insertCat.run(c.id, c.name, code);
        }

        const insertSub = db.prepare(
          'INSERT INTO subcategories (id, category_id, name, code) VALUES (?, ?, ?, ?)',
        );
        for (const s of data.productSubcategories ?? []) {
          insertSub.run(s.id, s.categoryId, s.name, s.code);
        }
        // Ensure each category has at least General subcategory
        for (const c of categories) {
          const count = db
            .prepare('SELECT COUNT(*) AS n FROM subcategories WHERE category_id = ?')
            .get(c.id) as { n: number };
          if (count.n === 0) {
            insertSub.run(newId(), c.id, 'General', 'GEN');
          }
        }

        const insertLoc = db.prepare('INSERT INTO locations (id, name) VALUES (?, ?)');
        for (const l of data.productLocations ?? []) {
          insertLoc.run(l.id, l.name);
        }

        const insertSession = db.prepare(
          `INSERT INTO cash_sessions (id, opened_at, closed_at, opening_cash, closing_cash, total_cash_sales, total_card_sales, total_transfer_sales, total_other_sales, expected_cash, cash_variance, anomalies_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        );
        for (const s of data.cashSessions ?? []) {
          insertSession.run(
            s.id,
            s.openedAt,
            s.closedAt,
            s.openingCash,
            s.closingCash,
            s.totalCashSales,
            s.totalCardSales,
            s.totalTransferSales,
            s.totalOtherSales,
            s.expectedCash ?? null,
            s.cashVariance ?? null,
            s.anomalies?.length ? JSON.stringify(s.anomalies) : null,
          );
        }

        const s = { ...DEFAULT_APP_SETTINGS, ...(data.appSettings ?? {}), id: 'main' };
        db.prepare(
          `INSERT INTO app_settings (id, store_name, branch, currency, tax_rate, card_qr_payload, dark_mode, low_stock_notifications, manager_name, manager_title, locale)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          'main',
          s.storeName,
          s.branch,
          s.currency,
          s.taxRate,
          s.cardQrPayload,
          s.darkMode ? 1 : 0,
          s.lowStockNotifications ? 1 : 0,
          s.managerName,
          s.managerTitle,
          s.locale,
        );
      });

      res.json({ ok: true });
    }),
  );

  registerCatalogRoutes(router);
}
