import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import type { LicensePlanId } from './license.js';

/** Embedded public key — licenses are signed with the matching private key (vendor only). */
export const LICENSE_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAI6tkYZtzA1xfyEiSesYIp1YWBThJEu3Ue9F2Hn/diC4=
-----END PUBLIC KEY-----`;

const REQUEST_PREFIX = 'ES-REQ1.';
const LICENSE_PREFIX = 'ES-LIC1.';

export type LicenseRequestPayload = {
  v: 1;
  deviceId: string;
  planId: LicensePlanId;
  storeName: string;
  branch: string;
  requestedAt: number;
};

export type LicensePayload = {
  v: 1;
  deviceId: string;
  planId: LicensePlanId;
  issuedAt: number;
  days: number;
  price: number;
  nonce: string;
};

function toBase64Url(buf: Buffer): string {
  return buf.toString('base64url');
}

function fromBase64Url(str: string): Buffer {
  return Buffer.from(str, 'base64url');
}

function encodeJson(payload: object): string {
  return toBase64Url(Buffer.from(JSON.stringify(payload), 'utf8'));
}

function decodeJson<T>(encoded: string): T {
  return JSON.parse(fromBase64Url(encoded).toString('utf8')) as T;
}

export function encodeLicenseRequest(payload: LicenseRequestPayload): string {
  return `${REQUEST_PREFIX}${encodeJson(payload)}`;
}

export function decodeLicenseRequest(code: string): LicenseRequestPayload {
  const trimmed = code.trim();
  if (!trimmed.startsWith(REQUEST_PREFIX)) {
    throw new Error('Invalid request code format');
  }
  const payload = decodeJson<LicenseRequestPayload>(trimmed.slice(REQUEST_PREFIX.length));
  if (payload.v !== 1 || !payload.deviceId || !payload.planId) {
    throw new Error('Invalid request payload');
  }
  return payload;
}

export function signLicense(payload: LicensePayload, privateKeyPem: string): string {
  const body = encodeJson(payload);
  const signature = sign(null, Buffer.from(body, 'utf8'), createPrivateKey(privateKeyPem));
  return `${LICENSE_PREFIX}${body}.${toBase64Url(signature)}`;
}

export function verifyLicenseKey(licenseKey: string): LicensePayload {
  const trimmed = licenseKey.trim();
  if (!trimmed.startsWith(LICENSE_PREFIX)) {
    throw new Error('Invalid license key format');
  }
  const rest = trimmed.slice(LICENSE_PREFIX.length);
  const dot = rest.lastIndexOf('.');
  if (dot <= 0) throw new Error('Invalid license key format');

  const body = rest.slice(0, dot);
  const sigB64 = rest.slice(dot + 1);
  const publicKey = createPublicKey(LICENSE_PUBLIC_KEY_PEM);
  const ok = verify(null, Buffer.from(body, 'utf8'), publicKey, fromBase64Url(sigB64));
  if (!ok) throw new Error('License signature invalid');

  const payload = decodeJson<LicensePayload>(body);
  if (payload.v !== 1 || !payload.deviceId || !payload.planId || !payload.nonce) {
    throw new Error('Invalid license payload');
  }
  if (!Number.isFinite(payload.days) || payload.days <= 0) {
    throw new Error('Invalid license duration');
  }
  return payload;
}
