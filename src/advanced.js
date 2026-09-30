import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, statSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { dataDir } from './paths.js';
import { argKeys, destinationsOf, channelToolKey } from './baseline.js';

export const defaultAdvancedPath = () => join(dataDir(), 'advanced.json');
export const emptyAdvanced = () => ({ blockedTools: [], blockedDestinations: [], baselineMode: 'warn', checkNewFields: false, baseline: {} });
const canonical = value => JSON.stringify(value);

export function validateAdvanced(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid advanced protection settings');
  const list = (items, kind) => {
    if (!Array.isArray(items) || items.length > 200) throw new Error('Blacklist must contain at most 200 entries');
    return [...new Set(items.map(item => {
      if (typeof item !== 'string' || !item.trim() || item.length > 200 || /[\x00-\x1f]/.test(item)) throw new Error('Invalid blacklist entry');
      const text = item.trim();
      if (kind === 'domain' && !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(text)) throw new Error('Enter domain names only, without URLs or wildcards');
      return kind === 'domain' ? text.toLowerCase() : text;
    }))];
  };
  if (!['off', 'warn', 'block'].includes(value.baselineMode)) throw new Error('Invalid baseline mode');
  const baseline = value.baseline ?? {};
  if (typeof baseline !== 'object' || Array.isArray(baseline) || Object.keys(baseline).length > 2000) throw new Error('Invalid baseline');
  for (const [key, entry] of Object.entries(baseline)) {
    if (!entry || key !== channelToolKey(entry.channel, entry.tool) || !Number.isFinite(entry.calls) || entry.calls < 0 ||
        !Array.isArray(entry.argKeys) || !Array.isArray(entry.destinations) || entry.argKeys.length > 500 || entry.destinations.length > 500 ||
        [...entry.argKeys, ...entry.destinations].some(item => typeof item !== 'string' || item.length > 500)) throw new Error('Invalid baseline entry');
  }
  return { blockedTools: list(value.blockedTools, 'tool'), blockedDestinations: list(value.blockedDestinations, 'domain'), baselineMode: value.baselineMode, checkNewFields: value.checkNewFields === true, baseline };
}

export function loadAdvanced(path = defaultAdvancedPath()) {
  if (!existsSync(path) && !existsSync(path + '.key')) return emptyAdvanced();
  try {
    if (statSync(path).size > 1024 * 1024) throw new Error('Settings too large');
    const { integrity, ...body } = JSON.parse(readFileSync(path, 'utf8'));
    if (statSync(path + '.key').size !== 32) throw new Error('Invalid protection key');
    const key = readFileSync(path + '.key');
    const expected = createHmac('sha256', key).update(canonical(body)).digest();
    if (integrity?.version !== 1 || !/^[a-f0-9]{64}$/.test(integrity.signature ?? '') || !timingSafeEqual(expected, Buffer.from(integrity.signature, 'hex'))) throw new Error('Protection settings integrity check failed');
    return validateAdvanced(body);
  } catch { return { ...emptyAdvanced(), integrityError: 'Advanced protection settings were rejected; restore a trusted backup' }; }
}

export function saveAdvanced(value, path = defaultAdvancedPath()) {
  const body = validateAdvanced(value);
  if (loadAdvanced(path).integrityError) throw new Error('Cannot overwrite rejected protection settings');
  const serialized = JSON.stringify({ ...body, integrity: { version: 1, signature: '0'.repeat(64) } }, null, 2) + '\n';
  if (Buffer.byteLength(serialized) > 1024 * 1024) throw new Error('Settings exceed 1 MB');
  mkdirSync(dirname(path), { recursive: true });
  if (!existsSync(path + '.key')) writeFileSync(path + '.key', randomBytes(32), { flag: 'wx', mode: 0o600 });
  const signature = createHmac('sha256', readFileSync(path + '.key')).update(canonical(body)).digest('hex');
  const temp = path + '.' + randomBytes(6).toString('hex') + '.tmp';
  try {
    writeFileSync(temp, JSON.stringify({ ...body, integrity: { version: 1, signature } }, null, 2) + '\n', { mode: 0o600 });
    renameSync(temp, path);
  } finally { rmSync(temp, { force: true }); }
  return body;
}

// These are references in arguments, not proof of actual network access.
export function advancedDecision(settings, channel, tool, params) {
  if (settings.integrityError) return { reason: 'protection-config-integrity', enforce: true };
  if (settings.blockedTools.includes(tool) || settings.blockedTools.includes(channelToolKey(channel, tool))) return { reason: 'tool-blacklist', enforce: true };
  const destinations = destinationsOf(params);
  if (destinations.some(host => settings.blockedDestinations.some(deny => host === deny || host.endsWith('.' + deny)))) return { reason: 'destination-blacklist', enforce: true };
  if (settings.baselineMode === 'off') return null;
  const before = settings.baseline[channelToolKey(channel, tool)];
  // Small samples and first use are never treated as attacks.
  if (!before || before.calls < 20) return null;
  if (destinations.some(host => !before.destinations.includes(host))) return { reason: 'baseline-new-destination', enforce: settings.baselineMode === 'block' };
  if (settings.checkNewFields && argKeys(params).some(key => !before.argKeys.includes(key))) return { reason: 'baseline-new-field', enforce: settings.baselineMode === 'block' };
  return null;
}
