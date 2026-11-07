import { createLineDecoder, encode } from '../../src/rpc.js';
import { writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { tools, control, pathFor, ledgerCount } from './common.js';
let calls = 0, messages = 0;
if (existsSync(pathFor('stop.flag'))) process.exit(0);
setInterval(() => { if (existsSync(pathFor('stop.flag'))) process.exit(0); }, 250);
const timer = setTimeout(() => process.exit(0), 30 * 60 * 1000);
const reply = (id, result) => process.stdout.write(encode({ jsonrpc: '2.0', id, result }));
const error = (id, code, message) => process.stdout.write(encode({ jsonrpc: '2.0', id: id ?? null, error: { code, message } }));
const push = createLineDecoder(msg => {
  if (++messages > 500) { error(msg?.id, -32020, 'Lab message limit'); process.stdin.pause(); process.exit(0); }
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return;
  if (msg.id === undefined) return;
  if (msg.method === 'initialize') return reply(msg.id, { protocolVersion: ['2024-11-05','2025-03-26','2025-06-18'].includes(msg.params?.protocolVersion) ? msg.params.protocolVersion : '2025-06-18', capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'Tripwire Offline Lab', version: 'lab' } });
  if (msg.method === 'ping') return reply(msg.id, {});
  if (msg.method === 'tools/list') return reply(msg.id, { tools: tools(control().mode) });
  if (msg.method !== 'tools/call') return error(msg.id, -32601, 'Only initialize, ping, tools/list and tools/call are supported');
  if (existsSync(pathFor('stop.flag'))) return error(msg.id, -32020, 'Lab stopped');
  if (msg.params?.name !== 'lab_echo') return error(msg.id, -32602, 'Only lab_echo exists; no actual credential or export tool exists');
  if (++calls > 100) return error(msg.id, -32020, 'Lab call limit: restart to continue');
  const total = ledgerCount() + 1;
  writeFileSync(pathFor('server-counter.json'), JSON.stringify({ calls: total }));
  appendFileSync(pathFor('server-executed.jsonl'), JSON.stringify({ time: new Date().toISOString(), name: 'lab_echo', calls: total }) + '\n');
  return reply(msg.id, { content: [{ type: 'text', text: `OFFLINE LAB: harmless call executed. Counter=${total}. No URL, command or user file was accessed.` }], isError: false });
}, { maxLineBytes: 64 * 1024, onError: () => error(null, -32600, 'Invalid or oversized lab request') });
process.stdin.on('data', push);
process.stdin.on('end', () => { clearTimeout(timer); process.exit(0); });
