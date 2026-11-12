import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Package,
  RefreshCw,
  Search,
  SendHorizontal,
  Truck,
  Users,
} from 'lucide-react';
import { Card, Button, Input, Modal } from '../components/ui';
import { TablePagination } from '../components/TablePagination';
import type {
  Product,
  PurchaseLine,
  PurchaseLineReview,
  PurchaseOrder,
  Supplier,
  WarehouseSection,
} from '../types';
import { api } from '../api/client';
import { useI18n, type TranslateFn } from '../i18n/I18nContext';
import { usePagination } from '../lib/usePagination';
import { mapMutationError } from '../lib/mutationErrors';
import { rowMatchesSearch } from '../lib/utils';

function formatMoney(n: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

function StatusPill({ variant, children }: { variant: 'default' | 'warning' | 'success' | 'muted'; children: React.ReactNode }) {
  const cls =
    variant === 'warning'
      ? 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100'
      : variant === 'success'
        ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100'
        : variant === 'muted'
          ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
          : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200';
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{children}</span>;
}
import { useAuth } from '../auth/AuthContext';

type LineDecision = {
  action: 'receive' | 'skip';
  confirmed: boolean;
  productId: string | null;
  createProduct: boolean;
  unitCost: number;
};

interface PurchasesProps {
  products: Product[];
  warehouseSections: WarehouseSection[];
  globalSearch?: string;
  currency: string;
  onAfterReceive: () => void | Promise<void>;
}

function formatPurchaseDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function statusBadgeVariant(status: PurchaseOrder['status']): 'default' | 'warning' | 'success' | 'muted' {
  if (status === 'pending_review') return 'warning';
  if (status === 'posted') return 'success';
  if (status === 'cancelled') return 'muted';
  return 'default';
}

export function Purchases({
  products,
  warehouseSections,
  globalSearch = '',
  currency,
  onAfterReceive,
}: PurchasesProps) {
  const { t } = useI18n();
  const { access } = useAuth();
  const canReceive = access?.permissions.includes('warehouse.receive') ?? false;
  const canCatalogEdit = access?.permissions.includes('catalog.edit') ?? false;

  const [purchases, setPurchases] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending_review' | 'draft' | 'posted'>('pending_review');
  const [searchTerm, setSearchTerm] = useState('');
  const [suppliersOpen, setSuppliersOpen] = useState(false);
  const [reviewPurchase, setReviewPurchase] = useState<PurchaseOrder | null>(null);
  const [reviewLines, setReviewLines] = useState<PurchaseLineReview[]>([]);
  const [decisions, setDecisions] = useState<Record<string, LineDecision>>({});
  const [sectionId, setSectionId] = useState('');
  const [reviewLoading, setReviewLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [expandedPurchaseId, setExpandedPurchaseId] = useState<string | null>(null);
  const [submittingReviewId, setSubmittingReviewId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [p, s] = await Promise.all([api.getPurchases(), api.getSuppliers()]);
      setPurchases(p);
      setSuppliers(s);
    } catch (err) {
      setError(mapMutationError(err, t));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const filtered = useMemo(() => {
    return purchases.filter((p) => {
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      const hay = [
        p.supplierName,
        p.invoiceNumber,
        p.notes,
        ...p.lines.map((l) => `${l.name} ${l.barcode}`),
      ];
      return (
        rowMatchesSearch(searchTerm, hay) &&
        rowMatchesSearch(globalSearch, hay)
      );
    });
  }, [purchases, statusFilter, searchTerm, globalSearch]);

  const { pageItems, page, setPage, totalPages, total, pageSize } = usePagination(filtered);

  const submitForReview = async (purchase: PurchaseOrder) => {
    setSubmittingReviewId(purchase.id);
    setError(null);
    try {
      const updated = await api.submitPurchaseForReview(purchase.id);
      setPurchases((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
    } catch (err) {
      setError(mapMutationError(err, t));
    } finally {
      setSubmittingReviewId(null);
    }
  };

  const toggleExpanded = (purchaseId: string) => {
    setExpandedPurchaseId((prev) => (prev === purchaseId ? null : purchaseId));
  };

  const openReview = async (purchase: PurchaseOrder) => {
    if (!canReceive || purchase.status !== 'pending_review') return;
    setReviewPurchase(purchase);
    setReviewLoading(true);
    setError(null);
    try {
      const review = await api.getPurchaseWarehouseReview(purchase.id);
      setReviewLines(review.lines);
      const next: Record<string, LineDecision> = {};
      for (const line of review.lines) {
        next[line.lineId] = {
          action: 'receive',
          confirmed: !line.needsReview,
          productId: line.resolvedProductId,
          createProduct: line.kind === 'new_product' && !line.resolvedProductId,
          unitCost: line.unitCost,
        };
      }
      setDecisions(next);
      setSectionId(warehouseSections[0]?.id ?? '');
    } catch (err) {
      setError(mapMutationError(err, t));
      setReviewPurchase(null);
    } finally {
      setReviewLoading(false);
    }
  };

  const confirmReceive = async () => {
    if (!reviewPurchase) return;
    setSubmitting(true);
    setError(null);
    try {
      const lines = reviewLines.map((line) => {
        const d = decisions[line.lineId];
        return {
          lineId: line.lineId,
          action: d?.action ?? 'receive',
          productId: d?.productId ?? line.resolvedProductId,
          createProduct: d?.createProduct === true,
          unitCost: d?.unitCost ?? line.unitCost,
          confirmed: d?.confirmed === true,
        };
      });
      await api.receivePurchaseToWarehouse(reviewPurchase.id, {
        sectionId: sectionId || null,
        lines,
      });
      setReviewPurchase(null);
      await reload();
      await onAfterReceive();
    } catch (err) {
      setError(mapMutationError(err, t));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{t('purchases.title')}</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">{t('purchases.subtitle')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={() => setSuppliersOpen(true)}>
            <Users className="h-4 w-4" />
            {t('purchases.suppliers')}
          </Button>
          <Button type="button" variant="secondary" onClick={() => void reload()}>
            <RefreshCw className="h-4 w-4" />
            {t('purchases.reload')}
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </div>
      ) : null}

      <Card className="p-4">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              className="pl-9"
              placeholder={t('purchases.searchPlaceholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <select
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          >
            <option value="pending_review">{t('purchases.filterPendingReview')}</option>
            <option value="draft">{t('purchases.filterDraft')}</option>
            <option value="posted">{t('purchases.filterPosted')}</option>
            <option value="all">{t('purchases.filterAll')}</option>
          </select>
        </div>

        {loading ? (
          <p className="py-8 text-center text-sm text-slate-500">{t('purchases.loading')}</p>
        ) : pageItems.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">{t('purchases.empty')}</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-700">
                    <th className="w-10 pb-2 font-medium" aria-label={t('purchases.expandDetail')} />
                    <th className="pb-2 font-medium">{t('purchases.colDate')}</th>
                    <th className="pb-2 font-medium">{t('purchases.colSupplier')}</th>
                    <th className="pb-2 font-medium">{t('purchases.colInvoice')}</th>
                    <th className="pb-2 font-medium">{t('purchases.colLines')}</th>
                    <th className="pb-2 font-medium">{t('purchases.colTotal')}</th>
                    <th className="pb-2 font-medium">{t('purchases.colStatus')}</th>
                    <th className="pb-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((p) => {
                    const expanded = expandedPurchaseId === p.id;
                    return (
                      <Fragment key={p.id}>
                        <tr className="border-b border-slate-100 dark:border-slate-800">
                          <td className="py-3">
                            <button
                              type="button"
                              className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                              aria-expanded={expanded}
                              aria-label={
                                expanded ? t('purchases.collapseDetail') : t('purchases.expandDetail')
                              }
                              onClick={() => toggleExpanded(p.id)}
                            >
                              {expanded ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </button>
                          </td>
                          <td className="py-3">{formatPurchaseDate(p.purchasedAt)}</td>
                          <td className="py-3">{p.supplierName || '—'}</td>
                          <td className="py-3">{p.invoiceNumber || '—'}</td>
                          <td className="py-3">{p.lines.length}</td>
                          <td className="py-3 font-medium">{formatMoney(p.totalCost, currency)}</td>
                          <td className="py-3">
                            <StatusPill variant={statusBadgeVariant(p.status)}>
                              {t(`purchases.status.${p.status}`)}
                            </StatusPill>
                          </td>
                          <td className="py-3 text-right">
                            <div className="flex flex-wrap justify-end gap-2">
                              {p.status === 'draft' && canCatalogEdit ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="secondary"
                                  disabled={submittingReviewId === p.id}
                                  onClick={() => void submitForReview(p)}
                                >
                                  <SendHorizontal className="h-4 w-4" />
                                  {submittingReviewId === p.id
                                    ? t('purchases.submittingReview')
                                    : t('purchases.submitReview')}
                                </Button>
                              ) : null}
                              {p.status === 'pending_review' && canReceive ? (
                                <Button type="button" size="sm" onClick={() => void openReview(p)}>
                                  <ClipboardCheck className="h-4 w-4" />
                                  {t('purchases.reviewReceive')}
                                </Button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                        {expanded ? (
                          <tr className="border-b border-slate-100 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-900/40">
                            <td colSpan={8} className="px-4 py-3">
                              <PurchaseOrderDetail
                                purchase={p}
                                products={products}
                                currency={currency}
                                t={t}
                              />
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <TablePagination
              page={page}
              totalPages={totalPages}
              total={total}
              pageSize={pageSize}
              onPageChange={setPage}
            />
          </>
        )}
      </Card>

      <SuppliersModal
        open={suppliersOpen}
        onClose={() => setSuppliersOpen(false)}
        suppliers={suppliers}
        onChanged={() => void reload()}
      />

      <Modal
        isOpen={reviewPurchase != null}
        onClose={() => !submitting && setReviewPurchase(null)}
        title={t('purchases.reviewModalTitle')}
        size="large"
      >
        {reviewLoading ? (
          <p className="py-6 text-center text-sm text-slate-500">{t('common.loading')}</p>
        ) : reviewPurchase ? (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-3 text-sm text-slate-600 dark:text-slate-300">
              <span>
                <Truck className="mr-1 inline h-4 w-4" />
                {reviewPurchase.supplierName || t('purchases.noSupplier')}
              </span>
              <span>{formatMoney(reviewPurchase.totalCost, currency)}</span>
              <span>{reviewPurchase.lines.length} {t('purchases.lines')}</span>
            </div>

            {warehouseSections.length > 0 ? (
              <label className="block text-sm">
                <span className="mb-1 block font-medium">{t('purchases.section')}</span>
                <select
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
                  value={sectionId}
                  onChange={(e) => setSectionId(e.target.value)}
                >
                  {warehouseSections.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <div className="max-h-[50vh] space-y-3 overflow-y-auto pr-1">
              {reviewLines.map((line) => {
                const d = decisions[line.lineId];
                const reasonLabel =
                  line.reviewReason === 'cost_ponderation'
                    ? t('purchases.reasonCost')
                    : line.reviewReason === 'new_product'
                      ? t('purchases.reasonNew')
                      : line.reviewReason === 'unlinked'
                        ? t('purchases.reasonUnlinked')
                        : null;
                return (
                  <ProductReviewLine
                    key={line.lineId}
                    line={line}
                    decision={d}
                    products={products}
                    currency={currency}
                    reasonLabel={reasonLabel}
                    t={t}
                    onChange={(patch) =>
                      setDecisions((prev) => ({
                        ...prev,
                        [line.lineId]: { ...prev[line.lineId], ...patch },
                      }))
                    }
                  />
                );
              })}
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-700">
              <Button type="button" variant="secondary" disabled={submitting} onClick={() => setReviewPurchase(null)}>
                {t('common.cancel')}
              </Button>
              <Button type="button" disabled={submitting} onClick={() => void confirmReceive()}>
                <CheckCircle2 className="h-4 w-4" />
                {submitting ? t('purchases.submitting') : t('purchases.authorizeReceive')}
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

function productLabel(line: PurchaseLine, products: Product[]): string {
  if (line.productId) {
    const prod = products.find((x) => x.id === line.productId);
    if (prod) return `${prod.name} (${prod.sku})`;
  }
  return line.name;
}

function PurchaseOrderDetail({
  purchase,
  products,
  currency,
  t,
}: {
  purchase: PurchaseOrder;
  products: Product[];
  currency: string;
  t: TranslateFn;
}) {
  return (
    <div className="space-y-3">
      {purchase.notes?.trim() ? (
        <p className="text-sm text-slate-600 dark:text-slate-300">
          <span className="font-medium text-slate-700 dark:text-slate-200">
            {t('purchases.notesLabel')}:
          </span>{' '}
          {purchase.notes}
        </p>
      ) : null}
      <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-900">
              <th className="px-3 py-2 font-medium">{t('purchases.colProduct')}</th>
              <th className="px-3 py-2 font-medium">{t('purchases.colBarcode')}</th>
              <th className="px-3 py-2 font-medium">{t('purchases.colQty')}</th>
              <th className="px-3 py-2 font-medium">{t('purchases.colUnitCost')}</th>
              <th className="px-3 py-2 text-right font-medium">{t('purchases.colLineTotal')}</th>
            </tr>
          </thead>
          <tbody>
            {purchase.lines.map((line) => (
              <tr key={line.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                <td className="px-3 py-2 font-medium text-slate-900 dark:text-slate-100">
                  {productLabel(line, products)}
                </td>
                <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{line.barcode || '—'}</td>
                <td className="px-3 py-2">
                  {line.quantity} {line.unitOfMeasure}
                </td>
                <td className="px-3 py-2">{formatMoney(line.unitCost, currency)}</td>
                <td className="px-3 py-2 text-right font-medium">
                  {formatMoney(line.quantity * line.unitCost, currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProductReviewLine({
  line,
  decision,
  products,
  currency,
  reasonLabel,
  t,
  onChange,
}: {
  line: PurchaseLineReview;
  decision: LineDecision | undefined;
  products: Product[];
  currency: string;
  reasonLabel: string | null;
  t: TranslateFn;
  onChange: (patch: Partial<LineDecision>) => void;
}) {
  const border =
    line.needsReview && !decision?.confirmed
      ? 'border-amber-300 bg-amber-50/80 dark:border-amber-800 dark:bg-amber-950/30'
      : 'border-slate-200 dark:border-slate-700';

  return (
    <div className={`rounded-lg border p-3 ${border}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium text-slate-900 dark:text-slate-100">{line.lineName}</p>
          <p className="text-xs text-slate-500">
            {line.receiveQuantity} × {formatMoney(line.unitCost, currency)} · {line.unitOfMeasure}
            {line.barcode ? ` · ${line.barcode}` : ''}
          </p>
        </div>
        {line.needsReview ? (
          <StatusPill variant="warning">
            <AlertTriangle className="mr-1 inline h-3 w-3" />
            {t('purchases.needsReview')}
          </StatusPill>
        ) : (
          <StatusPill variant="success">{t('purchases.ready')}</StatusPill>
        )}
      </div>

      {reasonLabel ? <p className="mt-2 text-xs text-amber-800 dark:text-amber-200">{reasonLabel}</p> : null}

      {line.reviewReason === 'cost_ponderation' ? (
        <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
          {t('purchases.costPreview', {
            current: formatMoney(line.currentWarehouseUnitCost, currency),
            projected: formatMoney(line.projectedWarehouseUnitCost, currency),
            qty: String(line.currentWarehouseQty),
          })}
        </p>
      ) : null}

      {(line.kind === 'new_product' || line.kind === 'missing_product' || !line.resolvedProductId) && (
        <label className="mt-2 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={decision?.createProduct === true}
            onChange={(e) => onChange({ createProduct: e.target.checked, productId: null })}
          />
          {t('purchases.createProduct')}
        </label>
      )}

      {!decision?.createProduct && (
        <label className="mt-2 block text-sm">
          <span className="mb-1 block text-slate-600 dark:text-slate-400">{t('purchases.linkProduct')}</span>
          <select
            className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
            value={decision?.productId ?? line.resolvedProductId ?? ''}
            onChange={(e) => onChange({ productId: e.target.value || null, createProduct: false })}
          >
            <option value="">{t('purchases.selectProduct')}</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.sku})
              </option>
            ))}
          </select>
        </label>
      )}

      {line.needsReview ? (
        <label className="mt-3 flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={decision?.confirmed === true}
            onChange={(e) => onChange({ confirmed: e.target.checked })}
          />
          {t('purchases.confirmLine')}
        </label>
      ) : null}
    </div>
  );
}

function SuppliersModal({
  open,
  onClose,
  suppliers,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  suppliers: Supplier[];
  onChanged: () => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await api.createSupplier({ id: crypto.randomUUID(), name: name.trim(), address, phone });
      setName('');
      setAddress('');
      setPhone('');
      onChanged();
    } catch (err) {
      setError(mapMutationError(err, t));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={open} onClose={onClose} title={t('purchases.suppliers')} size="large">
      <form onSubmit={(e) => void handleAdd(e)} className="mb-4 grid gap-2 sm:grid-cols-3">
        <Input placeholder={t('purchases.supplierName')} value={name} onChange={(e) => setName(e.target.value)} />
        <Input placeholder={t('purchases.supplierAddress')} value={address} onChange={(e) => setAddress(e.target.value)} />
        <Input placeholder={t('purchases.supplierPhone')} value={phone} onChange={(e) => setPhone(e.target.value)} />
        <Button type="submit" className="sm:col-span-3" disabled={saving}>
          <Package className="h-4 w-4" />
          {t('purchases.addSupplier')}
        </Button>
      </form>
      {error ? <p className="mb-2 text-sm text-red-600">{error}</p> : null}
      <ul className="max-h-64 space-y-2 overflow-y-auto text-sm">
        {suppliers.map((s) => (
          <li key={s.id} className="rounded border border-slate-200 px-3 py-2 dark:border-slate-700">
            <p className="font-medium">{s.name}</p>
            {(s.phone || s.address) && (
              <p className="text-xs text-slate-500">
                {[s.phone, s.address].filter(Boolean).join(' · ')}
              </p>
            )}
          </li>
        ))}
      </ul>
    </Modal>
  );
}
