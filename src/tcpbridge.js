import { createServer, connect } from 'node:net';
import { createNullFrameParser, summarizeExecute, codeGist } from './nulldelimited.js';
import { resolvePeer, imageAllowed } from './peers.js';
import { log } from './log.js';

// Audit-only relay for raw-TCP MCP bridges (e.g. Blender's MCP add-on).
//
// WHAT THIS IS: a listening socket that a client points at instead of the
// original port. Bytes are forwarded VERBATIM in both directions, and each
// NUL-delimited JSON request is recorded. It is a mirror, not a gate.
//
// WHAT THIS DELIBERATELY IS NOT:
//   - it never blocks, edits, delays or re-frames anything
//   - it never touches the upstream program's settings or files
//   - if parsing a frame fails, the bytes still flow through untouched
//
// `auditOnly` is not a flag to be turned off later by accident: enforcement for
// this transport is a separate, deliberate design step, because here the
// protocol itself IS arbitrary code execution and a wrong rule would silently
// break someone's work.

const CODE_LOG_LIMIT = 64 * 1024;

export function createTcpBridge({ name, listen, upstream, allowlist = [], protect = false }) {
  const server = createServer((client) => {
    // Identify who opened this connection. The protocol cannot carry a
    // credential, so the process on the other end IS the authentication.
    resolvePeer({ remoteHost: client.remoteAddress, remotePort: client.remotePort, localPort: listen.port })
      .then((peer) => {
        if (!peer) {
          log('info', 'bridge-peer-unknown', { name, remote: client.remoteAddress + ':' + client.remotePort });
          return;
        }
        const allowed = imageAllowed(peer.image, allowlist);
        log(allowed ? 'info' : 'critical', allowed ? 'bridge-peer' : 'bridge-unexpected-peer', {
          name,
          pid: peer.pid,
          image: peer.image,
          allowlist,
        });
        if (!allowed && protect) {
          log('critical', 'bridge-refused', { name, pid: peer.pid, image: peer.image });
          try { client.destroy(); } catch { /* ignore */ }
        }
      })
      .catch(() => { });

    const upstreamSocket = connect({ host: upstream.host, port: upstream.port });
    let connected = false;
    const queue = [];

    const observe = createNullFrameParser(
      (msg) => {
        const entry = { name, transport: 'tcp-bridge', type: msg?.type ?? null };
        if (typeof msg?.code === 'string') {
          const summary = summarizeExecute(msg.code);
          entry.codeBytes = summary.bytes;
          entry.codeLines = summary.lines;
          entry.risky = summary.risky;
          entry.gist = codeGist(msg.code);
          entry.code = msg.code.slice(0, CODE_LOG_LIMIT);
          if (summary.bytes > CODE_LOG_LIMIT) entry.codeTruncated = true;
        }
        log('info', 'activity', entry);
      },
      {
        onError: (err, frame) =>
          log('warn', 'bridge-parse-error', { name, error: String(err), sample: String(frame).slice(0, 160) }),
      },
    );

    upstreamSocket.on('connect', () => {
      connected = true;
      for (const chunk of queue) upstreamSocket.write(chunk);
      queue.length = 0;
    });
    upstreamSocket.on('error', (err) => {
      log('warn', 'bridge-upstream-error', { name, error: String(err) });
      try { client.destroy(); } catch { /* ignore */ }
    });
    upstreamSocket.on('close', () => {
      try { client.end(); } catch { /* ignore */ }
    });
    upstreamSocket.on('data', (chunk) => {
      try { client.write(chunk); } catch { /* ignore */ }
    });

    client.on('data', (chunk) => {
      // Observe, then forward the ORIGINAL bytes. Order matters: observation
      // must never be able to alter what the peer receives.
      observe(chunk);
      if (connected) upstreamSocket.write(chunk);
      else queue.push(chunk);
    });
    client.on('error', () => {
      try { upstreamSocket.destroy(); } catch { /* ignore */ }
    });
    client.on('close', () => {
      try { upstreamSocket.end(); } catch { /* ignore */ }
    });
  });

  server.on('error', (err) => log('critical', 'bridge-error', { name, error: String(err) }));
  server.listen(listen.port, listen.host, () => {
    log('info', 'bridge-listening', { name, listen, upstream, mode: 'audit-only' });
  });
  return server;
}
