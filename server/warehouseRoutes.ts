import type { Request, Response, NextFunction } from 'express';
import { getDb, newId, rowToProduct } from './db.js';
import { ApiError } from './routes.js';
import { getDeviceOperatorName } from './connectedDevices.js';
import {
  getDefaultWarehouse,
  reassignWarehouseSection,
  requireWebClientForWarehouse,
  rowToWarehouse,
  rowToWarehouseMovement,
  rowToWarehouseSection,
  rowToWarehouseStock,
  transferWarehouseToStore,
} from './warehouse.js';

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

function sectionNameClashes(db: ReturnType<typeof getDb>, warehouseId: string, name: string, exceptId?: string): boolean {
  const lower = name.trim().toLowerCase();
  const rows = db
    .prepare('SELECT id, name FROM warehouse_sections WHERE warehouse_id = ?')
    .all(warehouseId) as { id: string; name: string }[];
  return rows.some((r) => r.id !== exceptId && r.name.trim().toLowerCase() === lower);
}

export function registerWarehouseRoutes(router: import('express').Router): void {
  router.get(
    '/warehouse',
    asyncHandler(async (_req, res) => {
      const db = getDb();
      const rows = db.prepare('SELECT * FROM warehouses ORDER BY is_default DESC, name').all();
      res.json(rows.map((r) => rowToWarehouse(r as Parameters<typeof rowToWarehouse>[0])));
    }),
  );

  router.post(
    '/warehouse',
    asyncHandler(async (req, res) => {
      requireWebClientForWarehouse(req);
      const name = ((req.body as { name?: string }).name ?? '').trim();
      if (!name) throw new ApiError(400, 'Name required');
      const db = getDb();
      const count = db.prepare('SELECT COUNT(*) AS c FROM warehouses').get() as { c: number };
      if (count.c >= 1) {
        throw new ApiError(409, 'Only one warehouse is allowed in this version', 'ERR_WAREHOUSE_LIMIT');
      }
      const id = newId();
      const now = Date.now();
      db.prepare(
        'INSERT INTO warehouses (id, name, is_default, created_at, updated_at) VALUES (?, ?, 1, ?, ?)',
      ).run(id, name, now, now);
      res.status(201).json(rowToWarehouse({ id, name, is_default: 1, created_at: now, updated_at: now }));
    }),
  );

  router.patch(
    '/warehouse/:id',
    asyncHandler(async (req, res) => {
      requireWebClientForWarehouse(req);
      const name = ((req.body as { name?: string }).name ?? '').trim();
      if (!name) throw new ApiError(400, 'Name required');
      const db = getDb();
      const row = db.prepare('SELECT * FROM warehouses WHERE id = ?').get(req.params.id);
      if (!row) throw new ApiError(404, 'Warehouse not found');
      db.prepare('UPDATE warehouses SET name = ?, updated_at = ? WHERE id = ?').run(name, Date.now(), req.params.id);
      const updated = db.prepare('SELECT * FROM warehouses WHERE id = ?').get(req.params.id);
      res.json(rowToWarehouse(updated as Parameters<typeof rowToWarehouse>[0]));
    }),
  );

  router.delete(
    '/warehouse/:id',
    asyncHandler(async (req, res) => {
      requireWebClientForWarehouse(req);
      const db = getDb();
      const row = db.prepare('SELECT * FROM warehouses WHERE id = ?').get(req.params.id);
      if (!row) throw new ApiError(404, 'Warehouse not found');
      const stock = db
        .prepare('SELECT COALESCE(SUM(quantity), 0) AS q FROM warehouse_stock WHERE warehouse_id = ?')
        .get(req.params.id) as { q: number };
      if (stock.q > 0) {
        throw new ApiError(409, 'Warehouse has stock on hand', 'ERR_WAREHOUSE_HAS_STOCK');
      }
      const movements = db
        .prepare('SELECT COUNT(*) AS c FROM warehouse_movements WHERE warehouse_id = ?')
        .get(req.params.id) as { c: number };
      if (movements.c > 0) {
        throw new ApiError(409, 'Warehouse has movement history', 'ERR_WAREHOUSE_HAS_MOVEMENTS');
      }
      db.prepare('DELETE FROM warehouse_sections WHERE warehouse_id = ?').run(req.params.id);
      db.prepare('DELETE FROM warehouses WHERE id = ?').run(req.params.id);
      res.status(204).send();
    }),
  );

  router.get(
    '/warehouse/sections',
    asyncHandler(async (_req, res) => {
      const db = getDb();
      const warehouse = getDefaultWarehouse(db);
      const rows = db
        .prepare('SELECT * FROM warehouse_sections WHERE warehouse_id = ? ORDER BY name')
        .all(warehouse.id);
      res.json(rows.map((r) => rowToWarehouseSection(r as Parameters<typeof rowToWarehouseSection>[0])));
    }),
  );

  router.post(
    '/warehouse/sections',
    asyncHandler(async (req, res) => {
      requireWebClientForWarehouse(req);
      const { name } = req.body as { name?: string };
      const trimmed = (name ?? '').trim();
      if (!trimmed) throw new ApiError(400, 'Name required');
      const db = getDb();
      const warehouse = getDefaultWarehouse(db);
      if (sectionNameClashes(db, warehouse.id, trimmed)) {
        throw new ApiError(409, 'Duplicate section name', 'ERR_DUPLICATE_WAREHOUSE_SECTION');
      }
      const id = newId();
      const now = Date.now();
      db.prepare(
        'INSERT INTO warehouse_sections (id, warehouse_id, name, is_system, created_at) VALUES (?, ?, ?, 0, ?)',
      ).run(id, warehouse.id, trimmed, now);
      res.status(201).json(
        rowToWarehouseSection({
          id,
          warehouse_id: warehouse.id,
          name: trimmed,
          is_system: 0,
          created_at: now,
        }),
      );
    }),
  );

  router.patch(
    '/warehouse/sections/:id',
    asyncHandler(async (req, res) => {
      requireWebClientForWarehouse(req);
      const trimmed = ((req.body as { name?: string }).name ?? '').trim();
      if (!trimmed) throw new ApiError(400, 'Name required');
      const db = getDb();
      const row = db.prepare('SELECT * FROM warehouse_sections WHERE id = ?').get(req.params.id) as
        | { id: string; warehouse_id: string; name: string; is_system: number; created_at: number }
        | undefined;
      if (!row) throw new ApiError(404, 'Section not found');
      if (sectionNameClashes(db, row.warehouse_id, trimmed, row.id)) {
        throw new ApiError(409, 'Duplicate section name', 'ERR_DUPLICATE_WAREHOUSE_SECTION');
      }
      db.prepare('UPDATE warehouse_sections SET name = ? WHERE id = ?').run(trimmed, row.id);
      res.json(
        rowToWarehouseSection({
          ...row,
          name: trimmed,
        }),
      );
    }),
  );

  router.delete(
    '/warehouse/sections/:id',
    asyncHandler(async (req, res) => {
      requireWebClientForWarehouse(req);
      const db = getDb();
      const row = db.prepare('SELECT * FROM warehouse_sections WHERE id = ?').get(req.params.id) as
        | { id: string; name: string }
        | undefined;
      if (!row) throw new ApiError(404, 'Section not found');
      const count = db.prepare('SELECT COUNT(*) AS c FROM warehouse_stock WHERE section_id = ? AND quantity > 0').get(
        req.params.id,
      ) as { c: number };
      if (count.c > 0) {
        throw new ApiError(
          409,
          `Section has products with stock`,
          `ERR_WAREHOUSE_SECTION_IN_USE|${count.c}|${encodeURIComponent(row.name)}`,
        );
      }
      const warehouse = getDefaultWarehouse(db);
      const fallback = db
        .prepare(
          'SELECT id FROM warehouse_sections WHERE warehouse_id = ? AND id != ? ORDER BY is_system DESC, name LIMIT 1',
        )
        .get(warehouse.id, req.params.id) as { id: string } | undefined;
      if (!fallback) {
        throw new ApiError(409, 'Cannot delete the only section', 'ERR_WAREHOUSE_SECTION_LAST');
      }
      db.prepare('UPDATE warehouse_stock SET section_id = ? WHERE section_id = ? AND quantity = 0').run(
        fallback.id,
        req.params.id,
      );
      db.prepare('DELETE FROM warehouse_sections WHERE id = ?').run(req.params.id);
      res.status(204).send();
    }),
  );

  router.get(
    '/warehouse/stock',
    asyncHandler(async (req, res) => {
      const db = getDb();
      const warehouse = getDefaultWarehouse(db);
      const sectionId = req.query.sectionId as string | undefined;
      const sql = sectionId
        ? `SELECT ws.*, p.name AS product_name, p.sku AS product_sku, s.name AS section_name
           FROM warehouse_stock ws
           JOIN products p ON p.id = ws.product_id
           JOIN warehouse_sections s ON s.id = ws.section_id
           WHERE ws.warehouse_id = ? AND ws.section_id = ?
           ORDER BY p.name`
        : `SELECT ws.*, p.name AS product_name, p.sku AS product_sku, s.name AS section_name
           FROM warehouse_stock ws
           JOIN products p ON p.id = ws.product_id
           JOIN warehouse_sections s ON s.id = ws.section_id
           WHERE ws.warehouse_id = ?
           ORDER BY p.name`;
      const rows = sectionId
        ? db.prepare(sql).all(warehouse.id, sectionId)
        : db.prepare(sql).all(warehouse.id);
      res.json(
        rows.map((r) =>
          rowToWarehouseStock(r as Parameters<typeof rowToWarehouseStock>[0], {
            productName: (r as { product_name: string }).product_name,
            productSku: (r as { product_sku: string }).product_sku,
            sectionName: (r as { section_name: string }).section_name,
          }),
        ),
      );
    }),
  );

  router.patch(
    '/warehouse/stock/:productId/section',
    asyncHandler(async (req, res) => {
      requireWebClientForWarehouse(req);
      const sectionId = (req.body as { sectionId?: string }).sectionId;
      if (!sectionId) throw new ApiError(400, 'sectionId required');
      const db = getDb();
      const deviceId = req.header('X-Device-Id')?.trim() ?? '';
      const operator = getDeviceOperatorName(db, deviceId);
      const stock = reassignWarehouseSection(db, req.params.productId, sectionId, operator || null);
      res.json(stock);
    }),
  );

  router.post(
    '/warehouse/stock/:productId/transfer-to-store',
    asyncHandler(async (req, res) => {
      requireWebClientForWarehouse(req);
      const body = req.body as { quantity?: number; price?: number };
      const quantity = Math.floor(Number(body.quantity));
      const price = Number(body.price);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        throw new ApiError(400, 'quantity must be a positive integer', 'ERR_INVALID_TRANSFER_QTY');
      }
      if (!Number.isFinite(price) || price <= 0) {
        throw new ApiError(400, 'price must be a positive number', 'ERR_INVALID_TRANSFER_PRICE');
      }
      const db = getDb();
      const deviceId = req.header('X-Device-Id')?.trim() ?? '';
      const operator = getDeviceOperatorName(db, deviceId);
      const result = transferWarehouseToStore(db, req.params.productId, quantity, price, operator || null);
      res.json({
        product: rowToProduct(result.product as Parameters<typeof rowToProduct>[0]),
        warehouseStock: result.warehouseStock,
      });
    }),
  );

  router.get(
    '/warehouse/movements',
    asyncHandler(async (req, res) => {
      const db = getDb();
      const warehouse = getDefaultWarehouse(db);
      const productId = req.query.productId as string | undefined;
      const limit = Math.min(500, Math.max(1, parseInt(String(req.query.limit ?? '100'), 10) || 100));
      const rows = productId
        ? db
            .prepare(
              `SELECT * FROM warehouse_movements WHERE warehouse_id = ? AND product_id = ?
               ORDER BY created_at DESC LIMIT ?`,
            )
            .all(warehouse.id, productId, limit)
        : db
            .prepare(
              `SELECT * FROM warehouse_movements WHERE warehouse_id = ? ORDER BY created_at DESC LIMIT ?`,
            )
            .all(warehouse.id, limit);
      res.json(rows.map((r) => rowToWarehouseMovement(r as Parameters<typeof rowToWarehouseMovement>[0])));
    }),
  );

  router.get(
    '/warehouse/reports/summary',
    asyncHandler(async (_req, res) => {
      const db = getDb();
      const warehouse = getDefaultWarehouse(db);
      const overall = db
        .prepare(
          `SELECT COUNT(*) AS productCount,
                  COALESCE(SUM(quantity), 0) AS units,
                  COALESCE(SUM(quantity * unit_cost), 0) AS valueAtCost
           FROM warehouse_stock WHERE warehouse_id = ?`,
        )
        .get(warehouse.id) as { productCount: number; units: number; valueAtCost: number };

      const bySection = db
        .prepare(
          `SELECT s.id AS sectionId, s.name AS sectionName,
                  COUNT(ws.id) AS productCount,
                  COALESCE(SUM(ws.quantity), 0) AS units,
                  COALESCE(SUM(ws.quantity * ws.unit_cost), 0) AS valueAtCost
           FROM warehouse_sections s
           LEFT JOIN warehouse_stock ws ON ws.section_id = s.id
           WHERE s.warehouse_id = ?
           GROUP BY s.id
           ORDER BY s.name`,
        )
        .all(warehouse.id);

      res.json({
        warehouseId: warehouse.id,
        overall: {
          productCount: overall.productCount,
          units: overall.units,
          valueAtCost: Math.round(overall.valueAtCost * 100) / 100,
        },
        bySection: bySection.map((r) => ({
          sectionId: (r as { sectionId: string }).sectionId,
          sectionName: (r as { sectionName: string }).sectionName,
          productCount: (r as { productCount: number }).productCount,
          units: (r as { units: number }).units,
          valueAtCost: Math.round((r as { valueAtCost: number }).valueAtCost * 100) / 100,
        })),
      });
    }),
  );
}
