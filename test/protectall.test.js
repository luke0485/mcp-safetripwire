import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { planWrap, readServer } from '../src/hosts.js';
import { applyEnrollment } from '../src/protectall.js';
import { loadRoutes, saveRoutes, defaultListen } from '../src/routes.js';

test('single HTTP enrolment registers its route and inherits the global mode', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'tripwire-enrol-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const host = { format: 'json', key: 'mcpServers', path: join(dir, 'config.json') };
  writeFileSync(host.path, JSON.stringify({ mcpServers: { remote: { url: 'https://example.com/mcp?key=abc', headers: { Authorization: 'test' } } } }));
  const plan = planWrap({ host, serverName: 'remote', listen: defaultListen() });
  const routesPath = join(dir, 'routes.json');
  assert.equal(applyEnrollment({ host, name: 'remote', plan, routesPath }).ok, true);
  assert.equal(readServer(host, 'remote').url, 'http://127.0.0.1:8788/remote/mcp?key=abc');
  assert.equal(loadRoutes(routesPath).servers.remote.upstream, 'https://example.com/mcp?key=abc');
  assert.equal(loadRoutes(routesPath).servers.remote.posture, undefined);
  assert.equal(JSON.parse(readFileSync(host.path)).mcpServers.remote.headers.Authorization, 'test');
});

test('failed HTTP enrolment restores the previous routes', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'tripwire-enrol-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const routesPath = join(dir, 'routes.json');
  const previous = { listen: defaultListen(), servers: { existing: { upstream: 'https://example.com/' } } };
  saveRoutes(routesPath, previous);
  const result = applyEnrollment({
    host: { format: 'json', key: 'mcpServers', path: join(dir, 'missing.json') }, name: 'remote', routesPath,
    plan: { kind: 'http', route: { upstream: 'https://example.com/mcp' }, wrapped: { url: 'http://127.0.0.1:8788/remote/mcp' } },
  });
  assert.equal(result.ok, false);
  assert.deepEqual(loadRoutes(routesPath), previous);
});

test('two Agents with the same MCP name retain separate HTTP routes', t => {
  const dir = mkdtempSync(join(tmpdir(), 'tripwire-names-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const routesPath = join(dir, 'routes.json');
  for (const id of ['codex', 'claude-code']) {
    const host = { id, format: 'json', key: 'mcpServers', path: join(dir, id + '.json') };
    writeFileSync(host.path, JSON.stringify({ mcpServers: { docs: { url: 'https://' + id + '.example.com/mcp' } } }));
    const plan = planWrap({ host, serverName: 'docs' });
    assert.equal(applyEnrollment({ host, name: 'docs', plan, routesPath }).ok, true);
    assert.equal(loadRoutes(routesPath).servers[id + '::docs'].upstream, 'https://' + id + '.example.com/mcp');
  }
  assert.equal(Object.keys(loadRoutes(routesPath).servers).length, 2);
});
