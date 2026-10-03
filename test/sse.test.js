import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSseParser, parseEventBlock, encodeSseEvent, tryParseJsonRpc, isJsonRpc } from '../src/sse.js';

test('SSE parser preserves UTF-8 split inside multibyte characters', () => {
  const seen = [];
  const push = createSseParser((ev) => seen.push(ev));
  for (const byte of Buffer.from(encodeSseEvent({ data: '中文🙂' }))) push(Buffer.from([byte]));
  assert.equal(seen[0].data, '中文🙂');
});

test('parseEventBlock reads event/data/id fields', () => {
  const ev = parseEventBlock('event: message\nid: 7\ndata: {"a":1}');
  assert.equal(ev.event, 'message');
  assert.equal(ev.id, '7');
  assert.equal(ev.data, '{"a":1}');
});

test('multi-line data is joined with newlines', () => {
  assert.equal(parseEventBlock('data: a\ndata: b').data, 'a\nb');
});

test('comment-only blocks produce nothing', () => {
  assert.equal(parseEventBlock(': keep-alive'), null);
  assert.equal(parseEventBlock(''), null);
});

test('parser reassembles events split across chunks, including CRLF', () => {
  const events = [];
  const push = createSseParser((e) => events.push(e));
  const stream = 'event: message\r\ndata: {"id":1}\r\n\r\nevent: message\ndata: {"id":2}\n\n';
  for (const ch of stream) push(ch); // one character at a time
  assert.equal(events.length, 2);
  assert.equal(events[0].data, '{"id":1}');
  assert.equal(events[1].data, '{"id":2}');
});

test('encode round-trips through the parser', () => {
  const events = [];
  const push = createSseParser((e) => events.push(e));
  push(encodeSseEvent({ event: 'message', id: '3', data: '{"x":1}' }));
  assert.deepEqual(events[0], { event: 'message', id: '3', data: '{"x":1}' });
});

test('a legacy endpoint event is not JSON-RPC and must pass through', () => {
  const events = [];
  const push = createSseParser((e) => events.push(e));
  push('event: endpoint\ndata: /messages?sessionId=abc\n\n');
  assert.equal(tryParseJsonRpc(events[0].data), null);
});

test('tryParseJsonRpc accepts objects and rejects non-JSON', () => {
  assert.deepEqual(tryParseJsonRpc('{"a":1}'), { a: 1 });
  assert.equal(tryParseJsonRpc('/messages?sessionId=x'), null);
  assert.equal(tryParseJsonRpc(''), null);
  assert.equal(tryParseJsonRpc('42'), null);
});

test('isJsonRpc recognises requests, responses and notifications', () => {
  assert.equal(isJsonRpc({ jsonrpc: '2.0', method: 'tools/list', id: 1 }), true);
  assert.equal(isJsonRpc({ jsonrpc: '2.0', method: 'notifications/initialized' }), true);
  assert.equal(isJsonRpc({ jsonrpc: '2.0', id: 1, result: {} }), true);
  assert.equal(isJsonRpc({ hello: 'world' }), false);
  assert.equal(isJsonRpc(null), false);
});

test('JSON-RPC envelope rejects ambiguous messages and invalid IDs', () => {
  for (const message of [{ jsonrpc: '2.0' }, { method: 'ping' }, { jsonrpc: '2.0', method: 1 }, { jsonrpc: '2.0', method: 'ping', id: {} }, { jsonrpc: '2.0', method: 'ping', result: {} }, { jsonrpc: '2.0', id: 1, result: {}, error: { code: 1, message: 'bad' } }, { jsonrpc: '2.0', id: 1, error: 'bad' }]) assert.equal(isJsonRpc(message), false);
  assert.equal(isJsonRpc({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'bad' } }), true);
});
