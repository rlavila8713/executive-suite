import { useEffect } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  Package,
  Tags,
  FileUp,
  Layers,
  MapPin,
  Wallet,
  Scale,
  ShoppingCart,
  Receipt,
  BarChart3,
  Boxes,
  Settings,
  Bell,
  Search,
  Menu,
  X,
} from 'lucide-react';
import { Screen } from '../types';
import { cn, initialsFromName } from '../lib/utils';
import { useI18n } from '../i18n/I18nContext';

type MenuItem = {
  id: Screen;
  label: string;
  icon: LucideIcon;
  emphasis?: boolean;
};

type MenuGroup = {
  id: string;
  label: string;
  items: MenuItem[];
};

function useMenuGroups(): MenuGroup[] {
  const { t } = useI18n();
  return [
    {
      id: 'overview',
      label: t('nav.groupOverview'),
      items: [{ id: 'dashboard', label: t('nav.dashboard'), icon: LayoutDashboard }],
    },
    {
      id: 'sales',
      label: t('nav.groupSales'),
      items: [
        { id: 'pos', label: t('nav.pos'), icon: ShoppingCart, emphasis: true },
        { id: 'cash', label: t('nav.cash'), icon: Wallet },
        { id: 'reconciliation', label: t('nav.reconciliation'), icon: Scale },
      ],
    },
    {
      id: 'catalog',
      label: t('nav.groupCatalog'),
      items: [
        { id: 'products', label: t('nav.products'), icon: Package },
        { id: 'inventory', label: t('nav.inventory'), icon: Boxes },
        { id: 'import', label: t('nav.import'), icon: FileUp },
        { id: 'categories', label: t('nav.categories'), icon: Tags },
        { id: 'subcategories', label: t('nav.subcategories'), icon: Layers },
        { id: 'locations', label: t('nav.locations'), icon: MapPin },
      ],
    },
    {
      id: 'finance',
      label: t('nav.groupFinance'),
      items: [
        { id: 'expenses', label: t('nav.expenses'), icon: Receipt },
        { id: 'reports', label: t('nav.reports'), icon: BarChart3 },
      ],
    },
    {
      id: 'system',
      label: t('nav.groupSystem'),
      items: [{ id: 'settings', label: t('nav.settings'), icon: Settings }],
    },
  ];
}

function NavMenu({
  groups,
  currentScreen,
  onSelect,
  compact,
}: {
  groups: MenuGroup[];
  currentScreen: Screen;
  onSelect: (screen: Screen) => void;
  compact?: boolean;
}) {
  return (
    <div className={cn('space-y-1', compact ? 'pr-1' : '')}>
      {groups.map((group, groupIndex) => (
        <div key={group.id} className={cn(groupIndex > 0 ? 'pt-3 mt-1 border-t border-slate-200/80 dark:border-slate-700/60' : '')}>
          <p
            className={cn(
              'px-3 mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500',
              groupIndex === 0 ? 'pt-0' : 'pt-2',
            )}
          >
            {group.label}
          </p>
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const Icon = item.icon;
              const isActive = currentScreen === item.id;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(item.id)}
                    className={cn(
                      'w-full flex items-center gap-2.5 rounded-lg text-left transition-colors duration-150',
                      compact ? 'px-3 py-2.5' : 'px-3 py-2',
                      isActive
                        ? 'bg-white dark:bg-slate-800 text-primary shadow-sm ring-1 ring-black/5 dark:ring-white/10'
                        : item.emphasis
                          ? 'text-slate-700 dark:text-slate-200 hover:bg-slate-200/80 dark:hover:bg-slate-800 font-semibold'
                          : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-slate-100',
                    )}
                  >
                    <Icon
                      size={18}
                      className={cn('shrink-0', isActive ? 'text-primary' : item.emphasis ? 'text-primary/80' : '')}
                    />
                    <span className="text-sm font-medium leading-tight truncate">{item.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

interface SidebarProps {
  currentScreen: Screen;
  onNavigate: (screen: Screen) => void;
  storeName?: string;
  branchLabel?: string;
  managerName?: string;
  managerTitle?: string;
}

export function Sidebar({
  currentScreen,
  onNavigate,
  storeName = 'Executive Suite',
  branchLabel = 'Main Branch',
  managerName = 'Manager',
  managerTitle = 'Staff',
}: SidebarProps) {
  const groups = useMenuGroups();

  return (
    <aside className="no-print hidden md:flex h-screen w-[15.5rem] fixed left-0 top-0 bg-slate-100 dark:bg-slate-900 flex-col z-50 border-r border-black/5 dark:border-white/5">
      <div className="shrink-0 px-4 pt-5 pb-4 border-b border-slate-200/80 dark:border-slate-700/60">
        <h1 className="text-sm font-black text-slate-800 dark:text-slate-100 uppercase tracking-wide font-headline line-clamp-2 leading-snug">
          {storeName}
        </h1>
        <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold line-clamp-2 mt-1">{branchLabel}</p>
      </div>

      <nav className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-2 py-3 no-scrollbar">
        <NavMenu groups={groups} currentScreen={currentScreen} onSelect={onNavigate} />
      </nav>

      <div className="shrink-0 m-3 p-3 bg-white/60 dark:bg-slate-800/60 rounded-xl border border-black/5 dark:border-white/5">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className="w-9 h-9 rounded-full bg-primary text-white flex items-center justify-center text-[10px] font-bold shrink-0"
            aria-hidden
          >
            {initialsFromName(managerName)}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-primary line-clamp-1">{managerName}</p>
            <p className="text-[10px] text-slate-500 line-clamp-1">{managerTitle}</p>
          </div>
        </div>
      </div>
    </aside>
  );
}

export type MobileNavDrawerProps = SidebarProps & {
  open: boolean;
  onClose: () => void;
};

export function MobileNavDrawer({
  open,
  onClose,
  currentScreen,
  onNavigate,
  storeName = 'Executive Suite',
  branchLabel = 'Main Branch',
  managerName = 'Manager',
  managerTitle = 'Staff',
}: MobileNavDrawerProps) {
  const { t } = useI18n();
  const groups = useMenuGroups();

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  const go = (screen: Screen) => {
    onNavigate(screen);
    onClose();
  };

  return (
    <div className="no-print fixed inset-0 z-[70] md:hidden" role="dialog" aria-modal="true" aria-label={t('nav.openMenu')}>
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        aria-label={t('nav.closeMenu')}
        onClick={onClose}
      />
      <aside className="absolute left-0 top-0 bottom-0 w-[min(18.5rem,88vw)] bg-slate-100 dark:bg-slate-900 shadow-2xl flex flex-col animate-in slide-in-from-left duration-200">
        <div className="shrink-0 flex items-start justify-between gap-2 px-4 pt-4 pb-3 border-b border-slate-200/80 dark:border-slate-700/60">
          <div className="min-w-0 pr-8">
            <h1 className="text-sm font-black text-slate-800 dark:text-slate-100 uppercase tracking-wide font-headline line-clamp-2">
              {storeName}
            </h1>
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold line-clamp-2 mt-1">{branchLabel}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="absolute top-3 right-3 p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800"
            aria-label={t('nav.closeMenu')}
          >
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-2 py-3">
          <NavMenu groups={groups} currentScreen={currentScreen} onSelect={go} compact />
        </nav>

        <div className="shrink-0 m-3 p-3 bg-white/60 dark:bg-slate-800/60 rounded-xl border border-black/5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="w-9 h-9 rounded-full bg-primary text-white flex items-center justify-center text-[10px] font-bold shrink-0"
              aria-hidden
            >
              {initialsFromName(managerName)}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-primary line-clamp-1">{managerName}</p>
              <p className="text-[10px] text-slate-500 line-clamp-1">{managerTitle}</p>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

interface TopBarProps {
  title: string;
  userInitials?: string;
  searchQuery?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  onOpenMobileNav?: () => void;
}

export function TopBar({
  title,
  userInitials = 'JV',
  searchQuery = '',
  onSearchChange,
  searchPlaceholder,
  onOpenMobileNav,
}: TopBarProps) {
  const { t } = useI18n();
  const placeholder = searchPlaceholder ?? t('common.search');
  return (
    <header className="no-print w-full min-h-14 md:h-16 shrink-0 sticky top-0 z-40 bg-slate-50 dark:bg-slate-950 border-b border-black/5">
      <div className="flex h-auto md:h-16 min-h-14 w-full flex-nowrap items-center gap-2 sm:gap-3 md:gap-4 px-4 sm:px-6 md:px-8 py-2 md:py-0">
        <div className="flex min-w-0 shrink-0 items-center gap-2 md:max-w-[min(42%,18rem)]">
          {onOpenMobileNav ? (
            <button
              type="button"
              onClick={onOpenMobileNav}
              className="md:hidden p-2 -ml-1 rounded-lg text-slate-800 dark:text-slate-100 hover:bg-slate-200/70 dark:hover:bg-slate-800 shrink-0"
              aria-label={t('nav.openMenu')}
            >
              <Menu size={22} />
            </button>
          ) : null}
          <h2 className="text-base sm:text-lg md:text-xl font-bold tracking-tighter text-slate-900 dark:text-slate-50 font-headline truncate min-w-0">
            {title}
          </h2>
        </div>

        {onSearchChange ? (
          <div className="flex min-w-0 flex-1 justify-center md:px-2">
            <div className="flex w-full max-w-md items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 dark:bg-slate-900 sm:px-4 min-w-0">
              <Search size={14} className="shrink-0 text-slate-400" />
              <input
                type="search"
                enterKeyHint="search"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder={placeholder}
                className="w-full min-w-0 border-none bg-transparent text-xs text-slate-600 outline-none placeholder:text-slate-400 focus:ring-0 dark:text-slate-300"
                aria-label={t('nav.globalSearchAria')}
              />
            </div>
          </div>
        ) : (
          <div className="min-w-0 flex-1" aria-hidden />
        )}

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <button
            type="button"
            className="rounded-full p-2 transition-all hover:bg-slate-200/50 dark:hover:bg-slate-800/50"
            aria-label="Notifications"
          >
            <Bell size={20} className="text-slate-700 dark:text-slate-200" />
          </button>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-container text-xs font-bold text-white">
            {userInitials.slice(0, 3)}
          </div>
        </div>
      </div>
    </header>
  );
}
