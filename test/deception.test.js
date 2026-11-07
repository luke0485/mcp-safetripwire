import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_DECOYS, CANARY, decoyTools, decoyNames, isDecoy, appendDecoys, findCanary, loadCanary } from '../src/deception.js';
import { createInspector } from '../src/inspect.js';
import { setMinConsoleLevel } from '../src/log.js';
import { hashTools } from '../src/manifest.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

setMinConsoleLevel('silent');

test('the default decoys are the ones an attacker would reach for', () => {
  const names = decoyNames();
  assert.ok(names.includes('get_prod_db_password'));
  assert.ok(names.includes('read_aws_credentials'));
  assert.ok(names.includes('export_all_customer_data'));
});

test('decoyTools hands out copies, so callers cannot mutate the templates', () => {
  const a = decoyTools();
  a[0].name = 'changed';
  assert.equal(decoyNames()[0], DEFAULT_DECOYS[0].name);
});

test('isDecoy matches only the planted names', () => {
  assert.equal(isDecoy('get_prod_db_password'), true);
  assert.equal(isDecoy('read_file'), false);
  assert.equal(isDecoy(undefined), false);
});

test('appendDecoys adds the traps without shadowing a real tool', () => {
  const real = [{ name: 'read_file' }, { name: 'get_prod_db_password' }]; // deliberate collision
  const merged = appendDecoys(real);
  assert.equal(merged.length, real.length + DEFAULT_DECOYS.length - 1);
  assert.equal(merged.filter((t) => t.name === 'get_prod_db_password').length, 1);
  assert.equal(merged[0].name, 'read_file'); // real tools keep their order
});

test('findCanary spots the planted secret and ignores everything else', () => {
  assert.equal(findCanary('x' + CANARY + 'y'), true);
  assert.equal(findCanary('nothing to see'), false);
  assert.equal(findCanary(''), false);
  assert.equal(findCanary(undefined), false);
});

test('loadCanary creates one stable per-install secret', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'tw-canary-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const a = loadCanary(dir);
  const b = loadCanary(dir);
  assert.match(a, /^TRIPWIRE-CANARY-[0-9a-f]{32}$/);
  assert.equal(a, b);
});

test('a custom canary is the only value the inspector plants', () => {
  const custom = 'TRIPWIRE-CANARY-' + 'a'.repeat(32);
  const ins = createInspector({
    name: 'test',
    getPin: () => ({ hash: 'a'.repeat(64) }),
    policy: { mode: 'warn', allowedTools: null, denyTools: [], deception: true },
    posture: 'warn',
    transport: 'test',
    canary: custom,
    getAdvanced: () => ({ blockedTools: [], blockedDestinations: [], baselineMode: 'off', baseline: {} }),
  });
  const customCall = ins.onClientMessage({ jsonrpc: '2.0', id: 8, method: 'tools/call', params: { name: 'read_file', path: custom } });
  assert.equal(customCall.forward, false);
  assert.match(customCall.error.error.message, /planted secret/);
  const defaultCall = ins.onClientMessage({ jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name: 'read_file', path: CANARY } });
  assert.equal(defaultCall.forward, true);
});

function inspectorWith(posture, hash = 'a'.repeat(64)) {
  return createInspector({
    name: 'test',
    getPin: () => ({ hash }),
    policy: { mode: posture === 'block' ? 'block' : 'warn', allowedTools: null, denyTools: [], deception: null },
    posture,
    transport: 'test',
  });
}

test('protect mode arms decoys on the tool surface', () => {
  // Pin the real surface first: a mismatched pin blocks the whole list as a
  // rug-pull, and no decoys would ever be appended.
  const tools = [{ name: 'read_file', description: 'Read a file.' }];
  const msg = { jsonrpc: '2.0', id: 2, result: { tools } };
  inspectorWith('block', hashTools(tools).hash).onServerMessage(msg, 'tools/list');
  assert.ok(msg.result.tools.length > 1);
  assert.equal(isDecoy(msg.result.tools[msg.result.tools.length - 1].name), true);
});

test('observe mode leaves the surface alone', () => {
  const msg = { jsonrpc: '2.0', id: 2, result: { tools: [{ name: 'read_file', description: 'Read a file.' }] } };
  inspectorWith('warn').onServerMessage(msg, 'tools/list');
  assert.equal(msg.result.tools.length, 1);
});

test('calling a decoy is blocked and reported as a decoy trigger', () => {
  const ins = inspectorWith('block');
  const v = ins.onClientMessage({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'get_prod_db_password' } });
  assert.equal(v.forward, false);
  assert.match(v.error.error.message, /decoy/);
});

test('a call carrying the planted secret is blocked', () => {
  const ins = inspectorWith('block');
  const v = ins.onClientMessage({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'read_file', path: CANARY } });
  assert.equal(v.forward, false);
  assert.match(v.error.error.message, /planted secret/);
});

test('a normal call on a reviewed channel still passes', () => {
  const tools = [{ name: 'read_file' }];
  const ins = inspectorWith('block', hashTools(tools).hash);
  ins.onServerMessage({ jsonrpc: '2.0', id: 1, result: { tools } }, 'tools/list');
  const v = ins.onClientMessage({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'read_file', path: '/tmp/x' } });
  assert.equal(v.forward, true);
});
