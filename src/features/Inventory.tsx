import { useEffect, useMemo, useState } from 'react';
import {
  Search,
  Download,
  AlertTriangle,
  Package,
  PackageX,
  RefreshCw,
  PackagePlus,
  ChevronDown,
} from 'lucide-react';
import { Card, Button, Input, Modal } from '../components/ui';
import { ProductThumb } from '../components/ProductThumb';
import { Product, ProductCategory, ProductSubcategory } from '../types';
import { cn, rowMatchesSearch } from '../lib/utils';
import { useI18n } from '../i18n/I18nContext';
import { printTableDocument, downloadCsv } from '../lib/printDocument';
import { computeWeightedAverageCost } from '../lib/inventoryCost';
import { mapMutationError } from '../lib/mutationErrors';
import {
  CatalogFilterModal,
  catalogFilterLabel,
  productMatchesCatalogFilter,
  type CatalogFilter,
} from '../components/CatalogFilterModal';
import { ViewModeToggle, type ViewMode } from '../components/ViewModeToggle';

type StockChip = 'all' | 'available' | 'low' | 'out';

interface InventoryProps {
  products: Product[];
  productCategories: ProductCategory[];
  productSubcategories: ProductSubcategory[];
  globalSearch?: string;
  onUpdateStock: (id: string, newStock: number) => void | Promise<void>;
  onReceiveStock: (
    id: string,
    payload: { quantity: number; unitCost: number; price: number },
  ) => void | Promise<void>;
  onSyncStock?: () => void | Promise<void>;
  syncBusy?: boolean;
}

function parsePositiveNumber(raw: string): number | null {
  const v = parseFloat(raw.replace(',', '.'));
  if (!Number.isFinite(v) || v < 0) return null;
  return v;
}

function parsePositiveInt(raw: string): number | null {
  const v = parseInt(raw.replace(',', '.'), 10);
  if (!Number.isFinite(v) || v <= 0) return null;
  return v;
}

function matchesStockChip(product: Product, chip: StockChip): boolean {
  if (chip === 'all') return true;
  if (chip === 'available') return product.stock > 5;
  if (chip === 'low') return product.stock > 0 && product.stock <= 5;
  return product.stock === 0;
}

function stockStatusKey(product: Product): 'healthy' | 'critical' | 'out' {
  if (product.stock === 0) return 'out';
  if (product.stock <= 5) return 'critical';
  return 'healthy';
}

export function Inventory({
  products,
  productCategories,
  productSubcategories,
  globalSearch = '',
  onUpdateStock,
  onReceiveStock,
  onSyncStock,
  syncBusy,
}: InventoryProps) {
  const { t } = useI18n();
  const [localSearch, setLocalSearch] = useState('');
  const [stockChip, setStockChip] = useState<StockChip>('all');
  const [catalogFilter, setCatalogFilter] = useState<CatalogFilter>({ kind: 'all' });
  const [catalogModalOpen, setCatalogModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [receiveProduct, setReceiveProduct] = useState<Product | null>(null);
  const [quantityInput, setQuantityInput] = useState('');
  const [unitCostInput, setUnitCostInput] = useState('');
  const [priceInput, setPriceInput] = useState('');
  const [receiveMsg, setReceiveMsg] = useState<string | null>(null);
  const [receiveBusy, setReceiveBusy] = useState(false);

  const inventoryValue = useMemo(
    () => products.reduce((sum, p) => sum + p.cost * p.stock, 0),
    [products],
  );
  const outOfStockCount = useMemo(() => products.filter((p) => p.stock === 0).length, [products]);

  const visibleProducts = useMemo(
    () =>
      products.filter(
        (p) =>
          rowMatchesSearch(localSearch, [p.name, p.sku, p.category, p.subcategory, String(p.stock)]) &&
          rowMatchesSearch(globalSearch, [p.name, p.sku, p.category, p.subcategory, String(p.stock)]) &&
          matchesStockChip(p, stockChip) &&
          productMatchesCatalogFilter(p, catalogFilter),
      ),
    [products, localSearch, globalSearch, stockChip, catalogFilter],
  );

  useEffect(() => {
    if (!receiveProduct) return;
    setQuantityInput('');
    setUnitCostInput('');
    setPriceInput(String(receiveProduct.price));
    setReceiveMsg(null);
  }, [receiveProduct]);

  const preview = useMemo(() => {
    if (!receiveProduct) return null;
    const qty = parsePositiveInt(quantityInput);
    const unitCost = parsePositiveNumber(unitCostInput);
    if (qty == null || unitCost == null) return null;
    return {
      newStock: receiveProduct.stock + qty,
      newCost: computeWeightedAverageCost(receiveProduct.stock, receiveProduct.cost, qty, unitCost),
    };
  }, [receiveProduct, quantityInput, unitCostInput]);

  const statusLabel = (product: Product) => {
    const key = stockStatusKey(product);
    if (key === 'healthy') return t('inventory.statusHealthy');
    if (key === 'critical') return t('inventory.statusCritical');
    return t('inventory.statusOut');
  };

  const exportStockReport = () => {
    const rows = visibleProducts.map((p) => [
      p.name,
      p.sku,
      String(p.stock),
      p.cost.toFixed(2),
      statusLabel(p),
    ]);
    const ok = printTableDocument(
      t('inventory.stockReport'),
      new Date().toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }),
      [
        t('inventory.colDetails'),
        t('common.sku'),
        t('inventory.colCurrentStock'),
        t('inventory.colAvgCost'),
        t('inventory.colStatus'),
      ],
      rows,
    );
    if (!ok) {
      downloadCsv(
        `stock-${new Date().toISOString().slice(0, 10)}.csv`,
        ['name', 'sku', 'stock', 'cost', 'status'],
        rows,
      );
    }
  };

  const handleReceiveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!receiveProduct) return;
    setReceiveMsg(null);

    const quantity = parsePositiveInt(quantityInput);
    const unitCost = parsePositiveNumber(unitCostInput);
    const price = parsePositiveNumber(priceInput);

    if (quantity == null) {
      setReceiveMsg(t('inventory.receiveInvalidQty'));
      return;
    }
    if (unitCost == null) {
      setReceiveMsg(t('inventory.receiveInvalidCost'));
      return;
    }
    if (price == null) {
      setReceiveMsg(t('inventory.receiveInvalidPrice'));
      return;
    }

    setReceiveBusy(true);
    try {
      await onReceiveStock(receiveProduct.id, { quantity, unitCost, price });
      setReceiveProduct(null);
    } catch (err) {
      setReceiveMsg(mapMutationError(err, t));
    } finally {
      setReceiveBusy(false);
    }
  };

  const stockChips: { id: StockChip; label: string }[] = [
    { id: 'all', label: t('inventory.filterAll') },
    { id: 'available', label: t('inventory.filterAvailable') },
    { id: 'low', label: t('inventory.filterLow') },
    { id: 'out', label: t('inventory.filterOut') },
  ];

  const renderActions = (product: Product) => (
    <div className="flex justify-end gap-2 flex-wrap">
      <Button variant="secondary" size="sm" className="gap-1" onClick={() => setReceiveProduct(product)}>
        <PackagePlus size={14} />
        {t('inventory.receiveStock')}
      </Button>
      <Button variant="secondary" size="sm" className="h-8 w-8 p-0" onClick={() => onUpdateStock(product.id, product.stock + 10)}>
        +10
      </Button>
      <Button
        variant="secondary"
        size="sm"
        className="h-8 w-8 p-0"
        onClick={() => onUpdateStock(product.id, Math.max(0, product.stock - 10))}
      >
        -10
      </Button>
    </div>
  );

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-end">
        <div className="min-w-0">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-primary tracking-tight mb-2 font-headline">{t('inventory.title')}</h2>
          <p className="text-on-surface-variant text-sm font-medium">{t('inventory.subtitle')}</p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <Button variant="secondary" className="flex items-center gap-2" disabled={syncBusy} onClick={() => void onSyncStock?.()}>
            <RefreshCw size={16} className={syncBusy ? 'animate-spin' : ''} /> {t('inventory.syncStock')}
          </Button>
          <Button className="flex items-center gap-2" onClick={exportStockReport}>
            <Download size={16} /> {t('inventory.stockReport')}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <p className="text-[10px] text-on-surface-variant uppercase tracking-widest font-bold mb-1">{t('inventory.inventoryValue')}</p>
          <h3 className="text-2xl font-bold text-primary">${inventoryValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
          <p className="text-xs text-on-surface-variant mt-1">{t('inventory.inventoryValueHint')}</p>
        </Card>
        <Card>
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] text-on-surface-variant uppercase tracking-widest font-bold mb-1">{t('inventory.totalProducts')}</p>
              <h3 className="text-2xl font-bold text-primary">{products.length}</h3>
            </div>
            <Package size={22} className="text-primary/60" />
          </div>
          <p className="text-xs text-on-surface-variant mt-1">{t('inventory.acrossCategories')}</p>
        </Card>
        <Card className="bg-error-container/20 border-error/20">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] text-on-error-container uppercase tracking-widest font-bold mb-1">{t('inventory.outOfStock')}</p>
              <h3 className="text-2xl font-bold text-error">{outOfStockCount}</h3>
            </div>
            <PackageX size={22} className="text-error/70" />
          </div>
          <p className="text-xs text-on-surface-variant mt-1">{t('inventory.outOfStockHint')}</p>
        </Card>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="p-4 sm:p-6 border-b border-black/5 bg-surface-container-low space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
            <div className="relative w-full max-w-md min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <Input
                placeholder={t('inventory.searchPlaceholder')}
                className="pl-10"
                value={localSearch}
                onChange={(e) => setLocalSearch(e.target.value)}
              />
            </div>
            <ViewModeToggle
              mode={viewMode}
              onChange={setViewMode}
              gridLabel={t('common.viewGrid')}
              listLabel={t('common.viewList')}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {stockChips.map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={() => {
                  setStockChip(chip.id);
                  if (chip.id === 'all') setCatalogFilter({ kind: 'all' });
                }}
                className={cn(
                  'px-4 py-1.5 rounded-full text-xs font-bold transition-all',
                  stockChip === chip.id && catalogFilter.kind === 'all'
                    ? 'bg-primary text-white shadow-md'
                    : stockChip === chip.id
                      ? 'bg-primary/15 text-primary ring-1 ring-primary/30'
                      : 'bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest',
                )}
              >
                {chip.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setCatalogModalOpen(true)}
              className={cn(
                'px-4 py-1.5 rounded-full text-xs font-bold transition-all inline-flex items-center gap-1',
                catalogFilter.kind !== 'all'
                  ? 'bg-primary text-white shadow-md'
                  : 'bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest',
              )}
            >
              {catalogFilter.kind !== 'all'
                ? catalogFilterLabel(catalogFilter, t('inventory.filterCategories'))
                : t('inventory.filterCategories')}
              <ChevronDown size={14} />
            </button>
          </div>
        </div>

        {viewMode === 'grid' ? (
          <div className="p-4 sm:p-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {visibleProducts.map((product) => (
              <div
                key={product.id}
                className="rounded-xl border border-black/5 bg-surface-container-lowest overflow-hidden flex flex-col"
              >
                <div className="aspect-square relative bg-surface-container-high">
                  <ProductThumb src={product.image} className="w-full h-full object-cover" alt={product.name} />
                  <span
                    className={cn(
                      'absolute top-2 right-2 text-[9px] font-bold px-2 py-0.5 rounded-full uppercase',
                      stockStatusKey(product) === 'healthy'
                        ? 'bg-tertiary-container/90 text-white'
                        : stockStatusKey(product) === 'critical'
                          ? 'bg-error/80 text-white'
                          : 'bg-surface-container-high text-on-surface-variant',
                    )}
                  >
                    {statusLabel(product)}
                  </span>
                </div>
                <div className="p-3 flex flex-col flex-1 gap-2">
                  <div>
                    <p className="text-sm font-bold text-primary line-clamp-2 leading-tight">{product.name}</p>
                    <p className="text-[10px] text-on-surface-variant">{product.sku}</p>
                  </div>
                  <div className="text-xs flex justify-between">
                    <span className="font-bold text-primary">{product.stock} uds</span>
                    <span className="text-on-surface-variant">${product.cost.toFixed(2)}</span>
                  </div>
                  <div className="mt-auto pt-2">{renderActions(product)}</div>
                </div>
              </div>
            ))}
            {visibleProducts.length === 0 ? (
              <p className="col-span-full text-center text-sm text-on-surface-variant py-8">{t('inventory.noResults')}</p>
            ) : null}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-container-low border-b border-black/5">
                  <th className="py-3 px-4 text-[10px] text-on-surface-variant uppercase tracking-widest font-black">{t('inventory.colDetails')}</th>
                  <th className="py-3 px-4 text-[10px] text-on-surface-variant uppercase tracking-widest font-black text-right">{t('inventory.colCurrentStock')}</th>
                  <th className="py-3 px-4 text-[10px] text-on-surface-variant uppercase tracking-widest font-black text-right">{t('inventory.colAvgCost')}</th>
                  <th className="py-3 px-4 text-[10px] text-on-surface-variant uppercase tracking-widest font-black text-center">{t('inventory.colStatus')}</th>
                  <th className="py-3 px-4 text-[10px] text-on-surface-variant uppercase tracking-widest font-black text-right">{t('inventory.colActions')}</th>
                </tr>
              </thead>
              <tbody>
                {visibleProducts.map((product) => (
                  <tr key={product.id} className="border-b border-black/5 last:border-0 hover:bg-surface-container-low">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <ProductThumb src={product.image} className="w-9 h-9 rounded object-cover shrink-0" alt={product.name} />
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-primary truncate">{product.name}</p>
                          <p className="text-[10px] text-on-surface-variant">{product.sku}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-primary">{product.stock}</td>
                    <td className="py-3 px-4 text-right text-sm">${product.cost.toFixed(2)}</td>
                    <td className="py-3 px-4 text-center">
                      <span className="text-[10px] font-bold uppercase">{statusLabel(product)}</span>
                    </td>
                    <td className="py-3 px-4">{renderActions(product)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {visibleProducts.length === 0 ? (
              <p className="text-center text-sm text-on-surface-variant py-8">{t('inventory.noResults')}</p>
            ) : null}
          </div>
        )}
      </Card>

      <CatalogFilterModal
        isOpen={catalogModalOpen}
        onClose={() => setCatalogModalOpen(false)}
        title={t('inventory.filterCategoriesTitle')}
        allLabel={t('inventory.filterAll')}
        closeLabel={t('common.cancel')}
        categories={productCategories}
        subcategories={productSubcategories}
        selected={catalogFilter}
        onSelect={(filter) => {
          setCatalogFilter(filter);
          if (filter.kind !== 'all') setStockChip('all');
        }}
      />

      <Modal isOpen={receiveProduct != null} onClose={() => !receiveBusy && setReceiveProduct(null)} title={t('inventory.receiveTitle')}>
        {receiveProduct ? (
          <form onSubmit={(e) => void handleReceiveSubmit(e)} className="space-y-5">
            <div className="rounded-xl bg-surface-container-low p-4">
              <p className="text-sm font-bold text-primary">{receiveProduct.name}</p>
              <p className="text-xs text-on-surface-variant mt-1">{receiveProduct.sku}</p>
              <div className="grid grid-cols-2 gap-3 mt-3 text-sm">
                <div>
                  <p className="text-[10px] uppercase font-bold text-on-surface-variant">{t('inventory.colCurrentStock')}</p>
                  <p className="font-bold text-primary">{receiveProduct.stock}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase font-bold text-on-surface-variant">{t('inventory.currentAvgCost')}</p>
                  <p className="font-bold text-primary">${receiveProduct.cost.toFixed(2)}</p>
                </div>
              </div>
            </div>
            <p className="text-xs text-on-surface-variant">{t('inventory.receiveHelp')}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">{t('inventory.receiveQty')}</label>
                <Input type="number" min={1} step={1} value={quantityInput} onChange={(e) => setQuantityInput(e.target.value)} required className="mt-1" />
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">{t('inventory.receiveUnitCost')}</label>
                <Input type="number" min={0} step="0.01" value={unitCostInput} onChange={(e) => setUnitCostInput(e.target.value)} required className="mt-1" />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">{t('inventory.receiveSalePrice')}</label>
                <Input type="number" min={0} step="0.01" value={priceInput} onChange={(e) => setPriceInput(e.target.value)} required className="mt-1" />
              </div>
            </div>
            {preview ? (
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm">
                <p className="text-[10px] font-bold uppercase text-on-surface-variant mb-2">{t('inventory.receivePreview')}</p>
                <div className="grid grid-cols-2 gap-2">
                  <p>
                    {t('inventory.colCurrentStock')}: <span className="font-bold">{receiveProduct.stock}</span> →{' '}
                    <span className="font-bold text-primary">{preview.newStock}</span>
                  </p>
                  <p>
                    {t('inventory.currentAvgCost')}: <span className="font-bold">${receiveProduct.cost.toFixed(2)}</span> →{' '}
                    <span className="font-bold text-primary">${preview.newCost.toFixed(2)}</span>
                  </p>
                </div>
              </div>
            ) : null}
            {receiveMsg ? <p className="text-sm text-error">{receiveMsg}</p> : null}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" disabled={receiveBusy} onClick={() => setReceiveProduct(null)}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={receiveBusy}>{t('inventory.receiveConfirm')}</Button>
            </div>
          </form>
        ) : null}
      </Modal>
    </div>
  );
}
