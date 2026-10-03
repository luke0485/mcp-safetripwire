import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readProtectedJson, writeProtectedJson } from '../src/integritystore.js';
import { loadPolicy, decide } from '../src/policy.js';
import { createLineDecoder } from '../src/rpc.js';
import { createSseParser } from '../src/sse.js';

for (const change of ['edit', 'strip', 'delete']) test(`sealed configuration rejects ${change}`, t => {
  const dir = mkdtempSync(join(tmpdir(), 'tripwire-sealed-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'settings.json');
  writeProtectedJson(path, { protection: 'protect' });
  assert.equal(readProtectedJson(path, {}).protection, 'protect');
  const data = JSON.parse(readFileSync(path, 'utf8'));
  if (change === 'edit') data.protection = 'observe';
  if (change === 'strip') delete data.integrity;
  if (change === 'delete') rmSync(path); else writeFileSync(path, JSON.stringify(data));
  assert.throws(() => readProtectedJson(path, {}));
  assert.throws(() => writeProtectedJson(path, { protection: 'observe' }));
});

test('legacy configuration is sealed on deliberate save', t => {
  const dir = mkdtempSync(join(tmpdir(), 'tripwire-legacy-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'settings.json');
  writeFileSync(path, '{"protection":"observe"}');
  assert.equal(readProtectedJson(path, {}).protection, 'observe');
  writeProtectedJson(path, { protection: 'protect' });
  assert.equal(JSON.parse(readFileSync(path, 'utf8')).integrity.signature.length, 64);
});

test('explicit missing or malformed policies fail closed', t => {
  const dir = mkdtempSync(join(tmpdir(), 'tripwire-policy-check-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'policy.json');
  assert.equal(decide(loadPolicy(path), 'safe').action, 'block');
  for (const value of [null, [], { mode: 'blok' }, { denyTools: 'safe' }, { allowedTools: [1] }, { deception: 'false' }]) {
    writeFileSync(path, JSON.stringify(value));
    assert.equal(decide(loadPolicy(path), 'safe').action, 'block');
  }
});

test('stdio byte limit covers complete UTF-8 lines and drops oversized suffixes', () => {
  const seen = [], errors = [];
  const push = createLineDecoder(value => seen.push(value), { maxLineBytes: 16, onError: error => errors.push(error) });
  push('{"x":"中文中文中文"}\n');
  push('x'.repeat(20));
  push('{"id":1}\n{"id":2}\n');
  assert.deepEqual(seen, [{ id: 2 }]);
  assert.equal(errors.length, 2);
});

for (const ending of ['', '\n\n']) test(`SSE UTF-8 byte limit stops oversized events ${JSON.stringify(ending)}`, () => {
  const seen = [], errors = [];
  const push = createSseParser(value => seen.push(value), { maxEventBytes: 16, onError: error => errors.push(error) });
  push('data: 中文中文中文' + ending);
  push('data: safe\n\n');
  assert.equal(seen.length, 0);
  assert.equal(errors.length, 1);
});

test('oversized protected configuration fails without leaving a new key', t => {
  const dir = mkdtempSync(join(tmpdir(), 'tripwire-store-size-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'settings.json');
  assert.throws(() => writeProtectedJson(path, { value: 'x'.repeat(2 * 1024 * 1024) }), /size limit/);
  assert.deepEqual(readProtectedJson(path, { protection: 'observe' }), { protection: 'observe' });
});
