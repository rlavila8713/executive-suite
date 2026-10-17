/** Weighted average unit cost after receiving inventory. */
export function computeWeightedAverageCost(
  currentStock: number,
  currentCost: number,
  receivedQty: number,
  receivedUnitCost: number,
): number {
  const totalQty = currentStock + receivedQty;
  if (totalQty <= 0) return receivedUnitCost;
  const totalValue = currentStock * currentCost + receivedQty * receivedUnitCost;
  return Math.round((totalValue / totalQty) * 100) / 100;
}

/** Undo a receipt layer at a known unit cost (warehouse entry reversal). */
export function computeCostAfterRemovingLayer(
  currentStock: number,
  currentCost: number,
  removedQty: number,
  removedUnitCost: number,
): number {
  const newQty = currentStock - removedQty;
  if (newQty <= 0) return currentCost;
  const newValue = currentStock * currentCost - removedQty * removedUnitCost;
  return Math.round((newValue / newQty) * 100) / 100;
}
