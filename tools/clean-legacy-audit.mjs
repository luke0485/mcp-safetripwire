import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { defaultLogPath } from '../src/paths.js';
import { acquireLogLock, rebuildAuditChain, verifyChain } from '../src/log.js';
import { cleanLegacyAudit } from '../src/auditcleanup.js';

const path = process.argv.find(arg => arg.startsWith('--path='))?.slice(7) ?? defaultLogPath();
const apply = process.argv.includes('--apply');
const release = acquireLogLock(path);
try {
  const original = readFileSync(path);
  const records = original.toString('utf8').split('\n').filter(line => line.trim()).map(JSON.parse);
  if (records.some(record => record.event === 'audit-history-cleaned')) {
    console.log('History was already cleaned; no further changes.');
  } else {
    const result = cleanLegacyAudit(records);
    console.log(JSON.stringify({ removed: result.removed, reclassified: result.reclassified, retained: result.records.length }));
    if (apply) {
      const archiveDir = join(dirname(path), 'archive');
      mkdirSync(archiveDir, { recursive: true });
      const archive = join(archiveDir, 'audit-before-cleanup-' + Date.now() + '.jsonl');
      writeFileSync(archive, original, { flag: 'wx' });
      const migration = { ts: new Date().toISOString(), level: 'info', event: 'audit-history-cleaned', removed: result.removed,
        reclassified: result.reclassified, archive, archiveSHA256: createHash('sha256').update(original).digest('hex') };
      const cleaned = rebuildAuditChain([...result.records, migration]);
      if (!verifyChain(cleaned).ok) throw new Error('Cleaned log validation failed');
      const temporary = path + '.cleanup-' + process.pid;
      writeFileSync(temporary, cleaned.map(record => JSON.stringify(record)).join('\n') + '\n', { flag: 'wx' });
      renameSync(temporary, path);
      console.log('Legacy audit history corrected; original archived.');
    }
  }
} finally { release(); }
