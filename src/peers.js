import { execFile } from 'node:child_process';

// Authenticating the PEER PROCESS, not the message.
//
// The Blender bridge's wire protocol is `{"type":"execute","code":"..."}` over a
// raw socket: there is nowhere to put a credential, and we do not control its
// client. So message-level authentication is impossible without changing someone
// else's program. What we CAN do is identify which local process opened the
// connection, and refuse to serve an unexpected one. That is a real control:
// it is the difference between "any process on this machine can run Python in
// Blender" and "only the processes you named can".
//
// The parsers below are pure so they can be tested against real command output.

// Windows `netstat -ano` rows, e.g.
//   TCP    127.0.0.1:9877    127.0.0.1:51234    ESTABLISHED    12345
export function parseNetstat(text, localPort = null) {
  const rows = [];
  for (const line of String(text).split(/\r?\n/)) {
    const m = /^\s*TCP\s+(\S+):(\d+)\s+(\S+):(\d+)\s+(\S+)\s+(\d+)\s*$/.exec(line);
    if (!m) continue;
    const [, , localPortStr, remoteHost, remotePortStr, state, pidStr] = m;
    const row = {
      localPort: Number(localPortStr),
      remoteHost,
      remotePort: Number(remotePortStr),
      state,
      pid: Number(pidStr),
    };
    if (localPort !== null && row.localPort !== localPort) continue;
    rows.push(row);
  }
  return rows;
}

export function isLoopbackHost(host) {
  const h = String(host ?? '');
  return h.startsWith('127.') || h === '::1' || h === '[::1]' || h === 'localhost';
}

// `tasklist /FI "PID eq N" /FO CSV /NH` -> "blender.exe","1234","Console","1","1,234 K"
export function parseTasklistCsv(text) {
  const m = /"([^"]+)","(\d+)"/.exec(String(text));
  return m ? { image: m[1], pid: Number(m[2]) } : null;
}

export function basenameOf(image) {
  const parts = String(image ?? '').split(/[\\/]/);
  return parts[parts.length - 1];
}

// Case-insensitive match on the file name, with or without ".exe". An empty
// allowlist means "do not restrict" (audit-only default).
export function imageAllowed(image, allowlist) {
  if (!allowlist || allowlist.length === 0) return true;
  const base = basenameOf(image).toLowerCase();
  if (!base) return false;
  const bare = base.replace(/\.exe$/, '');
  return allowlist.some((entry) => {
    const e = basenameOf(entry).toLowerCase();
    return e === base || e.replace(/\.exe$/, '') === bare;
  });
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => {
      if (err) reject(err);
      else resolve(String(stdout));
    });
  });
}

// Best-effort: who owns the other end of this loopback connection?
export async function resolvePeer({ remoteHost, remotePort, localPort }) {
  if (process.platform !== 'win32') return null;
  try {
    const table = parseNetstat(await run('netstat', ['-ano']), localPort)
      .filter((r) => r.remotePort === remotePort && isLoopbackHost(r.remoteHost));
    if (table.length === 0) return null;
    const pid = table[0].pid;
    const info = parseTasklistCsv(await run('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH']));
    return { pid, image: info?.image ?? null, remoteHost, remotePort };
  } catch {
    return null;
  }
}
