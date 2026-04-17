#!/usr/bin/env node
/**
 * Creates executive-suite-release.zip from dist/ (run `npm run build` first).
 * Windows: uses tar -a. macOS/Linux: uses zip.
 */
import { execSync } from 'node:child_process';
import { existsSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const zipPath = join(root, 'executive-suite-release.zip');

if (!existsSync(dist)) {
  console.error('Missing dist/. Run: npm run build');
  process.exit(1);
}
try {
  if (existsSync(zipPath)) unlinkSync(zipPath);
} catch {
  /* ignore */
}

if (process.platform === 'win32') {
  execSync(`tar -a -c -f "${zipPath}" -C "${dist}" .`, { stdio: 'inherit', shell: true, cwd: root });
} else {
  execSync(`cd "${dist}" && zip -rq "${zipPath}" .`, { stdio: 'inherit', shell: true });
}

console.log(`\nCreated: ${zipPath}`);
console.log('Copy that zip to the other PC, unzip, then from the extracted folder run:');
console.log('  npx --yes serve@14 . -s -l 4173');
console.log('(or install Node, run npm ci && npm run start:dist from the full project)\n');
