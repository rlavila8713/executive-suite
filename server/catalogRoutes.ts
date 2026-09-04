import type { Request, Response, NextFunction } from 'express';
import { getDb, newId, rowToCategory, type SqliteStore } from './db.js';
import { codeFromCategoryName } from './migrations.js';
import { ApiError } from './routes.js';

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

function rowToSubcategory(row: { id: string; category_id: string; name: string; code: string }) {
  return { id: row.id, categoryId: row.category_id, name: row.name, code: row.code };
}

function rowToLocation(row: { id: string; name: string }) {
  return { id: row.id, name: row.name };
}

function subNameClashes(db: SqliteStore, categoryId: string, name: string, exceptId?: string): boolean {
  const lower = name.trim().toLowerCase();
  const rows = db.prepare('SELECT id, name FROM subcategories WHERE category_id = ?').all(categoryId) as {
    id: string;
    name: string;
  }[];
  return rows.some((r) => r.id !== exceptId && r.name.trim().toLowerCase() === lower);
}

function subCodeClashes(db: SqliteStore, categoryId: string, code: string, exceptId?: string): boolean {
  const upper = code.trim().toUpperCase();
  const rows = db.prepare('SELECT id, code FROM subcategories WHERE category_id = ?').all(categoryId) as {
    id: string;
    code: string;
  }[];
  return rows.some((r) => r.id !== exceptId && r.code.trim().toUpperCase() === upper);
}

export function registerCatalogRoutes(router: import('express').Router): void {
  router.get(
    '/subcategories',
    asyncHandler(async (req, res) => {
      const db = getDb();
      const categoryId = req.query.categoryId as string | undefined;
      const rows = categoryId
        ? db.prepare('SELECT * FROM subcategories WHERE category_id = ? ORDER BY name').all(categoryId)
        : db.prepare('SELECT * FROM subcategories ORDER BY name').all();
      res.json(rows.map((r) => rowToSubcategory(r as Parameters<typeof rowToSubcategory>[0])));
    }),
  );

  router.post(
    '/subcategories',
    asyncHandler(async (req, res) => {
      const { categoryId, name, code } = req.body as { categoryId?: string; name?: string; code?: string };
      const trimmedName = (name ?? '').trim();
      const trimmedCode = (code ?? '').trim().toUpperCase();
      if (!categoryId || !trimmedName || !trimmedCode) throw new ApiError(400, 'categoryId, name and code required');
      const db = getDb();
      if (!db.prepare('SELECT id FROM categories WHERE id = ?').get(categoryId)) {
        throw new ApiError(404, 'Category not found');
      }
      if (subNameClashes(db, categoryId, trimmedName)) {
        throw new ApiError(409, 'Duplicate subcategory', 'ERR_DUPLICATE_SUBCATEGORY');
      }
      if (subCodeClashes(db, categoryId, trimmedCode)) {
        throw new ApiError(409, 'Duplicate subcategory code', 'ERR_DUPLICATE_SUBCATEGORY_CODE');
      }
      const id = newId();
      db.prepare('INSERT INTO subcategories (id, category_id, name, code) VALUES (?, ?, ?, ?)').run(
        id,
        categoryId,
        trimmedName,
        trimmedCode,
      );
      res.status(201).json({ id, categoryId, name: trimmedName, code: trimmedCode });
    }),
  );

  router.patch(
    '/subcategories/:id',
    asyncHandler(async (req, res) => {
      const body = req.body as { name?: string; code?: string };
      const db = getDb();
      const row = db.prepare('SELECT * FROM subcategories WHERE id = ?').get(req.params.id) as
        | { id: string; category_id: string; name: string; code: string }
        | undefined;
      if (!row) throw new ApiError(404, 'Subcategory not found');
      const trimmedName = (body.name ?? row.name).trim();
      const trimmedCode = (body.code ?? row.code).trim().toUpperCase();
      if (subNameClashes(db, row.category_id, trimmedName, row.id)) {
        throw new ApiError(409, 'Duplicate subcategory', 'ERR_DUPLICATE_SUBCATEGORY');
      }
      if (subCodeClashes(db, row.category_id, trimmedCode, row.id)) {
        throw new ApiError(409, 'Duplicate subcategory code', 'ERR_DUPLICATE_SUBCATEGORY_CODE');
      }
      db.prepare('UPDATE subcategories SET name = ?, code = ? WHERE id = ?').run(trimmedName, trimmedCode, row.id);
      res.json({ id: row.id, categoryId: row.category_id, name: trimmedName, code: trimmedCode });
    }),
  );

  router.delete(
    '/subcategories/:id',
    asyncHandler(async (req, res) => {
      const db = getDb();
      const row = db.prepare('SELECT * FROM subcategories WHERE id = ?').get(req.params.id) as
        | { id: string; name: string }
        | undefined;
      if (!row) throw new ApiError(404, 'Subcategory not found');
      const count = db.prepare('SELECT COUNT(*) AS c FROM products WHERE subcategory_id = ?').get(req.params.id) as {
        c: number;
      };
      if (count.c > 0) {
        throw new ApiError(
          409,
          `Subcategory in use by ${count.c} product(s)`,
          `ERR_SUBCATEGORY_IN_USE|${count.c}|${encodeURIComponent(row.name)}`,
        );
      }
      db.prepare('DELETE FROM subcategories WHERE id = ?').run(req.params.id);
      res.status(204).send();
    }),
  );

  router.get(
    '/locations',
    asyncHandler(async (_req, res) => {
      const db = getDb();
      const rows = db.prepare('SELECT * FROM locations ORDER BY name').all();
      res.json(rows.map((r) => rowToLocation(r as Parameters<typeof rowToLocation>[0])));
    }),
  );

  router.post(
    '/locations',
    asyncHandler(async (req, res) => {
      const name = ((req.body as { name?: string }).name ?? '').trim();
      if (!name) throw new ApiError(400, 'Name required');
      const db = getDb();
      const existing = db.prepare('SELECT id FROM locations WHERE LOWER(name) = LOWER(?)').get(name);
      if (existing) throw new ApiError(409, 'Duplicate location', 'ERR_DUPLICATE_LOCATION');
      const id = newId();
      db.prepare('INSERT INTO locations (id, name) VALUES (?, ?)').run(id, name);
      res.status(201).json({ id, name });
    }),
  );

  router.patch(
    '/locations/:id',
    asyncHandler(async (req, res) => {
      const name = ((req.body as { name?: string }).name ?? '').trim();
      if (!name) throw new ApiError(400, 'Name required');
      const db = getDb();
      const row = db.prepare('SELECT * FROM locations WHERE id = ?').get(req.params.id);
      if (!row) throw new ApiError(404, 'Location not found');
      const clash = db
        .prepare('SELECT id FROM locations WHERE LOWER(name) = LOWER(?) AND id != ?')
        .get(name, req.params.id);
      if (clash) throw new ApiError(409, 'Duplicate location', 'ERR_DUPLICATE_LOCATION');
      db.prepare('UPDATE locations SET name = ? WHERE id = ?').run(name, req.params.id);
      res.json({ id: req.params.id, name });
    }),
  );

  router.delete(
    '/locations/:id',
    asyncHandler(async (req, res) => {
      const db = getDb();
      const result = db.prepare('DELETE FROM locations WHERE id = ?').run(req.params.id);
      if (result.changes === 0) throw new ApiError(404, 'Location not found');
      db.prepare('UPDATE products SET location_id = NULL WHERE location_id = ?').run(req.params.id);
      res.status(204).send();
    }),
  );

  router.get(
    '/products/next-sku',
    asyncHandler(async (req, res) => {
      const categoryId = req.query.categoryId as string;
      const subcategoryId = req.query.subcategoryId as string;
      if (!categoryId || !subcategoryId) throw new ApiError(400, 'categoryId and subcategoryId required');
      const db = getDb();
      const cat = db.prepare('SELECT code, name FROM categories WHERE id = ?').get(categoryId) as
        | { code: string; name: string }
        | undefined;
      const sub = db.prepare('SELECT code FROM subcategories WHERE id = ?').get(subcategoryId) as
        | { code: string }
        | undefined;
      if (!cat || !sub) throw new ApiError(404, 'Category or subcategory not found');
      const catCode = (cat.code || codeFromCategoryName(cat.name)).toUpperCase();
      const subCode = sub.code.toUpperCase();
      const prefix = `${catCode}-${subCode}-`;
      const products = db.prepare('SELECT sku FROM products').all() as { sku: string }[];
      let maxSeq = 0;
      for (const p of products) {
        if (!p.sku.startsWith(prefix)) continue;
        const seq = parseInt(p.sku.slice(prefix.length), 10);
        if (!Number.isNaN(seq) && seq > maxSeq) maxSeq = seq;
      }
      const sku = `${prefix}${String(maxSeq + 1).padStart(6, '0')}`;
      res.json({ sku });
    }),
  );
}
