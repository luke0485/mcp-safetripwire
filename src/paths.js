import { homedir } from 'node:os';
import { join } from 'node:path';

export function dataDir() {
  return join(homedir(), '.mcp-tripwire');
}

export function defaultStatePath() {
  return join(dataDir(), 'state.json');
}

export function defaultLogPath() {
  return join(dataDir(), 'audit.jsonl');
}
