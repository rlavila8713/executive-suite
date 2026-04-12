/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Sidebar, TopBar } from './components/Navigation';
import { Dashboard } from './features/Dashboard';
import { Products } from './features/Products';
import { POS } from './features/POS';
import { Expenses } from './features/Expenses';
import { Reports } from './features/Reports';
import { Inventory } from './features/Inventory';
import { Settings } from './features/Settings';
import { useAppState } from './hooks/useAppState';
import { Screen } from './types';

export default function App() {
  const {
    currentScreen,
    setCurrentScreen,
    products,
    cart,
    transactions,
    expenses,
    addToCart,
    removeFromCart,
    updateCartQuantity,
    processSale,
    addProduct,
    updateProduct,
    deleteProduct
  } = useAppState();

  const renderScreen = () => {
    switch (currentScreen) {
      case 'dashboard':
        return <Dashboard transactions={transactions} products={products} onNavigate={setCurrentScreen} />;
      case 'products':
        return (
          <Products 
            products={products} 
            onAdd={addProduct} 
            onUpdate={updateProduct} 
            onDelete={deleteProduct} 
          />
        );
      case 'pos':
        return (
          <POS 
            products={products} 
            cart={cart} 
            addToCart={addToCart} 
            removeFromCart={removeFromCart} 
            updateQuantity={updateCartQuantity} 
            onCheckout={processSale} 
          />
        );
      case 'expenses':
        return <Expenses expenses={expenses} />;
      case 'reports':
        return <Reports />;
      case 'inventory':
        return <Inventory products={products} onUpdateStock={(id, stock) => updateProduct(id, { stock })} />;
      case 'settings':
        return <Settings />;
      default:
        return <Dashboard transactions={transactions} products={products} onNavigate={setCurrentScreen} />;
    }
  };

  const getTitle = (screen: Screen) => {
    switch (screen) {
      case 'dashboard': return 'The Editorial Executive';
      case 'products': return 'Products Management';
      case 'pos': return 'Point of Sale';
      case 'expenses': return 'Expense Tracking';
      case 'reports': return 'Financial Intelligence';
      case 'inventory': return 'Inventory Control';
      case 'settings': return 'System Settings';
      default: return 'The Editorial Executive';
    }
  };

  return (
    <div className="flex min-h-screen bg-background text-primary">
      <Sidebar currentScreen={currentScreen} onNavigate={setCurrentScreen} />
      
      <main className="flex-1 md:ml-64 flex flex-col min-h-screen">
        <TopBar title={getTitle(currentScreen)} />
        
        <div className="flex-1 p-8 max-w-[1400px] mx-auto w-full">
          {renderScreen()}
        </div>
      </main>

      {/* Mobile Navigation Overlay (Simplified for prototype) */}
      <div className="md:hidden fixed bottom-6 right-6 z-50">
        <button 
          className="w-14 h-14 bg-primary text-white rounded-full shadow-2xl flex items-center justify-center active:scale-95 transition-all"
          onClick={() => setCurrentScreen('pos')}
        >
          <span className="material-symbols-outlined">add</span>
        </button>
      </div>
    </div>
  );
}
