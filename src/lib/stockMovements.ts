import type { WarehouseMovement, WarehouseMovementType } from '../types';
import { dateRangeFromInputs, localDayRange, type DateRangeMs } from './reporting';

export type StockMovementDatePreset = 'today' | 'week' | 'month' | 'custom';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function toInputDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function dateRangeForPreset(
  preset: StockMovementDatePreset,
  customStart: string,
  customEnd: string,
): DateRangeMs {
  if (preset === 'custom') {
    return dateRangeFromInputs(customStart, customEnd);
  }
  const now = Date.now();
  if (preset === 'today') {
    return localDayRange(now);
  }
  if (preset === 'week') {
    const end = localDayRange(now).end;
    const start = new Date(now);
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    return { start: start.getTime(), end };
  }
  const start = new Date(now);
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  return { start: start.getTime(), end: localDayRange(now).end };
}

/** Positive quantity shown to users (store entries use transfer rows). */
export function movementDisplayQuantity(m: WarehouseMovement, perspective: 'warehouse' | 'store'): number {
  if (perspective === 'store' && m.type === 'TRANSFER_TO_STORE') {
    return Math.abs(m.quantityDelta);
  }
  return m.quantityDelta;
}

export function movementTypeLabelKey(type: WarehouseMovementType): string {
  switch (type) {
    case 'ENTRY':
      return 'warehouse.movementTypeEntry';
    case 'TRANSFER_TO_STORE':
      return 'warehouse.movementTypeTransfer';
    case 'ADJUSTMENT':
      return 'warehouse.movementTypeAdjustment';
    case 'SECTION_REASSIGN':
      return 'warehouse.movementTypeSection';
    case 'REVERSAL':
      return 'stockMovements.movementTypeReversal';
    case 'EXPENSE_STORE':
      return 'stockMovements.movementTypeExpenseStore';
    case 'EXPENSE_WAREHOUSE':
      return 'stockMovements.movementTypeExpenseWarehouse';
    default:
      return 'warehouse.movementTypeEntry';
  }
}
