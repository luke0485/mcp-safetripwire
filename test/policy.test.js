import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFileSync, rmSync } from 'node:fs';
import { loadPolicy, decide } from '../src/policy.js';

function policyFile(obj) {
  const path = join(tmpdir(), `tripwire-policy-${process.pid}-${Date.now()}-${Math.random()}.json`);
  writeFileSync(path, JSON.stringify(obj));
  return path;
}

test('missing policy defaults to warn (allow everything)', () => {
  const policy = loadPolicy(join(tmpdir(), 'no-such-tripwire-policy.json'));
  assert.equal(policy.mode, 'warn');
  assert.equal(decide(policy, 'anything').action, 'allow');
});

test('warn mode allows even unknown tools', () => {
  const path = policyFile({ mode: 'warn' });
  try {
    assert.equal(decide(loadPolicy(path), 'execute_blender_code').action, 'allow');
  } finally {
    rmSync(path, { force: true });
  }
});

test('block mode with an allowlist denies everything else', () => {
  const path = policyFile({ mode: 'block', allowedTools: ['read_file'] });
  try {
    const policy = loadPolicy(path);
    assert.equal(decide(policy, 'read_file', { reviewed: true }).action, 'allow');
    assert.equal(decide(policy, 'render_scene', { reviewed: true }).action, 'block');
    assert.equal(decide(policy, 'render_scene', { reviewed: true }).reason, 'not-allowlisted');
  } finally {
    rmSync(path, { force: true });
  }
});

test('denyTools wins even over an allowlist, in any mode', () => {
  const path = policyFile({ mode: 'warn', denyTools: ['execute_blender_code'] });
  try {
    const d = decide(loadPolicy(path), 'execute_blender_code');
    assert.equal(d.action, 'block');
    assert.equal(d.reason, 'explicitly-denied');
  } finally {
    rmSync(path, { force: true });
  }
});

test('block mode with no allowlist trusts a reviewed channel', () => {
  const path = policyFile({ mode: 'block' });
  try {
    const policy = loadPolicy(path);
    assert.equal(decide(policy, 'read_file', { reviewed: true }).action, 'allow');
    assert.equal(decide(policy, 'read_file', { reviewed: true }).reason, 'reviewed');
  } finally {
    rmSync(path, { force: true });
  }
});

test('block mode denies an unreviewed channel even when the tool is allowlisted', () => {
  const path = policyFile({ mode: 'block', allowedTools: ['read_file'] });
  try {
    const policy = loadPolicy(path);
    assert.equal(decide(policy, 'read_file', { reviewed: false }).action, 'block');
    assert.equal(decide(policy, 'read_file', { reviewed: false }).reason, 'unreviewed');
  } finally {
    rmSync(path, { force: true });
  }
});

test('denyTools still wins over a reviewed channel', () => {
  const path = policyFile({ mode: 'block', denyTools: ['run_shell'] });
  try {
    assert.equal(decide(loadPolicy(path), 'run_shell', { reviewed: true }).reason, 'explicitly-denied');
  } finally {
    rmSync(path, { force: true });
  }
});

test('corrupt policy file degrades to warn instead of throwing', () => {
  const path = join(tmpdir(), `tripwire-bad-${process.pid}-${Date.now()}.json`);
  writeFileSync(path, '{ not json');
  try {
    assert.equal(loadPolicy(path).mode, 'warn');
  } finally {
    rmSync(path, { force: true });
  }
});
