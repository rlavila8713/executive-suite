import { useState } from 'react';
import { 
  Search, 
  Filter, 
  Download, 
  TrendingUp, 
  TrendingDown,
  Calendar,
  ArrowRight,
  Plus
} from 'lucide-react';
import { Card, Button, Input } from '../components/ui';
import { Expense } from '../types';
import { cn } from '../lib/utils';

interface ExpensesProps {
  expenses: Expense[];
}

export function Expenses({ expenses }: ExpensesProps) {
  const totalExpenses = expenses.reduce((acc, e) => acc + e.amount, 0);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-extrabold text-primary tracking-tight mb-2 font-headline">Expense Tracking</h2>
          <p className="text-on-surface-variant text-sm font-medium">Monitor your operational costs and overheads.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" className="flex items-center gap-2">
            <Calendar size={16} /> Oct 2023
          </Button>
          <Button className="flex items-center gap-2">
            <Plus size={16} /> Add Expense
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-primary text-white">
          <p className="text-[10px] opacity-70 uppercase tracking-widest font-bold mb-1">Total Monthly Expenses</p>
          <h3 className="text-3xl font-extrabold tracking-tight">${totalExpenses.toLocaleString()}</h3>
          <div className="mt-4 flex items-center gap-2 text-on-tertiary-container">
            <TrendingDown size={16} />
            <span className="text-xs font-bold">-4.2% from last month</span>
          </div>
        </Card>
        <Card>
          <p className="text-[10px] text-on-surface-variant uppercase tracking-widest font-bold mb-1">Largest Category</p>
          <h3 className="text-2xl font-bold text-primary">Personnel & Ops</h3>
          <p className="text-xs text-on-surface-variant mt-1">$210,000 (48% of total)</p>
        </Card>
        <Card>
          <p className="text-[10px] text-on-surface-variant uppercase tracking-widest font-bold mb-1">Budget Utilization</p>
          <h3 className="text-2xl font-bold text-primary">82%</h3>
          <div className="mt-4 h-1.5 bg-surface-container-high rounded-full overflow-hidden">
            <div className="bg-primary h-full w-[82%]"></div>
          </div>
        </Card>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="p-6 border-b border-black/5 flex justify-between items-center bg-surface-container-low">
          <div className="relative w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <Input placeholder="Search expenses..." className="pl-10" />
          </div>
          <Button variant="secondary" className="flex items-center gap-2">
            <Download size={16} /> Export CSV
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low border-b border-black/5">
                <th className="py-4 px-6 text-[10px] text-on-surface-variant uppercase tracking-widest font-black">Expense Title</th>
                <th className="py-4 px-6 text-[10px] text-on-surface-variant uppercase tracking-widest font-black text-right">Category</th>
                <th className="py-4 px-6 text-[10px] text-on-surface-variant uppercase tracking-widest font-black text-right">Date</th>
                <th className="py-4 px-6 text-[10px] text-on-surface-variant uppercase tracking-widest font-black text-right">Amount</th>
                <th className="py-4 px-6 text-[10px] text-on-surface-variant uppercase tracking-widest font-black text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map(expense => (
                <tr key={expense.id} className="group hover:bg-surface-container-low transition-colors border-b border-black/5 last:border-0">
                  <td className="py-4 px-6 font-bold text-primary">{expense.title}</td>
                  <td className="py-4 px-6 text-right text-sm font-medium text-secondary">{expense.category}</td>
                  <td className="py-4 px-6 text-right text-sm text-on-surface-variant">{expense.date}</td>
                  <td className="py-4 px-6 text-right text-sm font-bold text-primary">${expense.amount.toLocaleString()}</td>
                  <td className="py-4 px-6 text-right">
                    <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity">
                      <ArrowRight size={14} />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
