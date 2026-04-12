/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
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
import { initialsFromName } from './lib/utils';

function searchPlaceholderForScreen(screen: Screen): string {
  switch (screen) {
    case 'dashboard':
      return 'Search transactions…';
    case 'products':
    case 'inventory':
    case 'pos':
      return 'Search products (name, SKU, category)…';
    case 'expenses':
      return 'Search expenses…';
    case 'reports':
    case 'settings':
      return 'Search not used on this page';
    default:
      return 'Search…';
  }
}

export default function App() {
  const [globalSearch, setGlobalSearch] = useState('');

  const {
    currentScreen,
    setCurrentScreen,
    products,
    cart,
    transactions,
    expenses,
    appSettings,
    addToCart,
    removeFromCart,
    updateCartQuantity,
    processSale,
    addProduct,
    updateProduct,
    deleteProduct,
    addExpense,
    updateExpense,
    deleteExpense,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    updateAppSettings,
  } = useAppState();

  useEffect(() => {
    document.documentElement.classList.toggle('dark', appSettings.darkMode);
  }, [appSettings.darkMode]);

  useEffect(() => {
    setGlobalSearch('');
  }, [currentScreen]);

  const renderScreen = () => {
    switch (currentScreen) {
      case 'dashboard':
        return (
          <Dashboard
            transactions={transactions}
            products={products}
            expenses={expenses}
            headerSearch={globalSearch}
            onNavigate={setCurrentScreen}
            onAddTransaction={addTransaction}
            onUpdateTransaction={updateTransaction}
            onDeleteTransaction={deleteTransaction}
          />
        );
      case 'products':
        return (
          <Products
            products={products}
            globalSearch={globalSearch}
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
            taxRatePercent={appSettings.taxRate}
            globalSearch={globalSearch}
            addToCart={addToCart}
            removeFromCart={removeFromCart}
            updateQuantity={updateCartQuantity}
            onCheckout={processSale}
          />
        );
      case 'expenses':
        return (
          <Expenses
            expenses={expenses}
            globalSearch={globalSearch}
            onAdd={addExpense}
            onUpdate={updateExpense}
            onDelete={deleteExpense}
          />
        );
      case 'reports':
        return <Reports transactions={transactions} expenses={expenses} products={products} />;
      case 'inventory':
        return (
          <Inventory
            products={products}
            globalSearch={globalSearch}
            onUpdateStock={(id, stock) => updateProduct(id, { stock })}
          />
        );
      case 'settings':
        return <Settings settings={appSettings} onUpdate={updateAppSettings} />;
      default:
        return (
          <Dashboard
            transactions={transactions}
            products={products}
            expenses={expenses}
            headerSearch={globalSearch}
            onNavigate={setCurrentScreen}
            onAddTransaction={addTransaction}
            onUpdateTransaction={updateTransaction}
            onDeleteTransaction={deleteTransaction}
          />
        );
    }
  };

  const getTitle = (screen: Screen) => {
    switch (screen) {
      case 'dashboard':
        return appSettings.storeName;
      case 'products':
        return 'Products Management';
      case 'pos':
        return 'Point of Sale';
      case 'expenses':
        return 'Expense Tracking';
      case 'reports':
        return 'Financial Intelligence';
      case 'inventory':
        return 'Inventory Control';
      case 'settings':
        return 'System Settings';
      default:
        return appSettings.storeName;
    }
  };

  const searchDisabled = currentScreen === 'reports' || currentScreen === 'settings';

  return (
    <div className="flex min-h-screen bg-background text-primary">
      <Sidebar
        currentScreen={currentScreen}
        onNavigate={setCurrentScreen}
        storeName={appSettings.storeName}
        branchLabel={appSettings.branch}
        managerName={appSettings.managerName}
        managerTitle={appSettings.managerTitle}
      />

      <main className="flex-1 md:ml-64 flex flex-col min-h-screen">
        <TopBar
          title={getTitle(currentScreen)}
          userInitials={initialsFromName(appSettings.managerName)}
          {...(searchDisabled
            ? {}
            : {
                searchQuery: globalSearch,
                onSearchChange: setGlobalSearch,
                searchPlaceholder: searchPlaceholderForScreen(currentScreen),
              })}
        />

        <div className="flex-1 p-8 max-w-[1400px] mx-auto w-full">{renderScreen()}</div>
      </main>

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
