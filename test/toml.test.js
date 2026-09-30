import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listMcpServers, readServerEntry, rewriteServerEntry } from '../src/toml.js';

const CONFIG = `model = "gpt-5-codex"

[mcp_servers.blender]
command = "uvx"
args = ["blender-mcp"]

[mcp_servers.filesystem]
command = "npx"
args = [
  "-y",
  "@modelcontextprotocol/server-filesystem",
  "/Users/me/data",
]
env = { FOO = "bar" }
`;

test('lists declared mcp_servers, including quoted names', () => {
  assert.deepEqual(listMcpServers(CONFIG), ['blender', 'filesystem']);
  assert.deepEqual(listMcpServers('[mcp_servers."my server"]\ncommand = "x"\n'), ['my server']);
});

test('reads an inline command/args entry', () => {
  assert.deepEqual(readServerEntry(CONFIG, 'blender'), { command: 'uvx', args: ['blender-mcp'], url: null });
});

test('reads a multi-line args array with a trailing comma', () => {
  const entry = readServerEntry(CONFIG, 'filesystem');
  assert.equal(entry.command, 'npx');
  assert.deepEqual(entry.args, ['-y', '@modelcontextprotocol/server-filesystem', '/Users/me/data']);
});

test('rewrite replaces command/args, preserves other keys and sections', () => {
  const res = rewriteServerEntry(CONFIG, 'blender', { command: 'node', args: ['cli.js', 'wrap', '--', 'uvx', 'blender-mcp'] });
  assert.equal(res.ok, true);
  assert.match(res.text, /^command = "node"$/m);
  // the original launcher line is gone (the original command survives only as
  // an argument after "--", which is the point of wrapping)
  assert.doesNotMatch(res.text, /^command = "uvx"$/m);
  // untouched sections and keys survive
  assert.match(res.text, /\[mcp_servers\.filesystem\]/);
  assert.match(res.text, /env = \{ FOO = "bar" \}/);
  assert.match(res.text, /^model = "gpt-5-codex"$/m);
  // and the rewrite reads back cleanly
  const after = readServerEntry(res.text, 'blender');
  assert.equal(after.command, 'node');
  assert.deepEqual(after.args, ['cli.js', 'wrap', '--', 'uvx', 'blender-mcp']);
  // the sibling server is untouched
  assert.deepEqual(readServerEntry(res.text, 'filesystem').args, ['-y', '@modelcontextprotocol/server-filesystem', '/Users/me/data']);
});

test('rewrite escapes quotes and backslashes in values', () => {
  const res = rewriteServerEntry(CONFIG, 'blender', { command: 'C:\\Program Files\\node.exe', args: ['a"b'] });
  const after = readServerEntry(res.text, 'blender');
  assert.equal(after.command, 'C:\\Program Files\\node.exe');
  assert.deepEqual(after.args, ['a"b']);
});

test('rewrite refuses a section that does not exist rather than guessing', () => {
  const res = rewriteServerEntry(CONFIG, 'nope', { command: 'node', args: [] });
  assert.equal(res.ok, false);
  assert.match(res.reason, /no \[mcp_servers\.nope\]/);
});

test('CRLF input is preserved', () => {
  const crlf = '[mcp_servers.x]\r\ncommand = "a"\r\nargs = ["b"]\r\n';
  const res = rewriteServerEntry(crlf, 'x', { command: 'node', args: ['c'] });
  assert.equal(res.ok, true);
  assert.ok(res.text.includes('\r\n'));
  assert.equal(readServerEntry(res.text, 'x').command, 'node');
});

test('a nested table is not mistaken for a server (real Codex shape)', () => {
  const config = `[mcp_servers.node_repl]
command = "npx"
args = ["-y", "node-repl"]

[mcp_servers.node_repl.env]
SECRET = "keep-me"

[windows]
foo = 1
`;
  assert.deepEqual(listMcpServers(config), ['node_repl']);
  assert.equal(readServerEntry(config, 'node_repl').command, 'npx');
});

test('rewriting a server leaves its nested .env table intact', () => {
  const config = `[mcp_servers.x]
command = "old"
args = ["a"]

[mcp_servers.x.env]
SECRET = "keep-me"
`;
  const res = rewriteServerEntry(config, 'x', { command: 'node', args: ['wrap'] });
  assert.equal(res.ok, true);
  assert.match(res.text, /\[mcp_servers\.x\.env\]/);
  assert.match(res.text, /SECRET = "keep-me"/);
  assert.equal(readServerEntry(res.text, 'x').command, 'node');
});

test('reads and rewrites a url-based (HTTP) server entry', () => {
  const config = `[mcp_servers.remote]
url = "https://mcp.example.com/mcp"
`;
  assert.equal(readServerEntry(config, 'remote').url, 'https://mcp.example.com/mcp');
  const res = rewriteServerEntry(config, 'remote', { url: 'http://127.0.0.1:8788/remote/mcp' });
  assert.equal(res.ok, true);
  assert.match(res.text, /^url = "http:\/\/127\.0\.0\.1:8788\/remote\/mcp"$/m);
  assert.doesNotMatch(res.text, /mcp\.example\.com/);
});

test('rewriting command form over a url form drops the stale url', () => {
  const config = `[mcp_servers.remote]
url = "https://mcp.example.com/mcp"
`;
  const res = rewriteServerEntry(config, 'remote', { command: 'node', args: ['x'] });
  assert.match(res.text, /^command = "node"$/m);
  assert.doesNotMatch(res.text, /url =/);
});
