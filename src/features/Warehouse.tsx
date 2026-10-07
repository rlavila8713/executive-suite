import { useMemo, useState } from 'react';
import { Plus, Trash2, Edit2, Layers, PackagePlus, Store } from 'lucide-react';
import { Card, Button, Input, Modal } from '../components/ui';
import { ConfirmDeleteModal } from '../components/ConfirmDeleteModal';
import type {
  Product,
  WarehouseMovement,
  WarehouseMovementType,
  WarehouseSection,
  WarehouseStock,
  WarehouseSummaryReport,
} from '../types';
import { rowMatchesSearch } from '../lib/utils';
import { useI18n } from '../i18n/I18nContext';
import { mapMutationError } from '../lib/mutationErrors';
import { usePagination } from '../lib/usePagination';
import { TablePagination } from '../components/TablePagination';
import { StatMetricCard } from '../components/StatMetricCard';
import { WarehouseReceiveDialog, WarehouseTransferDialog } from '../components/WarehouseStockDialogs';

interface WarehouseProps {
  products: Product[];
  sections: WarehouseSection[];
  stock: WarehouseStock[];
  summary: WarehouseSummaryReport | null;
  movements: WarehouseMovement[];
  globalSearch?: string;
  onAddSection: (name: string) => void | Promise<void>;
  onUpdateSection: (id: string, name: string) => void | Promise<void>;
  onDeleteSection: (id: string) => void | Promise<void>;
  onReassignSection: (productId: string, sectionId: string) => void | Promise<void>;
  onReceiveStock: (
    id: string,
    payload: { quantity: number; unitCost: number; price?: number },
  ) => void | Promise<void>;
  onTransferToStore: (productId: string, quantity: number, price: number) => void | Promise<void>;
}

export function Warehouse({
  products,
  sections,
  stock,
  summary,
  movements,
  globalSearch = '',
  onAddSection,
  onUpdateSection,
  onDeleteSection,
  onReassignSection,
  onReceiveStock,
  onTransferToStore,
}: WarehouseProps) {
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const [sectionFilter, setSectionFilter] = useState<string>('all');
  const [sectionModal, setSectionModal] = useState<'add' | WarehouseSection | null>(null);
  const [deletingSection, setDeletingSection] = useState<WarehouseSection | null>(null);
  const [moveRow, setMoveRow] = useState<WarehouseStock | null>(null);
  const [targetSectionId, setTargetSectionId] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [movementType, setMovementType] = useState<'all' | WarehouseMovementType>('all');
  const [movementSearch, setMovementSearch] = useState('');
  const [receiveProduct, setReceiveProduct] = useState<Product | null>(null);
  const [transferProduct, setTransferProduct] = useState<Product | null>(null);

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const stockByProductId = useMemo(() => new Map(stock.map((row) => [row.productId, row])), [stock]);

  const movementTypeLabel = (type: WarehouseMovementType) => {
    switch (type) {
      case 'ENTRY':
        return t('warehouse.movementTypeEntry');
      case 'TRANSFER_TO_STORE':
        return t('warehouse.movementTypeTransfer');
      case 'ADJUSTMENT':
        return t('warehouse.movementTypeAdjustment');
      case 'SECTION_REASSIGN':
        return t('warehouse.movementTypeSection');
      default:
        return type;
    }
  };

  const visibleMovements = useMemo(() => {
    return movements.filter((m) => {
      if (movementType !== 'all' && m.type !== movementType) return false;
      const p = productById.get(m.productId);
      const label = [p?.name, p?.sku, m.type, m.createdBy ?? ''].filter(Boolean).join(' ');
      if (!rowMatchesSearch(movementSearch, [label]) || !rowMatchesSearch(globalSearch, [label])) return false;
      return true;
    });
  }, [movements, movementType, movementSearch, globalSearch, productById]);

  const {
    pageItems: movementPageItems,
    page: movementPage,
    setPage: setMovementPage,
    totalPages: movementTotalPages,
    total: movementTotal,
    pageSize: movementPageSize,
  } = usePagination(visibleMovements);

  const visibleStock = useMemo(() => {
    return products
      .map((p) => {
        const row = stockByProductId.get(p.id);
        return {
          productId: p.id,
          stockRow: row,
          sectionId: row?.sectionId ?? '',
          sectionName: row?.sectionName ?? '—',
          quantity: row?.quantity ?? 0,
          unitCost: row?.quantity ? row.unitCost : p.warehouseCost,
        };
      })
      .filter((entry) => {
        const p = productById.get(entry.productId);
        const label = p ? [p.name, p.sku, entry.sectionName].join(' ') : entry.productId;
        if (!rowMatchesSearch(search, [label]) || !rowMatchesSearch(globalSearch, [label])) return false;
        if (sectionFilter !== 'all' && entry.sectionId !== sectionFilter) return false;
        return true;
      });
  }, [products, stockByProductId, productById, search, globalSearch, sectionFilter]);

  const { pageItems, page, setPage, totalPages, total, pageSize } = usePagination(visibleStock);

  const handleSectionSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);
    const name = (new FormData(e.currentTarget).get('name') as string).trim();
    if (!name) {
      setFormError(t('warehouse.enterSectionName'));
      return;
    }
    setBusy(true);
    try {
      if (sectionModal === 'add') await onAddSection(name);
      else if (sectionModal) await onUpdateSection(sectionModal.id, name);
      setSectionModal(null);
    } catch (err) {
      setFormError(mapMutationError(err, t));
    } finally {
      setBusy(false);
    }
  };

  const handleMove = async () => {
    if (!moveRow || !targetSectionId) return;
    setBusy(true);
    setFormError(null);
    try {
      await onReassignSection(moveRow.productId, targetSectionId);
      setMoveRow(null);
    } catch (err) {
      setFormError(mapMutationError(err, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-primary tracking-tight mb-2 font-headline">
          {t('warehouse.title')}
        </h2>
        <p className="text-on-surface-variant text-sm font-medium">{t('warehouse.subtitle')}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatMetricCard
          label={t('warehouse.valueAtCost')}
          value={`$${(summary?.overall.valueAtCost ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
        />
        <StatMetricCard label={t('warehouse.totalUnits')} value={summary?.overall.units ?? 0} />
        <StatMetricCard label={t('warehouse.skuCount')} value={summary?.overall.productCount ?? 0} />
      </div>

      <Card title={t('warehouse.sectionsTitle')}>
        <div className="flex flex-wrap gap-2 mb-4">
          <Button size="sm" className="gap-1" onClick={() => setSectionModal('add')}>
            <Plus size={14} /> {t('warehouse.addSection')}
          </Button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {sections.map((sec) => {
            const secSummary = summary?.bySection.find((s) => s.sectionId === sec.id);
            return (
              <div
                key={sec.id}
                className="rounded-xl border border-black/5 p-4 bg-surface-container-lowest flex flex-col gap-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Layers size={16} className="text-primary shrink-0" />
                    <span className="font-bold text-sm truncate">{sec.name}</span>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setSectionModal(sec)}>
                      <Edit2 size={14} />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setDeletingSection(sec)}>
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-on-surface-variant">
                  {t('warehouse.sectionStats', {
                    units: secSummary?.units ?? 0,
                    value: (secSummary?.valueAtCost ?? 0).toFixed(2),
                  })}
                </p>
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="p-0 overflow-hidden" title={t('warehouse.stockTitle')}>
        <div className="p-4 border-b border-black/5 flex flex-col sm:flex-row gap-3">
          <Input
            placeholder={t('warehouse.searchStock')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-md"
          />
          <select
            className="rounded-lg border border-black/10 px-3 py-2 text-sm bg-surface-container-lowest"
            value={sectionFilter}
            onChange={(e) => setSectionFilter(e.target.value)}
          >
            <option value="all">{t('warehouse.allSections')}</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-on-surface-variant border-b border-black/5">
                <th className="py-3 px-4">{t('warehouse.colProduct')}</th>
                <th className="py-3 px-4">{t('warehouse.colSection')}</th>
                <th className="py-3 px-4 text-right">{t('warehouse.colQty')}</th>
                <th className="py-3 px-4 text-right">{t('warehouse.colCost')}</th>
                <th className="py-3 px-4 text-right">{t('warehouse.colActions')}</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((entry) => {
                const p = productById.get(entry.productId);
                const row = entry.stockRow;
                return (
                  <tr key={entry.productId} className="border-b border-black/5">
                    <td className="py-3 px-4">
                      <div className="font-medium">{p?.name ?? row?.productName}</div>
                      <div className="text-xs text-on-surface-variant">{p?.sku ?? row?.productSku}</div>
                    </td>
                    <td className="py-3 px-4">{entry.sectionName}</td>
                    <td className="py-3 px-4 text-right font-bold">{entry.quantity}</td>
                    <td className="py-3 px-4 text-right">
                      {entry.quantity > 0 || (p?.warehouseCost ?? 0) > 0
                        ? `$${entry.unitCost.toFixed(2)}`
                        : t('products.costNotSet')}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex justify-end gap-1 flex-wrap">
                        <Button
                          variant="secondary"
                          size="sm"
                          className="gap-1"
                          onClick={() => p && setReceiveProduct(p)}
                        >
                          <PackagePlus size={14} />
                          {t('warehouse.entryButton')}
                        </Button>
                        {entry.quantity > 0 && p ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            className="gap-1"
                            onClick={() => setTransferProduct(p)}
                          >
                            <Store size={14} />
                            {t('warehouse.sendToStoreButton')}
                          </Button>
                        ) : null}
                        {row ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setMoveRow(row);
                              setTargetSectionId(row.sectionId);
                              setFormError(null);
                            }}
                          >
                            {t('warehouse.moveSection')}
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <TablePagination page={page} totalPages={totalPages} total={total} pageSize={pageSize} onPageChange={setPage} />
      </Card>

      <Card className="p-0 overflow-hidden" title={t('warehouse.movementsTitle')} subtitle={t('warehouse.movementsSubtitle')}>
        <div className="p-4 border-b border-black/5 flex flex-col sm:flex-row gap-3">
          <Input
            placeholder={t('warehouse.searchStock')}
            value={movementSearch}
            onChange={(e) => setMovementSearch(e.target.value)}
            className="max-w-md"
          />
          <select
            className="rounded-lg border border-black/10 px-3 py-2 text-sm bg-surface-container-lowest"
            value={movementType}
            onChange={(e) => setMovementType(e.target.value as 'all' | WarehouseMovementType)}
          >
            <option value="all">{t('warehouse.movementFilterAll')}</option>
            <option value="ENTRY">{t('warehouse.movementTypeEntry')}</option>
            <option value="TRANSFER_TO_STORE">{t('warehouse.movementTypeTransfer')}</option>
            <option value="ADJUSTMENT">{t('warehouse.movementTypeAdjustment')}</option>
            <option value="SECTION_REASSIGN">{t('warehouse.movementTypeSection')}</option>
          </select>
        </div>
        {visibleMovements.length === 0 ? (
          <p className="p-6 text-sm text-on-surface-variant text-center">{t('warehouse.movementsEmpty')}</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-on-surface-variant border-b border-black/5">
                    <th className="py-3 px-4">{t('warehouse.colMovementDate')}</th>
                    <th className="py-3 px-4">{t('warehouse.colMovementType')}</th>
                    <th className="py-3 px-4">{t('warehouse.colMovementProduct')}</th>
                    <th className="py-3 px-4 text-right">{t('warehouse.colMovementDelta')}</th>
                    <th className="py-3 px-4 text-right">{t('warehouse.colMovementBalance')}</th>
                    <th className="py-3 px-4">{t('warehouse.colMovementOperator')}</th>
                  </tr>
                </thead>
                <tbody>
                  {movementPageItems.map((m) => {
                    const p = productById.get(m.productId);
                    return (
                      <tr key={m.id} className="border-b border-black/5">
                        <td className="py-3 px-4 text-xs whitespace-nowrap">
                          {new Date(m.createdAt).toLocaleString()}
                        </td>
                        <td className="py-3 px-4">{movementTypeLabel(m.type)}</td>
                        <td className="py-3 px-4">
                          <div className="font-medium">{p?.name ?? m.productId}</div>
                          <div className="text-xs text-on-surface-variant">{p?.sku}</div>
                        </td>
                        <td className="py-3 px-4 text-right font-mono">
                          {m.quantityDelta > 0 ? `+${m.quantityDelta}` : m.quantityDelta}
                        </td>
                        <td className="py-3 px-4 text-right">{m.balanceAfter ?? '—'}</td>
                        <td className="py-3 px-4 text-xs text-on-surface-variant">{m.createdBy ?? '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <TablePagination
              page={movementPage}
              totalPages={movementTotalPages}
              total={movementTotal}
              pageSize={movementPageSize}
              onPageChange={setMovementPage}
            />
          </>
        )}
      </Card>

      <Modal isOpen={sectionModal !== null} onClose={() => setSectionModal(null)} title={sectionModal === 'add' ? t('warehouse.newSection') : t('warehouse.editSection')}>
        <form onSubmit={handleSectionSubmit} className="space-y-4">
          <Input
            name="name"
            defaultValue={sectionModal !== 'add' && sectionModal ? sectionModal.name : ''}
            placeholder={t('warehouse.sectionName')}
            required
          />
          {formError && <p className="text-sm text-error">{formError}</p>}
          <Button type="submit" disabled={busy}>{t('common.save')}</Button>
        </form>
      </Modal>

      <ConfirmDeleteModal
        target={deletingSection}
        title={t('warehouse.deleteSectionTitle')}
        renderMessage={(item) => t('warehouse.deleteSectionBody', { name: item.name })}
        onClose={() => setDeletingSection(null)}
        onDelete={async (id) => {
          await onDeleteSection(id);
          setDeletingSection(null);
        }}
      />

      <WarehouseReceiveDialog
        product={receiveProduct}
        warehouseQty={receiveProduct ? (stockByProductId.get(receiveProduct.id)?.quantity ?? 0) : 0}
        warehouseUnitCost={
          receiveProduct
            ? (stockByProductId.get(receiveProduct.id)?.quantity ?? 0) > 0
              ? (stockByProductId.get(receiveProduct.id)?.unitCost ?? receiveProduct.warehouseCost)
              : receiveProduct.warehouseCost
            : 0
        }
        onClose={() => setReceiveProduct(null)}
        onSubmit={async (payload) => {
          if (!receiveProduct) return;
          await onReceiveStock(receiveProduct.id, payload);
        }}
      />

      <WarehouseTransferDialog
        product={transferProduct}
        warehouseQty={transferProduct ? (stockByProductId.get(transferProduct.id)?.quantity ?? 0) : 0}
        warehouseUnitCost={
          transferProduct
            ? (stockByProductId.get(transferProduct.id)?.unitCost ?? transferProduct.warehouseCost)
            : 0
        }
        onClose={() => setTransferProduct(null)}
        onSubmit={async (payload) => {
          if (!transferProduct) return;
          await onTransferToStore(transferProduct.id, payload.quantity, payload.price);
        }}
      />

      <Modal isOpen={moveRow !== null} onClose={() => setMoveRow(null)} title={t('warehouse.moveSectionTitle')}>
        <div className="space-y-4">
          <select
            className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
            value={targetSectionId}
            onChange={(e) => setTargetSectionId(e.target.value)}
          >
            {sections.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          {formError && <p className="text-sm text-error">{formError}</p>}
          <Button onClick={() => void handleMove()} disabled={busy}>{t('warehouse.moveSectionConfirm')}</Button>
        </div>
      </Modal>
    </div>
  );
}
