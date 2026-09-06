import { PLACEHOLDER_PRODUCT_IMAGE } from '../constants';
import { getApiUrl } from '../api/config';
import { cn } from '../lib/utils';

export function ProductThumb({
  src,
  imageUrl,
  alt,
  className,
}: {
  src: string;
  imageUrl?: string | null;
  alt: string;
  className?: string;
}) {
  const resolvedSrc = imageUrl ? getApiUrl(imageUrl) : src || PLACEHOLDER_PRODUCT_IMAGE;
  return (
    <img
      key={resolvedSrc}
      src={resolvedSrc}
      alt={alt}
      className={cn(className)}
      onError={(e) => {
        (e.target as HTMLImageElement).src = PLACEHOLDER_PRODUCT_IMAGE;
      }}
    />
  );
}
