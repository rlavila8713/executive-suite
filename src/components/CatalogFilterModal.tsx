import { ProductCategory, ProductSubcategory } from '../types';
import { Button, Modal } from './ui';
import { cn } from '../lib/utils';

export type CatalogFilter =
  | { kind: 'all' }
  | { kind: 'category'; categoryId: string; label: string }
  | { kind: 'subcategory'; categoryId: string; subcategoryId: string; label: string };

export function catalogFilterLabel(filter: CatalogFilter, allLabel: string): string {
  if (filter.kind === 'all') return allLabel;
  return filter.label;
}

export function productMatchesCatalogFilter(
  product: { categoryId: string; subcategoryId: string },
  filter: CatalogFilter,
): boolean {
  if (filter.kind === 'all') return true;
  if (filter.kind === 'category') return product.categoryId === filter.categoryId;
  return product.subcategoryId === filter.subcategoryId;
}

interface CatalogFilterModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  allLabel: string;
  closeLabel: string;
  categories: ProductCategory[];
  subcategories: ProductSubcategory[];
  selected: CatalogFilter;
  onSelect: (filter: CatalogFilter) => void;
}

export function CatalogFilterModal({
  isOpen,
  onClose,
  title,
  allLabel,
  closeLabel,
  categories,
  subcategories,
  selected,
  onSelect,
}: CatalogFilterModalProps) {
  const sorted = [...categories].sort((a, b) => a.name.localeCompare(b.name));

  const pick = (filter: CatalogFilter) => {
    onSelect(filter);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <div className="space-y-2 max-h-[60vh] overflow-y-auto">
        <button
          type="button"
          onClick={() => pick({ kind: 'all' })}
          className={cn(
            'w-full text-left rounded-lg px-4 py-3 text-sm font-bold transition-colors',
            selected.kind === 'all' ? 'bg-primary text-white' : 'bg-surface-container-low hover:bg-surface-container-high',
          )}
        >
          {allLabel}
        </button>
        {sorted.map((cat) => {
          const subs = subcategories.filter((s) => s.categoryId === cat.id).sort((a, b) => a.name.localeCompare(b.name));
          return (
            <div key={cat.id} className="rounded-lg border border-black/5 overflow-hidden">
              <button
                type="button"
                onClick={() => pick({ kind: 'category', categoryId: cat.id, label: cat.name })}
                className={cn(
                  'w-full text-left px-4 py-3 text-sm font-bold transition-colors',
                  selected.kind === 'category' && selected.categoryId === cat.id
                    ? 'bg-primary/10 text-primary'
                    : 'bg-surface-container-lowest hover:bg-surface-container-low',
                )}
              >
                {cat.name}
              </button>
              {subs.length > 0 ? (
                <div className="border-t border-black/5 bg-surface-container-lowest">
                  {subs.map((sub) => (
                    <button
                      key={sub.id}
                      type="button"
                      onClick={() =>
                        pick({
                          kind: 'subcategory',
                          categoryId: cat.id,
                          subcategoryId: sub.id,
                          label: `${cat.name} / ${sub.name}`,
                        })
                      }
                      className={cn(
                        'w-full text-left px-6 py-2.5 text-sm transition-colors',
                        selected.kind === 'subcategory' && selected.subcategoryId === sub.id
                          ? 'bg-primary/10 text-primary font-bold'
                          : 'text-on-surface-variant hover:bg-surface-container-low',
                      )}
                    >
                      {sub.name}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="pt-4 flex justify-end">
        <Button type="button" variant="secondary" onClick={onClose}>
          {closeLabel}
        </Button>
      </div>
    </Modal>
  );
}
