import fs from 'node:fs';
import path from 'node:path';
import type { SqliteStore } from './db.js';
import { getDataDir, newId } from './db.js';
import { ApiError } from './apiError.js';
import { computeWeightedAverageCost } from './inventoryCost.js';
import {
  ensureWarehouseStockRow,
  getDefaultWarehouse,
  receiveProductToWarehouse,
  MIGRATION_SECTION_NAME,
} from './warehouse.js';
import { deviceOperatorDisplayName } from './rbac.js';

export const PURCHASE_STATUSES = ['draft', 'pending_review', 'posted', 'cancelled'] as const;
export type PurchaseStatus = (typeof PURCHASE_STATUSES)[number];

export const PURCHASE_UOM = ['unidad', 'par', 'caja', 'paquete', 'metro', 'kg', 'litro'] as const;
export type PurchaseUnitOfMeasure = (typeof PURCHASE_UOM)[number];

const INTEGER_UOM = new Set<PurchaseUnitOfMeasure>(['unidad', 'par', 'caja', 'paquete']);

export type SupplierRow = {
  id: string;
  name: string;
  address: string;
  phone: string;
  created_at: number;
  updated_at: number;
};

export type PurchaseOrderRow = {
  id: string;
  supplier_id: string | null;
  invoice_number: string | null;
  notes: string;
  purchased_at: number;
  status: string;
  warehouse_posted_at: number | null;
  submitted_for_review_at: number | null;
  created_at: number;
  updated_at: number;
};

export type PurchaseLineRow = {
  id: string;
  purchase_id: string;
  product_id: string | null;
  name: string;
  barcode: string | null;
  unit_cost: number;
  quantity: number;
  unit_of_measure: string;
  warehouse_received_qty: number;
};

export type PurchaseImageRow = {
  id: string;
  purchase_id: string;
  mime_type: string;
  storage_path: string;
  created_at: number;
};

export function rowToSupplier(row: SupplierRow) {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    phone: row.phone,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function rowToPurchaseLine(row: PurchaseLineRow) {
  return {
    id: row.id,
    purchaseId: row.purchase_id,
    productId: row.product_id,
    name: row.name,
    barcode: row.barcode ?? '',
    unitCost: row.unit_cost,
    quantity: row.quantity,
    unitOfMeasure: row.unit_of_measure as PurchaseUnitOfMeasure,
    warehouseReceivedQty: row.warehouse_received_qty,
  };
}

export function rowToPurchaseImage(row: PurchaseImageRow, purchaseId: string) {
  return {
    id: row.id,
    purchaseId,
    mimeType: row.mime_type,
    url: `/api/purchases/${purchaseId}/images/${row.id}`,
    createdAt: row.created_at,
  };
}

export function computePurchaseTotalCost(lines: { unit_cost: number; quantity: number }[]): number {
  const sum = lines.reduce((acc, l) => acc + l.unit_cost * l.quantity, 0);
  return Math.round(sum * 100) / 100;
}

function loadLines(db: SqliteStore, purchaseId: string): PurchaseLineRow[] {
  return db
    .prepare('SELECT * FROM purchase_lines WHERE purchase_id = ? ORDER BY rowid')
    .all(purchaseId) as PurchaseLineRow[];
}

function loadImages(db: SqliteStore, purchaseId: string): PurchaseImageRow[] {
  return db
    .prepare('SELECT * FROM purchase_invoice_images WHERE purchase_id = ? ORDER BY created_at')
    .all(purchaseId) as PurchaseImageRow[];
}

export function rowToPurchaseOrder(
  db: SqliteStore,
  row: PurchaseOrderRow,
  opts?: { supplierName?: string },
) {
  const lines = loadLines(db, row.id);
  const images = loadImages(db, row.id);
  let supplierName = opts?.supplierName ?? '';
  if (!supplierName && row.supplier_id) {
    const sup = db.prepare('SELECT name FROM suppliers WHERE id = ?').get(row.supplier_id) as
      | { name: string }
      | undefined;
    supplierName = sup?.name ?? '';
  }
  return {
    id: row.id,
    purchasedAt: row.purchased_at,
    supplierId: row.supplier_id,
    supplierName,
    invoiceNumber: row.invoice_number ?? '',
    notes: row.notes,
    lines: lines.map(rowToPurchaseLine),
    invoiceImages: images.map((img) => rowToPurchaseImage(img, row.id)),
    status: row.status as PurchaseStatus,
    totalCost: computePurchaseTotalCost(lines),
    warehousePostedAt: row.warehouse_posted_at,
    submittedForReviewAt: row.submitted_for_review_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function assertPurchaseEditable(status: string): void {
  if (status !== 'draft') {
    throw new ApiError(409, 'Purchase is not editable', 'ERR_PURCHASE_NOT_EDITABLE');
  }
}

export function normalizeUnitOfMeasure(raw: string): PurchaseUnitOfMeasure {
  const u = (raw ?? 'unidad').trim().toLowerCase() as PurchaseUnitOfMeasure;
  if (!(PURCHASE_UOM as readonly string[]).includes(u)) {
    throw new ApiError(400, 'Invalid unit of measure', 'ERR_PURCHASE_INVALID_UOM');
  }
  return u;
}

export function warehouseReceiveQuantity(
  quantity: number,
  uom: PurchaseUnitOfMeasure,
): { qty: number; truncated: boolean } {
  if (INTEGER_UOM.has(uom)) {
    const floored = Math.floor(quantity);
    return { qty: floored, truncated: floored !== quantity };
  }
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new ApiError(422, 'Quantity must be positive', 'ERR_PURCHASE_INVALID_QTY');
  }
  return { qty: quantity, truncated: false };
}

function findProductByBarcode(db: SqliteStore, barcode: string): string | null {
  const trimmed = barcode.trim();
  if (!trimmed) return null;
  const row = db
    .prepare(`SELECT id FROM products WHERE barcode = ? AND TRIM(barcode) != '' LIMIT 1`)
    .get(trimmed) as { id: string } | undefined;
  return row?.id ?? null;
}

export type PurchaseLineReviewKind =
  | 'linked_product'
  | 'barcode_match'
  | 'new_product'
  | 'missing_product';

export type PurchaseLineReview = {
  lineId: string;
  lineName: string;
  barcode: string;
  quantity: number;
  unitOfMeasure: PurchaseUnitOfMeasure;
  unitCost: number;
  resolvedProductId: string | null;
  kind: PurchaseLineReviewKind;
  needsReview: boolean;
  reviewReason: 'cost_ponderation' | 'new_product' | 'unlinked' | 'none';
  productName: string | null;
  productSku: string | null;
  currentWarehouseQty: number;
  currentWarehouseUnitCost: number;
  projectedWarehouseUnitCost: number;
  receiveQuantity: number;
  quantityTruncated: boolean;
};

export function buildPurchaseWarehouseReview(db: SqliteStore, purchaseId: string): PurchaseLineReview[] {
  const order = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(purchaseId) as
    | PurchaseOrderRow
    | undefined;
  if (!order) throw new ApiError(404, 'Purchase not found', 'ERR_PURCHASE_NOT_FOUND');
  const warehouse = getDefaultWarehouse(db);
  const lines = loadLines(db, purchaseId);
  const out: PurchaseLineReview[] = [];

  for (const line of lines) {
    const uom = normalizeUnitOfMeasure(line.unit_of_measure);
    const { qty, truncated } = warehouseReceiveQuantity(line.quantity, uom);
    let resolvedProductId = line.product_id;
    let kind: PurchaseLineReviewKind = 'missing_product';

    if (resolvedProductId) {
      const exists = db.prepare('SELECT id FROM products WHERE id = ?').get(resolvedProductId);
      kind = exists ? 'linked_product' : 'missing_product';
      if (!exists) resolvedProductId = null;
    }
    if (!resolvedProductId && line.barcode) {
      const byBarcode = findProductByBarcode(db, line.barcode);
      if (byBarcode) {
        resolvedProductId = byBarcode;
        kind = 'barcode_match';
      }
    }
    if (!resolvedProductId) {
      kind = 'new_product';
    }

    let currentQty = 0;
    let currentCost = 0;
    let productName: string | null = null;
    let productSku: string | null = null;

    if (resolvedProductId) {
      const product = db.prepare('SELECT * FROM products WHERE id = ?').get(resolvedProductId) as
        | { name: string; sku: string }
        | undefined;
      if (product) {
        productName = product.name;
        productSku = product.sku;
      }
      const stock = db
        .prepare('SELECT quantity, unit_cost FROM warehouse_stock WHERE warehouse_id = ? AND product_id = ?')
        .get(warehouse.id, resolvedProductId) as { quantity: number; unit_cost: number } | undefined;
      if (stock) {
        currentQty = stock.quantity;
        currentCost = stock.unit_cost;
      }
    }

    const projected =
      resolvedProductId && qty > 0
        ? computeWeightedAverageCost(currentQty, currentCost, qty, line.unit_cost)
        : line.unit_cost;

    let reviewReason: PurchaseLineReview['reviewReason'] = 'none';
    let needsReview = false;
    if (!resolvedProductId) {
      needsReview = true;
      reviewReason = kind === 'new_product' ? 'new_product' : 'unlinked';
    } else if (currentQty > 0) {
      needsReview = true;
      reviewReason = 'cost_ponderation';
    } else if (kind === 'new_product' || kind === 'barcode_match') {
      needsReview = true;
      reviewReason = kind === 'barcode_match' ? 'cost_ponderation' : 'new_product';
    }

    out.push({
      lineId: line.id,
      lineName: line.name,
      barcode: line.barcode ?? '',
      quantity: line.quantity,
      unitOfMeasure: uom,
      unitCost: line.unit_cost,
      resolvedProductId,
      kind,
      needsReview,
      reviewReason,
      productName,
      productSku,
      currentWarehouseQty: currentQty,
      currentWarehouseUnitCost: currentCost,
      projectedWarehouseUnitCost: projected,
      receiveQuantity: qty,
      quantityTruncated: truncated,
    });
  }

  return out;
}

function defaultCategoryId(db: SqliteStore): string {
  const row = db.prepare('SELECT id FROM categories ORDER BY name LIMIT 1').get() as { id: string } | undefined;
  return row?.id ?? '';
}

function createProductForPurchaseLine(
  db: SqliteStore,
  line: PurchaseLineRow,
  productId?: string,
): string {
  const id = productId ?? newId();
  const name = line.name.trim() || 'Producto';
  const skuBase = line.barcode?.trim() || name.slice(0, 8).replace(/\s+/g, '-').toUpperCase() || 'SKU';
  let sku = skuBase;
  let n = 1;
  while (db.prepare('SELECT id FROM products WHERE sku = ?').get(sku)) {
    sku = `${skuBase}-${n++}`;
  }
  const categoryId = defaultCategoryId(db);
  const categoryRow = categoryId
    ? (db.prepare('SELECT name FROM categories WHERE id = ?').get(categoryId) as { name: string } | undefined)
    : undefined;
  const categoryName = categoryRow?.name ?? 'General';
  const uom = normalizeUnitOfMeasure(line.unit_of_measure);
  const barcode = line.barcode?.trim() || null;
  const warehouse = getDefaultWarehouse(db);
  const migrationSection = db
    .prepare('SELECT id FROM warehouse_sections WHERE warehouse_id = ? AND name = ? COLLATE NOCASE LIMIT 1')
    .get(warehouse.id, MIGRATION_SECTION_NAME) as { id: string } | undefined;

  db.prepare(
    `INSERT INTO products (id, name, sku, category, price, cost, warehouse_cost, stock, image, category_id, subcategory_id, subcategory, status, unit_of_measure, location_id, barcode)
     VALUES (?, ?, ?, ?, 0, 0, 0, 0, '', ?, '', '', 'active', ?, NULL, ?)`,
  ).run(id, name, sku, categoryName, categoryId, uom, barcode);

  if (migrationSection) {
    ensureWarehouseStockRow(db, warehouse.id, migrationSection.id, id, 0);
  }
  return id;
}

export type ReceivePurchaseLineInput = {
  lineId: string;
  action: 'receive' | 'skip';
  productId?: string | null;
  createProduct?: boolean;
  unitCost?: number;
  confirmed?: boolean;
};

export type ReceivePurchaseToWarehouseInput = {
  sectionId?: string | null;
  defaultSalePrice?: number;
  lines: ReceivePurchaseLineInput[];
};

export function submitPurchaseForReview(db: SqliteStore, purchaseId: string): ReturnType<typeof rowToPurchaseOrder> {
  const row = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(purchaseId) as PurchaseOrderRow | undefined;
  if (!row) throw new ApiError(404, 'Purchase not found', 'ERR_PURCHASE_NOT_FOUND');
  if (row.status === 'posted') {
    throw new ApiError(409, 'Purchase already posted', 'ERR_PURCHASE_ALREADY_POSTED');
  }
  if (row.status === 'cancelled') {
    throw new ApiError(409, 'Purchase cancelled', 'ERR_PURCHASE_NOT_EDITABLE');
  }
  const lineCount = db.prepare('SELECT COUNT(*) AS c FROM purchase_lines WHERE purchase_id = ?').get(purchaseId) as {
    c: number;
  };
  if (lineCount.c < 1) throw new ApiError(400, 'Purchase has no lines', 'ERR_PURCHASE_EMPTY');

  const now = Date.now();
  db.prepare(
    `UPDATE purchase_orders SET status = 'pending_review', submitted_for_review_at = ?, updated_at = ? WHERE id = ?`,
  ).run(now, now, purchaseId);
  const updated = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(purchaseId) as PurchaseOrderRow;
  return rowToPurchaseOrder(db, updated);
}

export function receivePurchaseToWarehouse(
  db: SqliteStore,
  purchaseId: string,
  body: ReceivePurchaseToWarehouseInput,
  deviceId: string,
): {
  purchase: ReturnType<typeof rowToPurchaseOrder>;
  receipts: {
    lineId: string;
    productId: string;
    quantityReceived: number;
    unitCost: number;
    movementId: string | null;
    newWarehouseQty: number;
  }[];
  warnings: { code: string; lineId: string; message: string }[];
} {
  const row = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(purchaseId) as PurchaseOrderRow | undefined;
  if (!row) throw new ApiError(404, 'Purchase not found', 'ERR_PURCHASE_NOT_FOUND');
  if (row.status === 'posted') {
    throw new ApiError(409, 'Purchase already posted', 'ERR_PURCHASE_ALREADY_POSTED');
  }
  if (row.status !== 'pending_review') {
    if (row.status === 'draft') {
      throw new ApiError(
        409,
        'Purchase must be submitted for warehouse review first',
        'ERR_PURCHASE_REVIEW_REQUIRED',
      );
    }
    if (row.status === 'cancelled') {
      throw new ApiError(409, 'Purchase cancelled', 'ERR_PURCHASE_NOT_EDITABLE');
    }
    throw new ApiError(409, 'Purchase is not awaiting warehouse review', 'ERR_PURCHASE_NOT_AWAITING_REVIEW');
  }

  const review = buildPurchaseWarehouseReview(db, purchaseId);
  const reviewByLine = new Map(review.map((r) => [r.lineId, r]));
  const lineInputs = body.lines ?? [];
  if (lineInputs.length === 0) {
    throw new ApiError(400, 'Line decisions required', 'ERR_PURCHASE_RECEIVE_LINES_REQUIRED');
  }

  const operator = deviceOperatorDisplayName(db, deviceId);
  const defaultPrice = Number(body.defaultSalePrice ?? 0);
  const warnings: { code: string; lineId: string; message: string }[] = [];
  const receipts: {
    lineId: string;
    productId: string;
    quantityReceived: number;
    unitCost: number;
    movementId: string | null;
    newWarehouseQty: number;
  }[] = [];

  const warehouse = getDefaultWarehouse(db);
  let sectionId = body.sectionId?.trim() || null;
  if (sectionId) {
    const sec = db
      .prepare('SELECT id FROM warehouse_sections WHERE id = ? AND warehouse_id = ?')
      .get(sectionId, warehouse.id);
    if (!sec) throw new ApiError(400, 'Invalid section', 'ERR_WAREHOUSE_SECTION_NOT_FOUND');
  }

  db.runInTransaction(() => {
    for (const input of lineInputs) {
      const rev = reviewByLine.get(input.lineId);
      if (!rev) throw new ApiError(400, 'Unknown line', 'ERR_PURCHASE_LINE_NOT_FOUND');

      if (input.action === 'skip') continue;

      if (rev.needsReview && input.confirmed !== true) {
        throw new ApiError(
          422,
          'Line requires manager confirmation',
          'ERR_PURCHASE_LINE_NOT_CONFIRMED',
        );
      }

      const lineRow = db.prepare('SELECT * FROM purchase_lines WHERE id = ?').get(input.lineId) as
        | PurchaseLineRow
        | undefined;
      if (!lineRow) throw new ApiError(400, 'Unknown line', 'ERR_PURCHASE_LINE_NOT_FOUND');

      let productId = input.productId?.trim() || rev.resolvedProductId;
      if (!productId && input.createProduct === true) {
        productId = createProductForPurchaseLine(db, lineRow);
        db.prepare('UPDATE purchase_lines SET product_id = ? WHERE id = ?').run(productId, lineRow.id);
      }
      if (!productId && rev.kind === 'new_product') {
        productId = createProductForPurchaseLine(db, lineRow);
        db.prepare('UPDATE purchase_lines SET product_id = ? WHERE id = ?').run(productId, lineRow.id);
      }
      if (!productId) {
        throw new ApiError(422, 'Line has no product', 'ERR_PURCHASE_LINE_NO_PRODUCT');
      }

      const unitCost = Number(input.unitCost ?? rev.unitCost);
      if (!Number.isFinite(unitCost) || unitCost <= 0) {
        throw new ApiError(400, 'unitCost must be greater than zero', 'ERR_INVALID_RECEIVE_COST');
      }

      const { qty, truncated } = warehouseReceiveQuantity(rev.quantity, rev.unitOfMeasure);
      if (qty <= 0) {
        throw new ApiError(422, 'Quantity must be a positive integer for this unit', 'ERR_PURCHASE_QTY_MUST_BE_INTEGER');
      }
      if (truncated) {
        warnings.push({
          code: 'ERR_LINE_QTY_TRUNCATED',
          lineId: input.lineId,
          message: `Quantity truncated from ${rev.quantity} to ${qty}`,
        });
      }

      if (sectionId) {
        const stock = db
          .prepare('SELECT id FROM warehouse_stock WHERE warehouse_id = ? AND product_id = ?')
          .get(warehouse.id, productId) as { id: string } | undefined;
        if (stock) {
          db.prepare('UPDATE warehouse_stock SET section_id = ? WHERE id = ?').run(sectionId, stock.id);
        }
      }

      const result = receiveProductToWarehouse(
        db,
        productId,
        qty,
        unitCost,
        defaultPrice,
        operator,
        'purchase',
        purchaseId,
      );

      db.prepare('UPDATE purchase_lines SET warehouse_received_qty = ?, product_id = ? WHERE id = ?').run(
        qty,
        productId,
        lineRow.id,
      );

      receipts.push({
        lineId: input.lineId,
        productId,
        quantityReceived: qty,
        unitCost,
        movementId: null,
        newWarehouseQty: result.newWarehouseQty,
      });
    }

    const now = Date.now();
    db.prepare(
      `UPDATE purchase_orders SET status = 'posted', warehouse_posted_at = ?, updated_at = ? WHERE id = ?`,
    ).run(now, now, purchaseId);
  });

  const updated = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(purchaseId) as PurchaseOrderRow;
  return { purchase: rowToPurchaseOrder(db, updated), receipts, warnings };
}

export function purchaseImageDir(purchaseId: string): string {
  return path.join(getDataDir(), 'purchase-images', purchaseId);
}

export function savePurchaseImage(
  db: SqliteStore,
  purchaseId: string,
  mimeType: string,
  buffer: Buffer,
): ReturnType<typeof rowToPurchaseImage> {
  const order = db.prepare('SELECT id FROM purchase_orders WHERE id = ?').get(purchaseId);
  if (!order) throw new ApiError(404, 'Purchase not found', 'ERR_PURCHASE_NOT_FOUND');
  assertPurchaseEditable(
    (db.prepare('SELECT status FROM purchase_orders WHERE id = ?').get(purchaseId) as { status: string }).status,
  );

  const count = db.prepare('SELECT COUNT(*) AS c FROM purchase_invoice_images WHERE purchase_id = ?').get(purchaseId) as {
    c: number;
  };
  if (count.c >= 20) throw new ApiError(400, 'Too many images', 'ERR_PURCHASE_IMAGE_LIMIT');

  const id = newId();
  const dir = purchaseImageDir(purchaseId);
  fs.mkdirSync(dir, { recursive: true });
  const ext = mimeType.includes('png') ? '.png' : mimeType.includes('webp') ? '.webp' : '.jpg';
  const storagePath = path.join(dir, `${id}${ext}`);
  fs.writeFileSync(storagePath, buffer);

  const now = Date.now();
  db.prepare(
    `INSERT INTO purchase_invoice_images (id, purchase_id, mime_type, storage_path, created_at) VALUES (?, ?, ?, ?, ?)`,
  ).run(id, purchaseId, mimeType, storagePath, now);

  return rowToPurchaseImage(
    { id, purchase_id: purchaseId, mime_type: mimeType, storage_path: storagePath, created_at: now },
    purchaseId,
  );
}

export function deletePurchaseImage(db: SqliteStore, purchaseId: string, imageId: string): void {
  const row = db
    .prepare('SELECT * FROM purchase_invoice_images WHERE id = ? AND purchase_id = ?')
    .get(imageId, purchaseId) as PurchaseImageRow | undefined;
  if (!row) throw new ApiError(404, 'Image not found');
  assertPurchaseEditable(
    (db.prepare('SELECT status FROM purchase_orders WHERE id = ?').get(purchaseId) as { status: string }).status,
  );
  try {
    if (fs.existsSync(row.storage_path)) fs.unlinkSync(row.storage_path);
  } catch {
    /* ignore */
  }
  db.prepare('DELETE FROM purchase_invoice_images WHERE id = ?').run(imageId);
}

export function readPurchaseImage(
  db: SqliteStore,
  purchaseId: string,
  imageId: string,
): { buffer: Buffer; mimeType: string } {
  const row = db
    .prepare('SELECT * FROM purchase_invoice_images WHERE id = ? AND purchase_id = ?')
    .get(imageId, purchaseId) as PurchaseImageRow | undefined;
  if (!row) throw new ApiError(404, 'Image not found');
  if (!fs.existsSync(row.storage_path)) throw new ApiError(404, 'Image file missing');
  return { buffer: fs.readFileSync(row.storage_path), mimeType: row.mime_type };
}
