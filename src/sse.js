import { StringDecoder } from 'node:string_decoder';

// Pure Server-Sent Events framing, used by the Streamable HTTP and legacy
// HTTP+SSE transports. No sockets here: parsing and encoding only, so the
// logic that decides what crosses the wire is unit-testable in isolation.

// SSE event blocks end at a blank line, which may be \n\n, \r\n\r\n or \r\r.
// CR and LF can arrive in different network chunks, so we must NOT normalise
// line endings as chunks arrive: rewriting a lone \r into \n would manufacture
// a phantom blank line and cut an event in half.
function findEventSeparator(buffer) {
  const candidates = [];
  const lf = buffer.indexOf('\n\n');
  if (lf !== -1) candidates.push({ index: lf, length: 2 });
  const crlf = buffer.indexOf('\r\n\r\n');
  if (crlf !== -1) candidates.push({ index: crlf, length: 4 });
  const cr = buffer.indexOf('\r\r');
  if (cr !== -1) candidates.push({ index: cr, length: 2 });
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.index - b.index);
  return candidates[0];
}

export function createSseParser(onEvent, { onError } = {}) {
  let buffer = '';
  const decoder = new StringDecoder('utf8');
  return function push(chunk) {
    buffer += Buffer.isBuffer(chunk) ? decoder.write(chunk) : String(chunk);
    for (;;) {
      const sep = findEventSeparator(buffer);
      if (!sep) break;
      const block = buffer.slice(0, sep.index);
      buffer = buffer.slice(sep.index + sep.length);
      let ev;
      try {
        ev = parseEventBlock(block);
      } catch (err) {
        onError?.(err, block);
        continue;
      }
      if (ev) onEvent(ev);
    }
  };
}

export function parseEventBlock(block) {
  const ev = { event: null, data: '', id: null };
  let sawField = false;
  for (const line of String(block).split(/\r\n|\r|\n/)) {
    if (line === '' || line.startsWith(':')) continue; // comment / keep-alive
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'event') { ev.event = value; sawField = true; }
    else if (field === 'data') { ev.data += (ev.data ? '\n' : '') + value; sawField = true; }
    else if (field === 'id') { ev.id = value; sawField = true; }
    else if (field === 'retry') sawField = true;
  }
  return sawField ? ev : null;
}

export function encodeSseEvent({ event, data, id }) {
  let out = '';
  if (id !== null && id !== undefined) out += `id: ${id}\n`;
  if (event) out += `event: ${event}\n`;
  for (const line of String(data ?? '').split('\n')) out += `data: ${line}\n`;
  return out + '\n';
}

// An SSE data payload carrying an MCP message is a JSON object; anything else
// (e.g. the legacy `endpoint` event) is not, and must pass through untouched.
export function tryParseJsonRpc(data) {
  if (typeof data !== 'string' || data === '') return null;
  try {
    const parsed = JSON.parse(data);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function isJsonRpc(msg) {
  return Boolean(msg) && typeof msg === 'object' && (msg.jsonrpc === '2.0' || msg.method !== undefined || msg.result !== undefined || msg.error !== undefined);
}
