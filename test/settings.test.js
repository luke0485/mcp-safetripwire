import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync, writeFileSync } from 'node:fs';
import { loadSettings, saveSettings, postureFor, labelFor } from '../src/settings.js';

function tempPath() {
  return join(tmpdir(), `tripwire-settings-${process.pid}-${Date.now()}-${Math.random()}.json`);
}

test('a missing settings file defaults to observe (change nothing)', () => {
  assert.deepEqual(loadSettings(join(tmpdir(), 'never-created-tripwire.json')), { protection: 'observe' });
});

test('settings round-trip through disk', () => {
  const p = tempPath();
  try {
    saveSettings({ protection: 'protect' }, p);
    assert.equal(loadSettings(p).protection, 'protect');
    saveSettings({ protection: 'observe' }, p);
    assert.equal(loadSettings(p).protection, 'observe');
  } finally {
    rmSync(p, { force: true });
    rmSync(p + '.key', { force: true });
  }
});

test('an unknown stored protection value cannot silently disable blocking', () => {
  const p = tempPath();
  try {
    writeFileSync(p, JSON.stringify({ protection: 'yolo' }));
    assert.equal(loadSettings(p).protection, 'protect');
    assert.ok(loadSettings(p).integrityError);
  } finally {
    rmSync(p, { force: true });
  }
});

test('corrupt settings fail closed instead of silently entering observe', () => {
  const p = tempPath();
  try {
    writeFileSync(p, '{ not json');
    assert.equal(loadSettings(p).protection, 'protect');
  } finally {
    rmSync(p, { force: true });
  }
});

test('postureFor maps the one switch onto internal postures', () => {
  assert.equal(postureFor('observe'), 'warn');
  assert.equal(postureFor('protect'), 'block');
  assert.equal(postureFor(undefined), 'warn');
});

test('labelFor turns internal event names into plain language, and passes through unknowns', () => {
  assert.equal(labelFor('RUG-PULL-SUSPECTED'), '工具被偷偷改动了');
  assert.equal(labelFor('activity'), '记录到一次代码执行');
  assert.equal(labelFor('something-new'), 'something-new');
});
