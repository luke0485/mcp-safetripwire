import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { AGENT_CATALOG, knownHosts, detectAgent, planWrap, applyWrap, readServer, registerAgentConfig } from '../src/hosts.js';
import { stringify } from 'yaml';
import { parse } from 'jsonc-parser';

test('every supported Agent profile detects multiple MCPs and wraps only the selected channel', t => {
  const home = mkdtempSync(join(tmpdir(), 'tripwire-agents-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const options = { home, system: 'win32', env: {}, projects: [] };
  assert.ok(AGENT_CATALOG.length >= 40);
  assert.equal(new Set(AGENT_CATALOG.map(a => a.id)).size, AGENT_CATALOG.length);
  for (const host of knownHosts(options)) {
    mkdirSync(dirname(host.path), { recursive: true });
    const servers = { first: { command: 'node', args: ['first.js'], env: { TOKEN: 'fixture' } }, second: { command: 'node', args: ['second.js'] } };
    if (host.commandArray) for (const entry of Object.values(servers)) { entry.command = [entry.command, ...entry.args]; delete entry.args; }
    const config = { theme: 'light' };
    let section = config;
    const keys = host.literalKey ? [host.key] : host.key.split('.');
    for (const key of keys.slice(0,-1)) section = section[key] = {};
    section[keys.at(-1)] = servers;
    writeFileSync(host.path, host.format === 'yaml' ? stringify(config) : host.format === 'json' ? JSON.stringify(config) : '[mcp_servers.first]\ncommand = "node"\nargs = ["first.js"]\n[mcp_servers.second]\ncommand = "node"\nargs = ["second.js"]\n');
    const before = readServer(host, 'second');
    assert.equal(detectAgent(host.id, options).servers.length, 2, host.id);
    const plan = planWrap({ host, serverName: 'first', launcher: { command: 'tripwire.exe', prefix: [] } });
    assert.equal(plan.ok, true, host.id);
    assert.equal(applyWrap({ host, serverName: 'first', wrapped: plan.wrapped }).ok, true, host.id);
    assert.equal(readServer(host, 'first').command, 'tripwire.exe');
    assert.deepEqual(readServer(host, 'second'), before);
    if (host.format === 'json') {
      const config = JSON.parse(readFileSync(host.path));
      const entries = keys.reduce((value,key) => value[key], config);
      assert.equal(entries.first.env.TOKEN, 'fixture');
      assert.equal(config.theme, 'light');
    }
  }
});

test('Qwen HTTP config retains httpUrl and headers; malformed and missing configs fail safely', t => {
  const home = mkdtempSync(join(tmpdir(), 'tripwire-http-agent-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const options = { home, system: 'win32', env: {} };
  const host = knownHosts(options).find(h => h.id === 'qwen-code');
  assert.equal(detectAgent(host.id, options).exists, false);
  mkdirSync(dirname(host.path), { recursive: true });
  writeFileSync(host.path, '{bad');
  assert.equal(detectAgent(host.id, options).valid, false);
  writeFileSync(host.path, JSON.stringify({ mcpServers: { remote: { httpUrl: 'https://example.com/mcp', headers: { Authorization: 'fixture' } } } }));
  const plan = planWrap({ host, serverName: 'remote' });
  assert.equal(applyWrap({ host, serverName: 'remote', wrapped: plan.wrapped }).ok, true);
  const entry = JSON.parse(readFileSync(host.path)).mcpServers.remote;
  assert.equal(entry.httpUrl, plan.wrapped.url);
  assert.equal(entry.headers.Authorization, 'fixture');
  assert.equal(Object.hasOwn(entry, 'url'), false);
  assert.equal(detectAgent('unknown', options), null);
});

test('installed Agents with no MCP config are distinguished from missing installations', t => {
  const home = mkdtempSync(join(tmpdir(), 'tripwire-installed-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  mkdirSync(join(home, '.zcode'));
  mkdirSync(join(home, '.claude'));
  const options = { home, system: 'win32', env: {}, projects: [] };
  assert.equal(detectAgent('zcode', options).installed, true);
  assert.equal(detectAgent('zcode', options).exists, false);
  assert.equal(detectAgent('claude-code', options).installed, true);
  assert.equal(detectAgent('cursor', options).installed, false);
  assert.equal(detectAgent('qwenwork', options).supported, false);
});

test('project-scoped Claude entries preserve other scopes, settings and comments', t => {
  const home = mkdtempSync(join(tmpdir(), 'tripwire-scopes-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const project = join(home, 'work');
  writeFileSync(join(home, '.claude.json'), JSON.stringify({ userSetting: true, projects: { [project]: { mcpServers: { files: { command: 'node', args: ['files.js'] } } } } }));
  const options = { home, system: 'win32', env: {}, projects: [project] };
  const result = detectAgent('claude-code', options);
  assert.equal(result.servers.length, 1);
  assert.equal(result.servers[0].scope, 'project');
  const host = knownHosts(options).find(h => h.id === result.servers[0].hostId);
  const plan = planWrap({ host, serverName: 'files', launcher: { command: 'tripwire.exe', prefix: [] } });
  assert.equal(applyWrap({ host, serverName: 'files', wrapped: plan.wrapped }).ok, true);
  assert.equal(JSON.parse(readFileSync(host.path)).userSetting, true);
  const jsoncHost = { id: 'opencode', path: join(home, 'opencode.jsonc'), format: 'json', key: 'mcp', commandArray: true };
  writeFileSync(jsoncHost.path, '// keep this explanation\n{ "theme": "light", "mcp": { "files": { "type": "local", "command": ["node", "files.js"], }, }, }');
  const second = planWrap({ host: jsoncHost, serverName: 'files', launcher: { command: 'tripwire.exe', prefix: [] } });
  assert.notEqual(second.channelName, plan.channelName);
  assert.equal(applyWrap({ host: jsoncHost, serverName: 'files', wrapped: second.wrapped }).ok, true);
  const after = readFileSync(jsoncHost.path, 'utf8');
  assert.ok(after.startsWith('// keep this explanation'));
  assert.equal(parse(after).theme, 'light');
  assert.equal(parse(after).mcp.files.type, 'local');
  assert.equal(readServer(jsoncHost, 'files').command, 'tripwire.exe');
});

test('manual config registration detects MCPs without rewriting the file', t => {
  const home = mkdtempSync(join(tmpdir(), 'tripwire-manual-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const path = join(home, 'custom.jsonc');
  const original = '// user-owned settings\n{"mcpServers":{"files":{"command":"node","args":["files.js"]}}}';
  writeFileSync(path, original);
  registerAgentConfig({ agentId: 'qwenwork', path, home });
  assert.equal(readFileSync(path, 'utf8'), original);
  const detected = detectAgent('qwenwork', { home, system: 'win32', env: {}, projects: [] });
  assert.equal(detected.supported, true);
  assert.equal(detected.servers[0].name, 'files');
  assert.ok(detected.servers[0].hostId.startsWith('qwenwork@custom-'));
  assert.throws(() => registerAgentConfig({ agentId: 'custom', path: 'relative.json', home }));
  assert.throws(() => registerAgentConfig({ agentId: 'unknown', path, home }));
});
