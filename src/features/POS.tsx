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
  ArrowLeftRight,
  Hash,
  HandCoins,
  Search,
} from 'lucide-react';
import { Button, Input, Modal } from '../components/ui';
import { CardQrModal } from '../components/CardQrModal';
import { CustomerPickerModal } from '../components/CustomerPickerModal';
import { ReceiptViewModal } from '../components/ReceiptViewModal';
import { ProductThumb } from '../components/ProductThumb';
import type { CheckoutPayload, Product, ProductCategory, ProductSubcategory, CartItem, SaleReceipt, Transaction, Customer } from '../types';
import { cn, rowMatchesSearch } from '../lib/utils';
import { customerNameStartsWith, formatCustomerName } from '../lib/customers';
import { mapMutationError } from '../lib/mutationErrors';
import { useI18n } from '../i18n/I18nContext';
import { buildOnlineQrPayload, buildTransferQrPayload } from '../lib/paymentQr';
import { computeMixedSaleTotals } from '../lib/mixedPayment';
import { buildMixedPayments } from '../lib/paymentSplits';
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
  customers: Customer[];
  cart: CartItem[];
  taxRatePercent: number;
  cardQrPayload: string;
  transferAccountNumber: string;
  transferPhoneNumber: string;
  storeName: string;
  storeBranch: string;
  storeCurrency: string;
  storeLogoUrl?: string | null;
  globalSearch?: string;
  cashSessionOpen: boolean;
  licenseActive: boolean;
  onGoToCash: () => void;
  onGoToBilling: () => void;
  addToCart: (product: Product) => void;
  removeFromCart: (id: string) => void;
  updateQuantity: (id: string, delta: number) => void;
  setItemQuantity: (id: string, quantity: number) => void;
  onCheckout: (payload: CheckoutPayload) => Promise<Transaction>;
}

function parsePositiveInt(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed || !/^\d+$/.test(trimmed)) return null;
  const v = parseInt(trimmed, 10);
  if (!Number.isFinite(v) || v < 1) return null;
  return v;
}

export function POS({
  products,
  productCategories,
  productSubcategories,
  customers,
  cart,
  taxRatePercent,
  cardQrPayload,
  transferAccountNumber,
  transferPhoneNumber,
  storeName,
  storeBranch,
  storeCurrency,
  storeLogoUrl = null,
  globalSearch = '',
  cashSessionOpen,
  licenseActive,
  onGoToCash,
  onGoToBilling,
  addToCart,
  removeFromCart,
  updateQuantity,
  setItemQuantity,
  onCheckout,
}: POSProps) {
  const { t } = useI18n();
  const [receiptModalTx, setReceiptModalTx] = useState<Transaction | null>(null);
  const [payQrOpen, setPayQrOpen] = useState(false);
  /** When set, QR modal uses transfer/card payload even if cart payment method is cash (e.g. mixed pay). */
  const [payQrKind, setPayQrKind] = useState<'transfer' | 'card' | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'transfer'>('cash');
  const [saleAsDebt, setSaleAsDebt] = useState(false);
  const [catalogFilter, setCatalogFilter] = useState<CatalogFilter>({ kind: 'all' });
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);
  const [customerSuggestOpen, setCustomerSuggestOpen] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [cashPayOpen, setCashPayOpen] = useState(false);
  const [mixedPayOpen, setMixedPayOpen] = useState(false);
  const [mixedCashPortion, setMixedCashPortion] = useState(0);
  const [amountPaidInput, setAmountPaidInput] = useState('');
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [qtyModalItemId, setQtyModalItemId] = useState<string | null>(null);
  const [qtyModalInput, setQtyModalInput] = useState('');
  const [qtyModalError, setQtyModalError] = useState<string | null>(null);

  const qtyModalItem = qtyModalItemId != null ? cart.find((item) => item.id === qtyModalItemId) ?? null : null;

  const filteredProducts = useMemo(() => {
    return products.filter(
      (p) =>
        productMatchesCatalogFilter(p, catalogFilter) &&
        rowMatchesSearch(globalSearch, [p.name, p.sku, p.category, p.subcategory]),
    );
  }, [products, catalogFilter, globalSearch]);

  const cartItemCount = cart.reduce((acc, item) => acc + item.quantity, 0);

  const customerSuggestions = useMemo(() => {
    if (!customerName.trim()) return [];
    return customers
      .filter((c) => customerNameStartsWith(c, customerName))
      .slice(0, 8);
  }, [customers, customerName]);

  const selectCustomer = (c: Customer) => {
    setCustomerName(formatCustomerName(c));
    setSelectedCustomerId(c.id);
    setCustomerSuggestOpen(false);
  };

  useEffect(() => {
    if (cart.length === 0) {
      setPaymentMethod('cash');
      setPayQrOpen(false);
      setPayQrKind(null);
      setSaleAsDebt(false);
    }
  }, [cart.length]);

  const subtotal = cart.reduce((acc, item) => acc + item.price * item.quantity, 0);
  const tax = !saleAsDebt && paymentMethod === 'transfer' ? subtotal * (taxRatePercent / 100) : 0;
  const total = subtotal + tax;

  const openQtyModal = (item: CartItem) => {
    setQtyModalItemId(item.id);
    setQtyModalInput(String(item.quantity));
    setQtyModalError(null);
  };

  const closeQtyModal = () => {
    setQtyModalItemId(null);
    setQtyModalInput('');
    setQtyModalError(null);
  };

  const handleSaveQty = () => {
    if (!qtyModalItem) return;
    const v = parsePositiveInt(qtyModalInput);
    if (v == null) {
      setQtyModalError(t('pos.invalidQuantity'));
      return;
    }
    setItemQuantity(qtyModalItem.id, v);
    closeQtyModal();
  };

  const amountPaid = useMemo(() => {
    const raw = amountPaidInput.trim().replace(',', '.');
    if (!raw) return null;
    const v = parseFloat(raw);
    return Number.isFinite(v) ? v : null;
  }, [amountPaidInput]);

  const cashModalTotals = useMemo(() => {
    if (amountPaid == null) return null;
    return computeMixedSaleTotals(subtotal, amountPaid, taxRatePercent);
  }, [subtotal, amountPaid, taxRatePercent]);

  /** Cash modal shows sale price (subtotal) without tax until split checkout is confirmed. */
  const modalSaleTotal = subtotal;
  const cashDelta = amountPaid != null ? amountPaid - subtotal : null;
  const cashShortfall = amountPaid != null && amountPaid < subtotal;

  const mixedPreview = useMemo(
    () => computeMixedSaleTotals(subtotal, mixedCashPortion, taxRatePercent),
    [subtotal, mixedCashPortion, taxRatePercent],
  );

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

  const closeMixedPayModal = () => {
    if (checkoutBusy) return;
    setMixedPayOpen(false);
    setMixedCashPortion(0);
  };

  type SplitCheckout = { cashPortion: number; remainder: 'transfer' | 'debt' };

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
    if (saleAsDebt) {
      if (!customerName.trim()) {
        setCheckoutError(t('pos.debtCustomerRequired'));
        return;
      }
      void handleProcessSale();
      return;
    }
    if (paymentMethod === 'cash') {
      openCashPayModal();
      return;
    }
    void handleProcessSale();
  };

  const handleProcessSale = async (split?: SplitCheckout) => {
    if (!licenseActive) {
      setCheckoutError(t('pos.licenseBlocked'));
      return;
    }
    if (!cashSessionOpen) {
      setCheckoutError(t('pos.checkoutBlocked'));
      return;
    }
    if (split?.remainder === 'debt' && !customerName.trim()) {
      setCheckoutError(t('pos.debtCustomerRequired'));
      return;
    }
    if (paymentMethod === 'cash' && !saleAsDebt && !split) {
      if (amountPaid == null || amountPaid < modalSaleTotal) return;
    }
    if (saleAsDebt && !customerName.trim()) {
      setCheckoutError(t('pos.debtCustomerRequired'));
      return;
    }
    setCheckoutError(null);
    setCheckoutBusy(true);
    const name =
      saleAsDebt || split?.remainder === 'debt'
        ? customerName.trim()
        : customerName.trim() || t('pos.walkInCustomer');

    const lineItems = cart.map((item) => ({
      name: item.name,
      sku: item.sku,
      quantity: item.quantity,
      unitPrice: item.price,
      lineTotal: item.price * item.quantity,
      productId: item.id,
      unitCostSnapshot: item.cost,
    }));

    let receipt: SaleReceipt;
    let chargeTotal = total;

    if (split) {
      const mixed = computeMixedSaleTotals(subtotal, split.cashPortion, taxRatePercent);
      const isDebtSplit = split.remainder === 'debt';
      const partAmount = isDebtSplit ? mixed.debtAmount : mixed.transferAmount;
      const payments = buildMixedPayments(split.cashPortion, partAmount, isDebtSplit ? 'debt' : 'transfer');
      chargeTotal = isDebtSplit ? mixed.totalIfDebt : mixed.totalIfTransfer;
      receipt = {
        storeName: storeName.trim() || t('receipt.defaultStore'),
        branch: storeBranch.trim(),
        ...(storeLogoUrl ? { storeLogoUrl } : {}),
        currency: storeCurrency.trim() || 'USD',
        lines: lineItems,
        subtotal,
        tax: isDebtSplit ? 0 : mixed.tax,
        taxRatePercent: isDebtSplit ? 0 : mixed.taxRatePercent,
        total: chargeTotal,
        paymentMethod: 'mixed',
        payments,
        balanceDue: isDebtSplit ? mixed.debtAmount : 0,
        mixedTaxIncluded: false,
        ...(split.cashPortion > 0
          ? {
              amountPaid: split.cashPortion,
              changeGiven: 0,
            }
          : {}),
      };
    } else {
      const effectivePayment = saleAsDebt ? ('debt' as const) : paymentMethod;
      receipt = {
        storeName: storeName.trim() || t('receipt.defaultStore'),
        branch: storeBranch.trim(),
        ...(storeLogoUrl ? { storeLogoUrl } : {}),
        currency: storeCurrency.trim() || 'USD',
        lines: lineItems,
        subtotal,
        tax,
        taxRatePercent: !saleAsDebt && paymentMethod === 'transfer' ? taxRatePercent : 0,
        total,
        paymentMethod: effectivePayment,
        ...(paymentMethod === 'cash' && !saleAsDebt && amountPaid != null
          ? {
              amountPaid,
              changeGiven: Math.round((amountPaid - subtotal) * 100) / 100,
            }
          : {}),
      };
    }

    try {
      const saved = await onCheckout({
        customerName: name,
        amount: chargeTotal,
        receipt,
        ...(saleAsDebt ? { isDebt: true } : {}),
        ...(split?.remainder === 'debt' ? { isPartialDebt: true } : {}),
        ...(selectedCustomerId ? { customerId: selectedCustomerId } : {}),
      });
      if (saved) setReceiptModalTx(saved);
      setCustomerName('');
      setSelectedCustomerId(null);
      setPaymentMethod('cash');
      setSaleAsDebt(false);
      setPayQrOpen(false);
      setPayQrKind(null);
      setCashPayOpen(false);
      setMixedPayOpen(false);
      setMixedCashPortion(0);
      setAmountPaidInput('');
    } catch (err) {
      setCheckoutError(mapMutationError(err, t));
    } finally {
      setCheckoutBusy(false);
    }
  };

  const beginSplitTransfer = () => {
    if (amountPaid == null || !cashShortfall) return;
    setCheckoutError(null);
    setMixedCashPortion(amountPaid);
    setCashPayOpen(false);
    setMixedPayOpen(true);
  };

  const beginSplitDebt = () => {
    if (amountPaid == null || !cashShortfall) return;
    if (!customerName.trim()) {
      setCheckoutError(t('pos.splitPayDebtCustomerHint'));
      return;
    }
    void handleProcessSale({ cashPortion: amountPaid, remainder: 'debt' });
  };

  const taxLabel = useMemo(() => {
    const rateStr = taxRatePercent % 1 === 0 ? taxRatePercent.toFixed(0) : taxRatePercent.toFixed(2);
    return t('pos.salesTax', { rate: rateStr });
  }, [taxRatePercent, t]);

  const activeQrKind: 'transfer' | 'card' | null =
    payQrKind ?? (paymentMethod === 'transfer' ? 'transfer' : paymentMethod === 'card' ? 'card' : null);

  const payQrPayload = useMemo(() => {
    if (activeQrKind === 'transfer') {
      return buildTransferQrPayload({
        accountNumber: transferAccountNumber,
        phoneNumber: transferPhoneNumber,
      });
    }
    if (activeQrKind === 'card') {
      return buildOnlineQrPayload(cardQrPayload);
    }
    return '';
  }, [activeQrKind, transferAccountNumber, transferPhoneNumber, cardQrPayload]);

  const closePayQrModal = () => {
    setPayQrOpen(false);
    setPayQrKind(null);
  };

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
            {filteredProducts.map((product) => {
              const outOfStock = product.stock <= 0 || product.price <= 0;
              const inCart = cart.find((item) => item.id === product.id)?.quantity ?? 0;
              const atLimit = !outOfStock && inCart >= product.stock;
              return (
              <button
                key={product.id}
                type="button"
                disabled={outOfStock || atLimit}
                onClick={() => addToCart(product)}
                className={cn(
                  'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg border border-black/5 text-left transition-colors',
                  outOfStock || atLimit
                    ? 'bg-surface-container-low opacity-60 cursor-not-allowed'
                    : 'bg-surface-container-lowest hover:bg-surface-container-low',
                )}
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
                <div className={cn('p-1 rounded-md shrink-0', outOfStock ? 'bg-surface-container-high text-on-surface-variant' : 'bg-primary text-white')}>
                  <Plus size={14} />
                </div>
              </button>
              );
            })}
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
          <div className="relative flex gap-1">
            <div className="relative flex-1 min-w-0">
              <Input
                placeholder={t('pos.customerPlaceholder')}
                value={customerName}
                onChange={(e) => {
                  setCustomerName(e.target.value);
                  setSelectedCustomerId(null);
                  setCustomerSuggestOpen(true);
                }}
                onFocus={() => setCustomerSuggestOpen(true)}
                onBlur={() => window.setTimeout(() => setCustomerSuggestOpen(false), 150)}
                className={cn('h-8 text-xs py-1', saleAsDebt && !customerName.trim() ? 'border-amber-500' : '')}
              />
              {customerSuggestOpen && customerSuggestions.length > 0 ? (
                <ul className="absolute z-20 left-0 right-0 top-full mt-0.5 max-h-40 overflow-y-auto rounded-lg border border-black/10 bg-surface-container-lowest shadow-lg text-xs">
                  {customerSuggestions.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        className="w-full text-left px-3 py-2 hover:bg-primary/10 font-medium text-primary"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => selectCustomer(c)}
                      >
                        {formatCustomerName(c)}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-8 px-2 shrink-0"
              aria-label={t('customers.pickerTitle')}
              onClick={() => setCustomerPickerOpen(true)}
            >
              <Search size={14} />
            </Button>
          </div>
          <label className="flex items-start gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={saleAsDebt}
              onChange={(e) => {
                setSaleAsDebt(e.target.checked);
                if (e.target.checked) {
                  setPayQrOpen(false);
                  setCashPayOpen(false);
                }
                setCheckoutError(null);
              }}
              className="mt-0.5 rounded border-black/20"
            />
            <span className="text-[11px] text-on-surface-variant leading-snug">
              <span className="font-bold text-primary inline-flex items-center gap-1">
                <HandCoins size={12} /> {t('pos.saleAsDebt')}
              </span>
              — {t('pos.saleAsDebtHint')}
            </span>
          </label>
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
                      <div className="inline-flex items-center gap-1">
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
                            disabled={item.quantity >= item.stock}
                            onClick={() => updateQuantity(item.id, 1)}
                            className="px-2 py-1 hover:bg-surface-container-low text-on-surface-variant disabled:opacity-40"
                          >
                            <Plus size={12} />
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => openQtyModal(item)}
                          aria-label={t('pos.cartQtyEditAria')}
                          className="p-1 rounded-md border border-black/10 bg-white dark:bg-slate-900 text-on-surface-variant hover:bg-surface-container-low hover:text-primary transition-colors"
                        >
                          <Hash size={12} />
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
              {paymentMethod === 'transfer' ? taxLabel : t('pos.taxCashRow')}
            </span>
            <span className="font-semibold text-right tabular-nums">${tax.toFixed(2)}</span>
            <span className="font-bold text-primary pt-1">{t('pos.totalAmount')}</span>
            <span className="font-black text-lg text-primary text-right tabular-nums pt-0.5">${total.toFixed(2)}</span>
          </div>

          <div className={cn('grid grid-cols-3 gap-1.5', saleAsDebt && 'opacity-40 pointer-events-none')}>
            <button
              type="button"
              onClick={() => {
                setPaymentMethod('cash');
                setPayQrOpen(false);
              }}
              className={cn(
                'flex items-center justify-center gap-1 rounded-lg py-2 text-[11px] font-bold border transition-colors',
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
                setPaymentMethod('transfer');
                setPayQrKind('transfer');
                setPayQrOpen(true);
              }}
              className={cn(
                'flex items-center justify-center gap-1 rounded-lg py-2 text-[11px] font-bold border transition-colors',
                paymentMethod === 'transfer'
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-black/10 bg-surface-container-lowest text-on-surface-variant',
              )}
            >
              <ArrowLeftRight size={14} /> {t('pos.transfer')}
            </button>
            <button
              type="button"
              onClick={() => {
                setPaymentMethod('card');
                setPayQrKind('card');
                setPayQrOpen(true);
              }}
              className={cn(
                'flex items-center justify-center gap-1 rounded-lg py-2 text-[11px] font-bold border transition-colors',
                paymentMethod === 'card'
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-black/10 bg-surface-container-lowest text-on-surface-variant',
              )}
            >
              <CreditCard size={14} /> {t('pos.online')}
            </button>
          </div>

          {saleAsDebt ? (
            <p className="text-[10px] text-amber-700 dark:text-amber-300 font-medium leading-snug">{t('pos.saleAsDebtHint')}</p>
          ) : paymentMethod === 'cash' ? (
            <p className="text-[10px] text-on-surface-variant leading-snug">{t('pos.taxCashNote')}</p>
          ) : paymentMethod === 'transfer' ? (
            <p className="text-[10px] text-on-surface-variant leading-snug">{t('pos.taxTransferNote')}</p>
          ) : (
            <p className="text-[10px] text-on-surface-variant leading-snug">{t('pos.taxOnlineNote')}</p>
          )}
          {checkoutError ? <p className="text-xs text-error font-medium">{checkoutError}</p> : null}

          <Button
            disabled={cart.length === 0 || !cashSessionOpen || !licenseActive}
            onClick={handleCheckoutClick}
            className="w-full py-2.5 text-sm shadow-md flex items-center justify-center gap-2"
          >
            {saleAsDebt ? t('pos.processDebtSale') : t('pos.processSale')} <ArrowRight size={16} />
          </Button>
        </div>
      </section>

      <Modal isOpen={qtyModalItem != null} onClose={closeQtyModal} title={t('pos.cartQtyTitle')}>
        <div className="space-y-4">
          {qtyModalItem ? (
            <p className="text-sm font-semibold text-primary">{qtyModalItem.name}</p>
          ) : null}
          <div className="space-y-1">
            <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">
              {t('pos.cartQtyLabel')}
            </label>
            <Input
              value={qtyModalInput}
              onChange={(e) => {
                setQtyModalInput(e.target.value);
                if (qtyModalError) setQtyModalError(null);
              }}
              type="text"
              inputMode="numeric"
              autoFocus
              placeholder="1"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveQty();
              }}
            />
          </div>
          {qtyModalItem ? (
            <p className="text-xs text-on-surface-variant">{t('pos.cartQtyMaxHint', { max: qtyModalItem.stock })}</p>
          ) : null}
          {qtyModalError ? <p className="text-sm text-error">{qtyModalError}</p> : null}
          <div className="pt-2 flex gap-3">
            <Button type="button" variant="secondary" className="flex-1" onClick={closeQtyModal}>
              {t('common.cancel')}
            </Button>
            <Button type="button" className="flex-1" onClick={handleSaveQty}>
              {t('pos.cartQtySave')}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={cashPayOpen} onClose={closeCashPayModal} title={t('pos.cashPayTitle')}>
        <div className="space-y-5">
          <div className="rounded-xl bg-surface-container-low p-4 flex justify-between items-center">
            <span className="text-sm text-on-surface-variant font-medium">{t('pos.totalAmount')}</span>
            <span className="text-2xl font-black text-primary tabular-nums">${modalSaleTotal.toFixed(2)}</span>
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
                  if (e.key === 'Enter' && amountPaid != null && amountPaid >= modalSaleTotal && !checkoutBusy) {
                    void handleProcessSale();
                  }
                }}
              />
              <Button
                type="button"
                variant="secondary"
                className="shrink-0"
                onClick={() => setAmountPaidInput(modalSaleTotal.toFixed(2))}
              >
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

          {cashShortfall ? (
            <div className="flex flex-col gap-2">
              <Button type="button" variant="secondary" disabled={checkoutBusy} onClick={beginSplitTransfer}>
                <ArrowLeftRight className="w-4 h-4 mr-2" />
                {t('pos.splitPayTransfer', {
                  amount: (cashModalTotals?.transferAmount ?? 0).toFixed(2),
                })}
              </Button>
              <Button type="button" variant="secondary" disabled={checkoutBusy} onClick={beginSplitDebt}>
                <HandCoins className="w-4 h-4 mr-2" />
                {t('pos.splitPayDebt', { amount: (cashModalTotals?.debtAmount ?? 0).toFixed(2) })}
              </Button>
            </div>
          ) : null}

          <div className="flex gap-2 pt-1">
            <Button type="button" variant="secondary" className="flex-1" disabled={checkoutBusy} onClick={closeCashPayModal}>
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              className="flex-1"
              disabled={checkoutBusy || amountPaid == null || amountPaid < modalSaleTotal}
              onClick={() => void handleProcessSale()}
            >
              {t('pos.confirmCashSale')}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={mixedPayOpen} onClose={closeMixedPayModal} title={t('pos.mixedPayTitle')}>
        <div className="space-y-4">
          <p className="text-sm text-on-surface-variant">
            {t('pos.mixedPaySummary', {
              cash: mixedCashPortion.toFixed(2),
              transfer: mixedPreview.transferAmount.toFixed(2),
            })}
          </p>
          <div className="rounded-xl bg-surface-container-low p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span>{t('receipt.subtotal')}</span>
              <span className="tabular-nums">${subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>{taxLabel}</span>
              <span className="tabular-nums">${mixedPreview.tax.toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-bold text-base pt-2 border-t border-outline-variant/40">
              <span>{t('pos.totalAmount')}</span>
              <span className="tabular-nums text-primary">${mixedPreview.totalIfTransfer.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-on-surface-variant">
              <span>{t('pos.mixedPayTransferAmount')}</span>
              <span className="font-bold tabular-nums">${mixedPreview.transferAmount.toFixed(2)}</span>
            </div>
          </div>
          {checkoutError ? <p className="text-sm text-error font-medium">{checkoutError}</p> : null}
          <div className="flex gap-2">
            <Button type="button" variant="secondary" className="flex-1" disabled={checkoutBusy} onClick={closeMixedPayModal}>
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              className="flex-1"
              disabled={checkoutBusy}
              onClick={() => void handleProcessSale({ cashPortion: mixedCashPortion, remainder: 'transfer' })}
            >
              {t('pos.mixedPayConfirm')}
            </Button>
          </div>
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            disabled={checkoutBusy}
            onClick={() => {
              setPayQrKind('transfer');
              setPayQrOpen(true);
            }}
          >
            {t('pos.transferQrTitle')}
          </Button>
        </div>
      </Modal>

      <CustomerPickerModal
        open={customerPickerOpen}
        onClose={() => setCustomerPickerOpen(false)}
        customers={customers}
        onSelect={selectCustomer}
      />

      <CardQrModal
        open={payQrOpen}
        onClose={closePayQrModal}
        payload={payQrPayload}
        title={activeQrKind === 'transfer' ? t('pos.transferQrTitle') : t('pos.onlineQrTitle')}
        hint={activeQrKind === 'transfer' ? t('pos.transferQrHint') : t('pos.onlineQrHint')}
        empty={activeQrKind === 'transfer' ? t('pos.transferQrEmpty') : t('pos.onlineQrEmpty')}
      />

      <ReceiptViewModal
        isOpen={!!receiptModalTx}
        onClose={() => setReceiptModalTx(null)}
        transaction={receiptModalTx}
        showSuccessBanner
      />
    </div>
  );
}
