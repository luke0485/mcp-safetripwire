import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countCriticalSince, extractPeers, topology, hourlyHistogram, activityHistogram } from '../src/insights.js';

const now = Date.parse('2026-09-28T12:00:00.000Z');
const hoursAgo = (h) => new Date(now - h * 3600 * 1000).toISOString();

test('five-minute chart covers the full day without inventing or dropping boundary events', () => {
  const rows = activityHistogram([
    {ts: hoursAgo(24), level:'info'},
    {ts: new Date(now - 24 * 3600000 + 300000).toISOString(), level:'warn'},
    {ts: hoursAgo(0), level:'critical'},
    {ts: hoursAgo(25), level:'critical'},
    {ts: new Date(now + 1).toISOString(), level:'critical'},
    {ts:'bad', level:'warn'},
  ], now);
  assert.equal(rows.length, 288);
  assert.equal(rows[0].info, 1);
  assert.equal(rows[1].warn, 1);
  assert.equal(rows[287].critical, 1);
  assert.equal(rows.reduce((sum, b) => sum + b.info + b.warn + b.critical, 0), 3);
  assert.equal(Date.parse(rows[1].ts) - Date.parse(rows[0].ts), 300000);
  assert.equal(activityHistogram([], now).every(b => b.info + b.warn + b.critical === 0), true);
});

test('countCriticalSince counts only critical events inside the window', () => {
  const events = [
    { level: 'critical', ts: hoursAgo(1) },
    { level: 'critical', ts: hoursAgo(30) },   // outside 24h
    { level: 'warn', ts: hoursAgo(1) },        // not critical
    { level: 'info', ts: hoursAgo(2) },
  ];
  assert.equal(countCriticalSince(events, 24, now), 1);
  assert.equal(countCriticalSince(events, 48, now), 2);
  assert.equal(countCriticalSince([], 24, now), 0);
  assert.equal(countCriticalSince(undefined, 24, now), 0);
});

test('countCriticalSince ignores unparsable timestamps', () => {
  assert.equal(countCriticalSince([{ level: 'critical', ts: 'not-a-date' }], 24, now), 0);
});

test('extractPeers keeps the newest sighting per process', () => {
  const events = [
    { event: 'bridge-peer', image: 'blender.exe', pid: 42, name: 'blender', ts: hoursAgo(3) },
    { event: 'bridge-peer', image: 'blender.exe', pid: 42, name: 'blender', ts: hoursAgo(1) },
    { event: 'bridge-unexpected-peer', image: 'evil.exe', pid: 7, name: 'blender', ts: hoursAgo(2) },
  ];
  const peers = extractPeers(events);
  assert.equal(peers.length, 2);
  // Most recent sighting first: blender.exe was seen 1h ago, evil.exe 2h ago.
  assert.equal(peers[0].image, 'blender.exe');
  assert.equal(peers[0].allowed, true);
  assert.equal(peers[0].lastTs, hoursAgo(1)); // newest, not the older sighting
  assert.equal(peers[1].image, 'evil.exe');
  assert.equal(peers[1].allowed, false);
});

test('extractPeers ignores unrelated events and tolerates missing fields', () => {
  assert.deepEqual(extractPeers([{ event: 'tools-call' }]), []);
  const peers = extractPeers([{ event: 'bridge-peer', ts: hoursAgo(1) }]);
  assert.equal(peers.length, 1);
  assert.equal(peers[0].image, null);
  assert.equal(peers[0].allowed, true);
});

test('topology lists every channel with its protection state, sorted', () => {
  const snap = {
    'codex::b': { host: 'codex', name: 'b', kind: 'http', protected: false },
    'codex::a': { host: 'codex', name: 'a', kind: 'stdio', protected: true },
  };
  const rows = topology(snap);
  assert.deepEqual(rows.map((r) => r.name), ['a', 'b']);
  assert.equal(rows[0].protected, true);
  assert.equal(rows[1].kind, 'http');
});

test('topology of nothing is an empty list', () => {
  assert.deepEqual(topology(null), []);
  assert.deepEqual(topology({}), []);
});

test('hourlyHistogram buckets events into the right hour and ignores the rest', () => {
  const base = Date.parse('2026-09-28T12:00:00.000Z');
  const events = [
    { level: 'critical', ts: new Date(base).toISOString() },
    { level: 'warn', ts: new Date(base).toISOString() },
    { level: 'info', ts: new Date(base - 2 * 3600 * 1000).toISOString() },
    { level: 'critical', ts: new Date(base - 99 * 3600 * 1000).toISOString() }, // far outside
  ];
  const h = hourlyHistogram(events, 24, base);
  assert.equal(h.length, 24);
  assert.equal(h[23].critical, 1);
  assert.equal(h[23].warn, 1);
  assert.equal(h[21].info, 1);
  const total = h.reduce((n, b) => n + b.critical + b.warn + b.info, 0);
  assert.equal(total, 3); // the ancient event is excluded
});

test('hourlyHistogram of nothing is all zeroes', () => {
  const h = hourlyHistogram([], 6, Date.now());
  assert.equal(h.length, 6);
  assert.equal(h.every((b) => b.critical === 0 && b.warn === 0 && b.info === 0), true);
});
