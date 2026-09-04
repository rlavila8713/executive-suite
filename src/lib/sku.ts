import type { ProductCategory, ProductSubcategory } from '../types';

export function codeFromCategoryName(name: string): string {
  const cleaned = name.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ]/g, '');
  if (!cleaned) return 'XX';
  if (cleaned.length === 1) return cleaned.toUpperCase();
  return cleaned.substring(0, 2).toUpperCase();
}

export function buildSkuPrefix(category: ProductCategory, subcategory: ProductSubcategory): string {
  const catCode = (category.code || codeFromCategoryName(category.name)).toUpperCase();
  const subCode = subcategory.code.toUpperCase();
  return `${catCode}-${subCode}-`;
}

export function nextSkuFromProducts(
  products: { sku: string }[],
  category: ProductCategory,
  subcategory: ProductSubcategory,
): string {
  const prefix = buildSkuPrefix(category, subcategory);
  let maxSeq = 0;
  for (const p of products) {
    if (!p.sku.startsWith(prefix)) continue;
    const seq = parseInt(p.sku.slice(prefix.length), 10);
    if (!Number.isNaN(seq) && seq > maxSeq) maxSeq = seq;
  }
  return `${prefix}${String(maxSeq + 1).padStart(6, '0')}`;
}
