// Derived views over the audit trail, used by the console's dashboard.
// Pure functions so they can be tested without reading a real log.

export function countCriticalSince(events, hours, now = Date.now()) {
  const cutoff = now - hours * 3600 * 1000;
  return (events ?? []).filter((e) => {
    if (e.level !== 'critical') return false;
    const ts = Date.parse(e.ts);
    return Number.isFinite(ts) && ts >= cutoff;
  }).length;
}

// Who has connected to a watched channel? The bridge records the peer process
// (pid + image) on every connection, so the console can show it.
export function extractPeers(events, limit = 50) {
  const seen = new Map();
  for (const e of events ?? []) {
    if (e.event !== 'bridge-peer' && e.event !== 'bridge-unexpected-peer') continue;
    const key = `${e.image ?? 'unknown'}|${e.pid ?? ''}`;
    const allowed = e.event === 'bridge-peer';
    const cur = seen.get(key);
    if (!cur || Date.parse(e.ts) > Date.parse(cur.lastTs)) {
      seen.set(key, {
        image: e.image ?? null,
        pid: e.pid ?? null,
        channel: e.name ?? null,
        allowed,
        lastTs: e.ts,
      });
    }
  }
  return [...seen.values()]
    .sort((a, b) => Date.parse(b.lastTs) - Date.parse(a.lastTs))
    .slice(0, limit);
}

// Events per hour, oldest first, for the trend strip. Empty hours are kept so
// the shape over time stays readable instead of collapsing.
export function hourlyHistogram(events, hours = 24, now = Date.now()) {
  const ms = 3600 * 1000;
  const start = now - (hours - 1) * ms;
  const buckets = Array.from({ length: hours }, () => ({ critical: 0, warn: 0, info: 0 }));
  for (const e of events ?? []) {
    const ts = Date.parse(e.ts);
    if (!Number.isFinite(ts) || ts < start || ts > now) continue;
    const idx = Math.min(hours - 1, Math.max(0, Math.floor((ts - start) / ms)));
    const key = e.level === 'critical' ? 'critical' : e.level === 'warn' ? 'warn' : 'info';
    buckets[idx][key]++;
  }
  return buckets;
}

// One row per channel, for the topology strip in the console.
export function activityHistogram(events, now = Date.now()) {
  const interval = 5 * 60 * 1000;
  const start = now - 24 * 3600 * 1000;
  const buckets = Array.from({ length: 288 }, (_, i) => ({ ts: new Date(start + i * interval).toISOString(), critical: 0, warn: 0, info: 0 }));
  for (const event of events ?? []) {
    const ts = Date.parse(event.ts);
    if (!Number.isFinite(ts) || ts < start || ts > now) continue;
    const index = Math.min(287, Math.floor((ts - start) / interval));
    const level = event.level === 'critical' ? 'critical' : event.level === 'warn' ? 'warn' : 'info';
    buckets[index][level]++;
  }
  return buckets;
}

export function topology(snapshot) {
  return Object.values(snapshot ?? {})
    .map((s) => ({ host: s.host, name: s.name, kind: s.kind, protected: s.protected }))
    .sort((a, b) => (a.host + a.name < b.host + b.name ? -1 : 1));
}
