import { 
  TrendingUp, 
  Download, 
  Calendar,
  FileText,
  CheckCircle,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';
import { Card, Button } from '../components/ui';
import { cn } from '../lib/utils';

export function Reports() {
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-end">
        <div>
          <nav className="flex gap-2 mb-2 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
            <span className="hover:text-primary cursor-pointer transition-colors">Analytics</span>
            <span>/</span>
            <span className="text-primary">Annual Performance</span>
          </nav>
          <h2 className="text-4xl font-extrabold tracking-tight text-primary font-headline">Financial Intelligence</h2>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-surface-container-low p-1 rounded-lg">
            <button className="px-4 py-2 text-xs font-bold uppercase tracking-wider bg-white rounded-md shadow-sm text-primary">Custom Range</button>
            <button className="px-4 py-2 text-xs font-medium uppercase tracking-wider text-on-surface-variant hover:text-primary transition-all">Q3 2023</button>
          </div>
          <Button className="flex items-center gap-2">
            <Download size={18} /> Export Report
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-8 bg-gradient-to-br from-primary to-primary-container rounded-xl p-8 text-white relative overflow-hidden flex flex-col justify-between shadow-2xl">
          <div className="relative z-10">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-70 mb-1">Fiscal Year Revenue</p>
            <h3 className="text-5xl font-extrabold tracking-tighter mb-4">$4,829,120.00</h3>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1 bg-tertiary-container text-on-tertiary-container px-2 py-0.5 rounded text-xs font-bold">
                <TrendingUp size={14} /> +12.4%
              </span>
              <span className="text-xs opacity-60">vs Previous Period</span>
            </div>
          </div>
          <div className="absolute bottom-0 right-0 w-1/2 h-full opacity-20 pointer-events-none">
            <svg className="w-full h-full" viewBox="0 0 400 200">
              <path d="M0,150 Q50,140 100,100 T200,80 T300,120 T400,20" fill="none" stroke="white" strokeLinecap="round" strokeWidth="4" />
            </svg>
          </div>
        </div>

        <Card className="col-span-4 flex flex-col justify-between">
          <div>
            <div className="w-10 h-10 rounded-lg bg-tertiary-container/10 flex items-center justify-center mb-4">
              <TrendingUp className="text-on-tertiary-container" size={20} />
            </div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-1">Net Profit Margin</p>
            <h3 className="text-2xl font-bold text-primary tracking-tight">24.8%</h3>
          </div>
          <div className="mt-4">
            <div className="w-full bg-surface-container-high h-1.5 rounded-full overflow-hidden">
              <div className="bg-on-tertiary-container h-full w-[24.8%]"></div>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Recent Anomalies & Flags">
          <div className="space-y-3 mt-6">
            <div className="bg-surface-container-low hover:bg-white hover:shadow-md transition-all p-4 rounded-xl flex items-center justify-between group cursor-pointer border border-transparent hover:border-black/5">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-error-container/20 flex items-center justify-center text-error">
                  <AlertTriangle size={20} />
                </div>
                <div>
                  <h5 className="text-sm font-bold text-primary">Inventory Discrepancy: SKU-9281</h5>
                  <p className="text-xs text-on-surface-variant">Warehouse Branch A • Reported 2h ago</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-error">-$1,240.00</p>
                <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">Projected Loss</p>
              </div>
            </div>

            <div className="bg-surface-container-low hover:bg-white hover:shadow-md transition-all p-4 rounded-xl flex items-center justify-between group cursor-pointer border border-transparent hover:border-black/5">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-tertiary-container/10 flex items-center justify-center text-on-tertiary-container">
                  <CheckCircle size={20} />
                </div>
                <div>
                  <h5 className="text-sm font-bold text-primary">Tax Rebate Confirmation</h5>
                  <p className="text-xs text-on-surface-variant">Internal Revenue Service • Processed Yesterday</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-on-tertiary-container">+$4,500.00</p>
                <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">Net Gain</p>
              </div>
            </div>
          </div>
        </Card>

        <Card title="Expense Breakdown">
          <div className="space-y-6 mt-6">
            {[
              { label: 'Logistics & Shipping', value: '$142,000', progress: 45, color: 'bg-primary-container' },
              { label: 'Digital Marketing', value: '$84,500', progress: 30, color: 'bg-slate-400' },
              { label: 'Personnel & Ops', value: '$210,000', progress: 65, color: 'bg-primary' },
            ].map((item, i) => (
              <div key={i}>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium">{item.label}</span>
                  <span className="text-sm font-bold">{item.value}</span>
                </div>
                <div className="w-full bg-surface-container-low h-2 rounded-full overflow-hidden">
                  <div className={cn("h-full", item.color)} style={{ width: `${item.progress}%` }}></div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
