import { useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Minus,
  X,
  CreditCard,
  Banknote,
  ArrowRight,
  ShoppingCart,
  ChevronDown,
} from 'lucide-react';
import { Button, Input, Modal } from '../components/ui';
import { CardQrModal } from '../components/CardQrModal';
import { ReceiptViewModal } from '../components/ReceiptViewModal';
import { ProductThumb } from '../components/ProductThumb';
import type { CheckoutPayload, Product, ProductCategory, ProductSubcategory, CartItem, SaleReceipt, Transaction } from '../types';
import { cn, rowMatchesSearch } from '../lib/utils';
import { mapMutationError } from '../lib/mutationErrors';
import { useI18n } from '../i18n/I18nContext';
import {
  CatalogFilterModal,
  catalogFilterLabel,
  productMatchesCatalogFilter,
  type CatalogFilter,
} from '../components/CatalogFilterModal';

interface POSProps {
  products: Product[];
  productCategories: ProductCategory[];
  productSubcategories: ProductSubcategory[];
  cart: CartItem[];
  taxRatePercent: number;
  cardQrPayload: string;
  storeName: string;
  storeBranch: string;
  storeCurrency: string;
  globalSearch?: string;
  cashSessionOpen: boolean;
  licenseActive: boolean;
  onGoToCash: () => void;
  onGoToBilling: () => void;
  addToCart: (product: Product) => void;
  removeFromCart: (id: string) => void;
  updateQuantity: (id: string, delta: number) => void;
  onCheckout: (payload: CheckoutPayload) => Promise<Transaction>;
}

export function POS({
  products,
  productCategories,
  productSubcategories,
  cart,
  taxRatePercent,
  cardQrPayload,
  storeName,
  storeBranch,
  storeCurrency,
  globalSearch = '',
  cashSessionOpen,
  licenseActive,
  onGoToCash,
  onGoToBilling,
  addToCart,
  removeFromCart,
  updateQuantity,
  onCheckout,
}: POSProps) {
  const { t } = useI18n();
  const [receiptModalTx, setReceiptModalTx] = useState<Transaction | null>(null);
  const [cardQrOpen, setCardQrOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card'>('cash');
  const [catalogFilter, setCatalogFilter] = useState<CatalogFilter>({ kind: 'all' });
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [cashPayOpen, setCashPayOpen] = useState(false);
  const [amountPaidInput, setAmountPaidInput] = useState('');
  const [checkoutBusy, setCheckoutBusy] = useState(false);

  const filteredProducts = useMemo(() => {
    return products.filter(
      (p) =>
        productMatchesCatalogFilter(p, catalogFilter) &&
        rowMatchesSearch(globalSearch, [p.name, p.sku, p.category, p.subcategory]),
    );
  }, [products, catalogFilter, globalSearch]);

  const cartItemCount = cart.reduce((acc, item) => acc + item.quantity, 0);

  useEffect(() => {
    if (cart.length === 0) {
      setPaymentMethod('cash');
      setCardQrOpen(false);
    }
  }, [cart.length]);

  const subtotal = cart.reduce((acc, item) => acc + item.price * item.quantity, 0);
  const tax = paymentMethod === 'card' ? subtotal * (taxRatePercent / 100) : 0;
  const total = subtotal + tax;

  const amountPaid = useMemo(() => {
    const raw = amountPaidInput.trim().replace(',', '.');
    if (!raw) return null;
    const v = parseFloat(raw);
    return Number.isFinite(v) ? v : null;
  }, [amountPaidInput]);

  const cashDelta = amountPaid != null ? amountPaid - total : null;

  const openCashPayModal = () => {
    setCheckoutError(null);
    setAmountPaidInput('');
    setCashPayOpen(true);
  };

  const closeCashPayModal = () => {
    if (checkoutBusy) return;
    setCashPayOpen(false);
    setAmountPaidInput('');
  };

  const handleCheckoutClick = () => {
    if (!licenseActive) {
      setCheckoutError(t('pos.licenseBlocked'));
      return;
    }
    if (!cashSessionOpen) {
      setCheckoutError(t('pos.checkoutBlocked'));
      return;
    }
    if (cart.length === 0) return;
    if (paymentMethod === 'cash') {
      openCashPayModal();
      return;
    }
    void handleProcessSale();
  };

  const handleProcessSale = async () => {
    if (!licenseActive) {
      setCheckoutError(t('pos.licenseBlocked'));
      return;
    }
    if (!cashSessionOpen) {
      setCheckoutError(t('pos.checkoutBlocked'));
      return;
    }
    if (paymentMethod === 'cash') {
      if (amountPaid == null || amountPaid < total) return;
    }
    setCheckoutError(null);
    setCheckoutBusy(true);
    const name = customerName.trim() || t('pos.walkInCustomer');
    const receipt: SaleReceipt = {
      storeName: storeName.trim() || t('receipt.defaultStore'),
      branch: storeBranch.trim(),
      currency: storeCurrency.trim() || 'USD',
      lines: cart.map((item) => ({
        name: item.name,
        sku: item.sku,
        quantity: item.quantity,
        unitPrice: item.price,
        lineTotal: item.price * item.quantity,
        productId: item.id,
        unitCostSnapshot: item.cost,
      })),
      subtotal,
      tax,
      taxRatePercent: paymentMethod === 'card' ? taxRatePercent : 0,
      total,
      paymentMethod,
      ...(paymentMethod === 'cash' && amountPaid != null
        ? {
            amountPaid,
            changeGiven: Math.round((amountPaid - total) * 100) / 100,
          }
        : {}),
    };
    try {
      const saved = await onCheckout({
        customerName: name,
        amount: total,
        receipt,
      });
      if (saved) setReceiptModalTx(saved);
      setCustomerName('');
      setPaymentMethod('cash');
      setCardQrOpen(false);
      setCashPayOpen(false);
      setAmountPaidInput('');
    } catch (err) {
      setCheckoutError(mapMutationError(err, t));
    } finally {
      setCheckoutBusy(false);
    }
  };

  const taxLabel = useMemo(() => {
    const rateStr = taxRatePercent % 1 === 0 ? taxRatePercent.toFixed(0) : taxRatePercent.toFixed(2);
    return t('pos.salesTax', { rate: rateStr });
  }, [taxRatePercent, t]);

  const filterLabel = catalogFilterLabel(catalogFilter, t('pos.allItems'));

  return (
    <div className="flex flex-col lg:flex-row gap-3 lg:gap-4 min-h-0 w-full lg:h-[calc(100vh-8rem)] lg:max-h-[calc(100vh-8rem)] animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Catálogo — listado compacto */}
      <section className="flex-1 lg:min-w-0 min-h-[min(42vh,24rem)] lg:min-h-0 flex flex-col gap-2 overflow-hidden">
        {!licenseActive ? (
          <div
            role="alert"
            className="shrink-0 rounded-lg border border-error/30 bg-error-container text-on-error-container px-3 py-2 flex flex-wrap items-center justify-between gap-2"
          >
            <div>
              <p className="text-xs font-bold">{t('pos.licenseRequiredTitle')}</p>
              <p className="text-[10px] mt-0.5">{t('pos.licenseRequiredBody')}</p>
            </div>
            <Button type="button" variant="secondary" size="sm" onClick={onGoToBilling}>
              {t('license.goToBilling')}
            </Button>
          </div>
        ) : !cashSessionOpen ? (
          <div
            role="alert"
            className="shrink-0 rounded-lg border border-error/30 bg-error-container text-on-error-container px-3 py-2 flex flex-wrap items-center justify-between gap-2"
          >
            <div>
              <p className="text-xs font-bold">{t('pos.cashRequiredTitle')}</p>
              <p className="text-[10px] mt-0.5">{t('pos.cashRequiredBody')}</p>
            </div>
            <Button type="button" variant="secondary" size="sm" onClick={onGoToCash}>
              {t('pos.goToCash')}
            </Button>
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => setFilterModalOpen(true)}
          className="shrink-0 inline-flex items-center gap-2 self-start px-4 py-1.5 rounded-full text-xs font-semibold bg-primary text-white shadow-md"
        >
          {filterLabel}
          <ChevronDown size={14} />
        </button>

        <div className="flex-1 min-h-0 overflow-y-auto pr-0.5 no-scrollbar">
          <div className="space-y-1">
            {filteredProducts.map((product) => (
              <button
                key={product.id}
                type="button"
                onClick={() => addToCart(product)}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg border border-black/5 bg-surface-container-lowest hover:bg-surface-container-low text-left transition-colors"
              >
                <ProductThumb src={product.image} imageUrl={product.imageUrl} className="w-10 h-10 rounded-md object-cover shrink-0" alt={product.name} />
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm text-primary truncate leading-tight">{product.name}</p>
                  <p className="text-[10px] text-on-surface-variant truncate">{product.sku}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold text-sm text-primary">${product.price.toFixed(2)}</p>
                  <p
                    className={cn(
                      'text-[9px] font-bold uppercase',
                      product.stock > 0 ? 'text-on-tertiary-container' : 'text-error',
                    )}
                  >
                    {product.stock > 0 ? t('pos.inStock') : t('pos.outOfStock')}
                  </p>
                </div>
                <div className="bg-primary text-white p-1 rounded-md shrink-0">
                  <Plus size={14} />
                </div>
              </button>
            ))}
            {filteredProducts.length === 0 ? (
              <p className="text-center text-sm text-on-surface-variant py-6">{t('pos.noProducts')}</p>
            ) : null}
          </div>
        </div>

        <CatalogFilterModal
          isOpen={filterModalOpen}
          onClose={() => setFilterModalOpen(false)}
          title={t('pos.filterTitle')}
          allLabel={t('pos.allItems')}
          closeLabel={t('common.cancel')}
          categories={productCategories}
          subcategories={productSubcategories}
          selected={catalogFilter}
          onSelect={setCatalogFilter}
        />
      </section>

      {/* Carrito — prioridad al listado de líneas */}
      <section className="w-full lg:w-[min(100%,22rem)] xl:w-[min(100%,26rem)] shrink-0 flex flex-col min-h-[min(52vh,32rem)] lg:min-h-0 lg:h-full bg-surface-container-low rounded-xl overflow-hidden border border-black/5 shadow-lg">
        {/* Cabecera compacta */}
        <div className="shrink-0 px-3 py-2 border-b border-black/5 bg-surface-container-lowest space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-headline font-extrabold text-base text-primary">{t('pos.currentCart')}</h2>
            <span className="bg-primary text-white text-[10px] font-bold min-w-[1.25rem] h-5 px-1.5 flex items-center justify-center rounded-full">
              {cartItemCount}
            </span>
          </div>
          <Input
            placeholder={t('pos.customerPlaceholder')}
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            className="h-8 text-xs py-1"
          />
        </div>

        {/* Líneas del carrito — área principal con scroll */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
          {cart.length === 0 ? (
            <div className="h-full min-h-[8rem] flex flex-col items-center justify-center text-on-surface-variant opacity-50 gap-2 p-4">
              <ShoppingCart size={32} strokeWidth={1.25} />
              <p className="text-xs font-medium">{t('pos.emptyCart')}</p>
            </div>
          ) : (
            <ul className="divide-y divide-black/5">
              {cart.map((item) => (
                <li key={item.id} className="flex items-center gap-2 px-2 py-2 hover:bg-surface-container-lowest/80">
                  <ProductThumb
                    src={item.image}
                    imageUrl={item.imageUrl}
                    className="w-9 h-9 rounded-md object-cover shrink-0 hidden sm:block"
                    alt={item.name}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-1">
                      <p className="font-semibold text-xs text-primary leading-snug line-clamp-2">{item.name}</p>
                      <button
                        type="button"
                        onClick={() => removeFromCart(item.id)}
                        className="text-on-surface-variant hover:text-error shrink-0 p-0.5"
                        aria-label={t('common.delete')}
                      >
                        <X size={14} />
                      </button>
                    </div>
                    <p className="text-[10px] text-on-surface-variant mt-0.5">
                      ${item.price.toFixed(2)} · {item.sku}
                    </p>
                    <div className="flex items-center justify-between mt-1.5 gap-2">
                      <div className="inline-flex items-center rounded-md border border-black/10 bg-white dark:bg-slate-900 overflow-hidden">
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.id, -1)}
                          className="px-2 py-1 hover:bg-surface-container-low text-on-surface-variant"
                        >
                          <Minus size={12} />
                        </button>
                        <span className="px-2 text-xs font-bold tabular-nums min-w-[1.5rem] text-center">{item.quantity}</span>
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.id, 1)}
                          className="px-2 py-1 hover:bg-surface-container-low text-on-surface-variant"
                        >
                          <Plus size={12} />
                        </button>
                      </div>
                      <span className="text-sm font-bold text-primary tabular-nums shrink-0">
                        ${(item.price * item.quantity).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Pie compacto: totales + pago + cobrar */}
        <div className="shrink-0 border-t border-black/10 bg-surface-container-high/40 px-3 py-2.5 space-y-2">
          <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 text-xs">
            <span className="text-on-surface-variant">{t('pos.subtotal')}</span>
            <span className="font-semibold text-right tabular-nums">${subtotal.toFixed(2)}</span>
            <span className="text-on-surface-variant truncate">
              {paymentMethod === 'card' ? taxLabel : t('pos.taxCashRow')}
            </span>
            <span className="font-semibold text-right tabular-nums">${tax.toFixed(2)}</span>
            <span className="font-bold text-primary pt-1">{t('pos.totalAmount')}</span>
            <span className="font-black text-lg text-primary text-right tabular-nums pt-0.5">${total.toFixed(2)}</span>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => {
                setPaymentMethod('cash');
                setCardQrOpen(false);
              }}
              className={cn(
                'flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold border transition-colors',
                paymentMethod === 'cash'
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-black/10 bg-surface-container-lowest text-on-surface-variant',
              )}
            >
              <Banknote size={14} /> {t('pos.cash')}
            </button>
            <button
              type="button"
              onClick={() => {
                setPaymentMethod('card');
                setCardQrOpen(true);
              }}
              className={cn(
                'flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold border transition-colors',
                paymentMethod === 'card'
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-black/10 bg-surface-container-lowest text-on-surface-variant',
              )}
            >
              <CreditCard size={14} /> {t('pos.card')}
            </button>
          </div>

          {paymentMethod === 'cash' ? (
            <p className="text-[10px] text-on-surface-variant leading-snug">{t('pos.taxCashNote')}</p>
          ) : null}
          {checkoutError ? <p className="text-xs text-error font-medium">{checkoutError}</p> : null}

          <Button
            disabled={cart.length === 0 || !cashSessionOpen || !licenseActive}
            onClick={handleCheckoutClick}
            className="w-full py-2.5 text-sm shadow-md flex items-center justify-center gap-2"
          >
            {t('pos.processSale')} <ArrowRight size={16} />
          </Button>
        </div>
      </section>

      <Modal isOpen={cashPayOpen} onClose={closeCashPayModal} title={t('pos.cashPayTitle')}>
        <div className="space-y-5">
          <div className="rounded-xl bg-surface-container-low p-4 flex justify-between items-center">
            <span className="text-sm text-on-surface-variant font-medium">{t('pos.totalAmount')}</span>
            <span className="text-2xl font-black text-primary tabular-nums">${total.toFixed(2)}</span>
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">
              {t('pos.cashPayQuestion')}
            </label>
            <div className="flex gap-2 mt-2">
              <Input
                type="text"
                inputMode="decimal"
                autoFocus
                placeholder="0.00"
                value={amountPaidInput}
                onChange={(e) => setAmountPaidInput(e.target.value)}
                className="flex-1 text-lg font-bold tabular-nums"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && amountPaid != null && amountPaid >= total && !checkoutBusy) {
                    void handleProcessSale();
                  }
                }}
              />
              <Button type="button" variant="secondary" className="shrink-0" onClick={() => setAmountPaidInput(total.toFixed(2))}>
                {t('pos.exactAmount')}
              </Button>
            </div>
          </div>

          {amountPaid != null ? (
            <div
              className={cn(
                'rounded-xl px-4 py-3 text-sm font-bold border',
                cashDelta != null && cashDelta < 0
                  ? 'bg-error-container/30 border-error/30 text-on-error-container'
                  : 'bg-tertiary-container/15 border-tertiary-container/40 text-on-tertiary-container',
              )}
            >
              {cashDelta != null && cashDelta < 0
                ? t('pos.cashShortBy', { amount: Math.abs(cashDelta).toFixed(2) })
                : t('pos.cashChangeDue', { amount: (cashDelta ?? 0).toFixed(2) })}
            </div>
          ) : null}

          {checkoutError ? <p className="text-sm text-error font-medium">{checkoutError}</p> : null}

          <div className="flex gap-2 pt-1">
            <Button type="button" variant="secondary" className="flex-1" disabled={checkoutBusy} onClick={closeCashPayModal}>
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              className="flex-1"
              disabled={checkoutBusy || amountPaid == null || amountPaid < total}
              onClick={() => void handleProcessSale()}
            >
              {t('pos.confirmCashSale')}
            </Button>
          </div>
        </div>
      </Modal>

      <CardQrModal open={cardQrOpen} onClose={() => setCardQrOpen(false)} payload={cardQrPayload} />

      <ReceiptViewModal
        isOpen={!!receiptModalTx}
        onClose={() => setReceiptModalTx(null)}
        transaction={receiptModalTx}
        showSuccessBanner
      />
    </div>
  );
}
