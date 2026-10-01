import { useEffect, useMemo, useState } from 'react';
import { Button, Input, Modal } from './ui';
import type { Product } from '../types';
import { computeWeightedAverageCost } from '../lib/inventoryCost';
import { mapMutationError } from '../lib/mutationErrors';
import { useI18n } from '../i18n/I18nContext';

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

type ReceiveDialogProps = {
  product: Product | null;
  warehouseQty: number;
  warehouseUnitCost: number;
  onClose: () => void;
  onSubmit: (payload: { quantity: number; unitCost: number; price?: number }) => Promise<void>;
};

export function WarehouseReceiveDialog({ product, warehouseQty, warehouseUnitCost, onClose, onSubmit }: ReceiveDialogProps) {
  const { t } = useI18n();
  const [quantityInput, setQuantityInput] = useState('');
  const [unitCostInput, setUnitCostInput] = useState('');
  const [priceInput, setPriceInput] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!product) return;
    setQuantityInput('');
    setUnitCostInput('');
    setPriceInput(product.price > 0 ? String(product.price) : '');
    setMsg(null);
  }, [product]);

  const preview = useMemo(() => {
    if (!product) return null;
    const qty = parsePositiveInt(quantityInput);
    const unitCost = parsePositiveNumber(unitCostInput);
    if (qty == null || unitCost == null) return null;
    const base = warehouseQty > 0 ? warehouseUnitCost : 0;
    return {
      newWarehouseQty: warehouseQty + qty,
      newWarehouseCost: computeWeightedAverageCost(warehouseQty, base, qty, unitCost),
    };
  }, [product, quantityInput, unitCostInput, warehouseQty, warehouseUnitCost]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!product) return;
    const quantity = parsePositiveInt(quantityInput);
    const unitCost = parsePositiveNumber(unitCostInput);
    const priceParsed = priceInput.trim() === '' ? 0 : parsePositiveNumber(priceInput);
    if (quantity == null) {
      setMsg(t('inventory.receiveInvalidQty'));
      return;
    }
    if (unitCost == null) {
      setMsg(t('inventory.receiveInvalidCost'));
      return;
    }
    if (priceParsed == null) {
      setMsg(t('inventory.receiveInvalidPrice'));
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      await onSubmit({
        quantity,
        unitCost,
        ...(priceParsed > 0 ? { price: priceParsed } : {}),
      });
      onClose();
    } catch (err) {
      setMsg(mapMutationError(err, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal isOpen={product != null} onClose={() => !busy && onClose()} title={t('warehouse.entryTitle')}>
      {product ? (
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div className="rounded-xl bg-surface-container-low p-4 text-sm space-y-2">
            <p className="font-bold text-primary">{product.name}</p>
            <p className="text-xs text-on-surface-variant">{product.sku}</p>
            <div className="grid grid-cols-2 gap-2 pt-2">
              <div>
                <p className="text-[10px] uppercase font-bold text-on-surface-variant">{t('warehouse.colQty')}</p>
                <p className="font-bold">{warehouseQty}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold text-on-surface-variant">{t('products.warehouseCost')}</p>
                <p className="font-bold">
                  {warehouseQty > 0 || product.warehouseCost > 0
                    ? `$${warehouseUnitCost.toFixed(2)}`
                    : t('products.costNotSet')}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold text-on-surface-variant">{t('products.storeCost')}</p>
                <p className="font-bold">
                  {product.stock > 0 || product.cost > 0 ? `$${product.cost.toFixed(2)}` : t('products.costNotSet')}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold text-on-surface-variant">{t('inventory.colCurrentStock')}</p>
                <p className="font-bold">{product.stock}</p>
              </div>
            </div>
          </div>
          <p className="text-xs text-on-surface-variant">{t('warehouse.entryHelp')}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold uppercase text-on-surface-variant">{t('inventory.receiveQty')}</label>
              <Input type="number" min={1} value={quantityInput} onChange={(e) => setQuantityInput(e.target.value)} required className="mt-1" />
            </div>
            <div>
              <label className="text-xs font-bold uppercase text-on-surface-variant">{t('inventory.receiveUnitCost')}</label>
              <Input type="number" min={0} step="0.01" value={unitCostInput} onChange={(e) => setUnitCostInput(e.target.value)} required className="mt-1" />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-bold uppercase text-on-surface-variant">{t('inventory.receiveSalePrice')}</label>
              <Input type="number" min={0} step="0.01" value={priceInput} onChange={(e) => setPriceInput(e.target.value)} placeholder={t('inventory.receivePriceOptional')} className="mt-1" />
            </div>
          </div>
          {preview ? (
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm">
              <p>
                {t('warehouse.colQty')}: {warehouseQty} → <strong>{preview.newWarehouseQty}</strong>
              </p>
              <p>
                {t('products.warehouseCost')}:{' '}
                {(warehouseQty > 0 ? warehouseUnitCost : 0).toFixed(2)} → <strong>{preview.newWarehouseCost.toFixed(2)}</strong>
              </p>
            </div>
          ) : null}
          {msg ? <p className="text-sm text-error">{msg}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" disabled={busy} onClick={onClose}>{t('common.cancel')}</Button>
            <Button type="submit" disabled={busy}>{t('warehouse.entryConfirm')}</Button>
          </div>
        </form>
      ) : null}
    </Modal>
  );
}

type TransferDialogProps = {
  product: Product | null;
  warehouseQty: number;
  warehouseUnitCost: number;
  onClose: () => void;
  onSubmit: (payload: { quantity: number; price: number }) => Promise<void>;
};

export function WarehouseTransferDialog({
  product,
  warehouseQty,
  warehouseUnitCost,
  onClose,
  onSubmit,
}: TransferDialogProps) {
  const { t } = useI18n();
  const [qtyInput, setQtyInput] = useState('');
  const [priceInput, setPriceInput] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!product) return;
    setQtyInput('');
    setPriceInput(product.price > 0 ? String(product.price) : '');
    setMsg(null);
  }, [product]);

  const preview = useMemo(() => {
    if (!product) return null;
    const qty = parsePositiveInt(qtyInput);
    const price = parsePositiveNumber(priceInput);
    if (qty == null || price == null || price <= 0) return null;
    const storeStock = product.stock;
    const storeCost = product.cost;
    return {
      newStoreStock: storeStock + qty,
      newStoreCost: computeWeightedAverageCost(storeStock, storeCost, qty, warehouseUnitCost),
      newWarehouseQty: warehouseQty - qty,
    };
  }, [product, qtyInput, priceInput, warehouseQty, warehouseUnitCost]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!product) return;
    const qty = parsePositiveInt(qtyInput);
    const price = parsePositiveNumber(priceInput);
    if (qty == null || qty > warehouseQty) {
      setMsg(t('warehouse.transferInvalidQty', { max: warehouseQty }));
      return;
    }
    if (price == null || price <= 0) {
      setMsg(t('warehouse.transferInvalidPrice'));
      return;
    }
    setBusy(true);
    try {
      await onSubmit({ quantity: qty, price });
      onClose();
    } catch (err) {
      setMsg(mapMutationError(err, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal isOpen={product != null} onClose={() => !busy && onClose()} title={t('warehouse.sendToStoreTitle')}>
      {product ? (
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div className="rounded-xl bg-surface-container-low p-4 text-sm space-y-2">
            <p className="font-bold">{product.name}</p>
            <p className="text-xs text-on-surface-variant">{product.sku}</p>
            <p className="text-xs">{t('inventory.transferAvailable', { count: warehouseQty })}</p>
            <p className="text-xs text-on-surface-variant">
              {t('warehouse.transferCostNote', { cost: warehouseUnitCost.toFixed(2) })}
            </p>
            {product.price > 0 ? (
              <p className="text-xs text-on-surface-variant">
                {t('warehouse.transferCurrentPrice', { price: product.price.toFixed(2) })}
              </p>
            ) : null}
          </div>
          <p className="text-xs text-on-surface-variant">{t('warehouse.sendToStoreHelp')}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold uppercase text-on-surface-variant">{t('warehouse.transferQtyLabel')}</label>
              <Input
                type="number"
                min={1}
                max={warehouseQty}
                step={1}
                inputMode="numeric"
                value={qtyInput}
                onChange={(e) => setQtyInput(e.target.value)}
                required
                className="mt-1"
              />
              <p className="text-[10px] text-on-surface-variant mt-1">{t('warehouse.transferQtyHint', { max: warehouseQty })}</p>
            </div>
            <div>
              <label className="text-xs font-bold uppercase text-on-surface-variant">{t('warehouse.transferPriceLabel')}</label>
              <Input
                type="number"
                min={0.01}
                step="0.01"
                inputMode="decimal"
                value={priceInput}
                onChange={(e) => setPriceInput(e.target.value)}
                required
                className="mt-1"
              />
              <p className="text-[10px] text-on-surface-variant mt-1">{t('warehouse.transferPriceHint')}</p>
            </div>
          </div>
          {preview && preview.newWarehouseQty >= 0 ? (
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm space-y-1">
              <p>
                {t('inventory.colCurrentStock')}: {product.stock} → <strong>{preview.newStoreStock}</strong>
              </p>
              <p>
                {t('products.storeCost')}: {product.cost.toFixed(2)} → <strong>{preview.newStoreCost.toFixed(2)}</strong>
              </p>
              <p>
                {t('products.price')}: {product.price > 0 ? product.price.toFixed(2) : '—'} → <strong>{parsePositiveNumber(priceInput)?.toFixed(2)}</strong>
              </p>
              <p>
                {t('warehouse.colQty')}: {warehouseQty} → <strong>{preview.newWarehouseQty}</strong>
              </p>
            </div>
          ) : null}
          {msg ? <p className="text-sm text-error">{msg}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" disabled={busy} onClick={onClose}>{t('common.cancel')}</Button>
            <Button type="submit" disabled={busy || warehouseQty <= 0}>{t('warehouse.sendToStoreConfirm')}</Button>
          </div>
        </form>
      ) : null}
    </Modal>
  );
}
