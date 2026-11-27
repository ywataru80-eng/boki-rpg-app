'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {create,KEYS:K,JOURNAL:J}=require('../js/annual-storage.js');
const w={};const context={window:w,console,queueMicrotask,Event};
for(const p of ['data/accounting-domain.js','data/questions.js','data/accounting-oracle.js','data/fy2027-curriculum.js','js/model.js','js/rpg.js','js/engine.js','js/annual-storage.js','js/controller.js'])vm.runInNewContext(fs.readFileSync(p,'utf8'),context,{filename:p});
const Q=w.CurriculumRegistry.active('FY2026'),M=w.ProgressModel,G=w.RPGModel,C=w.AppController,R=w.CurriculumRegistry;
const removed=Object.keys(Q.questions).filter(id=>R.identity(id).replacementId),candidates=R.candidateIds().map(id=>R.inspectCandidate(id));
const testQuestions={...Object.fromEntries(Object.entries(Q.questions).filter(([id])=>!removed.includes(id))),...Object.fromEntries(candidates.map(q=>[q.id,q]))};
const testPool=Q.examPool.map(id=>R.identity(id).replacementId||id);
const copy=x=>JSON.parse(JSON.stringify(x));const score={correct:true,ratio:1,earned:1,possible:1};
let passed=0;function test(name,fn){fn();console.log('PASS '+name);passed++;}
function make(){const d={};let fail=()=>false;const store={getItem:k=>d[k]??null,hasItem:k=>Object.hasOwn(d,k),setItem(k,v){if(fail('set',k,v))return false;d[k]=v;return true},removeItem(k){if(fail('remove',k))return false;delete d[k];return true}};
 const validateProgress=(year,p)=>year==='FY2026'?M.validateBackupState(p,Q.questions,Q.examPool):M.validateBackupState(p,testQuestions,testPool);
 const api=create(store,{owns:()=>true,validateProgress,validateCharacter:p=>G.validateBackupState(p),recoverAnswer:year=>C.recoverAnswerTransaction(store,K[year],K.character)});
 const old=new M(Q.questions,store,K.FY2026,Q.examPool),g=new G(store,K.character);assert(old.recordAttempt('J019',true,100,'',false,1000));assert(old.record('J019',true,1000));assert(old.setDraft('J019',copy(Q.questions.J019.answer)));assert(g.reward(Q.questions.J019,score));old.save();g.save();
 const legacy=copy({format:'boki-rpg-backup',version:1,progress:old.state,character:g.state});const next=new M(testQuestions,store,K.FY2027,testPool),id='FY27-SALE-002';assert(next.recordAttempt(id,true,100,'',false,2000));assert(next.record(id,true,2000));assert(next.setDraft(id,copy(testQuestions[id].answer)));assert(g.reward(testQuestions[id],score));next.save();g.save();
 return {d,store,api,old,next,g,legacy,id,fail:f=>fail=f};}
test('actual models roundtrip both namespaces and XP',()=>{const s=make(),b=s.api.exportV2(),before={...s.d};assert.equal(b.character.state.xp,40);s.api.resetAll({confirm:true});s.api.importV2(b,{confirmReplaceAll:true});assert.deepEqual(s.d,before);assert.deepEqual(copy(new M(Q.questions,s.store,K.FY2026,Q.examPool).state.drafts.J019),copy(s.old.state.drafts.J019));assert.deepEqual(copy(new M(testQuestions,s.store,K.FY2027,testPool).state.drafts[s.id]),copy(s.next.state.drafts[s.id]));assert.equal(new G(s.store,K.character).state.xp,40);});
test('actual legacy restore cannot overwrite newer shared XP',()=>{const s=make(),before={...s.d};assert.throws(()=>s.api.importV1(s.legacy,{confirmLegacyRestore:true}));assert.deepEqual(s.d,before);});
test('actual earned progress without character rejected',()=>{const s=make(),b=s.api.exportV2(),before={...s.d};b.character={status:'reset'};assert.throws(()=>s.api.importV2(b,{confirmReplaceAll:true}));assert.deepEqual(s.d,before);});
test('actual year reset with XP retained passes annual startup pair validation',()=>{const s=make();s.api.resetYear('FY2026',{confirm:true});const adapter={...s.store,getItem:k=>s.d[k]==='null'?null:s.d[k]??null};assert(C.initializeStorageNamespace(adapter,{kind:'current'}));assert.equal(s.api.exportV2().progress.FY2026.status,'reset');assert.equal(new G(s.store,K.character).state.xp,40);assert.equal(new M(Q.questions,{...adapter,getItem:k=>w.AnnualStorage.intentionalEmpty(k,s.d[k])?null:adapter.getItem(k)},K.FY2026,Q.examPool).state.correctIds.length,0);});
test('actual same-year archive roundtrip preserves absent and reset distinction',()=>{const s=make();delete s.d[K.FY2027];const b=s.api.exportV2();assert.equal(b.progress.FY2027.status,'absent');s.api.importV2(b,{confirmReplaceAll:true});assert(!Object.hasOwn(s.d,K.FY2027));s.api.resetYear('FY2027',{confirm:true});const c=s.api.exportV2();assert.equal(c.progress.FY2027.status,'reset');s.api.importV2(c,{confirmReplaceAll:true});assert.equal(s.d[K.FY2027],'null');assert.throws(()=>s.api.importV1(s.legacy,{confirmLegacyRestore:true}));});
test('actual interrupted annual reset restores all three raw states',()=>{const s=make(),before={...s.d};let tripped=false;s.fail((op,k)=>op==='set'&&(k===K.character?(tripped=true):tripped&&k===K.FY2026));assert.throws(()=>s.api.resetAll({confirm:true}),/recovery pending/);assert(s.d[J]);s.fail(()=>false);assert(s.api.recover());assert.deepEqual(s.d,before);});
test('production candidate remains off and cannot restore unapproved FY2027 data',()=>{const s=make(),backup=s.api.exportV2();assert.equal(R.active('FY2027'),null);assert.equal(R.officialFY2027Ids().length,0);delete s.d[K.FY2027];const actual=create(s.store,{owns:()=>true,yearAllowed:y=>!!R.active(y),validateProgress:(y,p)=>!!R.active(y)&&M.validateBackupState(p,R.active(y).questions,R.active(y).examPool),validateCharacter:p=>G.validateBackupState(p)});assert.throws(()=>actual.importV2(backup,{confirmReplaceAll:true}));assert(!Object.hasOwn(s.d,K.FY2027));});
// Use the actual grading engine and models, not a fabricated XP/HP record.
function fresh(){const d={},store={getItem:k=>d[k]??null,setItem(k,v){d[k]=v;return true},removeItem(k){delete d[k];return true}};
 const model=new M(Q.questions,store,K.FY2026,Q.examPool),rpg=new G(store,K.character);
 const api=create(store,{owns:()=>true,yearAllowed:y=>y==='FY2026',validateProgress:(y,p)=>M.validateBackupState(p,Q.questions,Q.examPool),validateCharacter:p=>G.validateBackupState(p)});
 return {d,store,model,rpg,api};}
for(const kind of ['wrong','partial'])test('actual '+kind+' answer requires retained character even with zero correct IDs',()=>{
 const s=fresh(),q=Q.questions[kind==='partial'?'L001':'J019'],answer=copy(q.answer);
 if(kind==='wrong'){answer.debit[0].amount+=1;answer.credit[0].amount+=1;}else {const key=Object.keys(answer.cells).find(k=>typeof answer.cells[k]==='number');assert(key);answer.cells[key]+=1;}
 const score=w.GradingEngine.grade(q,answer);assert(!score.correct);if(kind==='partial')assert(score.earned>0&&score.earned<score.possible);
 assert(s.model.recordAttempt(q.id,false,100,'',false,1000,null,'sure'));assert(s.model.record(q.id,false,1000));assert(s.rpg.recordMastery(q,score));s.rpg.applyAnswer(false,'sure');assert(s.rpg.save());
 assert.equal(s.model.state.correctIds.length,0);assert.equal(s.rpg.state.companyHP,95);assert.equal(s.rpg.state.confidenceOutcomes.sureWrong,1);
 const before={...s.d};for(const status of ['absent','reset']){const backup=s.api.exportV2();backup.character={status};assert.throws(()=>s.api.importV2(backup,{confirmReplaceAll:true}),/invalid backup/);assert.deepEqual(s.d,before);}
 const backup=s.api.exportV2();assert(s.api.importV2(backup,{confirmReplaceAll:true}));assert.deepEqual(s.d,before);
 const g=new G(s.store,K.character);assert.equal(g.state.companyHP,95);assert.equal(g.state.confidenceOutcomes.sureWrong,1);assert.deepEqual(copy(g.state.mastery),copy(s.rpg.state.mastery));
});
test('actual draft-only progress is permitted without a character',()=>{const s=fresh(),q=Q.questions.J019;assert(s.model.setDraft(q.id,copy(q.answer)));const b=s.api.exportV2();assert.equal(b.character.status,'absent');assert(s.api.importV2(b,{confirmReplaceAll:true}));assert.deepEqual(copy(s.api.exportV2()),copy(b));});
test('actual archived wrong-only history requires character after content migration',()=>{
 const cp=require('node:child_process'),oldRoot={},oldContext={window:oldRoot,console};
 for(const p of ['data/questions.js','js/model.js'])vm.runInNewContext(cp.execFileSync('git',['show','37086c6ae6511a249218533375bf6f19dac231d1:'+p],{encoding:'utf8',maxBuffer:12*1024*1024}),oldContext);
 const s=fresh(),id='L044',old=new oldRoot.ProgressModel(oldRoot.QuestionData,s.store,K.FY2026,oldRoot.ExamPoolDefinition);
 assert(old.recordAttempt(id,false,100,'',false,1000,null,'sure'));assert(old.record(id,false,1000));assert(old.save());
 const migrated=new M(Q.questions,s.store,K.FY2026,Q.examPool);assert(!migrated.storageWriteBlocked);assert.equal(migrated.state.correctIds.length,0);assert.equal(migrated.state.answeredIds.length,0);assert.equal(migrated.state.attempts.length,0);assert(migrated.state.contentMigrationArchive.questions[id].flags.incorrect);
 assert(s.rpg.recordMastery(Q.questions[id],{correct:false,ratio:0,earned:0,possible:1}));s.rpg.applyAnswer(false,'sure');assert(s.rpg.save());
 const backup=s.api.exportV2(),before={...s.d};backup.character={status:'absent'};assert.throws(()=>s.api.importV2(backup,{confirmReplaceAll:true}),/invalid backup/);assert.deepEqual(s.d,before);
});
console.log('ANNUAL_REAL_MODEL '+passed+'/'+passed+' PASS');
