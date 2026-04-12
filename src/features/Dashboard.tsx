import { 
  TrendingUp, 
  Receipt, 
  DollarSign, 
  CheckCircle, 
  ShoppingBag, 
  ArrowRight,
  AlertTriangle,
  Plus,
  Package
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell
} from 'recharts';
import { Card, Button } from '../components/ui';
import { Transaction, Product } from '../types';
import { cn } from '../lib/utils';

const DATA = [
  { name: 'MON', value: 45 },
  { name: 'TUE', value: 65 },
  { name: 'WED', value: 85 },
  { name: 'THU', value: 95 },
  { name: 'FRI', value: 55 },
  { name: 'SAT', value: 40 },
  { name: 'SUN', value: 30 },
];

interface DashboardProps {
  transactions: Transaction[];
  products: Product[];
  onNavigate: (screen: any) => void;
}

export function Dashboard({ transactions, products, onNavigate }: DashboardProps) {
  const lowStockProducts = products.filter(p => p.stock <= 5);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="mb-10">
        <h1 className="text-3xl font-extrabold text-primary font-headline tracking-tight mb-2">Performance Overview</h1>
        <p className="text-on-surface-variant font-medium">
          Welcome back, Executive. Here is your store's health for <span className="text-primary font-bold">October 24th, 2023.</span>
        </p>
      </div>

      {/* Bento Grid - Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="md:col-span-2 relative overflow-hidden rounded-xl bg-gradient-to-br from-primary to-primary-container p-8 text-white shadow-lg">
          <div className="relative z-10">
            <p className="text-xs font-bold uppercase tracking-[0.2em] opacity-70 mb-2">Today's Revenue</p>
            <h3 className="text-5xl font-black font-headline tracking-tighter mb-4">$12,482.00</h3>
            <div className="flex items-center gap-2 text-on-tertiary-container">
              <TrendingUp size={16} />
              <span className="text-sm font-bold">+14.2% from yesterday</span>
            </div>
          </div>
          <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 rounded-full -mr-12 -mt-12 blur-3xl"></div>
        </div>

        <Card className="bg-surface-container-low flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-start mb-4">
              <div className="p-2 bg-white rounded-lg shadow-sm">
                <Receipt className="text-primary" size={20} />
              </div>
              <span className="text-[10px] font-bold px-2 py-1 bg-surface-container-high rounded text-on-surface-variant">MONTHLY</span>
            </div>
            <p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-1">Expenses</p>
            <h4 className="text-2xl font-bold text-primary">$4,290.50</h4>
          </div>
          <div className="mt-4">
            <div className="h-1 bg-surface-container-highest rounded-full overflow-hidden">
              <div className="w-2/3 h-full bg-primary"></div>
            </div>
            <p className="text-[10px] text-on-surface-variant mt-2 font-medium">62% of monthly budget</p>
          </div>
        </Card>

        <div className="rounded-xl bg-tertiary-container p-6 text-white flex flex-col justify-between shadow-sm">
          <div>
            <div className="flex justify-between items-start mb-4">
              <div className="p-2 bg-primary rounded-lg shadow-sm">
                <DollarSign className="text-on-tertiary-container" size={20} />
              </div>
            </div>
            <p className="text-xs font-bold uppercase tracking-widest opacity-70 mb-1">Total Profit</p>
            <h4 className="text-2xl font-bold">$8,191.50</h4>
          </div>
          <div className="flex items-center gap-1 text-on-tertiary-container text-[10px] font-bold mt-4">
            <CheckCircle size={12} />
            HEALTHY MARGIN
          </div>
        </div>
      </div>

      {/* Analytics & Alerts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <Card className="lg:col-span-2 p-8" title="Weekly Sales Performance" subtitle="Revenue tracking across all categories">
          <div className="h-64 mt-8">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={DATA}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fontWeight: 700, fill: '#44474c' }} 
                  dy={10}
                />
                <Tooltip 
                  cursor={{ fill: '#f2f4f6' }}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {DATA.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.name === 'THU' ? '#222a3e' : '#bec6e0'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <div className="space-y-6">
          <Card className="bg-surface-container-high" title="Stock Alerts">
            <div className="space-y-4 mt-4">
              {lowStockProducts.slice(0, 3).map(product => (
                <div key={product.id} className="flex items-center gap-4 bg-white/50 p-3 rounded-lg">
                  <img src={product.image} alt={product.name} className="w-10 h-10 rounded object-cover" />
                  <div className="flex-1">
                    <p className="text-xs font-bold text-primary">{product.name}</p>
                    <p className="text-[10px] text-error font-bold">{product.stock} items left</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => onNavigate('inventory')}>
                    <Plus size={14} />
                  </Button>
                </div>
              ))}
            </div>
            <Button 
              variant="primary" 
              className="w-full mt-6 uppercase tracking-widest text-[10px]"
              onClick={() => onNavigate('inventory')}
            >
              View All Inventory
            </Button>
          </Card>

          <Card className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Total Active SKUs</p>
              <h4 className="text-3xl font-black text-primary font-headline">{products.length}</h4>
            </div>
            <div className="w-12 h-12 bg-surface-container-high rounded-full flex items-center justify-center text-primary">
              <Package size={24} />
            </div>
          </Card>
        </div>
      </div>

      {/* Recent Transactions */}
      <Card title="Recent Transactions">
        <div className="space-y-3 mt-6">
          {transactions.map(tx => (
            <div key={tx.id} className="flex items-center justify-between p-4 bg-surface-container-low rounded-xl hover:bg-surface-container-high transition-all">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm">
                  <ShoppingBag size={18} className="text-primary" />
                </div>
                <div>
                  <p className="text-sm font-bold text-primary">Order {tx.orderNumber}</p>
                  <p className="text-[10px] text-on-surface-variant font-medium">Customer: {tx.customer} • {tx.timestamp}</p>
                </div>
              </div>
              <div className="text-right">
                <p className={cn("text-sm font-bold", tx.type === 'return' ? 'text-error' : 'text-primary')}>
                  {tx.type === 'return' ? '-' : '+'}${Math.abs(tx.amount).toFixed(2)}
                </p>
                <span className={cn(
                  "text-[10px] font-bold px-2 py-0.5 rounded",
                  tx.status === 'completed' ? 'bg-tertiary-container text-on-tertiary-container' : 'bg-surface-container-high text-on-surface-variant'
                )}>
                  {tx.status.toUpperCase()}
                </span>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-6 text-center">
          <button className="text-xs font-bold text-primary underline underline-offset-4 flex items-center gap-2 mx-auto">
            VIEW TRANSACTION LOG <ArrowRight size={14} />
          </button>
        </div>
      </Card>
    </div>
  );
}
