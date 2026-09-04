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
