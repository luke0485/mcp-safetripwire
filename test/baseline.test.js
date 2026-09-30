import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  extractDestinations, argKeys, destinationsOf, channelToolKey,
  deriveBaseline, diffBaseline, mergeBaseline, loadBaseline, saveBaseline,
} from '../src/baseline.js';

const call = (tool, params, ts, name = 'codex::node_repl') => ({
  event: 'tools-call', name, tool, ts, argKeys: argKeys(params), destinations: destinationsOf(params),
});

test('destinations are extracted but file names are not mistaken for hosts', () => {
  assert.deepEqual(extractDestinations('POST https://collect.example/ingest'), ['collect.example']);
  assert.deepEqual(extractDestinations('read /tmp/app.js'), []);
  assert.deepEqual(extractDestinations(''), []);
  assert.deepEqual(extractDestinations(undefined), []);
});

test('destinationsOf reads nested argument structures', () => {
  const hosts = destinationsOf({ a: { b: 'http://evil.example/x' }, c: ['plain text'] });
  assert.deepEqual(hosts, ['evil.example']);
});

test('argKeys walks nested objects and records dotted paths', () => {
  const keys = argKeys({ path: '/x', opts: { depth: 2 } });
  assert.ok(keys.includes('path'));
  assert.ok(keys.includes('opts.depth'));
  assert.deepEqual(argKeys(null), []);
});

test('deriveBaseline aggregates calls per channel and tool', () => {
  const now = Date.now();
  const iso = (minAgo) => new Date(now - minAgo * 60000).toISOString();
  const events = [
    call('read_file', { path: '/a' }, iso(30)),
    call('read_file', { path: '/b', encoding: 'utf8' }, iso(20)),
    call('render_scene', { out: '/x.png' }, iso(10)),
  ];
  const b = deriveBaseline(events, { now });
  const rf = b[channelToolKey('codex::node_repl', 'read_file')];
  assert.equal(rf.calls, 2);
  assert.deepEqual(rf.argKeys.sort(), ['encoding', 'path']);
  assert.equal(b[channelToolKey('codex::node_repl', 'render_scene')].calls, 1);
});

test('events older than the window are ignored', () => {
  const now = Date.now();
  const events = [call('old', {}, new Date(now - 48 * 3600 * 1000).toISOString())];
  assert.deepEqual(deriveBaseline(events, { now, hours: 24 }), {});
});

test('a first-ever call is reported', () => {
  const current = deriveBaseline([call('new_tool', {}, new Date().toISOString())]);
  const d = diffBaseline({}, current);
  assert.equal(d.length, 1);
  assert.equal(d[0].rule, 'tool-first-use');
});

test('an unchanged channel produces no deviations', () => {
  const now = Date.now();
  const iso = (m) => new Date(now - m * 60000).toISOString();
  const prev = deriveBaseline([call('read_file', { path: '/a' }, iso(40))], { now });
  const cur = deriveBaseline([call('read_file', { path: '/b' }, iso(5))], { now });
  assert.deepEqual(diffBaseline(prev, cur), []);
});

test('a new argument field is reported', () => {
  const now = Date.now();
  const iso = (m) => new Date(now - m * 60000).toISOString();
  const prev = deriveBaseline([call('read_file', { path: '/a' }, iso(40))], { now });
  const cur = deriveBaseline([call('read_file', { path: '/a', url: 'x' }, iso(5))], { now });
  const d = diffBaseline(prev, cur);
  assert.equal(d[0].rule, 'argument-field-new');
  assert.match(d[0].detail, /url/);
});

test('a new destination outranks the other deviations', () => {
  const now = Date.now();
  const iso = (m) => new Date(now - m * 60000).toISOString();
  const prev = deriveBaseline([call('fetch', { url: 'https://good.example/a' }, iso(40))], { now });
  const cur = deriveBaseline([call('fetch', { url: 'https://bad.example/a', extra: 1 }, iso(5))], { now });
  const d = diffBaseline(prev, cur);
  assert.equal(d[0].rule, 'destination-new');
  assert.equal(d[0].severity, 'warn');
});

test('a ten-fold call spike is reported', () => {
  const now = Date.now();
  const iso = (m) => new Date(now - m * 60000).toISOString();
  const prev = deriveBaseline(Array.from({ length: 20 }, () => call('ping', {}, iso(40))), { now });
  const many = Array.from({ length: 201 }, () => call('ping', {}, iso(5)));
  const cur = deriveBaseline(many, { now });
  assert.ok(diffBaseline(prev, cur).some((x) => x.rule === 'call-rate-spike'));
});

test('learning excludes refused calls, invalid timestamps and future events', () => {
  const now = Date.now();
  const events = [
    { ...call('refused', {}, new Date(now).toISOString()), action: 'block' },
    call('bad-date', {}, 'invalid'), call('future', {}, new Date(now + 60000).toISOString()),
  ];
  assert.deepEqual(deriveBaseline(events, { now }), {});
});

test('changing array length does not invent new argument fields', () => {
  assert.deepEqual(argKeys({ files: [{ path: 'a' }] }), argKeys({ files: [{ path: 'b' }, { path: 'c' }] }));
});

test('first use and small-sample growth are not attack alarms', () => {
  const now = Date.now();
  const one = deriveBaseline([call('ping', {}, new Date(now).toISOString())], { now });
  assert.equal(diffBaseline({}, one)[0].severity, 'info');
  const many = deriveBaseline(Array.from({ length: 25 }, () => call('ping', {}, new Date(now).toISOString())), { now });
  assert.ok(!diffBaseline(one, many).some(d => d.rule === 'call-rate-spike'));
});

test('quiet periods retain learned fields and destinations', () => {
  const previous = deriveBaseline([call('fetch', { url: 'https://good.example' }, new Date().toISOString())]);
  const quiet = mergeBaseline(previous, {});
  assert.equal(Object.values(quiet)[0].calls, 0);
  assert.deepEqual(Object.values(quiet)[0].destinations, ['good.example']);
  const current = deriveBaseline([call('fetch', { url: 'https://good.example' }, new Date().toISOString())]);
  assert.deepEqual(diffBaseline(quiet, current), []);
});

test('the baseline round-trips through disk', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tw-baseline-'));
  const path = join(dir, 'baseline.json');
  try {
    assert.equal(loadBaseline(path), null);
    const map = deriveBaseline([call('read_file', { path: '/a' }, new Date().toISOString())]);
    saveBaseline(map, path);
    const reloaded = loadBaseline(path);
    assert.deepEqual(Object.keys(reloaded), Object.keys(map));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
