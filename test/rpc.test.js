import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encode, createLineDecoder } from '../src/rpc.js';

test('decoder preserves UTF-8 split inside multibyte characters', () => {
  const seen = [];
  const push = createLineDecoder((msg) => seen.push(msg));
  const msg = { text: '中文🙂' };
  for (const byte of Buffer.from(encode(msg))) push(Buffer.from([byte]));
  assert.deepEqual(seen, [msg]);
});

test('encode produces exactly one newline-terminated line', () => {
  const out = encode({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
  assert.equal(out.endsWith('\n'), true);
  assert.equal(out.trimEnd().includes('\n'), false);
});

test('encode escapes embedded newlines so framing stays intact', () => {
  const out = encode({ jsonrpc: '2.0', result: { text: 'line1\nline2' } });
  assert.equal(out.split('\n').length, 2); // message + trailing empty
});

test('decoder reassembles messages split across chunks', () => {
  const seen = [];
  const push = createLineDecoder((m) => seen.push(m));
  const data = encode({ id: 1, result: { ok: true } }) + encode({ id: 2, result: { ok: false } });
  for (const ch of data) push(ch); // one character at a time
  assert.equal(seen.length, 2);
  assert.deepEqual(seen[0], { id: 1, result: { ok: true } });
});

test('decoder skips blank lines and reports parse errors without throwing', () => {
  const seen = [];
  const errors = [];
  const push = createLineDecoder((m) => seen.push(m), { onError: (e) => errors.push(e) });
  push('\n{"id":1}\nnot json\n{"id":2}\n');
  assert.equal(seen.length, 2);
  assert.equal(errors.length, 1);
});

test('decoder drops the buffer when a line exceeds maxLineBytes', () => {
  const errors = [];
  const push = createLineDecoder(() => {}, { onError: (e) => errors.push(e), maxLineBytes: 16 });
  push('x'.repeat(64));
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /exceeded/);
});
