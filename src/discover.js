import { existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import { dataDir } from './paths.js';
import { loadRoutes, defaultRoutesPath, localUrlFor } from './routes.js';
import { readProtectedJson, writeProtectedJson } from './integritystore.js';

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

// A wrapped stdio entry has a recognisable launch shape:
//   node <...>/cli.js wrap --name <channel> -- <original...>
//   safetripwire.exe wrap --name <channel> -- <original...>
// Matching that shape avoids treating any command whose path merely contains
// "tripwire" (or a binary renamed tripwire.exe) as already protected.
export function looksWrapped(info) {
  if (!info || info.kind !== 'stdio') return false;
  const command = basename(String(info.command ?? '')).toLowerCase().replace(/\.(exe|cmd|bat)$/, '');
  const args = Array.isArray(info.args) ? info.args.map(String) : [];
  const wrapAt = args.indexOf('wrap');
  const nameAt = args.indexOf('--name');
  const separatorAt = args.indexOf('--');
  if (wrapAt < 0 || nameAt <= wrapAt || separatorAt <= nameAt) return false;
  if (command === 'node') {
    // Development launcher: the first argument is this project's cli.js.
    return /(^|[\\/])cli\.js$/i.test(args[wrapAt - 1] ?? '');
  }
  return ['safetripwire', 'mcp-safetripwire', 'mcp-tripwire', 'tripwire'].includes(command);
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
  return looksWrapped(info);
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
  if (!existsSync(path) && !existsSync(path + '.key')) return null; // null == never seeded
  const parsed = readProtectedJson(path, { servers: {} });
  if (!parsed || typeof parsed.servers !== 'object' || Array.isArray(parsed.servers)) {
    throw new Error('Known-server registry is invalid');
  }
  return parsed.servers;
}

export function saveKnown(snapshot, path = defaultKnownPath()) {
  writeProtectedJson(path, { servers: snapshot });
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
