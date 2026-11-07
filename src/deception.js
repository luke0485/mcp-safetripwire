import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { dataDir } from './paths.js';

// Deception: traps that no legitimate workflow would ever touch.
//
// Why this is the purest form of proactive defence: we are not guessing at
// intent or matching patterns. We put a tool on the surface that exists for no
// other reason than to be called, so a single call is proof of hostile or
// badly-poisoned behaviour, with no false positives by construction.
//
// The same idea covers data: a planted secret (canary) that nothing legitimate
// reads. If it ever shows up in an outbound call, something read what it should
// not have.

export const DEFAULT_DECOYS = [
  {
    name: 'get_prod_db_password',
    description: 'Return the production database password.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'read_aws_credentials',
    description: 'Read AWS access keys from the local credential store.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'export_all_customer_data',
    description: 'Export the full customer table to a local file.',
    inputSchema: { type: 'object', properties: { dest: { type: 'string' } } },
  },
];

// Kept as the deterministic default for tests and the offline lab. A real
// installation plants a per-user random value via loadCanary().
export const CANARY = 'TRIPWIRE-CANARY-7f3a91c2-do-not-use';

export function loadCanary(dir = dataDir()) {
  const path = join(dir, 'canary.txt');
  try {
    const existing = readFileSync(path, 'utf8').trim();
    if (/^TRIPWIRE-CANARY-[0-9a-f]{16,}$/.test(existing)) return existing;
  } catch {
    /* first run, or unreadable: create a fresh value */
  }
  const value = 'TRIPWIRE-CANARY-' + randomBytes(16).toString('hex');
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(path, value + '\n', { mode: 0o600 });
  } catch {
    /* an unwritable data dir still gets a session canary */
  }
  return value;
}

export function decoyTools(decoys = DEFAULT_DECOYS) {
  return decoys.map((d) => ({ ...d, inputSchema: { ...(d.inputSchema ?? { type: 'object' }) } }));
}

export function decoyNames(decoys = DEFAULT_DECOYS) {
  return decoys.map((d) => d.name);
}

export function isDecoy(name, decoys = DEFAULT_DECOYS) {
  return decoys.some((d) => d.name === name);
}

// Append decoys without ever shadowing a real tool: a collision would make the
// trap ambiguous, and shadowing a genuine name could break legitimate work.
export function appendDecoys(tools, decoys = DEFAULT_DECOYS) {
  const taken = new Set((tools ?? []).map((t) => t && t.name));
  const added = decoyTools(decoys).filter((d) => !taken.has(d.name));
  return [...(tools ?? []), ...added];
}

export function findCanary(text, canary = CANARY) {
  if (typeof text !== 'string' || text === '') return false;
  return text.includes(canary);
}
