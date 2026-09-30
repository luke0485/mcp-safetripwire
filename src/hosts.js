import { homedir, platform } from 'node:os';
import { join, isAbsolute, extname, dirname } from 'node:path';
import { existsSync, readFileSync, writeFileSync, copyFileSync, statSync, mkdirSync, renameSync, readdirSync } from 'node:fs';
import { parseDocument } from 'yaml';
import * as toml from './toml.js';
import { localUrlFor, defaultListen } from './routes.js';
import { createHash } from 'node:crypto';
import { parse as parseJsonc, modify, applyEdits } from 'jsonc-parser';

function parseConfig(text, format = 'json') {
  if (format === 'yaml') {
    const doc = parseDocument(text);
    if (doc.errors.length) throw new Error('Invalid YAML configuration');
    const value = doc.toJS({ maxAliasCount: 100 });
    if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error('Invalid YAML configuration');
    return value;
  }
  const errors = [];
  const value = parseJsonc(text, errors, { allowTrailingComma: true });
  if (errors.length || !value || Array.isArray(value) || typeof value !== 'object') throw new Error('Invalid JSON/JSONC configuration');
  return value;
}

// Discovery and wrapping of host MCP configs.
//
// MCP servers come in two connection shapes, and they need different handling:
//
//   stdio  — declared as `command` + `args`. The host launches the process, so
//            we wrap by making the launch line point at mcp-tripwire.
//   HTTP   — declared as `url`. There is no process to launch, so we rewrite
//            the url to a local address and forward from `mcp-tripwire serve`.

export const AGENT_CATALOG = [
  { id: 'pi', vendor: 'Pi', label: 'Pi Agent', icon: 'pi', format: 'json' },
  { id: 'command-code', vendor: 'Command Code', label: 'Command Code', icon: 'command-code', format: 'json' },
  { id: 'codex', vendor: 'OpenAI', label: 'Codex', icon: 'codex', format: 'toml' },
  { id: 'cursor', vendor: 'Anysphere', label: 'Cursor', icon: 'cursor', format: 'json' },
  { id: 'claude-desktop', vendor: 'Anthropic', label: 'Claude Desktop', icon: 'claude-desktop', format: 'json' },
  { id: 'trae', vendor: 'ByteDance', label: 'TRAE CLI', icon: 'trae', format: 'toml' },
  { id: 'qoder', vendor: 'Alibaba', label: 'Qoder CLI', icon: 'qoder', format: 'json' },
  { id: 'qwen-code', vendor: 'Alibaba', label: 'Qwen Code', icon: 'qwen-code', format: 'json' },
  { id: 'codebuddy', vendor: 'Tencent', label: 'CodeBuddy Code', icon: 'codebuddy', format: 'json' },
  { id: 'kimi-code', vendor: 'Moonshot AI', label: 'Kimi Code', icon: 'kimi-code', format: 'json' },
  { id: 'claude-code', vendor: 'Anthropic', label: 'Claude Code', icon: 'claude-code', format: 'json' },
  { id: 'zcode', vendor: 'Z.ai / 智谱', label: 'ZCode', icon: 'zcode', format: 'json', key: 'mcp.servers' },
  { id: 'gemini-cli', vendor: 'Google', label: 'Gemini CLI', icon: 'gemini-cli', format: 'json' },
  { id: 'copilot-cli', vendor: 'GitHub / Microsoft', label: 'GitHub Copilot CLI', icon: 'copilot-cli', format: 'json' },
  { id: 'kiro', vendor: 'Amazon AWS', label: 'Kiro', icon: 'kiro', format: 'json' },
  { id: 'junie', vendor: 'JetBrains', label: 'Junie', icon: 'junie', format: 'json' },
  { id: 'windsurf', vendor: 'Cognition', label: 'Windsurf / Cascade', icon: 'windsurf', format: 'json' },
  { id: 'devin-desktop', vendor: 'Cognition', label: 'Devin Desktop / Cascade', icon: 'devin-desktop', format: 'json' },
  { id: 'opencode', vendor: 'Anomaly', label: 'OpenCode', icon: 'opencode', format: 'json', key: 'mcp', commandArray: true },
  { id: 'cline', vendor: 'Cline', label: 'Cline', icon: 'cline', format: 'json' },
  { id: 'roo-code', vendor: 'Roo Code', label: 'Roo Code', icon: 'roo-code', format: 'json' },
  { id: 'qwenwork', vendor: 'Alibaba', label: '千问办公 / QwenWork', icon: 'qwenwork' },
  { id: 'qoder-ide', vendor: 'Alibaba', label: 'Qoder IDE', icon: 'qoder' },
  { id: 'trae-ide', vendor: 'ByteDance', label: 'TRAE IDE', icon: 'trae' },
  { id: 'trae-solo', vendor: 'ByteDance', label: 'TRAE SOLO', icon: 'trae' },
  { id: 'codebuddy-ide', vendor: 'Tencent', label: 'CodeBuddy IDE', icon: 'codebuddy' },
  { id: 'copilot-vscode', vendor: 'GitHub / Microsoft', label: 'GitHub Copilot (VS Code)', icon: 'copilot-cli', format: 'json', key: 'servers' },
  { id: 'continue', vendor: 'Continue', label: 'Continue', icon: 'continue' },
  { id: 'goose', vendor: 'Block', label: 'Goose', icon: 'goose' },
  { id: 'auggie', vendor: 'Augment Code', label: 'Auggie / Augment', icon: 'auggie', format: 'json' },
  { id: 'qodo', vendor: 'Qodo', label: 'Qodo', icon: 'qodo' },
  { id: 'zed', vendor: 'Zed Industries', label: 'Zed Agent', icon: 'zed' },
  { id: 'antigravity', vendor: 'Google', label: 'Antigravity', icon: 'antigravity', format: 'json' },
  { id: 'openclaw', vendor: 'OpenClaw', label: 'OpenClaw', icon: 'openclaw' },
  { id: 'nanoclaw', vendor: 'NanoClaw', label: 'NanoClaw', icon: 'nanoclaw' },
  { id: 'cherry-studio', vendor: 'Cherry Studio', label: 'Cherry Studio', icon: 'cherry-studio' },
  { id: 'dify', vendor: 'LangGenius', label: 'Dify', icon: 'dify' },
  { id: 'coze', vendor: 'ByteDance', label: '扣子 / Coze', icon: 'coze' },
  { id: 'n8n', vendor: 'n8n', label: 'n8n AI Agent', icon: 'n8n' },
  { id: 'flowise', vendor: 'FlowiseAI', label: 'Flowise', icon: 'flowise' },
  { id: 'manus', vendor: 'Manus', label: 'Manus', icon: 'manus' },
  { id: 'genspark', vendor: 'Genspark', label: 'Genspark', icon: 'genspark' },
  { id: 'perplexity', vendor: 'Perplexity', label: 'Perplexity Computer', icon: 'perplexity' },
  { id: 'kilo-code', vendor: 'Kilo', label: 'Kilo Code', icon: 'kilo-code', format: 'json', key: 'mcp', commandArray: true },
  { id: 'amp', vendor: 'Amp', label: 'Amp', icon: 'amp', format: 'json', key: 'amp.mcpServers', literalKey: true },
  { id: 'droid', vendor: 'Factory', label: 'Droid', icon: 'droid', format: 'json' },
  { id: 'iflow', vendor: 'iFlow / 心流', label: 'iFlow CLI', icon: 'iflow', format: 'json' },
  { id: 'comate', vendor: 'Baidu / 百度', label: 'Comate', icon: 'comate', format: 'json' },
  { id: 'codearts', vendor: 'Huawei / 华为', label: 'CodeArts Agent', icon: 'codearts' },
  { id: 'hermes', vendor: 'Nous Research', label: 'Hermes Agent', icon: 'hermes', format: 'yaml', key: 'mcp_servers' },
  { id: 'lingma', vendor: 'Alibaba', label: '通义灵码 / Lingma', icon: 'lingma' },
  { id: 'workbuddy', vendor: 'Tencent', label: 'WorkBuddy', icon: 'workbuddy' },
  { id: 'kimi-claw', vendor: 'Moonshot AI', label: 'Kimi Claw', icon: 'kimi-claw' },
  { id: 'minimax-agent', vendor: 'MiniMax', label: 'MiniMax Agent / Mavis', icon: 'minimax-agent' },
  { id: 'minimax-code', vendor: 'MiniMax', label: 'MiniMax Code', icon: 'minimax-code' },
  { id: 'minimax-design', vendor: 'MiniMax', label: 'MiniMax Design', icon: 'minimax-design' },
  { id: 'custom', vendor: '自定义 / Custom', label: '其他 Agent / Other Agent', icon: 'custom' },
].sort((a,b) => {
  if (a.id === 'custom' || b.id === 'custom') return a.id === b.id ? 0 : a.id === 'custom' ? 1 : -1;
  const name = agent => /^[a-z]/i.test(agent.label) ? agent.label : agent.label.split(' / ').at(-1);
  return name(a).localeCompare(name(b), 'en', {sensitivity:'base',numeric:true});
});

export function registerAgentConfig({ agentId, path, home = homedir() }) {
  const agent = AGENT_CATALOG.find(agent => agent.id === agentId);
  if (!agent) throw new Error('Unknown Agent');
  if (!isAbsolute(path) || !['.json', '.jsonc', '.toml', '.yaml', '.yml'].includes(extname(path).toLowerCase())) throw new Error('Choose an absolute JSON, JSONC, YAML or TOML configuration path');
  const stat = statSync(path);
  if (!stat.isFile() || stat.size > 2 * 1024 * 1024) throw new Error('Configuration must be a file smaller than 2 MB');
  const format = extname(path).toLowerCase() === '.toml' ? 'toml' : ['.yaml','.yml'].includes(extname(path).toLowerCase()) ? 'yaml' : 'json';
  let key = 'mcp_servers', literalKey = false, commandArray = false;
  if (['json','yaml'].includes(format)) {
    const obj = parseConfig(readFileSync(path, 'utf8'), format);
    const candidate = ['mcp_servers', 'mcpServers', 'mcp.servers', 'mcp', 'servers', 'amp.mcpServers'].find(candidate => {
      const entry = candidate === 'amp.mcpServers' ? obj[candidate] : candidate.split('.').reduce((value, key) => value?.[key], obj);
      return entry && typeof entry === 'object' && !Array.isArray(entry) && Object.values(entry).some(server => server && typeof server === 'object' && (server.command || server.url || server.httpUrl || server.serverUrl));
    });
    if (!candidate) throw new Error('No supported MCP entries in this configuration');
    key = candidate;
    literalKey = key === 'amp.mcpServers';
    const entries = jsonServers(obj, { key, literalKey });
    commandArray = Object.values(entries).some(server => Array.isArray(server.command));
  } else if (!toml.listMcpServers(readFileSync(path, 'utf8')).length) throw new Error('No MCP entries in this TOML configuration');
  const file = join(home, '.mcp-tripwire', 'agent-configs.json');
  let entries = [];
  if (existsSync(file)) entries = parseConfig(readFileSync(file, 'utf8')).entries || [];
  const id = agentId + '@custom-' + createHash('sha256').update(path).digest('hex').slice(0, 12);
  entries = entries.filter(entry => entry.id !== id);
  entries.push({ id, agentId, path, key, format, literalKey, commandArray });
  mkdirSync(dirname(file), { recursive: true });
  const temporary = file + '.' + process.pid + '.tmp';
  writeFileSync(temporary, JSON.stringify({ entries }, null, 2));
  renameSync(temporary, file);
  return { id, path };
}

function jsonServers(obj, host) {
  return (host.keyPath || (host.literalKey ? [host.key] : host.key.split('.'))).reduce((value, key) => value?.[key], obj);
}

export function agentInstalled(agent, { home = homedir(), env = process.env } = {}) {
  const markers = { pi: ['.pi'], hermes: ['.hermes'], 'command-code': ['.commandcode'], 'claude-code': ['.claude', '.claude.json'], zcode: ['.zcode'], codex: ['.codex'], cursor: ['.cursor'], trae: ['.trae'], qoder: ['.qoder', '.qoder-cn'], 'qwen-code': ['.qwen'], codebuddy: ['.codebuddy'], 'kimi-code': ['.kimi-code', '.kimi'], 'gemini-cli': ['.gemini'], 'copilot-cli': ['.copilot'], kiro: ['.kiro'], junie: ['.junie'], windsurf: ['.codeium/windsurf'], opencode: ['.config/opencode'], cline: ['.cline'], 'qwenwork': ['.qwenwork'], 'continue': ['.continue'], goose: ['.config/goose'], 'openclaw': ['.openclaw'] };
  return (markers[agent.id] || []).some(marker => existsSync(join(home, marker))) ||
    existsSync(join(home, 'Desktop', agent.label.split(' / ')[0] + '.lnk')) ||
    (agent.id === 'zcode' && existsSync(join(env.LOCALAPPDATA || join(home, 'AppData', 'Local'), 'Programs', 'ZCode', 'ZCode.exe')));
}

export function knownHosts({ home = homedir(), system = platform(), env = process.env, projects } = {}) {
  const appData = env.APPDATA || join(home, 'AppData', 'Roaming');
  const paths = {
    pi: [join(env.PI_CODING_AGENT_DIR || join(home, '.pi', 'agent'), 'mcp.json')],
    hermes: [join(home, '.hermes', 'config.yaml')],
    'command-code': [join(home, '.commandcode', 'mcp.json')],
    codex: [join(home, '.codex', 'config.toml')],
    cursor: [join(home, '.cursor', 'mcp.json')],
    'claude-desktop': [system === 'darwin' ? join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json') : join(appData, 'Claude', 'claude_desktop_config.json')],
    trae: [join(home, '.trae', 'traecli.toml')],
    qoder: [join(home, '.qoder', 'settings.json'), join(home, '.qoder-cn', 'settings.json')],
    'qwen-code': [join(home, '.qwen', 'settings.json')],
    codebuddy: [join(home, '.codebuddy', 'mcp.json'), join(home, '.codebuddy', '.mcp.json')],
    'kimi-code': [join(env.KIMI_CODE_HOME || join(home, '.kimi-code'), 'mcp.json'), join(home, '.kimi', 'mcp.json')],
    'claude-code': [join(home, '.claude.json')],
    zcode: [join(home, '.zcode', 'cli', 'config.json')],
    'gemini-cli': [join(home, '.gemini', 'settings.json')],
    'copilot-cli': [join(env.COPILOT_HOME || join(home, '.copilot'), 'mcp-config.json')],
    kiro: [join(home, '.kiro', 'settings', 'mcp.json'), join(home, '.kiro', 'mcp.json')],
    junie: [join(home, '.junie', 'mcp', 'mcp.json')],
    windsurf: [join(home, '.codeium', 'windsurf', 'mcp_config.json')],
    'devin-desktop': [system === 'win32' ? join(appData, 'devin', 'mcp_config.json') : join(env.XDG_CONFIG_HOME || join(home, '.config'), 'devin', 'mcp_config.json')],
    opencode: [join(env.XDG_CONFIG_HOME || join(home, '.config'), 'opencode', 'opencode.json'), join(env.XDG_CONFIG_HOME || join(home, '.config'), 'opencode', 'opencode.jsonc')],
    cline: [join(env.CLINE_DIR || join(home, '.cline'), 'data', 'settings', 'cline_mcp_settings.json'), join(appData, 'Code', 'User', 'globalStorage', 'saoudrizwan.claude-dev', 'settings', 'cline_mcp_settings.json')],
    'roo-code': [join(appData, 'Code', 'User', 'globalStorage', 'rooveterinaryinc.roo-cline', 'settings', 'mcp_settings.json')],
    'copilot-vscode': [join(appData, 'Code', 'User', 'mcp.json')],
    auggie: [join(home, '.augment', 'settings.json')],
    antigravity: [join(home, '.gemini', 'config', 'mcp_config.json'), join(home, '.gemini', 'antigravity', 'mcp_config.json')],
    'kilo-code': [join(env.XDG_CONFIG_HOME || join(home, '.config'), 'kilo', 'kilo.json'), join(env.XDG_CONFIG_HOME || join(home, '.config'), 'kilo', 'kilo.jsonc')],
    amp: [join(env.XDG_CONFIG_HOME || join(home, '.config'), 'amp', 'settings.json'), join(env.XDG_CONFIG_HOME || join(home, '.config'), 'amp', 'settings.jsonc')],
    droid: [join(home, '.factory', 'mcp.json')],
    iflow: [join(home, '.iflow', 'settings.json')],
    comate: [join(home, '.comate', 'mcp.json')],
  };
  const hosts = AGENT_CATALOG.filter(agent => paths[agent.id] && (agent.id !== 'claude-desktop' || ['win32', 'darwin'].includes(system))).map(agent => ({
    ...agent, path: paths[agent.id].find(path => existsSync(path)) ?? paths[agent.id][0],
    agentId: agent.id, installed: agentInstalled(agent, { home, env }), scope: 'user',
    key: agent.key || (agent.format === 'toml' ? 'mcp_servers' : 'mcpServers'),
  }));
  try {
    const localRoot = join(home, '.commandcode', 'projects');
    const base = hosts.find(h => h.id === 'command-code');
    for (const entry of readdirSync(localRoot, {withFileTypes:true}).filter(e=>e.isDirectory()).slice(0,50)) {
      const path = join(localRoot,entry.name,'mcp.json');
      if (existsSync(path)) hosts.push({...base,id:'command-code@local-'+createHash('sha256').update(path).digest('hex').slice(0,12),path,scope:'project',project:entry.name});
    }
  } catch {}
  let claude = {};
  try { claude = parseConfig(readFileSync(join(home, '.claude.json'), 'utf8')); } catch {}
  let recent = [];
  try { const settings = parseConfig(readFileSync(join(home, '.zcode', 'v2', 'setting.json'), 'utf8')); recent = Array.isArray(settings.recentProjects) ? settings.recentProjects.filter(path => typeof path === 'string') : []; } catch {}
  const roots = [...new Set(projects ?? [process.cwd(), ...Object.keys(claude.projects || {}), ...recent])].slice(0, 50);
  for (const root of roots) {
    const suffix = createHash('sha256').update(root).digest('hex').slice(0, 12);
    if (Object.keys(claude.projects?.[root]?.mcpServers || {}).length) {
      const base = hosts.find(h => h.id === 'claude-code');
      hosts.push({ ...base, id: 'claude-code@' + suffix, scope: 'project', project: root, keyPath: ['projects', root, 'mcpServers'] });
    }
    const projectPaths = { pi: ['.pi/mcp.json'], 'command-code': agentInstalled({id:'command-code',label:'Command Code'}, {home,env}) ? ['.mcp.json'] : [], 'claude-code': ['.mcp.json'], zcode: ['.zcode/config.json'], cursor: ['.cursor/mcp.json'], 'gemini-cli': ['.gemini/settings.json'], kiro: ['.kiro/settings/mcp.json'], junie: ['.junie/mcp/mcp.json'], 'copilot-vscode': ['.vscode/mcp.json'], opencode: ['opencode.json', 'opencode.jsonc'], 'roo-code': ['.roo/mcp.json'], auggie: ['.augment/settings.local.json', '.augment/settings.json'], droid: ['.factory/mcp.json'], iflow: ['.iflow/settings.json'], comate: ['.comate/mcp.json'], 'kilo-code': ['kilo.json', 'kilo.jsonc', '.kilo/kilo.json', '.kilo/kilo.jsonc'], amp: ['.amp/settings.json', '.amp/settings.jsonc'] };
    for (const [id, relatives] of Object.entries(projectPaths)) {
      for (const [index, relative] of relatives.entries()) {
        const path = join(root, relative);
        if (existsSync(path)) hosts.push({ ...hosts.find(h => h.id === id), id: id + '@' + suffix + '-file' + index, agentId: id, path, scope: 'project', project: root, keyPath: undefined });
      }
    }
  }
  try {
    const registry = parseConfig(readFileSync(join(home, '.mcp-tripwire', 'agent-configs.json'), 'utf8'));
    for (const entry of registry.entries || []) {
      const agent = AGENT_CATALOG.find(agent => agent.id === entry.agentId);
      if (agent && isAbsolute(entry.path) && ['json', 'toml', 'yaml'].includes(entry.format) && typeof entry.key === 'string' && typeof entry.id === 'string' && entry.id.startsWith(agent.id + '@custom-')) hosts.push({ ...agent, ...entry, scope: 'custom', installed: true });
    }
  } catch {}
  return hosts.sort((a,b) => AGENT_CATALOG.findIndex(agent=>agent.id===a.agentId)-AGENT_CATALOG.findIndex(agent=>agent.id===b.agentId));
}

export function detectAgent(id, options) {
  const profiles = knownHosts(options).filter(host => host.agentId === id || host.id === id);
  const agent = AGENT_CATALOG.find(agent => agent.id === id) || profiles[0];
  if (!agent) return null;
  const host = profiles.find(host => listServers(host).length) || profiles.find(host => existsSync(host.path)) || profiles[0];
  if (!host) return { id, vendor: agent.vendor, label: agent.label, installed: agentInstalled(agent, options), supported: false, exists: false, valid: false, path: '', servers: [], profiles: [] };
  const exists = existsSync(host.path);
  let valid = exists;
  try { if (exists && ['json', 'yaml'].includes(host.format)) parseConfig(readFileSync(host.path, 'utf8'), host.format); } catch { valid = false; }
  return { id, vendor: host.vendor, label: host.label, installed: host.installed || exists, supported: true, path: host.path, exists, valid,
    profiles: profiles.map(h => ({ id: h.id, path: h.path, scope: h.scope, exists: existsSync(h.path) })),
    servers: profiles.flatMap(h => listServers(h).map(name => ({ hostId: h.id, name, kind: readServer(h, name)?.kind ?? 'unknown', scope: h.scope, path: h.path }))) };
}

export function findHost(id) {
  return knownHosts().find((h) => h.id === id) ?? null;
}

export function listServers(host) {
  if (!host || !existsSync(host.path)) return [];
  const text = readFileSync(host.path, 'utf8');
  if (['json', 'yaml'].includes(host.format)) {
    try { return Object.keys(jsonServers(parseConfig(text, host.format), host) ?? {}); } catch { return []; }
  }
  return toml.listMcpServers(text);
}

// Returns { kind: 'stdio', command, args } | { kind: 'http', url } | null
export function readServer(host, name) {
  if (!existsSync(host.path)) return null;
  const text = readFileSync(host.path, 'utf8');

  if (['json', 'yaml'].includes(host.format)) {
    let obj;
    try { obj = parseConfig(text, host.format); } catch { return null; }
    const entry = jsonServers(obj, host)?.[name];
    if (!entry) return null;
    if (entry.enable === false || entry.enabled === false || entry.disabled === true) return null;
    if (Array.isArray(entry.command)) return { kind: 'stdio', command: entry.command[0], args: entry.command.slice(1) };
    if (entry.command) return { kind: 'stdio', command: entry.command, args: Array.isArray(entry.args) ? entry.args : [] };
    if (entry.url || entry.httpUrl || entry.serverUrl) return { kind: 'http', url: entry.httpUrl || entry.serverUrl || entry.url };
    return null;
  }

  const entry = toml.readServerEntry(text, name);
  if (entry?.command) return { kind: 'stdio', command: entry.command, args: entry.args };
  if (entry?.url) return { kind: 'http', url: entry.url };
  return null;
}

// Every MCP server declared by every host we know about, in one list. Used by
// auto-discovery so the console and the CLI agree on what exists.
export function enumerateServers() {
  const out = [];
  for (const host of knownHosts()) {
    if (!existsSync(host.path)) continue;
    for (const name of listServers(host)) {
      const info = readServer(host, name);
      if (info) out.push({ hostId: host.id, name, info });
    }
  }
  return out;
}

export function wrappedCommand({ launcher, name, command, args, statePath, logPath, enforce }) {
  const a = [...launcher.prefix, 'wrap', '--name', name];
  if (statePath) a.push('--state', statePath);
  if (logPath) a.push('--log', logPath);
  if (enforce) a.push('--enforce', enforce);
  a.push('--', command, ...args);
  // Launch through the current Node executable so the wrap does not depend on
  // mcp-tripwire being on PATH.
  return { command: launcher.command, args: a };
}

export function planWrap({ host, serverName, launcher, statePath, logPath, enforce, listen = defaultListen() }) {
  // A different Agent or project can use the same MCP name. Keep their pins
  // and HTTP routes independent instead of overwriting another channel.
  const channelName = host.id ? host.id + '::' + serverName : serverName;
  const original = readServer(host, serverName);
  if (!original) {
    return { ok: false, reason: `server "${serverName}" not found, or it declares neither "command" nor "url", in ${host.path}` };
  }

  if (original.kind === 'http') {
    return {
      ok: true,
      kind: 'http',
      channelName,
      original,
      wrapped: { url: localUrlFor(listen, channelName, original.url) },
      route: { upstream: original.url, ...(enforce ? { posture: enforce } : {}) },
      listen,
    };
  }

  return {
    ok: true,
    kind: 'stdio',
    channelName,
    original,
    wrapped: wrappedCommand({ launcher, name: channelName, command: original.command, args: original.args, statePath, logPath, enforce }),
  };
}

export function renderSnippet({ host, serverName, wrapped }) {
  if (['json', 'yaml'].includes(host.format)) {
    const entry = wrapped.url !== undefined ? { url: wrapped.url } : { command: wrapped.command, args: wrapped.args };
    return JSON.stringify({ [host.key]: { [serverName]: entry } }, null, 2);
  }
  if (wrapped.url !== undefined) {
    return `[${host.key}.${serverName}]\nurl = ${JSON.stringify(wrapped.url)}`;
  }
  return `[${host.key}.${serverName}]\ncommand = ${JSON.stringify(wrapped.command)}\nargs = [${wrapped.args.map((a) => JSON.stringify(a)).join(', ')}]`;
}

export function applyWrap({ host, serverName, wrapped }) {
  if (!existsSync(host.path)) return { ok: false, reason: `config not found: ${host.path}` };
  const text = readFileSync(host.path, 'utf8');
  const isHttp = wrapped.url !== undefined;

  if (['json', 'yaml'].includes(host.format)) {
    let obj;
    try { obj = parseConfig(text, host.format); } catch (err) { return { ok: false, reason: `config is not valid JSON: ${err.message}` }; }
    const entries = jsonServers(obj, host);
    const entry = entries?.[serverName];
    if (!entry) return { ok: false, reason: `server "${serverName}" missing` };

    // Validate before touching disk so a failure cannot leave a stray backup.
    const urlKey = Object.hasOwn(entry, 'httpUrl') ? 'httpUrl' : Object.hasOwn(entry, 'serverUrl') ? 'serverUrl' : 'url';
    const next = isHttp ? { ...entry, [urlKey]: wrapped.url } : host.commandArray ? { ...entry, command: [wrapped.command, ...wrapped.args] } : { ...entry, command: wrapped.command, args: wrapped.args };
    if (host.commandArray && !isHttp) delete next.args;
    if (isHttp) { delete next.command; delete next.args; }

    const location = [...(host.keyPath || (host.literalKey ? [host.key] : host.key.split('.'))), serverName];
    let updated;
    if (host.format === 'yaml') {
      const doc = parseDocument(text);
      for (const key of Object.keys(entry)) if (!Object.hasOwn(next, key)) doc.deleteIn([...location, key]);
      for (const [key,value] of Object.entries(next)) if (JSON.stringify(entry[key]) !== JSON.stringify(value)) doc.setIn([...location,key],value);
      updated = doc.toString();
    } else updated = applyEdits(text, modify(text, location, next, { formattingOptions: { insertSpaces: true, tabSize: 2 } }));
    parseConfig(updated, host.format);
    const backup = `${host.path}.tripwire-backup-${Date.now()}`;
    copyFileSync(host.path, backup);
    writeFileSync(host.path, updated);
    return { ok: true, backup, verify: () => readServer(host, serverName) };
  }

  const res = toml.rewriteServerEntry(text, serverName, isHttp ? { url: wrapped.url } : { command: wrapped.command, args: wrapped.args });
  if (!res.ok) return { ok: false, reason: res.reason };

  const backup = `${host.path}.tripwire-backup-${Date.now()}`;
  copyFileSync(host.path, backup);
  writeFileSync(host.path, res.text);

  // Verify by re-reading; restore the backup if the rewrite did not land.
  const after = readServer(host, serverName);
  const landed = isHttp ? after?.kind === 'http' && after.url === wrapped.url : after?.kind === 'stdio' && after.command === wrapped.command;
  if (!landed) {
    copyFileSync(backup, host.path);
    return { ok: false, reason: 'post-write verification failed; original config restored' };
  }
  return { ok: true, backup };
}
