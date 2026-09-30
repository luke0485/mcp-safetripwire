import { scanPatterns } from './blacklist.js';

// Static, purely programmatic scanning of MCP tool metadata.
//
// Design principle: we do NOT try to judge intent (that is a semantic problem
// and pure code cannot win it). We look for STRUCTURAL and LEXICAL tells that
// correlate with tool poisoning, and we report them with a severity. Findings
// are advisory evidence for a human, not a verdict.

// Unicode Tag block: renders as nothing in almost every UI, but a model reads it.
const TAG_BLOCK = /[\u{E0000}-\u{E007F}]/u;
// Zero-width and invisible formatting characters.
const ZERO_WIDTH = /[\u200B-\u200D\u2060\uFEFF]/;
// Bidirectional overrides: can make displayed text differ from stored text.
const BIDI = /[\u202A-\u202E\u2066-\u2069]/;

// Tool metadata should DESCRIBE a capability, not ISSUE instructions to a model.
// Imperative/injection-shaped language is a heuristic signal, deliberately noisy.
const INJECTION_PHRASES = [
  /\bignore (all )?(previous|prior|above)\b/i,
  /\bdo not (tell|inform|mention|reveal|notify)\b/i,
  /\bwithout (telling|informing|notifying)\b/i,
  /\bbefore (using|calling|invoking) this\b/i,
  /\byou must (first|now|always)\b/i,
  /\bsystem\s*:/i,
  /\bas an ai\b/i,
  /\bread (the )?(file|~\/|\.ssh|\.aws|\.env|credentials)/i,
  /\bsend (it|them|the .*?) to\b/i,
];

const BASE64_BLOB = /[A-Za-z0-9+/]{80,}={0,2}/;

export function scanText(text, where) {
  const findings = [];
  if (typeof text !== 'string' || text.length === 0) return findings;

  const add = (severity, rule, detail) => findings.push({ severity, rule, where, detail });

  if (TAG_BLOCK.test(text)) {
    add('critical', 'unicode-tag-smuggling',
      'Invisible Unicode Tag characters can hide instructions from a human reviewer while a model still reads them.');
  }
  if (ZERO_WIDTH.test(text)) {
    add('high', 'zero-width-characters',
      'Zero-width characters present; a common channel for smuggling hidden text.');
  }
  if (BIDI.test(text)) {
    add('high', 'bidi-override',
      'Bidirectional override characters can make the displayed text differ from the stored text.');
  }
  if (BASE64_BLOB.test(text)) {
    add('medium', 'encoded-blob',
      'Long base64-like blob in metadata; may carry a hidden payload.');
  }
  for (const re of INJECTION_PHRASES) {
    if (re.test(text)) {
      add('medium', 'imperative-language',
        `Metadata matches ${re}. Tool descriptions should describe, not instruct.`);
      break;
    }
  }
  // Payload shapes taken from published MCP attacks, not guesses.
  for (const f of scanPatterns(text)) add(f.severity, f.rule, f.detail);
  return findings;
}

export function scanTools(tools) {
  const findings = [];
  for (const tool of tools ?? []) {
    findings.push(...scanText(tool?.description, `tool:${tool?.name}.description`));
    findings.push(...scanText(JSON.stringify(tool?.inputSchema ?? {}), `tool:${tool?.name}.inputSchema`));
  }
  return findings;
}

// A sibling reference in API documentation is normal. Keep it as context,
// rather than treating a name mention alone as evidence of manipulation.
export function scanCrossReferences(tools) {
  const findings = [];
  const names = (tools ?? []).map((t) => t?.name).filter((n) => typeof n === 'string');
  for (const tool of tools ?? []) {
    const desc = String(tool?.description ?? '');
    for (const other of names) {
      if (other === tool?.name || other.length < 4) continue;
      if (desc.includes(other)) {
        findings.push({
          severity: 'info',
          rule: 'cross-tool-reference',
          where: `tool:${tool?.name}.description`,
          detail: `Mentions sibling tool "${other}"; documentation context, not evidence of an attack on its own.`,
        });
      }
    }
  }
  return findings;
}

export function scanManifest(tools) {
  return [...scanTools(tools), ...scanCrossReferences(tools)];
}
