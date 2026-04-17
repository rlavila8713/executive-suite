import { useEffect } from 'react';
import {
  LayoutDashboard,
  Package,
  Tags,
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

interface SidebarProps {
  currentScreen: Screen;
  onNavigate: (screen: Screen) => void;
  storeName?: string;
  branchLabel?: string;
  managerName?: string;
  managerTitle?: string;
}

function useMenuItems() {
  const { t } = useI18n();
  return [
    { id: 'dashboard' as const, label: t('nav.dashboard'), icon: LayoutDashboard },
    { id: 'products' as const, label: t('nav.products'), icon: Package },
    { id: 'categories' as const, label: t('nav.categories'), icon: Tags },
    { id: 'pos' as const, label: t('nav.pos'), icon: ShoppingCart },
    { id: 'expenses' as const, label: t('nav.expenses'), icon: Receipt },
    { id: 'reports' as const, label: t('nav.reports'), icon: BarChart3 },
    { id: 'inventory' as const, label: t('nav.inventory'), icon: Boxes },
    { id: 'settings' as const, label: t('nav.settings'), icon: Settings },
  ];
}

export function Sidebar({
  currentScreen,
  onNavigate,
  storeName = 'Executive Suite',
  branchLabel = 'Main Branch',
  managerName = 'Manager',
  managerTitle = 'Staff',
}: SidebarProps) {
  const menuItems = useMenuItems();

  return (
    <aside className="hidden md:flex h-screen w-64 fixed left-0 top-0 bg-slate-100 dark:bg-slate-900 flex-col py-6 px-4 space-y-2 z-50">
      <div className="px-4 mb-8">
        <h1 className="text-lg font-black text-slate-800 dark:text-slate-200 uppercase tracking-widest font-headline line-clamp-2">
          {storeName}
        </h1>
        <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-bold line-clamp-2">{branchLabel}</p>
      </div>

      <nav className="flex-1 space-y-1">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentScreen === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id as Screen)}
              className={cn(
                'w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200',
                isActive
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-50 shadow-sm translate-x-1'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 hover:bg-slate-200 dark:hover:bg-slate-800',
              )}
            >
              <Icon size={20} />
              <span className="text-sm uppercase tracking-widest font-medium">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="mt-auto px-4 py-4 bg-surface-container-high rounded-xl">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-full bg-primary-container text-white flex items-center justify-center text-xs font-bold shrink-0"
            aria-hidden
          >
            {initialsFromName(managerName)}
          </div>
          <div>
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

/** Slide-in navigation for small screens (paired with TopBar menu button). */
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
  const menuItems = useMenuItems();

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
    <div className="fixed inset-0 z-[70] md:hidden" role="dialog" aria-modal="true" aria-label={t('nav.openMenu')}>
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        aria-label={t('nav.closeMenu')}
        onClick={onClose}
      />
      <aside className="absolute left-0 top-0 bottom-0 w-[min(20rem,90vw)] max-w-sm bg-slate-100 dark:bg-slate-900 shadow-2xl flex flex-col py-5 pl-4 pr-12 overflow-y-auto overscroll-contain animate-in slide-in-from-left duration-200">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 p-2 rounded-full text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800"
          aria-label={t('nav.closeMenu')}
        >
          <X size={22} />
        </button>
        <div className="pr-2 mb-6 mt-1">
          <h1 className="text-base font-black text-slate-800 dark:text-slate-200 uppercase tracking-widest font-headline line-clamp-2">
            {storeName}
          </h1>
          <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-bold line-clamp-2">{branchLabel}</p>
        </div>
        <nav className="flex-1 space-y-1">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentScreen === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => go(item.id as Screen)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-3 rounded-lg text-left transition-all duration-200',
                  isActive
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-50 shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 active:bg-slate-200 dark:active:bg-slate-800',
                )}
              >
                <Icon size={20} />
                <span className="text-sm uppercase tracking-widest font-medium">{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="mt-6 mr-2 px-3 py-3 bg-surface-container-high rounded-xl shrink-0">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-full bg-primary-container text-white flex items-center justify-center text-xs font-bold shrink-0"
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
  /** Opens the mobile navigation drawer (only shown below `md`). */
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
    <header className="w-full min-h-14 md:h-16 shrink-0 sticky top-0 z-40 bg-slate-50 dark:bg-slate-950 border-b border-black/5">
      {/* Una sola fila: título (izq) · búsqueda (centro, crece) · acciones (derecha fija). Sin order-last ni wrap que mezclen campana/avatar con la búsqueda. */}
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
