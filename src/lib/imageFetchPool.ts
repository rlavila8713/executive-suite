import { fetchAuthenticatedImageObjectUrl } from './apiImage';

const MAX_CONCURRENT = 6;
let active = 0;
const queue: (() => void)[] = [];
const cache = new Map<string, string>();

function drain(): void {
  while (active < MAX_CONCURRENT && queue.length > 0) {
    const next = queue.shift();
    next?.();
  }
}

export function getCachedImageObjectUrl(apiPath: string): string | null {
  return cache.get(apiPath) ?? null;
}

/** Call when an image changes (`?v=` changes) so the next fetch is fresh. */
export function evictImageCache(apiPath: string | null | undefined): void {
  if (!apiPath?.trim()) return;
  const objectUrl = cache.get(apiPath);
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  cache.delete(apiPath);
}

export function fetchImageObjectUrlPooled(apiPath: string): Promise<string | null> {
  const cached = cache.get(apiPath);
  if (cached) return Promise.resolve(cached);

  return new Promise((resolve) => {
    const run = () => {
      active += 1;
      void fetchAuthenticatedImageObjectUrl(apiPath).then((url) => {
        active -= 1;
        if (url) cache.set(apiPath, url);
        drain();
        resolve(url);
      });
    };
    if (active < MAX_CONCURRENT) run();
    else queue.push(run);
  });
}
