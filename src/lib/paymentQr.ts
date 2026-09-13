export type TransferAccount = {
  bank: string;
  accountHolder: string;
  accountNumber: string;
  phoneNumber: string;
  extra: string;
};

/** Strip country code and non-digits. Stored / QR value is 8 national digits (no +53). */
export function normalizeTransferPhone(raw: string): string {
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('53') && digits.length >= 10) {
    digits = digits.slice(2);
  }
  return digits;
}

export function isValidTransferPhone(raw: string): boolean {
  return /^\d{8}$/.test(normalizeTransferPhone(raw));
}

/**
 * Transfermóvil (ETECSA) payload.
 * Format: TRANSFERMOVIL_ETECSA,TRANSFERENCIA,numero_cuenta,numero_telefonico,
 * Phone is national digits only (no +53).
 */
export function buildTransferQrPayload(
  account: Pick<TransferAccount, 'accountNumber' | 'phoneNumber'>,
): string {
  const accountNumber = account.accountNumber.trim();
  const phone = normalizeTransferPhone(account.phoneNumber);
  if (!accountNumber || !isValidTransferPhone(phone)) return '';
  return `TRANSFERMOVIL_ETECSA,TRANSFERENCIA,${accountNumber},${phone},`;
}

export function transferAccountConfigured(
  account: Pick<TransferAccount, 'accountNumber' | 'phoneNumber'>,
): boolean {
  return Boolean(account.accountNumber.trim()) && isValidTransferPhone(account.phoneNumber);
}

/** Online payment QR uses only the configured payload (no amount appended). */
export function buildOnlineQrPayload(payload: string): string {
  return payload.trim();
}

export function buildServerConnectQrPayload(url: string): string {
  const clean = url.trim().replace(/\/$/, '');
  return JSON.stringify({ v: 1, app: 'executive-suite', kind: 'server', url: clean });
}
