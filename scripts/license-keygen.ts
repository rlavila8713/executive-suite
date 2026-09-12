#!/usr/bin/env node
/**
 * Generate a new Ed25519 key pair for license signing.
 * - Public key: print to stdout (embed in server/licenseCrypto.ts)
 * - Private key: write to license-private.pem (NEVER commit or ship to clients)
 */
import { generateKeyPairSync } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const outPath = path.join(process.cwd(), 'license-private.pem');

if (fs.existsSync(outPath)) {
  console.error('license-private.pem already exists. Delete it first if you want a new key pair.');
  process.exit(1);
}

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const publicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

fs.writeFileSync(outPath, privatePem, { mode: 0o600 });

console.log('Private key written to license-private.pem (keep secure, do not commit).\n');
console.log('Embed this public key in server/licenseCrypto.ts (LICENSE_PUBLIC_KEY_PEM):\n');
console.log(publicPem);
