import type { SqliteStore } from './db.js';
import { newId } from './db.js';
import { computeCostAfterRemovingLayer } from './inventoryCost.js';
import { ApiError } from './apiError.js';
import { INVENTORY_CONSUMPTION_CATEGORY_CODE, getExpenseCategoryByCode } from './expenseCategories.js';
import { getDefaultWarehouse, ensureWarehouseStockRow } from './warehouse.js';

function insertConsumptionMovement(
  db: SqliteStore,
  input: {
    warehouseId: string;
    productId: string;
    sectionId: string | null;
    type: 'EXPENSE_STORE' | 'EXPENSE_WAREHOUSE';
    quantityDelta: number;
    unitCost: number;
    balanceAfter: number | null;
    expenseId: string;
    notes: string | null;
    createdBy: string | null;
  },
): void {
  db.prepare(
    `INSERT INTO warehouse_movements (
      id, warehouse_id, product_id, section_id, type, quantity_delta, unit_cost, balance_after,
      reference_type, reference_id, notes, created_at, created_by, reversed_at, reverses_movement_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'expense', ?, ?, ?, ?, NULL, NULL)`,
  ).run(
    newId(),
    input.warehouseId,
    input.productId,
    input.sectionId,
    input.type,
    input.quantityDelta,
    input.unitCost,
    input.balanceAfter,
    input.expenseId,
    input.notes,
    Date.now(),
    input.createdBy,
  );
}

export function createInventoryConsumptionExpense(
  db: SqliteStore,
  input: {
    productId: string;
    quantity: number;
    source: 'store' | 'warehouse';
    title?: string;
    date?: string;
    createdBy: string | null;
  },
): { expenseId: string; amount: number; movementType: 'EXPENSE_STORE' | 'EXPENSE_WAREHOUSE' } {
  const qty = Math.floor(Number(input.quantity));
  if (!Number.isFinite(qty) || qty <= 0) {
    throw new ApiError(400, 'Invalid quantity', 'ERR_INVALID_CONSUMPTION_QTY');
  }
  const category = getExpenseCategoryByCode(db, INVENTORY_CONSUMPTION_CATEGORY_CODE);
  if (!category) {
    throw new ApiError(500, 'Inventory consumption category not configured');
  }

  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(input.productId) as
    | {
        id: string;
        name: string;
        sku: string;
        stock: number;
        cost: number;
      }
    | undefined;
  if (!product) throw new ApiError(404, 'Product not found');

  const warehouse = getDefaultWarehouse(db);
  const expenseId = newId();
  const date =
    input.date?.trim() ||
    new Date().toISOString().slice(0, 10);
  const title =
    (input.title?.trim() ||
      `${category.name}: ${product.name} (${qty})`).slice(0, 200);

  if (input.source === 'store') {
    if (product.stock < qty) {
      throw new ApiError(409, 'Insufficient store stock', 'ERR_INSUFFICIENT_STOCK');
    }
    const unitCost = product.cost > 0 ? product.cost : 0;
    if (unitCost <= 0) {
      throw new ApiError(409, 'Product has no store cost', 'ERR_PRODUCT_COST_READONLY');
    }
    const amount = Math.round(unitCost * qty * 100) / 100;
    const newStock = product.stock - qty;
    const newCost =
      newStock <= 0
        ? product.cost
        : computeCostAfterRemovingLayer(product.stock, product.cost, qty, unitCost);

    db.prepare('UPDATE products SET stock = ?, cost = ? WHERE id = ?').run(newStock, newCost, product.id);
    db.prepare('INSERT INTO expenses (id, title, amount, category, date) VALUES (?, ?, ?, ?, ?)').run(
      expenseId,
      title,
      amount,
      category.name,
      date,
    );

    const stockRow = db
      .prepare('SELECT * FROM warehouse_stock WHERE warehouse_id = ? AND product_id = ?')
      .get(warehouse.id, product.id) as { section_id: string } | undefined;

    insertConsumptionMovement(db, {
      warehouseId: warehouse.id,
      productId: product.id,
      sectionId: stockRow?.section_id ?? null,
      type: 'EXPENSE_STORE',
      quantityDelta: -qty,
      unitCost,
      balanceAfter: newStock,
      expenseId,
      notes: `store:${qty}`,
      createdBy: input.createdBy,
    });

    return { expenseId, amount, movementType: 'EXPENSE_STORE' };
  }

  const stockRow = db
    .prepare('SELECT * FROM warehouse_stock WHERE warehouse_id = ? AND product_id = ?')
    .get(warehouse.id, product.id) as
    | { id: string; quantity: number; unit_cost: number; section_id: string }
    | undefined;
  if (!stockRow || stockRow.quantity < qty) {
    throw new ApiError(409, 'Insufficient warehouse stock', 'ERR_INSUFFICIENT_WAREHOUSE_STOCK');
  }
  const unitCost = stockRow.unit_cost;
  if (unitCost <= 0) {
    throw new ApiError(409, 'Warehouse unit cost not set', 'ERR_INVALID_RECEIVE_COST');
  }
  const amount = Math.round(unitCost * qty * 100) / 100;
  const newWhQty = stockRow.quantity - qty;
  const newWhCost =
    newWhQty <= 0
      ? stockRow.unit_cost
      : computeCostAfterRemovingLayer(stockRow.quantity, stockRow.unit_cost, qty, unitCost);

  db.prepare('UPDATE warehouse_stock SET quantity = ?, unit_cost = ?, updated_at = ? WHERE id = ?').run(
    newWhQty,
    newWhCost,
    Date.now(),
    stockRow.id,
  );
  db.prepare('UPDATE products SET warehouse_cost = ? WHERE id = ?').run(newWhCost, product.id);

  db.prepare('INSERT INTO expenses (id, title, amount, category, date) VALUES (?, ?, ?, ?, ?)').run(
    expenseId,
    title,
    amount,
    category.name,
    date,
  );

  insertConsumptionMovement(db, {
    warehouseId: warehouse.id,
    productId: product.id,
    sectionId: stockRow.section_id,
    type: 'EXPENSE_WAREHOUSE',
    quantityDelta: -qty,
    unitCost,
    balanceAfter: newWhQty,
    expenseId,
    notes: `warehouse:${qty}`,
    createdBy: input.createdBy,
  });

  return { expenseId, amount, movementType: 'EXPENSE_WAREHOUSE' };
}
