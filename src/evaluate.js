import { hashTools } from './manifest.js';
import { scanManifest } from './scan.js';
import { classifyTools } from './risk.js';

// The manifest/static decision, extracted as a pure function so it can be
// tested and reasoned about without spawning a process.
//
// Inputs : a declared tool list, the pinned hash (or null), and the posture.
// Output : everything worth logging, plus the single action to take.
//
// Actions:
//   { kind: 'forward' }                      pass the tools/list through unchanged
//   { kind: 'strip', tools: [...] }          remove these tools from the response
//   { kind: 'block', reason, tools? }        replace the response with an error

function toolNameFromWhere(where) {
  return String(where).replace(/^tool:/, '').replace(/\.(description|inputSchema)$/, '');
}

export function evaluateToolsList(tools, { pinHash = null, posture = 'warn' } = {}) {
  const { hash, count } = hashTools(tools);
  const pinState = !pinHash ? 'unpinned' : pinHash === hash ? 'match' : 'mismatch';
  const findings = scanManifest(tools);
  const risks = classifyTools(tools);
  const criticalTools = [...new Set(
    findings.filter((f) => f.severity === 'critical').map((f) => toolNameFromWhere(f.where)),
  )];

  let action = { kind: 'forward' };
  if (pinState === 'mismatch' && posture !== 'warn') {
    // A changed tool surface is the highest-confidence signal we have, so it
    // overrides everything: striping individual tools is not enough when the
    // server's whole identity is in question.
    action = { kind: 'block', reason: 'rug-pull', tools: [] };
  } else if (criticalTools.length > 0 && posture === 'block') {
    action = { kind: 'block', reason: 'critical-static-findings', tools: criticalTools };
  } else if (criticalTools.length > 0 && posture === 'strip') {
    action = { kind: 'strip', tools: criticalTools };
  }

  return { hash, count, pinState, findings, risks, criticalTools, action };
}
