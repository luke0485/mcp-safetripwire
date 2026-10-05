import { evaluateToolsList } from './evaluate.js';
import { decide } from './policy.js';
import { appendDecoys, isDecoy, findCanary } from './deception.js';
import { checkArguments } from './blacklist.js';
import { argKeys, destinationsOf } from './baseline.js';
import { log } from './log.js';
import { loadAdvanced, advancedDecision } from './advanced.js';

// The single enforcement path, shared by every transport.
//
// stdio and HTTP differ only in how bytes move; the DECISION about what is
// allowed to cross must be identical, or a server could be safe over one
// transport and dangerous over another. Keeping this in one place is what
// makes "covers all MCP connection types" true rather than aspirational.

const SENSITIVE_METHODS = new Set(['resources/read', 'prompts/get', 'sampling/createMessage']);

function shortParams(params) {
  if (!params || typeof params !== 'object') return undefined;
  const out = {};
  for (const key of ['name', 'server']) if (typeof params[key] === 'string') out[key] = params[key].slice(0, 256);
  if (params.uri !== undefined) out.hasUri = true;
  if (params.prompt !== undefined) out.hasPrompt = true;
  return Object.keys(out).length ? out : undefined;
}

export function createInspector({ name, getPin, policy, posture, getPosture, getAdvanced = loadAdvanced, transport = 'stdio', recordPending }) {
  // Deception is on by default in protect mode: if you asked for active defence,
  // you get traps. An explicit policy value overrides either way.
  let observedTools = null;
  let invalidManifest = false;
  const currentPosture = () => getPosture?.() ?? posture;
  const deceptionEnabled = (mode) => policy.deception == null ? mode === 'block' : policy.deception === true;

  return {
    // Client -> server. Returns { forward, error? }.
    onClientMessage(msg) {
      if (!msg || typeof msg !== 'object' || Array.isArray(msg) ||
          (msg.method === 'tools/call' && (msg.id === undefined || msg.id === null || typeof msg.params?.name !== 'string' || !msg.params.name ||
            (msg.params.arguments !== undefined && (!msg.params.arguments || typeof msg.params.arguments !== 'object' || Array.isArray(msg.params.arguments)))))) {
        return { forward: false, error: { jsonrpc: '2.0', id: msg?.id ?? null, error: { code: -32600, message: 'Invalid JSON-RPC tool request' } } };
      }
      const posture = currentPosture();
      const deceptionOn = deceptionEnabled(posture);
      if (msg?.method) {
        if (SENSITIVE_METHODS.has(msg.method)) {
          log('info', 'sensitive-request', { name, transport, method: msg.method, params: shortParams(msg.params) });
        } else {
          log('debug', 'request', { name, transport, method: msg.method });
        }
      }
      if (msg?.method === 'tools/call') {
        if (getPin().integrityError) {
          log('warn', 'manifest-state-rejected', { name, transport });
          return { forward: false, error: { jsonrpc: '2.0', id: msg.id ?? null, error: { code: -32008, message: 'mcp-safetripwire: manifest storage integrity check failed' } } };
        }
        const toolName = msg.params?.name;
        const hit = advancedDecision(getAdvanced(), name, toolName, msg.params);
        if (hit) {
          const blocked = hit.enforce && posture === 'block';
          log(blocked ? 'warn' : 'info', blocked ? 'advanced-blocked' : 'advanced-notice', { name, transport, tool: toolName, rule: hit.reason });
          if (blocked) return { forward: false, error: { jsonrpc: '2.0', id: msg.id, error: { code: -32007, message: 'mcp-safetripwire blocked request (' + hit.reason + ')' } } };
        }
        if (deceptionOn && isDecoy(toolName)) {
          log('critical', 'decoy-triggered', {
            name,
            transport,
            tool: toolName,
            note: 'a decoy tool was called; no legitimate workflow reaches it',
          });
          return {
            forward: false,
            error: {
              jsonrpc: '2.0',
              id: msg.id,
              error: { code: -32004, message: `mcp-safetripwire: "${toolName}" is a decoy and was blocked` },
            },
          };
        }
        const argHits = checkArguments(msg.params);
        if (argHits.length > 0) {
          const hit = argHits[0];
          const blocked = posture === 'block';
          log(blocked ? 'critical' : 'warn', blocked ? 'argument-blocked' : 'argument-suspicious', {
            name,
            transport,
            tool: toolName,
            rule: hit.rule,
            detail: hit.detail,
          });
          if (blocked) {
            return {
              forward: false,
              error: {
                jsonrpc: '2.0',
                id: msg.id,
                error: { code: -32006, message: `mcp-safetripwire blocked "${toolName}": argument matched ${hit.rule}` },
              },
            };
          }
        }
        if (deceptionOn && findCanary(JSON.stringify(msg.params ?? {}))) {
          log('critical', 'canary-exfil', {
            name,
            transport,
            tool: toolName,
            note: 'a planted secret appeared in an outbound call',
          });
          return {
            forward: false,
            error: {
              jsonrpc: '2.0',
              id: msg.id,
              error: { code: -32005, message: 'mcp-safetripwire: blocked a call carrying a planted secret' },
            },
          };
        }
        // Reviewed == a surface was approved and pinned for this channel.
        const reviewed = Boolean(getPin().hash);
        let { action, reason } = decide(posture === 'block' ? { ...policy, mode: 'block' } : policy, toolName, { reviewed });
        if (posture === 'block' && reviewed && !observedTools) {
          action = 'block'; reason = 'manifest-not-verified';
        }
        if (posture !== 'warn' && invalidManifest) {
          action = 'block'; reason = 'invalid-manifest';
        }
        if (posture !== 'warn' && observedTools && !observedTools.some(tool => tool.name === toolName)) {
          action = 'block'; reason = 'tool-not-declared';
        }
        // Re-evaluate the observed surface against the current pin and mode.
        // A cached tool name must not bypass a rejected or stripped list.
        if (observedTools && posture !== 'warn') {
          const ev = evaluateToolsList(observedTools, { pinHash: getPin().hash, posture });
          if (ev.action.kind === 'block' || ev.action.tools?.includes(toolName)) {
            action = 'block';
            reason = ev.action.reason ?? 'critical-static-findings';
          }
        }
        // Derived facts only: field names and destination hosts, never values.
        // This is what the behavioural baseline is built from.
        log(action === 'block' ? 'critical' : 'info', 'tools-call', {
          name,
          transport,
          tool: toolName,
          action,
          reason,
          argKeys: argKeys(msg.params),
          destinations: destinationsOf(msg.params),
        });
        if (action === 'block') {
          return {
            forward: false,
            error: {
              jsonrpc: '2.0',
              id: msg.id,
              error: { code: -32001, message: `mcp-safetripwire blocked tool "${toolName}" (${reason})` },
            },
          };
        }
      }
      return { forward: true };
    },

    // Server -> client. Mutates `msg` in place; `method` is the request method
    // this message answers, when known.
    onServerMessage(msg, method) {
      const posture = currentPosture();
      const deceptionOn = deceptionEnabled(posture);
      if (msg?.method) {
        log('info', 'server-notification', { name, transport, method: msg.method });
        return;
      }
      if (!method) return;
      if (method !== 'tools/list') {
        log('debug', 'response', { name, transport, method });
        return;
      }
      if (msg.error) return;
      const tools = msg.result?.tools;
      const names = new Set();
      const malformed = !Array.isArray(tools) || tools.some(tool => {
        if (!tool || typeof tool.name !== 'string' || !tool.name || names.has(tool.name)
          || (tool.description !== undefined && typeof tool.description !== 'string')
          || (tool.inputSchema !== undefined && (!tool.inputSchema || typeof tool.inputSchema !== 'object' || Array.isArray(tool.inputSchema)))) return true;
        names.add(tool.name); return false;
      });
      invalidManifest = malformed || msg.result.nextCursor !== undefined;
      if (invalidManifest) {
        observedTools = null;
        delete msg.result;
        msg.error = { code: -32009, message: 'mcp-safetripwire: invalid or paginated tool manifest; complete review is required' };
        return;
      }

      const pin = getPin();
      if (pin.integrityError) {
        delete msg.result;
        msg.error = { code: -32008, message: 'mcp-safetripwire: manifest storage integrity check failed' };
        log('warn', 'manifest-state-rejected', { name, transport });
        return;
      }
      const declared = msg.result.tools;
      observedTools = structuredClone(declared);
      const ev = evaluateToolsList(declared, { pinHash: pin.hash, posture });
      if (ev.pinState !== 'match') {
        try { recordPending?.(ev.hash, ev.count); } catch { /* best effort */ }
      }

      log('info', 'tools-list', { name, transport, count: ev.count, hash: ev.hash, pin: ev.pinState });
      if (ev.pinState === 'unpinned') {
        log('warn', 'manifest-unpinned', { name, hash: ev.hash, count: ev.count, hint: 'review this channel in the console, then approve it' });
      } else if (ev.pinState === 'mismatch') {
        log('critical', 'RUG-PULL-SUSPECTED', {
          name,
          expected: pin.hash,
          actual: ev.hash,
          note: 'Tool surface changed after approval. Review the diff before re-approving.',
        });
      }
      for (const f of ev.findings) log(f.severity === 'critical' ? 'critical' : f.severity === 'info' ? 'info' : 'warn', 'static-finding', { name, ...f });
      for (const r of ev.risks) log('info', 'tool-risk', { name, tool: r.tool, risks: r.risks });

      if (ev.action.kind === 'block') {
        const rugPull = ev.action.reason === 'rug-pull';
        delete msg.result;
        msg.error = {
          code: rugPull ? -32002 : -32003,
          message: rugPull
            ? `mcp-safetripwire blocked tools/list for "${name}": manifest changed (rug-pull suspected). Review, then re-approve.`
            : `mcp-safetripwire blocked tools/list for "${name}": ${ev.action.tools.length} tool(s) with critical metadata findings.`,
        };
        log('critical', 'enforced-block', { name, transport, reason: ev.action.reason, tools: ev.action.tools });
        return;
      }
      if (ev.action.kind === 'strip') {
        const before = declared.length;
        msg.result.tools = declared.filter((t) => !ev.action.tools.includes(t.name));
        log('warn', 'enforced-strip', { name, transport, removed: ev.action.tools, before, after: msg.result.tools.length });
      }
      if (deceptionOn) {
        const before = msg.result.tools.length;
        msg.result.tools = appendDecoys(msg.result.tools);
        log('info', 'decoy-tools-armed', { name, transport, added: msg.result.tools.length - before });
      }
    },
  };
}
