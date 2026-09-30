// Minimal, bounded TOML helpers for the ONLY thing we need: reading and
// rewriting a `[mcp_servers.<name>]` entry (its `command`/`args`, or `url`).
//
// This is deliberately NOT a general TOML parser. Anything it cannot parse
// with confidence is refused rather than guessed at, because corrupting a
// user's agent config is worse than asking them to paste a snippet by hand.

function unquote(value) {
  const t = String(value).trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) return t.slice(1, -1);
  return t;
}

function tomlString(value) {
  return '"' + String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

export function findSections(text) {
  const lines = String(text).split(/\r?\n/);
  const sections = [];
  let current = null;
  lines.forEach((line, i) => {
    const m = /^\s*\[([^[\]]+)\]\s*$/.exec(line);
    if (m) {
      current = { header: m[1].trim(), line: i, body: [] };
      sections.push(current);
    } else if (current) {
      current.body.push({ line: i, text: line });
    }
  });
  return sections;
}

function serverNameFromHeader(header) {
  const m = /^mcp_servers\s*\.\s*(.+)$/.exec(header);
  if (!m) return null;
  const rest = m[1].trim();
  // A quoted remainder is one server name and may itself contain dots.
  if (rest.startsWith('"') || rest.startsWith("'")) return unquote(rest);
  // An unquoted dotted path is a nested table (e.g. `mcp_servers.foo.env`),
  // not a server entry. Listing it as a server would be wrong and, worse,
  // would make `install` target the wrong table.
  if (rest.includes('.')) return null;
  return rest;
}

export function listMcpServers(text) {
  return findSections(text).map((s) => serverNameFromHeader(s.header)).filter(Boolean);
}

// Returns the [start, end] line range (relative to `lines`) of `key = ...`,
// following a multi-line array value to its closing bracket.
function findKeySpan(lines, key) {
  const re = new RegExp('^\\s*' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*=');
  for (let i = 0; i < lines.length; i++) {
    if (!re.test(lines[i])) continue;
    let end = i;
    let depth = 0;
    for (const c of lines[i]) {
      if (c === '[') depth++;
      else if (c === ']') depth--;
    }
    for (let j = i + 1; j < lines.length && depth > 0; j++) {
      for (const c of lines[j]) {
        if (c === '[') depth++;
        else if (c === ']') depth--;
      }
      end = j;
    }
    return { start: i, end };
  }
  return null;
}

// Single-pass unescape. Order matters: a chained replace chain would turn the
// TOML text `\\node` into a newline followed by "ode".
function unescapeBasic(s) {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c !== '\\') { out += c; continue; }
    const n = s[++i];
    if (n === undefined) { out += '\\'; break; }
    if (n === 'n') out += '\n';
    else if (n === 't') out += '\t';
    else if (n === 'r') out += '\r';
    else if (n === '"') out += '"';
    else if (n === '\\') out += '\\';
    else out += n;
  }
  return out;
}

function parseStringValue(text) {
  const t = String(text).trim().replace(/,$/, '').trim();
  const dq = /^"((?:[^"\\]|\\.)*)"$/.exec(t);
  if (dq) return unescapeBasic(dq[1]);
  const sq = /^'([^']*)'$/.exec(t);
  if (sq) return sq[1];
  return null;
}

function splitArrayInner(inner) {
  const parts = [];
  let cur = '';
  let quote = null;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (quote) {
      cur += c;
      if (c === '\\' && quote === '"') { cur += inner[++i] ?? ''; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") { quote = c; cur += c; continue; }
    if (c === ',') { parts.push(cur); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim() !== '') parts.push(cur);
  return parts.map((p) => parseStringValue(p) ?? p.trim()).filter((p) => p !== '');
}

export function readServerEntry(text, name) {
  const section = findSections(text).find((s) => serverNameFromHeader(s.header) === name);
  if (!section) return null;
  const lines = section.body.map((b) => b.text);

  const readScalar = (key) => {
    const span = findKeySpan(lines, key);
    return span ? parseStringValue(lines[span.start].replace(/^[^=]*=/, '')) : null;
  };

  let args = null;
  const argsSpan = findKeySpan(lines, 'args');
  if (argsSpan) {
    const joined = lines.slice(argsSpan.start, argsSpan.end + 1).join('\n');
    const open = joined.indexOf('[');
    const close = joined.lastIndexOf(']');
    if (open !== -1 && close > open) args = splitArrayInner(joined.slice(open + 1, close));
  }

  return { command: readScalar('command'), args: args ?? [], url: readScalar('url') };
}

// updates: { command, args } for a stdio server, or { url } for an HTTP server.
export function rewriteServerEntry(text, name, updates = {}) {
  const eol = String(text).includes('\r\n') ? '\r\n' : '\n';
  const lines = String(text).split(/\r?\n/);
  const sections = findSections(text);
  const idx = sections.findIndex((s) => serverNameFromHeader(s.header) === name);
  if (idx === -1) return { ok: false, reason: `no [mcp_servers.${name}] section found` };

  const startLine = sections[idx].line;
  const endLine = idx + 1 < sections.length ? sections[idx + 1].line : lines.length;
  const bodyLines = lines.slice(startLine + 1, endLine);

  const drop = new Set();
  for (const key of ['command', 'args', 'url']) {
    const span = findKeySpan(bodyLines, key);
    if (span) for (let i = span.start; i <= span.end; i++) drop.add(i);
  }
  const kept = bodyLines.filter((_, i) => !drop.has(i));

  const useUrl = updates.url !== undefined && updates.command === undefined;
  const injected = useUrl
    ? [`url = ${tomlString(updates.url)}`]
    : [`command = ${tomlString(updates.command)}`, `args = [${(updates.args ?? []).map(tomlString).join(', ')}]`];

  const out = [...lines.slice(0, startLine + 1), ...injected, ...kept, ...lines.slice(endLine)];
  return { ok: true, text: out.join(eol) };
}
