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
  stock: 'stock',
  cantidad: 'stock',
  ubicacion: 'location',
  ubicación: 'location',
  location: 'location',
  sku: 'sku',
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
  stock: number;
  location?: string;
  sku?: string;
};

export type CsvParseResult =
  | { ok: true; rows: ProductImportRow[] }
  | { ok: false; error: string };

export function parseProductImportCsv(text: string): CsvParseResult {
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n').filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    return { ok: false, error: 'EMPTY_FILE' };
  }

  const headers = parseCsvLine(lines[0]).map(normalizeHeader);
  const required = ['name', 'category', 'subcategory', 'price', 'cost', 'stock'] as const;
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

    const price = parseFloat(String(record.price ?? '').replace(',', '.'));
    const cost = parseFloat(String(record.cost ?? '').replace(',', '.'));
    const stock = parseInt(String(record.stock ?? '').replace(',', '.'), 10);

    if (!name || !category || !subcategory) {
      return { ok: false, error: `ROW_MISSING_REQUIRED|${i + 1}` };
    }
    if (!Number.isFinite(price) || price < 0) {
      return { ok: false, error: `ROW_INVALID_PRICE|${i + 1}` };
    }
    if (!Number.isFinite(cost) || cost < 0) {
      return { ok: false, error: `ROW_INVALID_COST|${i + 1}` };
    }
    if (!Number.isFinite(stock) || stock < 0) {
      return { ok: false, error: `ROW_INVALID_STOCK|${i + 1}` };
    }

    const location = (record.location ?? '').trim();
    const sku = (record.sku ?? '').trim();

    rows.push({
      name,
      category,
      subcategory,
      price,
      cost,
      stock,
      ...(location ? { location } : {}),
      ...(sku ? { sku } : {}),
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
  'stock',
  'ubicacion',
  'sku',
] as const;

export const PRODUCT_IMPORT_TEMPLATE_SAMPLE: (string | number)[][] = [
  ['Lámpara LED', 'Iluminación', 'Lámparas', 10, 5, 20, 'Pasillo A', ''],
  ['Foco halógeno', 'Iluminación', 'Focos', 8.5, 4, 15, '', ''],
];
