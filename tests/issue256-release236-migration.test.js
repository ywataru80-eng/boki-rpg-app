'use strict';
/* Issue #256 successor P1: independent effective assessment, v5/v6 historical
 * data safety. The old source comes from immutable main SHA, not QA fixtures.
 * This is a candidate test. Do not certify legacy release235 validation from it.
 */
const assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process'),vm=require('node:vm');
const BASE='177dadd83369b0c1bd0c95db4af379ea35515c67';
const old=path=>cp.execFileSync('git',['show',BASE+':'+path],{encoding:'utf8',maxBuffer:12*1024*1024});
function load(questions,model,rpg){
 const w={window:{},console};vm.runInNewContext(questions,w);vm.runInNewContext(model,w);
 if(rpg)vm.runInNewContext(rpg,w);return w.window;
}
const current=load(fs.readFileSync('data/questions.js','utf8'),fs.readFileSync('js/model.js','utf8'),fs.readFileSync('js/rpg.js','utf8'));
const previous=load(old('data/questions.js'),old('js/model.js'),old('js/rpg.js'));
const now=current.QuestionData,before=previous.QuestionData,Model=current.ProgressModel,Old=previous.ProgressModel;
const ids=Object.keys(before).sort();
const edited=Array.from({length:17},(_,i)=>'D'+String(i+2).padStart(3,'0'));
let checks=0;
function test(name,fn){try{fn();checks++;console.log('PASS '+name)}catch(e){console.error('FAIL '+name+' '+e.stack);process.exitCode=1}}
function clone(x){return JSON.parse(JSON.stringify(x))}
function store(value=null){return{value,writes:0,getItem(){return this.value},setItem(_,data){this.value=data;this.writes++;return true},removeItem(){this.value=null;return true}}}
const equivalent=(a,b)=>assert.equal(JSON.stringify(a),JSON.stringify(b));
test('exactly 300 original IDs, unchanged D019 D020 assessed contracts',()=>{
 equivalent(Object.keys(now).sort(),ids);
 for(const id of ids.filter(x=>!edited.includes(x))){
  const a=now[id],b=before[id];
  const keep=q=>({id:q.id,type:q.type,category:q.category,format:q.format,table:q.table,answer:q.answer,question:q.question,materials:q.materials});
  equivalent(keep(a),keep(b));
 }
});
test('17 distinct assessment contracts, 17 independent material oracles',()=>{
 const patterns=new Set();
 for(const id of edited){
  const q=now[id],original=before[id];
  assert.equal(q.type,'worksheet');assert.equal(q.format,'decision-worksheet-v2');
  assert(q.question.includes('前期3月決算'));assert(q.npcDialogue.includes('水野先輩'));
  assert(q.explanation.includes('【判断の順序】'));assert(q.explanation.includes('【計算と転記】'));assert(q.explanation.includes('【検算】'));
  assert(q.table.inputCells.length>0 && q.table.inputCells.length<=4);
  equivalent(q.table.inputCells,Object.keys(q.answer.cells));
  const formula=current.independentlyDerivedTableCells(q);
  assert(formula,id+' no independent oracle');
  equivalent(q.answer.cells,formula);
  const r=original.table.rows,premium=r[0].before,cost=r[1].before,denom=Number(original.question.match(/うち(\d+)分の1/)?.[1]),life=Number(original.question.match(/耐用年数(\d+)年/)?.[1]);
  const four={insurance_adjustment:premium/denom,insurance_expense_after:premium-premium/denom,depreciation_expense:cost/life,equipment_book_value_after:cost-cost/life};
  for(const [key,value] of Object.entries(q.answer.cells))if(Object.hasOwn(four,key))assert.equal(value,four[key],id+' independently recomputed '+key);
  patterns.add(q.table.inputCells.join('|'));
 }
 assert(patterns.size>=9,'insufficient variation in actual required judgments');
});
test('model revision6 covers exact 17 successor content identities plus existing identities',()=>{
 const model=new Model(now,store(),'progress');assert.equal(model.state.contentRevision,6);
 for(const id of edited)assert(model.state.questionContentVersions[id].includes('decision-v2'),id);
 assert.equal(Object.keys(model.state.questionContentVersions).length,21);
 assert(Model.validateBackupState(model.state,now));
});
function oldState(id,results){
 const storage=store(),model=new Old(before,storage,'progress');
 for(let i=0;i<results.length;i++){
  const ts=Date.UTC(2026,10,7,2,0,i),correct=results[i];
  assert(model.recordAttempt(id,correct,4000,'',false,ts,null,'sure',{support:'none'}));
  assert(model.record(id,correct,ts));
  if(i===results.length-1)assert(model.setDraft(id,clone(before[id].answer)));
 }
 assert(Old.validateBackupState(model.state,before));
 return clone(model.state);
}
for(const scenario of [{label:'empty',scores:[]},{label:'old correct',scores:[true]},{label:'old wrong',scores:[false]},{label:'old mixed',scores:[false,true]}]){
 test('v5→v6 '+scenario.label+' archives old D002, retains efforts, validates and reloads',()=>{
  const legacy=oldState('D002',scenario.scores),store1=store(JSON.stringify(legacy)),migration=new Model(now,store1,'progress');
  assert(!migration.storageWriteBlocked,'refused valid legacy save');
  assert.equal(migration.state.contentRevision,6);
  assert(Model.validateBackupState(migration.state,now));
  const record=migration.state.contentMigrationArchive.questions.D002;
  if(scenario.scores.length){
   assert(record,'missing old evidence archive');
   assert.equal(record.attempts.length,scenario.scores.length);
   assert(migration.state.contentRecheckIds.includes('D002'),'recheck required');
   assert(!migration.state.correctIds.includes('D002'),'obsolete answers must not be reused as v6 mastery');
   assert(!migration.state.answeredIds.includes('D002'),'obsolete attempts must not be active');
   assert(!migration.state.drafts.D002,'obsolete draft must not survive');
  }else assert(!record,'new users have no old content archive');
  const saved=store1.value,writes=store1.writes;
  const again=new Model(now,store1,'progress');
  assert(!again.storageWriteBlocked);
  assert.equal(store1.value,saved,'revision6 reload unexpectedly mutated save');
  assert.equal(store1.writes,writes,'revision6 reload wrote again');
 });
}
test('v5 earned progress for unaffected J001 persists and obsolete D003 does not leak mastery',()=>{
 const oldState1=oldState('D003',[true]),storage=store();
 const model=new Old(before,storage,'progress');model.state=clone(oldState1);
 const ts=Date.UTC(2026,10,7,6,0,0);
 assert(model.recordAttempt('J001',true,2400,'',false,ts,null,'sure',{support:'none'}));
 assert(model.record('J001',true,ts));assert(Old.validateBackupState(model.state,before));
 const migr=store(JSON.stringify(model.state)),newModel=new Model(now,migr,'progress');
 assert(Model.validateBackupState(newModel.state,now));
 assert(newModel.state.correctIds.includes('J001'));
 assert(!newModel.state.correctIds.includes('D003'));
 assert(newModel.state.contentMigrationArchive.questions.D003);
});
test('new v6 answers seal new identity and old v5 backup is migratable without modifying original',()=>{
 const orig=oldState('D012',[true]),raw=JSON.stringify(orig);
 assert(Old.validateBackupState(orig,before));
 const prepared=Model.prepareBackupState(orig,now);
 assert(prepared && Model.validateBackupState(prepared,now));
 assert(!prepared.correctIds.includes('D012'));
 assert(prepared.contentMigrationArchive.questions.D012);
 assert.equal(JSON.stringify(orig),raw,'backup caller object mutated');
 const st=store();const model=new Model(now,st,'progress');
 const ts=Date.UTC(2026,10,7,7,0);
 assert(model.recordAttempt('D012',true,2000,'',false,ts,null,'sure',{support:'none'}));
 assert(model.record('D012',true,ts));
 assert(model.state.attempts.some(x=>x.questionId==='D012'&&x.contentIdentity===model.state.questionContentVersions.D012));
 assert(Model.validateBackupState(model.state,now));
});
test('malformed older data never overwrites user storage',()=>{
 const original=oldState('D005',[true]);
 original.questionContentVersions.L044='tampered';
 const raw=JSON.stringify(original),st=store(raw);
 const model=new Model(now,st,'progress');
 assert.equal(model.storageWriteBlocked,true);
 assert.equal(st.value,raw);
 assert.equal(st.writes,0);
 assert.equal(Model.prepareBackupState(original,now),null);
});
test('all 300 investigation counters are within bounds, supplementary decisions do not claim Story progress',()=>{
 for(const q of Object.values(now)){
  const markers=[...String(q.story||'').matchAll(/〔調査 (\d+)\/(\d+)〕/gu)];
  for(const [,n,total] of markers)assert(Number(n)>=1&&Number(n)<=Number(total),q.id+': invalid Story counter '+n+'/'+total);
 }
 for(let number=13;number<=18;number++){
  const id='D'+String(number).padStart(3,'0');
  assert(now[id].story.includes('〔追加演習 '+(number-12)+'/6〕'),id+': supplementary work falsely counted as main Story');
  assert(!now[id].story.includes('〔調査 '),id+': extra exercise must not extend locked Story cases');
 }
 const hooks=edited.map(id=>now[id].nextHook);
 assert.equal(new Set(hooks).size,17,'the 17 distinct decisions require specific next-task transitions');
});
if(!process.exitCode)console.log('ISSUE256_RELEASE236_GEN190_INDEPENDENT_MIGRATION_PASS',checks);
