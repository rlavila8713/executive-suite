import React, { useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Search,
  Filter,
  Download,
  Edit2,
  Trash2,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { Card, Button, Input, Modal } from '../components/ui';
import { ConfirmDeleteModal } from '../components/ConfirmDeleteModal';
import { mapMutationError } from '../lib/mutationErrors';
import { ImagePicker } from '../components/ImagePicker';
import { ProductThumb } from '../components/ProductThumb';
import { Product, ProductCategory, ProductLocation, ProductSubcategory, ProductStatus, UnitOfMeasure } from '../types';
import { cn, rowMatchesSearch } from '../lib/utils';
import { PLACEHOLDER_PRODUCT_IMAGE } from '../constants';
import { useI18n } from '../i18n/I18nContext';
import { nextSkuFromProducts } from '../lib/sku';
import { downloadCsv } from '../lib/printDocument';
import { computeProductMargin } from '../lib/productMargin';

const STATUSES: ProductStatus[] = ['active', 'inactive', 'pending'];
const UNITS: UnitOfMeasure[] = ['unidad', 'par', 'caja', 'paquete', 'metro', 'kg', 'litro'];

interface ProductsProps {
  products: Product[];
  productCategories: ProductCategory[];
  productSubcategories: ProductSubcategory[];
  productLocations: ProductLocation[];
  globalSearch?: string;
  onAdd: (product: Omit<Product, 'id'>) => void | Promise<void>;
  onUpdate: (id: string, updates: Partial<Product>) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
  onFetchNextSku?: (categoryId: string, subcategoryId: string) => Promise<string>;
}

export function Products({
  products,
  productCategories,
  productSubcategories,
  productLocations,
  globalSearch = '',
  onAdd,
  onUpdate,
  onDelete,
  onFetchNextSku,
}: ProductsProps) {
  const { t } = useI18n();
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);
  const [productImage, setProductImage] = useState<string>(PLACEHOLDER_PRODUCT_IMAGE);
  const [categoryId, setCategoryId] = useState('');
  const [subcategoryId, setSubcategoryId] = useState('');
  const [sku, setSku] = useState('');
  const [status, setStatus] = useState<ProductStatus>('active');
  const [unitOfMeasure, setUnitOfMeasure] = useState<UnitOfMeasure>('unidad');
  const [locationId, setLocationId] = useState<string>('');
  const [priceInput, setPriceInput] = useState('');
  const [costInput, setCostInput] = useState('');

  useEffect(() => {
    if (!isModalOpen) return;
    setProductImage(editingProduct?.image ?? PLACEHOLDER_PRODUCT_IMAGE);
    setCategoryId(editingProduct?.categoryId ?? '');
    setSubcategoryId(editingProduct?.subcategoryId ?? '');
    setSku(editingProduct?.sku ?? '');
    setStatus(editingProduct?.status ?? 'active');
    setUnitOfMeasure(editingProduct?.unitOfMeasure ?? 'unidad');
    setLocationId(editingProduct?.locationId ?? '');
    setPriceInput(editingProduct != null ? String(editingProduct.price) : '');
    setCostInput('');
  }, [isModalOpen, editingProduct]);

  const marginPreview = useMemo(() => {
    const price = parseFloat(priceInput.replace(',', '.'));
    const cost = editingProduct ? editingProduct.cost : parseFloat(costInput.replace(',', '.'));
    if (!Number.isFinite(price) || priceInput.trim() === '') return null;
    if (!editingProduct && costInput.trim() === '') return null;
    if (!Number.isFinite(cost)) return null;
    return computeProductMargin(price, cost);
  }, [priceInput, costInput, editingProduct]);

  const categoryOptions = [...productCategories].sort((a, b) => a.name.localeCompare(b.name));
  const subsForCategory = useMemo(
    () => productSubcategories.filter((s) => s.categoryId === categoryId).sort((a, b) => a.name.localeCompare(b.name)),
    [productSubcategories, categoryId],
  );
  const selectedCategory = categoryOptions.find((c) => c.id === categoryId);
  const selectedSubcategory = subsForCategory.find((s) => s.id === subcategoryId);

  const filteredProducts = products.filter(
    (p) =>
      rowMatchesSearch(searchTerm, [p.name, p.sku, p.category, p.subcategory, p.barcode ?? '', String(p.price), String(p.cost)]) &&
      rowMatchesSearch(globalSearch, [p.name, p.sku, p.category, p.subcategory, p.barcode ?? '', String(p.price), String(p.cost)]),
  );

  const suggestSku = async () => {
    if (!selectedCategory || !selectedSubcategory) return;
    if (onFetchNextSku) {
      const next = await onFetchNextSku(selectedCategory.id, selectedSubcategory.id);
      setSku(next);
      return;
    }
    setSku(nextSkuFromProducts(products, selectedCategory, selectedSubcategory));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const cat = selectedCategory;
    const sub = selectedSubcategory;
    const productData = {
      name: formData.get('name') as string,
      sku: (formData.get('sku') as string) || sku,
      category: cat?.name ?? (formData.get('category') as string),
      price: parseFloat(priceInput.replace(',', '.')),
      cost: editingProduct ? editingProduct.cost : parseFloat(costInput.replace(',', '.')),
      stock: editingProduct ? editingProduct.stock : parseInt(formData.get('stock') as string, 10),
      image: productImage,
      categoryId: categoryId,
      subcategoryId: subcategoryId,
      subcategory: sub?.name ?? '',
      status,
      unitOfMeasure,
      locationId: locationId || null,
      barcode: ((formData.get('barcode') as string) || '').trim() || null,
    };

    if (editingProduct) {
      const { cost: _c, stock: _s, ...catalogUpdates } = productData;
      await onUpdate(editingProduct.id, catalogUpdates);
    } else {
      await onAdd(productData);
    }
    setIsModalOpen(false);
    setEditingProduct(null);
  };

  const selectClass =
    'w-full rounded-lg border border-black/10 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-primary/30';

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-end">
        <div className="min-w-0">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-primary tracking-tight mb-2 font-headline">{t('products.title')}</h2>
          <p className="text-on-surface-variant text-sm font-medium">{t('products.subtitle')}</p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <Button variant="secondary" className="flex items-center gap-2">
            <Filter size={16} /> {t('products.filter')}
          </Button>
          <Button
            variant="secondary"
            className="flex items-center gap-2"
            onClick={() =>
              downloadCsv(
                `productos-${new Date().toISOString().slice(0, 10)}.csv`,
                ['name', 'sku', 'category', 'subcategory', 'price', 'cost', 'stock', 'status'],
                filteredProducts.map((p) => [
                  p.name,
                  p.sku,
                  p.category,
                  p.subcategory,
                  p.price,
                  p.cost,
                  p.stock,
                  p.status,
                ]),
              )
            }
          >
            <Download size={16} /> {t('products.export')}
          </Button>
          <Button
            onClick={() => {
              setEditingProduct(null);
              setIsModalOpen(true);
            }}
            className="flex items-center gap-2"
          >
            <Plus size={16} /> {t('products.addProduct')}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="h-32 flex flex-col justify-between hover:shadow-xl transition-all">
          <span className="text-[10px] text-on-surface-variant uppercase tracking-widest font-bold">{t('products.totalProducts')}</span>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-primary">{products.length}</span>
          </div>
        </Card>
        <Card className="h-32 flex flex-col justify-between hover:shadow-xl transition-all">
          <span className="text-[10px] text-on-surface-variant uppercase tracking-widest font-bold">{t('products.inventoryValue')}</span>
          <span className="text-3xl font-extrabold text-primary">
            ${products.reduce((acc, p) => acc + p.price * p.stock, 0).toLocaleString()}
          </span>
        </Card>
        <Card className="h-32 flex flex-col justify-between hover:shadow-xl transition-all">
          <span className="text-[10px] text-on-surface-variant uppercase tracking-widest font-bold">{t('products.lowStockAlerts')}</span>
          <div className="flex items-center gap-2">
            <span className="text-3xl font-extrabold text-error">{products.filter((p) => p.stock <= 5).length}</span>
            <AlertCircle className="text-error" size={20} />
          </div>
        </Card>
        <div className="bg-primary p-6 rounded-xl flex flex-col justify-between h-32 text-white shadow-lg">
          <span className="text-[10px] opacity-70 uppercase tracking-widest font-bold">{t('products.activeCount')}</span>
          <span className="text-3xl font-extrabold">{products.filter((p) => p.status === 'active').length}</span>
        </div>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="p-6 border-b border-black/5 flex justify-between items-center bg-surface-container-low">
          <div className="relative w-full max-w-md min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <Input
              placeholder={t('products.searchPlaceholder')}
              className="pl-10"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low border-b border-black/5">
                <th className="py-4 px-6 text-[10px] text-on-surface-variant uppercase tracking-widest font-black">{t('products.colName')}</th>
                <th className="py-4 px-6 text-[10px] text-on-surface-variant uppercase tracking-widest font-black text-right">{t('products.colCategory')}</th>
                <th className="py-4 px-6 text-[10px] text-on-surface-variant uppercase tracking-widest font-black text-right">{t('products.colSubcategory')}</th>
                <th className="py-4 px-6 text-[10px] text-on-surface-variant uppercase tracking-widest font-black text-right">{t('products.colPrice')}</th>
                <th className="py-4 px-6 text-[10px] text-on-surface-variant uppercase tracking-widest font-black text-center">{t('products.colStock')}</th>
                <th className="py-4 px-6 text-[10px] text-on-surface-variant uppercase tracking-widest font-black text-right">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((product) => (
                <tr key={product.id} className="group hover:bg-surface-container-low transition-colors border-b border-black/5 last:border-0">
                  <td className="py-4 px-6">
                    <div className="flex items-center gap-4">
                      <ProductThumb src={product.image} alt={product.name} className="w-12 h-12 rounded-lg object-cover" />
                      <div>
                        <p className="font-bold text-primary">{product.name}</p>
                        <p className="text-xs text-on-surface-variant">{t('common.sku')}: {product.sku}</p>
                        {product.status !== 'active' ? (
                          <span className="text-[10px] uppercase font-bold text-error">{t(`products.status.${product.status}`)}</span>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td className="py-4 px-6 text-right text-sm font-medium text-secondary">{product.category}</td>
                  <td className="py-4 px-6 text-right text-sm text-on-surface-variant">{product.subcategory || '—'}</td>
                  <td className="py-4 px-6 text-right text-sm font-bold text-primary">${product.price.toFixed(2)}</td>
                  <td className="py-4 px-6 text-center">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider',
                        product.stock > 10
                          ? 'bg-tertiary-container/10 text-on-tertiary-container'
                          : product.stock > 0
                            ? 'bg-error-container text-on-error-container'
                            : 'bg-surface-container-high text-on-surface-variant',
                      )}
                    >
                      {product.stock > 10 ? t('products.inStock', { count: product.stock }) : product.stock > 0 ? t('products.lowStock', { count: product.stock }) : t('products.outOfStock')}
                    </span>
                  </td>
                  <td className="py-4 px-6 text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => { setEditingProduct(product); setIsModalOpen(true); }}>
                        <Edit2 size={14} />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-error hover:bg-error/10"
                        onClick={() => setDeletingProduct(product)}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-8 py-6 flex justify-between items-center bg-surface-container-low border-t border-black/5">
          <span className="text-xs text-on-surface-variant font-medium">{t('products.showingEntries', { count: filteredProducts.length })}</span>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm"><ChevronLeft size={16} /></Button>
            <Button size="sm" className="w-8 h-8 p-0">1</Button>
            <Button variant="ghost" size="sm"><ChevronRight size={16} /></Button>
          </div>
        </div>
      </Card>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingProduct ? t('products.editProduct') : t('products.addProductTitle')}>
        <form key={editingProduct?.id ?? 'new'} onSubmit={handleSubmit} className="space-y-5">
          <ImagePicker value={productImage} onChange={setProductImage} compact />
          <div className="space-y-1">
            <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">{t('products.productName')}</label>
            <Input name="name" defaultValue={editingProduct?.name} required />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">{t('products.category')}</label>
              <select
                required
                value={categoryId}
                onChange={(e) => {
                  setCategoryId(e.target.value);
                  setSubcategoryId('');
                }}
                className={selectClass}
              >
                <option value="" disabled>{t('products.selectCategory')}</option>
                {categoryOptions.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">{t('products.subcategory')}</label>
              <select required value={subcategoryId} onChange={(e) => setSubcategoryId(e.target.value)} className={selectClass}>
                <option value="" disabled>{t('products.selectSubcategory')}</option>
                {subsForCategory.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-2 items-end">
            <div className="flex-1 space-y-1">
              <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">{t('common.sku')}</label>
              <Input name="sku" value={sku} onChange={(e) => setSku(e.target.value)} required />
            </div>
            {!editingProduct ? (
              <Button type="button" variant="secondary" onClick={() => void suggestSku()} disabled={!categoryId || !subcategoryId}>
                <RefreshCw size={14} className="mr-1" /> {t('products.generateSku')}
              </Button>
            ) : null}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">{t('products.statusLabel')}</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as ProductStatus)} className={selectClass}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{t(`products.status.${s}`)}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">{t('products.unitOfMeasure')}</label>
              <select value={unitOfMeasure} onChange={(e) => setUnitOfMeasure(e.target.value as UnitOfMeasure)} className={selectClass}>
                {UNITS.map((u) => (
                  <option key={u} value={u}>{t(`products.units.${u}`)}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">{t('products.location')}</label>
              <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className={selectClass}>
                <option value="">{t('products.noLocation')}</option>
                {productLocations.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">{t('products.barcode')}</label>
            <Input name="barcode" defaultValue={editingProduct?.barcode ?? ''} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">{t('products.price')}</label>
              <Input
                name="price"
                type="number"
                step="0.01"
                value={priceInput}
                onChange={(e) => setPriceInput(e.target.value)}
                required
              />
            </div>
            {editingProduct ? (
              <>
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">{t('products.weightedCost')}</label>
                  <Input value={editingProduct.cost.toFixed(2)} readOnly className="opacity-80" />
                  <p className="text-[10px] text-on-surface-variant">{t('products.weightedCostHint')}</p>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">{t('products.stock')}</label>
                  <Input value={String(editingProduct.stock)} readOnly className="opacity-80" />
                  <p className="text-[10px] text-on-surface-variant">{t('products.stockEditHint')}</p>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">{t('products.cost')}</label>
                  <Input
                    name="cost"
                    type="number"
                    step="0.01"
                    value={costInput}
                    onChange={(e) => setCostInput(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">{t('products.stock')}</label>
                  <Input name="stock" type="number" defaultValue={0} required />
                </div>
              </>
            )}
          </div>
          {marginPreview ? (
            <div
              className={cn(
                'rounded-xl px-4 py-3 text-sm font-bold border',
                marginPreview.isProfit
                  ? 'bg-tertiary-container/15 border-tertiary-container/40 text-on-tertiary-container'
                  : 'bg-error-container/30 border-error/30 text-on-error-container',
              )}
            >
              {marginPreview.isProfit
                ? t('products.profitBanner', {
                    amount: marginPreview.profitPerUnit.toFixed(2),
                    margin: marginPreview.marginPercent.toFixed(2),
                  })
                : t('products.lossBanner', {
                    amount: Math.abs(marginPreview.profitPerUnit).toFixed(2),
                    margin: marginPreview.marginPercent.toFixed(2),
                  })}
            </div>
          ) : null}
          <div className="pt-4 flex gap-3">
            <Button type="button" variant="secondary" className="flex-1" onClick={() => setIsModalOpen(false)}>{t('common.cancel')}</Button>
            <Button type="submit" className="flex-1">{t('products.saveProduct')}</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDeleteModal
        target={deletingProduct}
        title={t('products.deleteTitle')}
        renderMessage={(p) => t('products.deleteBody', { name: p.name, sku: p.sku })}
        onClose={() => setDeletingProduct(null)}
        onDelete={onDelete}
        mapError={(err) => mapMutationError(err, t)}
      />
    </div>
  );
}
