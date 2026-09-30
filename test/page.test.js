import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderPage } from '../src/page.js';

// The page ships its JavaScript inside an HTML template literal. A single lost
// escape there produces a page that renders the header and nothing else, with
// no error anywhere on the server side -- which is exactly what happened once.
// This test closes that hole by parsing the emitted script.
function emittedScript(html) {
  const a = html.indexOf('<script>');
  const b = html.lastIndexOf('</script>');
  assert.ok(a >= 0 && b > a, "the page must contain one script block");
  return html.substring(a + 8, b);
}

test('the emitted page script is syntactically valid', () => {
  const html = renderPage({ startedAt: '2026-01-01 00:00:00' });
  const script = emittedScript(html);
  assert.doesNotThrow(() => new Function(script), "page script must parse");
});

test('the launch stamp is injected and no placeholder is left behind', () => {
  const html = renderPage({ startedAt: '2026-01-01 00:00:00' });
  assert.ok(html.includes('2026-01-01 00:00:00'));
  assert.ok(!html.includes('__STARTED__'));
});

test('core UI pieces are present', () => {
  const html = renderPage({});
  for (const needle of ['tw-spin', 'function spinnerHtml', 'function autoRefresh', 'function statsHtml', 'function peersHtml', 'function pendingHtml', 'function topologyHtml', 'function summaryText', 'function updateLede', 'doProtectAll', 'doApprove', 'backendDown', '--accent:#111827', 'agent-picker', '/api/detect-agent']) {
    assert.ok(html.includes(needle), `missing: ${needle}`);
  }
  assert.ok(!html.includes('1668e3'), 'old blue must not come back');
});
