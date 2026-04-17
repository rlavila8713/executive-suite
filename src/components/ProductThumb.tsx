import { PLACEHOLDER_PRODUCT_IMAGE } from '../constants';
import { cn } from '../lib/utils';

export function ProductThumb({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  return (
    <img
      src={src}
      alt={alt}
      className={cn(className)}
      onError={(e) => {
        (e.target as HTMLImageElement).src = PLACEHOLDER_PRODUCT_IMAGE;
      }}
    />
  );
}
