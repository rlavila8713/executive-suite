#!/usr/bin/env node
/**
 * Production launcher for client delivery (Windows / macOS / Linux).
 * Starts the API server and serves the built web UI from dist/.
 *
 * Prerequisites: npm run build && npm run build:server
 *
 * Usage:
 *   npm run client:start
 *   DATA_DIR=/path/to/data PORT=4000 WEB_PORT=3000 npm run client:start
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const serverBundle = path.join(root, 'server', 'dist', 'index.cjs');

const apiPort = process.env.PORT ?? '4000';
const webPort = process.env.WEB_PORT ?? '3000';
const dataDir = process.env.DATA_DIR ?? path.join(root, 'data');

if (!fs.existsSync(dist)) {
  console.error('Missing dist/. Run: npm run build');
  process.exit(1);
}
if (!fs.existsSync(serverBundle)) {
  console.error('Missing server bundle. Run: npm run build:server');
  process.exit(1);
}

fs.mkdirSync(dataDir, { recursive: true });

function waitForHealth(port, attempts = 40) {
  return new Promise((resolve) => {
    let n = 0;
    const tick = () => {
      const req = http.get(`http://127.0.0.1:${port}/health`, (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      });
      req.on('error', () => retry());
      req.setTimeout(400, () => {
        req.destroy();
        retry();
      });
    };
    const retry = () => {
      n += 1;
      if (n >= attempts) {
        resolve(false);
        return;
      }
      setTimeout(tick, 250);
    };
    tick();
  });
}

const api = spawn(process.execPath, [serverBundle], {
  env: { ...process.env, DATA_DIR: dataDir, PORT: apiPort },
  stdio: 'inherit',
  cwd: root,
});

const web = spawn('npx', ['--yes', 'serve@14', 'dist', '-s', '-l', String(webPort)], {
  stdio: 'inherit',
  shell: true,
  cwd: root,
});

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  api.kill();
  web.kill();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

void (async () => {
  const ok = await waitForHealth(apiPort);
  if (!ok) {
    console.error(`API did not start on port ${apiPort}`);
    shutdown();
    return;
  }
  console.log('\nExecutive Suite — client mode');
  console.log(`  Web UI:  http://localhost:${webPort}`);
  console.log(`  API:     http://localhost:${apiPort}`);
  console.log(`  Data:    ${dataDir}`);
  console.log('\nOn first open, set API URL in Settings → Servidor local if needed.');
  console.log('Press Ctrl+C to stop both processes.\n');
})();
