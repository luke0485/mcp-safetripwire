import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderPage } from '../src/page.js';

// RUNTIME smoke test.
//
// Checking that the emitted script *parses* is not enough: a call to a function
// that was never defined parses fine and only explodes when the page runs, which
// is exactly how a blank page shipped once. This executes the script against a
// minimal fake DOM and fails if anything throws.

const MOCK_STATUS = {
  protection: 'observe',
  platform: 'test',
  dataDir: 'C:/tmp',
  logPath: 'C:/tmp/audit.jsonl',
  projectRoot: 'C:/tmp',
  pinned: [],
  routes: [],
  listen: { host: '127.0.0.1', port: 8788 },
  hosts: [{ id: 'codex', label: 'Codex', path: 'C:/tmp/config.toml', exists: true, servers: [] }],
  mechanism: { channels: { stdio: 1, http: 0 }, pinned: 0, routes: 0, deception: false, posture: 'observe' },
  tools: {
    total: 1,
    unprotected: 1,
    alerts24h: 0,
    peers: [],
    topology: [{ host: 'codex', name: 'node_repl', kind: 'stdio', protected: false }],
    hourly: Array.from({ length: 24 }, () => ({ critical: 0, warn: 0, info: 0 })),
    supply: {},
    pending: [],
  },
};

function fakeElement(id) {
  return {
    id,
    innerHTML: '',
    textContent: '',
    className: '',
    style: {},
    dataset: {},
    onclick: null,
    value: '',
    open: false,
    showModal() { this.open = true; },
    close() { this.open = false; },
    remove() { this.removed = true; },
    classList: { toggle() {}, add() {}, remove() {} },
  };
}

function makeEnv() {
  const elements = new Map();
  const document = {
    getElementById(id) { if (!elements.has(id)) elements.set(id, fakeElement(id)); return elements.get(id); },
    // In a real page querySelector("#main") and getElementById("main") return
    // the SAME node. A stub that hands out a fresh object each call hides bugs
    // instead of finding them.
    querySelector(sel) {
      const key = String(sel || 'q').replace(/^#/, '');
      if (!elements.has(key)) elements.set(key, fakeElement(key));
      return elements.get(key);
    },
    querySelectorAll() { return []; },
    addEventListener() {},
    documentElement: { lang: '' },
  };
  const window = { addEventListener() {} };
  const localStorage = { getItem() { return null; }, setItem() {} };
  const fetch = (url) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(String(url).includes('/api/advanced') ? {blockedTools:[],blockedDestinations:[],baselineMode:'warn',baseline:{}} : MOCK_STATUS) });
  const aborted = [];
  class FakeAbortController { constructor() { this.signal = { aborted: false }; } abort() { this.signal.aborted = true; aborted.push(1); } }
  return { document, window, localStorage, fetch, AbortController: FakeAbortController, elements };
}

function scriptOf(html) {
  const a = html.indexOf('<script>');
  const b = html.lastIndexOf('</script>');
  return html.substring(a + 8, b);
}

function run(env) {
  const script = scriptOf(renderPage({ startedAt: '2026-01-01 00:00:00' }));
  const fn = new Function(
    'document', 'window', 'localStorage', 'fetch', 'AbortController',
    'navigator', 'setTimeout', 'setInterval', 'clearTimeout', 'alert', 'confirm',
    script + '\nreturn { topologyHtml, chartHtml, pendingHtml, tabs };',
  );
  return fn(
    env.document, env.window, env.localStorage, env.fetch, env.AbortController,
    { language: 'zh-CN' },
    (cb) => { cb(); return 0; },  // run timers immediately so the async path settles
    () => 0,
    () => {},
    () => {},
    () => true,
  );
}

test('the page script executes without throwing', () => {
  const env = makeEnv();
  assert.doesNotThrow(() => run(env), 'the page script must survive execution');
});

test('HTTP relay setup closes the picker and selects the Remote tab', async () => {
  const env = makeEnv();
  run(env);
  env.window.openRemoteSetup();
  await new Promise(r=>setImmediate(r));
  await new Promise(r=>setImmediate(r));
  assert.equal(env.document.getElementById('agent-picker').open, false);
  assert.match(env.document.getElementById('nav').innerHTML, /data-tab="remote" class="on"/);
  assert.ok(env.document.getElementById('main').innerHTML.includes('添加远程服务'));
});

test('chart uses fine-grained real buckets and bounded curves with empty data handled', () => {
  const ui = run(makeEnv());
  const buckets = Array.from({length:288}, (_, i) => ({info:i === 137 ? 8 : 0,warn:0,critical:0,ts:new Date(i*300000).toISOString()}));
  const html = ui.chartHtml({tools:{activity:buckets,hourly:[{info:99,warn:0,critical:0}],historyPartial:true}});
  assert.equal((html.match(/ C/g) || []).length, 287*3);
  assert.ok(html.includes('非完整日统计'));
  assert.ok(html.includes('<b>8</b>'));
  assert.ok(!html.includes('<b>99</b>'));
  assert.equal(ui.chartHtml({tools:{activity:[]}}), '');
});

test('topology retains every channel across multiple Agents and escapes tool names', () => {
  const ui = run(makeEnv());
  const topology = Array.from({ length: 12 }, (_, i) => ({ host: 'agent-' + i % 4, name: 'tool-' + i, protected: true }));
  topology.push({ host: 'agent-0', name: '<script>alert(1)</script>', protected: false });
  const html = ui.topologyHtml({ tools: { topology }, hosts: [] });
  assert.equal((html.match(/class="flow /g) || []).length, 13);
  assert.equal((html.match(/<section class="channel-group"/g) || []).length, 4);
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('<script>'));
  const empty = ui.topologyHtml({ tools: { topology: [] }, hosts: [] });
  assert.equal((empty.match(/class="channel-group empty"/g) || []).length, 1);
  assert.ok(empty.includes('class="add-orb"'));
  assert.equal((empty.match(/class="flow /g) || []).length, 0);
});

test('a render actually populates the main region', async () => {
  const env = makeEnv();
  run(env);
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  const main = env.document.getElementById('main');
  assert.ok(main.innerHTML.length > 50, 'main should have been rendered, got: ' + main.innerHTML.slice(0, 80));
  assert.ok(main.innerHTML.includes('card'), 'the rendered output should contain cards');
});

test('the old configuration-summary line stays hidden', async () => {
  const env = makeEnv();
  run(env);
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  const lede = env.document.getElementById('lede');
  assert.equal(lede.style.display, 'none', 'the summary line was removed on request');
});

test('Agent picker filters products by vendor and detects without writing configuration', async () => {
  const env = makeEnv();
  const requests = [];
  env.fetch = (url, options) => {
    requests.push({ url, method: options?.method });
    return Promise.resolve({ ok: true, json: async () => url.includes('/api/detect-agent') ? { exists: true, valid: true, path: 'fixture', servers: ['files', 'browser', 'node_repl'].map(name => ({ name, kind: 'stdio' })) } : MOCK_STATUS });
  };
  run(env);
  env.window.openChannelPicker();
  await new Promise(r => setImmediate(r));
  assert.equal(env.document.getElementById('agent-picker').open, true);
  assert.ok(env.document.getElementById('agent-detection').innerHTML.includes('node_repl'));
  assert.equal((env.document.getElementById('agent-detection').innerHTML.match(/<tr>/g) || []).length, 3);
  env.document.getElementById('agent-vendor').value = 'Alibaba';
  env.window.updateAgentOptions();
  await new Promise(r => setImmediate(r));
  const products = env.document.getElementById('agent-product').innerHTML;
  assert.ok(products.includes('Qoder CLI') && products.includes('Qwen Code'));
  assert.ok(!products.includes('Codex'));
  assert.ok(requests.every(r => !r.method || r.method === 'GET'));
  env.window.closeAgentPicker();
  assert.equal(env.document.getElementById('agent-picker').open, false);
});

test('approval handlers treat hostile channel names as data and carry the reviewed hash', () => {
  const ui = run(makeEnv());
  const name = '\");globalThis.__tripwireInjected=true;//<img src=x>';
  const hash = 'a'.repeat(64);
  const html = ui.pendingHtml({ tools: { pending: [{ name, hash, count: 1 }] } });
  const encoded = html.match(/onclick="([^"]+)"/)[1];
  const handler = encoded.replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  let received;
  new Function('doApprove', handler)((...args) => { received = args; });
  assert.deepEqual(received, [name, hash]);
  assert.equal(globalThis.__tripwireInjected, undefined);
});
