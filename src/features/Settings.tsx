import { 
  Store, 
  User, 
  Bell, 
  Shield, 
  Globe, 
  CreditCard,
  ChevronRight
} from 'lucide-react';
import { Card, Button, Input } from '../components/ui';
import { cn } from '../lib/utils';

export function Settings() {
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="mb-10">
        <h2 className="text-3xl font-extrabold text-primary tracking-tight mb-2 font-headline">System Settings</h2>
        <p className="text-on-surface-variant text-sm font-medium">Configure your store preferences and system parameters.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-4">
          {[
            { label: 'General Store', icon: Store, active: true },
            { label: 'User Profile', icon: User },
            { label: 'Notifications', icon: Bell },
            { label: 'Security', icon: Shield },
            { label: 'Regional & Language', icon: Globe },
            { label: 'Billing & Plans', icon: CreditCard },
          ].map((item, i) => (
            <button 
              key={i}
              className={cn(
                "w-full flex items-center justify-between p-4 rounded-xl transition-all",
                item.active 
                  ? "bg-white shadow-md text-primary" 
                  : "text-on-surface-variant hover:bg-surface-container-low"
              )}
            >
              <div className="flex items-center gap-3">
                <item.icon size={18} />
                <span className="text-sm font-bold">{item.label}</span>
              </div>
              <ChevronRight size={16} />
            </button>
          ))}
        </div>

        <div className="lg:col-span-2 space-y-6">
          <Card title="Store Configuration">
            <div className="space-y-6 mt-6">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Store Name</label>
                  <Input defaultValue="The Editorial Executive" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Branch Location</label>
                  <Input defaultValue="Main Branch - Downtown" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Currency</label>
                  <Input defaultValue="USD ($)" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Tax Rate (%)</label>
                  <Input type="number" defaultValue="8.0" />
                </div>
              </div>
              <div className="pt-4 flex justify-end">
                <Button>Save Changes</Button>
              </div>
            </div>
          </Card>

          <Card title="Preferences">
            <div className="space-y-4 mt-6">
              <div className="flex items-center justify-between p-4 bg-surface-container-low rounded-xl">
                <div>
                  <p className="text-sm font-bold">Dark Mode</p>
                  <p className="text-xs text-on-surface-variant">Toggle system-wide dark theme</p>
                </div>
                <div className="w-12 h-6 bg-surface-container-high rounded-full relative cursor-pointer">
                  <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full shadow-sm"></div>
                </div>
              </div>
              <div className="flex items-center justify-between p-4 bg-surface-container-low rounded-xl">
                <div>
                  <p className="text-sm font-bold">Low Stock Notifications</p>
                  <p className="text-xs text-on-surface-variant">Alert when items fall below threshold</p>
                </div>
                <div className="w-12 h-6 bg-primary rounded-full relative cursor-pointer">
                  <div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full shadow-sm"></div>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
