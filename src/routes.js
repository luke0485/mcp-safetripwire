import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync, renameSync, rmSync, openSync, fsyncSync, closeSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { createHmac, randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { log } from './log.js';

// Route resolution for HTTP-based MCP servers.
//
// Remote MCP servers are declared as a `url`, not a command, so there is no
// subprocess to wrap. The only way to intercept them is to point the host at a
// LOCAL address and forward from there. Tripwire therefore exposes each remote
// server under a path prefix of its own listener:
//
//   host  --http-->  http://127.0.0.1:8788/<name>/...  --http-->  https://real/mcp
//
// These helpers are pure so the mapping can be tested without opening a socket.

export function resolveRoute(urlPath, routes) {
  if (typeof urlPath !== 'string') return null;
  const pathOnly = urlPath.split('?')[0].split('#')[0];
  const m = /^\/([^/]+)(\/.*)?$/.exec(pathOnly);
  if (!m) return null;
  let name;
  try {
    name = decodeURIComponent(m[1]);
  } catch {
    return null;
  }
  const entry = routes?.servers?.[name];
  if (!entry?.upstream) return null;
  const queryAt = urlPath.indexOf('?');
  return { name, entry, rest: m[2] ?? '', search: queryAt < 0 ? '' : urlPath.slice(queryAt).split('#')[0] };
}

export function upstreamPathFor(route) {
  const upstream = new URL(route.entry.upstream);
  return (route.rest && route.rest !== '/' ? route.rest : upstream.pathname) + (route.search || upstream.search);
}

export function defaultListen() {
  return { host: '127.0.0.1', port: 8788 };
}

// The local URL the host config should point at, replacing the real one.
export function localUrlFor(listen, name, upstreamUrl) {
  const u = new URL(upstreamUrl);
  const path = u.pathname === '/' ? '' : u.pathname;
  return `http://${listen.host}:${listen.port}/${encodeURIComponent(name)}${path}${u.search}`;
}

// Legacy HTTP+SSE servers announce their POST endpoint in the first SSE event.
// That path is relative to the SERVER, so once the host is talking to our local
// proxy we must prefix it with the route, or the client would POST to a path
// our resolver does not recognise.
export function rewriteEndpoint(data, name) {
  if (typeof data !== 'string' || data === '') return data;
  try {
    const u = new URL(data, 'http://placeholder.invalid');
    return `/${encodeURIComponent(name)}${u.pathname}${u.search}`;
  } catch {
    return data;
  }
}

export function defaultRoutesPath() {
  return join(homedir(), '.mcp-tripwire', 'routes.json');
}

export function loadRoutes(path) {
  if (!path || (!existsSync(path) && !existsSync(path + '.key'))) return { listen: defaultListen(), servers: {} };
  try {
    if (statSync(path).size > 1024 * 1024) throw new Error('Remote configuration exceeds 1 MiB');
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    if (!verifyRoutes(path, parsed)) throw new Error('Remote configuration integrity check failed');
    rejected.delete(path);
    return {
      listen: { ...defaultListen(), ...(parsed.listen ?? {}) },
      servers: parsed.servers ?? {},
    };
  } catch (err) {
    let fingerprint;
    try { fingerprint = createHash('sha256').update(readFileSync(path)).digest('hex'); } catch { fingerprint = String(err); }
    if (rejected.get(path) !== fingerprint) {
      rejected.set(path, fingerprint);
      log('warn', 'remote-config-rejected', { path, reason: String(err.message) });
    }
    return { listen: defaultListen(), servers: {}, integrityError: 'Remote configuration was rejected' };
  }
}

export function saveRoutes(path, routes) {
  if (routes.integrityError) throw new Error('Cannot save rejected remote configuration');
  if (!existsSync(path) && existsSync(path + '.key')) throw new Error('Remote configuration was removed outside Tripwire');
  if (existsSync(path)) {
    const previous = JSON.parse(readFileSync(path, 'utf8'));
    if (!verifyRoutes(path, previous)) throw new Error('Remote configuration was changed outside Tripwire');
  }
  const body = JSON.parse(JSON.stringify({ listen: { ...defaultListen(), ...routes.listen }, servers: routes.servers ?? {} }));
  const estimate = JSON.stringify({ ...body, integrity: { version: 1, signature: '0'.repeat(64) } }, null, 2) + '\n';
  if (Buffer.byteLength(estimate) > 1024 * 1024) throw new Error('Remote configuration exceeds 1 MiB');
  mkdirSync(dirname(path), { recursive: true });
  const keyPath = path + '.key';
  if (!existsSync(keyPath)) writeFileSync(keyPath, randomBytes(32), { flag: 'wx', mode: 0o600 });
  const signature = createHmac('sha256', readFileSync(keyPath)).update(canonical(body)).digest('hex');
  const temp = path + '.' + randomBytes(8).toString('hex') + '.tmp';
  try {
    const fd = openSync(temp, 'wx', 0o600);
    try { writeFileSync(fd, JSON.stringify({ ...body, integrity: { version: 1, signature } }, null, 2) + '\n'); fsyncSync(fd); }
    finally { closeSync(fd); }
    renameSync(temp, path);
  } finally { rmSync(temp, { force: true }); }
  rejected.delete(path);
  log('info', 'remote-config-saved', { channels: Object.keys(body.servers) });
}

const rejected = new Map();
function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  return JSON.stringify(value);
}
function verifyRoutes(path, parsed) {
  try {
    const { integrity, ...body } = parsed;
    if (statSync(path + '.key').size !== 32) return false;
    if (integrity?.version !== 1 || !/^[a-f0-9]{64}$/.test(integrity.signature)) return false;
    const expected = createHmac('sha256', readFileSync(path + '.key')).update(canonical(body)).digest();
    return timingSafeEqual(expected, Buffer.from(integrity.signature, 'hex'));
  } catch { return false; }
}
