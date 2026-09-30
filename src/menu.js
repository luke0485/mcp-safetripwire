#!/usr/bin/env node
// Interactive front door for double-click use from a desktop shortcut.
// Everything here just shells out to the same CLI the power user would call,
// so the menu can never drift from the real behaviour.

import { createInterface } from 'node:readline/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import { defaultLogPath, defaultStatePath } from './paths.js';

const CLI = join(dirname(fileURLToPath(import.meta.url)), 'cli.js');

const MENU = `
  MCP Tripwire — MCP 安全 broker
  ────────────────────────────────────────────────
   1  环境与宿主状态            doctor
   2  审计一个 stdio 服务器      scan
   3  固定工具面（防 rug pull）  approve
   4  接入宿主（预演，不写盘）   install
   5  启动 HTTP 反向代理         serve
   6  查看审计日志              audit.jsonl
   7  打开文档与源代码路径
   0  退出
`;

function run(args) {
  const res = spawnSync(process.execPath, [CLI, ...args], { stdio: 'inherit' });
  if (res.error) process.stderr.write(`无法运行: ${res.error.message}\n`);
  return res.status ?? 1;
}

function askParts(question, rl) {
  return rl.question(question).then((line) => line.trim().split(/\s+/).filter(Boolean));
}

function showAudit() {
  const path = defaultLogPath();
  process.stdout.write(`\n审计日志: ${path}\n`);
  if (!existsSync(path)) {
    process.stdout.write('（还没有日志；先跑一次 scan/approve/wrap）\n');
    return;
  }
  const lines = readFileSync(path, 'utf8').split('\n').filter(Boolean);
  const tail = lines.slice(-25);
  process.stdout.write(`共 ${lines.length} 条，最后 ${tail.length} 条：\n\n`);
  for (const line of tail) process.stdout.write(`  ${line}\n`);
}

function showDocs() {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  process.stdout.write('\n源代码与文档：\n');
  for (const rel of ['README.md', 'docs/DESIGN.md', 'docs/TESTPLAN.md', 'src']) {
    process.stdout.write(`  ${join(root, rel)}\n`);
  }
  process.stdout.write(`\n固定状态: ${defaultStatePath()}\n`);
}

const rl = createInterface({ input: process.stdin, output: process.stdout });

try {
  for (;;) {
    process.stdout.write(MENU);
    const choice = (await rl.question('  选择> ')).trim();

    if (choice === '0') break;

    if (choice === '1') {
      run(['doctor']);
    } else if (choice === '2') {
      const cmd = await rl.question('  启动命令（例: uvx blender-mcp）> ');
      const parts = cmd.trim().split(/\s+/).filter(Boolean);
      if (parts.length === 0) process.stdout.write('  已取消（命令为空）\n');
      else run(['scan', '--name', parts[0], '--', ...parts]);
    } else if (choice === '3') {
      const cmd = await rl.question('  启动命令（同上）> ');
      const parts = cmd.trim().split(/\s+/).filter(Boolean);
      if (parts.length === 0) process.stdout.write('  已取消（命令为空）\n');
      else run(['approve', '--name', parts[0], '--', ...parts]);
    } else if (choice === '4') {
      const host = await rl.question('  宿主 id（留空自动检测；codex / claude-desktop / cursor）> ');
      const server = await rl.question('  服务器名（留空则只列出现有的）> ');
      const args = ['install'];
      if (host.trim()) args.push('--host', host.trim());
      if (server.trim()) args.push('--server', server.trim());
      run(args);
    } else if (choice === '5') {
      process.stdout.write('  启动 HTTP 代理（Ctrl+C 停止）\n');
      run(['serve']);
    } else if (choice === '6') {
      showAudit();
    } else if (choice === '7') {
      showDocs();
    } else {
      process.stdout.write(`  未知选项: ${choice}\n`);
    }
    process.stdout.write('\n');
  }
} finally {
  rl.close();
}
