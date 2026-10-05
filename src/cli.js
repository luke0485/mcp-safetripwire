#!/usr/bin/env node
import { isSea, selfDir, cliLauncher } from './selfpath.js';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { platform, release } from 'node:os';
import { runBroker } from './broker.js';
import { captureTools } from './capture.js';
import { hashTools, loadState, updateState, setPin, findPin } from './manifest.js';
import { scanManifest } from './scan.js';
import { classifyTools } from './risk.js';
import { createHttpProxy } from './httpproxy.js';
import { defaultStatePath, defaultLogPath, dataDir } from './paths.js';
import { knownHosts, findHost, listServers, planWrap, applyWrap, renderSnippet, readServer, enumerateServers } from './hosts.js';
import { runDiscovery, snapshotServers, unprotectedServers } from './discover.js';
import { protectAll } from './protectall.js';
import { loadRoutes, saveRoutes, defaultRoutesPath, defaultListen } from './routes.js';
import { createConsole, newToken, openBrowser } from './console.js';
import { createTcpBridge } from './tcpbridge.js';
import { loadSettings, postureFor } from './settings.js';
import { setLogFile } from './log.js';

const CLI_PATH = isSea() ? process.execPath : join(selfDir(), 'cli.js');

const USAGE = `mcp-safetripwire — transparent, LLM-free security broker for the Model Context Protocol

  mcp-safetripwire wrap    [--name N] [--enforce warn|strip|block] [--policy P] [--log L] [--state S] [--verbose] -- <cmd> [args...]
  mcp-safetripwire serve   [--routes R] [--listen host:port] [--state S] [--log L]
  mcp-safetripwire console [--port N] [--no-open] [--browser] [--token-file P] [--log L]
  mcp-safetripwire bridge  [--name N] [--listen host:port] [--upstream host:port] [--allow a,b] [--protect] [--log L]
  mcp-safetripwire protect-all [--write] [--enforce M] [--listen host:port]
  mcp-safetripwire watch
  mcp-safetripwire scan    [--name N] [--json] -- <cmd> [args...]
  mcp-safetripwire approve [--name N] [--state S] -- <cmd> [args...]
  mcp-safetripwire install [--host codex|claude-desktop|cursor] [--server N] [--write] [--enforce M] [--listen host:port]
  mcp-safetripwire doctor

Commands:
  wrap      Run a stdio MCP server behind mcp-safetripwire (put this in the host's config).
  serve     Run the local HTTP reverse proxy for url-based (remote) MCP servers.
  console   Open the local web console (graphical front end) in your browser.
  bridge    Watch a raw-TCP MCP channel in audit-only mode: it records every
            request and NEVER blocks, edits or re-frames anything.
  scan      Spawn a stdio server once; print its manifest, risk shape and static findings.
  approve   Pin the server's current tool manifest (TOFU), enabling rug-pull detection.
  install   Find a host config, show (or with --write, apply) the wrapped connection.
  doctor    Report environment, state, and which host configs were detected.

MCP connection types:
  stdio            -> intercepted by 'wrap' (the host launches mcp-safetripwire).
  Streamable HTTP  -> intercepted by 'serve' (the host's url is rewritten to localhost).
  legacy HTTP+SSE  -> also handled by 'serve' (the endpoint event is rewritten).
  raw TCP + NUL-delimited JSON (e.g. Blender's MCP add-on) -> observed by 'bridge' (audit only).

Exit codes: 0 ok, 1 usage error, 2 scan found critical findings, 3 runtime error.
`;

function splitArgs(argv) {
  const sep = argv.indexOf('--');
  const optArgs = sep === -1 ? argv : argv.slice(0, sep);
  const rest = sep === -1 ? [] : argv.slice(sep + 1);
  const opts = {};
  for (let i = 0; i < optArgs.length; i++) {
    const a = optArgs[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = optArgs[i + 1];
    if (next !== undefined && !next.startsWith('--')) { opts[key] = next; i++; }
    else opts[key] = true;
  }
  return { opts, rest };
}

function die(message, code = 1) {
  process.stderr.write(`${message}\n\n${USAGE}`);
  process.exit(code);
}

function serverName(opts, rest) {
  return typeof opts.name === 'string' ? opts.name : rest[0];
}

function listenFromOpts(opts) {
  const base = defaultListen();
  if (typeof opts.listen !== 'string') return base;
  const [host, port] = opts.listen.split(':');
  return { host: host || base.host, port: port ? Number(port) : base.port };
}

// The console token is never passed as a command-line value: on Windows any
// process running as the same user can read another process's command line, so
// a token in argv is a token handed to every program on the machine. Instead we
// keep it in a file (created 0600) and pass only the path.
function resolveToken(opts) {
  const file = typeof opts['token-file'] === 'string' ? opts['token-file'] : null;
  if (!file) return { token: newToken(), tokenFile: null };
  try {
    const existing = readFileSync(file, 'utf8').trim();
    if (existing.length >= 32) return { token: existing, tokenFile: file };
  } catch {
    /* fall through and create it */
  }
  const token = newToken();
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, token, { mode: 0o600 });
  return { token, tokenFile: file };
}

function parseHostPort(value) {
  const m = /^([^:]+):(\d+)$/.exec(String(value ?? ''));
  if (!m) return null;
  const port = Number(m[2]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  return { host: m[1], port };
}

// Wrapped in an async entry point so the file has no top-level await:
// the single-file build bundles to CommonJS, which does not allow it.
async function main() {
const [, , requestedCommand, ...argv] = process.argv;
const command = requestedCommand ?? 'console';
const { opts, rest } = splitArgs(argv);

switch (command) {
  case 'wrap': {
    if (rest.length === 0) die('wrap: missing server command after "--".');
    runBroker({
      name: serverName(opts, rest),
      command: rest[0],
      args: rest.slice(1),
      statePath: typeof opts.state === 'string' ? opts.state : defaultStatePath(),
      policyPath: typeof opts.policy === 'string' ? opts.policy : null,
      logPath: typeof opts.log === 'string' ? opts.log : defaultLogPath(),
      enforce: typeof opts.enforce === 'string' ? opts.enforce : postureFor(loadSettings().protection),
      getPosture: typeof opts.enforce === 'string' ? undefined : () => postureFor(loadSettings().protection),
      verbose: Boolean(opts.verbose),
    });
    break;
  }

  case 'serve': {
    const routesPath = typeof opts.routes === 'string' ? opts.routes : defaultRoutesPath();
    const routes = loadRoutes(routesPath);
    routes.listen = listenFromOpts(opts);
    if (Object.keys(routes.servers).length === 0) {
      die(`serve: no servers configured in ${routesPath}\n(add one with: mcp-safetripwire install --host <host> --server <name> --write)`);
    }
    setLogFile(typeof opts.log === 'string' ? opts.log : defaultLogPath());
    createHttpProxy({
      listen: routes.listen,
      routes,
      statePath: typeof opts.state === 'string' ? opts.state : defaultStatePath(),
      defaultPosture: postureFor(loadSettings().protection),
      getPosture: () => postureFor(loadSettings().protection),
      getRoutes: () => loadRoutes(routesPath),
    });
    process.stderr.write(
      `mcp-safetripwire serving ${Object.keys(routes.servers).length} route(s) on http://${routes.listen.host}:${routes.listen.port}\n` +
      `routes: ${Object.keys(routes.servers).join(', ')}\n`,
    );
    break;
  }

  case 'console': {
    const listen = { host: '127.0.0.1', port: typeof opts.port === 'string' ? Number(opts.port) : 8789 };
    if (!Number.isInteger(listen.port) || listen.port < 1024 || listen.port > 65535) die('console: --port must be 1024-65535');
    const { token, tokenFile } = resolveToken(opts);
    setLogFile(typeof opts.log === 'string' ? opts.log : defaultLogPath());
    createConsole({ listen, token });
    const url = `http://127.0.0.1:${listen.port}/?token=${token}`;
    process.stderr.write(
      `\nmcp-safetripwire console\n  ${url}\n\n` +
      `  The token is handed out once, then kept in an HttpOnly cookie.\n` +
      `  It is never put on a command line (process lists are readable by other\n` +
      `  programs running as you).` +
      (tokenFile ? `\n  Token file: ${tokenFile}` : '') + `\n` +
      `  Bound to 127.0.0.1 only, with Host/Origin validation.\n` +
      `  Pass --browser to open a normal browser tab instead of an app window.\n` +
      `  Stop it with Ctrl+C.\n\n`,
    );
    if (!opts['no-open']) openBrowser(url, { appWindow: !opts.browser });
    break;
  }

  case 'bridge': {
    const name = typeof opts.name === 'string' ? opts.name : 'bridge';
    const listen = parseHostPort(typeof opts.listen === 'string' ? opts.listen : '127.0.0.1:9877');
    const upstream = parseHostPort(typeof opts.upstream === 'string' ? opts.upstream : '127.0.0.1:9876');
    if (!listen || !upstream) die('bridge: --listen and --upstream must be host:port');
    const allowlist = typeof opts.allow === 'string' ? opts.allow.split(',').map((s) => s.trim()).filter(Boolean) : [];
    const protect = Boolean(opts.protect);
    setLogFile(typeof opts.log === 'string' ? opts.log : defaultLogPath());
    createTcpBridge({ name, listen, upstream, allowlist, protect });
    process.stderr.write(
      `\nmcp-safetripwire bridge —— 只记录，不拦截\n` +
      `  监视地址 : ${listen.host}:${listen.port}\n` +
      `  转发到   : ${upstream.host}:${upstream.port}\n\n` +
      `  把客户端的连接端口从 ${upstream.port} 改成 ${listen.port} 就开始记录。\n` +
      `  本程序不会修改被监视程序（例如 Blender）的任何设置，也不会阻断或改写任何数据。\n` +
      `  Ctrl+C 停止。\n\n`,
    );
    break;
  }

  case 'protect-all': {
    const write = Boolean(opts.write);
    const enforce = typeof opts.enforce === 'string' ? opts.enforce : null;
    const results = protectAll({ launcher: cliLauncher(), listen: listenFromOpts(opts), enforce, write });
    if (results.length === 0) {
      process.stdout.write('every declared tool is already protected.\n');
      process.exit(0);
    }
    for (const r of results) {
      if (!r.ok) process.stdout.write('  failed  ' + r.host + '/' + r.name + ': ' + r.reason + '\n');
      else if (r.applied) process.stdout.write('  protected ' + r.host + '/' + r.name + ' (' + r.kind + ')\n');
      else process.stdout.write('  would protect ' + r.host + '/' + r.name + ' (' + r.kind + ')\n');
    }
    if (!write) process.stdout.write('\ndry run — re-run with --write to apply.\n');
    process.exit(results.some((r) => !r.ok) ? 1 : 0);
    break;
  }

  case 'watch': {
    const result = runDiscovery({ enumerate: enumerateServers });
    if (result.seeded) {
      process.stdout.write('baseline recorded: ' + Object.keys(result.snapshot).length + ' tool(s) known.\n');
      process.exit(0);
    }
    const total = Object.keys(result.snapshot).length;
    const unprotected = unprotectedServers(result.snapshot).length;
    process.stdout.write('tools: ' + total + ', unprotected: ' + unprotected + '\n');
    for (const t of result.added) process.stdout.write('  NEW      ' + t.host + '/' + t.name + '  ' + t.target + '\n');
    for (const t of result.changed) process.stdout.write('  CHANGED  ' + t.host + '/' + t.name + '  was: ' + t.was + '\n');
    for (const t of result.removed) process.stdout.write('  GONE     ' + t.host + '/' + t.name + '\n');
    if (result.added.length + result.changed.length + result.removed.length === 0) process.stdout.write('  no changes\n');
    process.exit(0);
  }

  case 'scan': {
    if (rest.length === 0) die('scan: missing server command after "--".');
    const name = serverName(opts, rest);
    try {
      const { tools, serverInfo, protocolVersion } = await captureTools({ command: rest[0], args: rest.slice(1) });
      const { hash, count } = hashTools(tools);
      const findings = scanManifest(tools);
      const risks = classifyTools(tools);

      if (opts.json) {
        process.stdout.write(JSON.stringify({ name, hash, count, serverInfo, protocolVersion, tools, risks, findings }, null, 2) + '\n');
      } else {
        process.stdout.write(`\nserver : ${name}${serverInfo?.name ? ` (${serverInfo.name} ${serverInfo.version ?? ''})` : ''}\ntools  : ${count}\nsha256 : ${hash}\n\n`);
        const riskByTool = new Map(risks.map((r) => [r.tool, r.risks]));
        for (const tool of tools) {
          process.stdout.write(`  - ${tool.name}: ${String(tool.description ?? '').replace(/\s+/g, ' ').slice(0, 90)}\n`);
          const r = riskByTool.get(tool.name);
          if (r) process.stdout.write(`      risk: ${r.map((x) => `${x.severity}/${x.id}`).join(', ')}\n`);
        }
        process.stdout.write(`\nfindings (${findings.length}):\n`);
        for (const f of findings) process.stdout.write(`  [${f.severity}] ${f.rule} @ ${f.where}\n      ${f.detail}\n`);
        if (findings.length === 0) process.stdout.write('  none\n');
        process.stdout.write('\n');
      }
      process.exit(findings.some((f) => f.severity === 'critical') ? 2 : 0);
    } catch (err) {
      die(`scan: ${err.message}`, 3);
    }
    break;
  }

  case 'approve': {
    if (rest.length === 0) die('approve: missing server command after "--".');
    const name = serverName(opts, rest);
    const statePath = typeof opts.state === 'string' ? opts.state : defaultStatePath();
    try {
      const { tools } = await captureTools({ command: rest[0], args: rest.slice(1) });
      const { hash, count } = hashTools(tools);
      updateState(statePath, state => setPin(state, name, hash));
      process.stdout.write(`pinned "${name}" -> ${hash} (${count} tools)\nstate: ${statePath}\n`);
      process.exit(0);
    } catch (err) {
      die(`approve: ${err.message}`, 3);
    }
    break;
  }

  case 'install': {
    const hostId = typeof opts.host === 'string' ? opts.host : null;
    const host = hostId ? findHost(hostId) : knownHosts().find((h) => listServers(h).length > 0);
    if (!host) die(`install: no host config found${hostId ? ` for "${hostId}"` : ''}. Try: mcp-safetripwire doctor`);
    const servers = listServers(host);
    if (servers.length === 0) die(`install: no MCP servers declared in ${host.path}`);

    const chosen = typeof opts.server === 'string' ? opts.server : servers.length === 1 ? servers[0] : null;
    if (!chosen) {
      process.stdout.write(`multiple servers in ${host.path}; pass --server <name>:\n  ${servers.join('\n  ')}\n`);
      process.exit(1);
    }

    const listen = listenFromOpts(opts);
    const plan = planWrap({
      host,
      serverName: chosen,
      launcher: cliLauncher(),
      statePath: typeof opts.state === 'string' ? opts.state : null,
      logPath: typeof opts.log === 'string' ? opts.log : null,
      enforce: typeof opts.enforce === 'string' ? opts.enforce : null,
      listen,
    });
    if (!plan.ok) die(`install: ${plan.reason}`);

    process.stdout.write(`\nhost   : ${host.label} (${host.id})\nconfig : ${host.path}\nserver : ${chosen}\nkind   : ${plan.kind}\n\n`);
    if (plan.kind === 'http') {
      process.stdout.write(`before : url = ${plan.original.url}\n`);
      process.stdout.write(`after  : url = ${plan.wrapped.url}\n\n`);
      process.stdout.write(`remote servers are intercepted by a local proxy, not by wrapping a command.\n`);
      process.stdout.write(`after applying, run:\n  mcp-safetripwire serve\n\n`);
    } else {
      process.stdout.write(`before : ${plan.original.command} ${plan.original.args.join(' ')}\n`);
      process.stdout.write(`after  : ${plan.wrapped.command} ${plan.wrapped.args.join(' ')}\n\n`);
    }

    if (!opts.write) {
      process.stdout.write('dry run — nothing written. To apply:\n');
      process.stdout.write(`  mcp-safetripwire install --host ${host.id} --server ${chosen} --write\n\n`);
      process.stdout.write(`or paste this yourself into ${host.path}:\n\n${renderSnippet({ host, serverName: chosen, wrapped: plan.wrapped })}\n`);
      process.exit(0);
    }

    const result = applyWrap({ host, serverName: chosen, wrapped: plan.wrapped });
    if (!result.ok) die(`install: ${result.reason}`);
    process.stdout.write(`wrapped "${chosen}". backup: ${result.backup}\n`);

    if (plan.kind === 'http') {
      const routesPath = typeof opts.routes === 'string' ? opts.routes : defaultRoutesPath();
      const routes = loadRoutes(routesPath);
      routes.servers[chosen] = {
        ...(routes.servers[chosen] ?? {}),
        upstream: plan.original.url,
        posture: plan.route.posture,
        ...(typeof opts.state === 'string' ? { state: opts.state } : {}),
      };
      saveRoutes(routesPath, routes);
      process.stdout.write(`route added to ${routesPath}\n`);
      process.stdout.write(`now run: mcp-safetripwire serve\n`);
    } else {
      process.stdout.write(`restart ${host.label} to pick it up.\n`);
    }
    process.exit(0);
    break;
  }

  case 'doctor': {
    process.stdout.write(`\nmcp-safetripwire doctor\n`);
    process.stdout.write(`  platform : ${platform()} ${release()}\n`);
    process.stdout.write(`  node     : ${process.version} (${process.execPath})\n`);
    process.stdout.write(`  cli      : ${CLI_PATH}\n`);
    process.stdout.write(`  data dir : ${dataDir()}\n`);
    process.stdout.write(`  state    : ${defaultStatePath()}\n`);
    process.stdout.write(`  log      : ${defaultLogPath()}\n\n`);

    const state = loadState(defaultStatePath());
    const pins = Object.keys(state.pins ?? {});
    process.stdout.write(`  pinned servers (${pins.length}):${pins.length ? '' : ' none'}\n`);
    for (const name of pins) process.stdout.write(`    - ${name}: ${findPin(state, name).hash?.slice(0, 16)}…\n`);

    const routesPath = defaultRoutesPath();
    const routes = loadRoutes(routesPath);
    const routeNames = Object.keys(routes.servers ?? {});
    process.stdout.write(`\n  http routes (${routeNames.length}):${routeNames.length ? '' : ' none'}  [${routesPath}]\n`);
    for (const name of routeNames) process.stdout.write(`    - ${name} -> ${routes.servers[name].upstream}\n`);

    process.stdout.write('\n  host configs:\n');
    for (const host of knownHosts()) {
      const found = existsSync(host.path);
      const servers = listServers(host);
      process.stdout.write(`    [${found ? 'found' : '  -  '}] ${host.id.padEnd(15)} ${host.path}\n`);
      if (servers.length) {
        const kinds = servers.map((s) => {
          const kind = readServer(host, s)?.kind;
          return kind ? `${s}(${kind})` : s;
        });
        process.stdout.write(`             servers: ${kinds.join(', ')}\n`);
      }
    }
    process.stdout.write('\n');
    process.exit(0);
    break;
  }

  default:
    die(command ? `unknown command: ${command}` : USAGE);
}
}

main();
