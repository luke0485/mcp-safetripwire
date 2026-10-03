import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { readProtectedJson, writeProtectedJson } from './integritystore.js';
import { acquireLogLock } from './log.js';

// Manifest pinning is the one mechanism here that stops a whole attack class
// (rug pull) with near-zero false positives: we hash the server's declared
// tool surface and refuse to treat a changed surface as the same server.
//
// This is TOFU (trust on first use), the same idea as a package lockfile.

function canonicalTool(tool) {
  return {
    name: tool?.name ?? '',
    description: tool?.description ?? '',
    inputSchema: tool?.inputSchema ?? null,
  };
}

export function hashTools(tools) {
  const canonical = (tools ?? [])
    .map(canonicalTool)
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const hash = createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
  return { hash, count: canonical.length };
}

export function loadState(path) {
  try {
    const parsed = readProtectedJson(path, { pins: {}, pending: {} });
    if (!parsed.pins || !parsed.pending || typeof parsed.pins !== 'object' || typeof parsed.pending !== 'object' || Array.isArray(parsed.pins) || Array.isArray(parsed.pending)) throw new Error('Invalid manifest state');
    return { pins: parsed.pins ?? {}, pending: parsed.pending ?? {} };
  } catch {
    return { pins: {}, pending: {}, integrityError: 'Manifest state was rejected; restore a trusted backup' };
  }
}

export function saveState(path, state) {
  if (state.integrityError) throw new Error(state.integrityError);
  writeProtectedJson(path, { pins: state.pins ?? {}, pending: state.pending ?? {} });
}

export function updateState(path, mutate) {
  mkdirSync(dirname(path), { recursive: true });
  const release = acquireLogLock(path);
  try {
    const state = loadState(path);
    if (state.integrityError) throw new Error(state.integrityError);
    const result = mutate(state);
    if (result !== false) saveState(path, state);
    return result;
  } finally { release(); }
}

export function findPin(state, name) {
  if (state.integrityError) return { integrityError: state.integrityError };
  return state.pins?.[name] ?? {};
}

export function setPin(state, name, hash) {
  if (typeof name !== 'string' || !name || name === '__proto__' || name === 'constructor' || name === 'prototype') throw new Error('Invalid channel name');
  state.pins = state.pins ?? {};
  state.pins[name] = { hash, approvedAt: new Date().toISOString() };
  if (state.pending) delete state.pending[name];
}

// "Review before use": the proxy records the tool surface it OBSERVED for a
// channel that has not been approved yet, so a human can approve exactly what
// is on the wire instead of re-running the server somewhere else.
export function setPending(state, name, hash, count) {
  if (typeof name !== 'string' || !name || name === '__proto__' || name === 'constructor' || name === 'prototype') throw new Error('Invalid channel name');
  state.pending = state.pending ?? {};
  const prev = state.pending[name];
  if (prev && prev.hash === hash) return false;
  state.pending[name] = { hash, count, seenAt: new Date().toISOString() };
  return true;
}

export function pendingOf(state, name) {
  return state.pending?.[name] ?? null;
}

// Promote an observed surface to approved. Refuses if the observation has since
// changed, so an approval can never bless a surface nobody looked at.
export function promotePending(state, name, hash) {
  const pending = state.pending?.[name];
  if (!pending) return false;
  if (hash && pending.hash !== hash) return false;
  setPin(state, name, pending.hash);
  return true;
}
