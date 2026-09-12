#!/usr/bin/env node
/**
 * Vendor tool: generate a signed license key from a client request code.
 *
 * Usage:
 *   npm run license:generate -- --request "ES-REQ1...."
 *   npm run license:generate -- --request-file ./request.txt
 *
 * Requires license-private.pem in project root (see npm run license:keygen).
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { decodeLicenseRequest, signLicense, type LicensePayload } from '../server/licenseCrypto.js';
import { LICENSE_PLANS } from '../server/license.js';

function readArg(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  if (idx === -1 || idx + 1 >= process.argv.length) return undefined;
  return process.argv[idx + 1];
}

const requestInline = readArg('--request');
const requestFile = readArg('--request-file');
const privateKeyPath = readArg('--key') ?? path.join(process.cwd(), 'license-private.pem');

let requestCode = requestInline;
if (!requestCode && requestFile) {
  requestCode = fs.readFileSync(requestFile, 'utf8').trim();
}

if (!requestCode) {
  console.error('Usage: npm run license:generate -- --request "ES-REQ1...."');
  console.error('   or: npm run license:generate -- --request-file ./request.txt');
  process.exit(1);
}

if (!fs.existsSync(privateKeyPath)) {
  console.error(`Private key not found at ${privateKeyPath}. Run: npm run license:keygen`);
  process.exit(1);
}

const privateKeyPem = fs.readFileSync(privateKeyPath, 'utf8');
const req = decodeLicenseRequest(requestCode);
const plan = LICENSE_PLANS[req.planId];

if (!plan) {
  console.error('Unknown plan in request:', req.planId);
  process.exit(1);
}

const payload: LicensePayload = {
  v: 1,
  deviceId: req.deviceId,
  planId: req.planId,
  issuedAt: Date.now(),
  days: plan.days,
  price: plan.price,
  nonce: randomBytes(8).toString('hex'),
};

const licenseKey = signLicense(payload, privateKeyPem);

console.log('\n--- License generated ---');
console.log('Store:', req.storeName || '(sin nombre)');
console.log('Branch:', req.branch || '(sin sucursal)');
console.log('Plan:', plan.name, `(${plan.price} CUP / ${plan.days} days)`);
console.log('Device:', req.deviceId);
console.log('\nSend this license key to the client:\n');
console.log(licenseKey);
console.log('');
