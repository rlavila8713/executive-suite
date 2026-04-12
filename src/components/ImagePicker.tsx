import { useRef, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { Button } from './ui';
import { readImageFileAsDataUrl } from '../lib/images';
import { PLACEHOLDER_PRODUCT_IMAGE } from '../constants';
import { cn } from '../lib/utils';

export interface ImagePickerProps {
  /** Current image (data URL or built-in placeholder). */
  value: string;
  onChange: (dataUrl: string) => void;
  label?: string;
  helperText?: string;
  disabled?: boolean;
  /** Compact layout for tight modals */
  compact?: boolean;
}

/**
 * Generic image file picker: uses `<input type="file">` so the OS native dialog is used (Windows, macOS, Linux).
 */
export function ImagePicker({
  value,
  onChange,
  label = 'Product image',
  helperText = 'Choose a file from this computer. Stored locally in your database.',
  disabled,
  compact,
}: ImagePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    try {
      const dataUrl = await readImageFileAsDataUrl(file);
      onChange(dataUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load image');
    }
  };

  return (
    <div className={cn('space-y-2', compact && 'space-y-1')}>
      {label ? (
        <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">{label}</label>
      ) : null}
      <div className={cn('flex flex-wrap gap-3 items-start', compact && 'gap-2')}>
        <div
          className={cn(
            'rounded-lg border border-black/10 bg-surface-container-high overflow-hidden shrink-0',
            compact ? 'w-16 h-16' : 'w-24 h-24',
          )}
        >
          <img src={value} alt="" className="w-full h-full object-cover" />
        </div>
        <div className="flex flex-col gap-2 min-w-0">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif"
            className="sr-only"
            onChange={handleFile}
            disabled={disabled}
            aria-label={label}
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="flex items-center gap-2 w-fit"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
          >
            <ImagePlus size={16} />
            Choose image…
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="flex items-center gap-1 w-fit text-on-surface-variant"
            disabled={disabled}
            onClick={() => {
              setError(null);
              onChange(PLACEHOLDER_PRODUCT_IMAGE);
            }}
          >
            <X size={14} />
            Use placeholder
          </Button>
        </div>
      </div>
      {helperText ? <p className="text-[10px] text-on-surface-variant leading-relaxed max-w-md">{helperText}</p> : null}
      {error ? <p className="text-xs text-error font-medium">{error}</p> : null}
    </div>
  );
}
