import type { Request } from 'express';
import type { SqliteStore } from './db.js';
import { newId, rowToCashSession, rowToCustomer, rowToProduct, rowToTransaction } from './db.js';
import { ApiError } from './apiError.js';
import { inferClientKind } from './connectedDevices.js';
import { assertDevicePermission, getOperatorBindingForRequest, resolveEffectiveAccess } from './auth.js';
import { resolveCashSessionForSale } from './cashSessionRules.js';
import { normalizeMixedSaleReceipt, SaleCheckoutValidationError } from './salesCheckout.js';
import type { SaleReceiptInput } from './salesCheckout.js';

export const TX_INSERT_SQL = `INSERT INTO transactions (id, order_number, customer, amount, status, timestamp, type, created_at, payment_method, receipt_json, source_sale_id, operator_name, source_device_id, debt_status, collected_at, sold_as_debt, customer_id, sold_as_payable, payable_status, operator_id, client_sale_id, client_created_at, offline_origin)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

export function migrateMobileOfflineSchema(db: SqliteStore): void {
  const cols = db.prepare('PRAGMA table_info(transactions)').all() as { name: string }[];
  const names = new Set(cols.map((c) => c.name));
  if (!names.has('client_sale_id')) {
    db.exec(`ALTER TABLE transactions ADD COLUMN client_sale_id TEXT`);
  }
  if (!names.has('client_created_at')) {
    db.exec(`ALTER TABLE transactions ADD COLUMN client_created_at INTEGER`);
  }
  if (!names.has('offline_origin')) {
    db.exec(`ALTER TABLE transactions ADD COLUMN offline_origin INTEGER NOT NULL DEFAULT 0`);
  }
  db.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_client_sale_id ON transactions(client_sale_id) WHERE client_sale_id IS NOT NULL`,
  );
}

export type MobileSaleReceiptLine = {
  productId?: string;
  sku: string;
  quantity: number;
  name?: string;
};

export type MobileSaleInput = {
  clientSaleId?: string;
  clientCreatedAt?: number;
  cashSessionId?: string;
  syncOffline?: boolean;
  customerName?: string;
  customerId?: string;
  amount?: number;
  isDebt?: boolean;
  isPartialDebt?: boolean;
  operatorId?: string;
  operatorName?: string;
  receipt?: {
    lines: MobileSaleReceiptLine[];
    paymentMethod?: string;
    total?: number;
    subtotal?: number;
    payments?: { method: string; amount: number }[];
    [key: string]: unknown;
  };
};

export type MobileSaleResult = {
  status: 'created' | 'duplicate';
  transaction: ReturnType<typeof rowToTransaction>;
};

export type MobileSaleSyncItemResult = {
  clientSaleId: string;
  status: 'created' | 'duplicate' | 'rejected';
  transactionId?: string;
  code?: string;
  error?: string;
};

function tableHasColumn(db: SqliteStore, table: string, column: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return cols.some((c) => c.name === column);
}

function findTransactionByClientSaleId(db: SqliteStore, clientSaleId: string) {
  if (!tableHasColumn(db, 'transactions', 'client_sale_id')) return undefined;
  return db.prepare('SELECT * FROM transactions WHERE client_sale_id = ?').get(clientSaleId) as
    | Record<string, unknown>
    | undefined;
}

function resolveOperators(
  db: SqliteStore,
  deviceId: string,
  req: Request,
  input: MobileSaleInput,
  syncOffline: boolean,
): { operatorId: string | null; operatorName: string } {
  const binding = deviceId ? getOperatorBindingForRequest(db, deviceId, req) : { operatorId: null, operatorName: '' };
  if (binding.operatorName) return binding;

  if (syncOffline && input.operatorId?.trim()) {
    const op = db
      .prepare(
        `SELECT o.id, o.display_name, o.active, u.active AS user_active
         FROM operators o JOIN users u ON u.id = o.user_id WHERE o.id = ?`,
      )
      .get(input.operatorId.trim()) as
      | { id: string; display_name: string; active: number; user_active: number }
      | undefined;
    if (!op || !op.active || !op.user_active) {
      throw new ApiError(400, 'Invalid or inactive operator on offline sale', 'ERR_INVALID_OPERATOR');
    }
    const name = (input.operatorName ?? op.display_name).trim();
    return { operatorId: op.id, operatorName: name || op.display_name.trim() };
  }

  return binding;
}

export function processMobileSale(
  db: SqliteStore,
  req: Request,
  input: MobileSaleInput,
): MobileSaleResult {
  migrateMobileOfflineSchema(db);

  if (!input.receipt?.lines?.length) {
    throw new ApiError(400, 'Receipt lines required');
  }

  const clientSaleId = input.clientSaleId?.trim() || null;
  if (clientSaleId) {
    const existing = findTransactionByClientSaleId(db, clientSaleId);
    if (existing) {
      return {
        status: 'duplicate',
        transaction: rowToTransaction(existing as Parameters<typeof rowToTransaction>[0]),
      };
    }
  }

  const syncOffline = input.syncOffline === true;
  const clientCreatedAt =
    typeof input.clientCreatedAt === 'number' && Number.isFinite(input.clientCreatedAt)
      ? Math.floor(input.clientCreatedAt)
      : Date.now();
  const saleNow = syncOffline ? clientCreatedAt : Date.now();

  resolveCashSessionForSale(db, {
    now: saleNow,
    cashSessionId: input.cashSessionId,
    allowClosedSession: syncOffline,
  });

  const deviceId = req.header('X-Device-Id')?.trim() ?? '';
  const clientKind = inferClientKind(req.header('User-Agent') ?? '', req.header('X-Client-Kind') ?? undefined);
  if (clientKind === 'mobile') {
    assertDevicePermission(db, deviceId, 'sales.checkout', clientKind, req);
  }

  const { operatorId, operatorName } = resolveOperators(db, deviceId, req, input, syncOffline);
  if (clientKind === 'mobile' && !operatorName) {
    throw new ApiError(409, 'Assign an operator to this device before selling', 'ERR_OPERATOR_REQUIRED');
  }

  let customerId: string | null = null;
  if (input.customerId?.trim()) {
    const c = db.prepare('SELECT id FROM customers WHERE id = ?').get(input.customerId.trim()) as
      | { id: string }
      | undefined;
    if (c) customerId = c.id;
  }

  const settingsRow = db.prepare('SELECT tax_rate FROM app_settings WHERE id = ?').get('main') as
    | { tax_rate: number }
    | undefined;
  const taxRate = settingsRow?.tax_rate ?? 0;

  const isDebtFull = input.isDebt === true && input.isPartialDebt !== true;
  let checkout;
  try {
    checkout = normalizeMixedSaleReceipt(input.receipt as SaleReceiptInput, taxRate, {
      isDebt: isDebtFull,
      isPartialDebt: input.isPartialDebt === true,
      clientKind: clientKind === 'mobile' ? 'mobile' : 'web',
    });
  } catch (e) {
    if (e instanceof SaleCheckoutValidationError) {
      throw new ApiError(e.status, e.message, e.code);
    }
    throw e;
  }

  const soldAsDebt = checkout.soldAsDebt || isDebtFull;
  const customerTrim = (input.customerName ?? '').trim();
  if (soldAsDebt && !customerTrim) {
    throw new ApiError(400, 'Customer name is required for debt sales', 'ERR_DEBT_CUSTOMER_REQUIRED');
  }

  const amount = input.amount && input.amount > 0 ? input.amount : (checkout.receipt.total ?? 0);
  const paymentMethod = soldAsDebt && !checkout.receipt.payments?.length
    ? ('debt' as const)
    : (checkout.paymentMethod as 'cash' | 'card' | 'transfer' | 'other' | 'mixed' | 'debt');

  const receipt = {
    ...checkout.receipt,
    ...(operatorName ? { operatorName } : {}),
    ...(syncOffline ? { offlineOrigin: true, clientCreatedAt: saleNow } : {}),
  };

  const transactionId = newId();
  const newTransaction = {
    id: transactionId,
    orderNumber: `#${Math.floor(Math.random() * 90000) + 10000}`,
    customer: customerTrim || 'Walk-in Customer',
    amount,
    status: 'completed' as const,
    timestamp: 'Just now',
    type: 'sale' as const,
    createdAt: saleNow,
    receipt,
    paymentMethod,
    operatorName: operatorName || undefined,
    operatorId: operatorId ?? undefined,
    sourceDeviceId: deviceId || undefined,
    soldAsDebt,
    debtStatus: soldAsDebt ? ('pending' as const) : undefined,
    customerId: customerId ?? undefined,
    clientSaleId: clientSaleId ?? undefined,
    clientCreatedAt: clientSaleId ? saleNow : undefined,
    offlineOrigin: syncOffline,
  };

  db.runInTransaction(() => {
    for (const line of input.receipt!.lines) {
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
      operatorId,
      clientSaleId,
      clientSaleId ? saleNow : null,
      syncOffline ? 1 : 0,
    );

    for (const line of input.receipt!.lines) {
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

  const row = db.prepare('SELECT * FROM transactions WHERE id = ?').get(transactionId) as Parameters<
    typeof rowToTransaction
  >[0];

  return {
    status: 'created',
    transaction: rowToTransaction(row),
  };
}

export function syncMobileSalesBatch(
  db: SqliteStore,
  req: Request,
  sales: MobileSaleInput[],
): MobileSaleSyncItemResult[] {
  if (!Array.isArray(sales) || sales.length === 0) {
    throw new ApiError(400, 'sales array required', 'ERR_SYNC_SALES_EMPTY');
  }
  if (sales.length > 100) {
    throw new ApiError(400, 'At most 100 sales per sync batch', 'ERR_SYNC_SALES_BATCH_TOO_LARGE');
  }

  const results: MobileSaleSyncItemResult[] = [];
  for (const item of sales) {
    const clientSaleId = item.clientSaleId?.trim();
    if (!clientSaleId) {
      results.push({
        clientSaleId: '',
        status: 'rejected',
        code: 'ERR_CLIENT_SALE_ID_REQUIRED',
        error: 'clientSaleId is required for offline sync',
      });
      continue;
    }
    try {
      const outcome = processMobileSale(db, req, { ...item, clientSaleId, syncOffline: true });
      results.push({
        clientSaleId,
        status: outcome.status,
        transactionId: outcome.transaction.id,
      });
    } catch (e) {
      const code = e instanceof ApiError ? e.code : 'ERR_SYNC_SALE_FAILED';
      const error = e instanceof ApiError ? e.message : 'Sale sync failed';
      results.push({ clientSaleId, status: 'rejected', code, error });
    }
  }
  return results;
}

export type OfflinePack = {
  generatedAt: number;
  catalogRevision: string;
  cashSession: ReturnType<typeof rowToCashSession> | null;
  access: ReturnType<typeof resolveEffectiveAccess>;
  settings: { storeName: string; taxRate: number; currency: string };
  products: ReturnType<typeof rowToProduct>[];
  customers: ReturnType<typeof rowToCustomer>[];
};

export function buildMobileOfflinePack(db: SqliteStore, deviceId: string, req: Request): OfflinePack {
  migrateMobileOfflineSchema(db);

  const productRows = db.prepare('SELECT * FROM products ORDER BY id').all();
  const products = productRows.map((r) =>
    rowToProduct(r as Parameters<typeof rowToProduct>[0], { includeImageData: false }),
  );

  const customerRows = db.prepare('SELECT * FROM customers ORDER BY first_name COLLATE NOCASE, last_name COLLATE NOCASE').all();
  const customers = customerRows.map((r) => rowToCustomer(r as Parameters<typeof rowToCustomer>[0]));

  const settingsRow = db.prepare('SELECT store_name, tax_rate, currency FROM app_settings WHERE id = ?').get('main') as
    | { store_name: string; tax_rate: number; currency: string }
    | undefined;

  const openSession = db
    .prepare('SELECT * FROM cash_sessions WHERE closed_at IS NULL ORDER BY opened_at DESC LIMIT 1')
    .get() as Parameters<typeof rowToCashSession>[0] | undefined;

  const cashSession = openSession ? rowToCashSession(openSession) : null;

  const countRow = db.prepare('SELECT COUNT(*) AS c FROM products').get() as { c: number };
  const catalogRevision = String(countRow.c);

  return {
    generatedAt: Date.now(),
    catalogRevision,
    cashSession,
    access: resolveEffectiveAccess(db, deviceId, req),
    settings: {
      storeName: settingsRow?.store_name ?? '',
      taxRate: settingsRow?.tax_rate ?? 0,
      currency: settingsRow?.currency ?? 'USD',
    },
    products,
    customers,
  };
}
