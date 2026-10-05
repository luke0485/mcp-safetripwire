import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFileSync, existsSync, readdirSync, copyFileSync, statSync, openSync, readSync, closeSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { platform, release } from 'node:os';
import { appRoot, cliLauncher } from './selfpath.js';
import { defaultStatePath, defaultLogPath, dataDir } from './paths.js';
import { loadState, findPin, promotePending, updateState } from './manifest.js';
import { loadRoutes, saveRoutes, defaultRoutesPath } from './routes.js';
import { knownHosts, listServers, readServer, planWrap, enumerateServers, detectAgent, registerAgentConfig } from './hosts.js';
import { runDiscovery, snapshotServers, unprotectedServers, isProtectedServer } from './discover.js';
import { countCriticalSince, extractPeers, topology, hourlyHistogram, activityHistogram } from './insights.js';
import { deriveBaseline, diffBaseline, mergeBaseline, loadBaseline, saveBaseline } from './baseline.js';
import { checkLaunch } from './supplychain.js';
import { protectAll, enrollServer } from './protectall.js';
import { loadAdvanced, saveAdvanced } from './advanced.js';
import { loadSettings, saveSettings } from './settings.js';
import { renderPage } from './page.js';
import { setLogFile, log, createAuditMonitor, verifyChain } from './log.js';

// Local web console — the "normal program" front end.
//
// Product rule: a non-specialist must be able to use this without learning
// security vocabulary. Every label the user sees is plain language; the
// internal terms (posture, manifest, rug pull) stay in the docs.
//
// SECURITY POSTURE (a security tool must not be the weakest link):
//   - binds 127.0.0.1 only, never 0.0.0.0
//   - per-launch random token required on every request
//   - Host/Origin must be this exact local origin (defeats DNS rebinding, CSRF)
//   - mutations are POST-only
// These are pure functions below, so they are unit-testable without a socket.

const PROJECT_ROOT = appRoot();

export function newToken() {
  return randomBytes(24).toString('hex');
}

export function hostAllowed(hostHeader, listen) {
  if (!hostHeader) return false;
  const allowed = new Set([
    `127.0.0.1:${listen.port}`,
    `localhost:${listen.port}`,
    `[::1]:${listen.port}`,
  ]);
  return allowed.has(hostHeader.toLowerCase());
}

export function originAllowed(originHeader, listen) {
  if (!originHeader) return true;
  const allowed = new Set([
    `http://127.0.0.1:${listen.port}`,
    `http://localhost:${listen.port}`,
    `http://[::1]:${listen.port}`,
  ]);
  return allowed.has(String(originHeader).toLowerCase());
}

export function tokenMatches(provided, expected) {
  if (typeof provided !== 'string' || typeof expected !== 'string') return false;
  if (provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < provided.length; i++) diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export function parseAuditTail(text, limit = 200) {
  const lines = String(text).split('\n').filter((l) => l.trim() !== '');
  const tail = lines.slice(-limit);
  const out = [];
  for (const line of tail) {
    try {
      out.push(JSON.parse(line));
    } catch {
      out.push({ level: 'warn', event: 'unreadable', raw: line.slice(0, 200) });
    }
  }
  return out.reverse();
}

export function htmlEscape(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const LOG_TAIL_BYTES = 512 * 1024;

function readActivity(limit) {
  const path = defaultLogPath();
  if (!existsSync(path)) return { path, events: [] };
  try {
    // Read only the tail. Reading and splitting the whole file on every poll is
    // what made the API take seconds once the log had some size.
    const size = statSync(path).size;
    const start = Math.max(0, size - LOG_TAIL_BYTES);
    const length = size - start;
    const buf = Buffer.alloc(length);
    const fd = openSync(path, 'r');
    try { readSync(fd, buf, 0, length, start); } finally { closeSync(fd); }
    let text = buf.toString('utf8');
    if (start > 0) { const nl = text.indexOf(String.fromCharCode(10)); text = nl >= 0 ? text.slice(nl + 1) : ''; }
    const events = parseAuditTail(text, limit);
    return { path, events, truncated: start > 0 || text.split('\n').filter(line => line.trim()).length > limit };
  } catch {
    return { path, events: [] };
  }
}

// /api/status is polled by the page; reading and parsing the audit file on
// every poll was wasted work on a hot path.
let eventsCache = { at: 0, value: null };
function readEventsCached(limit) {
  const now = Date.now();
  if (eventsCache.value && eventsCache.limit === limit && now - eventsCache.at < 5000) return eventsCache.value;
  eventsCache = { at: now, limit, value: readActivity(limit) };
  return eventsCache.value;
}

// Reading every host config on each poll is wasted work; a few seconds of
// staleness is invisible to the user.
let snapCache = { at: 0, value: null };
function snapshotCached() {
  const now = Date.now();
  if (snapCache.value && now - snapCache.at < 4000) return snapCache.value;
  snapCache = { at: now, value: snapshotServers(enumerateServers) };
  return snapCache.value;
}

let currentDeviations = [];

function buildStatus() {
  const state = loadState(defaultStatePath());
  const routes = loadRoutes(defaultRoutesPath());
  const settings = loadSettings();
  const pinned = Object.keys(state.pins ?? {}).map((name) => ({ name, hash: findPin(state, name).hash }));
  const hosts = knownHosts().map((host) => {
    const servers = listServers(host).map((name) => {
      const info = readServer(host, name);
      return {
        name,
        kind: info?.kind ?? 'unknown',
        target: info?.kind === 'http' ? info.url : [info?.command, ...(info?.args ?? [])].filter(Boolean).join(' '),
        wrapped: isProtectedServer(info, routes),
      };
    });
    return { id: host.id, agentId: host.agentId, vendor: host.vendor, label: host.label, scope: host.scope, project: host.project, installed: host.installed || existsSync(host.path), path: host.path, exists: existsSync(host.path), servers };
  });
  return {
    protection: settings.protection,
    integrityErrors: [settings.integrityError, state.integrityError, routes.integrityError].filter(Boolean),
    platform: `${platform()} ${release()}`,
    dataDir: dataDir(),
    logPath: defaultLogPath(),
    projectRoot: PROJECT_ROOT,
    pinned,
    routes: Object.entries(routes.servers ?? {}).map(([name, entry]) => ({ name, upstream: entry.upstream })),
    mechanism: (() => {
      const rows = Object.values(snapshotCached());
      const pins = Object.keys(loadState(defaultStatePath()).pins ?? {}).length;
      const routeCount = Object.keys(loadRoutes(defaultRoutesPath()).servers ?? {}).length;
      return {
        channels: { stdio: rows.filter((r) => r.kind === 'stdio').length, http: rows.filter((r) => r.kind === 'http').length },
        pinned: pins,
        routes: routeCount,
        deception: settings.protection === 'protect',
        posture: settings.protection,
      };
    })(),
    tools: (() => {
      const snap = snapshotCached();
      const history = readEventsCached(20000);
      const events = history.events;
      return {
        total: Object.keys(snap).length,
        unprotected: unprotectedServers(snap).length,
        alerts24h: countCriticalSince(events, 24),
        peers: extractPeers(events),
        topology: topology(snap),
        hourly: hourlyHistogram(events, 24),
        activity: activityHistogram(events),
        historyPartial: Boolean(history.truncated),
        // Live counters per detection family, so the UI reports what the engine
        // has actually been catching rather than a static feature list.
        deviations: currentDeviations.length,
        deviationList: currentDeviations.slice(0, 20),
        detections: (() => {
          const n = { staticFindings: 0, argumentHits: 0, decoyTriggers: 0, canaryTrips: 0, unexpectedPeers: 0, newTools: 0, toolChanges: 0, blocked: 0 };
          for (const e of events) {
            if (e.event === 'static-finding') n.staticFindings++;
            else if (e.event === 'argument-suspicious' || e.event === 'argument-blocked') n.argumentHits++;
            else if (e.event === 'decoy-triggered') n.decoyTriggers++;
            else if (e.event === 'canary-exfil') n.canaryTrips++;
            else if (e.event === 'bridge-unexpected-peer') n.unexpectedPeers++;
            else if (e.event === 'new-tool-detected') n.newTools++;
            else if (e.event === 'tool-changed') n.toolChanges++;
            else if (e.event === 'enforced-block' || e.event === 'argument-blocked') n.blocked++;
          }
          return n;
        })(),
        supply: (() => {
          const found = {};
          for (const item of enumerateServers()) {
            if (item.info?.kind !== 'stdio') continue;
            const f = checkLaunch({ command: item.info.command, args: item.info.args });
            // key by host+name so two hosts with the same tool name cannot collide
            if (f.length) found[item.hostId + '::' + item.name] = f;
          }
          return found;
        })(),
        pending: Object.entries(loadState(defaultStatePath()).pending ?? {}).map(([name, p]) => ({
          name,
          hash: p.hash,
          count: p.count ?? null,
          seenAt: p.seenAt ?? null,
        })),
      };
    })(),
    listen: routes.listen,
    hosts,
  };
}

function latestBackup(configPath) {
  const dir = dirname(configPath);
  const base = configPath.split(/[\\/]/).pop();
  try {
    const candidates = readdirSync(dir).filter((f) => f.startsWith(`${base}.tripwire-backup-`)).sort();
    return candidates.length ? join(dir, candidates[candidates.length - 1]) : null;
  } catch {
    return null;
  }
}

const COOKIE_NAME = 'tripwire_token';

function readCookie(req, name) {
  const raw = req.headers.cookie;
  if (!raw) return null;
  for (const part of String(raw).split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}

export function createConsole({ listen, token, host = '127.0.0.1' }) {
  setLogFile(defaultLogPath());
  // Stamped into the page so a stale window is obvious at a glance.
  // Local time, not UTC: an ISO string shows the wrong hour to the user.
  const startedAtText = new Date().toLocaleString('sv-SE', { hour12: false });

  const server = createServer((req, res) => {
    if (!hostAllowed(req.headers.host, listen)) {
      res.writeHead(403, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'forbidden host' }));
      return;
    }
    if (!originAllowed(req.headers.origin, listen)) {
      res.writeHead(403, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'forbidden origin' }));
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);
    const queryToken = url.searchParams.get('token');
    const headerToken = req.headers['x-tripwire-token'];
    const cookieToken = readCookie(req, COOKIE_NAME);

    // Accept the token once via the URL, then hand out an HttpOnly cookie and
    // redirect. After that the page's own JavaScript never touches the token,
    // so a hostile local page cannot read it and CSRF is already blocked by the
    // Origin check.
    const authed = tokenMatches(queryToken, token) || tokenMatches(headerToken, token) || tokenMatches(cookieToken, token);

    if (url.pathname === '/' || url.pathname === '/index.html') {
      if (!authed) {
        res.writeHead(401, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('打不开 / Cannot open: the access token is missing or wrong.\n');
        return;
      }
      if (tokenMatches(queryToken, token) && !tokenMatches(cookieToken, token)) {
        res.writeHead(302, {
          location: '/',
          'set-cookie': `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/`,
          'cache-control': 'no-store',
        });
        res.end();
        return;
      }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      res.end(renderPage({ startedAt: startedAtText }));
      return;
    }

    if (!authed) {
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'unauthorized' }));
      return;
    }

    try {
      handleApi(req, res, url);
    } catch (err) {
      log('critical', 'api-error', { path: url.pathname, error: String(err) });
      try { sendJson(res, 500, { error: 'internal error' }); } catch { /* response already gone */ }
    }
  });

  server.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE') {
      // A failed listen leaves no active handle, so Node would drain the event
      // loop and exit 0 -- indistinguishable from a healthy background process
      // that mysteriously does nothing. Fail loudly and distinguishably.
      log('critical', 'console-port-in-use', { listen, error: String(err) });
      process.stderr.write(`mcp-safetripwire: port ${listen.port} is already in use; another instance is running.\n`);
      process.exit(9);
    }
    log('critical', 'console-error', { error: String(err) });
    process.exit(10);
  });
  server.listen(listen.port, host, () => log('info', 'console-listening', { listen, host }));

  // Auto-discovery: watch the AI assistants' configs for tools appearing or
  // changing. The first pass only records a baseline.
  const discoveryPass = () => {
    try {
      const result = runDiscovery({ enumerate: enumerateServers });
      if (result.seeded) {
        log('info', 'discovery-seeded', { tools: Object.keys(result.snapshot).length });
        return;
      }
      for (const t of result.added) {
        log('critical', 'new-tool-detected', { host: t.host, tool: t.name, kind: t.kind, target: t.target });
      }
      // Full coverage means detecting the new channel AND cabling it in, not
      // just warning about it. Only in protect mode: wiring configs behind a
      // user's back in observe mode would be a surprise.
      if (loadSettings().protection === 'protect') {
        for (const t of result.added) {
          if (t.protected) continue;
          const r = enrollServer({
            hostId: t.host,
            name: t.name,
            launcher: cliLauncher(),
            listen: loadRoutes(defaultRoutesPath()).listen,
          });
          log(r.ok ? 'info' : 'warn', r.ok ? 'auto-enrolled' : 'auto-enroll-failed', {
            host: t.host,
            tool: t.name,
            kind: r.kind,
            reason: r.reason,
          });
        }
      }
      for (const t of result.changed) {
        log('warn', 'tool-changed', { host: t.host, tool: t.name, was: t.was, now: t.target });
      }
      for (const t of result.removed) {
        log('info', 'tool-removed', { host: t.host, tool: t.name });
      }
    } catch (err) {
      log('warn', 'discovery-error', { error: String(err) });
    }
  };
  discoveryPass();
  const discoveryTimer = setInterval(discoveryPass, 30000);

  // Prove the audit trail is intact at startup. The hash chain is the whole
  // reason the log can be treated as evidence, and a verification nobody runs
  // is not a control -- the first version of this shipped with the chain
  // written but never checked.
  const auditMonitor = createAuditMonitor();
  const auditCheck = () => {
    try {
      const records = readActivity(500).events.slice().reverse(); // oldest first
      if (records.length === 0) return;
      const { check, changed } = auditMonitor(records);
      if (!changed) return;
      log(check.ok ? 'info' : 'critical', check.ok ? 'audit-chain-ok' : 'audit-chain-broken', {
        records: check.count,
        at: check.at,
        reason: check.reason,
      });
    } catch { /* no log yet */ }
  };
  auditCheck();
  const auditTimer = setInterval(auditCheck, 300000);
  if (auditTimer.unref) auditTimer.unref();

  // Behavioural baseline: what this environment normally does, and what has
  // started happening that it never did before. These are retrospective
  // advisory changes, not inline blocking or proof of malicious behaviour.
  const baselinePath = join(dataDir(), 'baseline.json');
  const baselinePass = () => {
    try {
      const current = deriveBaseline(readActivity(2000).events, { hours: 24 });
      const previous = loadBaseline(baselinePath);
      currentDeviations = [];
      if (previous && Object.keys(previous).length > 0) {
        currentDeviations = diffBaseline(previous, current);
        for (const d of currentDeviations) {
          log(d.severity === 'info' ? 'info' : 'warn', 'baseline-deviation', d);
        }
      }
      if (!saveBaseline(mergeBaseline(previous, current), baselinePath)) throw new Error('Could not save behavioural baseline');
    } catch (err) {
      log('warn', 'baseline-error', { error: String(err) });
    }
  };
  baselinePass();
  const baselineTimer = setInterval(baselinePass, 600000);
  if (baselineTimer.unref) baselineTimer.unref();
  if (discoveryTimer.unref) discoveryTimer.unref();

  return server;
}

function sendJson(res, code, body) {
  res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

export function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0, failed = false;
    req.on('data', c => {
      if (failed) return;
      bytes += c.length;
      if (bytes > 64 * 1024) { failed = true; chunks.length = 0; reject(new Error('Request body exceeds 64 KB')); return; }
      chunks.push(c);
    });
    req.on('aborted', () => reject(new Error('Request aborted')));
    req.on('error', reject);
    req.on('end', () => {
      if (failed) return;
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        const value = JSON.parse(raw);
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected a JSON object');
        resolve(value);
      } catch {
        reject(new Error('body is not valid JSON'));
      }
    });
  });
}

export function openPath(target) {
  // Spawning bare "explorer" fails often: the shell resolves it, a spawned
  // process may not. Use the real path when we can find it.
  let cmd = 'explorer.exe';
  if (process.platform === 'win32') {
    const full = join(process.env.SystemRoot || 'C:' + String.fromCharCode(92) + 'Windows', 'explorer.exe');
    cmd = existsSync(full) ? full : 'explorer.exe';
  } else if (process.platform === 'darwin') {
    cmd = 'open';
  } else {
    cmd = 'xdg-open';
  }
  try {
    const child = spawn(cmd, [target], { stdio: 'ignore', detached: true, windowsHide: true });
    child.on('error', () => {});
    child.unref();
    return true;
  } catch {
    return false;
  }
}

// Locate a Chromium-family browser so the console can open as its OWN window
// (no tabs, no address bar) instead of a browser tab. That is the difference
// between "a website" and "a program" for the person using it.
export function findChromium() {
  const candidates = [];
  if (process.platform === 'win32') {
    const pf = process.env.PROGRAMFILES;
    const pf86 = process.env['PROGRAMFILES(X86)'];
    const local = process.env.LOCALAPPDATA;
    for (const root of [pf86, pf, local]) {
      if (!root) continue;
      candidates.push(join(root, 'Microsoft', 'Edge', 'Application', 'msedge.exe'));
      candidates.push(join(root, 'Google', 'Chrome', 'Application', 'chrome.exe'));
    }
  } else if (process.platform === 'darwin') {
    candidates.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
    candidates.push('/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge');
  }
  for (const c of candidates) {
    try {
      if (existsSync(c)) return c;
    } catch {
      /* ignore */
    }
  }
  return null;
}

export function openBrowser(url, { appWindow = true } = {}) {
  if (appWindow) {
    const exe = findChromium();
    if (exe) {
      try {
        const child = spawn(exe, [`--app=${url}`, '--window-size=1120,780', `--user-data-dir=${join(dataDir(), 'app-window')}`, '--no-first-run', '--no-default-browser-check'], {
          stdio: 'ignore',
          detached: true,
          windowsHide: true,
        });
        child.on('error', () => {});
        child.unref();
        return 'app';
      } catch {
        /* fall through to the default browser */
      }
    }
  }
  const cmd = process.platform === 'win32' ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  try {
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true, windowsHide: true });
    child.on('error', () => {});
    child.unref();
  } catch {
    /* the URL is printed to the terminal anyway */
  }
  return 'browser';
}

function handleApi(req, res, url) {
    if (req.method === 'POST' && url.pathname === '/api/register-agent-config') {
      return readJsonBody(req).then(body => {
        const result = registerAgentConfig({ agentId: body.agentId, path: body.path });
        log('info', 'console-agent-config-added', { agentId: body.agentId, path: result.path });
        return sendJson(res, 200, { ok: true, ...result });
      }).catch(error => sendJson(res, 400, { error: error.message }));
    }
  if (req.method === 'GET' && url.pathname === '/api/detect-agent') {
    const result = detectAgent(url.searchParams.get('id'));
    if (result) {
      const hosts = knownHosts();
      const routes = loadRoutes(defaultRoutesPath());
      result.servers = result.servers.map(server => ({ ...server, wrapped: isProtectedServer(readServer(hosts.find(host => host.id === (server.hostId || result.id)), server.name), routes) }));
    }
    return sendJson(res, result ? 200 : 400, result ?? { error: 'Unknown Agent' });
  }
  if (req.method === 'GET' && url.pathname === '/api/status') return sendJson(res, 200, buildStatus());
  if (req.method === 'GET' && url.pathname === '/api/events') {
    const limit = Math.min(Number(url.searchParams.get('limit')) || 200, 500);
    return sendJson(res, 200, readActivity(limit));
  }
  if (req.method === 'GET' && url.pathname === '/api/plan') {
    const host = knownHosts().find((h) => h.id === url.searchParams.get('host'));
    if (!host) return sendJson(res, 400, { error: 'unknown host' });
    const plan = planWrap({ host, serverName: url.searchParams.get('server'), launcher: cliLauncher(), listen: loadRoutes(defaultRoutesPath()).listen });
    return sendJson(res, plan.ok ? 200 : 400, plan);
  }

  if (req.method === 'GET' && url.pathname === '/api/advanced') return sendJson(res, 200, loadAdvanced());
  if (req.method === 'POST' && url.pathname === '/api/advanced') {
    return readJsonBody(req).then(body => {
      const current = loadAdvanced();
      if (current.integrityError) throw new Error(current.integrityError);
      let baseline = current.baseline;
      if (body.freeze === true) {
        if (body.confirm !== true) throw new Error('Confirmation required');
        const pins = loadState(defaultStatePath()).pins || {};
        const history = readActivity(20000).events;
        if (!verifyChain([...history].reverse()).ok) throw new Error('Audit integrity check failed; baseline was not changed');
        baseline = Object.fromEntries(Object.entries(deriveBaseline(history.filter(e => e.action === 'allow' && pins[e.name]))).filter(([,e]) => e.calls >= 20));
        if (!Object.keys(baseline).length) throw new Error('Need at least 20 allowed calls from an approved channel / 已批准通道至少需要20次放行调用');
      }
      const saved = saveAdvanced({ ...current, ...body, baseline });
      log('info', body.freeze ? 'baseline-frozen' : 'advanced-settings-saved', { tools: Object.keys(baseline).length });
      return sendJson(res, 200, saved);
    }).catch(err => sendJson(res, 400, {error:err.message}));
  }
  if (req.method === 'POST' && url.pathname === '/api/protection') {
    return readJsonBody(req).then((body) => {
      const saved = saveSettings({ protection: body.protection });
      log('info', 'protection-changed', { protection: saved.protection });
      return sendJson(res, 200, saved);
    }).catch((err) => sendJson(res, 400, { error: err.message }));
  }

  if (req.method === 'POST' && url.pathname === '/api/wrap') {
    return readJsonBody(req).then((body) => {
      const host = knownHosts().find((h) => h.id === body.host);
      if (!host) return sendJson(res, 400, { error: 'unknown host' });
      if (body.confirm !== true) return sendJson(res, 400, { error: 'confirmation required' });
      const plan = planWrap({ host, serverName: body.server, launcher: cliLauncher(), listen: loadRoutes(defaultRoutesPath()).listen });
      if (!plan.ok) return sendJson(res, 400, { error: plan.reason });
      const result = enrollServer({ hostId: body.host, name: body.server, launcher: cliLauncher(), listen: loadRoutes(defaultRoutesPath()).listen });
      if (!result.ok) return sendJson(res, 400, { error: result.reason });
      log('info', 'console-wrap', { host: body.host, server: body.server, kind: plan.kind });
      return sendJson(res, 200, { ok: true, kind: plan.kind, backup: result.backup });
    }).catch((err) => sendJson(res, 400, { error: err.message }));
  }

  if (req.method === 'POST' && url.pathname === '/api/restore-backup') {
    return readJsonBody(req).then((body) => {
      const host = knownHosts().find((h) => h.id === body.host);
      if (!host) return sendJson(res, 400, { error: 'unknown host' });
      if (body.confirm !== true) return sendJson(res, 400, { error: 'confirmation required' });
      const backup = latestBackup(host.path);
      if (!backup) return sendJson(res, 400, { error: '还没有备份' });
      copyFileSync(backup, host.path);
      log('warn', 'console-restore', { host: body.host, backup });
      return sendJson(res, 200, { ok: true, restoredFrom: backup });
    }).catch((err) => sendJson(res, 400, { error: err.message }));
  }

  if (req.method === 'POST' && url.pathname === '/api/add-remote') {
    return readJsonBody(req).then((body) => {
      const name = String(body.name || '').trim();
      const upstream = String(body.upstream || '').trim();
      if (!/^[A-Za-z0-9._-]{1,64}$/.test(name)) return sendJson(res, 400, { error: 'name must be 1-64 chars: letters, digits, dot, dash, underscore' });
      let parsed;
      try { parsed = new URL(upstream); } catch { return sendJson(res, 400, { error: 'upstream must be a valid URL' }); }
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return sendJson(res, 400, { error: 'upstream must be http or https' });
      const routesPath = defaultRoutesPath();
      const routes = loadRoutes(routesPath);
      const previous = routes.servers[name]?.upstream;
      routes.servers[name] = { ...(routes.servers[name] ?? {}), upstream };
      saveRoutes(routesPath, routes);
      log('info', 'remote-added', { name, upstream: parsed.origin + parsed.pathname, replaced: Boolean(previous) });
      return sendJson(res, 200, { ok: true, localUrl: 'http://' + routes.listen.host + ':' + routes.listen.port + '/' + name + '/' });
    }).catch((err) => sendJson(res, 400, { error: err.message }));
  }

  if (req.method === 'POST' && url.pathname === '/api/protect-all') {
    return readJsonBody(req).then((body) => {
      const results = protectAll({
        launcher: cliLauncher(),
        listen: loadRoutes(defaultRoutesPath()).listen,
        write: body.confirm === true,
      });
      const applied = results.filter((r) => r.applied).length;
      if (applied > 0) log('info', 'protect-all', { applied, planned: results.length });
      return sendJson(res, 200, { ok: true, applied, results });
    }).catch((err) => sendJson(res, 400, { error: err.message }));
  }

  if (req.method === 'POST' && url.pathname === '/api/revert-all') {
    return readJsonBody(req).then((body) => {
      if (body.confirm !== true) return sendJson(res, 400, { error: 'confirmation required' });
      const reverted = [];
      for (const host of knownHosts()) {
        const backup = latestBackup(host.path);
        if (!backup) continue;
        try { copyFileSync(backup, host.path); reverted.push(host.id); } catch { /* leave it */ }
      }
      const routesPath = defaultRoutesPath();
      const routes = loadRoutes(routesPath);
      const routeCount = Object.keys(routes.servers ?? {}).length;
      routes.servers = {};
      saveRoutes(routesPath, routes);
      log('warn', 'revert-all', { hosts: reverted, routesCleared: routeCount });
      return sendJson(res, 200, { ok: true, reverted, routesCleared: routeCount });
    }).catch((err) => sendJson(res, 400, { error: err.message }));
  }

  if (req.method === 'POST' && url.pathname === '/api/approve') {
    return readJsonBody(req).then((body) => {
      if (body.confirm !== true) return sendJson(res, 400, { error: 'confirmation required' });
      if (typeof body.hash !== 'string' || !/^[a-f0-9]{64}$/.test(body.hash) || !updateState(defaultStatePath(), state => promotePending(state, body.name, body.hash))) {
        return sendJson(res, 409, { error: '工具清单已变化，请刷新后重新核对 / Tool manifest changed; refresh and review again' });
      }
      log('info', 'channel-approved', { name: body.name });
      return sendJson(res, 200, { ok: true, name: body.name });
    }).catch((err) => sendJson(res, 400, { error: err.message }));
  }

  if (req.method === 'POST' && url.pathname === '/api/open-folder') {
    return readJsonBody(req).then((body) => {
      const which = body.which === 'logs' ? dataDir() : PROJECT_ROOT;
      const ok = openPath(which);
      if (!ok) log('warn', 'open-folder-failed', { path: which });
      return sendJson(res, ok ? 200 : 500, { ok, path: which });
    }).catch((err) => sendJson(res, 400, { error: err.message }));
  }

  sendJson(res, 404, { error: 'not found' });
}
