import { runBroker } from '../../src/broker.js';
import { loadAdvanced } from '../../src/advanced.js';
import { CANARY } from '../../src/deception.js';
import { root, pathFor, control } from './common.js';
import { join } from 'node:path';
runBroker({ name: 'OfflineLab', command: process.execPath, args: [join(root, 'server.cjs')], statePath: pathFor('manifest.json'), policyPath: pathFor('policy.json'), logPath: pathFor('audit.jsonl'), getPosture: () => control().protect ? 'block' : 'warn', getAdvanced: () => loadAdvanced(pathFor('advanced.json')), canary: CANARY });
