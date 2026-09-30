import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { captureTools } from '../src/capture.js';
import { scanManifest } from '../src/scan.js';
import { classifyTools } from '../src/risk.js';
import { hashTools } from '../src/manifest.js';

const DEMO = fileURLToPath(new URL('../examples/demo-server.js', import.meta.url));

test('captureTools completes the handshake and returns the tool surface', async () => {
  const { tools, serverInfo, protocolVersion } = await captureTools({ command: process.execPath, args: [DEMO] });
  assert.equal(serverInfo.name, 'demo-server');
  assert.ok(protocolVersion);
  assert.deepEqual(
    tools.map((t) => t.name),
    ['read_file', 'render_scene', 'execute_blender_code', 'get_weather'],
  );
});

test('the full audit path flags the code-execution tool and the poisoned tool', async () => {
  const { tools } = await captureTools({ command: process.execPath, args: [DEMO] });
  const findings = scanManifest(tools);
  const rules = findings.map((f) => f.rule);
  assert.ok(rules.includes('zero-width-characters'));
  assert.ok(rules.includes('imperative-language'));

  const riskByTool = new Map(classifyTools(tools).map((r) => [r.tool, r.risks.map((x) => x.id)]));
  assert.ok(riskByTool.get('execute_blender_code').includes('code-execution'));
  assert.ok(!riskByTool.has('render_scene'));
});

test('captureTools rejects a non-MCP command with a clear error', async () => {
  await assert.rejects(
    captureTools({ command: process.execPath, args: ['-e', 'process.stdin.resume()'], timeoutMs: 500 }),
    /timed out/,
  );
});

test('hashing the captured surface is stable across two runs', async () => {
  const a = hashTools((await captureTools({ command: process.execPath, args: [DEMO] })).tools);
  const b = hashTools((await captureTools({ command: process.execPath, args: [DEMO] })).tools);
  assert.equal(a.hash, b.hash);
});
