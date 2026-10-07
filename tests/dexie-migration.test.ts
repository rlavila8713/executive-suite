import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { decideDexieMigration, apiIsFreshSeed } from '../src/lib/dexieMigration.ts';
import type { Product, ProductCategory } from '../src/types.ts';
import { MOCK_PRODUCTS } from '../src/constants.ts';

const cat = (name: string): ProductCategory => ({ id: name, name, code: name.slice(0, 3).toUpperCase() });

describe('dexie migration decisions', () => {
  it('apiIsFreshSeed is false when API has zero products', () => {
    assert.equal(apiIsFreshSeed([], []), false);
  });

  it('API 600 / local 0 → discard', () => {
    const apiProducts = Array.from({ length: 600 }, (_, i) => ({
      ...MOCK_PRODUCTS[0],
      id: `p-${i}`,
    })) as Product[];
    const d = decideDexieMigration(apiProducts, [cat('Apparel')], []);
    assert.equal(d.action, 'discard_local');
  });

  it('API 600 / local 100 → discard', () => {
    const apiProducts = Array.from({ length: 600 }, (_, i) => ({
      ...MOCK_PRODUCTS[0],
      id: `p-${i}`,
    })) as Product[];
    const local = [{ ...MOCK_PRODUCTS[0], id: 'local-1' }] as Product[];
    const d = decideDexieMigration(apiProducts, [cat('Apparel')], local);
    assert.equal(d.action, 'discard_local');
  });

  it('API 0 / local 600 → skip (no silent import)', () => {
    const local = Array.from({ length: 600 }, (_, i) => ({
      ...MOCK_PRODUCTS[0],
      id: `l-${i}`,
    })) as Product[];
    const d = decideDexieMigration([], [], local);
    assert.equal(d.action, 'skip');
  });

  it('API demo seed / local catalog → import', () => {
    const d = decideDexieMigration(MOCK_PRODUCTS, MOCK_PRODUCTS.map((p) => cat(p.category)), [
      { ...MOCK_PRODUCTS[0], id: 'user-1' },
    ] as Product[]);
    assert.equal(d.action, 'import');
  });
});
