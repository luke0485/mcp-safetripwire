import { spawn } from 'node:child_process';
import { checkConsoleReady } from '../../src/console-ready.js';
import { dirname, join } from 'node:path';
import { writeFileSync, mkdirSync, existsSync, openSync, closeSync, readFileSync } from 'node:fs';
const app = dirname(process.argv[1]);
const out = join(dirname(app), '测试结果');
mkdirSync(out, { recursive: true });
const exe = join(app, 'tripwire.exe');
mkdirSync(join(app, 'results'), { recursive: true });
const startupPath = join(app, 'results', 'startup-private.log');
const fd = openSync(startupPath, 'w', 0o600);
const child = spawn(exe, ['console', '--no-open', '--port', '18889'], { windowsHide: true, detached: true, stdio: ['ignore','ignore',fd] });
closeSync(fd);
let diagnostic = '', ready = false;
const deadline = setTimeout(() => { child.kill(); fail('启动超时'); }, 20000);
function fail(message) {
  clearTimeout(deadline); clearInterval(poll);
  writeFileSync(join(out, '启动失败.txt'), '\uFEFF' + message + '\r\n' + diagnostic.replace(/token=[^\s]+/g, 'token=[已隐藏]'));
  console.error('防护界面没有成功启动：' + message + '。请拍“测试结果/启动失败.txt”。');
  process.exitCode = 1;
}
child.on('error', error => fail(error.message));
child.on('exit', code => { if (!ready) fail('程序退出，退出码 ' + code); });
const poll = setInterval(async () => {
  try { diagnostic = readFileSync(startupPath, 'utf8').slice(-16000); } catch { return; }
  const match = diagnostic.match(/http:\/\/127\.0\.0\.1:18889\/\?token=([a-zA-Z0-9_-]+)/);
  if (!match || ready) return;
  ready = true;
  try {
    await checkConsoleReady(match[0]);
    const paths = [process.env['PROGRAMFILES(X86)'], process.env.PROGRAMFILES, process.env.LOCALAPPDATA].filter(Boolean).map(base => join(base, 'Microsoft','Edge','Application','msedge.exe'));
    const edge = paths.find(path => existsSync(path));
    if (!edge) throw new Error('未找到 Microsoft Edge，请先安装 Edge；不会打开旧版 IE 白屏界面');
    const browser = spawn(edge, ['--disable-gpu', '--new-window', match[0]], { windowsHide: true, detached: true, stdio: 'ignore' });
    browser.on('error', error => { child.kill(); fail(error.message); }); browser.unref();
    clearTimeout(deadline); clearInterval(poll); child.unref();
    console.log('防护界面服务检查成功，已用 Edge 打开（禁用 GPU，避开旧应用窗口白屏）。');
    process.exitCode = 0;
  } catch (error) { child.kill(); fail(error.message); }
}, 250);
