import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { computeCostAfterRemovingLayer, computeWeightedAverageCost } from '../server/inventoryCost.js';

describe('warehouse entry reversal cost', () => {
  it('recomputes weighted average when removing a layer at entry cost', () => {
    const afterReceive = computeWeightedAverageCost(0, 0, 10, 5);
    assert.equal(afterReceive, 5);
    const afterPartial = computeCostAfterRemovingLayer(10, afterReceive, 3, 5);
    assert.equal(afterPartial, 5);
    const afterMore = computeCostAfterRemovingLayer(7, afterPartial, 7, 5);
    assert.equal(afterMore, 5);
  });

  it('handles mixed-cost layers', () => {
    const avg = computeWeightedAverageCost(10, 5, 10, 8);
    assert.equal(avg, 6.5);
    const afterReversal = computeCostAfterRemovingLayer(20, avg, 10, 8);
    assert.equal(afterReversal, 5);
  });
});
