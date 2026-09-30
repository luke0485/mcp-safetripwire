import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync } from 'node:fs';
import {
  serverKey, isProtectedServer, describeTarget, snapshotServers,
  diffSnapshot, unprotectedServers, loadKnown, saveKnown,
} from '../src/discover.js';

test('isProtectedServer detects a wrapped stdio server', () => {
  assert.equal(isProtectedServer({ kind: 'stdio', command: 'node', args: ['.../src/cli.js', 'wrap', '--', 'uvx', 'blender-mcp'] }), true);
  assert.equal(isProtectedServer({ kind: 'stdio', command: 'C:\\...\\dist\\tripwire.exe', args: ['wrap'] }), true);
  assert.equal(isProtectedServer({ kind: 'stdio', command: 'uvx', args: ['blender-mcp'] }), false);
});

test('isProtectedServer detects a routed http server', () => {
  const routes = { listen: { host: '127.0.0.1', port: 8788 }, servers: { x: { upstream: 'https://example.com/mcp' } } };
  assert.equal(isProtectedServer({ kind: 'http', url: 'http://127.0.0.1:8788/x/mcp' }, routes), true);
  assert.equal(isProtectedServer({ kind: 'http', url: 'http://127.0.0.1:9999/mcp' }, routes), false);
  assert.equal(isProtectedServer({ kind: 'http', url: 'https://127.0.0.1.example.com/x/mcp' }, routes), false);
  assert.equal(isProtectedServer({ kind: 'http', url: 'http://127.0.0.1:8788/unknown/mcp' }, routes), false);
  assert.equal(isProtectedServer({ kind: 'http', url: 'https://mcp.example.com/mcp' }), false);
});

test('isProtectedServer is defensive about missing data', () => {
  assert.equal(isProtectedServer(null), false);
  assert.equal(isProtectedServer({}), false);
});

test('describeTarget renders both shapes', () => {
  assert.equal(describeTarget({ kind: 'stdio', command: 'uvx', args: ['blender-mcp'] }), 'uvx blender-mcp');
  assert.equal(describeTarget({ kind: 'http', url: 'https://x/mcp' }), 'https://x/mcp');
});

const enumerate = () => ([
  { hostId: 'codex', name: 'node_repl', info: { kind: 'stdio', command: 'npx', args: ['-y', 'node-repl'] } },
  { hostId: 'codex', name: 'remote', info: { kind: 'http', url: 'https://mcp.example.com/mcp' } },
]);

test('snapshot + diff detects a newly appeared tool', () => {
  const before = snapshotServers(enumerate);
  const after = snapshotServers(() => [
    ...enumerate(),
    { hostId: 'cursor', name: 'newtool', info: { kind: 'stdio', command: 'uvx', args: ['newtool'] } },
  ]);
  const { added, removed, changed } = diffSnapshot(before, after);
  assert.equal(added.length, 1);
  assert.equal(added[0].name, 'newtool');
  assert.equal(removed.length, 0);
  assert.equal(changed.length, 0);
});

test('diff detects a tool that was removed and one that changed target', () => {
  const before = snapshotServers(enumerate);
  const after = snapshotServers(() => ([
    { hostId: 'codex', name: 'remote', info: { kind: 'http', url: 'https://mcp.evil.example/mcp' } },
  ]));
  const { added, removed, changed } = diffSnapshot(before, after);
  assert.equal(added.length, 0);
  assert.deepEqual(removed.map((r) => r.name), ['node_repl']);
  assert.equal(changed.length, 1);
  assert.equal(changed[0].was, 'https://mcp.example.com/mcp');
});

test('unprotectedServers lists only the ones not routed through us', () => {
  const snap = snapshotServers(enumerate);
  assert.equal(unprotectedServers(snap).length, 2);
  const wrapped = snapshotServers(() => ([
    { hostId: 'codex', name: 'a', info: { kind: 'stdio', command: 'node', args: ['src/cli.js', 'wrap'] } },
  ]));
  assert.equal(unprotectedServers(wrapped).length, 0);
});

test('serverKey is stable and host-scoped', () => {
  assert.equal(serverKey('codex', 'x'), 'codex::x');
  assert.notEqual(serverKey('a', 'x'), serverKey('b', 'x'));
});

test('a missing registry reads as null (never seeded), and round-trips once saved', () => {
  const path = join(tmpdir(), `tw-known-${process.pid}-${Date.now()}.json`);
  try {
    rmSync(path, { force: true });
    assert.equal(loadKnown(path), null);
    const snap = snapshotServers(enumerate);
    saveKnown(snap, path);
    assert.deepEqual(Object.keys(loadKnown(path)).sort(), [serverKey('codex', 'node_repl'), serverKey('codex', 'remote')].sort());
  } finally {
    rmSync(path, { force: true });
  }
});
