// Lexical, purely programmatic risk classification of MCP tools.
//
// Deliberately noisy and ADVISORY: it flags the SHAPE of a capability (can it
// run code? touch credentials? reach the network?), not intent. It is not a
// verdict, it is context for a human or a policy.
//
// Names are normalised first: snake_case / dotted / dashed names would defeat
// \b word boundaries ("execute_blender_code" must read as three words).

const RULES = [
  {
    id: 'code-execution',
    severity: 'critical',
    hint: 'Can run code or commands on the host.',
    re: /\b(execute|exec|eval|run|spawn|shell|bash|sh|cmd|powershell|terminal|python|node|script|code)\b/i,
  },
  {
    id: 'credential-access',
    severity: 'critical',
    hint: 'Touches credentials, keys or secrets.',
    re: /\b(credential|credentials|password|passwd|secret|token|api[ _-]?key|private[ _-]?key|ssh|aws|env|keychain|wallet)\b/i,
  },
  {
    id: 'network-egress',
    severity: 'high',
    hint: 'Talks to the network.',
    re: /\b(http|https|url|uri|fetch|request|download|upload|webhook|curl|wget|socket|api|endpoint)\b/i,
  },
  {
    id: 'filesystem-write',
    severity: 'high',
    hint: 'Modifies the filesystem.',
    re: /\b(write|delete|remove|unlink|move|rename|copy|mkdir|chmod|chown|truncate|overwrite)\b/i,
  },
  {
    id: 'filesystem-read',
    severity: 'medium',
    hint: 'Reads the filesystem.',
    re: /\b(read|open|list|glob|find|scan|cat|load)\b/i,
  },
];

const ORDER = { critical: 3, high: 2, medium: 1 };

export function classifyTool(tool) {
  const haystack = `${tool?.name ?? ''} ${tool?.description ?? ''}`.replace(/[_\-./\\]+/g, ' ');
  const hits = [];
  for (const rule of RULES) {
    if (rule.re.test(haystack)) hits.push({ id: rule.id, severity: rule.severity, hint: rule.hint });
  }
  return hits;
}

export function classifyTools(tools) {
  const out = [];
  for (const tool of tools ?? []) {
    const risks = classifyTool(tool);
    if (risks.length) out.push({ tool: tool?.name, risks });
  }
  return out;
}

export function highestSeverity(risks) {
  return (risks ?? []).reduce((acc, r) => Math.max(acc, ORDER[r.severity] ?? 0), 0);
}
