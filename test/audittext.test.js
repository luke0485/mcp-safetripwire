import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AUDIT_TEXT, auditText } from '../src/audittext.js';

test('audit explanations are bilingual and preserve distinct allowed/blocked outcomes', () => {
  for (const event of Object.keys(AUDIT_TEXT)) {
    for (const lang of ['zh', 'en']) {
      const text = auditText({ event }, lang);
      assert.ok(text.label && text.note, `${event}: ${lang}`);
    }
  }
  assert.match(auditText({ event: 'tools-call', action: 'block' }, 'zh').note, /未交给工具/);
  assert.match(auditText({ event: 'tools-call', action: 'allow' }, 'en').note, /Request allowed/);
  assert.match(auditText({ event: 'baseline-deviation', rule: 'destination-new' }, 'en').note, /New address/);
  assert.match(auditText({ event: 'static-finding', rule: 'cross-tool-reference' }, 'zh').note, /文档提到/);
});
