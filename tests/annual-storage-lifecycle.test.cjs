'use strict';
// Real Controller storage session acceptance; all native bytes are isolated.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const clone=x=>JSON.parse(JSON.stringify(x));
function boot(bytes={},extra={},blocked=false){
  const status={textContent:'',classList:{add(){},remove(){}}};let reloads=0;
  const storage={getItem:k=>bytes[k]??null,setItem(k,v){bytes[k]=String(v)},removeItem(k){delete bytes[k]}};
  const w={localStorage:storage,location:{reload(){reloads++}},dispatchEvent(){},AppView:class{}};
  const ctx={window:w,console,queueMicrotask,Event};
  for(const p of ['data/accounting-domain.js','data/questions.js','data/accounting-oracle.js','data/fy2027-curriculum.js','js/model.js','js/rpg.js','js/engine.js','js/annual-storage.js','js/controller.js'])vm.runInNewContext(fs.readFileSync(p,'utf8'),ctx,{filename:p});
  const doc={getElementById:()=>status};const catalog=w.CurriculumRegistry.active('FY2026');
  Object.assign(w,extra);const c=new w.AppController(doc,catalog.questions,catalog.examPool);
  assert.equal(Boolean(c.model.storageWriteBlocked),blocked);c.openSettings=()=>{};
  return {w,c,bytes,status,reloads:()=>reloads,keys:w.AnnualStorage.KEYS};
}
function earn({c,w}){const q=c.questions.J019,s=w.GradingEngine.grade(q,q.answer);assert(s.correct);assert(c.learningTransaction(()=>{assert(c.model.recordAttempt(q.id,true,100,'',false,1000));assert(c.model.record(q.id,true,1000));assert(c.rpg.reward(q,s));return true}));assert(c.model.state.correctIds.includes(q.id));assert(c.rpg.state.xp>0);}
function staleProbe(o){const {c,bytes,keys:k}=o,before=clone(bytes),a=c.model.storage;
 const results={},changes={};
 const probe=(name,fn)=>{const b=JSON.stringify(bytes);results[name]=fn();changes[name]=b!==JSON.stringify(bytes);};
 probe('progressSave',()=>c.model.save());probe('characterSave',()=>c.rpg.save());
 const readProgress=()=>{try{return JSON.parse(bytes[k.FY2026]||'null')}catch(_){return null}};
 const restoredCorrect=readProgress()?.correctIds?.includes('J019')??false;
 const restoredXP=(()=>{try{return JSON.parse(bytes[k.character]||'null')?.xp??0}catch(_){return 0}})();
 probe('directRestore',()=>a.restoreItem(k.FY2026,before[k.FY2026]??null));
 probe('directRemove',()=>a.removeItem(k.character));
 return {results,changes,bytesUnchanged:Object.values(changes).every(x=>!x),restoredCorrect,restoredXP};}
const results=[];
async function test(name,run){try{const detail=await run();results.push({name,...detail});}catch(e){results.push({name,error:String(e.stack||e)});}}
(async()=>{
 await test('FY2026 scoped reset retains XP, revokes old writers',()=>{const o=boot();earn(o);const {c,keys:k,bytes}=o,xp=c.rpg.state.xp;assert(c.model.storage.annualStorage.resetYear('FY2026',{confirm:true}));assert.equal(JSON.parse(bytes[k.character]).xp,xp);const r=staleProbe(o);return {pass:r.bytesUnchanged&&Object.values(r.results).every(v=>v===false),...r};});
 await test('V2 all-absent restore revokes old writers',()=>{const o=boot();earn(o);const a=o.c.model.storage.annualStorage,b=a.exportV2();b.progress.FY2026={status:'absent'};b.character={status:'absent'};assert(a.importV2(b,{confirmReplaceAll:true}));const r=staleProbe(o);return {pass:r.bytesUnchanged&&Object.values(r.results).every(v=>v===false),...r};});
 await test('V1 UI import revokes old writers before navigation',async()=>{const o=boot(),c=o.c;assert(c.model.save());assert(c.rpg.save());const backup=clone({format:'boki-rpg-backup',version:1,progress:c.model.state,character:c.rpg.state});earn(o);assert(await c.importBackup({text:async()=>JSON.stringify(backup)}));assert.equal(o.reloads(),1);const r=staleProbe(o);return {pass:r.bytesUnchanged&&Object.values(r.results).every(v=>v===false),...r};});
 await test('existing full reset revokes old writers before navigation',()=>{const o=boot();earn(o);assert(o.c.resetLearningData());assert.equal(o.reloads(),1);const r=staleProbe(o);return {pass:r.bytesUnchanged&&Object.values(r.results).every(v=>v===false),...r};});
 await test('invalid V2 restore leaves the existing session writable',()=>{const o=boot();earn(o);const before=clone(o.bytes),a=o.c.model.storage.annualStorage;assert.throws(()=>a.importV2({format:'invalid'},{confirmReplaceAll:true}));const unchanged=JSON.stringify(before)===JSON.stringify(o.bytes);return {pass:unchanged&&o.c.model.save()===true&&o.c.rpg.save()===true,bytesUnchanged:unchanged};});
 await test('corrupt annual journal blocks every mutation and preserves native bytes',()=>{const o=boot();earn(o);o.bytes[o.w.AnnualStorage.JOURNAL]='{}';const b=boot(o.bytes,{},true),r=staleProbe(b);assert(!b.c.model.storage.annualStorage);return {pass:r.bytesUnchanged&&Object.values(r.results).every(v=>v===false),...r};});
 await test('mismatched V1/V2 reward histories rejected atomically',async()=>{const o=boot(),empty=clone(o.c.rpg.state);earn(o);const before=clone(o.bytes),a=o.c.model.storage.annualStorage,p=a.exportV2();p.character={status:'saved',state:empty};assert.throws(()=>a.importV2(p,{confirmReplaceAll:true}),/invalid backup/);const legacy={format:'boki-rpg-backup',version:1,progress:clone(o.c.model.state),character:empty};assert.throws(()=>a.importV1(legacy,{confirmLegacyRestore:true}),/invalid legacy backup/);assert.equal(await o.c.importBackup({text:async()=>JSON.stringify(legacy)}),false);assert.deepEqual(o.bytes,before);assert(o.c.model.save());return {pass:true};});
 await test('reload failure cannot revive stale model',()=>{const o=boot({}, {location:{reload(){throw Error('navigation denied');}}});earn(o);assert(o.c.resetLearningData());assert(o.status.textContent.includes('手動'));const r=staleProbe(o);return {pass:r.bytesUnchanged&&Object.values(r.results).every(v=>v===false),...r};});
 await test('successful annual reset stops timer and rejects further annual operations',()=>{const o=boot();earn(o);let cleared=null;o.w.clearInterval=id=>{cleared=id;};o.c.examTimerId=42;const a=o.c.model.storage.annualStorage;assert(a.resetYear('FY2026',{confirm:true}));assert.equal(cleared,42);assert.equal(o.c.examTimerId,null);assert.throws(()=>a.exportV2(),/storage session unavailable/);assert.throws(()=>a.resetAll({confirm:true}),/storage session unavailable/);const next=boot(o.bytes);assert.equal(next.c.rpg.state.xp,20);assert.equal(next.c.model.state.correctIds.length,0);return {pass:true};});
 await test('failed annual write rolls back exactly and permits continued learning',()=>{const o=boot();earn(o);const before=clone(o.bytes),set=o.w.localStorage.setItem;let fail=true;o.w.localStorage.setItem=function(k,v){if(k===o.keys.character&&fail){fail=false;throw Error('injected');}set.call(this,k,v);};assert.throws(()=>o.c.model.storage.annualStorage.resetAll({confirm:true}));assert(!fail);assert.deepEqual(o.bytes,before);assert(o.c.model.save());assert(o.c.rpg.save());return {pass:true};});
 await test('unrecoverable annual write failure stops all old mutation paths',()=>{const o=boot();earn(o);const set=o.w.localStorage.setItem;let fail=false;o.w.localStorage.setItem=function(k,v){if(k===o.keys.character){fail=true;throw Error('injected');}if(fail&&k===o.keys.FY2026)throw Error('rollback interrupted');set.call(this,k,v);};assert.throws(()=>o.c.model.storage.annualStorage.resetAll({confirm:true}),/recovery pending/);assert(o.bytes[o.w.AnnualStorage.JOURNAL]);const r=staleProbe(o);assert.throws(()=>o.c.model.storage.annualStorage.resetAll({confirm:true}));return {pass:r.bytesUnchanged&&Object.values(r.results).every(v=>v===false),...r};});
 console.log(JSON.stringify({baseline:require('node:child_process').execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),results},null,2));
 if(results.some(r=>!r.pass))process.exitCode=1;
})();
