import { ApiError } from './routes.js';

/** Store (POS) stock may only change via sales, reversals, and warehouse transfer — not direct API edits. */
export function rejectDirectStoreStockMutation(): void {
  throw new ApiError(
    409,
    'Store stock can only be updated via warehouse transfer or sales',
    'ERR_STORE_STOCK_DIRECT_EDIT',
  );
}

export function normalizeInitialStoreStock(requested: number): number {
  const stock = Math.floor(Number(requested));
  if (!Number.isFinite(stock) || stock < 0) {
    throw new ApiError(400, 'stock must be a non-negative integer');
  }
  if (stock > 0) {
    rejectDirectStoreStockMutation();
  }
  return 0;
}
