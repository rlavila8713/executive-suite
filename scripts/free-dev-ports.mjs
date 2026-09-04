#!/usr/bin/env node
/**
 * Frees ports 3000 (Vite) and 4000 (API) when they are held by stale node processes.
 * Safe to run before `npm run dev`; no-op if ports are free.
 */
import { execSync } from 'node:child_process';

const PORTS = [3000, 4000];

function pidsOnPort(port) {
  try {
    const out = execSync(`lsof -nP -iTCP:${port} -sTCP:LISTEN -t`, { encoding: 'utf8' }).trim();
    if (!out) return [];
    return [...new Set(out.split('\n').map((s) => s.trim()).filter(Boolean))];
  } catch {
    return [];
  }
}

let freed = 0;
for (const port of PORTS) {
  const pids = pidsOnPort(port);
  for (const pid of pids) {
    try {
      process.kill(Number(pid), 'SIGTERM');
      console.log(`[free-ports] Stopped PID ${pid} on port ${port}`);
      freed++;
    } catch {
      // already gone
    }
  }
}

if (freed === 0) {
  console.log('[free-ports] Ports 3000 and 4000 are free.');
} else {
  // Brief pause so the OS releases the sockets before concurrently starts.
  await new Promise((r) => setTimeout(r, 400));
}
