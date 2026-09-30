import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {emptyAdvanced,saveAdvanced,loadAdvanced,advancedDecision} from '../src/advanced.js';
import {createInspector} from '../src/inspect.js';

test('signed protection settings reject mutation and deletion, without replacing rejected evidence',t=>{
 const dir=mkdtempSync(join(tmpdir(),'tripwire-advanced-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));const path=join(dir,'config.json');
 assert.deepEqual(loadAdvanced(path),emptyAdvanced());
 const value={...emptyAdvanced(),blockedTools:['upload']};saveAdvanced(value,path);assert.deepEqual(loadAdvanced(path),value);
 writeFileSync(path,readFileSync(path,'utf8').replace('upload','download'));assert.ok(loadAdvanced(path).integrityError);assert.throws(()=>saveAdvanced(value,path));
 rmSync(path);assert.ok(loadAdvanced(path).integrityError);assert.throws(()=>saveAdvanced(value,path));
});
test('domain blacklist respects domain boundaries and validates entries',()=>{
 const a={...emptyAdvanced(),blockedDestinations:['example.com']};
 assert.equal(advancedDecision(a,'channel','fetch',{url:'https://sub.example.com/a'}).reason,'destination-blacklist');
 assert.equal(advancedDecision(a,'channel','fetch',{url:'https://evil-example.com/a'}),null);
 assert.throws(()=>saveAdvanced({...a,blockedDestinations:['https://example.com']}));
});
test('frozen baseline only enforces mature samples and requested checks',()=>{
 const a={...emptyAdvanced(),baselineMode:'block',baseline:{'c::fetch':{channel:'c',tool:'fetch',calls:20,argKeys:['url'],destinations:['example.com']}}};
 assert.equal(advancedDecision(a,'c','fetch',{url:'https://example.com'}),null);
 assert.equal(advancedDecision(a,'c','fetch',{url:'https://other.net'}).enforce,true);
 assert.equal(advancedDecision({...a,baselineMode:'warn'},'c','fetch',{url:'https://other.net'}).enforce,false);
 assert.equal(advancedDecision(a,'c','newtool',{url:'https://other.net'}),null);
 assert.equal(advancedDecision({...a,checkNewFields:true},'c','fetch',{url:'https://example.com',extra:1}).reason,'baseline-new-field');
 assert.equal(a.baseline['c::fetch'].calls,20);
});
for(const transport of ['stdio','http']) test(transport+' applies live blacklist before forwarding, while observation stays advisory',()=>{
 let current=emptyAdvanced();let mode='warn';
 const inspect=createInspector({name:'c',getPin:()=>({hash:'approved'}),policy:{},getPosture:()=>mode,getAdvanced:()=>current,transport});
 const msg={jsonrpc:'2.0',id:7,method:'tools/call',params:{name:'fetch',arguments:{url:'https://example.com'}}};
 current={...current,blockedTools:['fetch']};assert.equal(inspect.onClientMessage(msg).forward,true);
 mode='block';const denied=inspect.onClientMessage(msg);assert.equal(denied.forward,false);assert.equal(denied.error.id,7);
 current=emptyAdvanced();assert.equal(inspect.onClientMessage(msg).forward,true);
 current={...current,integrityError:'changed'};assert.equal(inspect.onClientMessage(msg).forward,false);
});

test('oversized settings are rejected before creating a key or replacing valid settings',t=>{
 const dir=mkdtempSync(join(tmpdir(),'tripwire-size-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));const path=join(dir,'config.json');
 const baseline=Object.fromEntries(Array.from({length:10},(_,i)=>['c::t'+i,{channel:'c',tool:'t'+i,calls:20,argKeys:Array.from({length:500},(_,j)=>String(j)+'x'.repeat(490)),destinations:[]} ]));
 assert.throws(()=>saveAdvanced({...emptyAdvanced(),baseline},path),/1 MB/);
 assert.deepEqual(loadAdvanced(path),emptyAdvanced());
 saveAdvanced(emptyAdvanced(),path);const before=readFileSync(path,'utf8');assert.throws(()=>saveAdvanced({...emptyAdvanced(),baseline},path));assert.equal(readFileSync(path,'utf8'),before);
});
test('invalid local signing key fails closed',t=>{
 const dir=mkdtempSync(join(tmpdir(),'tripwire-key-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));const path=join(dir,'config.json');saveAdvanced(emptyAdvanced(),path);writeFileSync(path+'.key','short');assert.ok(loadAdvanced(path).integrityError);assert.throws(()=>saveAdvanced(emptyAdvanced(),path));
});
