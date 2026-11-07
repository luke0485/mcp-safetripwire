import { spawn, spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, copyFileSync, renameSync } from 'node:fs';
import { parse } from 'jsonc-parser';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
const app = dirname(process.argv[1]);
const out = join(dirname(app), '测试结果');
const node = join(app, 'runtime', 'node.exe');
function installWorkBuddy() {
  const config = JSON.parse(readFileSync(join(app, 'WorkBuddy-MCP.json'), 'utf8'));
  const directory = join(homedir(), '.workbuddy');
  const path = join(directory, 'mcp.json');
  const errors = [];
  const existing = existsSync(path) ? parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''), errors, { allowTrailingComma: true }) : {};
  if (errors.length || !existing || typeof existing !== 'object' || Array.isArray(existing)
    || (existing.mcpServers !== undefined && (!existing.mcpServers || typeof existing.mcpServers !== 'object' || Array.isArray(existing.mcpServers)))) throw new Error('WorkBuddy 配置格式异常，未修改；请拍此提示。');
  mkdirSync(directory, { recursive: true });
  if (existsSync(path)) copyFileSync(path, path + '.tripwire-backup-' + Date.now());
  existing.mcpServers = { ...existing.mcpServers, TripwireOfflineLab: config.mcpServers.TripwireOfflineLab };
  const temp = path + '.tripwire-' + process.pid + '.tmp';
  writeFileSync(temp, JSON.stringify(existing, null, 2) + '\n'); renameSync(temp, path);
  console.log('已自动添加测试 MCP，保留原有 MCP，原配置已备份。重启 WorkBuddy 后查看 TripwireOfflineLab。无需改 JSON。');
}
function run(file, args = [], input) {
  const result = spawnSync(node, [join(app, file), ...args], { windowsHide: true, stdio: input ? ['pipe', 'inherit', 'inherit'] : 'inherit', input });
  if (result.error || result.status !== 0) throw new Error(result.error?.message ?? '操作失败，请查看上方信息');
}
function open(file, args = []) { const child = spawn(file, args, { windowsHide: true, detached: true, stdio: 'ignore' }); child.on('error', error => console.error(error.message)); child.unref(); }
function count() { try { return JSON.parse(readFileSync(join(app, 'results', 'manual', 'server-counter.json'), 'utf8')).calls; } catch { return 0; } }
const names = { 'tools-list': '已读取 MCP 工具清单', 'tools-call': 'MCP 工具调用', 'advanced-blocked': '黑名单或基线已拦截', 'argument-blocked': '危险字符串已拦截', 'argument-suspicious': '观察模式发现可疑字符串', 'RUG-PULL-SUSPECTED': '批准后的工具清单发生变化', 'enforced-block': '工具清单已拦截', 'static-finding': '工具描述扫描发现风险', 'decoy-triggered': '诱饵工具被触发并拦截', 'canary-exfil': '测试金丝雀字符串已拦截', 'tripwire-start': '防护代理已启动', 'server-exit': '模拟 MCP 已结束' };
function exportResult() {
  mkdirSync(out, { recursive: true });
  let rows = [];
  for (const suffix of ['.1', '']) {
    try { rows.push(...readFileSync(join(homedir(), '.mcp-tripwire', 'audit.jsonl' + suffix), 'utf8').split(/\r?\n/).flatMap(line => { try { const row = JSON.parse(line); return row.name === 'OfflineLab' ? [row] : []; } catch { return []; } })); } catch {}
  }
  writeFileSync(join(out, '原始测试事件.jsonl'), rows.map(row => JSON.stringify(row)).join('\n'));
  let snapshot;
  try { snapshot = JSON.parse(readFileSync(join(out, '所选场景.json'), 'utf8')); } catch {}
  const total = count();
  const text = ['MCP 绊线测试摘要', '导出时间：' + new Date().toLocaleString('zh-CN'), '模拟 MCP 累计执行次数：' + total,
    snapshot ? `最近选择：${snapshot.label}；切换前执行次数 ${snapshot.before}，目前增加 ${total - snapshot.before}` : '尚未通过此入口选择模拟场景。',
    '是否成功不能仅凭本摘要判断：阻断测试需要实际发起 MCP 调用，收到拒绝且执行次数不增加。',
    rows.length ? '最近测试事件：' : '还没有正式防护代理的 OfflineLab 审计事件，请先接入并实际调用 MCP。',
    ...rows.slice(-60).map(row => `${row.ts}  ${names[row.event] ?? row.event}${row.tool ? '（工具：' + row.tool + '）' : ''}${row.action ? ' 处理：' + row.action : ''}${row.reason || row.rule ? ' 原因：' + (row.reason ?? row.rule) : ''}`),
    '原始测试事件是按 OfflineLab 筛选的副本；不是完整审计链，不用于完整链验证。不会修改原始审计日志。'].join('\r\n');
  writeFileSync(join(out, '拍照给我看.txt'), '\uFEFF' + text);
  const local = join(app, 'results');
  if (existsSync(local)) {
    const reports = readdirSync(local).filter(name => /^case-[a-z0-9-]+$/.test(name) && existsSync(join(local, name, 'RESULTS.txt'))).sort((a,b) => a.localeCompare(b));
    if (reports.length) copyFileSync(join(local, reports.at(-1), 'RESULTS.txt'), join(out, '离线自测结果.txt'));
  }
  open('notepad.exe', [join(out, '拍照给我看.txt')]);
  console.log('已导出到：' + out + '\n把“测试结果”整个文件夹复制回 U 盘，或拍下打开的摘要和 WorkBuddy 实际工具返回。');
}
async function main() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  for (;;) {
    console.log('\n【仅在测试电脑用】先按 1，重启 WorkBuddy，然后按 2。');
    console.log('1 首次启动：自动接入 WorkBuddy + 打开防护界面\n2 正常对照：调用后应返回 OFFLINE LAB\n3 黑名单：同一句调用应被拒绝\n4 信任叛变：重新启用 MCP，清单应被拒绝\n5 描述投毒：重新启用 MCP，清单应被拒绝\n6 基线异常：加假网址参数，应被拒绝\n7 看结果：中文摘要，可拍照\n8 停止：结束模拟并恢复原规则\n9 自动离线自测：不需要跟 WorkBuddy 对话\n0 关闭菜单（不会停止 MCP）');
    const choice = (await rl.question('输入编号：')).trim();
    try {
      if (choice === '0') break;
      if (choice === '1') {
        run('control.cjs', ['--init', '--desktop']); installWorkBuddy(); run('launch.cjs');
        console.log('接入已写入。请重启 WorkBuddy，启用 TripwireOfflineLab，再按 2。防护界面选择阻断模式。');
      }
      if (['2','3','4','5','6'].includes(choice)) {
        if (!existsSync(join(app, 'WorkBuddy-MCP.json'))) throw new Error('先按 1。');
        const labels = {'2':'正常调用','3':'工具黑名单','4':'信任叛变','5':'描述投毒','6':'基线变化'};
        const controlChoice = {'2':'1','3':'4','4':'2','5':'3','6':'5'}[choice];
        run('control.cjs', ['--desktop','--scenario',controlChoice]);
        mkdirSync(out, {recursive:true}); writeFileSync(join(out,'所选场景.json'),JSON.stringify({label:labels[choice],before:count(),time:new Date().toISOString()}));
        if (['4','5'].includes(choice)) console.log('现在在 WorkBuddy 停用再启用 TripwireOfflineLab，清单应被拒绝。');
        else console.log('现在把下面这句话发给 WorkBuddy：\n仅调用 TripwireOfflineLab 的 lab_echo，label 填 offline-check，不使用其他工具。');
        if (choice === '6') console.log('再加一句：给 lab_echo 的 url 参数填 https://new.example/fake。');
        console.log(choice === '2' ? '应返回 OFFLINE LAB，执行次数增加。完成后按 7。' : '应被拒绝，执行次数不增加。完成后按 7。');
      }
      if (choice === '7') exportResult();
      if (choice === '8') { run('control.cjs',['--stop','--desktop']); console.log('已停止并恢复规则。在 WorkBuddy 停用 TripwireOfflineLab；防护后台如需退出，使用托盘退出。'); }
      if (choice === '9') run('test.cjs');
    } catch(error) {console.error('这一步失败：'+error.message+'。请拍这个窗口，不要继续下一步。');}
  }
  rl.close();
}
main().catch(error=>{console.error(error);process.exitCode=1;});