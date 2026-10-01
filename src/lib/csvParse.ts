/** Normalize CSV header to canonical import field key. */
const HEADER_ALIASES: Record<string, string> = {
  nombre: 'name',
  name: 'name',
  producto: 'name',
  product: 'name',
  categoria: 'category',
  categoría: 'category',
  category: 'category',
  subcategoria: 'subcategory',
  subcategoría: 'subcategory',
  subcategory: 'subcategory',
  precio: 'price',
  price: 'price',
  costo: 'cost',
  cost: 'cost',
  stock_almacen: 'warehouseStock',
  'stock almacen': 'warehouseStock',
  'stock almacén': 'warehouseStock',
  cantidad_almacen: 'warehouseStock',
  'cantidad almacen': 'warehouseStock',
  'cantidad almacén': 'warehouseStock',
  warehousestock: 'warehouseStock',
  stock_tienda: 'storeStock',
  'stock tienda': 'storeStock',
  cantidad_tienda: 'storeStock',
  'cantidad tienda': 'storeStock',
  storestock: 'storeStock',
  seccion: 'warehouseSection',
  sección: 'warehouseSection',
  section: 'warehouseSection',
  ubicacion: 'location',
  ubicación: 'location',
  location: 'location',
  sku: 'sku',
  codigo_barras: 'barcode',
  'código de barras': 'barcode',
  barcode: 'barcode',
  barra: 'barcode',
};

function normalizeHeader(h: string): string {
  const key = h.trim().toLowerCase().replace(/^\uFEFF/, '');
  return HEADER_ALIASES[key] ?? key;
}

/** Parse a single CSV line respecting quoted fields. */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

export type ProductImportRow = {
  name: string;
  category: string;
  subcategory: string;
  price: number;
  cost: number;
  warehouseStock: number;
  storeStock: number;
  warehouseSection: string;
  location?: string;
  sku?: string;
  barcode?: string;
};

export type CsvParseResult =
  | { ok: true; rows: ProductImportRow[] }
  | { ok: false; error: string };

function parseOptionalNonNegativeNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return 0;
  const v = parseFloat(trimmed.replace(',', '.'));
  if (!Number.isFinite(v) || v < 0) return null;
  return v;
}

export function parseProductImportCsv(text: string): CsvParseResult {
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n').filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    return { ok: false, error: 'EMPTY_FILE' };
  }

  const headers = parseCsvLine(lines[0]).map(normalizeHeader);
  const required = [
    'name',
    'category',
    'subcategory',
    'cost',
    'warehouseStock',
    'storeStock',
    'warehouseSection',
  ] as const;
  for (const req of required) {
    if (!headers.includes(req)) {
      return { ok: false, error: `MISSING_COLUMN|${req}` };
    }
  }

  const rows: ProductImportRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    if (cells.every((c) => !c.trim())) continue;

    const record: Record<string, string> = {};
    headers.forEach((h, idx) => {
      record[h] = cells[idx] ?? '';
    });

    const name = (record.name ?? '').trim();
    const category = (record.category ?? '').trim();
    const subcategory = (record.subcategory ?? '').trim();
    if (!name && !category && !subcategory) continue;

    const priceRaw = (record.price ?? '').trim();
    const price = priceRaw ? parseFloat(priceRaw.replace(',', '.')) : 0;
    const cost = parseFloat(String(record.cost ?? '').replace(',', '.'));
    const warehouseStock = parseInt(String(record.warehouseStock ?? '').replace(',', '.'), 10);
    const storeStock = parseInt(String(record.storeStock ?? '0').replace(',', '.'), 10);

    if (!name || !category || !subcategory) {
      return { ok: false, error: `ROW_MISSING_REQUIRED|${i + 1}` };
    }
    if (priceRaw && (!Number.isFinite(price) || price < 0)) {
      return { ok: false, error: `ROW_INVALID_PRICE|${i + 1}` };
    }
    if (!Number.isFinite(cost) || cost < 0) {
      return { ok: false, error: `ROW_INVALID_COST|${i + 1}` };
    }
    if (!Number.isFinite(warehouseStock) || warehouseStock < 0) {
      return { ok: false, error: `ROW_INVALID_WAREHOUSE_STOCK|${i + 1}` };
    }
    if (!Number.isFinite(storeStock) || storeStock < 0) {
      return { ok: false, error: `ROW_INVALID_STORE_STOCK|${i + 1}` };
    }

    const warehouseSection = (record.warehouseSection ?? '').trim();
    const location = (record.location ?? '').trim();
    const sku = (record.sku ?? '').trim();
    const barcode = (record.barcode ?? '').trim();

    rows.push({
      name,
      category,
      subcategory,
      price: Number.isFinite(price) ? price : 0,
      cost,
      warehouseStock,
      storeStock,
      warehouseSection,
      ...(location ? { location } : {}),
      ...(sku ? { sku } : {}),
      ...(barcode ? { barcode } : {}),
    });
  }

  if (rows.length === 0) {
    return { ok: false, error: 'NO_DATA_ROWS' };
  }

  return { ok: true, rows };
}

export const PRODUCT_IMPORT_TEMPLATE_HEADERS = [
  'nombre',
  'categoria',
  'subcategoria',
  'precio',
  'costo',
  'stock_almacen',
  'stock_tienda',
  'seccion',
  'ubicacion',
  'sku',
  'codigo_barras',
] as const;

export const PRODUCT_IMPORT_TEMPLATE_SAMPLE: (string | number)[][] = [
  ['Sartén 24cm', 'Cocina', 'Sartenes', 25, 15, 100, 0, 'Cocina', 'Pasillo A', '', ''],
  ['Foco halógeno', 'Iluminación', 'Focos', 0, 4, 50, 0, 'Migración inicial', '', '', ''],
];
