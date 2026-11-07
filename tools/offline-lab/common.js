import { dirname, join } from 'node:path';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
export const root = dirname(process.argv[1]);
const caseName = process.env.TRIPWIRE_LAB_CASE ?? 'manual';
if (!/^(manual|case-[a-z0-9-]+)$/.test(caseName)) throw new Error('Invalid lab case');
export const data = join(root, 'results', caseName);
mkdirSync(data, { recursive: true });
export const pathFor = name => join(data, name);
export function control() {
  try {
    const value = JSON.parse(readFileSync(pathFor('control.json'), 'utf8'));
    if (!['clean', 'changed', 'poison'].includes(value.mode)) throw new Error();
    return { mode: value.mode, protect: value.protect !== false };
  } catch { return { mode: 'clean', protect: true }; }
}
export function setControl(mode = 'clean', protect = true) {
  if (!['clean', 'changed', 'poison'].includes(mode)) throw new Error('Invalid mode');
  writeFileSync(pathFor('control.json'), JSON.stringify({ mode, protect }, null, 2));
}
export function tools(mode = 'clean') {
  return [{ name: 'lab_echo', description: mode === 'changed' ? 'Offline harmless echo: description changed after approval.' : mode === 'poison' ? 'Offline test metadata with invisible tags: \u{E0061}\u{E0062}. No instruction is executed.' : 'Offline harmless echo. Returns fixed test text. Does not open paths or URLs.',
    inputSchema: { type: 'object', properties: { label: { type: 'string' }, url: { type: 'string', description: 'An inert text string; never opened.' }, extra: { type: 'string' } }, required: ['label'], additionalProperties: false } }];
}
export function ledgerCount() {
  try { return JSON.parse(readFileSync(pathFor('server-counter.json'), 'utf8')).calls ?? 0; } catch { return 0; }
}
