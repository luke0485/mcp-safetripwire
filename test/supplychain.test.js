import { test } from 'node:test';
import assert from 'node:assert/strict';
import { packageToken, isPinned, baseName, editDistance, checkLaunch, WELL_KNOWN } from '../src/supplychain.js';

test('packageToken reads the package out of the common launchers', () => {
  assert.equal(packageToken('npx', ['-y', '@scope/pkg']), '@scope/pkg');
  assert.equal(packageToken('uvx', ['blender-mcp']), 'blender-mcp');
  assert.equal(packageToken('pipx', ['run', 'thing']), 'thing');
  assert.equal(packageToken('python', ['-m', 'some_module']), 'some_module');
  assert.equal(packageToken('node', ['server.js']), 'server.js');
  assert.equal(packageToken('npx', []), null);
});

test('isPinned recognises versions and commit hashes', () => {
  assert.equal(isPinned('pkg@1.2.3'), true);
  assert.equal(isPinned('pkg==2.0'), true);
  assert.equal(isPinned('git+https://x/y#abc1234'), true);
  assert.equal(isPinned('pkg'), false);
  assert.equal(isPinned('@scope/pkg'), false);
  assert.equal(isPinned(''), false);
});

test('baseName strips the version and keeps the scope', () => {
  assert.equal(baseName('@scope/pkg@1.2.3'), '@scope/pkg');
  assert.equal(baseName('pkg'), 'pkg');
});

test('editDistance is a sane Levenshtein', () => {
  assert.equal(editDistance('abc', 'abc'), 0);
  assert.equal(editDistance('abc', 'abd'), 1);
  assert.equal(editDistance('', 'abc'), 3);
  assert.equal(editDistance('blender-mcp', 'blender-mcp'), 0);
});

test('an unpinned registry package is flagged', () => {
  const f = checkLaunch({ command: 'npx', args: ['-y', 'some-mcp-server'] });
  assert.equal(f.length, 1);
  assert.equal(f[0].rule, 'unpinned-package');
  assert.equal(f[0].severity, 'medium');
});

test('a pinned package raises nothing', () => {
  assert.deepEqual(checkLaunch({ command: 'npx', args: ['-y', 'some-mcp-server@1.4.0'] }), []);
});

test('installing straight from a URL is high severity', () => {
  const f = checkLaunch({ command: 'uvx', args: ['https://example.com/x.tar.gz'] });
  assert.equal(f[0].rule, 'remote-source');
  assert.equal(f[0].severity, 'high');
});

test('a near-miss of a known package is called out as a typosquat suspect', () => {
  const f = checkLaunch({ command: 'npx', args: ['blender-mcp@1.0.0'.replace('blender-mcp', 'blender-mpc')] });
  const t = f.find((x) => x.rule === 'typosquat-suspect');
  assert.ok(t, 'expected a typosquat finding');
  assert.equal(t.severity, 'high');
});

test('an exact known package is not flagged as a typosquat', () => {
  const f = checkLaunch({ command: 'uvx', args: [WELL_KNOWN[3] + '@1.0.0'] });
  assert.equal(f.some((x) => x.rule === 'typosquat-suspect'), false);
});

test('forced install flags are flagged', () => {
  const f = checkLaunch({ command: 'npx', args: ['--force', 'thing@1.0.0'] });
  assert.equal(f.some((x) => x.rule === 'forced-install'), true);
});

test('no package token means no findings', () => {
  assert.deepEqual(checkLaunch({ command: 'node', args: ['--version'] }), []);
  assert.deepEqual(checkLaunch({}), []);
});
