import { Card } from './ui';
import { cn } from '../lib/utils';
import type { LucideIcon } from 'lucide-react';

type StatMetricCardProps = {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon?: LucideIcon;
  variant?: 'default' | 'accent' | 'danger';
  className?: string;
};

export function StatMetricCard({ label, value, hint, icon: Icon, variant = 'default', className }: StatMetricCardProps) {
  return (
    <Card
      className={cn(
        'h-32 flex flex-col justify-between hover:shadow-xl transition-all',
        variant === 'accent' && 'bg-primary p-6 text-white shadow-lg border-0',
        variant === 'danger' && 'bg-error-container/20 border-error/20',
        className,
      )}
    >
      <div className="flex justify-between items-start gap-2">
        <span
          className={cn(
            'text-[10px] uppercase tracking-widest font-bold',
            variant === 'accent' ? 'opacity-70' : 'text-on-surface-variant',
            variant === 'danger' && 'text-on-error-container',
          )}
        >
          {label}
        </span>
        {Icon ? (
          <Icon
            size={22}
            className={cn(
              'shrink-0',
              variant === 'accent' ? 'opacity-80' : 'text-primary/60',
              variant === 'danger' && 'text-error/70',
            )}
          />
        ) : null}
      </div>
      <div>
        <div
          className={cn(
            'text-3xl font-extrabold',
            variant === 'accent' ? 'text-white' : 'text-primary',
            variant === 'danger' && 'text-error',
          )}
        >
          {value}
        </div>
        {hint ? (
          <p
            className={cn(
              'text-xs mt-1',
              variant === 'accent' ? 'opacity-80' : 'text-on-surface-variant',
            )}
          >
            {hint}
          </p>
        ) : null}
      </div>
    </Card>
  );
}
