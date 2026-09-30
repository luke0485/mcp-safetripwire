import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newToken, hostAllowed, originAllowed, tokenMatches, parseAuditTail, htmlEscape } from '../src/console.js';

const listen = { host: '127.0.0.1', port: 8789 };

test('newToken returns a long random hex string', () => {
  const a = newToken();
  const b = newToken();
  assert.match(a, /^[0-9a-f]{48}$/);
  assert.notEqual(a, b);
});

test('hostAllowed accepts only this exact local listener', () => {
  assert.equal(hostAllowed('127.0.0.1:8789', listen), true);
  assert.equal(hostAllowed('localhost:8789', listen), true);
  assert.equal(hostAllowed('LOCALHOST:8789', listen), true);
  assert.equal(hostAllowed('127.0.0.1:8790', listen), false);
  assert.equal(hostAllowed('evil.example:8789', listen), false);
  assert.equal(hostAllowed(undefined, listen), false);
});

test('originAllowed blocks cross-origin (CSRF) but permits same-origin and absent', () => {
  assert.equal(originAllowed(undefined, listen), true);
  assert.equal(originAllowed('http://127.0.0.1:8789', listen), true);
  assert.equal(originAllowed('http://evil.example', listen), false);
  assert.equal(originAllowed('https://127.0.0.1:8789', listen), false);
});

test('tokenMatches is strict about content and length', () => {
  const token = newToken();
  assert.equal(tokenMatches(token, token), true);
  assert.equal(tokenMatches(token.slice(0, -1), token), false);
  assert.equal(tokenMatches('x'.repeat(token.length), token), false);
  assert.equal(tokenMatches(undefined, token), false);
  assert.equal(tokenMatches(token, undefined), false);
});

test('parseAuditTail returns newest first and survives malformed lines', () => {
  const text = [
    JSON.stringify({ ts: '1', level: 'info', event: 'a' }),
    'not json',
    JSON.stringify({ ts: '2', level: 'warn', event: 'b' }),
  ].join('\n');
  const events = parseAuditTail(text, 10);
  assert.equal(events.length, 3);
  assert.equal(events[0].event, 'b'); // newest first
  assert.equal(events[1].event, 'unreadable');
  assert.equal(events[2].event, 'a');
});

test('parseAuditTail respects the limit and ignores blank lines', () => {
  const text = Array.from({ length: 50 }, (_, i) => JSON.stringify({ event: `e${i}` })).join('\n') + '\n\n';
  const events = parseAuditTail(text, 5);
  assert.equal(events.length, 5);
  assert.equal(events[0].event, 'e49');
});

test('htmlEscape neutralises markup', () => {
  assert.equal(htmlEscape('<script>"x"&\'y\'</script>'), '&lt;script&gt;&quot;x&quot;&amp;&#39;y&#39;&lt;/script&gt;');
});
