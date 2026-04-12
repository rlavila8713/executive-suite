import { useState, useEffect } from 'react';
import { Product, CartItem, Transaction, Expense, Screen } from '../types';
import { MOCK_PRODUCTS, MOCK_TRANSACTIONS, MOCK_EXPENSES } from '../constants';

export function useAppState() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('dashboard');
  const [products, setProducts] = useState<Product[]>(MOCK_PRODUCTS);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>(MOCK_TRANSACTIONS);
  const [expenses, setExpenses] = useState<Expense[]>(MOCK_EXPENSES);
  const [isAuthReady, setIsAuthReady] = useState(true);

  const addToCart = (product: Product) => {
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        return prev.map(item => 
          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { ...product, quantity: 1 }];
    });
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => prev.filter(item => item.id !== productId));
  };

  const updateCartQuantity = (productId: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.id === productId) {
        const newQty = Math.max(1, item.quantity + delta);
        return { ...item, quantity: newQty };
      }
      return item;
    }));
  };

  const clearCart = () => setCart([]);

  const processSale = () => {
    const total = cart.reduce((acc, item) => acc + item.price * item.quantity, 0);
    const newTransaction: Transaction = {
      id: Math.random().toString(36).substr(2, 9),
      orderNumber: `#${Math.floor(Math.random() * 90000) + 10000}`,
      customer: 'Walk-in Customer',
      amount: total,
      status: 'completed',
      timestamp: 'Just now',
      type: 'sale'
    };
    setTransactions(prev => [newTransaction, ...prev]);
    
    // Update stock
    setProducts(prev => prev.map(p => {
      const cartItem = cart.find(ci => ci.id === p.id);
      if (cartItem) {
        return { ...p, stock: Math.max(0, p.stock - cartItem.quantity) };
      }
      return p;
    }));
    
    clearCart();
  };

  const addProduct = (product: Omit<Product, 'id'>) => {
    const newProduct = { ...product, id: Math.random().toString(36).substr(2, 9) };
    setProducts(prev => [...prev, newProduct]);
  };

  const updateProduct = (id: string, updates: Partial<Product>) => {
    setProducts(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
  };

  const deleteProduct = (id: string) => {
    setProducts(prev => prev.filter(p => p.id !== id));
  };

  return {
    currentScreen,
    setCurrentScreen,
    products,
    cart,
    transactions,
    expenses,
    addToCart,
    removeFromCart,
    updateCartQuantity,
    clearCart,
    processSale,
    addProduct,
    updateProduct,
    deleteProduct
  };
}
