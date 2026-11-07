import { createProxy } from './proxy.js';
import { loadState, findPin, setPending, updateState } from './manifest.js';
import { createInspector } from './inspect.js';
import { loadPolicy } from './policy.js';
import { loadCanary } from './deception.js';
import { log, setLogFile, setMinConsoleLevel } from './log.js';

// Enforcement posture for the manifest/static layer:
//   warn  (default) observe and log everything, block nothing
//   strip remove tools carrying CRITICAL static findings; block on rug-pull
//   block block on rug-pull OR any CRITICAL static finding
//
// Protect posture also requires reviewed channels at tools/call. Explicit
// deny lists remain effective while observing.
const ENFORCE = new Set(['warn', 'strip', 'block']);

export function runBroker({ name, command, args, statePath, policyPath, logPath, enforce = 'warn', getPosture, getAdvanced, verbose = false, canary }) {
  const posture = ENFORCE.has(enforce) ? enforce : 'warn';
  setLogFile(logPath);
  if (verbose) setMinConsoleLevel('info');
  if (!ENFORCE.has(enforce)) log('warn', 'unknown-enforce-value', { name, value: String(enforce), using: posture });

  const policy = loadPolicy(policyPath);
  // A per-install random canary is handed to the wrapped server as an
  // environment variable. Nothing legitimate needs to read it; seeing it in an
  // outbound call means the server (or something it spawned) took the bait.
  const activeCanary = canary || loadCanary();
  // Re-read the pin per tools/list so a concurrent `approve` takes effect
  // without restarting a long-running proxy.
  const getPin = () => findPin(loadState(statePath), name);

  const recordPending = (hash, count) => {
    updateState(statePath, state => setPending(state, name, hash, count));
  };
  const inspector = createInspector({ name, getPin, policy, posture, getPosture, getAdvanced, transport: 'stdio', recordPending, canary: activeCanary });
  log('info', 'tripwire-start', {
    name,
    transport: 'stdio',
    command,
    argCount: args?.length ?? 0,
    enforce: posture,
    policyMode: policy.mode,
    pinned: Boolean(getPin().hash),
  });

  return createProxy({
    name,
    command,
    args,
    env: { TRIPWIRE_CANARY: activeCanary },
    onHostMessage: (msg) => inspector.onClientMessage(msg),
    onServerMessage: (msg, method) => inspector.onServerMessage(msg, method),
  });
}
