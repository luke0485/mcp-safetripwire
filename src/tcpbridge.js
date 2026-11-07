import { createServer, connect } from 'node:net';
import { createNullFrameParser, summarizeExecute, codeGist } from './nulldelimited.js';
import { resolvePeer, imageAllowed, isLoopbackHost } from './peers.js';
import { log } from './log.js';

// Audit-only relay for raw-TCP MCP bridges (e.g. Blender's MCP add-on).
//
// WHAT THIS IS: a listening socket that a client points at instead of the
// original port. Bytes are forwarded VERBATIM in both directions, and each
// NUL-delimited JSON request is recorded. It is a mirror, not a gate.
//
// WHAT THIS DELIBERATELY IS NOT:
//   - it never edits, delays or re-frames anything
//   - it never touches the upstream program's settings or files
//   - if parsing a frame fails, the bytes still flow through untouched
//
// `--protect` is a separate, narrower control: identify the connecting process
// before any bytes are forwarded and refuse a process outside the allowlist.
// It fails closed when the process cannot be identified, and it is not a
// substitute for message-level authentication.

const CODE_LOG_LIMIT = 4096;
const MAX_CONNECTIONS = 128;
const MAX_QUEUE_BYTES = 4 * 1024 * 1024;
const PEER_ATTEMPTS = 3;
const PEER_RETRY_MS = 100;

async function resolvePeerWithRetry(args) {
  for (let attempt = 0; attempt < PEER_ATTEMPTS; attempt++) {
    const peer = await resolvePeer(args);
    if (peer) return peer;
    if (attempt < PEER_ATTEMPTS - 1) await new Promise((resolve) => setTimeout(resolve, PEER_RETRY_MS));
  }
  return null;
}

export function createTcpBridge({ name, listen, upstream, allowlist = [], protect = false, logCode = false, onFatal }) {
  if (!isLoopbackHost(listen.host)) throw new Error('TCP bridge must listen on loopback');
  if (protect && allowlist.length === 0) throw new Error('Protect mode requires at least one allowed process');

  let connections = 0;
  const server = createServer((client) => {
    if (connections >= MAX_CONNECTIONS) {
      log('warn', 'bridge-error', { name, error: 'connection limit reached' });
      try { client.destroy(); } catch { /* ignore */ }
      return;
    }
    connections++;
    client.once('close', () => { connections--; });

    const upstreamSocket = connect({ host: upstream.host, port: upstream.port });
    let connected = false;
    const queue = [];
    let queuedBytes = 0;
    let clientPaused = false;
    let upstreamPaused = false;
    let closed = false;

    const shutdown = () => {
      if (closed) return;
      closed = true;
      try { client.destroy(); } catch { /* ignore */ }
      try { upstreamSocket.destroy(); } catch { /* ignore */ }
    };

    // Peer identification is asynchronous. Pause the socket first when
    // enforcing: otherwise a hostile process could send a complete `execute`
    // payload before the allowlist decision arrives.
    if (protect) client.pause();

    resolvePeerWithRetry({ remoteHost: client.remoteAddress, remotePort: client.remotePort, localPort: listen.port })
      .then((peer) => {
        if (!peer) {
          log('info', 'bridge-peer-unknown', { name, remote: client.remoteAddress + ':' + client.remotePort });
          if (protect) {
            log('critical', 'bridge-refused', { name, reason: 'peer-unidentified' });
            shutdown();
            return;
          }
          client.resume();
          return;
        }
        const allowed = imageAllowed(peer.image, allowlist);
        log(allowed ? 'info' : 'critical', allowed ? 'bridge-peer' : 'bridge-unexpected-peer', {
          name,
          pid: peer.pid,
          image: peer.image,
          allowlist,
        });
        if (protect && !allowed) {
          log('critical', 'bridge-refused', { name, pid: peer.pid, image: peer.image });
          shutdown();
          return;
        }
        client.resume();
      })
      .catch(() => {
        if (protect) {
          log('critical', 'bridge-refused', { name, reason: 'peer-check-failed' });
          shutdown();
        } else {
          client.resume();
        }
      });

    const observe = createNullFrameParser(
      (msg) => {
        const entry = { name, transport: 'tcp-bridge', type: msg?.type ?? null };
        if (typeof msg?.code === 'string') {
          const summary = summarizeExecute(msg.code);
          entry.codeBytes = summary.bytes;
          entry.codeLines = summary.lines;
          entry.risky = summary.risky;
          entry.gist = codeGist(msg.code);
          // Raw code may contain credentials; only store it when the operator
          // explicitly asks for it.
          if (logCode) {
            entry.code = msg.code.slice(0, CODE_LOG_LIMIT);
            if (summary.bytes > CODE_LOG_LIMIT) entry.codeTruncated = true;
          }
        }
        log('info', 'activity', entry);
      },
      {
        onError: (err, frame) =>
          log('warn', 'bridge-parse-error', { name, error: String(err), sample: String(frame).slice(0, 160) }),
      },
    );

    const pauseClient = () => {
      if (clientPaused || closed) return;
      clientPaused = true;
      client.pause();
    };
    const resumeClient = () => {
      if (!clientPaused || closed) return;
      clientPaused = false;
      client.resume();
    };

    upstreamSocket.on('connect', () => {
      connected = true;
      let backpressured = false;
      for (const chunk of queue) {
        if (!upstreamSocket.write(chunk)) backpressured = true;
      }
      queue.length = 0;
      queuedBytes = 0;
      if (backpressured) {
        pauseClient();
        upstreamSocket.once('drain', resumeClient);
      }
    });
    upstreamSocket.on('error', (err) => {
      log('warn', 'bridge-upstream-error', { name, error: String(err) });
      shutdown();
    });
    upstreamSocket.on('close', () => {
      try { client.end(); } catch { /* ignore */ }
    });
    upstreamSocket.on('data', (chunk) => {
      if (closed) return;
      try {
        if (!client.write(chunk) && !upstreamPaused) {
          upstreamPaused = true;
          upstreamSocket.pause();
          client.once('drain', () => { upstreamPaused = false; upstreamSocket.resume(); });
        }
      } catch { /* peer closed */ }
    });

    client.on('data', (chunk) => {
      // Observe, then forward the ORIGINAL bytes. Order matters: observation
      // must never be able to alter what the peer receives.
      observe(chunk);
      if (closed) return;
      if (connected) {
        if (!upstreamSocket.write(chunk)) {
          pauseClient();
          upstreamSocket.once('drain', resumeClient);
        }
        return;
      }
      queuedBytes += chunk.length;
      if (queuedBytes > MAX_QUEUE_BYTES) {
        log('warn', 'bridge-error', { name, error: 'upstream queue limit reached' });
        shutdown();
        return;
      }
      queue.push(chunk);
    });
    client.on('error', () => {
      try { upstreamSocket.destroy(); } catch { /* ignore */ }
    });
    client.on('close', () => {
      try { upstreamSocket.end(); } catch { /* ignore */ }
    });
  });

  server.maxConnections = MAX_CONNECTIONS;
  server.on('error', (err) => {
    log('critical', 'bridge-error', { name, error: String(err) });
    onFatal?.(err);
  });
  server.listen(listen.port, listen.host, () => {
    log('info', 'bridge-listening', { name, listen, upstream, mode: protect ? 'protect' : 'audit-only' });
  });
  return server;
}
