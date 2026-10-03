// Blacklist and attack-pattern matching, seeded from published MCP incidents.
//
// This is the concrete half of "you cannot read intent, so constrain capability":
// instead of asking whether a description MEANS something malicious, we look for
// the payload shapes that published attacks actually used -- cloud metadata
// endpoints, credential env placeholders, silent BCC copies, non-HTTP schemes.
//
// Sources for the seed data: the CVE list and the three real-world campaigns
// (Postmark-MCP version-dimension backdoor, Deadbugz delayed poisoning, Context
// Hub documentation poisoning).

export const BAD_PACKAGES = [
  {
    name: 'postmark-mcp',
    severity: 'critical',
    reason: 'version-dimension backdoor: 15 clean releases then a silent BCC of every email (2025-09)',
  },
  {
    name: 'mcp-searxng',
    severity: 'medium',
    fixedIn: '1.2.1',
    reason: 'SSRF via unvalidated URL, can reach loopback / intranet / cloud metadata (CVE-2026-54688)',
  },
  {
    name: 'n8n-mcp',
    severity: 'high',
    reason: 'credential-bearing calls and headers written to logs; SSRF in multi-tenant HTTP mode (CVE-2026-42282, CVE-2026-39974)',
  },
  {
    name: 'obot',
    severity: 'high',
    reason: 'remote MCP registration SSRF to the cloud metadata endpoint (CVE-2026-101064)',
  },
  {
    name: 'network-ai',
    severity: 'high',
    reason: 'SSE server shipped with an empty default secret, all 22 tools callable unauthenticated (CVE-2026-48814)',
  },
  {
    name: 'librechat',
    severity: 'high',
    reason: 'environment placeholders in MCP server URLs expand into credential leakage (CVE-2026-32625)',
  },
];

// Vulnerable SDKs, matched against the package name when it appears as a dependency.
export const BAD_SDK_RANGES = [
  { name: 'mcp', ecosystem: 'ruby', fixedIn: '0.23.0', severity: 'critical', reason: 'session id not bound to its owner; stolen id allows tool calls in the victim session (CVE-2026-67431)' },
  { name: 'mcp', ecosystem: 'php', fixedIn: '0.71', severity: 'high', reason: 'unbounded SSE stream buffer, a hostile server can exhaust client memory (CVE-2026-53965)' },
];

export const BAD_PATTERNS = [
  {
    rule: 'cloud-metadata-endpoint',
    severity: 'critical',
    re: /169\.254\.169\.254|metadata\.google\.internal|metadata\.azure\.com|100\.100\.100\.200/i,
  },
  {
    rule: 'credential-env-expansion',
    severity: 'high',
    re: /\$\{?(CREDS?_KEY|JWT_SECRET|AWS_SECRET_ACCESS_KEY|AWS_ACCESS_KEY_ID|API_KEY|SECRET_KEY|PRIVATE_KEY)\}?/,
  },
  {
    rule: 'silent-copy-recipient',
    severity: 'high',
    re: /\b(bcc|blind carbon copy)\b[^.\n]{0,60}@/i,
  },
  {
    rule: 'non-http-scheme',
    severity: 'high',
    re: /\b(file|gopher|dict|ldap|ftp|jar):\/\//i,
  },
  {
    rule: 'loopback-or-intranet',
    severity: 'medium',
    re: /\b(127\.0\.0\.1|localhost|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\b/i,
  },
  {
    rule: 'shell-pipe-to-shell',
    severity: 'high',
    re: /\b(curl|wget)\b[^\n|]{0,80}\|\s*(sh|bash|zsh|python|node)\b/i,
  },
];

export function normaliseSpec(spec) {
  const s = String(spec ?? '').trim();
  if (s === '') return '';
  const withoutVersion = s.lastIndexOf('@') > 0 ? s.slice(0, s.lastIndexOf('@')) : s;
  const parts = withoutVersion.split(/[\\/]/);
  return parts[parts.length - 1].toLowerCase();
}

export function matchPackage(spec) {
  const name = normaliseSpec(spec);
  if (name === '') return null;
  const hit = BAD_PACKAGES.find((p) => p.name.toLowerCase() === name);
  if (hit?.fixedIn) {
    const version = String(spec).match(/@(\d+)\.(\d+)\.(\d+)$/);
    if (version) {
      const actual = version.slice(1).map(Number);
      const fixed = hit.fixedIn.split('.').map(Number);
      const different = actual.findIndex((part, index) => part !== fixed[index]);
      if (different === -1 || actual[different] > fixed[different]) return null;
    }
  }
  if (hit) return { rule: 'blacklisted-package', severity: hit.severity, detail: `${hit.name}: ${hit.reason}` };
  const sdk = BAD_SDK_RANGES.find((s) => s.name.toLowerCase() === name);
  if (sdk) return { rule: 'vulnerable-sdk', severity: 'info', detail: `${sdk.name}: ecosystem and installed version are unknown; review SDK advisories before treating this as a vulnerable installation` };
  return null;
}

export function scanPatterns(text) {
  const findings = [];
  if (typeof text !== 'string' || text === '') return findings;
  for (const p of BAD_PATTERNS) {
    const m = p.re.exec(text);
    if (m) {
      findings.push({ rule: p.rule, severity: p.severity, where: 'text', detail: `matched "${String(m[0]).slice(0, 60)}"` });
    }
  }
  return findings;
}

// Tool-call arguments are where an injected instruction has to become concrete.
export function checkArguments(params) {
  let text;
  try {
    text = JSON.stringify(params ?? {});
  } catch {
    return [];
  }
  return scanPatterns(text).filter((f) => f.severity === 'critical' || f.severity === 'high');
}
