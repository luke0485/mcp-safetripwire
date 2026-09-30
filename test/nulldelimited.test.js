import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNullFrameParser, encodeNullJson, summarizeExecute, codeGist } from '../src/nulldelimited.js';

function collector() {
  const messages = [];
  const errors = [];
  const push = createNullFrameParser((m) => messages.push(m), { onError: (e) => errors.push(e) });
  return { messages, errors, push };
}

test('parses a single NUL-terminated JSON frame', () => {
  const c = collector();
  c.push(encodeNullJson({ type: 'execute', code: 'print(1)' }));
  assert.equal(c.messages.length, 1);
  assert.equal(c.messages[0].type, 'execute');
});

test('parses several frames arriving in one chunk', () => {
  const c = collector();
  c.push(Buffer.concat([encodeNullJson({ type: 'execute', code: 'a' }), encodeNullJson({ type: 'execute', code: 'b' })]));
  assert.deepEqual(c.messages.map((m) => m.code), ['a', 'b']);
});

test('reassembles a frame split across chunks', () => {
  const c = collector();
  const buf = encodeNullJson({ type: 'execute', code: 'hello' });
  for (const byte of buf) c.push(Buffer.from([byte]));
  assert.equal(c.messages.length, 1);
  assert.equal(c.messages[0].code, 'hello');
});

test('is binary-safe when a multi-byte character is split across chunks', () => {
  const c = collector();
  const buf = encodeNullJson({ type: 'execute', code: '你好世界' });
  const cut = 12; // deliberately inside a multi-byte character
  c.push(buf.subarray(0, cut));
  c.push(buf.subarray(cut));
  assert.equal(c.messages.length, 1);
  assert.equal(c.messages[0].code, '你好世界');
});

test('a malformed frame is reported and parsing continues', () => {
  const c = collector();
  c.push(Buffer.from('not json\0', 'utf8'));
  c.push(encodeNullJson({ type: 'execute', code: 'ok' }));
  assert.equal(c.errors.length, 1);
  assert.equal(c.messages.length, 1);
});

test('empty frames between terminators are ignored', () => {
  const c = collector();
  c.push(Buffer.from('\0\0', 'utf8'));
  assert.equal(c.messages.length, 0);
  assert.equal(c.errors.length, 0);
});

test('an unterminated over-long frame is dropped rather than buffered forever', () => {
  const messages = [];
  const errors = [];
  const push = createNullFrameParser((m) => messages.push(m), { onError: (e) => errors.push(e), maxFrameBytes: 32 });
  push(Buffer.from('x'.repeat(100), 'utf8'));
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /NUL terminator/);
});

test('summarizeExecute tags interesting payloads lexically', () => {
  const s = summarizeExecute("import os\nos.system('whoami')\nsubprocess.run(['x'])");
  assert.ok(s.risky.includes('system'));
  assert.ok(s.risky.includes('command-execution'));
  assert.equal(s.lines, 3);
  assert.ok(s.bytes > 0);
});

test('summarizeExecute flags credentials and network use', () => {
  const s = summarizeExecute("open('/home/me/.ssh/id_rsa')\nrequests.get('http://x')");
  assert.ok(s.risky.includes('files'));
  assert.ok(s.risky.includes('credentials'));
  assert.ok(s.risky.includes('network'));
});

test('summarizeExecute on plain Blender code tags only the Blender API', () => {
  const s = summarizeExecute('bpy.ops.object.delete()');
  assert.deepEqual(s.risky, ['blender-api']);
});

test('codeGist collapses whitespace and truncates', () => {
  assert.equal(codeGist('a\n\n  b'), 'a b');
  assert.equal(codeGist('x'.repeat(200), 10), 'x'.repeat(10) + '…');
});
