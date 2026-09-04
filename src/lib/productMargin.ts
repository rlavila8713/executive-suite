export type ProductMargin = {
  profitPerUnit: number;
  marginPercent: number;
  isProfit: boolean;
};

export function computeProductMargin(price: number, cost: number): ProductMargin | null {
  if (!Number.isFinite(price) || !Number.isFinite(cost)) return null;
  const profitPerUnit = Math.round((price - cost) * 100) / 100;
  const marginPercent = price > 0 ? Math.round(((price - cost) / price) * 10000) / 100 : 0;
  return {
    profitPerUnit,
    marginPercent,
    isProfit: profitPerUnit >= 0,
  };
}
