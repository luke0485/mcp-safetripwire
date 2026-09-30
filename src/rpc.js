import { StringDecoder } from 'node:string_decoder';

// Line-delimited JSON-RPC 2.0 framing for the MCP stdio transport.
//
// The MCP stdio transport delimits messages with '\n' (there are no
// Content-Length headers, unlike LSP). JSON.stringify never emits a raw
// newline inside a string, so one message == exactly one line.
//
// Everything here is transport-level and semantic-free: we never try to
// interpret intent, only to frame bytes correctly.

export function encode(msg) {
  return JSON.stringify(msg) + '\n';
}

// maxLineBytes guards against a peer that never sends a newline: without it
// the buffer would grow without bound.
export function createLineDecoder(onMessage, { onError, maxLineBytes = 64 * 1024 * 1024 } = {}) {
  let buffer = '';
  const decoder = new StringDecoder('utf8');
  return function push(chunk) {
    buffer += Buffer.isBuffer(chunk) ? decoder.write(chunk) : chunk;
    let idx;
    while ((idx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      if (line.trim() === '') continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch (err) {
        onError?.(err, line);
        continue;
      }
      onMessage(msg);
    }
    if (buffer.length > maxLineBytes) {
      onError?.(new Error(`line exceeded ${maxLineBytes} bytes without a newline; dropping buffer`), buffer.slice(0, 200));
      buffer = '';
    }
  };
}
