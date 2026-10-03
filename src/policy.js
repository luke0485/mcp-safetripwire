import { readFileSync } from 'node:fs';

// Capability policy for tools/call.
//
// Default posture is "warn", not "block". A false positive that blocks a
// legitimate call makes the user uninstall the tool the same day, so hard
// blocking is opt-in and scoped to explicit lists.
//
//   { "mode": "warn" }                                    observe and log everything
//   { "mode": "block", "allowedTools": [...] }            default-deny everything else
//   { "mode": "block", "allowedTools": [...], "denyTools": [...] }  deny wins over allow

export function loadPolicy(path) {
  if (!path) return { mode: 'warn', allowedTools: null, denyTools: [], deception: null };
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)
      || (parsed.mode !== undefined && !['warn', 'block'].includes(parsed.mode))
      || ['allowedTools', 'denyTools'].some(key => parsed[key] !== undefined
        && (!Array.isArray(parsed[key]) || parsed[key].some(value => typeof value !== 'string' || !value.trim())))
      || (parsed.deception !== undefined && typeof parsed.deception !== 'boolean')) {
      throw new Error('Invalid policy');
    }
    return {
      mode: parsed.mode === 'block' ? 'block' : 'warn',
      allowedTools: Array.isArray(parsed.allowedTools) ? parsed.allowedTools : null,
      denyTools: Array.isArray(parsed.denyTools) ? parsed.denyTools : [],
      // true/false forces it; absent means "arm decoys when in protect mode"
      deception: typeof parsed.deception === 'boolean' ? parsed.deception : null,
    };
  } catch {
    return { mode: 'block', allowedTools: [], denyTools: [], deception: false, integrityError: 'Policy could not be read' };
  }
}

// Protect mode is "review before use": a channel nobody has approved is
// denied by default, and approving it once (a pinned, unchanged surface) is
// what grants trust. An explicit allowlist, when present, narrows that further.
export function decide(policy, toolName, { reviewed = true } = {}) {
  if (policy.integrityError) return { action: 'block', reason: 'policy-unreadable' };
  if (policy.denyTools?.includes(toolName)) return { action: 'block', reason: 'explicitly-denied' };
  if (policy.mode !== 'block') return { action: 'allow', reason: 'policy-mode-warn' };
  if (!reviewed) return { action: 'block', reason: 'unreviewed' };
  if (policy.allowedTools && !policy.allowedTools.includes(toolName)) {
    return { action: 'block', reason: 'not-allowlisted' };
  }
  return { action: 'allow', reason: policy.allowedTools ? 'allowlisted' : 'reviewed' };
}
