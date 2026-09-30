import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

// Behavioural baseline.
//
// A static fingerprint catches a tool whose DEFINITION changed. It cannot catch
// the Deadbugz pattern: identical code, identical definitions, malicious only on
// the third call. What changes there is BEHAVIOUR -- which tools get called, with
// which argument fields, to which destinations, and how often.
//
// This turns the audit trail into that baseline and reports whatever deviates.
// Only derived facts are kept (field names, destination hosts, counts). Raw
// argument values are never stored.

const HOST_RE = /(?:https?:\/\/)?([a-z0-9][a-z0-9.-]*\.[a-z]{2,})(?::\d{1,5})?/gi;
const NOT_A_HOST = /\.(js|mjs|cjs|ts|py|json|toml|md|txt|png|jpe?g|gif|exe|dll|so|dylib|log|html?|css|zip|gz)$/i;

export function extractDestinations(text) {
  const found = new Set();
  if (typeof text !== 'string' || text === '') return [];
  HOST_RE.lastIndex = 0;
  let m;
  while ((m = HOST_RE.exec(text)) !== null) {
    const host = m[1].toLowerCase();
    if (NOT_A_HOST.test(host)) continue;
    found.add(host);
  }
  return [...found];
}

export function argKeys(params) {
  const keys = [];
  const walk = (value, prefix) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      for (const item of value) walk(item, prefix + '[]');
      return;
    }
    for (const key of Object.keys(value)) {
      const path = prefix ? `${prefix}.${key}` : key;
      keys.push(path);
      walk(value[key], path);
    }
  };
  walk(params, '');
  return [...new Set(keys)];
}

export function destinationsOf(params) {
  let text;
  try {
    text = JSON.stringify(params ?? {});
  } catch {
    return [];
  }
  return extractDestinations(text);
}

export function channelToolKey(channel, tool) {
  return `${channel ?? '?'}::${tool ?? '?'}`;
}

export function deriveBaseline(events, { hours = 24, now = Date.now() } = {}) {
  const cutoff = now - hours * 3600 * 1000;
  const map = {};
  for (const e of events ?? []) {
    if (!e || e.event !== 'tools-call' || e.action === 'block') continue;
    const ts = Date.parse(e.ts);
    if (!Number.isFinite(ts) || ts < cutoff || ts > now) continue;
    const key = channelToolKey(e.name, e.tool);
    const entry = map[key] ?? (map[key] = {
      channel: e.name ?? null,
      tool: e.tool ?? null,
      calls: 0,
      argKeys: [],
      destinations: [],
      firstTs: e.ts ?? null,
      lastTs: e.ts ?? null,
    });
    entry.calls += 1;
    for (const k of e.argKeys ?? []) if (!entry.argKeys.includes(k)) entry.argKeys.push(k);
    for (const d of e.destinations ?? []) if (!entry.destinations.includes(d)) entry.destinations.push(d);
    if (e.ts && entry.firstTs && e.ts < entry.firstTs) entry.firstTs = e.ts;
    if (e.ts && entry.lastTs && e.ts > entry.lastTs) entry.lastTs = e.ts;
  }
  return map;
}

// Anything a well-behaved channel did not do before is worth a look.
export function diffBaseline(previous, current) {
  const deviations = [];
  for (const key of Object.keys(current ?? {})) {
    const now = current[key];
    const before = (previous ?? {})[key];
    if (!before) {
      deviations.push({ severity: 'info', rule: 'tool-first-use', channel: now.channel, tool: now.tool, detail: 'this tool was called for the first time; learning, not an attack verdict' });
      continue;
    }
    for (const k of now.argKeys) {
      if (!before.argKeys.includes(k)) {
        deviations.push({ severity: 'warn', rule: 'argument-field-new', channel: now.channel, tool: now.tool, detail: `new argument field: ${k}` });
      }
    }
    for (const d of now.destinations) {
      if (!before.destinations.includes(d)) {
        deviations.push({ severity: 'warn', rule: 'destination-new', channel: now.channel, tool: now.tool, detail: `new destination reference: ${d}; not proof of an actual network connection` });
      }
    }
    if (before.calls >= 20 && now.calls > before.calls * 10) {
      deviations.push({ severity: 'warn', rule: 'call-rate-spike', channel: now.channel, tool: now.tool, detail: `call volume jumped from ${before.calls} to ${now.calls}` });
    }
  }
  const order = { high: 0, warn: 1, info: 2 };
  return deviations.sort((a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9)
    || Number(b.rule === 'destination-new') - Number(a.rule === 'destination-new'));
}

// Keep learned fields/destinations when a quiet channel falls outside the
// current window; counts still describe only the latest rolling window.
export function mergeBaseline(previous, current) {
  const merged = {};
  for (const [key, entry] of Object.entries(previous ?? {})) merged[key] = { ...entry, calls: 0 };
  for (const [key, entry] of Object.entries(current ?? {})) {
    const before = previous?.[key];
    merged[key] = { ...entry, firstTs: before?.firstTs ?? entry.firstTs,
      argKeys: [...new Set([...(before?.argKeys ?? []), ...entry.argKeys])],
      destinations: [...new Set([...(before?.destinations ?? []), ...entry.destinations])] };
  }
  return merged;
}

export function defaultBaselinePath(dataDir) {
  return `${dataDir}/baseline.json`;
}

export function loadBaseline(path) {
  try {
    if (!existsSync(path)) return null;
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    return parsed.channels ?? null;
  } catch {
    return null;
  }
}

export function saveBaseline(map, path) {
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify({ savedAt: new Date().toISOString(), channels: map }, null, 2) + '\n');
    return true;
  } catch {
    return false;
  }
}
