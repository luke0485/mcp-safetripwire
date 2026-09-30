// Null-byte-delimited JSON framing.
//
// Some MCP bridges (notably Blender's official MCP add-on) do not use JSON-RPC
// over stdio/HTTP. They open a raw TCP socket and exchange JSON objects
// terminated by a NUL byte. This module understands that framing so the bridge
// can OBSERVE it. It never re-frames: the relay always forwards the original
// bytes, so parsing failures cannot break the connection.

// Binary-safe: multi-byte UTF-8 characters may be split across TCP reads, so we
// accumulate Buffers and only decode on a NUL boundary.
export function createNullFrameParser(onMessage, { onError, maxFrameBytes = 16 * 1024 * 1024 } = {}) {
  let pending = Buffer.alloc(0);
  return function push(chunk) {
    pending = Buffer.concat([pending, Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), 'utf8')]);
    let idx;
    while ((idx = pending.indexOf(0)) !== -1) {
      const frame = pending.subarray(0, idx).toString('utf8');
      pending = pending.subarray(idx + 1);
      if (frame.trim() === '') continue;
      let msg;
      try {
        msg = JSON.parse(frame);
      } catch (err) {
        onError?.(err, frame);
        continue;
      }
      onMessage(msg);
    }
    if (pending.length > maxFrameBytes) {
      onError?.(new Error(`frame exceeded ${maxFrameBytes} bytes without a NUL terminator`), pending.subarray(0, 120).toString('utf8'));
      pending = Buffer.alloc(0);
    }
  };
}

export function encodeNullJson(obj) {
  return Buffer.from(JSON.stringify(obj) + '\0', 'utf8');
}

// Lexical, advisory tags for an executed payload. This is context for a human,
// not a verdict — the same philosophy as risk.js.
const RISKY_PATTERNS = [
  [/(^|[^\w])import\s+os\b|\bos\.[a-z_]+/i, 'system'],
  [/\bsubprocess\b|\bPopen\b|\bexec\(|\beval\(|__import__|\bos\.system\b/i, 'command-execution'],
  [/\bopen\s*\(|\bPath\s*\(|\bshutil\b|\bos\.remove\b|\bos\.rename\b/i, 'files'],
  [/\bsocket\b|\brequests\b|\burllib\b|\burlopen\b|\bhttp\.client\b|\bfetch\b/i, 'network'],
  [/\.ssh\b|id_rsa|\bcredential|\bpassword|\btoken\b|api[ _-]?key|\bsecret\b/i, 'credentials'],
  [/\bbpy\.|\bblender\b/i, 'blender-api'],
];

export function summarizeExecute(code) {
  const text = String(code ?? '');
  const risky = [];
  for (const [re, tag] of RISKY_PATTERNS) {
    if (re.test(text)) risky.push(tag);
  }
  return {
    bytes: Buffer.byteLength(text, 'utf8'),
    lines: text === '' ? 0 : text.split('\n').length,
    risky: [...new Set(risky)],
  };
}

// A short, human-readable gist of the payload for the activity list.
export function codeGist(code, max = 120) {
  const text = String(code ?? '').replace(/\s+/g, ' ').trim();
  return text.length > max ? text.slice(0, max) + '…' : text;
}
