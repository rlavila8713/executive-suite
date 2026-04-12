import { useMemo, useState } from 'react';
import {
  Plus,
  Minus,
  X,
  CreditCard,
  Banknote,
  ArrowRight,
  CheckCircle2,
  ShoppingCart,
} from 'lucide-react';
import { Button, Input, Modal } from '../components/ui';
import { ProductThumb } from '../components/ProductThumb';
import { CheckoutPayload, Product, CartItem } from '../types';
import { cn, rowMatchesSearch } from '../lib/utils';

interface POSProps {
  products: Product[];
  cart: CartItem[];
  taxRatePercent: number;
  globalSearch?: string;
  addToCart: (product: Product) => void;
  removeFromCart: (id: string) => void;
  updateQuantity: (id: string, delta: number) => void;
  onCheckout: (payload: CheckoutPayload) => void | Promise<void>;
}

export function POS({
  products,
  cart,
  taxRatePercent,
  globalSearch = '',
  addToCart,
  removeFromCart,
  updateQuantity,
  onCheckout,
}: POSProps) {
  const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);
  const [category, setCategory] = useState('All Items');
  const [customerName, setCustomerName] = useState('');

  const categories = ['All Items', 'Apparel', 'Footwear', 'Accessories', 'Electronics'];
  const filteredProducts = useMemo(() => {
    const byCat = category === 'All Items' ? products : products.filter((p) => p.category === category);
    return byCat.filter((p) => rowMatchesSearch(globalSearch, [p.name, p.sku, p.category]));
  }, [products, category, globalSearch]);

  const subtotal = cart.reduce((acc, item) => acc + item.price * item.quantity, 0);
  const rate = taxRatePercent / 100;
  const tax = subtotal * rate;
  const total = subtotal + tax;

  const handleProcessSale = async () => {
    await onCheckout({
      customerName: customerName.trim() || 'Walk-in Customer',
      amount: total,
    });
    setIsSuccessModalOpen(true);
    setCustomerName('');
  };

  const taxLabel = useMemo(
    () => `Sales Tax (${taxRatePercent % 1 === 0 ? taxRatePercent.toFixed(0) : taxRatePercent.toFixed(2)}%)`,
    [taxRatePercent],
  );

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <section className="flex-[2.5] flex flex-col space-y-6 overflow-hidden">
        <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar shrink-0">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={cn(
                'whitespace-nowrap px-6 py-2 rounded-full text-sm font-semibold tracking-wide transition-all',
                category === cat
                  ? 'bg-primary text-white shadow-lg shadow-primary/20'
                  : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high',
              )}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto pr-2 no-scrollbar">
          <div className="grid grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
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
                      {product.stock > 0 ? 'In Stock' : 'Out of Stock'}
                    </span>
                  </div>
                </div>
                <div className="p-4 flex flex-col flex-1">
                  <h3 className="font-headline font-bold text-slate-900 dark:text-slate-100 tracking-tight leading-tight">
                    {product.name}
                  </h3>
                  <p className="text-xs text-slate-500 mb-4">SKU: {product.sku}</p>
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

      <section className="flex-1 flex flex-col bg-surface-container-low rounded-xl overflow-hidden shadow-2xl shadow-on-surface/5 border border-black/5">
        <div className="p-6 pb-4 border-b border-black/5 space-y-4">
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-headline font-extrabold text-xl text-primary">Current Cart</h2>
            <span className="bg-primary text-white text-[10px] font-bold h-5 w-5 flex items-center justify-center rounded-full">
              {cart.reduce((acc, item) => acc + item.quantity, 0)}
            </span>
          </div>
          <p className="text-xs text-on-surface-variant/70 uppercase tracking-widest font-semibold">
            Transaction #082492
          </p>
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
              Customer name
            </label>
            <Input
              placeholder="Walk-in or customer name"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4 no-scrollbar">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-on-surface-variant opacity-50 space-y-2">
              <ShoppingCart size={48} strokeWidth={1} />
              <p className="text-sm font-medium">Your cart is empty</p>
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
            <span className="text-on-surface-variant font-medium">Subtotal</span>
            <span className="text-slate-900 dark:text-slate-100 font-bold">${subtotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-on-surface-variant font-medium">{taxLabel}</span>
            <span className="text-slate-900 dark:text-slate-100 font-bold">${tax.toFixed(2)}</span>
          </div>
          <div className="pt-3 border-t border-black/10 flex justify-between items-end">
            <span className="text-on-surface-variant font-bold uppercase tracking-widest text-xs">Total Amount</span>
            <span className="text-3xl font-headline font-black text-primary">${total.toFixed(2)}</span>
          </div>
        </div>

        <div className="p-6 pt-0 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Button variant="secondary" className="flex items-center gap-2 py-3">
              <Banknote size={18} /> Cash
            </Button>
            <Button
              variant="secondary"
              className="flex items-center gap-2 py-3 border-2 border-primary text-primary bg-transparent"
            >
              <CreditCard size={18} /> Card
            </Button>
          </div>
          <Button
            disabled={cart.length === 0}
            onClick={handleProcessSale}
            className="w-full py-4 text-lg shadow-xl flex items-center justify-center gap-3"
          >
            Process Sale <ArrowRight size={20} />
          </Button>
        </div>
      </section>

      <Modal
        isOpen={isSuccessModalOpen}
        onClose={() => setIsSuccessModalOpen(false)}
        title="Payment Successful"
      >
        <div className="text-center space-y-4">
          <div className="w-20 h-20 bg-tertiary-container/20 text-on-tertiary-container rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 size={48} />
          </div>
          <div>
            <h4 className="text-2xl font-black font-headline text-primary">Transaction Complete</h4>
            <p className="text-on-surface-variant">The order has been processed and stock updated.</p>
          </div>
          <div className="pt-6 flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => setIsSuccessModalOpen(false)}>
              Print Receipt
            </Button>
            <Button className="flex-1" onClick={() => setIsSuccessModalOpen(false)}>
              Done
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
