import { ScrollText, Undo2 } from 'lucide-react';
import type { WarehouseMovement } from '../types';
import { TableIconAction } from './TableIconAction';
import { useI18n } from '../i18n/I18nContext';
import { movementCanBeReversed, movementHasReversalHistory } from '../lib/stockMovements';

interface MovementReversalActionsProps {
  movement: WarehouseMovement;
  canReverse: boolean;
  onReverse: () => void;
  onHistory: () => void;
}

export function MovementReversalActions({
  movement,
  canReverse,
  onReverse,
  onHistory,
}: MovementReversalActionsProps) {
  const { t } = useI18n();
  const showHistory = movementHasReversalHistory(movement);
  const fullyReversed = movementCanBeReversed(movement) && Boolean(movement.reversedAt) && !canReverse;

  if (!showHistory && !canReverse && !fullyReversed) {
    return <span className="text-on-surface-variant">—</span>;
  }

  return (
    <div className="flex justify-end items-center gap-1 flex-wrap">
      {showHistory ? (
        <TableIconAction
          icon={ScrollText}
          label={t('stockMovements.reversalHistoryAction')}
          tone="info"
          onClick={onHistory}
        />
      ) : null}
      {canReverse ? (
        <TableIconAction
          icon={Undo2}
          label={t('stockMovements.reversalAction')}
          tone="danger"
          onClick={onReverse}
        />
      ) : null}
      {fullyReversed ? (
        <span className="text-[10px] text-on-surface-variant uppercase font-bold px-1">
          {t('stockMovements.reversalDoneLabel')}
        </span>
      ) : null}
    </div>
  );
}
