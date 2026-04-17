import { useMemo, useState } from 'react';
import { Search, Download, AlertTriangle, ArrowUpRight, RefreshCw } from 'lucide-react';
import { Card, Button, Input } from '../components/ui';
import { ProductThumb } from '../components/ProductThumb';
import { Product } from '../types';
import { cn, rowMatchesSearch } from '../lib/utils';
import { useI18n } from '../i18n/I18nContext';

interface InventoryProps {
  products: Product[];
  globalSearch?: string;
  onUpdateStock: (id: string, newStock: number) => void | Promise<void>;
}

export function Inventory({ products, globalSearch = '', onUpdateStock }: InventoryProps) {
  const { t } = useI18n();
  const [localSearch, setLocalSearch] = useState('');
  const lowStock = products.filter((p) => p.stock <= 5);

  const visibleProducts = useMemo(
    () =>
      products.filter(
        (p) =>
          rowMatchesSearch(localSearch, [p.name, p.sku, p.category, String(p.stock)]) &&
          rowMatchesSearch(globalSearch, [p.name, p.sku, p.category, String(p.stock)]),
      ),
    [products, localSearch, globalSearch],
  );

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-end">
        <div className="min-w-0">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-primary tracking-tight mb-2 font-headline">{t('inventory.title')}</h2>
          <p className="text-on-surface-variant text-sm font-medium">{t('inventory.subtitle')}</p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <Button variant="secondary" className="flex items-center gap-2">
            <RefreshCw size={16} /> {t('inventory.syncStock')}
          </Button>
          <Button className="flex items-center gap-2">
            <Download size={16} /> {t('inventory.stockReport')}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-error-container text-on-error-container border-none">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-1">{t('inventory.criticalStock')}</p>
              <h3 className="text-3xl font-extrabold tracking-tight">{t('inventory.itemsCount', { count: lowStock.length })}</h3>
            </div>
            <AlertTriangle size={24} />
          </div>
          <p className="text-xs mt-4 font-medium">{t('inventory.replenishment')}</p>
        </Card>
        <Card>
          <p className="text-[10px] text-on-surface-variant uppercase tracking-widest font-bold mb-1">{t('inventory.totalSkus')}</p>
          <h3 className="text-2xl font-bold text-primary">{products.length}</h3>
          <p className="text-xs text-on-surface-variant mt-1">{t('inventory.acrossCategories')}</p>
        </Card>
        <Card>
          <p className="text-[10px] text-on-surface-variant uppercase tracking-widest font-bold mb-1">{t('inventory.turnRate')}</p>
          <h3 className="text-2xl font-bold text-primary">4.2x</h3>
          <div className="mt-4 flex items-center gap-1 text-on-tertiary-container text-xs font-bold">
            <ArrowUpRight size={14} /> {t('inventory.fromLastQ')}
          </div>
        </Card>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="p-6 border-b border-black/5 flex justify-between items-center bg-surface-container-low">
          <div className="relative w-full max-w-md min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <Input
              placeholder={t('inventory.searchPlaceholder')}
              className="pl-10"
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low border-b border-black/5">
                <th className="py-4 px-6 text-[10px] text-on-surface-variant uppercase tracking-widest font-black">{t('inventory.colDetails')}</th>
                <th className="py-4 px-6 text-[10px] text-on-surface-variant uppercase tracking-widest font-black text-right">{t('inventory.colCurrentStock')}</th>
                <th className="py-4 px-6 text-[10px] text-on-surface-variant uppercase tracking-widest font-black text-center">{t('inventory.colStatus')}</th>
                <th className="py-4 px-6 text-[10px] text-on-surface-variant uppercase tracking-widest font-black text-right">{t('inventory.colQuickUpdate')}</th>
              </tr>
            </thead>
            <tbody>
              {visibleProducts.map((product) => (
                <tr key={product.id} className="group hover:bg-surface-container-low transition-colors border-b border-black/5 last:border-0">
                  <td className="py-4 px-6">
                    <div className="flex items-center gap-4">
                      <ProductThumb src={product.image} className="w-10 h-10 rounded object-cover" alt={product.name} />
                      <div>
                        <p className="text-sm font-bold text-primary">{product.name}</p>
                        <p className="text-[10px] text-on-surface-variant">{product.sku}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-4 px-6 text-right font-bold text-primary">{product.stock}</td>
                  <td className="py-4 px-6 text-center">
                    <span className={cn(
                      "text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-tighter",
                      product.stock > 10 ? "bg-tertiary-container/10 text-on-tertiary-container" : 
                      product.stock > 0 ? "bg-error-container text-on-error-container" : 
                      "bg-surface-container-high text-on-surface-variant"
                    )}>
                      {product.stock > 10
                        ? t('inventory.statusHealthy')
                        : product.stock > 0
                          ? t('inventory.statusCritical')
                          : t('inventory.statusOut')}
                    </span>
                  </td>
                  <td className="py-4 px-6 text-right">
                    <div className="flex justify-end gap-2">
                      <Button 
                        variant="secondary" 
                        size="sm" 
                        className="h-8 w-8 p-0"
                        onClick={() => onUpdateStock(product.id, product.stock + 10)}
                      >
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
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
