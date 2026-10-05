import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { checkConsoleReady } from '../src/console-ready.js';

test('console readiness authenticates without following a cookie redirect', async () => {
  const token = 'test-only-console-token';
  const server = createServer((req, res) => {
    if (req.url.includes('?token=' + token)) {
      res.writeHead(302, { location: '/', 'set-cookie': 'tripwire_token=' + token });
    } else if (req.headers['x-tripwire-token'] === token) {
      res.writeHead(200); res.write('<title>MCP SafeTripwire</title>');
    } else res.writeHead(401);
    res.end();
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = `http://127.0.0.1:${server.address().port}/`;
  try {
    assert.equal((await fetch(address + '?token=' + token)).status, 401);
    assert.equal(await checkConsoleReady(address + '?token=' + token), true);
    await assert.rejects(checkConsoleReady(address + '?token=wrong'));
    await assert.rejects(checkConsoleReady('https://example.com/?token=' + token));
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
