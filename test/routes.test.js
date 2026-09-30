import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync, readFileSync, writeFileSync } from 'node:fs';
import { resolveRoute, localUrlFor, rewriteEndpoint, loadRoutes, saveRoutes, defaultListen, upstreamPathFor } from '../src/routes.js';

test('installed local URLs round-trip the upstream path and query without duplication', () => {
  for (const upstream of ['https://example.com/mcp?token=abc', 'https://example.com/']) {
    const routes = { servers: { demo: { upstream } } };
    const url = new URL(localUrlFor(defaultListen(), 'demo', upstream));
    assert.equal(upstreamPathFor(resolveRoute(url.pathname + url.search, routes)), new URL(upstream).pathname + new URL(upstream).search);
  }
  assert.equal(upstreamPathFor(resolveRoute('/blender/messages?sessionId=abc', routes)), '/messages?sessionId=abc');
  assert.equal(upstreamPathFor(resolveRoute('/blender/', routes)), '/mcp');
});

const routes = { listen: defaultListen(), servers: { blender: { upstream: 'https://mcp.example.com/mcp' } } };

test('resolveRoute maps the first path segment to a server', () => {
  const r = resolveRoute('/blender/mcp?x=1', routes);
  assert.equal(r.name, 'blender');
  assert.equal(r.rest, '/mcp');
  assert.equal(r.entry.upstream, 'https://mcp.example.com/mcp');
});

test('resolveRoute handles a bare prefix and rejects unknown routes', () => {
  assert.equal(resolveRoute('/blender', routes).rest, '');
  assert.equal(resolveRoute('/nope/mcp', routes), null);
  assert.equal(resolveRoute('/blender/mcp', { servers: {} }), null);
  assert.equal(resolveRoute(undefined, routes), null);
});

test('localUrlFor builds the local address, preserving path and query', () => {
  assert.equal(localUrlFor(defaultListen(), 'blender', 'https://mcp.example.com/mcp'), 'http://127.0.0.1:8788/blender/mcp');
  assert.equal(localUrlFor(defaultListen(), 'x y', 'https://h/a?b=1'), 'http://127.0.0.1:8788/x%20y/a?b=1');
  assert.equal(localUrlFor(defaultListen(), 'root', 'https://h/'), 'http://127.0.0.1:8788/root');
});

test('rewriteEndpoint keeps the legacy POST endpoint on the proxy', () => {
  assert.equal(rewriteEndpoint('/messages?sessionId=abc', 'blender'), '/blender/messages?sessionId=abc');
  assert.equal(rewriteEndpoint('https://mcp.example.com/messages?s=1', 'blender'), '/blender/messages?s=1');
  assert.equal(rewriteEndpoint('', 'blender'), '');
  assert.equal(rewriteEndpoint(undefined, 'blender'), undefined);
});

test('routes round-trip through disk', () => {
  const path = join(tmpdir(), `tripwire-routes-${process.pid}-${Date.now()}.json`);
  try {
    saveRoutes(path, { ...routes, servers: { ...routes.servers, optional: { upstream: 'https://optional.example', policy: undefined } } });
    assert.equal(loadRoutes(path).servers.blender.upstream, 'https://mcp.example.com/mcp');
  } finally {
    rmSync(path, { force: true });
    rmSync(path + '.key', { force: true });
  }
});

test('modified remote configuration is rejected instead of used or silently re-signed', () => {
  const path = join(tmpdir(), `tripwire-tamper-${process.pid}-${Date.now()}.json`);
  try {
    saveRoutes(path, routes);
    const edited = JSON.parse(readFileSync(path, 'utf8'));
    edited.servers.blender.upstream = 'https://unexpected.example/mcp';
    writeFileSync(path, JSON.stringify(edited));
    const rejected = loadRoutes(path);
    assert.deepEqual(rejected.servers, {});
    assert.ok(rejected.integrityError);
    assert.throws(() => saveRoutes(path, routes), /outside Tripwire/);
  } finally { rmSync(path, { force: true }); rmSync(path + '.key', { force: true }); }
});

test('unsigned configuration is refused and formatting changes preserve a valid signature', () => {
  const path = join(tmpdir(), `tripwire-unsigned-${process.pid}-${Date.now()}.json`);
  try {
    writeFileSync(path, JSON.stringify(routes));
    assert.ok(loadRoutes(path).integrityError);
    rmSync(path);
    saveRoutes(path, routes);
    writeFileSync(path, JSON.stringify(JSON.parse(readFileSync(path, 'utf8')), null, 4));
    assert.equal(loadRoutes(path).integrityError, undefined);
  } finally { rmSync(path, { force: true }); rmSync(path + '.key', { force: true }); }
});

test('a missing routes file yields empty defaults', () => {
  const loaded = loadRoutes(join(tmpdir(), 'definitely-not-here-tripwire.json'));
  assert.deepEqual(loaded.servers, {});
  assert.equal(loaded.listen.port, 8788);
});
