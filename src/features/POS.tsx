import { useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Minus,
  X,
  CreditCard,
  Banknote,
  ArrowRight,
  ShoppingCart,
} from 'lucide-react';
import { Button, Input } from '../components/ui';
import { CardQrModal } from '../components/CardQrModal';
import { ReceiptViewModal } from '../components/ReceiptViewModal';
import { ProductThumb } from '../components/ProductThumb';
import type { CheckoutPayload, Product, CartItem, SaleReceipt, Transaction } from '../types';
import { cn, rowMatchesSearch } from '../lib/utils';
import { useI18n } from '../i18n/I18nContext';

const FILTER_ALL = '__ALL__';

type PosPaymentMethod = 'cash' | 'card';

interface POSProps {
  products: Product[];
  /** Managed category names (from Categories); POS also shows “All Items”. */
  productCategoryNames: string[];
  cart: CartItem[];
  taxRatePercent: number;
  /** Encoded in the Card payment QR (from settings). */
  cardQrPayload: string;
  storeName: string;
  storeBranch: string;
  storeCurrency: string;
  globalSearch?: string;
  addToCart: (product: Product) => void;
  removeFromCart: (id: string) => void;
  updateQuantity: (id: string, delta: number) => void;
  onCheckout: (payload: CheckoutPayload) => Promise<Transaction>;
}

export function POS({
  products,
  productCategoryNames,
  cart,
  taxRatePercent,
  cardQrPayload,
  storeName,
  storeBranch,
  storeCurrency,
  globalSearch = '',
  addToCart,
  removeFromCart,
  updateQuantity,
  onCheckout,
}: POSProps) {
  const { t } = useI18n();
  const [receiptModalTx, setReceiptModalTx] = useState<Transaction | null>(null);
  const [cardQrOpen, setCardQrOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PosPaymentMethod>('cash');
  const [category, setCategory] = useState<string>(FILTER_ALL);
  const [customerName, setCustomerName] = useState('');

  const categoryChips = useMemo(
    () => [
      { value: FILTER_ALL, label: t('pos.allItems') },
      ...[...productCategoryNames]
        .sort((a, b) => a.localeCompare(b))
        .map((name) => ({ value: name, label: name })),
    ],
    [productCategoryNames, t],
  );

  useEffect(() => {
    if (category !== FILTER_ALL && !productCategoryNames.includes(category)) {
      setCategory(FILTER_ALL);
    }
  }, [category, productCategoryNames]);

  useEffect(() => {
    if (cart.length === 0) {
      setPaymentMethod('cash');
      setCardQrOpen(false);
    }
  }, [cart.length]);

  const filteredProducts = useMemo(() => {
    const byCat = category === FILTER_ALL ? products : products.filter((p) => p.category === category);
    return byCat.filter((p) => rowMatchesSearch(globalSearch, [p.name, p.sku, p.category]));
  }, [products, category, globalSearch]);

  const subtotal = cart.reduce((acc, item) => acc + item.price * item.quantity, 0);
  const tax = paymentMethod === 'card' ? subtotal * (taxRatePercent / 100) : 0;
  const total = subtotal + tax;

  const handleProcessSale = async () => {
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
    };
    const saved = await onCheckout({
      customerName: name,
      amount: total,
      receipt,
    });
    if (saved) setReceiptModalTx(saved);
    setCustomerName('');
    setPaymentMethod('cash');
    setCardQrOpen(false);
  };

  const taxLabel = useMemo(() => {
    const rateStr = taxRatePercent % 1 === 0 ? taxRatePercent.toFixed(0) : taxRatePercent.toFixed(2);
    return t('pos.salesTax', { rate: rateStr });
  }, [taxRatePercent, t]);

  return (
    <div className="flex flex-col xl:flex-row gap-4 xl:gap-6 min-h-0 w-full xl:h-[calc(100vh-8rem)] xl:max-h-[calc(100vh-8rem)] animate-in fade-in slide-in-from-bottom-4 duration-500">
      <section className="flex-1 xl:flex-[2.5] min-h-[min(50vh,28rem)] xl:min-h-0 flex flex-col space-y-4 xl:space-y-6 overflow-hidden">
        <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar shrink-0">
          {categoryChips.map((chip) => (
            <button
              key={chip.value}
              type="button"
              onClick={() => setCategory(chip.value)}
              className={cn(
                'whitespace-nowrap px-6 py-2 rounded-full text-sm font-semibold tracking-wide transition-all',
                category === chip.value
                  ? 'bg-primary text-white shadow-lg shadow-primary/20'
                  : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high',
              )}
            >
              {chip.label}
            </button>
          ))}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto pr-1 sm:pr-2 no-scrollbar">
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4 gap-3 sm:gap-4">
            {filteredProducts.map((product) => (
              <div
                key={product.id}
                onClick={() => addToCart(product)}
                className="group bg-surface-container-lowest rounded-lg overflow-hidden flex flex-col hover:shadow-2xl transition-all duration-300 cursor-pointer border border-black/5"
              >
                <div className="aspect-[4/5] relative bg-surface-container-high overflow-hidden">
                  <ProductThumb
                    src={product.image}
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                    alt={product.name}
                  />
                  <div className="absolute top-3 right-3">
                    <span
                      className={cn(
                        'text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-tighter',
                        product.stock > 0 ? 'bg-tertiary-container/80 text-white' : 'bg-error/80 text-white',
                      )}
                    >
                      {product.stock > 0 ? t('pos.inStock') : t('pos.outOfStock')}
                    </span>
                  </div>
                </div>
                <div className="p-4 flex flex-col flex-1">
                  <h3 className="font-headline font-bold text-slate-900 dark:text-slate-100 tracking-tight leading-tight">
                    {product.name}
                  </h3>
                  <p className="text-xs text-slate-500 mb-4">
                    {t('common.sku')}: {product.sku}
                  </p>
                  <div className="mt-auto flex justify-between items-end">
                    <span className="text-lg font-headline font-extrabold text-primary">
                      ${product.price.toFixed(2)}
                    </span>
                    <div className="bg-primary-fixed p-1 rounded-md text-primary">
                      <Plus size={16} />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="w-full xl:flex-1 shrink-0 xl:min-w-0 min-h-[22rem] xl:min-h-0 flex flex-col bg-surface-container-low rounded-xl overflow-hidden shadow-2xl shadow-on-surface/5 border border-black/5">
        <div className="p-6 pb-4 border-b border-black/5 space-y-4">
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-headline font-extrabold text-xl text-primary">{t('pos.currentCart')}</h2>
            <span className="bg-primary text-white text-[10px] font-bold h-5 w-5 flex items-center justify-center rounded-full">
              {cart.reduce((acc, item) => acc + item.quantity, 0)}
            </span>
          </div>
          <p className="text-xs text-on-surface-variant/70 uppercase tracking-widest font-semibold">
            {t('pos.transactionStub')}
          </p>
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
              {t('pos.customerName')}
            </label>
            <Input
              placeholder={t('pos.customerPlaceholder')}
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4 no-scrollbar">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-on-surface-variant opacity-50 space-y-2">
              <ShoppingCart size={48} strokeWidth={1} />
              <p className="text-sm font-medium">{t('pos.emptyCart')}</p>
            </div>
          ) : (
            cart.map((item) => (
              <div key={item.id} className="flex gap-4 group">
                <div className="w-16 h-16 rounded-lg overflow-hidden bg-white shrink-0 shadow-sm">
                  <ProductThumb src={item.image} className="w-full h-full object-cover" alt={item.name} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start">
                    <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100 truncate">{item.name}</h4>
                    <button
                      onClick={() => removeFromCart(item.id)}
                      className="text-slate-400 hover:text-error transition-colors"
                    >
                      <X size={16} />
                    </button>
                  </div>
                  <div className="flex justify-between items-center mt-2">
                    <div className="flex items-center gap-3 bg-white dark:bg-slate-800 px-2 py-1 rounded-md shadow-sm">
                      <button
                        onClick={() => updateQuantity(item.id, -1)}
                        className="hover:text-primary transition-colors"
                      >
                        <Minus size={14} />
                      </button>
                      <span className="text-xs font-bold text-slate-900 dark:text-slate-100">{item.quantity}</span>
                      <button
                        onClick={() => updateQuantity(item.id, 1)}
                        className="hover:text-primary transition-colors"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                    <span className="font-headline font-bold text-primary">
                      ${(item.price * item.quantity).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="bg-surface-container-high/50 p-6 space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-on-surface-variant font-medium">{t('pos.subtotal')}</span>
            <span className="text-slate-900 dark:text-slate-100 font-bold">${subtotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm gap-3 items-start">
            <div className="min-w-0">
              <span className="text-on-surface-variant font-medium">
                {paymentMethod === 'card' ? taxLabel : t('pos.taxCashRow')}
              </span>
              {paymentMethod === 'cash' ? (
                <p className="text-[11px] text-on-surface-variant/80 mt-0.5 leading-snug">{t('pos.taxCashNote')}</p>
              ) : null}
            </div>
            <span className="text-slate-900 dark:text-slate-100 font-bold shrink-0">${tax.toFixed(2)}</span>
          </div>
          <div className="pt-3 border-t border-black/10 flex justify-between items-end">
            <span className="text-on-surface-variant font-bold uppercase tracking-widest text-xs">{t('pos.totalAmount')}</span>
            <span className="text-3xl font-headline font-black text-primary">${total.toFixed(2)}</span>
          </div>
        </div>

        <div className="p-6 pt-0 space-y-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">{t('pos.paymentMethod')}</p>
          <div className="grid grid-cols-2 gap-3">
            <Button
              type="button"
              variant="secondary"
              className={cn(
                'flex items-center justify-center gap-2 py-3',
                paymentMethod === 'cash' && 'ring-2 ring-primary border-primary/30 bg-primary/5',
              )}
              onClick={() => {
                setPaymentMethod('cash');
                setCardQrOpen(false);
              }}
            >
              <Banknote size={18} /> {t('pos.cash')}
            </Button>
            <Button
              type="button"
              variant="secondary"
              className={cn(
                'flex items-center justify-center gap-2 py-3',
                paymentMethod === 'card' && 'ring-2 ring-primary border-primary/30 bg-primary/5',
              )}
              onClick={() => {
                setPaymentMethod('card');
                setCardQrOpen(true);
              }}
            >
              <CreditCard size={18} /> {t('pos.card')}
            </Button>
          </div>
          <Button
            disabled={cart.length === 0}
            onClick={handleProcessSale}
            className="w-full py-4 text-lg shadow-xl flex items-center justify-center gap-3"
          >
            {t('pos.processSale')} <ArrowRight size={20} />
          </Button>
        </div>
      </section>

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
