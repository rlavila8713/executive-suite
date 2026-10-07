/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { Sidebar, TopBar, MobileNavDrawer } from './components/Navigation';
import { Button } from './components/ui';
import { Dashboard } from './features/Dashboard';
import { Products } from './features/Products';
import { Import } from './features/Import';
import { Categories } from './features/Categories';
import { Subcategories } from './features/Subcategories';
import { Locations } from './features/Locations';
import { Customers } from './features/Customers';
import { Cash } from './features/Cash';
import { Reconciliation } from './features/Reconciliation';
import { POS } from './features/POS';
import { Expenses } from './features/Expenses';
import { Reports } from './features/Reports';
import { Receivables } from './features/Receivables';
import { Payables } from './features/Payables';
import { Help } from './features/Help';
import { Inventory } from './features/Inventory';
import { Warehouse } from './features/Warehouse';
import { Settings } from './features/Settings';
import { useAppState } from './hooks/useAppState';
import { Screen } from './types';
import { initialsFromName } from './lib/utils';
import { I18nProvider, useI18n } from './i18n/I18nContext';
import { ConnectionBanner } from './api/connection';

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
    case 'subcategories':
      return t('app.search.categories');
    case 'locations':
      return t('app.search.unused');
    case 'customers':
      return t('customers.searchPlaceholder');
    case 'cash':
    case 'reconciliation':
    case 'import':
      return t('app.search.unused');
    case 'expenses':
      return t('app.search.expenses');
    case 'receivables':
      return t('receivables.searchPlaceholder');
    case 'payables':
      return t('payables.searchPlaceholder');
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
    case 'import':
      return t('app.titles.import');
    case 'warehouse':
      return t('app.titles.warehouse');
    case 'categories':
      return t('app.titles.categories');
    case 'subcategories':
      return t('app.titles.subcategories');
    case 'locations':
      return t('app.titles.locations');
    case 'customers':
      return t('app.titles.customers');
    case 'cash':
      return t('app.titles.cash');
    case 'reconciliation':
      return t('app.titles.reconciliation');
    case 'pos':
      return t('app.titles.pos');
    case 'expenses':
      return t('app.titles.expenses');
    case 'receivables':
      return t('app.titles.receivables');
    case 'payables':
      return t('app.titles.payables');
    case 'reports':
      return t('app.titles.reports');
    case 'inventory':
      return t('app.titles.inventory');
    case 'help':
      return t('app.titles.help');
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
  const [subcategoriesFilterCategoryId, setSubcategoriesFilterCategoryId] = useState<string | undefined>();

  const {
    currentScreen,
    setCurrentScreen,
    products,
    cart,
    transactions,
    expenses,
    appSettings,
    productCategories,
    productSubcategories,
    productLocations,
    customers,
    customersHighlightId,
    setCustomersHighlightId,
    openCustomerProfile,
    addToCart,
    removeFromCart,
    updateCartQuantity,
    setCartItemQuantity,
    processSale,
    addProduct,
    updateProduct,
    receiveProductStock,
    transferWarehouseToStore,
    deleteProduct,
    importProducts,
    warehouseSections,
    warehouseStock,
    warehouseSummary,
    warehouseMovements,
    addWarehouseSection,
    updateWarehouseSection,
    deleteWarehouseSection,
    reassignWarehouseSection,
    addExpense,
    updateExpense,
    deleteExpense,
    addTransaction,
    updateTransaction,
    reverseSale,
    collectReceivable,
    payPayable,
    voidPayable,
    registerCustomerForReceivable,
    updateAppSettings,
    addProductCategory,
    renameProductCategory,
    deleteProductCategory,
    addSubcategory,
    updateSubcategory,
    deleteSubcategory,
    addLocation,
    updateLocation,
    deleteLocation,
    addCustomer,
    updateCustomer,
    deleteCustomer,
    fetchNextSku,
    cashSessions,
    licenseInfo,
    licenseUsable,
    openCashSession,
    closeCashSession,
    correctCashSessionClose,
    requestLicense,
    activateLicense,
    factoryReset,
    apiConnected,
    apiChecking,
    retryApiConnection,
    refreshData,
  } = props;

  const [settingsInitialSection, setSettingsInitialSection] = useState<'billing' | undefined>();

  const licenseBlocked =
    licenseInfo != null &&
    (licenseInfo.status === 'expired' || licenseInfo.status === 'device_mismatch');

  useEffect(() => {
    document.documentElement.classList.toggle('dark', appSettings.darkMode);
  }, [appSettings.darkMode]);

  useEffect(() => {
    if (licenseBlocked && currentScreen !== 'settings') {
      setSettingsInitialSection('billing');
      setCurrentScreen('settings');
    }
  }, [licenseBlocked, currentScreen, setCurrentScreen]);

  const renderScreen = () => {
    switch (currentScreen) {
      case 'dashboard':
        return (
          <Dashboard
            transactions={transactions}
            products={products}
            expenses={expenses}
            cashSessions={cashSessions}
            headerSearch={globalSearch}
            onNavigate={setCurrentScreen}
            onAddTransaction={addTransaction}
            onUpdateTransaction={updateTransaction}
            onReverseSale={reverseSale}
          />
        );
      case 'products':
        return (
          <Products
            products={products}
            productCategories={productCategories}
            productSubcategories={productSubcategories}
            productLocations={productLocations}
            globalSearch={globalSearch}
            onAdd={addProduct}
            onUpdate={updateProduct}
            onDelete={deleteProduct}
            onFetchNextSku={fetchNextSku}
          />
        );
      case 'import':
        return <Import onImport={importProducts} />;
      case 'warehouse':
        return (
          <Warehouse
            products={products}
            sections={warehouseSections}
            stock={warehouseStock}
            summary={warehouseSummary}
            movements={warehouseMovements}
            globalSearch={globalSearch}
            onAddSection={addWarehouseSection}
            onUpdateSection={updateWarehouseSection}
            onDeleteSection={deleteWarehouseSection}
            onReassignSection={reassignWarehouseSection}
            onReceiveStock={receiveProductStock}
            onTransferToStore={transferWarehouseToStore}
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
            onManageSubcategories={(categoryId) => {
              setSubcategoriesFilterCategoryId(categoryId);
              setCurrentScreen('subcategories');
            }}
          />
        );
      case 'subcategories':
        return (
          <Subcategories
            categories={productCategories}
            subcategories={productSubcategories}
            products={products}
            filterCategoryId={subcategoriesFilterCategoryId}
            globalSearch={globalSearch}
            onAdd={addSubcategory}
            onUpdate={updateSubcategory}
            onDelete={deleteSubcategory}
          />
        );
      case 'locations':
        return (
          <Locations
            locations={productLocations}
            products={products}
            globalSearch={globalSearch}
            onAdd={addLocation}
            onUpdate={updateLocation}
            onDelete={deleteLocation}
          />
        );
      case 'customers':
        return (
          <Customers
            customers={customers}
            globalSearch={globalSearch}
            highlightId={customersHighlightId}
            onAdd={addCustomer}
            onUpdate={updateCustomer}
            onDelete={deleteCustomer}
          />
        );
      case 'cash':
        return (
          <Cash
            cashSessions={cashSessions}
            transactions={transactions}
            onOpenCashSession={openCashSession}
            onCloseCashSession={closeCashSession}
            onCorrectCashSessionClose={correctCashSessionClose}
            onRefresh={refreshData}
          />
        );
      case 'reconciliation':
        return <Reconciliation transactions={transactions} products={products} expenses={expenses} />;
      case 'pos':
        return (
          <POS
            products={products}
            productCategories={productCategories}
            productSubcategories={productSubcategories}
            customers={customers}
            cart={cart}
            taxRatePercent={appSettings.taxRate}
            cardQrPayload={appSettings.cardQrPayload}
            transferAccountNumber={appSettings.transferAccountNumber}
            transferPhoneNumber={appSettings.transferPhoneNumber}
            storeName={appSettings.storeName}
            storeBranch={appSettings.branch}
            storeCurrency={appSettings.currency}
            storeLogoUrl={appSettings.storeLogoUrl}
            globalSearch={globalSearch}
            cashSessionOpen={cashSessions.some((s) => s.closedAt == null)}
            licenseActive={licenseUsable}
            onGoToCash={() => setCurrentScreen('cash')}
            onGoToBilling={() => {
              setSettingsInitialSection('billing');
              setCurrentScreen('settings');
            }}
            addToCart={addToCart}
            removeFromCart={removeFromCart}
            updateQuantity={updateCartQuantity}
            setItemQuantity={setCartItemQuantity}
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
      case 'receivables':
        return (
          <Receivables
            transactions={transactions}
            customers={customers}
            globalSearch={globalSearch}
            taxRatePercent={appSettings.taxRate}
            cardQrPayload={appSettings.cardQrPayload}
            transferAccountNumber={appSettings.transferAccountNumber}
            transferPhoneNumber={appSettings.transferPhoneNumber}
            onCollect={async (id, method) => {
              await collectReceivable(id, method);
            }}
            onOpenCustomer={(id) => {
              openCustomerProfile(id);
            }}
            onRegisterCustomer={async (tx) => {
              await registerCustomerForReceivable(tx.id, tx.customer);
            }}
          />
        );
      case 'payables':
        return (
          <Payables
            transactions={transactions}
            globalSearch={globalSearch}
            transferAccountNumber={appSettings.transferAccountNumber}
            transferPhoneNumber={appSettings.transferPhoneNumber}
            onPay={payPayable}
            onVoid={voidPayable}
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
            productCategories={productCategories}
            productSubcategories={productSubcategories}
            globalSearch={globalSearch}
            onSyncStock={refreshData}
            syncBusy={apiChecking}
          />
        );
      case 'help':
        return <Help onNavigate={setCurrentScreen} />;
      case 'settings':
        return (
          <Settings
            settings={appSettings}
            licenseInfo={licenseInfo}
            onUpdate={updateAppSettings}
            onRequestLicense={requestLicense}
            onActivateLicense={activateLicense}
            onFactoryReset={factoryReset}
            apiConnected={apiConnected}
            apiChecking={apiChecking}
            onRetryApiConnection={retryApiConnection}
            onDataChanged={refreshData}
            initialSection={settingsInitialSection}
          />
        );
      default:
        return (
          <Dashboard
            transactions={transactions}
            products={products}
            expenses={expenses}
            cashSessions={cashSessions}
            headerSearch={globalSearch}
            onNavigate={setCurrentScreen}
            onAddTransaction={addTransaction}
            onUpdateTransaction={updateTransaction}
            onReverseSale={reverseSale}
          />
        );
    }
  };

  const searchDisabled =
    currentScreen === 'reports' ||
    currentScreen === 'settings' ||
    currentScreen === 'help' ||
    currentScreen === 'cash' ||
    currentScreen === 'reconciliation' ||
    currentScreen === 'import' ||
    currentScreen === 'locations';

  return (
    <div className="flex min-h-screen min-h-[100dvh] bg-background text-primary">
      <Sidebar
        currentScreen={currentScreen}
        onNavigate={setCurrentScreen}
        storeName={appSettings.storeName}
        branchLabel={appSettings.branch}
        storeLogoUrl={appSettings.storeLogoUrl}
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
        storeLogoUrl={appSettings.storeLogoUrl}
        managerName={appSettings.managerName}
        managerTitle={appSettings.managerTitle}
      />

      <main className="reports-print-main flex-1 flex flex-col min-h-0 min-h-screen md:ml-[15.5rem] w-full max-w-full overflow-x-hidden">
        <ConnectionBanner
          connected={apiConnected}
          checking={apiChecking}
          onRetry={retryApiConnection}
        />
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

        <div className="flex-1 min-h-0 min-w-0 p-4 sm:p-6 md:p-8 pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] md:pb-8 max-w-[1400px] mx-auto w-full relative">
          {licenseBlocked && currentScreen !== 'settings' ? (
            <div className="absolute inset-0 z-40 bg-background/80 backdrop-blur-sm flex items-center justify-center p-6">
              <div className="max-w-md text-center space-y-4">
                <h3 className="text-xl font-black text-primary">
                  {licenseInfo?.status === 'device_mismatch'
                    ? t('license.deviceMismatchTitle')
                    : t('license.expiredTitle')}
                </h3>
                <p className="text-sm text-on-surface-variant">
                  {licenseInfo?.status === 'device_mismatch'
                    ? t('license.deviceMismatchBody')
                    : t('license.expiredBody')}
                </p>
                <Button
                  onClick={() => {
                    setSettingsInitialSection('billing');
                    setCurrentScreen('settings');
                  }}
                >
                  {t('license.goToBilling')}
                </Button>
              </div>
            </div>
          ) : null}
          {renderScreen()}
        </div>
      </main>

      <div className="no-print md:hidden fixed z-50 bottom-[max(1.25rem,env(safe-area-inset-bottom,0.75rem))] right-[max(1.25rem,env(safe-area-inset-right,0.75rem))]">
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
