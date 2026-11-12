import type { LicenseInfo } from '../types';

/** Matches server `isLicenseActive`: trial or paid period still valid. */
export function isStoreLicenseActive(license: LicenseInfo): boolean {
  return license.status === 'trial' || license.status === 'active';
}
