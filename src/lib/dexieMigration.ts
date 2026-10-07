import type { Product, ProductCategory } from '../types';
import { DEFAULT_PRODUCT_CATEGORY_NAMES, MOCK_PRODUCTS } from '../constants';

/** True when the API still has only the demo seed, not user-created catalog rows. */
export function apiIsFreshSeed(products: Product[], categories: ProductCategory[]): boolean {
  if (products.length === 0) return false;
  const mockIds = new Set(MOCK_PRODUCTS.map((p) => p.id));
  if (products.some((p) => !mockIds.has(p.id))) return false;
  if (products.length > MOCK_PRODUCTS.length) return false;
  const defaultNames = new Set<string>(DEFAULT_PRODUCT_CATEGORY_NAMES);
  return !categories.some((c) => !defaultNames.has(c.name));
}

export type DexieMigrationDecision =
  | { action: 'skip'; reason: string }
  | { action: 'discard_local'; reason: string }
  | { action: 'import'; reason: string };

export function decideDexieMigration(
  apiProducts: Product[],
  apiCategories: ProductCategory[],
  localProducts: Product[],
): DexieMigrationDecision {
  if (apiProducts.length === 0 && localProducts.length > 0) {
    return {
      action: 'skip',
      reason: 'API empty but browser has catalog — manual restore required',
    };
  }
  if (!apiIsFreshSeed(apiProducts, apiCategories)) {
    return { action: 'discard_local', reason: 'API already has store data' };
  }
  if (localProducts.length === 0) {
    return { action: 'discard_local', reason: 'No local catalog to migrate' };
  }
  return { action: 'import', reason: 'API has demo seed only' };
}
