import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { setLogFile, log, verifyChain, createAuditMonitor } from '../src/log.js';

function freshLog() {
  const dir = mkdtempSync(join(tmpdir(), 'tw-log-'));
  const path = join(dir, 'audit.jsonl');
  setLogFile(path);
  return { dir, path };
}

function chainProps(obj) {
  const chain = obj.chain;
  assert.ok(chain && typeof chain.hash === 'string' && typeof chain.prev === 'string', 'every record must carry a chain link');
  return chain;
}

test('every record carries a chain link', () => {
  const { dir, path } = freshLog();
  try {
    const a = log('info', 'first', { n: 1 });
    const b = log('warn', 'second', { n: 2 });
    assert.ok(chainProps(a));
    assert.ok(chainProps(b));
    assert.equal(b.chain.prev, a.chain.hash, 'each record links to the previous hash');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the chain survives a process restart and stays verifiable', () => {
  const { dir, path } = freshLog();
  try {
    log('info', 'before-restart', {});
    const records = readFileSync(path, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    assert.equal(verifyChain(records).ok, true);
    // a new "process" resumes from the file
    setLogFile(path);
    log('info', 'after-restart', {});
    const all = readFileSync(path, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    assert.equal(all.length, 2);
    assert.equal(verifyChain(all).ok, true, 'the chain must still verify after a restart');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('editing a record is detected', () => {
  const { dir, path } = freshLog();
  try {
    log('info', 'one', {});
    log('info', 'two', {});
    log('info', 'three', {});
    const records = readFileSync(path, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    records[1].event = 'tampered';
    const v = verifyChain(records);
    assert.equal(v.ok, false);
    assert.equal(v.at, 1);
    assert.match(v.reason, /edited/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('deleting a record is detected', () => {
  const { dir, path } = freshLog();
  try {
    log('info', 'one', {});
    log('info', 'two', {});
    log('info', 'three', {});
    const records = readFileSync(path, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    records.splice(1, 1);
    const v = verifyChain(records);
    assert.equal(v.ok, false);
    assert.match(v.reason, /removed or reordered/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a legacy record with no chain field is tolerated, not called tampering', () => {
  const v = verifyChain([{ ts: 'x', event: 'legacy' }]);
  assert.equal(v.ok, true);
  assert.equal(v.legacy, 1);
});

test('a chained record among legacy ones is still verified', () => {
  const dir = mkdtempSync(join(tmpdir(), "tw-log-mix-"));
  const path = join(dir, "audit.jsonl");
  try {
    setLogFile(path);
    log('info', 'chained', {});
    const chained = readFileSync(path, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    const mixed = [{ ts: 'old', event: 'legacy' }].concat(chained);
    assert.equal(verifyChain(mixed).ok, true);
    mixed[1].event = "tampered";
    assert.equal(verifyChain(mixed).ok, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an empty history verifies', () => {
  assert.equal(verifyChain([]).ok, true);
  assert.equal(verifyChain(undefined).ok, true);
});

test('the same audit break is reported once, but recovery and later damage are reported', () => {
  const { dir, path } = freshLog();
  try {
    log('info', 'first'); log('info', 'second');
    const records = readFileSync(path, 'utf8').trim().split('\n').map(JSON.parse);
    const broken = structuredClone(records);
    broken[1].event = 'edited';
    const monitor = createAuditMonitor();
    assert.equal(monitor(broken).changed, true);
    log('info', 'check-added');
    const appended = JSON.parse(readFileSync(path, 'utf8').trim().split('\n').at(-1));
    assert.equal(monitor([...broken, appended]).changed, false);
    assert.equal(monitor(records).changed, true);
    assert.equal(monitor(records).changed, false);
    assert.equal(monitor(broken).changed, true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('independent writers share one unbroken audit chain', async () => {
  const { dir, path } = freshLog();
  const moduleUrl = new URL('../src/log.js', import.meta.url).href;
  const worker = `import {setLogFile,setMinConsoleLevel,log} from ${JSON.stringify(moduleUrl)};
    setMinConsoleLevel('silent'); setLogFile(process.argv[1]);
    process.stdout.write('ready');
    process.stdin.once('data',()=>{for(let i=0;i<30;i++)log('info','worker',{pid:process.pid,i});process.exit(0);});`;
  const children = Array.from({ length: 3 }, () => spawn(process.execPath, ['--input-type=module', '-e', worker, path], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true }));
  try {
    const exits = children.map(child => new Promise((resolve, reject) => {
      let errors = '';
      child.stderr.on('data', chunk => errors += chunk);
      child.on('error', reject);
      child.on('exit', code => code === 0 ? resolve() : reject(new Error(errors || `worker exited ${code}`)));
    }));
    await Promise.all(children.map(child => new Promise(resolve => child.stdout.once('data', resolve))));
    for (const child of children) child.stdin.end('go');
    await Promise.all(exits);
    const records = readFileSync(path, 'utf8').trim().split('\n').map(JSON.parse);
    assert.equal(records.length, 90, 'all concurrent appends must be kept');
    assert.equal(verifyChain(records).ok, true);
  } finally {
    for (const child of children) if (child.exitCode === null) child.kill();
    rmSync(dir, { recursive: true, force: true });
  }
});
