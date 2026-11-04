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
  if (perspective === 'store') {
    if (m.type === 'TRANSFER_TO_STORE') return Math.abs(m.quantityDelta);
    if (m.type === 'REVERSAL' && m.quantityDelta > 0) return -m.quantityDelta;
  }
  return m.quantityDelta;
}

export function movementCanBeReversed(m: WarehouseMovement): boolean {
  return (
    (m.type === 'ENTRY' && m.quantityDelta > 0) ||
    (m.type === 'TRANSFER_TO_STORE' && m.quantityDelta < 0)
  );
}

export function movementReversibleQuantity(m: WarehouseMovement): number {
  if (m.reversibleQuantity != null) return m.reversibleQuantity;
  if (m.type === 'ENTRY' && m.quantityDelta > 0) return m.quantityDelta;
  if (m.type === 'TRANSFER_TO_STORE' && m.quantityDelta < 0) return Math.abs(m.quantityDelta);
  return 0;
}

export function movementOriginalAbsoluteQuantity(m: WarehouseMovement): number {
  if (m.type === 'ENTRY' && m.quantityDelta > 0) return m.quantityDelta;
  if (m.type === 'TRANSFER_TO_STORE' && m.quantityDelta < 0) return Math.abs(m.quantityDelta);
  return Math.abs(movementDisplayQuantity(m, 'warehouse'));
}

/** Net effect after partial/full reversals (signed, same rules as movementDisplayQuantity). */
export function movementNetDisplayQuantity(m: WarehouseMovement, perspective: 'warehouse' | 'store'): number {
  const reversed = m.reversedQuantity ?? 0;
  if (!movementCanBeReversed(m) || reversed <= 0) {
    return movementDisplayQuantity(m, perspective);
  }
  const originalSigned = movementDisplayQuantity(m, perspective);
  const sign = originalSigned === 0 ? 1 : Math.sign(originalSigned);
  const netAbs = Math.max(0, movementOriginalAbsoluteQuantity(m) - reversed);
  return sign * netAbs;
}

export function movementHasReversalHistory(m: WarehouseMovement): boolean {
  return movementCanBeReversed(m) && (m.reversedQuantity ?? 0) > 0;
}

export function formatSignedMovementQty(qty: number): string {
  return qty > 0 ? `+${qty}` : String(qty);
}

/** Quantity shown on a reversal row (always positive units reversed). */
export function reversalRowUnits(m: WarehouseMovement): number {
  return Math.abs(m.quantityDelta);
}

/** Reversal rows belong to warehouse tab (entry undo) or store tab (transfer undo). */
export function reversalVisibleForPerspective(
  m: WarehouseMovement,
  perspective: 'warehouse' | 'store',
): boolean {
  if (m.type !== 'REVERSAL') return true;
  if (perspective === 'store') return m.quantityDelta > 0;
  return m.quantityDelta < 0;
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

export function movementListTypeLabelKey(m: WarehouseMovement): string {
  if (m.type === 'REVERSAL') {
    if (m.reversesMovementType === 'TRANSFER_TO_STORE') {
      return 'stockMovements.movementTypeReversalTransfer';
    }
    if (m.reversesMovementType === 'ENTRY') {
      return 'stockMovements.movementTypeReversalEntry';
    }
    return 'stockMovements.movementTypeReversal';
  }
  return movementTypeLabelKey(m.type);
}
