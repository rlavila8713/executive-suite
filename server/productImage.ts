import { createHash } from 'node:crypto';

export type ResolvedProductImage =
  | { kind: 'buffer'; data: Buffer; contentType: string }
  | { kind: 'redirect'; url: string };

/** Decode a stored product image (data URL or remote URL) for HTTP delivery. */
export function resolveProductImage(image: string | null | undefined): ResolvedProductImage | null {
  const value = (image ?? '').trim();
  if (!value) return null;

  if (value.startsWith('http://') || value.startsWith('https://')) {
    return { kind: 'redirect', url: value };
  }

  const base64Match = /^data:([^;,]+);base64,(.+)$/i.exec(value);
  if (base64Match) {
    return {
      kind: 'buffer',
      contentType: base64Match[1],
      data: Buffer.from(base64Match[2], 'base64'),
    };
  }

  const inlineSvgMatch = /^data:image\/svg\+xml,(.+)$/i.exec(value);
  if (inlineSvgMatch) {
    const payload = inlineSvgMatch[1];
    const svg = payload.includes('%') ? decodeURIComponent(payload) : payload;
    return { kind: 'buffer', contentType: 'image/svg+xml', data: Buffer.from(svg, 'utf8') };
  }

  return null;
}

/** Short content fingerprint so clients can cache-bust when the image bytes change. */
export function productImageVersion(image: string | null | undefined): string | null {
  const value = (image ?? '').trim();
  if (!value) return null;
  return createHash('sha1').update(value).digest('hex').slice(0, 12);
}

export function productImagePath(productId: string, image?: string | null): string {
  const path = `/api/products/${productId}/image`;
  const version = productImageVersion(image);
  return version ? `${path}?v=${version}` : path;
}
