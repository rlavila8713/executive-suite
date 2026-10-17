import type { SqliteStore } from './db.js';
import { newId } from './db.js';
import { computeCostAfterRemovingLayer, computeWeightedAverageCost } from './inventoryCost.js';
import { ApiError } from './routes.js';

export const DEFAULT_WAREHOUSE_NAME = 'Almacén Principal';
export const MIGRATION_SECTION_NAME = 'Migración inicial';

export const WAREHOUSE_MOVEMENT_TYPES = [
  'ENTRY',
  'TRANSFER_TO_STORE',
  'ADJUSTMENT',
  'SECTION_REASSIGN',
  'REVERSAL',
  'EXPENSE_STORE',
  'EXPENSE_WAREHOUSE',
] as const;

export type WarehouseMovementType = (typeof WAREHOUSE_MOVEMENT_TYPES)[number];

export type WarehouseRow = {
  id: string;
  name: string;
  is_default: number;
  created_at: number;
  updated_at: number | null;
};

export type WarehouseSectionRow = {
  id: string;
  warehouse_id: string;
  name: string;
  is_system: number;
  created_at: number;
};

export type WarehouseStockRow = {
  id: string;
  warehouse_id: string;
  section_id: string;
  product_id: string;
  quantity: number;
  unit_cost: number;
  updated_at: number | null;
};

export type WarehouseMovementRow = {
  id: string;
  warehouse_id: string;
  product_id: string;
  section_id: string | null;
  type: string;
  quantity_delta: number;
  unit_cost: number | null;
  balance_after: number | null;
  reference_type: string | null;
  reference_id: string | null;
  notes: string | null;
  created_at: number;
  created_by: string | null;
  reversed_at: number | null;
  reverses_movement_id: string | null;
};

export function rowToWarehouse(row: WarehouseRow) {
  return {
    id: row.id,
    name: row.name,
    isDefault: row.is_default === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function rowToWarehouseSection(row: WarehouseSectionRow) {
  return {
    id: row.id,
    warehouseId: row.warehouse_id,
    name: row.name,
    isSystem: row.is_system === 1,
    createdAt: row.created_at,
  };
}

export function rowToWarehouseStock(
  row: WarehouseStockRow,
  extras?: { sectionName?: string; productName?: string; productSku?: string },
) {
  return {
    id: row.id,
    warehouseId: row.warehouse_id,
    sectionId: row.section_id,
    sectionName: extras?.sectionName ?? '',
    productId: row.product_id,
    productName: extras?.productName ?? '',
    productSku: extras?.productSku ?? '',
    quantity: row.quantity,
    unitCost: row.unit_cost,
    updatedAt: row.updated_at,
  };
}

export function rowToWarehouseMovement(
  row: WarehouseMovementRow,
  extras?: { productName?: string; productSku?: string },
) {
  return {
    id: row.id,
    warehouseId: row.warehouse_id,
    productId: row.product_id,
    sectionId: row.section_id,
    type: row.type as WarehouseMovementType,
    quantityDelta: row.quantity_delta,
    unitCost: row.unit_cost,
    balanceAfter: row.balance_after,
    referenceType: row.reference_type,
    referenceId: row.reference_id,
    notes: row.notes,
    createdAt: row.created_at,
    createdBy: row.created_by,
    reversedAt: row.reversed_at ?? null,
    reversesMovementId: row.reverses_movement_id ?? null,
    productName: extras?.productName,
    productSku: extras?.productSku,
  };
}

export function reversedQuantityForEntry(db: SqliteStore, entryMovementId: string): number {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(ABS(quantity_delta)), 0) AS q
       FROM warehouse_movements
       WHERE reverses_movement_id = ? AND type = 'REVERSAL'`,
    )
    .get(entryMovementId) as { q: number };
  return row.q;
}

export function enrichMovementReversalState(
  db: SqliteStore,
  movement: ReturnType<typeof rowToWarehouseMovement>,
): ReturnType<typeof rowToWarehouseMovement> & {
  reversedQuantity?: number;
  reversibleQuantity?: number;
} {
  if (movement.type !== 'ENTRY' || movement.quantityDelta <= 0) {
    return movement;
  }
  const reversedQty = reversedQuantityForEntry(db, movement.id);
  const entryQty = movement.quantityDelta;
  const reversibleQty = Math.max(0, entryQty - reversedQty);
  return {
    ...movement,
    reversedQuantity: reversedQty,
    reversibleQuantity: reversibleQty,
  };
}

export type WarehouseMovementListFilters = {
  warehouseId: string;
  productId?: string;
  types?: WarehouseMovementType[];
  from?: number;
  to?: number;
  limit: number;
};

export function listWarehouseMovements(
  db: SqliteStore,
  filters: WarehouseMovementListFilters,
): ReturnType<typeof rowToWarehouseMovement>[] {
  let sql = `
    SELECT m.*, p.name AS product_name, p.sku AS product_sku
    FROM warehouse_movements m
    JOIN products p ON p.id = m.product_id
    WHERE m.warehouse_id = ?`;
  const params: (string | number)[] = [filters.warehouseId];

  if (filters.productId) {
    sql += ' AND m.product_id = ?';
    params.push(filters.productId);
  }
  if (filters.types && filters.types.length > 0) {
    sql += ` AND m.type IN (${filters.types.map(() => '?').join(', ')})`;
    params.push(...filters.types);
  }
  if (filters.from != null) {
    sql += ' AND m.created_at >= ?';
    params.push(filters.from);
  }
  if (filters.to != null) {
    sql += ' AND m.created_at <= ?';
    params.push(filters.to);
  }
  sql += ' ORDER BY m.created_at DESC LIMIT ?';
  params.push(filters.limit);

  const rows = db.prepare(sql).all(...params) as (WarehouseMovementRow & {
    product_name: string;
    product_sku: string;
  })[];
  const mapped = rows.map((r) =>
    rowToWarehouseMovement(r, { productName: r.product_name, productSku: r.product_sku }),
  );
  const reversalTotals = db
    .prepare(
      `SELECT reverses_movement_id AS id, COALESCE(SUM(ABS(quantity_delta)), 0) AS q
       FROM warehouse_movements
       WHERE type = 'REVERSAL' AND reverses_movement_id IS NOT NULL
       GROUP BY reverses_movement_id`,
    )
    .all() as { id: string; q: number }[];
  const reversedByEntry = new Map(reversalTotals.map((r) => [r.id, r.q]));
  return mapped.map((m) => {
    if (m.type !== 'ENTRY' || m.quantityDelta <= 0) return m;
    const reversedQty = reversedByEntry.get(m.id) ?? 0;
    const reversibleQty = Math.max(0, m.quantityDelta - reversedQty);
    return { ...m, reversedQuantity: reversedQty, reversibleQuantity: reversibleQty };
  });
}

export function parseMovementTypesParam(raw: string | undefined): WarehouseMovementType[] | undefined {
  if (!raw?.trim()) return undefined;
  const parts = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const valid = parts.filter((p): p is WarehouseMovementType =>
    (WAREHOUSE_MOVEMENT_TYPES as readonly string[]).includes(p),
  );
  return valid.length > 0 ? valid : undefined;
}

export function parseMovementTimeParam(raw: string | undefined): number | undefined {
  if (!raw?.trim()) return undefined;
  if (/^\d+$/.test(raw.trim())) {
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  }
  const d = new Date(`${raw.trim()}T12:00:00`);
  const t = d.getTime();
  return Number.isFinite(t) ? t : undefined;
}

export function getDefaultWarehouse(db: SqliteStore): WarehouseRow {
  const row = db
    .prepare('SELECT * FROM warehouses WHERE is_default = 1 LIMIT 1')
    .get() as WarehouseRow | undefined;
  if (!row) {
    throw new ApiError(500, 'Default warehouse not configured', 'ERR_WAREHOUSE_NOT_CONFIGURED');
  }
  return row;
}

export function ensureWarehouseStockRow(
  db: SqliteStore,
  warehouseId: string,
  sectionId: string,
  productId: string,
  unitCost: number,
): WarehouseStockRow {
  const existing = db
    .prepare('SELECT * FROM warehouse_stock WHERE warehouse_id = ? AND product_id = ?')
    .get(warehouseId, productId) as WarehouseStockRow | undefined;
  if (existing) return existing;

  const id = newId();
  const now = Date.now();
  db.prepare(
    `INSERT INTO warehouse_stock (id, warehouse_id, section_id, product_id, quantity, unit_cost, updated_at)
     VALUES (?, ?, ?, ?, 0, ?, ?)`,
  ).run(id, warehouseId, sectionId, productId, unitCost, now);
  return db.prepare('SELECT * FROM warehouse_stock WHERE id = ?').get(id) as WarehouseStockRow;
}

function insertMovement(
  db: SqliteStore,
  input: {
    warehouseId: string;
    productId: string;
    sectionId: string | null;
    type: WarehouseMovementType;
    quantityDelta: number;
    unitCost: number | null;
    balanceAfter: number | null;
    referenceType?: string | null;
    referenceId?: string | null;
    notes?: string | null;
    createdBy?: string | null;
    reversesMovementId?: string | null;
  },
): string {
  const id = newId();
  db.prepare(
    `INSERT INTO warehouse_movements (
      id, warehouse_id, product_id, section_id, type, quantity_delta, unit_cost, balance_after,
      reference_type, reference_id, notes, created_at, created_by, reversed_at, reverses_movement_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
  ).run(
    id,
    input.warehouseId,
    input.productId,
    input.sectionId,
    input.type,
    input.quantityDelta,
    input.unitCost,
    input.balanceAfter,
    input.referenceType ?? null,
    input.referenceId ?? null,
    input.notes ?? null,
    Date.now(),
    input.createdBy ?? null,
    input.reversesMovementId ?? null,
  );
  return id;
}

function existingWarehouseUnitCost(db: SqliteStore, warehouseId: string, productId: string): number | null {
  const row = db
    .prepare('SELECT unit_cost FROM warehouse_stock WHERE warehouse_id = ? AND product_id = ?')
    .get(warehouseId, productId) as { unit_cost: number } | undefined;
  return row ? row.unit_cost : null;
}

export function receiveProductToWarehouse(
  db: SqliteStore,
  productId: string,
  quantity: number,
  unitCost: number,
  price: number,
  createdBy: string | null,
  referenceType?: string,
  referenceId?: string,
): {
  product: Record<string, unknown>;
  warehouseStock: ReturnType<typeof rowToWarehouseStock>;
  previousWarehouseQty: number;
  newWarehouseQty: number;
} {
  const warehouse = getDefaultWarehouse(db);
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId) as
    | Record<string, unknown>
    | undefined;
  if (!product) throw new ApiError(404, 'Product not found');
  if (!Number.isFinite(unitCost) || unitCost <= 0) {
    throw new ApiError(400, 'unitCost must be greater than zero', 'ERR_INVALID_RECEIVE_COST');
  }

  const section = db
    .prepare('SELECT * FROM warehouse_sections WHERE warehouse_id = ? ORDER BY is_system DESC, name LIMIT 1')
    .get(warehouse.id) as WarehouseSectionRow | undefined;
  if (!section) throw new ApiError(500, 'No warehouse sections', 'ERR_WAREHOUSE_NO_SECTIONS');

  const productWhCost = Number((product as { warehouse_cost?: number }).warehouse_cost ?? 0);
  const stockRow = ensureWarehouseStockRow(
    db,
    warehouse.id,
    section.id,
    productId,
    existingWarehouseUnitCost(db, warehouse.id, productId) ?? productWhCost,
  );

  const previousQty = stockRow.quantity;
  const previousUnitCost = stockRow.unit_cost;
  const newQty = previousQty + quantity;
  const newUnitCost = computeWeightedAverageCost(previousQty, previousUnitCost, quantity, unitCost);
  const now = Date.now();

  db.prepare(
    'UPDATE warehouse_stock SET quantity = ?, unit_cost = ?, section_id = ?, updated_at = ? WHERE id = ?',
  ).run(newQty, newUnitCost, stockRow.section_id, now, stockRow.id);

  if (price > 0) {
    db.prepare('UPDATE products SET warehouse_cost = ?, price = ? WHERE id = ?').run(newUnitCost, price, productId);
  } else {
    db.prepare('UPDATE products SET warehouse_cost = ? WHERE id = ?').run(newUnitCost, productId);
  }

  insertMovement(db, {
    warehouseId: warehouse.id,
    productId,
    sectionId: stockRow.section_id,
    type: 'ENTRY',
    quantityDelta: quantity,
    unitCost,
    balanceAfter: newQty,
    referenceType: referenceType ?? 'receive',
    referenceId: referenceId ?? null,
    createdBy,
  });

  const updatedProduct = db.prepare('SELECT * FROM products WHERE id = ?').get(productId)!;
  const updatedStock = db.prepare('SELECT * FROM warehouse_stock WHERE id = ?').get(stockRow.id) as WarehouseStockRow;

  return {
    product: updatedProduct,
    warehouseStock: rowToWarehouseStock(updatedStock),
    previousWarehouseQty: previousQty,
    newWarehouseQty: newQty,
  };
}

export function transferWarehouseToStore(
  db: SqliteStore,
  productId: string,
  quantity: number,
  salePrice: number,
  createdBy: string | null,
): {
  product: Record<string, unknown>;
  warehouseStock: ReturnType<typeof rowToWarehouseStock>;
} {
  const warehouse = getDefaultWarehouse(db);
  const stockRow = db
    .prepare('SELECT * FROM warehouse_stock WHERE warehouse_id = ? AND product_id = ?')
    .get(warehouse.id, productId) as WarehouseStockRow | undefined;
  if (!stockRow || stockRow.quantity < quantity) {
    throw new ApiError(409, 'Insufficient warehouse stock', 'ERR_INSUFFICIENT_WAREHOUSE_STOCK');
  }

  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId) as Record<string, unknown>;
  if (!product) throw new ApiError(404, 'Product not found');

  const newWarehouseQty = stockRow.quantity - quantity;
  const storeStock = Number(product.stock);
  const storeCost = Number(product.cost);
  const newStoreStock = storeStock + quantity;
  const newStoreCost = computeWeightedAverageCost(storeStock, storeCost, quantity, stockRow.unit_cost);
  const now = Date.now();

  db.prepare('UPDATE warehouse_stock SET quantity = ?, updated_at = ? WHERE id = ?').run(
    newWarehouseQty,
    now,
    stockRow.id,
  );
  db.prepare('UPDATE products SET stock = ?, cost = ?, price = ? WHERE id = ?').run(
    newStoreStock,
    newStoreCost,
    salePrice,
    productId,
  );

  insertMovement(db, {
    warehouseId: warehouse.id,
    productId,
    sectionId: stockRow.section_id,
    type: 'TRANSFER_TO_STORE',
    quantityDelta: -quantity,
    unitCost: stockRow.unit_cost,
    balanceAfter: newWarehouseQty,
    referenceType: 'transfer',
    referenceId: null,
    createdBy,
  });

  const updatedProduct = db.prepare('SELECT * FROM products WHERE id = ?').get(productId)!;
  const updatedStock = db.prepare('SELECT * FROM warehouse_stock WHERE id = ?').get(stockRow.id) as WarehouseStockRow;
  return { product: updatedProduct, warehouseStock: rowToWarehouseStock(updatedStock) };
}

export function reassignWarehouseSection(
  db: SqliteStore,
  productId: string,
  sectionId: string,
  createdBy: string | null,
): ReturnType<typeof rowToWarehouseStock> {
  const warehouse = getDefaultWarehouse(db);
  const section = db.prepare('SELECT * FROM warehouse_sections WHERE id = ? AND warehouse_id = ?').get(
    sectionId,
    warehouse.id,
  ) as WarehouseSectionRow | undefined;
  if (!section) throw new ApiError(404, 'Section not found');

  const stockRow = db
    .prepare('SELECT * FROM warehouse_stock WHERE warehouse_id = ? AND product_id = ?')
    .get(warehouse.id, productId) as WarehouseStockRow | undefined;
  if (!stockRow) throw new ApiError(404, 'Product not in warehouse', 'ERR_WAREHOUSE_STOCK_NOT_FOUND');
  if (stockRow.section_id === sectionId) {
    return rowToWarehouseStock(stockRow);
  }

  const fromSectionId = stockRow.section_id;
  db.prepare('UPDATE warehouse_stock SET section_id = ?, updated_at = ? WHERE id = ?').run(
    sectionId,
    Date.now(),
    stockRow.id,
  );

  insertMovement(db, {
    warehouseId: warehouse.id,
    productId,
    sectionId: sectionId,
    type: 'SECTION_REASSIGN',
    quantityDelta: 0,
    unitCost: stockRow.unit_cost,
    balanceAfter: stockRow.quantity,
    referenceType: 'section',
    referenceId: fromSectionId,
    notes: `from:${fromSectionId}`,
    createdBy,
  });

  const updated = db.prepare('SELECT * FROM warehouse_stock WHERE id = ?').get(stockRow.id) as WarehouseStockRow;
  return rowToWarehouseStock(updated);
}

export function addWarehouseStockQuantity(
  db: SqliteStore,
  productId: string,
  sectionId: string,
  quantity: number,
  unitCost: number,
  createdBy: string | null,
  referenceType: string,
  referenceId: string | null,
): void {
  const warehouse = getDefaultWarehouse(db);
  const product = db.prepare('SELECT warehouse_cost FROM products WHERE id = ?').get(productId) as
    | { warehouse_cost: number }
    | undefined;
  if (!product) throw new ApiError(404, 'Product not found');

  const section = db
    .prepare('SELECT id FROM warehouse_sections WHERE id = ? AND warehouse_id = ?')
    .get(sectionId, warehouse.id);
  if (!section) throw new ApiError(404, 'Section not found');

  const stockRow = ensureWarehouseStockRow(
    db,
    warehouse.id,
    sectionId,
    productId,
    existingWarehouseUnitCost(db, warehouse.id, productId) ?? product.warehouse_cost ?? 0,
  );
  const previousQty = stockRow.quantity;
  const newQty = previousQty + quantity;
  const newUnitCost = computeWeightedAverageCost(previousQty, stockRow.unit_cost, quantity, unitCost);
  const now = Date.now();

  db.prepare(
    'UPDATE warehouse_stock SET quantity = ?, unit_cost = ?, section_id = ?, updated_at = ? WHERE id = ?',
  ).run(newQty, newUnitCost, sectionId, now, stockRow.id);
  db.prepare('UPDATE products SET warehouse_cost = ? WHERE id = ?').run(newUnitCost, productId);

  insertMovement(db, {
    warehouseId: warehouse.id,
    productId,
    sectionId,
    type: 'ENTRY',
    quantityDelta: quantity,
    unitCost,
    balanceAfter: newQty,
    referenceType,
    referenceId,
    createdBy,
  });
}

export function reverseWarehouseEntry(
  db: SqliteStore,
  entryMovementId: string,
  quantity: number,
  reason: string,
  createdBy: string | null,
): ReturnType<typeof rowToWarehouseMovement> {
  const trimmedReason = reason.trim();
  if (trimmedReason.length < 3) {
    throw new ApiError(400, 'Reversal reason required', 'ERR_WAREHOUSE_REVERSAL_REASON');
  }
  const entryRow = db.prepare('SELECT * FROM warehouse_movements WHERE id = ?').get(entryMovementId) as
    | WarehouseMovementRow
    | undefined;
  if (!entryRow) throw new ApiError(404, 'Movement not found');
  if (entryRow.type !== 'ENTRY' || entryRow.quantity_delta <= 0) {
    throw new ApiError(409, 'Only warehouse entries can be reversed', 'ERR_WAREHOUSE_REVERSAL_NOT_ENTRY');
  }
  if (entryRow.reversed_at != null) {
    throw new ApiError(409, 'Entry already fully reversed', 'ERR_WAREHOUSE_ENTRY_ALREADY_REVERSED');
  }

  const alreadyReversed = reversedQuantityForEntry(db, entryMovementId);
  const reversible = entryRow.quantity_delta - alreadyReversed;
  if (reversible <= 0) {
    throw new ApiError(409, 'Entry already fully reversed', 'ERR_WAREHOUSE_ENTRY_ALREADY_REVERSED');
  }
  let qty = quantity;
  if (!Number.isFinite(qty) || qty <= 0) {
    qty = reversible;
  }
  if (!Number.isInteger(qty) || qty <= 0) {
    throw new ApiError(400, 'Invalid reversal quantity', 'ERR_WAREHOUSE_REVERSAL_QTY');
  }
  if (qty > reversible) {
    throw new ApiError(
      409,
      `Cannot reverse more than ${reversible} units`,
      `ERR_WAREHOUSE_REVERSAL_EXCEEDS|${reversible}`,
    );
  }

  const warehouse = getDefaultWarehouse(db);
  if (entryRow.warehouse_id !== warehouse.id) {
    throw new ApiError(404, 'Movement not found');
  }

  const stockRow = db
    .prepare('SELECT * FROM warehouse_stock WHERE warehouse_id = ? AND product_id = ?')
    .get(warehouse.id, entryRow.product_id) as WarehouseStockRow | undefined;
  if (!stockRow || stockRow.quantity < qty) {
    throw new ApiError(409, 'Insufficient warehouse stock to reverse', 'ERR_INSUFFICIENT_WAREHOUSE_STOCK');
  }

  const layerCost = entryRow.unit_cost ?? stockRow.unit_cost;
  const previousQty = stockRow.quantity;
  const previousUnitCost = stockRow.unit_cost;
  const newQty = previousQty - qty;
  const newUnitCost =
    newQty <= 0
      ? previousUnitCost
      : computeCostAfterRemovingLayer(previousQty, previousUnitCost, qty, layerCost);
  const now = Date.now();

  db.prepare(
    'UPDATE warehouse_stock SET quantity = ?, unit_cost = ?, updated_at = ? WHERE id = ?',
  ).run(newQty, newUnitCost, now, stockRow.id);
  db.prepare('UPDATE products SET warehouse_cost = ? WHERE id = ?').run(newUnitCost, entryRow.product_id);

  const reversalId = insertMovement(db, {
    warehouseId: warehouse.id,
    productId: entryRow.product_id,
    sectionId: stockRow.section_id,
    type: 'REVERSAL',
    quantityDelta: -qty,
    unitCost: layerCost,
    balanceAfter: newQty,
    referenceType: 'reversal',
    referenceId: entryMovementId,
    notes: trimmedReason,
    createdBy,
    reversesMovementId: entryMovementId,
  });

  const totalReversed = alreadyReversed + qty;
  if (totalReversed >= entryRow.quantity_delta) {
    db.prepare('UPDATE warehouse_movements SET reversed_at = ? WHERE id = ?').run(now, entryMovementId);
  }

  const reversalRow = db.prepare('SELECT * FROM warehouse_movements WHERE id = ?').get(reversalId) as WarehouseMovementRow;
  return rowToWarehouseMovement(reversalRow);
}

export function requireWebClientForWarehouse(req: import('express').Request): void {
  const kind = req.header('X-Client-Kind')?.trim().toLowerCase();
  if (kind !== 'web') {
    throw new ApiError(403, 'Warehouse movements are only available from the web app', 'ERR_WAREHOUSE_WEB_ONLY');
  }
}
