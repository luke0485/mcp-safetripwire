import { spawn } from 'node:child_process';
import { encode, createLineDecoder } from './rpc.js';
import { killTree } from './kill.js';

const CLIENT_INFO = { name: 'mcp-tripwire', version: '0.1.0' };
const PROTOCOL_VERSION = '2025-06-18';

// One-shot, non-interactive capture: spawn a server, complete the MCP
// handshake, pull tools/list, and exit. This is what makes `scan` and
// `approve` useful before the user commits to running everything through the
// broker: audit an MCP server WITHOUT handing it a live agent.
export function captureTools({ command, args, timeoutMs = 20000 }) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(command, args, { stdio: ['pipe', 'pipe', 'inherit'], windowsHide: true });
    } catch (err) {
      return reject(err);
    }

    let settled = false;
    const finish = (err, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      killTree(child);
      err ? reject(err) : resolve(value);
    };

    const timer = setTimeout(
      () => finish(new Error(`timed out after ${timeoutMs}ms waiting for tools/list (is the server a stdio MCP server?)`)),
      timeoutMs,
    );

    let serverInfo = null;
    let capabilities = null;
    let protocolVersion = null;

    const onLine = createLineDecoder((msg) => {
      if (msg.id === 1) {
        if (msg.error) return finish(new Error(`initialize failed: ${JSON.stringify(msg.error)}`));
        serverInfo = msg.result?.serverInfo ?? null;
        capabilities = msg.result?.capabilities ?? null;
        protocolVersion = msg.result?.protocolVersion ?? null;
        child.stdin.write(encode({ jsonrpc: '2.0', method: 'notifications/initialized' }));
        child.stdin.write(encode({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }));
      } else if (msg.id === 2) {
        if (msg.error) return finish(new Error(`tools/list failed: ${JSON.stringify(msg.error)}`));
        finish(null, { tools: msg.result?.tools ?? [], serverInfo, capabilities, protocolVersion });
      }
    });

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', onLine);
    child.on('error', (err) => finish(err));

    child.stdin.write(encode({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: CLIENT_INFO },
    }));
  });
}
