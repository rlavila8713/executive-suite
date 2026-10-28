import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { WarehouseMovement } from '../src/types.js';
import { movementNetDisplayQuantity, reversalVisibleForPerspective } from '../src/lib/stockMovements.js';

function transfer(partial: Partial<WarehouseMovement>): WarehouseMovement {
  return {
    id: '1',
    warehouseId: 'w',
    productId: 'p',
    sectionId: null,
    type: 'TRANSFER_TO_STORE',
    quantityDelta: -100,
    unitCost: 5,
    balanceAfter: 0,
    referenceType: null,
    referenceId: null,
    notes: null,
    createdAt: 0,
    createdBy: null,
    reversedQuantity: 50,
    reversibleQuantity: 50,
    ...partial,
  };
}

describe('reversalVisibleForPerspective', () => {
  it('splits entry vs transfer reversals by tab', () => {
    const entryRev = { type: 'REVERSAL' as const, quantityDelta: -5 };
    const transferRev = { type: 'REVERSAL' as const, quantityDelta: 5 };
    assert.equal(reversalVisibleForPerspective(entryRev as never, 'warehouse'), true);
    assert.equal(reversalVisibleForPerspective(entryRev as never, 'store'), false);
    assert.equal(reversalVisibleForPerspective(transferRev as never, 'store'), true);
    assert.equal(reversalVisibleForPerspective(transferRev as never, 'warehouse'), false);
  });
});

describe('movementNetDisplayQuantity', () => {
  it('shows net store quantity after partial transfer reversal', () => {
    assert.equal(movementNetDisplayQuantity(transfer({}), 'store'), 50);
    assert.equal(movementNetDisplayQuantity(transfer({}), 'warehouse'), -50);
  });
});
