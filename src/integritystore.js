import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync, renameSync, rmSync, openSync, fsyncSync, closeSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes, createHmac, timingSafeEqual } from 'node:crypto';

// Detect edits made without the local key. This is not isolation from a process
// running as the same Windows user, which can also read or replace that key.
const MAX_BYTES = 2 * 1024 * 1024;
export function readProtectedJson(path, fallback) {
  if (!path || (!existsSync(path) && !existsSync(path + '.key'))) return structuredClone(fallback);
  if (statSync(path).size > MAX_BYTES) throw new Error('Configuration exceeds size limit');
  const parsed = JSON.parse(readFileSync(path, 'utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid configuration');
  const { integrity, ...body } = parsed;
  // Existing unsigned installations are read as legacy, then sealed on their
  // next deliberate save. Once a key exists unsigned files are never accepted.
  if (!integrity && !existsSync(path + '.key')) return body;
  if (statSync(path + '.key').size !== 32 || integrity?.version !== 1 || !/^[a-f0-9]{64}$/.test(integrity.signature ?? '')) throw new Error('Configuration integrity check failed');
  const expected = createHmac('sha256', readFileSync(path + '.key')).update(JSON.stringify(body)).digest();
  if (!timingSafeEqual(expected, Buffer.from(integrity.signature, 'hex'))) throw new Error('Configuration integrity check failed');
  return body;
}

export function writeProtectedJson(path, body) {
  readProtectedJson(path, {}); // Never silently overwrite rejected data.
  const clean = JSON.parse(JSON.stringify(body));
  if (Object.hasOwn(clean, 'integrity')) throw new Error('Reserved configuration field');
  const estimate = JSON.stringify({ ...clean, integrity: { version: 1, signature: '0'.repeat(64) } }, null, 2) + '\n';
  if (Buffer.byteLength(estimate) > MAX_BYTES) throw new Error('Configuration exceeds size limit');
  mkdirSync(dirname(path), { recursive: true });
  const keyPath = path + '.key';
  if (!existsSync(keyPath)) {
    try { writeFileSync(keyPath, randomBytes(32), { flag: 'wx', mode: 0o600 }); }
    catch (err) { if (err.code !== 'EEXIST') throw err; }
  }
  const signature = createHmac('sha256', readFileSync(keyPath)).update(JSON.stringify(clean)).digest('hex');
  const data = JSON.stringify({ ...clean, integrity: { version: 1, signature } }, null, 2) + '\n';
  if (Buffer.byteLength(data) > MAX_BYTES) throw new Error('Configuration exceeds size limit');
  const temp = path + '.' + randomBytes(8).toString('hex') + '.tmp';
  try {
    const fd = openSync(temp, 'wx', 0o600);
    try { writeFileSync(fd, data); fsyncSync(fd); } finally { closeSync(fd); }
    renameSync(temp, path);
  } finally { rmSync(temp, { force: true }); }
}
