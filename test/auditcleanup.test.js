import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanLegacyAudit } from '../src/auditcleanup.js';
import { verifyChain, auditLevel } from '../src/log.js';

test('legacy correction removes known false alerts and retains real payload and tamper evidence', () => {
  const { records, removed, reclassified } = cleanLegacyAudit([
    { event: 'audit-chain-broken', level: 'critical', reason: 'record carries no chain link' },
    { event: 'static-finding', level: 'warn', rule: 'cross-tool-reference' },
    { event: 'request', level: 'debug' },
    { event: 'console-error', level: 'critical' },
    { event: 'argument-blocked', level: 'critical', rule: 'payload' },
    { event: 'audit-chain-broken', level: 'critical', reason: 'content hash mismatch: a record was edited' },
  ]);
  assert.equal(removed, 3);
  assert.equal(reclassified, 2);
  assert.equal(records.find(record => record.event === 'argument-blocked').level, 'critical');
  assert.ok(records.some(record => record.reason?.includes('edited')));
  assert.equal(verifyChain(records).ok, true);
});

test('configuration and startup issues are not severe attack alarms', () => {
  assert.equal(auditLevel('critical', 'console-port-in-use'), 'warn');
  assert.equal(auditLevel('critical', 'tools-call', { action: 'block', reason: 'unreviewed' }), 'warn');
  assert.equal(auditLevel('critical', 'argument-blocked'), 'critical');
});
