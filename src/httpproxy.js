import { createServer, request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { URL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createSseParser, encodeSseEvent, tryParseJsonRpc, isJsonRpc } from './sse.js';
import { resolveRoute, rewriteEndpoint, upstreamPathFor } from './routes.js';
import { createInspector } from './inspect.js';
import { loadPolicy } from './policy.js';
import { loadState, findPin, setPending, saveState } from './manifest.js';
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

function filterHeaders(headers) {
  const out = {};
  for (const [key, value] of Object.entries(headers)) {
    if (HOP_BY_HOP.has(key.toLowerCase())) continue;
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
  const inspectors = new Map();
  const sessions = new Map();

  function inspectorFor(name, entry, session) {
    const key = JSON.stringify([name, entry.upstream, entry.policy, entry.state, session]);
    if (inspectors.has(key)) return inspectors.get(key);
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
        const state = loadState(perServerState);
        if (setPending(state, name, hash, count)) saveState(perServerState, state);
      },
    });
    inspectors.set(key, inspector);
    return inspector;
  }

  const server = createServer((req, res) => {
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
    } catch {
      res.writeHead(500, { 'content-type': 'text/plain' });
      res.end('mcp-tripwire: invalid upstream url in routes.json\n');
      return;
    }

    const query = new URL(req.url, 'http://localhost').searchParams;
    const session = req.headers['mcp-session-id'] ?? query.get('sessionId') ?? query.get('session_id') ?? '';
    const sessionKey = (id) => JSON.stringify([route.name, route.entry.upstream, id]);
    const key = sessionKey(session);
    // A legacy GET opens a new session before its endpoint announces the ID.
    const newLegacyStream = req.method === 'GET' && !session;
    const pending = newLegacyStream ? new Map() : sessions.get(key) ?? new Map();
    if (!newLegacyStream) sessions.set(key, pending);
    const ctx = {
      name: route.name,
      inspector: inspectorFor(route.name, route.entry, newLegacyStream ? randomUUID() : session),
      upstream,
      targetPath: upstreamPathFor(route),
      pending,
      bindSession: (id) => {
        sessions.set(sessionKey(id), pending);
        const inspectorKey = JSON.stringify([route.name, route.entry.upstream, route.entry.policy, route.entry.state, id]);
        inspectors.set(inspectorKey, ctx.inspector);
      },
    };

    if (req.method === 'POST') return handlePost(req, res, ctx);
    if (req.method === 'GET') return handleGet(req, res, ctx);
    return handlePassthrough(req, res, ctx);
  });

  server.on('error', (err) => log('critical', 'http-proxy-error', { error: String(err) }));
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
    if (msg && msg.id !== undefined && typeof msg.method === 'string') pending.set(JSON.stringify(msg.id), msg.method);

    sendUpstream(
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
  sendUpstream(
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
    sendUpstream(
      ctx.upstream,
      { method: req.method, path: ctx.targetPath, headers, body: buf.length ? buf : undefined },
      (upstreamRes) => {
        res.writeHead(upstreamRes.statusCode ?? 502, filterHeaders(upstreamRes.headers));
        upstreamRes.pipe(res);
      },
      (err) => fail(res, ctx, err),
    );
  });
}

function relayResponse(upstreamRes, res, ctx, pending) {
  if (upstreamRes.headers['mcp-session-id']) ctx.bindSession(upstreamRes.headers['mcp-session-id']);
  const contentType = String(upstreamRes.headers['content-type'] ?? '');

  if (contentType.includes('text/event-stream')) {
    return relaySse(upstreamRes, res, ctx, pending);
  }

  if (contentType.includes('application/json')) {
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
      // The inspector may rewrite the body (strip/block), so content-length is
      // intentionally dropped and the response is re-framed by Node.
      const headers = filterHeaders(upstreamRes.headers);
      res.writeHead(upstreamRes.statusCode ?? 502, headers);
      if (msg && isJsonRpc(msg)) {
        const method = msg.id !== undefined ? pending.get(JSON.stringify(msg.id)) : undefined;
        if (msg.id !== undefined) pending.delete(JSON.stringify(msg.id));
        inspectResponse(ctx, msg, method);
        res.end(JSON.stringify(msg));
        return;
      }
      res.end(raw);
    });
    return;
  }

  res.writeHead(upstreamRes.statusCode ?? 502, filterHeaders(upstreamRes.headers));
  upstreamRes.pipe(res);
}

function relaySse(upstreamRes, res, ctx, pending) {
  // Streaming: headers must go out before the body, and there is no
  // content-length for an SSE response.
  res.writeHead(upstreamRes.statusCode ?? 502, filterHeaders(upstreamRes.headers));

  const parser = createSseParser((ev) => {
    // Legacy servers announce their POST endpoint in the first event; keep it
    // on our proxy so the client does not bypass us.
    if (ev.event === 'endpoint') {
      const endpoint = new URL(ev.data, ctx.upstream);
      const session = endpoint.searchParams.get('sessionId') ?? endpoint.searchParams.get('session_id');
      if (session) ctx.bindSession(session);
      res.write(encodeSseEvent({ ...ev, data: rewriteEndpoint(ev.data, ctx.name) }));
      return;
    }
    const msg = tryParseJsonRpc(ev.data);
    if (!msg || !isJsonRpc(msg)) {
      res.write(encodeSseEvent(ev));
      return;
    }
    const method = msg.id !== undefined ? pending.get(JSON.stringify(msg.id)) : undefined;
    if (msg.id !== undefined) pending.delete(JSON.stringify(msg.id));
    inspectResponse(ctx, msg, method);
    res.write(encodeSseEvent({ event: ev.event, id: ev.id, data: JSON.stringify(msg) }));
  });

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
  log('warn', 'upstream-error', { name: ctx.name, target: ctx.targetPath, error: String(err) });
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
