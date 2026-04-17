/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { Sidebar, TopBar, MobileNavDrawer } from './components/Navigation';
import { Dashboard } from './features/Dashboard';
import { Products } from './features/Products';
import { Categories } from './features/Categories';
import { POS } from './features/POS';
import { Expenses } from './features/Expenses';
import { Reports } from './features/Reports';
import { Inventory } from './features/Inventory';
import { Settings } from './features/Settings';
import { useAppState } from './hooks/useAppState';
import { Screen } from './types';
import { initialsFromName } from './lib/utils';
import { I18nProvider, useI18n } from './i18n/I18nContext';

function searchPlaceholderForScreen(screen: Screen, t: (k: string) => string): string {
  switch (screen) {
    case 'dashboard':
      return t('app.search.transactions');
    case 'products':
    case 'inventory':
    case 'pos':
      return t('app.search.products');
    case 'categories':
      return t('app.search.categories');
    case 'expenses':
      return t('app.search.expenses');
    case 'reports':
    case 'settings':
      return t('app.search.unused');
    default:
      return t('common.search');
  }
}

function getTitle(screen: Screen, storeName: string, t: (k: string) => string): string {
  switch (screen) {
    case 'dashboard':
      return storeName;
    case 'products':
      return t('app.titles.products');
    case 'categories':
      return t('app.titles.categories');
    case 'pos':
      return t('app.titles.pos');
    case 'expenses':
      return t('app.titles.expenses');
    case 'reports':
      return t('app.titles.reports');
    case 'inventory':
      return t('app.titles.inventory');
    case 'settings':
      return t('app.titles.settings');
    default:
      return storeName;
  }
}

type AppState = ReturnType<typeof useAppState>;

function AppView(props: AppState) {
  const { t } = useI18n();
  const [globalSearch, setGlobalSearch] = useState('');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const {
    currentScreen,
    setCurrentScreen,
    products,
    cart,
    transactions,
    expenses,
    appSettings,
    productCategories,
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
    addProductCategory,
    renameProductCategory,
    deleteProductCategory,
    cashSessions,
    openCashSession,
    closeCashSession,
  } = props;

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
            productCategories={productCategories}
            globalSearch={globalSearch}
            onAdd={addProduct}
            onUpdate={updateProduct}
            onDelete={deleteProduct}
          />
        );
      case 'categories':
        return (
          <Categories
            categories={productCategories}
            products={products}
            globalSearch={globalSearch}
            onAdd={addProductCategory}
            onRename={renameProductCategory}
            onDelete={deleteProductCategory}
          />
        );
      case 'pos':
        return (
          <POS
            products={products}
            productCategoryNames={productCategories.map((c) => c.name)}
            cart={cart}
            taxRatePercent={appSettings.taxRate}
            cardQrPayload={appSettings.cardQrPayload}
            storeName={appSettings.storeName}
            storeBranch={appSettings.branch}
            storeCurrency={appSettings.currency}
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
        return (
          <Reports
            transactions={transactions}
            expenses={expenses}
            products={products}
            cashSessions={cashSessions}
            onOpenCashSession={openCashSession}
            onCloseCashSession={closeCashSession}
          />
        );
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

  const searchDisabled = currentScreen === 'reports' || currentScreen === 'settings';

  return (
    <div className="flex min-h-screen min-h-[100dvh] bg-background text-primary">
      <Sidebar
        currentScreen={currentScreen}
        onNavigate={setCurrentScreen}
        storeName={appSettings.storeName}
        branchLabel={appSettings.branch}
        managerName={appSettings.managerName}
        managerTitle={appSettings.managerTitle}
      />

      <MobileNavDrawer
        open={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
        currentScreen={currentScreen}
        onNavigate={setCurrentScreen}
        storeName={appSettings.storeName}
        branchLabel={appSettings.branch}
        managerName={appSettings.managerName}
        managerTitle={appSettings.managerTitle}
      />

      <main className="flex-1 flex flex-col min-h-0 min-h-screen md:ml-64 w-full max-w-full overflow-x-hidden">
        <TopBar
          title={getTitle(currentScreen, appSettings.storeName, t)}
          userInitials={initialsFromName(appSettings.managerName)}
          onOpenMobileNav={() => setMobileNavOpen(true)}
          {...(searchDisabled
            ? {}
            : {
                searchQuery: globalSearch,
                onSearchChange: setGlobalSearch,
                searchPlaceholder: searchPlaceholderForScreen(currentScreen, t),
              })}
        />

        <div className="flex-1 min-h-0 min-w-0 p-4 sm:p-6 md:p-8 pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] md:pb-8 max-w-[1400px] mx-auto w-full">
          {renderScreen()}
        </div>
      </main>

      <div className="md:hidden fixed z-50 bottom-[max(1.25rem,env(safe-area-inset-bottom,0.75rem))] right-[max(1.25rem,env(safe-area-inset-right,0.75rem))]">
        <button
          type="button"
          className="w-14 h-14 bg-primary text-white rounded-full shadow-2xl flex items-center justify-center active:scale-95 transition-all [touch-action:manipulation]"
          onClick={() => setCurrentScreen('pos')}
          aria-label={t('nav.pos')}
        >
          <span className="material-symbols-outlined" aria-hidden>
            shopping_cart
          </span>
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const state = useAppState();
  return (
    <I18nProvider locale={state.appSettings.locale}>
      <AppView {...state} />
    </I18nProvider>
  );
}
