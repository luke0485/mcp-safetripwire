import {test} from 'node:test';import assert from 'node:assert/strict';import {Readable} from 'node:stream';import {readJsonBody} from '../src/console.js';
test('management JSON limits bytes and rejects scalar and array payloads',async()=>{
 assert.deepEqual(await readJsonBody(Readable.from([Buffer.from('{"mode":"warn"}')])),{mode:'warn'});
 for(const text of ['null','[]','"text"',JSON.stringify({value:'x'.repeat(65536)})])await assert.rejects(readJsonBody(Readable.from([Buffer.from(text)])));
 await assert.rejects(readJsonBody(Readable.from([Buffer.alloc(40000),Buffer.alloc(40000)])),/64 KB/);
});
