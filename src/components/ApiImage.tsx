import { useEffect, useState, type ReactNode } from 'react';
import { fetchImageObjectUrlPooled, getCachedImageObjectUrl } from '../lib/imageFetchPool';
import { cn } from '../lib/utils';

type ApiImageProps = {
  /** Versioned API path, e.g. `/api/settings/logo?v=abc`. */
  apiPath?: string | null;
  /** Inline data URL when the image is already in memory. */
  dataUrl?: string | null;
  alt: string;
  className?: string;
  fallback?: ReactNode;
};

/**
 * Renders images from protected API routes (adds X-Device-Id) or inline data URLs.
 * Plain `<img src="/api/...">` cannot send custom headers, so this uses fetch + blob URLs.
 */
export function ApiImage({ apiPath, dataUrl, alt, className, fallback = null }: ApiImageProps) {
  const [src, setSrc] = useState<string | null>(dataUrl?.trim() ? dataUrl : null);

  useEffect(() => {
    if (dataUrl?.trim()) {
      setSrc(dataUrl);
      return;
    }
    if (!apiPath?.trim()) {
      setSrc(null);
      return;
    }

    let cancelled = false;

    const cached = getCachedImageObjectUrl(apiPath);
    if (cached) {
      setSrc(cached);
      return;
    }

    void fetchImageObjectUrlPooled(apiPath).then((url) => {
      if (cancelled) return;
      setSrc(url);
    });

    return () => {
      cancelled = true;
      // Blob URLs are owned by the shared image pool; do not revoke here.
    };
  }, [apiPath, dataUrl]);

  if (!src) return fallback;
  return <img src={src} alt={alt} className={cn(className)} />;
}
