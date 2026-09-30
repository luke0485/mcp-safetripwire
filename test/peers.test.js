import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNetstat, parseTasklistCsv, imageAllowed, basenameOf, isLoopbackHost } from '../src/peers.js';

const NETSTAT = `
活动连接

  协议  本地地址          外部地址        状态           PID
  TCP    127.0.0.1:9877    127.0.0.1:51234   ESTABLISHED     4242
  TCP    127.0.0.1:9877    0.0.0.0:0         LISTENING       4242
  TCP    127.0.0.1:8789    127.0.0.1:51235   ESTABLISHED     9999
  TCP    [::1]:9877        [::1]:51236       ESTABLISHED     5151
`;

test('parseNetstat reads Windows rows and can filter by local port', () => {
  const all = parseNetstat(NETSTAT);
  assert.equal(all.length, 4);
  const bridge = parseNetstat(NETSTAT, 9877);
  assert.equal(bridge.length, 3);
  assert.deepEqual(bridge[0], { localPort: 9877, remoteHost: '127.0.0.1', remotePort: 51234, state: 'ESTABLISHED', pid: 4242 });
});

test('parseNetstat ignores non-TCP chatter', () => {
  assert.deepEqual(parseNetstat('UDP 127.0.0.1:53 *:* 123\nnoise'), []);
});

test('isLoopbackHost recognises the loopback spellings', () => {
  assert.equal(isLoopbackHost('127.0.0.1'), true);
  assert.equal(isLoopbackHost('[::1]'), true);
  assert.equal(isLoopbackHost('::1'), true);
  assert.equal(isLoopbackHost('localhost'), true);
  assert.equal(isLoopbackHost('10.0.0.5'), false);
});

test('parseTasklistCsv pulls the image and pid out of the CSV row', () => {
  assert.deepEqual(parseTasklistCsv('"blender.exe","4242","Console","1","123,456 K"'), { image: 'blender.exe', pid: 4242 });
  assert.equal(parseTasklistCsv('INFO: No tasks are running'), null);
});

test('an empty allowlist means no restriction (audit-only default)', () => {
  assert.equal(imageAllowed('blender.exe', []), true);
  assert.equal(imageAllowed('anything.exe', null), true);
});

test('imageAllowed matches on file name, case-insensitively, with or without .exe', () => {
  assert.equal(imageAllowed('C:\\Program Files\\Blender\\blender.exe', ['blender.exe']), true);
  assert.equal(imageAllowed('BLENDER.EXE', ['blender.exe']), true);
  assert.equal(imageAllowed('blender.exe', ['BLENDER']), true);
  assert.equal(imageAllowed('blender.exe', ['C:\\Program Files\\Blender\\blender.exe']), true);
});

test('imageAllowed rejects anything not named', () => {
  assert.equal(imageAllowed('evil.exe', ['blender.exe']), false);
  assert.equal(imageAllowed('', ['blender.exe']), false);
  assert.equal(imageAllowed('notepad.exe', ['blender.exe', 'codex.exe']), false);
});

test('basenameOf survives both separators', () => {
  assert.equal(basenameOf('C:\\a\\b\\c.exe'), 'c.exe');
  assert.equal(basenameOf('/usr/bin/python3'), 'python3');
});
