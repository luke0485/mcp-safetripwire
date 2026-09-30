import { enumerateServers, planWrap, applyWrap, knownHosts } from './hosts.js';
import { isProtectedServer } from './discover.js';
import { loadRoutes, saveRoutes, defaultRoutesPath, defaultListen } from './routes.js';

// "Protect everything" in one action, shared by the CLI and the console.
//
// Only servers that are NOT already routed through us are touched, so running
// it twice is harmless. `write: false` produces the same plan without changing
// anything, which is what the console shows before asking for confirmation.
// Enrol one server. Used by auto-enrolment when a channel is discovered that
// nobody has routed through us yet: detect it, identify its Agent, cable it in.
export function enrollServer({ hostId, name, launcher, listen = defaultListen(), enforce }) {
  const host = knownHosts().find((h) => h.id === hostId);
  if (!host) return { ok: false, reason: 'unknown host' };
  const plan = planWrap({ host, serverName: name, launcher, listen, enforce });
  if (!plan.ok) return { ok: false, reason: plan.reason };
  return applyEnrollment({ host, name, plan, listen });
}

// Register the route before redirecting the host. If config writing fails,
// restore the previous routes so an unsuccessful enrolment is reversible.
export function applyEnrollment({ host, name, plan, listen = defaultListen(), routesPath = defaultRoutesPath() }) {
  const previous = loadRoutes(routesPath);
  if (plan.kind === 'http') {
    const routes = structuredClone(previous);
    routes.listen = listen;
    routes.servers[plan.channelName || name] = { ...plan.route };
    saveRoutes(routesPath, routes);
  }
  try {
    const res = applyWrap({ host, serverName: name, wrapped: plan.wrapped });
    if (!res.ok) {
      if (plan.kind === 'http') saveRoutes(routesPath, previous);
      return res;
    }
    return { ok: true, kind: plan.kind, backup: res.backup };
  } catch (err) {
    if (plan.kind === 'http') saveRoutes(routesPath, previous);
    throw err;
  }
}

export function protectAll({ launcher, listen = defaultListen(), enforce, write = false }) {
  const results = [];
  const routes = loadRoutes(defaultRoutesPath());
  let routesChanged = false;

  const seen = new Set();
  for (const item of enumerateServers()) {
    if (isProtectedServer(item.info, routes)) continue;
    const host = knownHosts().find((h) => h.id === item.hostId);
    if (!host) continue;
    const key = JSON.stringify([host.path.toLowerCase(), host.keyPath || host.key, item.name]);
    if (seen.has(key)) continue;
    seen.add(key);

    const plan = planWrap({ host, serverName: item.name, launcher, listen, enforce });
    if (!plan.ok) {
      results.push({ host: item.hostId, name: item.name, ok: false, reason: plan.reason });
      continue;
    }
    if (!write) {
      results.push({ host: item.hostId, name: item.name, ok: true, kind: plan.kind, applied: false });
      continue;
    }

    const res = applyWrap({ host, serverName: item.name, wrapped: plan.wrapped });
    if (!res.ok) {
      results.push({ host: item.hostId, name: item.name, ok: false, reason: res.reason });
      continue;
    }
    if (plan.kind === 'http') {
      routes.servers[plan.channelName || item.name] = {
        ...(routes.servers[plan.channelName || item.name] ?? {}),
        upstream: plan.original.url,
        ...(enforce ? { posture: enforce } : {}),
      };
      routesChanged = true;
    }
    results.push({ host: item.hostId, name: item.name, ok: true, kind: plan.kind, applied: true, backup: res.backup });
  }

  if (write && routesChanged) saveRoutes(defaultRoutesPath(), routes);
  return results;
}
