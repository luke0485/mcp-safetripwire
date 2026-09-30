// Pre-enrolment supply-chain checks. Lexical only, no network: the goal is to
// surface the shape of a risky install (unpinned, remote, typosquatted) BEFORE
// a channel is trusted, rather than after something has run.

// Packages whose names are worth guarding against near-misses.
import { matchPackage } from './blacklist.js';

export const WELL_KNOWN = [
  '@modelcontextprotocol/server-filesystem',
  '@modelcontextprotocol/server-github',
  '@modelcontextprotocol/server-memory',
  'blender-mcp',
  'mcp-server-git',
  'mcp-server-sqlite',
  'mcp-server-fetch',
];

export function packageToken(command, args) {
  const list = Array.isArray(args) ? args.filter((x) => typeof x === 'string' && x !== '') : [];
  const bare = (p) => String(p).replace(/\.(cmd|exe|bat)$/i, '').toLowerCase();
  const cmd = bare(command);
  const positional = list.filter((x) => !x.startsWith('-'));

  if (cmd === 'npx' || cmd === 'pnpm' || cmd === 'yarn' || cmd === 'bunx') return positional[0] ?? null;
  if (cmd === 'uvx' || cmd === 'uv' || cmd === 'pipx') {
    const i = positional.indexOf('run');
    return i >= 0 ? positional[i + 1] ?? null : positional[0] ?? null;
  }
  if (cmd === 'python' || cmd === 'python3' || cmd === 'py') {
    // Search the RAW list: "-m" is a flag and was filtered out of positional.
    const i = list.indexOf('-m');
    return i >= 0 ? list[i + 1] ?? null : null;
  }
  return positional[0] ?? null;
}

// Strip a trailing version, but keep a leading scope:
//   @scope/pkg@1.2.3 -> @scope/pkg     pkg@1.2.3 -> pkg     pkg -> pkg
export function baseName(spec) {
  const s = String(spec ?? '');
  const i = s.lastIndexOf('@');
  return i > 0 ? s.slice(0, i) : s;
}

// "1.2.3", "==1.2.3", or a git commit hash
export function isPinned(spec) {
  const s = String(spec ?? '');
  if (s === '') return false;
  if (/@\d/.test(s)) return true;
  if (/==\d/.test(s)) return true;
  if (/#[0-9a-f]{7,}$/i.test(s)) return true;
  return false;
}

export function editDistance(a, b) {
  const s = String(a ?? '');
  const t = String(b ?? '');
  if (s === t) return 0;
  if (s === '' || t === '') return Math.max(s.length, t.length);
  let prev = Array.from({ length: t.length + 1 }, (_, i) => i);
  for (let i = 1; i <= s.length; i++) {
    const cur = [i];
    for (let j = 1; j <= t.length; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[t.length];
}

// A protected channel is launched as `node <cli.js> wrap ... -- <original>`.
// Checking that wrapper would flag every protected channel as an unpinned
// package, so the interesting command is the original one after "--".
export function innerLaunch(input = {}) {
  const list = Array.isArray(input.args) ? input.args : [];
  const i = list.indexOf('--');
  if (i >= 0 && list[i + 1]) return { command: list[i + 1], args: list.slice(i + 2) };
  return { command: input.command, args: list };
}

export function checkLaunch(input = {}) {
  const { command, args } = innerLaunch(input);
  const findings = [];
  const spec = packageToken(command, args);
  if (!spec) return findings;

  const known = matchPackage(spec);
  if (known) {
    findings.push({ rule: known.rule, severity: known.severity, detail: known.detail });
  }
  if (/^(https?:|git\+|git@)/i.test(spec)) {
    findings.push({
      rule: 'remote-source',
      severity: 'high',
      detail: `${spec} installs from a URL or git remote rather than a registry`,
    });
  } else if (!isPinned(spec)) {
    findings.push({
      rule: 'unpinned-package',
      severity: 'medium',
      detail: `${spec} is not pinned to a version; a later run can pull different code`,
    });
  }

  const name = baseName(spec).toLowerCase();
  for (const known of WELL_KNOWN) {
    if (name === known.toLowerCase()) continue;
    const d = editDistance(name, known.toLowerCase());
    if (d > 0 && d <= 2) {
      findings.push({
        rule: 'typosquat-suspect',
        severity: 'high',
        detail: `"${name}" is ${d} edit(s) away from "${known}"`,
      });
      break;
    }
  }

  const joined = [command, ...(Array.isArray(args) ? args : [])].join(' ');
  if (/--force\b|--no-verify\b|--ignore-scripts=false/.test(joined)) {
    findings.push({ rule: 'forced-install', severity: 'medium', detail: 'uses forced or unverified install flags' });
  }
  return findings;
}
