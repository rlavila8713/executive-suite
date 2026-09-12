import { getApiUrl } from '../api/config';
import { getDeviceId } from './deviceId';

/** Fetch a protected API image path and return an object URL (revoke when done). */
export async function fetchAuthenticatedImageObjectUrl(apiPath: string): Promise<string | null> {
  try {
    const res = await fetch(getApiUrl(apiPath), {
      headers: { 'X-Device-Id': getDeviceId() },
    });
    if (!res.ok) return null;
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

/** Fetch a protected API image path as a data URL (for print / offline embed). */
export async function fetchAuthenticatedImageDataUrl(apiPath: string): Promise<string | null> {
  try {
    const res = await fetch(getApiUrl(apiPath), {
      headers: { 'X-Device-Id': getDeviceId() },
    });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        resolve(typeof reader.result === 'string' ? reader.result : null);
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}
