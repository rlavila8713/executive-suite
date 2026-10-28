import type { WarehouseMovement } from '../types';
import {
  formatSignedMovementQty,
  movementHasReversalHistory,
  movementNetDisplayQuantity,
  movementOriginalAbsoluteQuantity,
  movementReversibleQuantity,
} from '../lib/stockMovements';
import { useI18n } from '../i18n/I18nContext';

type Perspective = 'warehouse' | 'store';

interface MovementQuantityCellProps {
  movement: WarehouseMovement;
  perspective: Perspective;
}

export function MovementQuantityCell({ movement, perspective }: MovementQuantityCellProps) {
  const { t } = useI18n();
  if (!movementHasReversalHistory(movement)) {
    const qty = movementNetDisplayQuantity(movement, perspective);
    return <span className="font-mono font-bold">{formatSignedMovementQty(qty)}</span>;
  }

  const originalAbs = movementOriginalAbsoluteQuantity(movement);
  const reversed = movement.reversedQuantity ?? 0;
  const net = movementNetDisplayQuantity(movement, perspective);
  const remaining = movementReversibleQuantity(movement);

  return (
    <div className="font-mono text-right">
      <div className="font-bold">{formatSignedMovementQty(net)}</div>
      <div className="text-[10px] font-normal text-on-surface-variant leading-tight mt-0.5">
        {t('stockMovements.movementQtyBreakdown', {
          original: originalAbs,
          reversed,
          remaining,
        })}
      </div>
    </div>
  );
}
