import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';
import { createApp } from '../../server/app.js';
import { closeDb, initDb } from '../../server/db.js';

export const TEST_DEVICE_ID = 'integration-test-device';

let server: Server | null = null;
let baseUrl = '';
let dataDir = '';

export async function setupTestServer(): Promise<string> {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'executive-suite-test-'));
  process.env.DATA_DIR = dataDir;
  delete process.env.API_KEY;

  closeDb();
  await initDb();

  const app = createApp();
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve());
  });

  const addr = server!.address();
  const port = typeof addr === 'object' && addr ? addr.port : 4000;
  baseUrl = `http://127.0.0.1:${port}`;
  return baseUrl;
}

export async function teardownTestServer(): Promise<void> {
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server!.close((err) => (err ? reject(err) : resolve()));
    });
    server = null;
  }
  closeDb();
  if (dataDir && fs.existsSync(dataDir)) {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
  dataDir = '';
  baseUrl = '';
}

export type ApiResult<T = unknown> = {
  status: number;
  body: T;
  ok: boolean;
};

export async function api<T = unknown>(
  apiPath: string,
  options: {
    method?: string;
    body?: unknown;
    deviceId?: string;
    headers?: Record<string, string>;
  } = {},
): Promise<ApiResult<T>> {
  if (!baseUrl) throw new Error('Test server not started');

  const headers: Record<string, string> = {
    ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    'X-Device-Id': options.deviceId ?? TEST_DEVICE_ID,
    ...options.headers,
  };

  const res = await fetch(`${baseUrl}${apiPath}`, {
    method: options.method ?? (options.body !== undefined ? 'POST' : 'GET'),
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const text = await res.text();
  let body: T = undefined as T;
  if (text) {
    try {
      body = JSON.parse(text) as T;
    } catch {
      body = text as T;
    }
  }

  return { status: res.status, body, ok: res.ok };
}

export function getTestBaseUrl(): string {
  return baseUrl;
}

export function getTestDataDir(): string {
  return dataDir;
}
