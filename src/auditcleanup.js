import { auditLevel, rebuildAuditChain } from './log.js';

// One-time user-requested correction. Originals are archived by the caller.
// Do not discard payload hits, refused calls or content-hash mismatches.
export function cleanLegacyAudit(records) {
  let removed = 0, reclassified = 0;
  const kept = [];
  for (const record of records) {
    if (record.level === 'debug') { removed++; continue; }
    if (record.event === 'audit-chain-broken' && [
      'record carries no chain link',
      'previous-hash mismatch: a record was removed or reordered',
    ].includes(record.reason)) { removed++; continue; }
    if (record.event === 'static-finding' && record.rule === 'cross-tool-reference') { removed++; continue; }
    const level = auditLevel(record.level, record.event, record);
    if (level !== record.level) reclassified++;
    kept.push({ ...record, level });
  }
  return { records: rebuildAuditChain(kept), removed, reclassified };
}
