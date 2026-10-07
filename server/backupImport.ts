import type { SqliteStore } from './db.js';
import { createSqliteBackup } from './dbBackup.js';
import { logStructured } from './structuredLog.js';
import { codeFromCategoryName } from './migrations.js';
import { newId } from './db.js';
import { DEFAULT_APP_SETTINGS, normalizeTransferPhone } from './constants.js';
import { normalizeStoreLogo } from './storeLogo.js';
import { ApiError } from './apiError.js';
import { normalizeProductImageForStore } from './normalizeProductImage.js';
import { migrateWarehouseSchema } from './warehouseMigrations.js';

const TX_INSERT_SQL = `INSERT INTO transactions (id, order_number, customer, amount, status, timestamp, type, created_at, payment_method, receipt_json, source_sale_id, operator_name, source_device_id, debt_status, collected_at, sold_as_debt, customer_id, sold_as_payable, payable_status)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

// Re-export validation types - minimal server-side validation mirroring client parseBackupJson

export type BackupImportBody = {
  app: string;
  schemaVersion?: number;
  products?: unknown[];
  transactions?: unknown[];
  expenses?: unknown[];
  appSettings?: unknown;
  productCategories?: unknown[];
  productSubcategories?: unknown[];
  productLocations?: unknown[];
  cashSessions?: unknown[];
  customers?: unknown[];
  warehouses?: unknown[];
  warehouseSections?: unknown[];
  warehouseStock?: unknown[];
  warehouseMovements?: unknown[];
};

export type ImportBackupOptions = {
  /** Required to replace a non-empty catalog with zero products. */
  allowEmptyProducts?: boolean;
};

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function validateProductRow(p: unknown): void {
  if (!isRecord(p)) throw new ApiError(400, 'Invalid product row');
  for (const key of ['id', 'name', 'sku', 'category', 'image'] as const) {
    if (typeof p[key] !== 'string') throw new ApiError(400, `Invalid product field: ${key}`);
  }
  for (const key of ['price', 'cost', 'stock'] as const) {
    if (typeof p[key] !== 'number' || !Number.isFinite(p[key])) {
      throw new ApiError(400, `Invalid product field: ${key}`);
    }
  }
}

export function validateBackupImportPayload(data: unknown, options: ImportBackupOptions = {}): BackupImportBody {
  if (!isRecord(data) || data.app !== 'executive-suite') {
    throw new ApiError(400, 'Invalid backup');
  }
  const body = data as BackupImportBody;
  const products = body.products ?? [];
  const transactions = body.transactions ?? [];
  const expenses = body.expenses ?? [];

  if (!Array.isArray(products) || !Array.isArray(transactions) || !Array.isArray(expenses)) {
    throw new ApiError(400, 'Invalid backup arrays');
  }

  for (const p of products) validateProductRow(p);
  if (!isRecord(body.appSettings)) throw new ApiError(400, 'Invalid appSettings');

  const sv = body.schemaVersion;
  if (
    sv !== undefined &&
    sv !== 1 &&
    sv !== 2 &&
    sv !== 3 &&
    sv !== 4 &&
    sv !== 5 &&
    sv !== 6
  ) {
    throw new ApiError(400, `Unsupported backup version: ${String(sv)}`);
  }

  return body;
}

export function assertBackupImportAllowed(
  db: SqliteStore,
  body: BackupImportBody,
  options: ImportBackupOptions,
): void {
  const existingProducts = (db.prepare('SELECT COUNT(*) AS c FROM products').get() as { c: number }).c;
  const incoming = body.products?.length ?? 0;

  if (incoming === 0 && existingProducts > 0 && !options.allowEmptyProducts) {
    throw new ApiError(
      400,
      'Refusing to replace catalog with empty backup. Pass allowEmptyProducts to confirm.',
      'ERR_BACKUP_EMPTY_PRODUCTS',
    );
  }
}

export function applyBackupImport(db: SqliteStore, data: BackupImportBody): void {
  db.runInTransaction(() => {
    db.prepare('DELETE FROM warehouse_movements').run();
    db.prepare('DELETE FROM warehouse_stock').run();
    db.prepare('DELETE FROM warehouse_sections').run();
    db.prepare('DELETE FROM warehouses').run();
    db.prepare('DELETE FROM products').run();
    db.prepare('DELETE FROM transactions').run();
    db.prepare('DELETE FROM customers').run();
    db.prepare('DELETE FROM expenses').run();
    db.prepare('DELETE FROM categories').run();
    db.prepare('DELETE FROM subcategories').run();
    db.prepare('DELETE FROM locations').run();
    db.prepare('DELETE FROM cash_sessions').run();
    db.prepare('DELETE FROM app_settings').run();

    const insertProduct = db.prepare(
      `INSERT INTO products (id, name, sku, category, price, cost, warehouse_cost, stock, image, category_id, subcategory_id, subcategory, status, unit_of_measure, location_id, barcode)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const p of data.products ?? []) {
      const row = p as Record<string, unknown>;
      const productId = String(row.id);
      const image = normalizeProductImageForStore(productId, String(row.image ?? ''));
      insertProduct.run(
        productId,
        row.name,
        row.sku,
        row.category,
        row.price,
        row.cost,
        (row as { warehouseCost?: number }).warehouseCost ?? 0,
        row.stock,
        image,
        row.categoryId ?? '',
        row.subcategoryId ?? '',
        row.subcategory ?? '',
        row.status ?? 'active',
        row.unitOfMeasure ?? 'unidad',
        row.locationId ?? null,
        row.barcode ?? null,
      );
    }

    const insertTx = db.prepare(TX_INSERT_SQL);
    for (const tx of data.transactions ?? []) {
      const row = tx as Record<string, unknown>;
      const receipt = row.receipt as { operatorName?: string } | undefined;
      insertTx.run(
        row.id,
        row.orderNumber,
        row.customer,
        row.amount,
        row.status,
        row.timestamp,
        row.type,
        row.createdAt,
        row.paymentMethod ?? null,
        row.receipt ? JSON.stringify(row.receipt) : null,
        row.sourceSaleId ?? null,
        row.operatorName ?? receipt?.operatorName ?? null,
        row.sourceDeviceId ?? null,
        row.debtStatus ?? null,
        row.collectedAt ?? null,
        row.soldAsDebt ? 1 : 0,
        row.customerId ?? null,
        row.soldAsPayable ? 1 : 0,
        row.payableStatus ?? null,
      );
    }

    const insertExpense = db.prepare(
      'INSERT INTO expenses (id, title, amount, category, date, locked) VALUES (?, ?, ?, ?, ?, ?)',
    );
    for (const e of data.expenses ?? []) {
      const row = e as Record<string, unknown>;
      insertExpense.run(row.id, row.title, row.amount, row.category, row.date, row.locked ? 1 : 0);
    }

    const categories = data.productCategories?.length
      ? (data.productCategories as { id: string; name: string; code?: string }[])
      : [...new Set((data.products ?? []).map((p) => String((p as { category: string }).category).trim()).filter(Boolean))].map(
          (name: string) => ({ id: newId(), name, code: codeFromCategoryName(name) }),
        );
    const insertCat = db.prepare('INSERT INTO categories (id, name, code) VALUES (?, ?, ?)');
    for (const c of categories) {
      const code = c.code ?? codeFromCategoryName(c.name);
      insertCat.run(c.id, c.name, code);
    }

    const insertSub = db.prepare(
      'INSERT INTO subcategories (id, category_id, name, code) VALUES (?, ?, ?, ?)',
    );
    for (const s of data.productSubcategories ?? []) {
      const row = s as { id: string; categoryId: string; name: string; code: string };
      insertSub.run(row.id, row.categoryId, row.name, row.code);
    }
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
      const row = l as { id: string; name: string };
      insertLoc.run(row.id, row.name);
    }

    const insertCustomer = db.prepare(
      `INSERT INTO customers (id, first_name, last_name, address, phone, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const c of data.customers ?? []) {
      const row = c as {
        id: string;
        firstName: string;
        lastName?: string;
        address?: string;
        phone?: string;
        notes?: string;
        createdAt?: number;
      };
      insertCustomer.run(
        row.id,
        row.firstName,
        row.lastName ?? '',
        row.address ?? '',
        row.phone ?? '',
        row.notes ?? '',
        row.createdAt ?? Date.now(),
      );
    }

    const insertSession = db.prepare(
      `INSERT INTO cash_sessions (id, opened_at, closed_at, opening_cash, closing_cash, total_cash_sales, total_card_sales, total_transfer_sales, total_other_sales, total_debt_sales, expected_cash, cash_variance, anomalies_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const s of data.cashSessions ?? []) {
      const row = s as Record<string, unknown>;
      const anomalies = row.anomalies as unknown[] | undefined;
      insertSession.run(
        row.id,
        row.openedAt,
        row.closedAt,
        row.openingCash,
        row.closingCash,
        row.totalCashSales,
        row.totalCardSales,
        row.totalTransferSales,
        row.totalOtherSales,
        row.totalDebtSales ?? 0,
        row.expectedCash ?? null,
        row.cashVariance ?? null,
        anomalies?.length ? JSON.stringify(anomalies) : null,
      );
    }

    const s = { ...DEFAULT_APP_SETTINGS, ...(data.appSettings as object), id: 'main' };
    let storeLogo = '';
    try {
      storeLogo = normalizeStoreLogo((data.appSettings as { storeLogo?: string } | undefined)?.storeLogo ?? '');
    } catch (err) {
      throw new ApiError(400, err instanceof Error ? err.message : 'Invalid store logo in backup');
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

    const insertWarehouse = db.prepare(
      'INSERT INTO warehouses (id, name, is_default, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    );
    for (const w of data.warehouses ?? []) {
      const row = w as {
        id: string;
        name: string;
        isDefault?: boolean;
        createdAt: number;
        updatedAt?: number | null;
      };
      insertWarehouse.run(row.id, row.name, row.isDefault ? 1 : 0, row.createdAt, row.updatedAt ?? null);
    }

    const insertSection = db.prepare(
      'INSERT INTO warehouse_sections (id, warehouse_id, name, is_system, created_at) VALUES (?, ?, ?, ?, ?)',
    );
    for (const sec of data.warehouseSections ?? []) {
      const row = sec as {
        id: string;
        warehouseId: string;
        name: string;
        isSystem?: boolean;
        createdAt: number;
      };
      insertSection.run(row.id, row.warehouseId, row.name, row.isSystem ? 1 : 0, row.createdAt);
    }

    const insertWStock = db.prepare(
      `INSERT INTO warehouse_stock (id, warehouse_id, section_id, product_id, quantity, unit_cost, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const ws of data.warehouseStock ?? []) {
      const row = ws as {
        id: string;
        warehouseId: string;
        sectionId: string;
        productId: string;
        quantity: number;
        unitCost: number;
        updatedAt?: number | null;
      };
      insertWStock.run(
        row.id,
        row.warehouseId,
        row.sectionId,
        row.productId,
        row.quantity,
        row.unitCost,
        row.updatedAt ?? null,
      );
    }

    const insertWMove = db.prepare(
      `INSERT INTO warehouse_movements (id, warehouse_id, product_id, section_id, type, quantity_delta, unit_cost, balance_after, reference_type, reference_id, notes, created_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const m of data.warehouseMovements ?? []) {
      const row = m as {
        id: string;
        warehouseId: string;
        productId: string;
        sectionId: string;
        type: string;
        quantityDelta: number;
        unitCost: number;
        balanceAfter: number;
        referenceType: string | null;
        referenceId: string | null;
        notes: string | null;
        createdAt: number;
        createdBy: string | null;
      };
      insertWMove.run(
        row.id,
        row.warehouseId,
        row.productId,
        row.sectionId,
        row.type,
        row.quantityDelta,
        row.unitCost,
        row.balanceAfter,
        row.referenceType,
        row.referenceId,
        row.notes,
        row.createdAt,
        row.createdBy,
      );
    }

    if (!data.warehouses?.length) {
      migrateWarehouseSchema(db);
    }
  });
}

export function importBackupWithSafety(db: SqliteStore, data: unknown, options: ImportBackupOptions = {}): void {
  const raw = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>;
  const allowEmptyProducts = options.allowEmptyProducts === true || raw.allowEmptyProducts === true;
  const { allowEmptyProducts: _drop, ...payload } = raw;
  const body = validateBackupImportPayload(payload, { allowEmptyProducts });
  assertBackupImportAllowed(db, body, { allowEmptyProducts });
  logStructured('BACKUP_IMPORT_START', {
    incomingProducts: body.products?.length ?? 0,
  });
  createSqliteBackup('pre-import');
  try {
    applyBackupImport(db, body);
    logStructured('BACKUP_IMPORT_SUCCESS', { products: body.products?.length ?? 0 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logStructured('BACKUP_IMPORT_FAILURE', { error: message });
    throw err;
  }
}
