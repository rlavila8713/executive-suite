import type { Request, Response, NextFunction } from 'express';
import {
  factoryResetDb,
  getDb,
  newId,
  rowToAppSettings,
  rowToCashSession,
  rowToCategory,
  rowToCustomer,
  rowToExpense,
  rowToProduct,
  rowToTransaction,
  type SqliteStore,
} from './db.js';
import { computeSessionPaymentTotals } from './reporting.js';
import { computeWeightedAverageCost } from './inventoryCost.js';
import { DEFAULT_APP_SETTINGS, normalizeTransferPhone } from './constants.js';
import { registerCatalogRoutes } from './catalogRoutes.js';
import { registerWarehouseRoutes } from './warehouseRoutes.js';
import {
  ensureWarehouseStockRow,
  getDefaultWarehouse,
  MIGRATION_SECTION_NAME,
  receiveProductToWarehouse,
  requireWebClientForWarehouse,
  rowToWarehouse,
  rowToWarehouseMovement,
  rowToWarehouseSection,
  rowToWarehouseStock,
} from './warehouse.js';
import { migrateWarehouseSchema } from './warehouseMigrations.js';
import { normalizeInitialStoreStock, rejectDirectStoreStockMutation } from './storeStockPolicy.js';
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
import { normalizeStoreLogo } from './storeLogo.js';
import { normalizeProductImageForStore } from './normalizeProductImage.js';
import { buildServerDiagnostics, buildClientDiagnostics } from './diagnostics.js';
import { importBackupWithSafety } from './backupImport.js';
import { createSqliteBackup } from './dbBackup.js';
import { inlineProductImageForBackup } from './backupImageInline.js';
import { ApiError } from './apiError.js';
import { assertWebAdminClient } from './adminGuard.js';
import { migrateEmbeddedProductImagesToFiles } from './migrateProductImages.js';
import {
  getDeviceOperatorName,
  inferClientKind,
  getConnectedDevice,
  listConnectedDevices,
  revokeConnectedDevice,
  setDeviceOperatorName,
} from './connectedDevices.js';
import { normalizeMixedSaleReceipt, SaleCheckoutValidationError } from './salesCheckout.js';
import { debtAmountFromReceipt, mixedSaleShape, transferAmountFromReceipt } from './mixedReversal.js';

const TX_INSERT_SQL = `INSERT INTO transactions (id, order_number, customer, amount, status, timestamp, type, created_at, payment_method, receipt_json, source_sale_id, operator_name, source_device_id, debt_status, collected_at, sold_as_debt, customer_id, sold_as_payable, payable_status)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

export { ApiError } from './apiError.js';

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

type OpenCashSession = { id: string; opened_at: number };

function localDayKey(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/** A sale must belong to a session opened today, and the local clock may not move behind its opening. */
function requireCurrentDayCashSession(db: SqliteStore, now: number = Date.now()): OpenCashSession {
  const session = db.prepare('SELECT id, opened_at FROM cash_sessions WHERE closed_at IS NULL LIMIT 1').get() as
    | OpenCashSession
    | undefined;
  if (!session) throw new ApiError(409, 'Cash session must be open before selling', 'ERR_CASH_SESSION_REQUIRED');
  if (now < session.opened_at) {
    throw new ApiError(409, 'System clock is earlier than the cash session opening', 'ERR_CASH_CLOCK_ROLLBACK');
  }
  const lastMovement = db
    .prepare('SELECT MAX(created_at) AS timestamp FROM transactions WHERE created_at >= ?')
    .get(session.opened_at) as { timestamp: number | null } | undefined;
  if (lastMovement?.timestamp != null && now < lastMovement.timestamp) {
    throw new ApiError(409, 'System clock is earlier than a recorded cash movement', 'ERR_CASH_CLOCK_ROLLBACK');
  }
  if (localDayKey(session.opened_at) !== localDayKey(now)) {
    throw new ApiError(409, 'Close the previous daily cash session before selling', 'ERR_CASH_SESSION_DAILY_CLOSE_REQUIRED');
  }
  return session;
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
      if (!Number.isFinite(price) || !Number.isFinite(cost) || price < 0 || cost < 0) {
        throw new ApiError(400, 'price and cost must be non-negative numbers');
      }
      const stock = normalizeInitialStoreStock(Number(body.stock));
      const warehouseCost = 0;
      const db = getDb();
      const id = newId();
      const image = normalizeProductImageForStore(id, String(body.image ?? ''));
      const categoryId = String(body.categoryId ?? '');
      const subcategoryId = String(body.subcategoryId ?? '');
      const subcategory = String(body.subcategory ?? '');
      const status = String(body.status ?? 'active');
      const unitOfMeasure = String(body.unitOfMeasure ?? 'unidad');
      const locationId = body.locationId != null && body.locationId !== '' ? String(body.locationId) : null;
      const barcode = body.barcode != null && body.barcode !== '' ? String(body.barcode) : null;
      const warehouse = getDefaultWarehouse(db);
      const migrationSection = db
        .prepare(
          'SELECT id FROM warehouse_sections WHERE warehouse_id = ? AND name = ? COLLATE NOCASE LIMIT 1',
        )
        .get(warehouse.id, MIGRATION_SECTION_NAME) as { id: string } | undefined;

      db.prepare(
        `INSERT INTO products (id, name, sku, category, price, cost, warehouse_cost, stock, image, category_id, subcategory_id, subcategory, status, unit_of_measure, location_id, barcode)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        name,
        sku,
        category,
        price,
        cost,
        warehouseCost,
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
      if (migrationSection) {
        ensureWarehouseStockRow(db, warehouse.id, migrationSection.id, id, cost);
      }
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
      if (body.stock !== undefined) {
        rejectDirectStoreStockMutation();
      }
      if (body.cost !== undefined || body.warehouseCost !== undefined) {
        throw new ApiError(
          409,
          'Product costs are set via warehouse entry or transfer',
          'ERR_PRODUCT_COST_READONLY',
        );
      }
      const fields: string[] = [];
      const values: unknown[] = [];
      const map: Record<string, string> = {
        name: 'name',
        sku: 'sku',
        category: 'category',
        price: 'price',
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
        if (body[key] === undefined) continue;
        if (key === 'price') {
          const price = Number(body.price);
          if (!Number.isFinite(price) || price < 0) {
            throw new ApiError(400, 'price must be a non-negative number', 'ERR_INVALID_PRODUCT_PRICE');
          }
          fields.push(`${col} = ?`);
          values.push(price);
          continue;
        }
        fields.push(`${col} = ?`);
        if (key === 'image') {
          values.push(normalizeProductImageForStore(req.params.id, String(body[key])));
        } else {
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
    asyncHandler(async (_req, _res) => {
      rejectDirectStoreStockMutation();
    }),
  );

  router.post(
    '/products/:id/receive',
    asyncHandler(async (req, res) => {
      requireWebClientForWarehouse(req);
      const body = req.body as { quantity?: number; unitCost?: number; price?: number };
      const quantity = Math.floor(Number(body.quantity));
      const unitCost = Number(body.unitCost);
      const price = body.price === undefined || body.price === null ? 0 : Number(body.price);
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
      const deviceId = req.header('X-Device-Id')?.trim() ?? '';
      const operator = getDeviceOperatorName(db, deviceId);
      const result = receiveProductToWarehouse(
        db,
        req.params.id,
        quantity,
        unitCost,
        price,
        operator || null,
      );

      res.json({
        product: rowToProduct(result.product as Parameters<typeof rowToProduct>[0]),
        previousWarehouseQty: result.previousWarehouseQty,
        newWarehouseQty: result.newWarehouseQty,
        warehouseStock: result.warehouseStock,
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
      if ((body.type === 'sale' && body.status === 'completed') || body.type === 'return') {
        requireCurrentDayCashSession(db);
      }
      db.prepare(TX_INSERT_SQL).run(
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
        body.sourceSaleId ?? null,
        typeof body.operatorName === 'string' ? body.operatorName : null,
        typeof body.sourceDeviceId === 'string' ? body.sourceDeviceId : null,
        null,
        null,
        0,
        typeof body.customerId === 'string' ? body.customerId : null,
        body.soldAsPayable ? 1 : 0,
        typeof body.payableStatus === 'string' ? body.payableStatus : null,
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
        | { status: string; type: string }
        | undefined;
      if (!existing) throw new ApiError(404, 'Transaction not found');
      if ((existing.type === 'sale' && existing.status === 'completed') || existing.type === 'return') {
        throw new ApiError(409, 'Settled transactions cannot be edited', 'ERR_SETTLED_TRANSACTION_IMMUTABLE');
      }
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
            order_number: string;
            customer: string;
            amount: number;
            payment_method: string | null;
            operator_name?: string | null;
            source_device_id?: string | null;
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
      const debtRow = existing as { sold_as_debt?: number; debt_status?: string | null };
      if (debtRow.sold_as_debt === 1 && debtRow.debt_status === 'collected') {
        throw new ApiError(
          409,
          'Cannot reverse a sale whose debt was already collected',
          'ERR_SALE_DEBT_COLLECTED_CANNOT_REVERSE',
        );
      }
      const alreadyReversed = db
        .prepare('SELECT id FROM transactions WHERE source_sale_id = ? LIMIT 1')
        .get(existing.id);
      if (alreadyReversed) {
        throw new ApiError(409, 'Sale already reversed', 'ERR_SALE_ALREADY_REVERSED');
      }
      requireCurrentDayCashSession(db);

      const receiptParsed = existing.receipt_json ? JSON.parse(existing.receipt_json) : null;
      const mixedShape = mixedSaleShape(receiptParsed);
      const transferOwed = mixedShape === 'cash_transfer' ? transferAmountFromReceipt(receiptParsed) : 0;
      const debtPart = mixedShape === 'cash_debt' ? debtAmountFromReceipt(receiptParsed) : 0;
      const pendingReceivable =
        debtRow.sold_as_debt === 1 && debtRow.debt_status === 'pending' && (debtPart > 0 || mixedShape !== 'cash_transfer');

      if (transferOwed > 0) {
        const existingPayable = db
          .prepare(`SELECT id FROM transactions WHERE type = 'payable' AND source_sale_id = ? AND payable_status = 'pending' LIMIT 1`)
          .get(existing.id);
        if (existingPayable) {
          throw new ApiError(409, 'Payable already exists for this sale', 'ERR_PAYABLE_EXISTS');
        }
      }

      const lines = parseReceiptLines(existing.receipt_json);
      const reversalId = newId();
      const createdAt = Date.now();
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
        db.prepare(TX_INSERT_SQL).run(
          reversalId,
          `#R-${existing.order_number.replace(/^#/, '')}`,
          existing.customer,
          -Math.abs(existing.amount),
          'refunded',
          'Just now',
          'return',
          createdAt,
          existing.payment_method,
          existing.receipt_json,
          existing.id,
          existing.operator_name ?? null,
          existing.source_device_id ?? null,
          null,
          null,
          0,
          (existing as { customer_id?: string | null }).customer_id ?? null,
          0,
          null,
        );

        if (pendingReceivable) {
          const debtDisplayAmount =
            debtPart > 0
              ? debtPart
              : typeof receiptParsed?.balanceDue === 'number' && receiptParsed.balanceDue > 0
                ? receiptParsed.balanceDue
                : Math.abs(existing.amount);
          const reversedReceipt =
            receiptParsed != null
              ? {
                  ...receiptParsed,
                  debtReversedAmount: debtDisplayAmount,
                  balanceDue: 0,
                }
              : null;
          db.prepare(`UPDATE transactions SET debt_status = 'reversed', receipt_json = ? WHERE id = ?`).run(
            reversedReceipt ? JSON.stringify(reversedReceipt) : existing.receipt_json,
            existing.id,
          );
        }

        if (transferOwed > 0) {
          const payableId = newId();
          const payableReceipt = {
            reason: 'mixed_reversal_transfer',
            transferAmount: transferOwed,
            originalOrderNumber: existing.order_number,
            originalSaleId: existing.id,
          };
          db.prepare(TX_INSERT_SQL).run(
            payableId,
            `#PP-${existing.order_number.replace(/^#/, '')}`,
            existing.customer,
            transferOwed,
            'pending',
            'Just now',
            'payable',
            createdAt,
            'transfer',
            JSON.stringify(payableReceipt),
            existing.id,
            existing.operator_name ?? null,
            existing.source_device_id ?? null,
            null,
            null,
            0,
            (existing as { customer_id?: string | null }).customer_id ?? null,
            1,
            'pending',
          );
        }
      });

      const row = db.prepare('SELECT * FROM transactions WHERE id = ?').get(reversalId);
      res.json(rowToTransaction(row as Parameters<typeof rowToTransaction>[0]));
    }),
  );

  // --- Sales (atomic checkout) ---
  router.post(
    '/sales',
    asyncHandler(async (req, res) => {
      const body = req.body as {
        customerName?: string;
        customerId?: string;
        amount?: number;
        isDebt?: boolean;
        isPartialDebt?: boolean;
        receipt?: {
          lines: { productId?: string; sku: string; quantity: number; name?: string }[];
          paymentMethod?: string;
          total?: number;
          subtotal?: number;
          payments?: { method: string; amount: number }[];
          [key: string]: unknown;
        };
      };
      if (!body.receipt?.lines?.length) throw new ApiError(400, 'Receipt lines required');

      const db = getDb();
      requireCurrentDayCashSession(db);
      const deviceId = req.header('X-Device-Id')?.trim() ?? '';
      let customerId: string | null = null;
      if (body.customerId?.trim()) {
        const c = db.prepare('SELECT id FROM customers WHERE id = ?').get(body.customerId.trim()) as
          | { id: string }
          | undefined;
        if (c) customerId = c.id;
      }
      const clientKind = inferClientKind(req.header('User-Agent') ?? '', req.header('X-Client-Kind') ?? undefined);
      const operatorName = deviceId ? getDeviceOperatorName(db, deviceId) : '';
      if (clientKind === 'mobile' && !operatorName) {
        throw new ApiError(409, 'Assign an operator to this device before selling', 'ERR_OPERATOR_REQUIRED');
      }

      const settingsRow = db.prepare('SELECT tax_rate FROM app_settings WHERE id = ?').get('main') as
        | { tax_rate: number }
        | undefined;
      const taxRate = settingsRow?.tax_rate ?? 0;

      const isDebtFull = body.isDebt === true && body.isPartialDebt !== true;
      let checkout;
      try {
        checkout = normalizeMixedSaleReceipt(body.receipt as import('./salesCheckout.js').SaleReceiptInput, taxRate, {
          isDebt: isDebtFull,
          isPartialDebt: body.isPartialDebt === true,
          clientKind,
        });
      } catch (e) {
        if (e instanceof SaleCheckoutValidationError) {
          throw new ApiError(e.status, e.message, e.code);
        }
        throw e;
      }

      const soldAsDebt = checkout.soldAsDebt || isDebtFull;
      const customerTrim = (body.customerName ?? '').trim();
      if (soldAsDebt && !customerTrim) {
        throw new ApiError(400, 'Customer name is required for debt sales', 'ERR_DEBT_CUSTOMER_REQUIRED');
      }

      const amount = body.amount && body.amount > 0 ? body.amount : (checkout.receipt.total ?? 0);
      const paymentMethod = soldAsDebt && !checkout.receipt.payments?.length
        ? ('debt' as const)
        : (checkout.paymentMethod as 'cash' | 'card' | 'transfer' | 'other' | 'mixed' | 'debt');
      const receipt = {
        ...checkout.receipt,
        ...(operatorName ? { operatorName } : {}),
      };
      const newTransaction = {
        id: newId(),
        orderNumber: `#${Math.floor(Math.random() * 90000) + 10000}`,
        customer: customerTrim || 'Walk-in Customer',
        amount,
        status: 'completed' as const,
        timestamp: 'Just now',
        type: 'sale' as const,
        createdAt: Date.now(),
        receipt,
        paymentMethod,
        operatorName: operatorName || undefined,
        sourceDeviceId: deviceId || undefined,
        soldAsDebt,
        debtStatus: soldAsDebt ? ('pending' as const) : undefined,
        customerId: customerId ?? undefined,
      };

      db.runInTransaction(() => {
        for (const line of body.receipt!.lines) {
          const qty = Number(line.quantity);
          if (!Number.isFinite(qty) || qty <= 0) {
            throw new ApiError(400, 'Invalid line quantity', 'ERR_INVALID_QTY');
          }
          let product: { id: string; stock: number; name: string } | undefined;
          if (line.productId) {
            product = db.prepare('SELECT id, stock, name FROM products WHERE id = ?').get(line.productId) as
              | { id: string; stock: number; name: string }
              | undefined;
          }
          if (!product && line.sku) {
            product = db.prepare('SELECT id, stock, name FROM products WHERE sku = ?').get(line.sku) as
              | { id: string; stock: number; name: string }
              | undefined;
          }
          if (product && product.stock < qty) {
            throw new ApiError(
              409,
              'Insufficient stock',
              `ERR_INSUFFICIENT_STOCK|${encodeURIComponent(line.sku ?? '')}|${encodeURIComponent(product.name)}`,
            );
          }
        }

        db.prepare(TX_INSERT_SQL).run(
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
          null,
          operatorName || null,
          deviceId || null,
          soldAsDebt ? 'pending' : null,
          null,
          soldAsDebt ? 1 : 0,
          customerId,
          0,
          null,
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
            db.prepare('UPDATE products SET stock = ? WHERE id = ?').run(product.stock - line.quantity, product.id);
          }
        }
      });

      res.status(201).json(newTransaction);
    }),
  );

  router.post(
    '/receivables/:id/collect',
    asyncHandler(async (req, res) => {
      const body = requireBody<{ paymentMethod: string }>(req.body, ['paymentMethod']);
      const method = body.paymentMethod;
      if (method !== 'cash' && method !== 'card' && method !== 'transfer') {
        throw new ApiError(400, 'Invalid payment method for collection');
      }
      const db = getDb();
      requireCurrentDayCashSession(db);
      const existing = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id) as
        | {
            id: string;
            debt_status: string | null;
            sold_as_debt: number;
            receipt_json: string | null;
          }
        | undefined;
      if (!existing || existing.sold_as_debt !== 1 || existing.debt_status !== 'pending') {
        throw new ApiError(404, 'Pending debt sale not found', 'ERR_DEBT_NOT_FOUND');
      }
      const collectedAt = Date.now();
      const settingsRow = db.prepare('SELECT tax_rate FROM app_settings WHERE id = ?').get('main') as
        | { tax_rate: number }
        | undefined;
      const taxRate = settingsRow?.tax_rate ?? 0;
      let receipt = existing.receipt_json ? JSON.parse(existing.receipt_json) : {};
      const balanceDue =
        typeof receipt.balanceDue === 'number' && receipt.balanceDue > 0
          ? receipt.balanceDue
          : Math.abs((existing as { amount?: number }).amount ?? (receipt.total as number) ?? 0);
      let amount = balanceDue;
      const mixedTaxIncluded = receipt.mixedTaxIncluded === true;
      if (mixedTaxIncluded) {
        receipt = {
          ...receipt,
          balanceDue: 0,
          collectedPaymentMethod: method,
          debtCollectedAmount: balanceDue,
        };
      } else if (method === 'transfer' && taxRate > 0) {
        const partialMixedDebt =
          receipt.paymentMethod === 'mixed' &&
          Array.isArray(receipt.payments) &&
          receipt.payments.some((p: { method: string }) => p.method === 'cash');
        const taxBase = partialMixedDebt ? balanceDue : typeof receipt.subtotal === 'number' ? receipt.subtotal : amount;
        const tax = Math.round(taxBase * (taxRate / 100) * 100) / 100;
        const total = Math.round((balanceDue + tax) * 100) / 100;
        receipt = {
          ...receipt,
          paymentMethod: method,
          tax,
          taxRatePercent: taxRate,
          total: typeof receipt.total === 'number' ? Math.round((receipt.total + tax) * 100) / 100 : total,
          collectedPaymentMethod: method,
          debtCollectedAmount: total,
        };
        amount = total;
      } else {
        receipt = {
          ...receipt,
          paymentMethod: method,
          collectedPaymentMethod: method,
          debtCollectedAmount: balanceDue,
        };
      }
      db.prepare(
        `UPDATE transactions SET debt_status = 'collected', collected_at = ?, payment_method = ?, receipt_json = ?, amount = ? WHERE id = ?`,
      ).run(collectedAt, method, JSON.stringify(receipt), amount, req.params.id);
      const row = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id);
      res.json(rowToTransaction(row as Parameters<typeof rowToTransaction>[0]));
    }),
  );

  router.post(
    '/payables/:id/pay',
    asyncHandler(async (req, res) => {
      const body = requireBody<{ paymentMethod: string }>(req.body, ['paymentMethod']);
      if (body.paymentMethod !== 'transfer') {
        throw new ApiError(400, 'Payables from mixed reversals are settled by transfer', 'ERR_INVALID_PAYABLE_METHOD');
      }
      const db = getDb();
      requireCurrentDayCashSession(db);
      const existing = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id) as
        | { id: string; type: string; sold_as_payable: number; payable_status: string | null; receipt_json: string | null }
        | undefined;
      if (!existing || existing.type !== 'payable' || existing.sold_as_payable !== 1 || existing.payable_status !== 'pending') {
        throw new ApiError(404, 'Pending payable not found', 'ERR_PAYABLE_NOT_FOUND');
      }
      const paidAt = Date.now();
      let receipt = existing.receipt_json ? JSON.parse(existing.receipt_json) : {};
      receipt = { ...receipt, paidPaymentMethod: 'transfer', paidAt };
      db.prepare(
        `UPDATE transactions SET payable_status = 'paid', status = 'completed', collected_at = ?, payment_method = 'transfer', receipt_json = ? WHERE id = ?`,
      ).run(paidAt, JSON.stringify(receipt), req.params.id);
      const row = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id);
      res.json(rowToTransaction(row as Parameters<typeof rowToTransaction>[0]));
    }),
  );

  router.post(
    '/payables/:id/void',
    asyncHandler(async (req, res) => {
      const db = getDb();
      const existing = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id) as
        | { id: string; type: string; sold_as_payable: number; payable_status: string | null }
        | undefined;
      if (!existing || existing.type !== 'payable' || existing.sold_as_payable !== 1 || existing.payable_status !== 'pending') {
        throw new ApiError(404, 'Pending payable not found', 'ERR_PAYABLE_NOT_FOUND');
      }
      db.prepare(`UPDATE transactions SET payable_status = 'void', status = 'void' WHERE id = ?`).run(req.params.id);
      const row = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id);
      res.json(rowToTransaction(row as Parameters<typeof rowToTransaction>[0]));
    }),
  );

  router.patch(
    '/transactions/:id/customer',
    asyncHandler(async (req, res) => {
      const body = requireBody<{ customerId: string }>(req.body, ['customerId']);
      const customerId = body.customerId.trim();
      if (!customerId) throw new ApiError(400, 'Customer id required');
      const db = getDb();
      const existing = db.prepare('SELECT id FROM transactions WHERE id = ?').get(req.params.id);
      if (!existing) throw new ApiError(404, 'Transaction not found');
      const customer = db.prepare('SELECT id FROM customers WHERE id = ?').get(customerId);
      if (!customer) throw new ApiError(404, 'Customer not found');
      db.prepare('UPDATE transactions SET customer_id = ? WHERE id = ?').run(customerId, req.params.id);
      const row = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id);
      res.json(rowToTransaction(row as Parameters<typeof rowToTransaction>[0]));
    }),
  );

  // --- Customers ---
  router.get(
    '/customers',
    asyncHandler(async (_req, res) => {
      const db = getDb();
      const rows = db.prepare('SELECT * FROM customers ORDER BY first_name, last_name').all();
      res.json(rows.map((r) => rowToCustomer(r as Parameters<typeof rowToCustomer>[0])));
    }),
  );

  router.post(
    '/customers',
    asyncHandler(async (req, res) => {
      const body = requireBody<{ firstName: string }>(req.body, ['firstName']);
      const firstName = body.firstName.trim();
      if (!firstName) throw new ApiError(400, 'First name is required', 'ERR_CUSTOMER_NAME_REQUIRED');
      const db = getDb();
      const id = newId();
      const createdAt = Date.now();
      db.prepare(
        `INSERT INTO customers (id, first_name, last_name, address, phone, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        firstName,
        String((req.body as { lastName?: string }).lastName ?? '').trim(),
        String((req.body as { address?: string }).address ?? '').trim(),
        String((req.body as { phone?: string }).phone ?? '').trim(),
        String((req.body as { notes?: string }).notes ?? '').trim(),
        createdAt,
      );
      const row = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
      res.status(201).json(rowToCustomer(row as Parameters<typeof rowToCustomer>[0]));
    }),
  );

  router.patch(
    '/customers/:id',
    asyncHandler(async (req, res) => {
      const db = getDb();
      const existing = db.prepare('SELECT id FROM customers WHERE id = ?').get(req.params.id);
      if (!existing) throw new ApiError(404, 'Customer not found');
      const body = req.body as Record<string, unknown>;
      const map: Record<string, string> = {
        firstName: 'first_name',
        lastName: 'last_name',
        address: 'address',
        phone: 'phone',
        notes: 'notes',
      };
      const sets: string[] = [];
      const vals: unknown[] = [];
      for (const [k, col] of Object.entries(map)) {
        if (body[k] !== undefined) {
          sets.push(`${col} = ?`);
          vals.push(String(body[k]).trim());
        }
      }
      if (sets.length === 0) throw new ApiError(400, 'No fields to update');
      vals.push(req.params.id);
      db.prepare(`UPDATE customers SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
      const row = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
      res.json(rowToCustomer(row as Parameters<typeof rowToCustomer>[0]));
    }),
  );

  router.delete(
    '/customers/:id',
    asyncHandler(async (req, res) => {
      const db = getDb();
      const r = db.prepare('DELETE FROM customers WHERE id = ?').run(req.params.id);
      if (r.changes === 0) throw new ApiError(404, 'Customer not found');
      res.status(204).send();
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
    '/settings/logo',
    asyncHandler(async (req, res) => {
      const db = getDb();
      const row = db.prepare('SELECT store_logo FROM app_settings WHERE id = ?').get('main') as
        | { store_logo: string }
        | undefined;
      const resolved = resolveProductImage(row?.store_logo);
      if (!resolved) {
        res.status(404).json({ error: 'Store has no logo' });
        return;
      }
      if (resolved.kind === 'redirect') {
        res.redirect(302, resolved.url);
        return;
      }
      res.setHeader('Content-Type', resolved.contentType);
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
        let storeLogo = '';
        try {
          storeLogo = normalizeStoreLogo(body.storeLogo ?? '');
        } catch (err) {
          throw new ApiError(400, err instanceof Error ? err.message : 'Invalid store logo');
        }
        db.prepare(
          `INSERT INTO app_settings (id, store_name, branch, currency, tax_rate, card_qr_payload, transfer_bank, transfer_account_holder, transfer_account_number, transfer_phone_number, transfer_qr_extra, dark_mode, low_stock_notifications, manager_name, manager_title, locale, store_logo)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          'main',
          s.storeName,
          s.branch,
          s.currency,
          s.taxRate,
          s.cardQrPayload,
          s.transferBank ?? '',
          s.transferAccountHolder ?? '',
          s.transferAccountNumber ?? '',
          normalizeTransferPhone(String(s.transferPhoneNumber ?? '')),
          s.transferQrExtra ?? '',
          s.darkMode ? 1 : 0,
          s.lowStockNotifications ? 1 : 0,
          s.managerName,
          s.managerTitle,
          s.locale,
          storeLogo,
        );
      } else {
        const map: Record<string, string> = {
          storeName: 'store_name',
          branch: 'branch',
          currency: 'currency',
          taxRate: 'tax_rate',
          cardQrPayload: 'card_qr_payload',
          transferBank: 'transfer_bank',
          transferAccountHolder: 'transfer_account_holder',
          transferAccountNumber: 'transfer_account_number',
          transferPhoneNumber: 'transfer_phone_number',
          transferQrExtra: 'transfer_qr_extra',
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
            if (key === 'transferPhoneNumber') val = normalizeTransferPhone(String(val ?? ''));
            values.push(val);
          }
        }
        if (body.storeLogo !== undefined) {
          try {
            fields.push('store_logo = ?');
            values.push(normalizeStoreLogo(body.storeLogo));
          } catch (err) {
            throw new ApiError(400, err instanceof Error ? err.message : 'Invalid store logo');
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
      const lastActivity = db.prepare('SELECT MAX(COALESCE(closed_at, opened_at)) AS timestamp FROM cash_sessions').get() as
        | { timestamp: number | null }
        | undefined;
      if (lastActivity?.timestamp != null && openedAt < lastActivity.timestamp) {
        throw new ApiError(409, 'System clock cannot precede a prior cash session', 'ERR_CASH_CLOCK_ROLLBACK');
      }
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
      if (closedAt < s.opened_at) {
        throw new ApiError(409, 'System clock is earlier than the cash session opening', 'ERR_CASH_CLOCK_ROLLBACK');
      }
      const lastMovement = db
        .prepare('SELECT MAX(created_at) AS timestamp FROM transactions WHERE created_at >= ?')
        .get(s.opened_at) as { timestamp: number | null } | undefined;
      if (lastMovement?.timestamp != null && closedAt < lastMovement.timestamp) {
        throw new ApiError(409, 'System clock is earlier than a recorded cash movement', 'ERR_CASH_CLOCK_ROLLBACK');
      }
      const allTx = db.prepare('SELECT * FROM transactions').all();
      const transactions = allTx.map((r) => rowToTransaction(r as Parameters<typeof rowToTransaction>[0]));
      const totals = computeSessionPaymentTotals(
        transactions as Parameters<typeof computeSessionPaymentTotals>[0],
        s.opened_at,
        closedAt,
      );
      const expectedCash = s.opening_cash + totals.totalCashSales;
      const variance = body.closingCash - expectedCash;
      const anomalies = detectCashAnomalies(
        s.opening_cash,
        body.closingCash,
        totals.totalCashSales,
        totals.totalDebtSales,
      );
      db.prepare(
        `UPDATE cash_sessions SET closed_at = ?, closing_cash = ?, total_cash_sales = ?, total_card_sales = ?, total_transfer_sales = ?, total_other_sales = ?, total_debt_sales = ?,
         expected_cash = ?, cash_variance = ?, anomalies_json = ?
         WHERE id = ?`,
      ).run(
        closedAt,
        body.closingCash,
        totals.totalCashSales,
        totals.totalCardSales,
        totals.totalTransferSales,
        totals.totalOtherSales,
        totals.totalDebtSales,
        expectedCash,
        variance,
        anomalies.length > 0 ? JSON.stringify(anomalies) : null,
        req.params.id,
      );
      const row = db.prepare('SELECT * FROM cash_sessions WHERE id = ?').get(req.params.id);
      res.json(rowToCashSession(row as Parameters<typeof rowToCashSession>[0]));
    }),
  );

  router.post(
    '/cash-sessions/:id/correct-close',
    asyncHandler(async (req, res) => {
      const body = requireBody<{ closingCash: number }>(req.body, ['closingCash']);
      if (typeof body.closingCash !== 'number' || !Number.isFinite(body.closingCash) || body.closingCash < 0) {
        throw new ApiError(400, 'Invalid closing cash amount');
      }
      const db = getDb();
      const s = db.prepare('SELECT * FROM cash_sessions WHERE id = ?').get(req.params.id) as
        | Parameters<typeof rowToCashSession>[0]
        | undefined;
      if (!s || s.closed_at == null) throw new ApiError(404, 'Closed cash session not found');
      const expectedCash = s.opening_cash + s.total_cash_sales;
      const variance = body.closingCash - expectedCash;
      const debtSales = (s as { total_debt_sales?: number }).total_debt_sales ?? 0;
      const anomalies = detectCashAnomalies(s.opening_cash, body.closingCash, s.total_cash_sales, debtSales);
      db.prepare(
        `UPDATE cash_sessions SET closing_cash = ?, expected_cash = ?, cash_variance = ?, anomalies_json = ? WHERE id = ?`,
      ).run(
        body.closingCash,
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

  // --- Connected devices ---
  router.get(
    '/devices',
    asyncHandler(async (req, res) => {
      const db = getDb();
      const deviceId = req.header('X-Device-Id')?.trim();
      const page = Math.max(1, Number.parseInt(String(req.query.page ?? '1'), 10) || 1);
      const pageSize = Math.min(
        50,
        Math.max(1, Number.parseInt(String(req.query.pageSize ?? '10'), 10) || 10),
      );
      const q = typeof req.query.q === 'string' ? req.query.q : '';
      res.json(listConnectedDevices(db, deviceId, Date.now(), { page, pageSize, q }));
    }),
  );

  router.post(
    '/devices/:deviceId/revoke',
    asyncHandler(async (req, res) => {
      const db = getDb();
      const currentId = req.header('X-Device-Id')?.trim();
      const targetId = req.params.deviceId?.trim();
      if (!targetId) throw new ApiError(400, 'Device id required');
      if (targetId === currentId) {
        throw new ApiError(400, 'Cannot disconnect the current device', 'ERR_DEVICE_REVOKE_SELF');
      }
      const ok = revokeConnectedDevice(db, targetId);
      if (!ok) throw new ApiError(404, 'Device not found or already disconnected', 'ERR_DEVICE_NOT_FOUND');
      res.json({ ok: true });
    }),
  );

  router.patch(
    '/devices/:deviceId/operator',
    asyncHandler(async (req, res) => {
      const db = getDb();
      const requesterKind = inferClientKind(req.header('User-Agent') ?? '', req.header('X-Client-Kind') ?? undefined);
      if (requesterKind === 'mobile') {
        throw new ApiError(403, 'Operators can only be assigned from the store computer', 'ERR_OPERATOR_ASSIGN_FORBIDDEN');
      }
      const targetId = req.params.deviceId?.trim();
      if (!targetId) throw new ApiError(400, 'Device id required');
      const body = req.body as { operatorName?: string };
      const operatorName = typeof body.operatorName === 'string' ? body.operatorName : '';
      const ok = setDeviceOperatorName(db, targetId, operatorName);
      if (!ok) throw new ApiError(404, 'Device not found', 'ERR_DEVICE_NOT_FOUND');
      const updated = getConnectedDevice(db, targetId, req.header('X-Device-Id')?.trim());
      if (!updated) throw new ApiError(404, 'Device not found', 'ERR_DEVICE_NOT_FOUND');
      res.json(updated);
    }),
  );

  // --- Admin ---
  router.post(
    '/admin/factory-reset',
    asyncHandler(async (req, res) => {
      assertWebAdminClient(req);
      const db = getDb();
      createSqliteBackup('pre-factory-reset');
      factoryResetDb(db);
      res.json({ ok: true });
    }),
  );

  router.get(
    '/admin/diagnostics',
    asyncHandler(async (req, res) => {
      assertWebAdminClient(req);
      const db = getDb();
      res.json(buildServerDiagnostics(db));
    }),
  );

  router.post(
    '/admin/migrate-product-images',
    asyncHandler(async (req, res) => {
      assertWebAdminClient(req);
      const db = getDb();
      const dryRun = req.query.dryRun === 'true' || req.query.dryRun === '1';
      const body = (req.body ?? {}) as { dryRun?: boolean };
      const result = migrateEmbeddedProductImagesToFiles(db, {
        dryRun: dryRun || body.dryRun === true,
      });
      res.json(result);
    }),
  );

  router.get(
    '/diagnostics/summary',
    asyncHandler(async (req, res) => {
      const db = getDb();
      const host = req.get('host') ?? '';
      const proto = req.protocol;
      const apiBaseUrl = host ? `${proto}://${host}` : '';
      res.json(buildClientDiagnostics(db, apiBaseUrl));
    }),
  );

  // --- Backup ---
  router.get(
    '/backup',
    asyncHandler(async (_req, res) => {
      const db = getDb();
      const products = db
        .prepare('SELECT * FROM products')
        .all()
        .map((r) => {
          const p = rowToProduct(r as Parameters<typeof rowToProduct>[0]);
          return { ...p, image: inlineProductImageForBackup(p.image) };
        });
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
      const settingsRow = db.prepare('SELECT * FROM app_settings WHERE id = ?').get('main') as
        | { store_logo?: string }
        | undefined;
      const appSettings = settingsRow
        ? {
            ...rowToAppSettings(settingsRow as Parameters<typeof rowToAppSettings>[0]),
            storeLogo: settingsRow.store_logo ?? '',
          }
        : { ...DEFAULT_APP_SETTINGS, storeLogo: '' };

      const warehouses = db.prepare('SELECT * FROM warehouses ORDER BY name').all();
      const warehouseSections = db.prepare('SELECT * FROM warehouse_sections ORDER BY name').all();
      const warehouseStock = db
        .prepare(
          `SELECT ws.*, s.name AS section_name, p.name AS product_name, p.sku AS product_sku
           FROM warehouse_stock ws
           JOIN warehouse_sections s ON s.id = ws.section_id
           JOIN products p ON p.id = ws.product_id`,
        )
        .all();
      const warehouseMovements = db
        .prepare('SELECT * FROM warehouse_movements ORDER BY created_at DESC LIMIT 5000')
        .all();
      const customers = db
        .prepare('SELECT * FROM customers ORDER BY first_name, last_name')
        .all()
        .map((r) => rowToCustomer(r as Parameters<typeof rowToCustomer>[0]));

      res.json({
        schemaVersion: 6,
        exportedAt: new Date().toISOString(),
        app: 'executive-suite',
        products,
        transactions,
        expenses,
        customers,
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
        warehouses: warehouses.map((w) => rowToWarehouse(w as Parameters<typeof rowToWarehouse>[0])),
        warehouseSections: warehouseSections.map((s) =>
          rowToWarehouseSection(s as Parameters<typeof rowToWarehouseSection>[0]),
        ),
        warehouseStock: warehouseStock.map((r) =>
          rowToWarehouseStock(r as Parameters<typeof rowToWarehouseStock>[0], {
            sectionName: (r as { section_name: string }).section_name,
            productName: (r as { product_name: string }).product_name,
            productSku: (r as { product_sku: string }).product_sku,
          }),
        ),
        warehouseMovements: warehouseMovements.map((m) =>
          rowToWarehouseMovement(m as Parameters<typeof rowToWarehouseMovement>[0]),
        ),
      });
    }),
  );

  router.post(
    '/backup/import',
    asyncHandler(async (req, res) => {
      assertWebAdminClient(req);
      const db = getDb();
      const body = req.body as { allowEmptyProducts?: boolean };
      const allowEmptyProducts = body?.allowEmptyProducts === true;
      importBackupWithSafety(db, req.body, { allowEmptyProducts });
      res.json({ ok: true });
    }),
  );

  registerCatalogRoutes(router);
  registerWarehouseRoutes(router);
}
