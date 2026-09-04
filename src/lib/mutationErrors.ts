import { ApiConnectionError, ApiRequestError } from '../api/client';
import type { TranslateFn } from '../i18n/I18nContext';

/** Map API / mutation errors to user-facing strings. */
export function mapMutationError(err: unknown, t: TranslateFn): string {
  if (err instanceof ApiConnectionError) return t('errors.offline');
  if (err instanceof ApiRequestError) {
    if (err.code) return mapMutationErrorCode(err.code, t);
    return err.message || t('errors.generic');
  }
  const msg = err instanceof Error ? err.message : '';
  if (msg) return mapMutationErrorCode(msg, t);
  return t('errors.generic');
}

function mapMutationErrorCode(code: string, t: TranslateFn): string {
  if (code === 'ERR_DUPLICATE_CATEGORY') return t('errors.duplicateCategory');
  if (code === 'ERR_DUPLICATE_SUBCATEGORY') return t('errors.duplicateSubcategory');
  if (code === 'ERR_DUPLICATE_SUBCATEGORY_CODE') return t('errors.duplicateSubcategoryCode');
  if (code.startsWith('ERR_SUBCATEGORY_IN_USE')) return mapSubcategoryInUse(code, t);
  if (code === 'ERR_DUPLICATE_LOCATION') return t('errors.duplicateLocation');
  if (code.startsWith('ERR_CATEGORY_IN_USE')) return mapCategoryInUse(code, t);
  if (code.startsWith('ERR_PRODUCT_IN_USE')) return mapProductInUse(code, t);
  if (code === 'ERR_CASH_SESSION_OPEN') return t('reports.cashErrOpen');
  if (code === 'ERR_CASH_SESSION_REQUIRED') return t('errors.cashSessionRequired');
  if (code === 'ERR_SALE_ALREADY_REVERSED') return t('errors.saleAlreadyReversed');
  if (code === 'ERR_SALE_CANNOT_REVERSE') return t('errors.saleCannotReverse');
  if (code === 'ERR_SALE_CANNOT_DELETE') return t('errors.saleCannotDelete');
  if (code === 'ERR_INVALID_RECEIVE_QTY') return t('inventory.receiveInvalidQty');
  if (code === 'ERR_INVALID_RECEIVE_COST') return t('inventory.receiveInvalidCost');
  if (code === 'ERR_INVALID_RECEIVE_PRICE') return t('inventory.receiveInvalidPrice');
  if (code === 'ERR_IMPORT_EMPTY') return t('import.errNoData');
  if (code === 'ERR_IMPORT_TOO_LARGE') return t('import.errTooLarge');
  return code;
}

function mapProductInUse(code: string, t: TranslateFn): string {
  const parts = code.split('|');
  const count = parts[1] ?? '0';
  const name = parts[2] ? decodeURIComponent(parts[2]) : '';
  return t('errors.productInUse', { name, count });
}

function mapCategoryInUse(code: string, t: TranslateFn): string {
  const parts = code.split('|');
  const count = parts[1] ?? '0';
  const name = parts[2] ? decodeURIComponent(parts[2]) : '';
  return t('errors.categoryInUse', { name, count });
}

function mapSubcategoryInUse(code: string, t: TranslateFn): string {
  const parts = code.split('|');
  const count = parts[1] ?? '0';
  const name = parts[2] ? decodeURIComponent(parts[2]) : '';
  return t('errors.subcategoryInUse', { name, count });
}
