import { 
  LayoutDashboard, 
  Package, 
  ShoppingCart, 
  Receipt, 
  BarChart3, 
  Boxes, 
  Settings,
  Bell,
  Search,
} from 'lucide-react';
import { Screen } from '../types';
import { cn, initialsFromName } from '../lib/utils';

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
  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'products', label: 'Products', icon: Package },
    { id: 'pos', label: 'Sales (POS)', icon: ShoppingCart },
    { id: 'expenses', label: 'Expenses', icon: Receipt },
    { id: 'reports', label: 'Reports', icon: BarChart3 },
    { id: 'inventory', label: 'Inventory', icon: Boxes },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

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
              onClick={() => onNavigate(item.id as Screen)}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200",
                isActive 
                  ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-50 shadow-sm translate-x-1" 
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-700 hover:bg-slate-200 dark:hover:bg-slate-800"
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

interface TopBarProps {
  title: string;
  userInitials?: string;
  searchQuery?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
}

export function TopBar({
  title,
  userInitials = 'JV',
  searchQuery = '',
  onSearchChange,
  searchPlaceholder = 'Search…',
}: TopBarProps) {
  return (
    <header className="w-full h-16 sticky top-0 z-40 bg-slate-50 dark:bg-slate-950 flex justify-between items-center px-8 border-b border-black/5">
      <div className="flex items-center gap-6 min-w-0">
        <h2 className="text-xl font-bold tracking-tighter text-slate-900 dark:text-slate-50 font-headline shrink-0">
          {title}
        </h2>
        {onSearchChange ? (
          <div className="hidden md:flex items-center bg-slate-100 dark:bg-slate-900 rounded-full px-4 py-1.5 gap-2 min-w-0 max-w-md flex-1">
            <Search size={14} className="text-slate-400 shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              className="bg-transparent border-none focus:ring-0 text-xs w-full min-w-0 text-slate-600 dark:text-slate-300 outline-none placeholder:text-slate-400"
              aria-label="Global search"
            />
          </div>
        ) : null}
      </div>
      
      <div className="flex items-center gap-4">
        <button className="p-2 rounded-full hover:bg-slate-200/50 dark:hover:bg-slate-800/50 transition-all">
          <Bell size={20} className="text-slate-700" />
        </button>
        <div className="w-8 h-8 rounded-full bg-primary-container flex items-center justify-center text-white text-xs font-bold">
          {userInitials.slice(0, 3)}
        </div>
      </div>
    </header>
  );
}
