import type { Customer } from '../types';

export function formatCustomerName(c: Pick<Customer, 'firstName' | 'lastName'>): string {
  return [c.firstName.trim(), (c.lastName ?? '').trim()].filter(Boolean).join(' ');
}

/** Case-insensitive: display name starts with query (for POS autocomplete). */
export function customerNameStartsWith(
  c: Pick<Customer, 'firstName' | 'lastName'>,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return formatCustomerName(c).toLowerCase().startsWith(q);
}

export function findCustomerById(customers: Customer[], id: string | undefined | null): Customer | undefined {
  if (!id) return undefined;
  return customers.find((c) => c.id === id);
}

export function findCustomerByDisplayName(customers: Customer[], displayName: string): Customer | undefined {
  const key = displayName.trim().toLowerCase();
  if (!key) return undefined;
  return customers.find((c) => formatCustomerName(c).toLowerCase() === key);
}

/** Split a free-text sale customer label into catalog fields. */
export function parseDisplayNameToCustomerFields(displayName: string): {
  firstName: string;
  lastName: string;
} {
  const trimmed = displayName.trim();
  if (!trimmed) return { firstName: '', lastName: '' };
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

export function isAdHocSaleCustomerName(name: string, walkInLabel: string): boolean {
  const n = name.trim().toLowerCase();
  if (!n) return true;
  const walk = walkInLabel.trim().toLowerCase();
  return n === walk || n === 'walk-in customer' || n === 'cliente ocasional';
}
