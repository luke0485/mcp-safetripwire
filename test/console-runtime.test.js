import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createConsole, BOOTSTRAP_TTL_MS } from '../src/console.js';
import { dataDir } from '../src/paths.js';
import { setMinConsoleLevel } from '../src/log.js';

setMinConsoleLevel('silent');

test('console login codes are single-use and malformed cookies do not crash', async (t) => {
  const home = mkdtempSync(join(tmpdir(), 'tw-console-runtime-'));
  const oldProfile = process.env.USERPROFILE;
  const oldHome = process.env.HOME;
  process.env.USERPROFILE = home;
  process.env.HOME = home;
  t.after(() => {
    if (oldProfile === undefined) delete process.env.USERPROFILE; else process.env.USERPROFILE = oldProfile;
    if (oldHome === undefined) delete process.env.HOME; else process.env.HOME = oldHome;
    rmSync(home, { recursive: true, force: true });
  });

  // Do not write to the real profile if the environment override did not take.
  assert.equal(dataDir(), join(home, '.mcp-tripwire'));

  const token = 'test-token-' + 'b'.repeat(44);
  const code = 'test-code-' + 'a'.repeat(40);
  const bootstrapCodes = new Map([[code, Date.now() + BOOTSTRAP_TTL_MS]]);
  const logPath = join(home, '.mcp-tripwire', 'audit.jsonl');
  const server = createConsole({ listen: { host: '127.0.0.1', port: 0 }, token, logPath, bootstrapCodes });
  await once(server, 'listening');
  t.after(async () => {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  const first = await fetch(`${base}/?code=${code}`, { redirect: 'manual' });
  assert.equal(first.status, 302);
  assert.match(first.headers.get('set-cookie') ?? '', /tripwire_token=/);

  const second = await fetch(`${base}/?code=${code}`, { redirect: 'manual' });
  assert.equal(second.status, 401);

  const malformed = await fetch(`${base}/`, { headers: { cookie: 'tripwire_token=%' } });
  assert.equal(malformed.status, 401);

  const status = await fetch(`${base}/api/status`, { headers: { 'x-tripwire-token': token } });
  assert.equal(status.status, 200);
  const body = await status.json();
  assert.equal(body.logPath, logPath);

  const boot = await fetch(`${base}/api/bootstrap`, { method: 'POST', headers: { 'x-tripwire-token': token } });
  assert.equal(boot.status, 200);
  const fresh = await boot.json();
  assert.equal(typeof fresh.code, 'string');
  const third = await fetch(`${base}/?code=${fresh.code}`, { redirect: 'manual' });
  assert.equal(third.status, 302);
});
