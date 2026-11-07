import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { hashTools, saveState, updateState, setPin } from '../../src/manifest.js';
import { emptyAdvanced, saveAdvanced, loadAdvanced, defaultAdvancedPath } from '../../src/advanced.js';
import { defaultStatePath } from '../../src/paths.js';
import { root, pathFor, tools, setControl, control, ledgerCount } from './common.js';
async function main() {
const desktop = process.argv.includes('--desktop');
const rulesPath = desktop ? defaultAdvancedPath() : pathFor('advanced.json');
const backupPath = pathFor('original-advanced.json');
function originalRules() {
  if (!desktop) return emptyAdvanced();
  const rules = loadAdvanced(existsSync(backupPath) ? backupPath : rulesPath);
  if (rules.integrityError) throw new Error(rules.integrityError);
  return rules;
}
function init() {
  try { unlinkSync(pathFor('stop.flag')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (desktop && !existsSync(backupPath)) saveAdvanced(originalRules(), backupPath);
  setControl();
  saveState(pathFor('manifest.json'), { pins: { OfflineLab: { hash: hashTools(tools()).hash } }, pending: {} });
  if (desktop) updateState(defaultStatePath(), state => setPin(state, 'OfflineLab', hashTools(tools()).hash));
  writeFileSync(pathFor('policy.json'), JSON.stringify({ mode: 'warn', deception: true }));
  if (!desktop || !existsSync(rulesPath)) saveAdvanced(emptyAdvanced(), rulesPath);
  const config = { mcpServers: { TripwireOfflineLab: desktop
    ? { type: 'stdio', command: join(root, 'tripwire.exe'), args: ['wrap', '--name', 'OfflineLab', '--', join(root, 'runtime', 'node.exe'), join(root, 'server.cjs')] }
    : { command: join(root, 'runtime', 'node.exe'), args: [join(root, 'broker.cjs')] } } };
  writeFileSync(join(root, 'WorkBuddy-MCP.json'), JSON.stringify(config, null, 2));
}
if (process.argv.includes('--stop')) {
  writeFileSync(pathFor('stop.flag'), 'stop');
  if (desktop) {
    if (existsSync(backupPath)) saveAdvanced(originalRules(), rulesPath);
    // Remove only the test channel; user pins for real channels are preserved.
    updateState(defaultStatePath(), state => {
      if (state.pins) delete state.pins.OfflineLab;
      if (state.pending) delete state.pending.OfflineLab;
    });
  }
  console.log('Stop requested. Disable TripwireOfflineLab in WorkBuddy too.');
  process.exit(0);
}
if (process.argv.includes('--init')) { init(); console.log('Offline lab initialized.'); process.exit(0); }
function applyScenario(choice) {
  if (choice === '1') { setControl(); saveAdvanced(originalRules(), rulesPath); }
  if (choice === '2') setControl('changed');
  if (choice === '3') setControl('poison');
  if (choice === '4') { setControl(); saveAdvanced({ ...originalRules(), blockedTools: [...new Set([...originalRules().blockedTools, 'OfflineLab::lab_echo'])] }, rulesPath); }
  if (choice === '5') { setControl(); saveAdvanced({ ...originalRules(), baselineMode: 'block', checkNewFields: true, baseline: { ...originalRules().baseline, 'OfflineLab::lab_echo': { channel: 'OfflineLab', tool: 'lab_echo', calls: 20, argKeys: ['name','arguments','arguments.label','arguments.url'], destinations: ['safe.example'] } } }, rulesPath); }
  if (choice === '6') setControl('clean', false);
}
const scenarioIndex = process.argv.indexOf('--scenario');
if (scenarioIndex !== -1) {
  const choice = process.argv[scenarioIndex + 1];
  if (!['1','2','3','4','5'].includes(choice)) throw new Error('Invalid scenario');
  if (!existsSync(pathFor('policy.json'))) throw new Error('Prepare the lab first');
  applyScenario(choice); console.log('场景已设置，模拟执行次数：', ledgerCount()); return;
}
if (!existsSync(pathFor('policy.json'))) init();
const rl = createInterface({ input: stdin, output: stdout });
for (;;) {
  console.log('\n离线测试控制台 / Offline Lab');
  if (desktop) console.log('当前使用真正的 tripwire.exe。阻断/观察模式请在防护软件界面切换；下方选项 6 不切换桌面模式。');
  console.log('1 正常清单 + 阻断模式\n2 信任叛变：仅修改工具描述\n3 投毒形态：描述加入不可见字符\n4 自定义黑名单：禁止 lab_echo\n5 冻结测试基线：拒绝新域名与新字段\n6 观察模式对照\n7 显示执行次数与状态\n0 退出控制台（WorkBuddy 中的 MCP 需单独停用）');
  const choice = (await rl.question('选择：')).trim();
  if (choice === '0') break;
  applyScenario(choice);
  console.log('状态：', control(), '模拟服务器累计执行次数：', ledgerCount());
  if (choice === '2' || choice === '3') console.log('请在 WorkBuddy 刷新 MCP 工具清单或停用后重新启用，再调用。');
}
rl.close();

}
main().catch(error => { console.error(error); process.exitCode = 1; });
