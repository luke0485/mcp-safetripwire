import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateToolsList } from '../src/evaluate.js';

const clean = [
  { name: 'read_file', description: 'Read a text file.' },
  { name: 'render_scene', description: 'Render the scene.' },
];
// A Unicode Tag-block character is a CRITICAL static finding.
const poisoned = [
  { name: 'read_file', description: 'Read a text file.' },
  { name: 'sync_notes', description: 'Sync notes.\u{E0068}\u{E0069}\u{E0064}\u{E0064}\u{E0065}\u{E006E}' },
];

test('unpinned clean surface forwards', () => {
  const ev = evaluateToolsList(clean, { pinHash: null, posture: 'warn' });
  assert.equal(ev.pinState, 'unpinned');
  assert.equal(ev.action.kind, 'forward');
});

test('matching pin forwards', () => {
  const ev = evaluateToolsList(clean, { pinHash: evaluateToolsList(clean).hash, posture: 'block' });
  assert.equal(ev.pinState, 'match');
  assert.equal(ev.action.kind, 'forward');
});

test('pin mismatch forwards under warn but blocks under strip and block', () => {
  const wrong = 'deadbeef';
  assert.equal(evaluateToolsList(clean, { pinHash: wrong, posture: 'warn' }).action.kind, 'forward');
  assert.equal(evaluateToolsList(clean, { pinHash: wrong, posture: 'strip' }).action.kind, 'block');
  const blocked = evaluateToolsList(clean, { pinHash: wrong, posture: 'block' });
  assert.equal(blocked.action.kind, 'block');
  assert.equal(blocked.action.reason, 'rug-pull');
});

test('critical static finding is stripped under strip, naming the tool', () => {
  const ev = evaluateToolsList(poisoned, { posture: 'strip' });
  assert.equal(ev.action.kind, 'strip');
  assert.deepEqual(ev.action.tools, ['sync_notes']);
  assert.ok(ev.criticalTools.includes('sync_notes'));
});

test('critical static finding blocks the whole list under block', () => {
  const ev = evaluateToolsList(poisoned, { posture: 'block' });
  assert.equal(ev.action.kind, 'block');
  assert.equal(ev.action.reason, 'critical-static-findings');
});

test('critical static finding only warns under warn', () => {
  assert.equal(evaluateToolsList(poisoned, { posture: 'warn' }).action.kind, 'forward');
});

test('rug-pull outranks a critical static finding', () => {
  const ev = evaluateToolsList(poisoned, { pinHash: 'deadbeef', posture: 'strip' });
  assert.equal(ev.action.reason, 'rug-pull');
});

test('risks and findings are reported alongside the action', () => {
  const ev = evaluateToolsList(
    [{ name: 'execute_blender_code', description: 'Execute Python code.' }],
    { posture: 'warn' },
  );
  assert.ok(ev.risks.some((r) => r.tool === 'execute_blender_code'));
  assert.ok(ev.findings.length >= 0);
  assert.equal(typeof ev.count, 'number');
});
