import { LayoutGrid, List } from 'lucide-react';
import { cn } from '../lib/utils';

export type ViewMode = 'grid' | 'list';

interface ViewModeToggleProps {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
  gridLabel: string;
  listLabel: string;
}

export function ViewModeToggle({ mode, onChange, gridLabel, listLabel }: ViewModeToggleProps) {
  return (
    <div className="inline-flex rounded-lg border border-black/10 overflow-hidden shrink-0">
      <button
        type="button"
        title={gridLabel}
        aria-label={gridLabel}
        onClick={() => onChange('grid')}
        className={cn(
          'p-2 transition-colors',
          mode === 'grid' ? 'bg-primary text-white' : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high',
        )}
      >
        <LayoutGrid size={16} />
      </button>
      <button
        type="button"
        title={listLabel}
        aria-label={listLabel}
        onClick={() => onChange('list')}
        className={cn(
          'p-2 transition-colors',
          mode === 'list' ? 'bg-primary text-white' : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high',
        )}
      >
        <List size={16} />
      </button>
    </div>
  );
}
