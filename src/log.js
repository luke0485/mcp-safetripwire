import { appendFileSync, mkdirSync, statSync, renameSync, rmSync, readFileSync, openSync, readSync, closeSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname } from 'node:path';

// Audit logging. Two rules that matter for a stdio proxy:
//   1. Human-readable output goes to stderr. stdout belongs to JSON-RPC and
//      must never be polluted, or the host fails to parse the stream.
//   2. Every record also goes to an append-only JSONL file, so there is a
//      durable audit trail even when nobody is watching the terminal.

// `silent` exists so tests and embedded use can suppress console output while
// the JSONL audit trail still records everything.
const LEVELS = { debug: 10, info: 20, warn: 30, critical: 40, silent: 100 };
const PREFIX = 'mcp-tripwire';

// Keep the audit trail bounded. Without this it grows without limit, which is
// both a disk problem and a slow read for the console's activity view.
const MAX_LOG_BYTES = 5 * 1024 * 1024;
const ROTATE_CHECK_EVERY = 500;

// Each record carries a link to the previous one, so editing, deleting or
// reordering a line is detectable. Without this, an audit trail cannot be used
// as evidence -- anyone who can write the file can rewrite history.
const GENESIS = 'genesis';
let lastHash = GENESIS;

function chainHash(prev, body) {
  return createHash('sha256').update(prev + JSON.stringify(body)).digest('hex');
}

// Resume the chain across process restarts: read the last record's hash.
function seedFromFile(path) {
  lastHash = GENESIS;
  try {
    const size = statSync(path).size;
    const start = Math.max(0, size - 65536);
    const buffer = Buffer.alloc(size - start);
    const fd = openSync(path, 'r');
    try { readSync(fd, buffer, 0, buffer.length, start); } finally { closeSync(fd); }
    let text = buffer.toString('utf8');
    if (start > 0) {
      const newline = text.indexOf('\n');
      // A single oversized record is unusual, but must still seed correctly.
      text = newline < 0 ? readFileSync(path, 'utf8') : text.slice(newline + 1);
    }
    const lines = text.split(String.fromCharCode(10)).filter((l) => l.trim() !== '');
    if (lines.length === 0) return;
    const last = JSON.parse(lines[lines.length - 1]);
    if (last && last.chain && typeof last.chain.hash === 'string') lastHash = last.chain.hash;
  } catch {
    /* fresh file, or unreadable: start a new chain */
  }
}

// Console and brokers append to the same file. A cached per-process head
// forks the chain even when nobody modified a record. Serialize the append
// and read the current head while holding this cross-process lock.
const lockWait = new Int32Array(new SharedArrayBuffer(4));
export function acquireLogLock(path) {
  const lock = path + '.lock';
  for (let attempt = 0; attempt < 500; attempt++) {
    try {
      const fd = openSync(lock, 'wx');
      try { writeFileSync(fd, String(process.pid)); } catch (err) {
        closeSync(fd); rmSync(lock, { force: true }); throw err;
      }
      closeSync(fd);
      return () => rmSync(lock, { force: true });
    } catch (err) {
      if (!['EEXIST', 'EPERM', 'EACCES', 'EBUSY'].includes(err.code)) throw err;
      // Recover only an old lock whose owner is demonstrably no longer alive.
      let recoveryFd;
      try {
        if (Date.now() - statSync(lock).mtimeMs > 30000) {
          recoveryFd = openSync(lock + '.recovery', 'wx');
          // Re-read after obtaining exclusive recovery ownership, so two
          // waiters cannot remove a newly acquired writer's lock.
          const pid = Number(readFileSync(lock, 'utf8'));
          if (Date.now() - statSync(lock).mtimeMs > 30000 && Number.isInteger(pid) && pid > 0) {
            try { process.kill(pid, 0); } catch (probe) {
              if (probe.code === 'ESRCH') rmSync(lock, { force: true });
            }
          }
        }
      } catch { /* another writer may have released the lock */ }
      finally {
        if (recoveryFd !== undefined) { closeSync(recoveryFd); rmSync(lock + '.recovery', { force: true }); }
      }
      Atomics.wait(lockWait, 0, 0, 10);
    }
  }
  throw new Error('Audit append lock timed out');
}

export function verifyChain(records) {
  const list = records ?? [];
  // Records written before chaining existed carry no link. Skip that legacy
  // prefix instead of reporting the whole trail as tampered -- otherwise every
  // upgrade would greet the user with a critical alert about old data.
  let start = 0;
  while (start < list.length && !(list[start] && list[start].chain)) start += 1;
  if (start === list.length) return { ok: true, count: 0, legacy: list.length, head: null };
  let prev = null;
  for (let i = start; i < list.length; i++) {
    const r = list[i];
    const chain = r && r.chain;
    if (!chain || typeof chain.hash !== 'string' || typeof chain.prev !== 'string') {
      return { ok: false, at: i, reason: 'record carries no chain link' };
    }
    if (prev === null) prev = chain.prev; // anchor at the start of the window
    if (chain.prev !== prev) return { ok: false, at: i, reason: 'previous-hash mismatch: a record was removed or reordered' };
    const { chain: _ignored, ...body } = r;
    if (chainHash(prev, body) !== chain.hash) return { ok: false, at: i, reason: 'content hash mismatch: a record was edited' };
    prev = chain.hash;
  }
  return { ok: true, count: list.length - start, legacy: start, head: prev };
}

export function createAuditMonitor() {
  let lastResult = null;
  return (records) => {
    const check = verifyChain(records);
    const key = check.ok ? 'ok' : JSON.stringify([check.reason, records[check.at]]);
    const changed = key !== lastResult;
    lastResult = key;
    return { check, changed };
  };
}

let logFile = null;
let minConsoleLevel = LEVELS.warn;
let writesSinceCheck = 0;

export function setLogFile(path) {
  if (!path) return;
  try {
    mkdirSync(dirname(path), { recursive: true });
    logFile = path;
    writesSinceCheck = 0;
    seedFromFile(path);
  } catch {
    logFile = null;
  }
}

export function setMinConsoleLevel(level) {
  if (LEVELS[level]) minConsoleLevel = LEVELS[level];
}

// One generation of rotation (audit.jsonl -> audit.jsonl.1). Checking the size
// on every single line would add a syscall to a hot path, so it is amortised.
function rotateIfNeeded() {
  if (!logFile) return;
  try {
    if (statSync(logFile).size <= MAX_LOG_BYTES) return;
    const rotated = `${logFile}.1`;
    try { rmSync(rotated, { force: true }); } catch { /* ignore */ }
    renameSync(logFile, rotated);
  } catch {
    /* no file yet, or a race with another writer: never break logging */
  }
}

export function log(level, event, data = {}) {
  level = auditLevel(level, event, data);
  const rec = { ts: new Date().toISOString(), level, event, ...data };
  if (level === 'debug' || (event === 'static-finding' && data.rule === 'cross-tool-reference')) return rec;
  const weight = LEVELS[level] ?? LEVELS.info;
  if (weight >= minConsoleLevel) {
    process.stderr.write(`[${PREFIX}] ${level.toUpperCase()} ${event} ${JSON.stringify(data)}\n`);
  }
  if (logFile) {
    let releaseLock;
    try {
      releaseLock = acquireLogLock(logFile);
      if (++writesSinceCheck >= ROTATE_CHECK_EVERY) {
        writesSinceCheck = 0;
        rotateIfNeeded();
      }
      seedFromFile(logFile);
      const prev = lastHash;
      const hash = chainHash(prev, rec);
      rec.chain = { prev, hash };
      appendFileSync(logFile, JSON.stringify(rec) + '\n');
      lastHash = hash;
    } catch {
      /* never let logging break the proxy */
    } finally {
      try { releaseLock?.(); } catch { /* best effort cleanup */ }
    }
  }
  return rec;
}

export function auditLevel(level, event, data = {}) {
  if (event === 'static-finding' && data.rule === 'cross-tool-reference') return 'info';
  if (event === 'new-tool-detected') return 'info';
  if (['audit-chain-broken', 'RUG-PULL-SUSPECTED', 'api-error', 'console-error', 'console-port-in-use', 'http-proxy-error', 'inspector-error', 'spawn-failed', 'server-spawn-error', 'bridge-error', 'bridge-unexpected-peer', 'bridge-refused'].includes(event)) return 'warn';
  if (event === 'tools-call' && data.action === 'block') return data.reason === 'critical-static-findings' ? 'critical' : 'warn';
  if (event === 'enforced-block' && data.reason === 'rug-pull') return 'warn';
  return level;
}

export function rebuildAuditChain(records) {
  let prev = GENESIS;
  return records.map(record => {
    const { chain: ignored, ...body } = record;
    const hash = chainHash(prev, body);
    const result = { ...body, chain: { prev, hash } };
    prev = hash;
    return result;
  });
}
