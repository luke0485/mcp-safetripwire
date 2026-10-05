import { spawn } from 'node:child_process';
import { encode, createLineDecoder } from './rpc.js';
import { log } from './log.js';
import { killTree } from './kill.js';
import { isJsonRpc } from './sse.js';

// The transparent stdio proxy: the heart of host-agnostic interception.
//
// The host is configured to launch THIS process instead of the real MCP
// server. We spawn the real server as our child and pump newline-delimited
// JSON-RPC in both directions, inspecting every message in flight. The host
// never knows the difference, and we never need OS privileges or per-host
// plugins to sit in the middle.
//
//   host  --stdio-->  [ mcp-safetripwire ]  --stdio-->  real MCP server
//
// `onHostMessage` may veto a message (return { forward: false, error }).
// `onServerMessage` observes/mutates responses; it is told which method the
// response belongs to.

export function createProxy({ name, command, args, onHostMessage, onServerMessage, onExit }) {
  let child;
  try {
    child = spawn(command, args, { stdio: ['pipe', 'pipe', 'inherit'], windowsHide: true });
  } catch (err) {
    log('critical', 'spawn-failed', { name, command, error: String(err) });
    process.exit(127);
  }

  // Correlate host->server requests with their responses, so a response can be
  // attributed to the method that caused it (e.g. tools/list).
  const pending = new Map();
  let shuttingDown = false;
  let stdinPaused = false;
  let stdoutPaused = false;

  child.on('error', (err) => {
    log('critical', 'server-spawn-error', {
      name,
      command,
      error: String(err),
      hint: 'command not found, not executable, or missing a runtime',
    });
    process.exit(127);
  });

  // Backpressure-aware writes. Without the guards, repeated pause/drain
  // registration can stack handlers; without backpressure at all, a large
  // resource payload can buffer without bound while the far side is slow.
  const writeUpstream = (msg) => {
    let ok = true;
    try {
      ok = child.stdin.write(encode(msg));
    } catch (err) {
      log('warn', 'upstream-write-failed', { name, error: String(err) });
      return;
    }
    if (!ok && !stdinPaused) {
      stdinPaused = true;
      process.stdin.pause();
      child.stdin.once('drain', () => {
        stdinPaused = false;
        process.stdin.resume();
      });
    }
  };

  const writeDownstream = (msg) => {
    let ok = true;
    try {
      ok = process.stdout.write(encode(msg));
    } catch (err) {
      log('warn', 'downstream-write-failed', { name, error: String(err) });
      return;
    }
    if (!ok && !stdoutPaused) {
      stdoutPaused = true;
      child.stdout.pause();
      process.stdout.once('drain', () => {
        stdoutPaused = false;
        child.stdout.resume();
      });
    }
  };

  // An inspector that throws must not take the proxy down mid-session, and
  // must not silently forward an unchecked message: fail closed and log.
  const safeClient = (msg) => {
    try {
      return { verdict: onHostMessage?.(msg) ?? { forward: true } };
    } catch (err) {
      log('critical', 'inspector-error', { name, side: 'client', error: String(err) });
      return { verdict: { forward: false } };
    }
  };
  const safeServer = (msg, method) => {
    try {
      onServerMessage?.(msg, method);
    } catch (err) {
      log('critical', 'inspector-error', { name, side: 'server', error: String(err) });
      delete msg.result;
      msg.error = { code: -32603, message: 'mcp-safetripwire inspection failed' };
    }
  };

  const toChild = createLineDecoder(
    (msg) => {
      if (!isJsonRpc(msg)) {
        writeDownstream({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid JSON-RPC message' } });
        return;
      }
      const isRequest = Boolean(msg) && msg.id !== undefined && typeof msg.method === 'string';
      if (isRequest && (pending.has(JSON.stringify(msg.id)) || pending.size >= 256)) {
        writeDownstream({ jsonrpc: '2.0', id: msg.id, error: { code: -32010, message: 'Duplicate or excessive pending request' } });
        return;
      }
      if (isRequest) pending.set(JSON.stringify(msg.id), msg.method);

      const { verdict } = safeClient(msg);
      if (verdict.forward === false) {
        // Never leave a stale correlation entry for a message we did not send.
        if (isRequest) pending.delete(JSON.stringify(msg.id));
        if (msg && msg.id !== undefined) {
          writeDownstream(verdict.error ?? {
            jsonrpc: '2.0',
            id: msg.id,
            error: { code: -32001, message: 'Blocked by mcp-safetripwire' },
          });
        }
        return;
      }
      writeUpstream(msg);
    },
    { onError: () => log('warn', 'host-parse-error', { name, error: 'Malformed or oversized JSON-RPC message' }) },
  );

  const toHost = createLineDecoder(
    (msg) => {
      if (!isJsonRpc(msg)) { log('warn', 'server-parse-error', { name, error: 'Invalid JSON-RPC message' }); return; }
      let method;
      if (msg && msg.id !== undefined && msg.method === undefined) {
        method = pending.get(JSON.stringify(msg.id));
        pending.delete(JSON.stringify(msg.id));
      }
      safeServer(msg, method);
      writeDownstream(msg);
    },
    { onError: () => log('warn', 'server-parse-error', { name, error: 'Malformed or oversized JSON-RPC message' }) },
  );

  process.stdin.setEncoding('utf8');
  child.stdout.setEncoding('utf8');
  process.stdin.on('data', toChild);
  child.stdout.on('data', toHost);

  process.stdin.on('end', () => {
    try { child.stdin.end(); } catch { /* ignore */ }
  });

  child.on('exit', (code, signal) => {
    log('info', 'server-exit', { name, code, signal });
    process.exitCode = code ?? 0;
    onExit?.();
    // Let stdout drain before exiting so tail responses are not truncated,
    // but do not hang forever if the host keeps its end open.
    const finish = () => process.exit(process.exitCode);
    if (process.stdout.writableLength === 0) setImmediate(finish);
    else process.stdout.once('drain', finish);
    setTimeout(finish, 250).unref?.();
  });

  // Forward termination to the child (and its descendants) instead of
  // orphaning a live MCP server.
  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, () => {
      if (shuttingDown) return;
      shuttingDown = true;
      log('info', 'signal', { name, signal: sig });
      killTree(child, sig);
      setTimeout(() => process.exit(130), 500).unref?.();
    });
  }

  return child;
}
