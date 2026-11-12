import type { Request, Response, NextFunction } from 'express';
import { getDb, newId } from './db.js';
import { ApiError } from './apiError.js';
import { assertDevicePermission } from './auth.js';
import { inferClientKind } from './connectedDevices.js';
import {
  assertPurchaseEditable,
  deletePurchaseImage,
  normalizeUnitOfMeasure,
  PURCHASE_STATUSES,
  readPurchaseImage,
  receivePurchaseToWarehouse,
  rowToPurchaseOrder,
  rowToSupplier,
  savePurchaseImage,
  submitPurchaseForReview,
  buildPurchaseWarehouseReview,
  type PurchaseOrderRow,
  type ReceivePurchaseLineInput,
} from './purchases.js';
import { migratePurchasesSchema } from './purchaseMigrations.js';

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

function deviceContext(req: Request) {
  const deviceId = req.header('X-Device-Id')?.trim() ?? '';
  const clientKind = inferClientKind(req.header('User-Agent') ?? '', req.header('X-Client-Kind') ?? undefined);
  return { deviceId, clientKind };
}

function assertCatalogEdit(db: ReturnType<typeof getDb>, req: Request): void {
  const { deviceId, clientKind } = deviceContext(req);
  assertDevicePermission(db, deviceId, 'catalog.edit', clientKind, req);
}

function assertWarehouseReceive(db: ReturnType<typeof getDb>, req: Request): void {
  const { deviceId, clientKind } = deviceContext(req);
  assertDevicePermission(db, deviceId, 'warehouse.receive', clientKind, req);
}

type LineWire = {
  id?: string;
  productId?: string | null;
  name?: string;
  barcode?: string;
  unitCost?: number;
  quantity?: number;
  unitOfMeasure?: string;
};

function parsePurchaseBody(body: Record<string, unknown>, existingId?: string) {
  const id = (typeof body.id === 'string' && body.id.trim()) || existingId || newId();
  const purchasedAt = Number(body.purchasedAt ?? Date.now());
  if (!Number.isFinite(purchasedAt) || purchasedAt <= 0) {
    throw new ApiError(400, 'Invalid purchasedAt');
  }
  const supplierId =
    body.supplierId != null && String(body.supplierId).trim() !== '' ? String(body.supplierId).trim() : null;
  const invoiceNumber =
    body.invoiceNumber != null ? String(body.invoiceNumber).trim() : '';
  const notes = body.notes != null ? String(body.notes) : '';
  const linesRaw = body.lines;
  if (!Array.isArray(linesRaw) || linesRaw.length < 1) {
    throw new ApiError(400, 'Purchase has no lines', 'ERR_PURCHASE_EMPTY');
  }
  const lines: {
    id: string;
    productId: string | null;
    name: string;
    barcode: string;
    unitCost: number;
    quantity: number;
    unitOfMeasure: string;
  }[] = [];

  for (const raw of linesRaw as LineWire[]) {
    const name = String(raw.name ?? '').trim();
    if (!name) throw new ApiError(400, 'Line name required');
    const unitCost = Number(raw.unitCost);
    const quantity = Number(raw.quantity);
    if (!Number.isFinite(unitCost) || unitCost < 0) throw new ApiError(400, 'Invalid unit cost');
    if (!Number.isFinite(quantity) || quantity <= 0) throw new ApiError(400, 'Invalid quantity');
    const uom = normalizeUnitOfMeasure(String(raw.unitOfMeasure ?? 'unidad'));
    const productId =
      raw.productId != null && String(raw.productId).trim() !== '' ? String(raw.productId).trim() : null;
    lines.push({
      id: (raw.id && String(raw.id).trim()) || newId(),
      productId,
      name,
      barcode: raw.barcode != null ? String(raw.barcode).trim() : '',
      unitCost,
      quantity,
      unitOfMeasure: uom,
    });
  }

  return { id, purchasedAt, supplierId, invoiceNumber, notes, lines };
}

function upsertPurchaseOrder(
  db: ReturnType<typeof getDb>,
  parsed: ReturnType<typeof parsePurchaseBody>,
  replaceLines: boolean,
): ReturnType<typeof rowToPurchaseOrder> {
  const now = Date.now();
  if (parsed.supplierId) {
    const sup = db.prepare('SELECT id FROM suppliers WHERE id = ?').get(parsed.supplierId);
    if (!sup) throw new ApiError(400, 'Supplier not found');
  }

  const existing = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(parsed.id) as
    | PurchaseOrderRow
    | undefined;

  if (existing) {
    assertPurchaseEditable(existing.status);
    db.prepare(
      `UPDATE purchase_orders SET supplier_id = ?, invoice_number = ?, notes = ?, purchased_at = ?, updated_at = ? WHERE id = ?`,
    ).run(parsed.supplierId, parsed.invoiceNumber || null, parsed.notes, parsed.purchasedAt, now, parsed.id);
  } else {
    db.prepare(
      `INSERT INTO purchase_orders (id, supplier_id, invoice_number, notes, purchased_at, status, warehouse_posted_at, submitted_for_review_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'draft', NULL, NULL, ?, ?)`,
    ).run(
      parsed.id,
      parsed.supplierId,
      parsed.invoiceNumber || null,
      parsed.notes,
      parsed.purchasedAt,
      now,
      now,
    );
  }

  if (replaceLines) {
    const prevIds = db
      .prepare('SELECT id FROM purchase_lines WHERE purchase_id = ?')
      .all(parsed.id) as { id: string }[];
    const nextIds = new Set(parsed.lines.map((l) => l.id));
    for (const row of prevIds) {
      if (!nextIds.has(row.id)) {
        db.prepare('DELETE FROM purchase_lines WHERE id = ?').run(row.id);
      }
    }
  }

  for (const line of parsed.lines) {
    const existingLine = db.prepare('SELECT id FROM purchase_lines WHERE id = ?').get(line.id);
    if (existingLine) {
      db.prepare(
        `UPDATE purchase_lines SET product_id = ?, name = ?, barcode = ?, unit_cost = ?, quantity = ?, unit_of_measure = ? WHERE id = ?`,
      ).run(
        line.productId,
        line.name,
        line.barcode || null,
        line.unitCost,
        line.quantity,
        line.unitOfMeasure,
        line.id,
      );
    } else {
      db.prepare(
        `INSERT INTO purchase_lines (id, purchase_id, product_id, name, barcode, unit_cost, quantity, unit_of_measure, warehouse_received_qty)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      ).run(
        line.id,
        parsed.id,
        line.productId,
        line.name,
        line.barcode || null,
        line.unitCost,
        line.quantity,
        line.unitOfMeasure,
      );
    }
  }

  const row = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(parsed.id) as PurchaseOrderRow;
  return rowToPurchaseOrder(db, row);
}

export function registerPurchaseRoutes(router: import('express').Router): void {
  router.use((req, _res, next) => {
    migratePurchasesSchema(getDb());
    next();
  });

  // --- Suppliers ---
  router.get(
    '/suppliers',
    asyncHandler(async (req, res) => {
      const db = getDb();
      assertCatalogEdit(db, req);
      const rows = db.prepare('SELECT * FROM suppliers ORDER BY name').all() as Parameters<typeof rowToSupplier>[0][];
      res.json(rows.map(rowToSupplier));
    }),
  );

  router.post(
    '/suppliers',
    asyncHandler(async (req, res) => {
      const db = getDb();
      assertCatalogEdit(db, req);
      const body = req.body as { id?: string; name?: string; address?: string; phone?: string };
      const name = String(body.name ?? '').trim();
      if (!name) throw new ApiError(400, 'Name required');
      const id = (body.id && String(body.id).trim()) || newId();
      const now = Date.now();
      const address = body.address != null ? String(body.address) : '';
      const phone = body.phone != null ? String(body.phone) : '';
      db.prepare(
        `INSERT INTO suppliers (id, name, address, phone, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(id, name, address, phone, now, now);
      const row = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(id) as Parameters<typeof rowToSupplier>[0];
      res.status(201).json(rowToSupplier(row));
    }),
  );

  router.patch(
    '/suppliers/:id',
    asyncHandler(async (req, res) => {
      const db = getDb();
      assertCatalogEdit(db, req);
      const existing = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(req.params.id);
      if (!existing) throw new ApiError(404, 'Supplier not found');
      const body = req.body as { name?: string; address?: string; phone?: string };
      const fields: string[] = [];
      const vals: unknown[] = [];
      if (body.name !== undefined) {
        const name = String(body.name).trim();
        if (!name) throw new ApiError(400, 'Name required');
        fields.push('name = ?');
        vals.push(name);
      }
      if (body.address !== undefined) {
        fields.push('address = ?');
        vals.push(String(body.address));
      }
      if (body.phone !== undefined) {
        fields.push('phone = ?');
        vals.push(String(body.phone));
      }
      if (fields.length === 0) throw new ApiError(400, 'No fields to update');
      fields.push('updated_at = ?');
      vals.push(Date.now());
      vals.push(req.params.id);
      db.prepare(`UPDATE suppliers SET ${fields.join(', ')} WHERE id = ?`).run(...vals);
      const row = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(req.params.id) as Parameters<
        typeof rowToSupplier
      >[0];
      res.json(rowToSupplier(row));
    }),
  );

  router.delete(
    '/suppliers/:id',
    asyncHandler(async (req, res) => {
      const db = getDb();
      assertCatalogEdit(db, req);
      const used = db
        .prepare('SELECT COUNT(*) AS c FROM purchase_orders WHERE supplier_id = ?')
        .get(req.params.id) as { c: number };
      if (used.c > 0) {
        throw new ApiError(409, 'Supplier has purchases', 'ERR_SUPPLIER_HAS_PURCHASES');
      }
      const result = db.prepare('DELETE FROM suppliers WHERE id = ?').run(req.params.id);
      if (result.changes === 0) throw new ApiError(404, 'Supplier not found');
      res.status(204).send();
    }),
  );

  // --- Purchases ---
  router.get(
    '/purchases',
    asyncHandler(async (req, res) => {
      const db = getDb();
      assertCatalogEdit(db, req);
      const from = req.query.from != null ? Number(req.query.from) : null;
      const to = req.query.to != null ? Number(req.query.to) : null;
      const supplierId = req.query.supplierId != null ? String(req.query.supplierId) : null;
      const status = req.query.status != null ? String(req.query.status) : null;
      const q = req.query.q != null ? String(req.query.q).trim().toLowerCase() : '';

      let sql = 'SELECT * FROM purchase_orders WHERE 1=1';
      const vals: unknown[] = [];
      if (from != null && Number.isFinite(from)) {
        sql += ' AND purchased_at >= ?';
        vals.push(from);
      }
      if (to != null && Number.isFinite(to)) {
        sql += ' AND purchased_at <= ?';
        vals.push(to);
      }
      if (supplierId) {
        sql += ' AND supplier_id = ?';
        vals.push(supplierId);
      }
      if (status && (PURCHASE_STATUSES as readonly string[]).includes(status)) {
        sql += ' AND status = ?';
        vals.push(status);
      }
      sql += ' ORDER BY purchased_at DESC';

      const rows = db.prepare(sql).all(...vals) as PurchaseOrderRow[];
      let orders = rows.map((r) => rowToPurchaseOrder(db, r));

      if (q) {
        orders = orders.filter((o) => {
          if (o.invoiceNumber.toLowerCase().includes(q)) return true;
          return o.lines.some(
            (l) =>
              l.name.toLowerCase().includes(q) ||
              l.barcode.toLowerCase().includes(q),
          );
        });
      }

      res.json(orders);
    }),
  );

  router.get(
    '/purchases/:id',
    asyncHandler(async (req, res) => {
      const db = getDb();
      assertCatalogEdit(db, req);
      const row = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(req.params.id) as
        | PurchaseOrderRow
        | undefined;
      if (!row) throw new ApiError(404, 'Purchase not found', 'ERR_PURCHASE_NOT_FOUND');
      res.json(rowToPurchaseOrder(db, row));
    }),
  );

  router.post(
    '/purchases',
    asyncHandler(async (req, res) => {
      const db = getDb();
      assertCatalogEdit(db, req);
      const parsed = parsePurchaseBody(req.body as Record<string, unknown>);
      const existing = db.prepare('SELECT id FROM purchase_orders WHERE id = ?').get(parsed.id);
      if (existing) throw new ApiError(409, 'Purchase id already exists');
      const order = upsertPurchaseOrder(db, parsed, true);
      res.status(201).json(order);
    }),
  );

  router.put(
    '/purchases/:id',
    asyncHandler(async (req, res) => {
      const db = getDb();
      assertCatalogEdit(db, req);
      const parsed = parsePurchaseBody(req.body as Record<string, unknown>, req.params.id);
      if (parsed.id !== req.params.id) throw new ApiError(400, 'id mismatch');
      const existing = db.prepare('SELECT id FROM purchase_orders WHERE id = ?').get(parsed.id);
      if (!existing) throw new ApiError(404, 'Purchase not found', 'ERR_PURCHASE_NOT_FOUND');
      const order = upsertPurchaseOrder(db, parsed, true);
      res.json(order);
    }),
  );

  router.delete(
    '/purchases/:id',
    asyncHandler(async (req, res) => {
      const db = getDb();
      assertCatalogEdit(db, req);
      const row = db.prepare('SELECT status FROM purchase_orders WHERE id = ?').get(req.params.id) as
        | { status: string }
        | undefined;
      if (!row) throw new ApiError(404, 'Purchase not found', 'ERR_PURCHASE_NOT_FOUND');
      assertPurchaseEditable(row.status);
      db.prepare('DELETE FROM purchase_orders WHERE id = ?').run(req.params.id);
      res.status(204).send();
    }),
  );

  router.post(
    '/purchases/:id/submit-for-review',
    asyncHandler(async (req, res) => {
      const db = getDb();
      assertCatalogEdit(db, req);
      const order = submitPurchaseForReview(db, req.params.id);
      res.json(order);
    }),
  );

  router.get(
    '/purchases/:id/warehouse-review',
    asyncHandler(async (req, res) => {
      const db = getDb();
      assertWarehouseReceive(db, req);
      const row = db.prepare('SELECT status FROM purchase_orders WHERE id = ?').get(req.params.id) as
        | { status: string }
        | undefined;
      if (!row) throw new ApiError(404, 'Purchase not found', 'ERR_PURCHASE_NOT_FOUND');
      if (row.status === 'posted') {
        throw new ApiError(409, 'Purchase already posted', 'ERR_PURCHASE_ALREADY_POSTED');
      }
      const lines = buildPurchaseWarehouseReview(db, req.params.id);
      const needsReviewCount = lines.filter((l) => l.needsReview).length;
      res.json({ purchaseId: req.params.id, status: row.status, lines, needsReviewCount });
    }),
  );

  router.post(
    '/purchases/:id/receive-to-warehouse',
    asyncHandler(async (req, res) => {
      const db = getDb();
      assertWarehouseReceive(db, req);
      assertCatalogEdit(db, req);
      const { deviceId, clientKind } = deviceContext(req);
      const body = req.body as {
        sectionId?: string | null;
        defaultSalePrice?: number;
        lines?: ReceivePurchaseLineInput[];
      };
      const result = receivePurchaseToWarehouse(db, req.params.id, {
        sectionId: body.sectionId,
        defaultSalePrice: body.defaultSalePrice,
        lines: body.lines ?? [],
      }, deviceId);
      res.json(result);
    }),
  );

  router.post(
    '/purchases/:purchaseId/images',
    asyncHandler(async (req, res) => {
      const db = getDb();
      assertCatalogEdit(db, req);
      const body = req.body as { mimeType?: string; data?: string };
      const mimeType = String(body.mimeType ?? 'image/jpeg');
      const data = body.data;
      if (!data || typeof data !== 'string') throw new ApiError(400, 'Image data required');
      const buffer = Buffer.from(data, 'base64');
      if (buffer.length > 5 * 1024 * 1024) {
        throw new ApiError(400, 'Image too large', 'ERR_PURCHASE_IMAGE_TOO_LARGE');
      }
      const image = savePurchaseImage(db, req.params.purchaseId, mimeType, buffer);
      res.status(201).json(image);
    }),
  );

  router.get(
    '/purchases/:purchaseId/images/:imageId',
    asyncHandler(async (req, res) => {
      const db = getDb();
      assertCatalogEdit(db, req);
      const { buffer, mimeType } = readPurchaseImage(db, req.params.purchaseId, req.params.imageId);
      res.setHeader('Content-Type', mimeType);
      res.send(buffer);
    }),
  );

  router.delete(
    '/purchases/:purchaseId/images/:imageId',
    asyncHandler(async (req, res) => {
      const db = getDb();
      assertCatalogEdit(db, req);
      deletePurchaseImage(db, req.params.purchaseId, req.params.imageId);
      res.status(204).send();
    }),
  );
}
