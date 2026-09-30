import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { dataDir } from './paths.js';
import { loadRoutes, defaultRoutesPath, localUrlFor } from './routes.js';

// Auto-discovery: know every tool the AI assistants can talk to, notice when a
// new one appears, and notice when one is protected.
//
// This is the "entry coverage" idea in practice. An assistant can only talk to
// tools that its config declares, so watching the configs covers every entry
// point — whatever protocol or vendor shows up next. The diff logic is pure so
// it can be tested without touching a real config.

export function serverKey(hostId, name) {
  return `${hostId}::${name}`;
}

// Is this server already routed through Tripwire?
export function isProtectedServer(info, routes = loadRoutes(defaultRoutesPath())) {
  if (!info) return false;
  if (info.kind === 'http') {
    try {
      const url = new URL(info.url);
      const name = decodeURIComponent(url.pathname.split('/')[1]);
      const entry = routes.servers?.[name];
      if (!entry) return false;
      const expected = new URL(localUrlFor(routes.listen, name, entry.upstream));
      return url.origin === expected.origin && url.pathname === expected.pathname && url.search === expected.search;
    } catch { return false; }
  }
  const joined = [info.command, ...(info.args ?? [])].filter(Boolean).join(' ');
  return /mcp-tripwire|tripwire\.exe|src[\\/]cli\.js/.test(joined);
}

export function describeTarget(info) {
  if (!info) return '';
  if (info.kind === 'http') return info.url ?? '';
  return [info.command, ...(info.args ?? [])].filter(Boolean).join(' ');
}

// `enumerate` is injected so this stays testable and so the caller controls I/O.
export function snapshotServers(enumerate) {
  const map = {};
  for (const item of enumerate()) {
    map[serverKey(item.hostId, item.name)] = {
      host: item.hostId,
      name: item.name,
      kind: item.info?.kind ?? 'unknown',
      target: describeTarget(item.info),
      protected: isProtectedServer(item.info),
    };
  }
  return map;
}

export function diffSnapshot(previous, current) {
  const added = [];
  const removed = [];
  const changed = [];
  for (const key of Object.keys(current)) {
    const now = current[key];
    const before = previous[key];
    if (!before) { added.push(now); continue; }
    if (before.target !== now.target || before.kind !== now.kind) {
      changed.push({ ...now, was: before.target });
    }
  }
  for (const key of Object.keys(previous)) {
    if (!current[key]) removed.push(previous[key]);
  }
  return { added, removed, changed };
}

export function unprotectedServers(snapshot) {
  return Object.values(snapshot).filter((s) => !s.protected);
}

export function defaultKnownPath() {
  return join(dataDir(), 'known-servers.json');
}

export function loadKnown(path = defaultKnownPath()) {
  if (!existsSync(path)) return null; // null == never seeded
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    return parsed.servers ?? {};
  } catch {
    return null;
  }
}

export function saveKnown(snapshot, path = defaultKnownPath()) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({ savedAt: new Date().toISOString(), servers: snapshot }, null, 2) + '\n');
  return snapshot;
}

// One discovery pass: compare the live configs against what we have seen
// before. The first run only seeds a baseline, so a fresh install does not
// scream about every tool that already existed.
export function runDiscovery({ enumerate, knownPath }) {
  const snapshot = snapshotServers(enumerate);
  const previous = loadKnown(knownPath);
  if (previous === null) {
    saveKnown(snapshot, knownPath);
    return { seeded: true, added: [], removed: [], changed: [], snapshot };
  }
  const diff = diffSnapshot(previous, snapshot);
  saveKnown(snapshot, knownPath);
  return { seeded: false, ...diff, snapshot };
}
