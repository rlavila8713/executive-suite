import { useMemo, useState } from 'react';
import {
  Search,
  Download,
  Package,
  PackageX,
  RefreshCw,
  ChevronDown,
} from 'lucide-react';
import { Card, Button, Input } from '../components/ui';
import { ProductThumb } from '../components/ProductThumb';
import { Product, ProductCategory, ProductSubcategory } from '../types';
import { cn, rowMatchesSearch } from '../lib/utils';
import { useI18n } from '../i18n/I18nContext';
import { printTableDocument, downloadCsv } from '../lib/printDocument';
import { usePagination } from '../lib/usePagination';
import { TablePagination } from '../components/TablePagination';
import {
  CatalogFilterModal,
  catalogFilterLabel,
  productMatchesCatalogFilter,
  type CatalogFilter,
} from '../components/CatalogFilterModal';
import { ViewModeToggle, type ViewMode } from '../components/ViewModeToggle';
import { StatMetricCard } from '../components/StatMetricCard';

type StockChip = 'all' | 'available' | 'low' | 'out';

interface InventoryProps {
  products: Product[];
  productCategories: ProductCategory[];
  productSubcategories: ProductSubcategory[];
  globalSearch?: string;
  onSyncStock?: () => void | Promise<void>;
  syncBusy?: boolean;
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
  onSyncStock,
  syncBusy,
}: InventoryProps) {
  const { t } = useI18n();
  const [localSearch, setLocalSearch] = useState('');
  const [stockChip, setStockChip] = useState<StockChip>('all');
  const [catalogFilter, setCatalogFilter] = useState<CatalogFilter>({ kind: 'all' });
  const [catalogModalOpen, setCatalogModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  const inventoryValueAtCost = useMemo(
    () => products.reduce((sum, p) => sum + p.cost * p.stock, 0),
    [products],
  );
  const inventoryValueAtRetail = useMemo(
    () => products.reduce((sum, p) => sum + p.price * p.stock, 0),
    [products],
  );
  const formatMoney = (n: number) =>
    n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

  const { pageItems: inventoryPageItems, page: inventoryPage, setPage: setInventoryPage, totalPages: inventoryTotalPages, total: inventoryTotal, pageSize: inventoryPageSize } =
    usePagination(visibleProducts);

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
      p.price > 0 ? p.price.toFixed(2) : '—',
      p.stock > 0 || p.cost > 0 ? p.cost.toFixed(2) : '',
      statusLabel(p),
    ]);
    const ok = printTableDocument(
      t('inventory.stockReport'),
      new Date().toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }),
      [
        t('inventory.colDetails'),
        t('common.sku'),
        t('inventory.colCurrentStock'),
        t('inventory.colSalePrice'),
        t('inventory.colAvgCost'),
        t('inventory.colStatus'),
      ],
      rows,
    );
    if (!ok) {
      downloadCsv(
        `stock-${new Date().toISOString().slice(0, 10)}.csv`,
        ['name', 'sku', 'stock', 'price', 'cost', 'status'],
        rows,
      );
    }
  };

  const stockChips: { id: StockChip; label: string }[] = [
    { id: 'all', label: t('inventory.filterAll') },
    { id: 'available', label: t('inventory.filterAvailable') },
    { id: 'low', label: t('inventory.filterLow') },
    { id: 'out', label: t('inventory.filterOut') },
  ];

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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatMetricCard
          label={t('inventory.valueAtCost')}
          value={`$${formatMoney(inventoryValueAtCost)}`}
          hint={t('inventory.inventoryValueHint')}
        />
        <StatMetricCard
          label={t('inventory.valueAtRetail')}
          value={`$${formatMoney(inventoryValueAtRetail)}`}
          hint={t('inventory.valueAtRetailHint')}
        />
        <StatMetricCard
          label={t('inventory.totalProducts')}
          value={products.length}
          hint={t('inventory.acrossCategories')}
          icon={Package}
        />
        <StatMetricCard
          label={t('inventory.outOfStock')}
          value={outOfStockCount}
          hint={t('inventory.outOfStockHint')}
          icon={PackageX}
          variant="danger"
        />
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
                  <ProductThumb src={product.image} imageUrl={product.imageUrl} className="w-full h-full object-cover" alt={product.name} />
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
                  <div className="text-xs flex justify-between gap-2">
                    <span className="font-bold text-primary">{product.stock} uds</span>
                    <span className="text-on-surface-variant text-right">
                      {product.price > 0 ? `$${product.price.toFixed(2)}` : '—'}
                    </span>
                  </div>
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
                  <th className="py-3 px-4 text-[10px] text-on-surface-variant uppercase tracking-widest font-black text-right">{t('inventory.colSalePrice')}</th>
                  <th className="py-3 px-4 text-[10px] text-on-surface-variant uppercase tracking-widest font-black text-right">{t('inventory.colAvgCost')}</th>
                  <th className="py-3 px-4 text-[10px] text-on-surface-variant uppercase tracking-widest font-black text-center">{t('inventory.colStatus')}</th>
                </tr>
              </thead>
              <tbody>
                {inventoryPageItems.map((product) => (
                  <tr key={product.id} className="border-b border-black/5 last:border-0 hover:bg-surface-container-low">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <ProductThumb src={product.image} imageUrl={product.imageUrl} className="w-9 h-9 rounded object-cover shrink-0" alt={product.name} />
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-primary truncate">{product.name}</p>
                          <p className="text-[10px] text-on-surface-variant">{product.sku}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-primary">{product.stock}</td>
                    <td className="py-3 px-4 text-right text-sm">
                      {product.price > 0 ? `$${product.price.toFixed(2)}` : '—'}
                    </td>
                    <td className="py-3 px-4 text-right text-sm">
                      {product.stock > 0 || product.cost > 0 ? `$${product.cost.toFixed(2)}` : t('products.costNotSet')}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="text-[10px] font-bold uppercase">{statusLabel(product)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <TablePagination
              page={inventoryPage}
              totalPages={inventoryTotalPages}
              total={inventoryTotal}
              pageSize={inventoryPageSize}
              onPageChange={setInventoryPage}
            />
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
    </div>
  );
}
