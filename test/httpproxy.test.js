import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHttpProxy, MAX_HTTP_BODY_BYTES, MAX_HTTP_SESSIONS, MAX_PENDING_REQUESTS } from '../src/httpproxy.js';
import { localUrlFor } from '../src/routes.js';
import { loadState, saveState, setPin, hashTools } from '../src/manifest.js';
import { encodeSseEvent } from '../src/sse.js';

async function setup(t, handler, options = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'tripwire-http-'));
  const upstream = createServer(handler);
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  const statePath = join(dir, 'state.json');
  const routes = { servers: { demo: { upstream: `http://127.0.0.1:${upstream.address().port}/mcp?token=abc` } } };
  const proxy = createHttpProxy({ listen: { host: '127.0.0.1', port: 0 }, routes, statePath, ...options });
  t.after(async () => {
    for (const server of [proxy, upstream]) {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
    rmSync(dir, { recursive: true, force: true });
  });
  await once(proxy, 'listening');
  const origin = `http://127.0.0.1:${proxy.address().port}`;
  const post = async (path, msg, headers = {}) => {
    const response = await fetch(origin + path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(msg) });
    return response.status === 202 ? null : response.json();
  };
  return { origin, routes, statePath, post, listen: { host: '127.0.0.1', port: proxy.address().port } };
}

test('HTTP rejects oversized requests before contacting upstream', async (t) => {
  let calls = 0;
  const env = await setup(t, (_req, res) => { calls++; res.end('{}'); });
  const response = await fetch(env.origin + '/demo/mcp', { method: 'POST', body: 'x'.repeat(MAX_HTTP_BODY_BYTES + 1) });
  assert.equal(response.status, 413);
  assert.equal(calls, 0);
});

test('HTTP stops oversized JSON responses without returning partial data', async (t) => {
  const env = await setup(t, (req, res) => {
    req.resume();
    req.on('end', () => { res.writeHead(200, { 'content-type': 'application/json' }); res.end('x'.repeat(MAX_HTTP_BODY_BYTES + 1)); });
  });
  const response = await fetch(env.origin + '/demo/mcp', { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }) });
  assert.equal(response.status, 502);
  assert.match((await response.json()).error.message, /exceeds 8 MiB/);
});

test('HTTP forwards installed paths, applies live modes, and blocks calls after rug pull', { timeout: 8000 }, async (t) => {
  let mode = 'warn';
  let tools = [{ name: 'safe', description: '中文🙂' }];
  const paths = [];
  let calls = 0;
  const env = await setup(t, (req, res) => {
    paths.push(req.url);
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const msg = JSON.parse(body);
      if (msg.method === 'tools/call') calls++;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: msg.method === 'tools/list' ? { tools } : { content: [] } }));
    });
  }, { getPosture: () => mode });
  const url = new URL(localUrlFor(env.listen, 'demo', env.routes.servers.demo.upstream));
  const path = url.pathname + url.search;
  const call = { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'safe' } };
  await env.post(path, call);
  assert.equal(paths[0], '/mcp?token=abc');
  mode = 'block';
  assert.match((await env.post(path, call)).error.message, /unreviewed/);
  assert.equal(calls, 1);
  await env.post(path, { jsonrpc: '2.0', id: 1, method: 'tools/list' });
  const state = loadState(env.statePath);
  setPin(state, 'demo', hashTools(tools).hash);
  saveState(env.statePath, state);
  assert.ok((await env.post(path, call)).result);
  tools = [{ name: 'safe', description: 'changed' }];
  assert.equal((await env.post(path, { jsonrpc: '2.0', id: 1, method: 'tools/list' })).error.code, -32002);
  assert.match((await env.post(path, call)).error.message, /rug-pull/);
  mode = 'warn';
  assert.ok((await env.post(path, call)).result);
});

test('legacy SSE correlates POST responses by session and preserves split UTF-8', { timeout: 8000 }, async (t) => {
  const streams = new Map();
  let serial = 0;
  const queued = [];
  const env = await setup(t, (req, res) => {
    if (req.method === 'GET') {
      const session = String(++serial);
      streams.set(session, res);
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.write(encodeSseEvent({ event: 'endpoint', data: `/messages?sessionId=${session}` }));
      return;
    }
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      queued.push({ session: new URL(req.url, 'http://localhost').searchParams.get('sessionId'), msg: JSON.parse(body) });
      res.writeHead(202);
      res.end();
    });
  });
  const open = async () => {
    const response = await fetch(env.origin + '/demo/mcp');
    const reader = response.body.getReader();
    let buffer = '';
    const decoder = new TextDecoder();
    const next = async () => {
      while (!buffer.includes('\n\n')) {
        const { value, done } = await reader.read();
        assert.equal(done, false);
        buffer += decoder.decode(value, { stream: true });
      }
      const end = buffer.indexOf('\n\n');
      const block = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      return block.split('\n').find((l) => l.startsWith('data: ')).slice(6);
    };
    return { reader, next, endpoint: await next() };
  };
  const a = await open();
  const b = await open();
  await env.post(a.endpoint, { jsonrpc: '2.0', id: 1, method: 'tools/list' });
  await env.post(b.endpoint, { jsonrpc: '2.0', id: 1, method: 'ping' });
  for (const { session, msg } of queued.reverse()) {
    const tools = [{ name: 'safe', description: '中文🙂' }];
    const bytes = Buffer.from(encodeSseEvent({ event: 'message', data: JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { tools } }) }));
    const split = bytes.indexOf(Buffer.from('中')) + 1;
    streams.get(session).write(bytes.subarray(0, split));
    await new Promise((resolve) => setImmediate(resolve));
    streams.get(session).write(bytes.subarray(split));
  }
  assert.equal(JSON.parse(await a.next()).result.tools[0].description, '中文🙂');
  await b.next();
  assert.equal(loadState(env.statePath).pending.demo.hash, hashTools([{ name: 'safe', description: '中文🙂' }]).hash);
  await a.reader.cancel();
  await b.reader.cancel();
});

test('running HTTP proxy picks up newly registered routes without restarting', { timeout: 8000 }, async (t) => {
  let liveRoutes = { servers: {} };
  const env = await setup(t, (req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ jsonrpc: '2.0', id: 1, result: {} }));
  }, { getRoutes: () => liveRoutes });
  assert.equal((await fetch(env.origin + '/demo/mcp')).status, 404);
  liveRoutes = env.routes;
  assert.equal((await fetch(env.origin + '/demo/mcp')).status, 200);
  liveRoutes = { servers: {} };
  assert.equal((await fetch(env.origin + '/demo/mcp')).status, 404);
});

test('HTTP rejects foreign origins, batches and compressed requests before upstream', async t => {
  let calls = 0;
  const env = await setup(t, (req, res) => { calls++; req.resume(); res.end(); });
  const ping = { jsonrpc: '2.0', id: 1, method: 'ping' };
  for (const origin of ['https://attacker.example', 'null']) {
    const response = await fetch(env.origin + '/demo/mcp', { method: 'POST', headers: { origin }, body: JSON.stringify(ping) });
    assert.equal(response.status, 403);
  }
  for (const body of [[], [ping], {}, null]) {
    const response = await fetch(env.origin + '/demo/mcp', { method: 'POST', body: JSON.stringify(body) });
    assert.equal(response.status, 400);
  }
  const compressed = await fetch(env.origin + '/demo/mcp', { method: 'POST', headers: { 'content-encoding': 'gzip' }, body: JSON.stringify(ping) });
  assert.equal(compressed.status, 400);
  assert.equal(calls, 0);
});

test('HTTP rejects redirects and encoded upstream bodies', async t => {
  let redirect = true;
  const env = await setup(t, (req, res) => {
    req.resume();
    req.on('end', () => {
      res.writeHead(redirect ? 302 : 200, redirect ? { location: 'https://example.com' } : { 'content-encoding': 'gzip' });
      res.end('uninspectable');
    });
  });
  const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' });
  assert.equal((await fetch(env.origin + '/demo/mcp', { method: 'POST', body })).status, 502);
  redirect = false;
  assert.equal((await fetch(env.origin + '/demo/mcp', { method: 'POST', body })).status, 502);
});

test('HTTP pending requests are bounded and duplicate IDs never reach upstream', async t => {
  let calls = 0;
  const env = await setup(t, (req, res) => { calls++; req.resume(); req.on('end', () => { res.writeHead(202); res.end(); }); });
  const post = id => fetch(env.origin + '/demo/mcp', { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id, method: 'ping' }) });
  for (let id = 0; id < MAX_PENDING_REQUESTS; id++) assert.equal((await post(id)).status, 202);
  assert.equal((await post(0)).status, 409);
  assert.equal((await post(MAX_PENDING_REQUESTS)).status, 409);
  assert.equal(calls, MAX_PENDING_REQUESTS);
});

test('HTTP sessions are bounded and DELETE reclaims a session', async t => {
  const env = await setup(t, (req, res) => { req.resume(); req.on('end', () => { res.writeHead(204); res.end(); }); });
  const send = (session, method = 'POST') => fetch(env.origin + '/demo/mcp', { method, headers: { 'mcp-session-id': String(session) }, ...(method === 'POST' ? { body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }) } : {}) });
  for (let id = 0; id < MAX_HTTP_SESSIONS; id++) assert.equal((await send(id)).status, 204);
  assert.equal((await send('extra')).status, 503);
  assert.equal((await send(0, 'DELETE')).status, 204);
  assert.equal((await send('extra')).status, 204);
});
