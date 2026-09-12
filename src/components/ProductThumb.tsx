import { PLACEHOLDER_PRODUCT_IMAGE } from '../constants';
import { ApiImage } from './ApiImage';
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
  if (imageUrl) {
    return (
      <ApiImage
        key={imageUrl}
        apiPath={imageUrl}
        alt={alt}
        className={cn(className)}
        fallback={<img src={src || PLACEHOLDER_PRODUCT_IMAGE} alt={alt} className={cn(className)} />}
      />
    );
  }
  return (
    <img
      key={src || PLACEHOLDER_PRODUCT_IMAGE}
      src={src || PLACEHOLDER_PRODUCT_IMAGE}
      alt={alt}
      className={cn(className)}
      onError={(e) => {
        (e.target as HTMLImageElement).src = PLACEHOLDER_PRODUCT_IMAGE;
      }}
    />
  );
}
