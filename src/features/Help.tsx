import { BookOpen, ChevronRight } from 'lucide-react';
import { Card } from '../components/ui';
import { useI18n } from '../i18n/I18nContext';
import type { Screen } from '../types';
import { cn } from '../lib/utils';

type HelpSection = {
  id: string;
  screen?: Screen;
  titleKey: string;
  bodyKey: string;
  groupKey: string;
};

const HELP_SECTIONS: HelpSection[] = [
  { id: 'dashboard', screen: 'dashboard', groupKey: 'help.groupOverview', titleKey: 'help.dashboardTitle', bodyKey: 'help.dashboardBody' },
  { id: 'pos', screen: 'pos', groupKey: 'help.groupSales', titleKey: 'help.posTitle', bodyKey: 'help.posBody' },
  { id: 'cash', screen: 'cash', groupKey: 'help.groupSales', titleKey: 'help.cashTitle', bodyKey: 'help.cashBody' },
  { id: 'reconciliation', screen: 'reconciliation', groupKey: 'help.groupSales', titleKey: 'help.reconciliationTitle', bodyKey: 'help.reconciliationBody' },
  { id: 'products', screen: 'products', groupKey: 'help.groupCatalogMaster', titleKey: 'help.productsTitle', bodyKey: 'help.productsBody' },
  { id: 'import', screen: 'import', groupKey: 'help.groupCatalogMaster', titleKey: 'help.importTitle', bodyKey: 'help.importBody' },
  { id: 'categories', screen: 'categories', groupKey: 'help.groupCatalogMaster', titleKey: 'help.categoriesTitle', bodyKey: 'help.categoriesBody' },
  { id: 'subcategories', screen: 'subcategories', groupKey: 'help.groupCatalogMaster', titleKey: 'help.subcategoriesTitle', bodyKey: 'help.subcategoriesBody' },
  { id: 'locations', screen: 'locations', groupKey: 'help.groupCatalogMaster', titleKey: 'help.locationsTitle', bodyKey: 'help.locationsBody' },
  { id: 'customers', screen: 'customers', groupKey: 'help.groupCatalogMaster', titleKey: 'help.customersTitle', bodyKey: 'help.customersBody' },
  { id: 'warehouse', screen: 'warehouse', groupKey: 'help.groupStock', titleKey: 'help.warehouseTitle', bodyKey: 'help.warehouseBody' },
  { id: 'inventory', screen: 'inventory', groupKey: 'help.groupStock', titleKey: 'help.inventoryTitle', bodyKey: 'help.inventoryBody' },
  { id: 'expenses', screen: 'expenses', groupKey: 'help.groupFinance', titleKey: 'help.expensesTitle', bodyKey: 'help.expensesBody' },
  { id: 'receivables', screen: 'receivables', groupKey: 'help.groupFinance', titleKey: 'help.receivablesTitle', bodyKey: 'help.receivablesBody' },
  { id: 'reports', screen: 'reports', groupKey: 'help.groupFinance', titleKey: 'help.reportsTitle', bodyKey: 'help.reportsBody' },
  { id: 'settings', screen: 'settings', groupKey: 'help.groupSystem', titleKey: 'help.settingsTitle', bodyKey: 'help.settingsBody' },
];

interface HelpProps {
  onNavigate?: (screen: Screen) => void;
}

export function Help({ onNavigate }: HelpProps) {
  const { t } = useI18n();
  let lastGroup = '';

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-3xl">
      <div className="flex items-start gap-3">
        <div className="p-3 rounded-xl bg-primary/10 text-primary shrink-0">
          <BookOpen size={28} />
        </div>
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-primary tracking-tight font-headline">{t('help.pageTitle')}</h2>
          <p className="text-on-surface-variant text-sm font-medium mt-2">{t('help.intro')}</p>
        </div>
      </div>

      <div className="space-y-4">
        {HELP_SECTIONS.map((section) => {
          const showGroup = section.groupKey !== lastGroup;
          lastGroup = section.groupKey;
          return (
            <div key={section.id}>
              {showGroup ? (
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500 mb-2 mt-4 first:mt-0">
                  {t(section.groupKey)}
                </p>
              ) : null}
              <Card className="p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-base font-bold text-primary mb-2">{t(section.titleKey)}</h3>
                    <p className="text-sm text-on-surface-variant leading-relaxed whitespace-pre-line">{t(section.bodyKey)}</p>
                  </div>
                  {section.screen && onNavigate ? (
                    <button
                      type="button"
                      onClick={() => onNavigate(section.screen!)}
                      className={cn(
                        'shrink-0 inline-flex items-center gap-1 text-xs font-bold text-primary',
                        'hover:underline',
                      )}
                    >
                      {t('help.goToModule')} <ChevronRight size={14} />
                    </button>
                  ) : null}
                </div>
              </Card>
            </div>
          );
        })}
      </div>
    </div>
  );
}
