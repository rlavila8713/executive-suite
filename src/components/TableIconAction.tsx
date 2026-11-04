import type { LucideIcon } from 'lucide-react';
import { cn } from '../lib/utils';

export type TableActionTone = 'brand' | 'success' | 'info' | 'violet' | 'amber' | 'neutral' | 'danger';

const toneClasses: Record<TableActionTone, string> = {
  brand: 'bg-primary/12 text-primary ring-primary/30 hover:bg-primary/20 hover:ring-primary/40',
  success: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 ring-emerald-500/35 hover:bg-emerald-500/25',
  info: 'bg-sky-500/15 text-sky-800 dark:text-sky-300 ring-sky-500/35 hover:bg-sky-500/25',
  violet: 'bg-violet-500/15 text-violet-800 dark:text-violet-300 ring-violet-500/35 hover:bg-violet-500/25',
  amber: 'bg-amber-500/15 text-amber-900 dark:text-amber-200 ring-amber-500/35 hover:bg-amber-500/25',
  neutral: 'bg-surface-container-high text-on-surface-variant ring-black/10 hover:bg-surface-container-highest',
  danger: 'bg-error/12 text-error ring-error/30 hover:bg-error/20',
};

export type TableIconActionProps = {
  icon: LucideIcon;
  label: string;
  tone?: TableActionTone;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  type?: 'button' | 'submit';
};

export function TableIconAction({
  icon: Icon,
  label,
  tone = 'neutral',
  onClick,
  disabled,
  className,
  type = 'button',
}: TableIconActionProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'group/icon relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 transition-all active:scale-95 disabled:opacity-40 disabled:pointer-events-none',
        toneClasses[tone],
        className,
      )}
    >
      <Icon size={16} strokeWidth={2.25} aria-hidden />
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-[calc(100%+6px)] left-1/2 z-30 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[10px] font-bold text-white opacity-0 shadow-lg transition-opacity group-hover/icon:opacity-100 group-focus-visible/icon:opacity-100 dark:bg-slate-100 dark:text-slate-900"
      >
        {label}
      </span>
    </button>
  );
}

export function TableActionGroup({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('flex flex-wrap items-center justify-end gap-1', className)}>{children}</div>;
}
