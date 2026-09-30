import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInspector } from '../src/inspect.js';
import { setMinConsoleLevel } from '../src/log.js';
import { hashTools } from '../src/manifest.js';

// The inspector writes to stderr for warn+; silence it so the test output stays
// readable. The JSONL audit path is unaffected.
setMinConsoleLevel('silent');

function inspector({ pinHash = null, posture = 'warn', policy = { mode: 'warn', allowedTools: null, denyTools: [] } } = {}) {
  return createInspector({ name: 'test', getPin: () => ({ hash: pinHash }), policy, posture, transport: 'test' });
}

const call = (name) => ({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name } });
const listOf = (tools) => ({ jsonrpc: '2.0', id: 2, result: { tools } });
const tagged = (name) => ({ name, description: `desc ${'\u{E0061}\u{E0062}'}` });

test('protect posture denies unreviewed calls even with the default warn policy', () => {
  assert.equal(inspector({ posture: 'block' }).onClientMessage(call('normal')).forward, false);
});

test('a rejected manifest also blocks cached calls until the observed surface is reapproved', () => {
  const old = [{ name: 'safe', description: 'old' }];
  const changed = [{ name: 'safe', description: 'changed' }];
  let hash = hashTools(old).hash;
  const ins = createInspector({ name: 'test', getPin: () => ({ hash }), policy: { mode: 'warn', deception: false }, posture: 'block' });
  const list = listOf(changed);
  ins.onServerMessage(list, 'tools/list');
  assert.equal(list.error.code, -32002);
  assert.equal(ins.onClientMessage(call('safe')).forward, false);
  hash = hashTools(changed).hash;
  assert.equal(ins.onClientMessage(call('safe')).forward, true);
});

test('live posture changes affect calls and previously observed surfaces', () => {
  let posture = 'warn';
  const ins = createInspector({ name: 'test', getPin: () => ({}), policy: { mode: 'warn' }, getPosture: () => posture });
  assert.equal(ins.onClientMessage(call('safe')).forward, true);
  ins.onServerMessage(listOf([{ name: 'safe' }]), 'tools/list');
  posture = 'block';
  assert.equal(ins.onClientMessage(call('safe')).forward, false);
  posture = 'warn';
  assert.equal(ins.onClientMessage(call('safe')).forward, true);
});

test('stripped tools cannot be invoked by a cached name', () => {
  const ins = inspector({ posture: 'strip' });
  ins.onServerMessage(listOf([tagged('bad'), { name: 'safe' }]), 'tools/list');
  assert.equal(ins.onClientMessage(call('bad')).forward, false);
  assert.equal(ins.onClientMessage(call('safe')).forward, true);
});

test('warn posture forwards a tool call', () => {
  assert.equal(inspector().onClientMessage(call('anything')).forward, true);
});

test('denyTools blocks a call and returns a JSON-RPC error on the same id', () => {
  const ins = inspector({ policy: { mode: 'warn', allowedTools: null, denyTools: ['execute_blender_code'] } });
  const v = ins.onClientMessage(call('execute_blender_code'));
  assert.equal(v.forward, false);
  assert.equal(v.error.id, 1);
  assert.equal(v.error.error.code, -32001);
  assert.match(v.error.error.message, /blocked/);
});

test('block mode denies anything not allowlisted on a reviewed channel', () => {
  const ins = inspector({ pinHash: 'a'.repeat(64), policy: { mode: 'block', allowedTools: ['read_file'], denyTools: [] } });
  assert.equal(ins.onClientMessage(call('read_file')).forward, true);
  assert.equal(ins.onClientMessage(call('other')).forward, false);
});

test('block mode denies everything on a channel that was never reviewed', () => {
  const ins = inspector({ policy: { mode: 'block', allowedTools: ['read_file'], denyTools: [] } });
  const v = ins.onClientMessage(call('read_file'));
  assert.equal(v.forward, false);
  assert.match(v.error.error.message, /unreviewed/);
});

test('review before use: an unpinned surface is recorded as pending', () => {
  const seen = [];
  const ins = createInspector({
    name: 'test',
    getPin: () => ({ hash: null }),
    policy: { mode: 'warn', allowedTools: null, denyTools: [] },
    posture: 'warn',
    transport: 'test',
    recordPending: (hash, count) => seen.push({ hash, count }),
  });
  const msg = { jsonrpc: '2.0', id: 2, result: { tools: [{ name: 'a', description: 'fine' }] } };
  ins.onServerMessage(msg, 'tools/list');
  assert.equal(seen.length, 1);
  assert.equal(seen[0].count, 1);
});

test('strip posture removes only the critically-flagged tool', () => {
  const msg = listOf([{ name: 'ok', description: 'fine' }, tagged('bad')]);
  inspector({ posture: 'strip' }).onServerMessage(msg, 'tools/list');
  assert.deepEqual(msg.result.tools.map((t) => t.name), ['ok']);
});

test('block posture replaces the whole tools/list with an error', () => {
  const msg = listOf([tagged('bad')]);
  inspector({ posture: 'block' }).onServerMessage(msg, 'tools/list');
  assert.equal(msg.result, undefined);
  assert.equal(msg.error.code, -32003);
});

test('a rug-pull blocks the list even with no static findings', () => {
  const msg = listOf([{ name: 'ok', description: 'fine' }]);
  inspector({ posture: 'block', pinHash: 'deadbeef' }).onServerMessage(msg, 'tools/list');
  assert.equal(msg.error.code, -32002);
});

test('warn posture leaves a poisoned surface in place (observe only)', () => {
  const msg = listOf([tagged('bad')]);
  inspector({ posture: 'warn' }).onServerMessage(msg, 'tools/list');
  assert.deepEqual(msg.result.tools.map((t) => t.name), ['bad']);
});

test('responses for other methods are passed through untouched', () => {
  const msg = { jsonrpc: '2.0', id: 3, result: { content: [] } };
  inspector({ posture: 'block', pinHash: 'deadbeef' }).onServerMessage(msg, 'tools/call');
  assert.deepEqual(msg.result, { content: [] });
  assert.equal(msg.error, undefined);
});
