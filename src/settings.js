import { join } from 'node:path';
import { dataDir } from './paths.js';
import { readProtectedJson, writeProtectedJson } from './integritystore.js';

// One plain-language switch for the whole product.
//
//   "observe" — watch and record, change nothing (the default, and what a new
//               user should start on)
//   "protect" — act on what we find
//
// Everything technical (postures, per-server policy) derives from this, so a
// non-specialist never has to learn our vocabulary to use the product.

export function defaultSettingsPath() {
  return join(dataDir(), 'settings.json');
}

export function loadSettings(path = defaultSettingsPath()) {
  try {
    const parsed = readProtectedJson(path, { protection: 'observe' });
    if (!['observe', 'protect'].includes(parsed.protection)) throw new Error('Invalid protection mode');
    return { protection: parsed.protection };
  } catch {
    // A damaged file must not silently disable a previously enabled defence.
    return { protection: 'protect', integrityError: 'Protection mode configuration was rejected; restore a trusted backup' };
  }
}

export function saveSettings(settings, path = defaultSettingsPath()) {
  if (!['observe', 'protect'].includes(settings.protection)) throw new Error('Invalid protection mode');
  const clean = { protection: settings.protection };
  writeProtectedJson(path, clean);
  return clean;
}

export function postureFor(protection) {
  return protection === 'protect' ? 'block' : 'warn';
}

// Plain-language labels for the activity list, so the UI never shows a normal
// person an internal event name.
export const EVENT_LABELS = {
  'tripwire-start': '开始保护一个本地工具',
  'bridge-listening': '开始监视一个本机通道',
  'activity': '记录到一次代码执行',
  'tools-list': '读取了工具清单',
  'tools-call': '调用了一个工具',
  'static-finding': '发现可疑的工具描述',
  'tool-risk': '识别出高风险能力',
  'manifest-unpinned': '这个工具还没有被锁定',
  'RUG-PULL-SUSPECTED': '工具被偷偷改动了',
  'enforced-block': '已阻止一次可疑行为',
  'enforced-strip': '已隐藏一个可疑工具',
  'sensitive-request': '读取了敏感内容',
  'server-notification': '工具发来通知',
  'server-exit': '工具已退出',
  'bridge-parse-error': '本机通道上有一段内容无法识别',
  'console-wrap': '已为工具开启保护',
  'console-restore': '已恢复到之前的配置',
  'http-proxy-listening': '开始为远程服务器做中转',
  'upstream-error': '远程服务器连接出错',
  'unreadable': '有一段记录读不出来',
};

export function labelFor(event) {
  return EVENT_LABELS[event] ?? event;
}
