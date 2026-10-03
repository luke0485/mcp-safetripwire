import { createServer, request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { URL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createSseParser, encodeSseEvent, tryParseJsonRpc, isJsonRpc } from './sse.js';
import { resolveRoute, rewriteEndpoint, upstreamPathFor } from './routes.js';
import { createInspector } from './inspect.js';
import { loadPolicy } from './policy.js';
import { loadState, findPin, setPending, updateState } from './manifest.js';
import { defaultStatePath } from './paths.js';
import { log } from './log.js';

// Local reverse proxy for HTTP-based MCP servers (Streamable HTTP and the
// legacy HTTP+SSE transport).
//
// Both wrap the SAME inspector as the stdio path, so the enforcement decision
// is identical across transports. What differs is only the byte plumbing:
//   - POST body  = client -> server JSON-RPC (one message per request)
//   - JSON reply = server -> client response
//   - SSE reply  = server -> client stream (may carry unrelated notifications
//                  before the response)

const HOP_BY_HOP = new Set([
  'host', 'content-length', 'connection', 'transfer-encoding', 'keep-alive',
  'upgrade', 'proxy-authorization', 'proxy-connection', 'te', 'trailer',
]);

export const MAX_HTTP_BODY_BYTES = 8 * 1024 * 1024;
export const MAX_HTTP_SESSIONS = 128;
export const MAX_PENDING_REQUESTS = 256;
export const MAX_HTTP_CONNECTIONS = 128;
const SESSION_IDLE_MS = 15 * 60 * 1000;

export function proxyOriginAllowed(req, port) {
  const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`]);
  if (!hosts.has(String(req.headers.host ?? '').toLowerCase())) return false;
  const origin = req.headers.origin;
  return origin === undefined || [...hosts].some(host => origin === `http://${host}`);
}

function filterHeaders(headers) {
  const out = {};
  const nominated = new Set(String(headers.connection ?? '').toLowerCase().split(',').map(value => value.trim()));
  for (const [key, value] of Object.entries(headers)) {
    if (HOP_BY_HOP.has(key.toLowerCase()) || nominated.has(key.toLowerCase())) continue;
    out[key] = value;
  }
  return out;
}

function forwardHeaders(reqHeaders, upstream) {
  const out = filterHeaders(reqHeaders);
  // Ask for uncompressed bodies so JSON-RPC payloads stay inspectable.
  delete out['accept-encoding'];
  // Present the upstream's own Host so virtual hosting and Origin checks work.
  out.host = upstream.host;
  return out;
}

function sendUpstream(upstream, { method, path, headers, body }, onResponse, onError) {
  const mod = upstream.protocol === 'https:' ? httpsRequest : httpRequest;
  const req = mod(
    {
      protocol: upstream.protocol,
      hostname: upstream.hostname,
      port: upstream.port || (upstream.protocol === 'https:' ? 443 : 80),
      method,
      path,
      headers,
    },
    onResponse,
  );
  req.on('error', onError);
  if (body !== undefined) req.write(body);
  req.end();
  return req;
}

export function createHttpProxy({ listen, routes, getRoutes, getPosture, getAdvanced, statePath = defaultStatePath(), defaultPosture = 'warn' }) {
  if (listen.host !== '127.0.0.1' && listen.host !== '::1') throw new Error('HTTP relay must listen on loopback');
  const sessions = new Map();
  let activeRequests = 0;

  function inspectorFor(name, entry, session) {
    const policy = loadPolicy(entry.policy);
    const perServerState = entry.state ?? statePath;
    const getPin = () => findPin(loadState(perServerState), name);
    const inspector = createInspector({
      name,
      getPin,
      policy,
      getAdvanced,
      posture: entry.posture ?? defaultPosture,
      getPosture: () => getPosture?.() ?? entry.posture ?? defaultPosture,
      transport: 'http',
      recordPending: (hash, count) => {
        updateState(perServerState, state => setPending(state, name, hash, count));
      },
    });
    return inspector;
  }

  const sweep = () => {
    for (const [key, entry] of sessions) {
      if (entry.active === 0 && Date.now() - entry.usedAt > SESSION_IDLE_MS) sessions.delete(key);
    }
  };

  const server = createServer((req, res) => {
    if (activeRequests >= MAX_HTTP_CONNECTIONS) {
      res.writeHead(503); res.end('mcp-tripwire: active request limit reached\n'); return;
    }
    activeRequests++;
    res.once('close', () => { activeRequests--; });
    if (!proxyOriginAllowed(req, server.address()?.port)) {
      res.writeHead(403); res.end('mcp-tripwire: forbidden host or origin\n'); return;
    }
    if (!['GET', 'POST', 'DELETE'].includes(req.method)) {
      res.writeHead(405, { allow: 'GET, POST, DELETE' }); res.end(); return;
    }
    const activeRoutes = getRoutes?.() ?? routes;
    if (activeRoutes.integrityError) {
      res.writeHead(503, { 'content-type': 'text/plain' });
      res.end('mcp-tripwire: remote configuration rejected\n');
      return;
    }
    const route = resolveRoute(req.url, activeRoutes);
    if (!route) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end(`mcp-tripwire: no route for ${req.url}\n`);
      return;
    }

    let upstream;
    try {
      upstream = new URL(route.entry.upstream);
      if (!['http:', 'https:'].includes(upstream.protocol) || upstream.username || upstream.password) throw new Error('Invalid upstream');
    } catch {
      res.writeHead(500, { 'content-type': 'text/plain' });
      res.end('mcp-tripwire: invalid upstream url in routes.json\n');
      return;
    }

    const query = new URL(req.url, 'http://localhost').searchParams;
    const session = req.headers['mcp-session-id'] ?? query.get('sessionId') ?? query.get('session_id') ?? '';
    if (typeof session !== 'string' || session.length > 256 || /[\x00-\x20\x7f]/.test(session)) {
      res.writeHead(400); res.end('mcp-tripwire: invalid session id\n'); return;
    }
    const sessionKey = (id) => JSON.stringify([route.name, route.entry.upstream, id]);
    let key = sessionKey(session);
    // A legacy GET opens a new session before its endpoint announces the ID.
    const newLegacyStream = req.method === 'GET' && !session;
    if (newLegacyStream) key = sessionKey(randomUUID());
    sweep();
    const signature = JSON.stringify([route.entry.policy, route.entry.state, route.entry.posture]);
    let entry = sessions.get(key);
    if (entry && entry.signature !== signature) {
      if (entry.active) { res.writeHead(409); res.end('mcp-tripwire: route changed; reconnect\n'); return; }
      sessions.delete(key); entry = null;
    }
    if (!entry) {
      if (sessions.size >= MAX_HTTP_SESSIONS) { res.writeHead(503); res.end('mcp-tripwire: session limit reached\n'); return; }
      entry = { pending: new Map(), inspector: inspectorFor(route.name, route.entry, session), usedAt: Date.now(), active: 0, signature };
      sessions.set(key, entry);
    }
    entry.active++;
    entry.usedAt = Date.now();
    const pending = entry.pending;
    res.once('close', () => {
      entry.active--; entry.usedAt = Date.now();
      if (req.method === 'DELETE' || newLegacyStream) {
        for (const [id, value] of sessions) if (value === entry) sessions.delete(id);
      }
    });
    const ctx = {
      name: route.name,
      inspector: entry.inspector,
      upstream,
      targetPath: upstreamPathFor(route),
      pending,
      bindSession: (id) => {
        if (typeof id !== 'string' || !id || id.length > 256 || /[\x00-\x20\x7f]/.test(id)) throw new Error('Invalid upstream session id');
        const bound = sessionKey(id);
        if (sessions.has(bound) && sessions.get(bound) !== entry) throw new Error('Upstream session collision');
        sessions.delete(key); sessions.set(bound, entry); key = bound;
      },
    };

    if (req.method === 'POST') return handlePost(req, res, ctx);
    if (req.method === 'GET') return handleGet(req, res, ctx);
    return handlePassthrough(req, res, ctx);
  });

  server.on('error', (err) => log('critical', 'http-proxy-error', { error: String(err) }));
  server.maxConnections = MAX_HTTP_CONNECTIONS;
  const cleanup = setInterval(sweep, 30000);
  cleanup.unref();
  server.once('close', () => { clearInterval(cleanup); sessions.clear(); });
  server.listen(listen.port, listen.host, () => {
    log('info', 'http-proxy-listening', { listen, routes: Object.keys(routes.servers ?? {}) });
  });
  return server;
}

// Read a request body, then hand it to `fn` as a string.
function readBody(req, res, ctx, fn) {
  const chunks = [];
  let bytes = 0;
  let rejected = false;
  req.on('data', (c) => {
    if (rejected) return;
    bytes += c.length;
    if (bytes > MAX_HTTP_BODY_BYTES) {
      rejected = true;
      chunks.length = 0;
      res.writeHead(413, { 'content-type': 'text/plain' });
      res.end('mcp-tripwire: request body exceeds 8 MiB\n');
      return;
    }
    chunks.push(c);
  });
  req.on('error', (err) => fail(res, ctx, err));
  req.on('end', () => {
    if (rejected || res.writableEnded) return;
    try {
      fn(Buffer.concat(chunks));
    } catch (err) {
      fail(res, ctx, err);
    }
  });
}

function handlePost(req, res, ctx) {
  readBody(req, res, ctx, (buf) => {
    const body = buf.toString('utf8');
    const msg = tryParseJsonRpc(body);

    // Unsupported batches, compressed and malformed bodies must never bypass inspection.
    if (!msg || !isJsonRpc(msg) || (req.headers['content-encoding'] && req.headers['content-encoding'] !== 'identity')) {
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Expected one uncompressed JSON-RPC object; batches are not supported' } }));
      return;
    }

    if (msg && isJsonRpc(msg)) {
      const verdict = ctx.inspector.onClientMessage(msg);
      if (verdict.forward === false) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(verdict.error));
        return;
      }
    }

    // Track the request method so an SSE or JSON reply can be attributed.
    const pending = ctx.pending;
    if (msg.id !== undefined && typeof msg.method === 'string') {
      const id = JSON.stringify(msg.id);
      if (pending.has(id) || pending.size >= MAX_PENDING_REQUESTS) {
        res.writeHead(409); res.end('mcp-tripwire: duplicate id or outstanding request limit\n'); return;
      }
      pending.set(id, msg.method);
    }

    forward(req, res, ctx,
      ctx.upstream,
      {
        method: 'POST',
        path: ctx.targetPath,
        headers: { ...forwardHeaders(req.headers, ctx.upstream), 'content-length': Buffer.byteLength(body) },
        body,
      },
      (upstreamRes) => relayResponse(upstreamRes, res, ctx, pending),
      (err) => fail(res, ctx, err),
    );
  });
}

function handleGet(req, res, ctx) {
  forward(req, res, ctx,
    ctx.upstream,
    { method: 'GET', path: ctx.targetPath, headers: forwardHeaders(req.headers, ctx.upstream) },
    (upstreamRes) => relayResponse(upstreamRes, res, ctx, ctx.pending),
    (err) => fail(res, ctx, err),
  );
}

// Non-POST/GET (e.g. DELETE to terminate a session). Forwarded without
// inspection, body preserved.
function handlePassthrough(req, res, ctx) {
  readBody(req, res, ctx, (buf) => {
    const headers = forwardHeaders(req.headers, ctx.upstream);
    if (buf.length) headers['content-length'] = String(buf.length);
    if (buf.length) { res.writeHead(400); res.end('mcp-tripwire: DELETE body is not supported\n'); return; }
    forward(req, res, ctx,
      ctx.upstream,
      { method: req.method, path: ctx.targetPath, headers, body: buf.length ? buf : undefined },
      (upstreamRes) => relayResponse(upstreamRes, res, ctx, ctx.pending),
      (err) => fail(res, ctx, err),
    );
  });
}

function relayResponse(upstreamRes, res, ctx, pending) {
  upstreamRes.on('error', (err) => fail(res, ctx, err));
  res.once('close', () => upstreamRes.destroy());
  try {
    if (upstreamRes.headers['mcp-session-id']) ctx.bindSession(upstreamRes.headers['mcp-session-id']);
    if (upstreamRes.statusCode >= 300 && upstreamRes.statusCode < 400) throw new Error('Upstream redirects would bypass inspection');
    if (upstreamRes.headers['content-encoding'] && upstreamRes.headers['content-encoding'] !== 'identity') throw new Error('Compressed upstream payload cannot be inspected');
  } catch (err) { fail(res, ctx, err); upstreamRes.destroy(); return; }
  const contentType = String(upstreamRes.headers['content-type'] ?? '').toLowerCase();

  if (contentType.includes('text/event-stream')) {
    return relaySse(upstreamRes, res, ctx, pending);
  }

  {
    const chunks = [];
    let bytes = 0;
    let rejected = false;
    upstreamRes.on('data', (c) => {
      if (rejected) return;
      bytes += c.length;
      if (bytes > MAX_HTTP_BODY_BYTES) {
        rejected = true;
        chunks.length = 0;
        fail(res, ctx, new Error('JSON response exceeds 8 MiB'));
        upstreamRes.destroy();
        return;
      }
      chunks.push(c);
    });
    upstreamRes.on('error', (err) => fail(res, ctx, err));
    upstreamRes.on('end', () => {
      if (rejected || res.writableEnded) return;
      const raw = Buffer.concat(chunks).toString('utf8');
      const msg = tryParseJsonRpc(raw);
      if (raw && (contentType.includes('application/json') || upstreamRes.statusCode < 300) && (!msg || !isJsonRpc(msg))) {
        fail(res, ctx, new Error('Upstream payload is not an inspectable JSON-RPC object')); return;
      }
      // The inspector may rewrite the body (strip/block), so content-length is
      // intentionally dropped and the response is re-framed by Node.
      const headers = filterHeaders(upstreamRes.headers);
      res.writeHead(upstreamRes.statusCode ?? 502, headers);
      if (msg && isJsonRpc(msg)) {
        const method = msg.id !== undefined && msg.method === undefined ? pending.get(JSON.stringify(msg.id)) : undefined;
        if (msg.id !== undefined && msg.method === undefined) pending.delete(JSON.stringify(msg.id));
        inspectResponse(ctx, msg, method);
        res.end(JSON.stringify(msg));
        return;
      }
      res.end(raw);
    });
    return;
  }

}

function relaySse(upstreamRes, res, ctx, pending) {
  // Streaming: headers must go out before the body, and there is no
  // content-length for an SSE response.
  res.writeHead(upstreamRes.statusCode ?? 502, filterHeaders(upstreamRes.headers));

  let paused = false;
  const write = (value) => {
    if (res.destroyed || res.writableEnded) return;
    if (!res.write(value) && !paused) {
      paused = true; upstreamRes.pause();
      res.once('drain', () => { paused = false; upstreamRes.resume(); });
    }
  };
  const parser = createSseParser((ev) => {
    try {
    // Legacy servers announce their POST endpoint in the first event; keep it
    // on our proxy so the client does not bypass us.
    if (ev.event === 'endpoint') {
      const endpoint = new URL(ev.data, ctx.upstream);
      const session = endpoint.searchParams.get('sessionId') ?? endpoint.searchParams.get('session_id');
      if (session) ctx.bindSession(session);
      write(encodeSseEvent({ ...ev, data: rewriteEndpoint(ev.data, ctx.name) }));
      return;
    }
    const msg = tryParseJsonRpc(ev.data);
    if (!msg || !isJsonRpc(msg)) {
      if (ev.data && (!ev.event || ev.event === 'message')) throw new Error('Invalid SSE JSON-RPC payload');
      write(encodeSseEvent(ev));
      return;
    }
    const method = msg.id !== undefined && msg.method === undefined ? pending.get(JSON.stringify(msg.id)) : undefined;
    if (msg.id !== undefined && msg.method === undefined) pending.delete(JSON.stringify(msg.id));
    inspectResponse(ctx, msg, method);
    write(encodeSseEvent({ event: ev.event, id: ev.id, data: JSON.stringify(msg) }));
    } catch (err) { fail(res, ctx, err); upstreamRes.destroy(); }
  }, { onError: (err) => { fail(res, ctx, err); upstreamRes.destroy(); } });

  upstreamRes.setEncoding('utf8');
  upstreamRes.on('data', parser);
  upstreamRes.on('error', (err) => fail(res, ctx, err));
  upstreamRes.on('end', () => res.end());
}

function inspectResponse(ctx, msg, method) {
  try {
    ctx.inspector.onServerMessage(msg, method);
  } catch (err) {
    log('critical', 'inspector-error', { name: ctx.name, side: 'server', error: String(err) });
    delete msg.result;
    msg.error = { code: -32603, message: 'mcp-tripwire inspection failed' };
  }
}

function fail(res, ctx, err) {
  if (res.destroyed || res.writableEnded) return;
  log('warn', 'upstream-error', { name: ctx.name, target: ctx.targetPath?.split('?')[0], error: String(err) });
  if (res.headersSent) {
    res.end();
    return;
  }
  res.writeHead(502, { 'content-type': 'application/json' });
  res.end(JSON.stringify({
    jsonrpc: '2.0',
    id: null,
    error: { code: -32603, message: `mcp-tripwire upstream error: ${err.message}` },
  }));
}

function forward(req, res, ctx, upstream, options, onResponse, onError) {
  if (options.body) {
    const msg = tryParseJsonRpc(String(options.body));
    res.once('finish', () => {
      if (res.statusCode >= 400 && msg?.id !== undefined) ctx.pending.delete(JSON.stringify(msg.id));
    });
  }
  const outbound = sendUpstream(upstream, options, response => {
    outbound.setTimeout(0);
    try { onResponse(response); } catch (err) { response.destroy(); onError(err); }
  }, err => {
    onError(err);
    // Failed POSTs must not retain outstanding IDs forever.
    if (options.body) {
      const msg = tryParseJsonRpc(String(options.body));
      if (msg?.id !== undefined) ctx.pending.delete(JSON.stringify(msg.id));
    }
  });
  outbound.setTimeout(30000, () => outbound.destroy(new Error('Upstream response timed out')));
  res.once('close', () => outbound.destroy());
}
