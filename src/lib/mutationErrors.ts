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
  if (code === 'ERR_CASH_SESSION_DAILY_CLOSE_REQUIRED') return t('errors.cashSessionDailyCloseRequired');
  if (code === 'ERR_CASH_CLOCK_ROLLBACK') return t('errors.cashClockRollback');
  if (code === 'ERR_LICENSE_EXPIRED') return t('license.expiredBody');
  if (code === 'ERR_DEVICE_MISMATCH') return t('license.deviceMismatchBody');
  if (code === 'ERR_DEVICE_REVOKED') return t('errors.deviceRevoked');
  if (code === 'ERR_DEVICE_REVOKE_SELF') return t('settings.serverDeviceDisconnectSelf');
  if (code === 'ERR_DEVICE_NOT_FOUND') return t('settings.serverDeviceDisconnectErr');
  if (code === 'ERR_OPERATOR_REQUIRED') return t('errors.operatorRequired');
  if (code === 'ERR_OPERATOR_ASSIGN_FORBIDDEN') return t('errors.operatorAssignForbidden');
  if (code.startsWith('ERR_INSUFFICIENT_STOCK')) return mapInsufficientStock(code, t);
  if (code === 'ERR_LICENSE_INVALID') return t('settings.billingActivateErr');
  if (code === 'ERR_LICENSE_ALREADY_USED') return t('settings.billingLicenseUsed');
  if (code === 'ERR_LICENSE_DEVICE_MISMATCH') return t('settings.billingLicenseWrongDevice');
  if (code === 'ERR_LICENSE_REQUEST_INVALID') return t('settings.billingRequestErr');
  if (code === 'ERR_EXPENSE_LOCKED') return t('expenses.locked');
  if (code === 'ERR_SALE_ALREADY_REVERSED') return t('errors.saleAlreadyReversed');
  if (code === 'ERR_SALE_CANNOT_REVERSE') return t('errors.saleCannotReverse');
  if (code === 'ERR_SALE_CANNOT_DELETE') return t('errors.saleCannotDelete');
  if (code === 'ERR_SETTLED_TRANSACTION_IMMUTABLE') return t('errors.settledTransactionImmutable');
  if (code === 'ERR_INVALID_RECEIVE_QTY') return t('inventory.receiveInvalidQty');
  if (code === 'ERR_INVALID_RECEIVE_COST') return t('inventory.receiveInvalidCost');
  if (code === 'ERR_INVALID_RECEIVE_PRICE') return t('inventory.receiveInvalidPrice');
  if (code === 'ERR_INVALID_TRANSFER_QTY') return t('inventory.transferInvalidQty');
  if (code === 'ERR_INVALID_TRANSFER_PRICE') return t('warehouse.transferInvalidPrice');
  if (code === 'ERR_PRODUCT_COST_READONLY') return t('errors.productCostReadonly');
  if (code === 'ERR_INVALID_PRODUCT_PRICE') return t('products.invalidPrice');
  if (code === 'ERR_CUSTOMER_NAME_REQUIRED') return t('customers.nameRequired');
  if (code === 'ERR_DEBT_CUSTOMER_REQUIRED') return t('pos.debtCustomerRequired');
  if (code === 'ERR_DEBT_NOT_FOUND') return t('receivables.empty');
  if (code === 'ERR_PAYABLE_NOT_FOUND') return t('payables.empty');
  if (code === 'ERR_PAYABLE_EXISTS') return t('errors.payableExists');
  if (code === 'ERR_SALE_DEBT_COLLECTED_CANNOT_REVERSE') return t('errors.saleDebtCollectedCannotReverse');
  if (code === 'ERR_MIXED_WEB_ONLY') return t('errors.mixedWebOnly');
  if (code === 'ERR_IMPORT_EMPTY') return t('import.errNoData');
  if (code === 'ERR_IMPORT_TOO_LARGE') return t('import.errTooLarge');
  if (code === 'ERR_WAREHOUSE_WEB_ONLY') return t('errors.warehouseWebOnly');
  if (code === 'ERR_INSUFFICIENT_WAREHOUSE_STOCK') return t('errors.insufficientWarehouseStock');
  if (code.startsWith('ERR_WAREHOUSE_SECTION_IN_USE')) return mapWarehouseSectionInUse(code, t);
  if (code === 'ERR_DUPLICATE_WAREHOUSE_SECTION') return t('errors.duplicateWarehouseSection');
  if (code === 'ERR_STORE_STOCK_DIRECT_EDIT') return t('errors.storeStockDirectEdit');
  return code;
}

function mapInsufficientStock(code: string, t: TranslateFn): string {
  const parts = code.split('|');
  const name = parts[2] ? decodeURIComponent(parts[2]) : '';
  return name ? t('errors.insufficientStockNamed', { name }) : t('errors.insufficientStock');
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

function mapWarehouseSectionInUse(code: string, t: TranslateFn): string {
  const parts = code.split('|');
  const count = parts[1] ?? '0';
  const name = parts[2] ? decodeURIComponent(parts[2]) : '';
  return t('errors.warehouseSectionInUse', { name, count });
}

function mapSubcategoryInUse(code: string, t: TranslateFn): string {
  const parts = code.split('|');
  const count = parts[1] ?? '0';
  const name = parts[2] ? decodeURIComponent(parts[2]) : '';
  return t('errors.subcategoryInUse', { name, count });
}
