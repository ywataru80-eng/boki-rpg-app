'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),cp=require('node:child_process');
const Model=require('../js/model');
const BASE='37086c6ae6511a249218533375bf6f19dac231d1';
const evaluate=(source,key)=>{const s={window:{},console};vm.runInNewContext(source,s);return s.window[key];};
const old=file=>cp.execFileSync('git',['show',`${BASE}:${file}`],{encoding:'utf8',maxBuffer:8*1024*1024});
const OldModel=evaluate(old('js/model.js'),'ProgressModel');
const oldQuestions=evaluate(old('data/questions.js'),'QuestionData'),questions=evaluate(fs.readFileSync('data/questions.js','utf8'),'QuestionData');
const clone=x=>JSON.parse(JSON.stringify(x));
const storage=(value=null)=>({value,writes:0,getItem(){return this.value;},setItem(_k,v){this.value=v;this.writes++;return true;}});
const now=Date.UTC(2026,9,15,9);
function legacy(ids=['L044','L045'],correct=true){const st=storage(),m=new OldModel(oldQuestions,st);for(const id of [...ids,'J001']){m.recordAttempt(id,correct,1000,'',false,now,null,'sure',{support:'none'});m.record(id,correct,now);m.setDraft(id,clone(oldQuestions[id].answer));}return clone(m.state);}
let passed=0,failed=0;const test=(name,fn)=>{try{fn();passed++;console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name+' '+e.stack);}};
for(const[id,opening,end,increase,decrease]of [['L044','4月1日','4月5日',50000,18000],['L045','5月1日','5月8日',300000,85000]]){
 test(id+' explicit opening, interval and complete transactions',()=>{const q=questions[id];assert(q.question.includes(opening)&&q.question.includes(end));assert.match(q.question,/記帳開始時点.*0円/);assert.match(q.question,/2件がすべて/);assert.match(q.question,/過去/);assert(q.explanation.includes(`0 ＋ ${increase.toLocaleString('en-US')} − ${decrease.toLocaleString('en-US')} = ${(increase-decrease).toLocaleString('en-US')}`));assert.deepEqual(clone(q.answer),clone(oldQuestions[id].answer));});
 test(id+' actual old marker10 first answer is archived, not new mastery',()=>{const before=legacy([id]),st=storage(JSON.stringify(before)),m=new Model(questions,st);assert.equal(m.storageWriteBlocked,undefined);assert.equal(m.state.contentRevision,5);assert.equal(m.state.learningEvidenceIntegrity.schemaVersion,11);assert.equal(m.learningMastery(id).score,0);assert.equal(m.state.learningEffectiveness.questions[id],undefined);const a=m.state.contentMigrationArchive.questions[id];assert.deepEqual(a.learningEvidence,before.learningEffectiveness.questions[id]);assert.deepEqual(a.questionStats,before.questionStats[id]);assert.deepEqual(a.draft,before.drafts[id]);assert.deepEqual(a.reviewSchedule,before.reviewSchedule[id]);assert(m.state.contentRecheckIds.includes(id));assert.deepEqual(m.state.questionStats.J001,before.questionStats.J001);assert.deepEqual(m.state.learningContinuityState,before.learningContinuityState);assert.deepEqual(m.state.learningDayHistory,before.learningDayHistory);assert(Model.validateBackupState(m.state,questions));assert.deepEqual(clone(new Model(questions,st).state),clone(m.state));assert.equal(st.writes,1);});
}

const reload=before=>{const store=storage(JSON.stringify(before));return {store,model:new Model(questions,store)};};
const legacyModel=()=>new OldModel(oldQuestions,storage());
const identities=Model.currentContentVersions(questions);
test('new installation and untouched legacy save: no invented prior answers',()=>{
 const empty=storage(),fresh=new Model(questions,empty);assert.equal(empty.writes,0);assert.equal(fresh.state.contentRevision,5);
 const before=clone(legacyModel().state),{model}=reload(before);assert.deepEqual(model.state.contentRecheckIds,[]);assert.deepEqual(model.state.contentMigrationArchive.questions,{});assert.equal(Object.keys(model.state.questionContentVersions).length,4);
});
for(const id of ['L044','L045']){
 test(id+' wrong-only history and saved unfinished input survive in archive',()=>{
  const before=legacy([id],false),{model}=reload(before),a=model.state.contentMigrationArchive.questions[id];
  assert.equal(a.flags.incorrect,true);assert.equal(a.mistakeCount,1);assert.equal(a.learningEvidence.firstAttempt.correct,false);
  assert.equal(model.state.drafts[id],undefined);assert.equal(model.state.reviewSchedule[id],undefined);assert.equal(model.statsForQuestion(id).incorrectCount,0);
  const m=legacyModel();m.setDraft(id,{cells:{value1:123}});const migrated=reload(clone(m.state)).model;
  assert.deepEqual(migrated.state.contentMigrationArchive.questions[id].draft,{cells:{value1:123}});assert(migrated.state.contentRecheckIds.includes(id));
 });
 test(id+' old lifetime evidence after bounded log eviction is not promoted by retagging',()=>{
  const m=legacyModel();m.recordAttempt(id,true,1000,'',false,now);m.record(id,true,now);
  for(let n=0;n<201;n++)m.recordAttempt('J001',true,1000,'',false,now+1+n);
  const before=clone(m.state);assert(!before.attempts.some(a=>a.id===id));
  const migrated=reload(before).model;assert.equal(migrated.learningMastery(id).score,0);assert.equal(migrated.state.contentMigrationArchive.questions[id].learningEvidence.observedAttempts,1);
  before.contentRevision=5;before.questionContentVersions=identities;const st=storage(JSON.stringify(before)),blocked=new Model(questions,st);assert.equal(blocked.storageWriteBlocked,true);assert.equal(st.writes,0);
 });
 test(id+' new answer uses new identity, preserves archive and does not invent original first exposure',()=>{
  const {model,store}=reload(legacy([id]));const archived=clone(model.state.contentMigrationArchive);
  assert(model.recordAttempt(id,true,1000,'',false,now+5000,null,'sure',{support:'none'}));model.record(id,true,now+5000);
  assert.equal(model.state.attempts.at(-1).contentIdentity,identities[id]);assert.equal(model.statsForQuestion(id).correctCount,1);assert(!model.state.contentRecheckIds.includes(id));
  assert.equal(model.learningEffectivenessForQuestion(id).initialStatus,'unknown');assert.deepEqual(model.state.contentMigrationArchive,archived);
  assert.deepEqual(new Model(questions,store).state,model.state);assert.deepEqual(Model.prepareBackupState(clone(model.state),questions),clone(model.state));
 });
}
test('both old IDs: all target history retained, unrelated learning and RPG rewards unchanged',()=>{
 const before=legacy(),{model}=reload(before);assert.deepEqual(model.state.contentRecheckIds.slice().sort(),['L044','L045']);
 for(const id of ['L044','L045'])assert.deepEqual(model.state.contentMigrationArchive.questions[id].attempts,before.attempts.filter(a=>a.id===id));
 const RPG=require('../js/rpg'),st=storage(),rpg=new RPG(st);rpg.reward(questions.L044,{ratio:1,earned:3,possible:3},1);const bytes=st.value,xp=rpg.state.xp;
 reload(before);assert.equal(st.value,bytes);assert.equal(rpg.reward(questions.L044,{ratio:1,earned:3,possible:3},1),false);assert.equal(rpg.state.xp,xp);
});
test('existing J051/L031 migration archives and legacy provenance remain byte-identical',()=>{
 const helpers=require('./helpers/issue207-fixtures');const st=storage(JSON.stringify(helpers.fixture('old','J051'))),oldM=new OldModel(oldQuestions,st);
 oldM.recordAttempt('L044',true,1000,'',false,now);oldM.record('L044',true,now);
 const before=clone(oldM.state),{model}=reload(before);assert(!model.storageWriteBlocked);
 assert.deepEqual(model.state.contentMigrationArchive.questions.J051,before.contentMigrationArchive.questions.J051);
 assert.equal(model.state.legacyProvenance.original,before.legacyProvenance.original);assert.deepEqual(model.state.questionStats.L031,before.questionStats.L031);
});
for(const [current,oldId]of [['L044','L045'],['L045','L044']])test(current+' current + '+oldId+' legacy mixed identities migrate only old ID',()=>{
 const m=new Model(questions,storage());m.recordAttempt(current,true,1000,'',false,now);m.record(current,true,now);m.setDraft(current,clone(questions[current].answer));
 const oldState=legacy([oldId]);for(const field of ['questionStats','drafts','reviewSchedule','mistakeCounts'])if(oldState[field][oldId]!==undefined)m.state[field][oldId]=oldState[field][oldId];
 for(const field of ['answeredIds','correctIds','incorrectIds'])if(oldState[field].includes(oldId))m.state[field].push(oldId);
 m.state.attempts.push(...oldState.attempts.filter(a=>a.id===oldId));m.state.learningEffectiveness.questions[oldId]=oldState.learningEffectiveness.questions[oldId];
 m.state.questionContentVersions[oldId]=oldId==='L044'?'L044:cash-book-opening-unspecified-v0':'L045:checking-book-opening-unspecified-v0';
 // Use the normal current recording API to seal the explicit mixed map;
 // v11 binds both identities and the retained log.
 m.recordAttempt('J001',true,1000,'',false,now+1);m.refreshEvidenceIntegrity();
 assert(Model.validateBackupState(m.state,questions));const before=clone(m.state),{model}=reload(before);assert(!model.storageWriteBlocked);
 assert.deepEqual(model.state.questionStats[current],before.questionStats[current]);assert.deepEqual(model.state.learningEffectiveness.questions[current],before.learningEffectiveness.questions[current]);assert.deepEqual(model.state.drafts[current],before.drafts[current]);assert.equal(model.statsForQuestion(oldId).correctCount,0);
});
test('old exam session and affected historical score are retained but not current graduation evidence',()=>{
 const s={window:{}};vm.runInNewContext(old('data/questions.js'),s);const pool=s.window.ExamPoolDefinition;
 const m=new OldModel(oldQuestions,storage(),'old',pool),ids=['L044','L045',...pool.filter(id=>!['L044','L045'].includes(id)).slice(0,13)];
 m.state.mode='exam';m.state.examSession={ids,startedAt:now,endAt:now+10000,status:'RUNNING',scores:{},evidenceVersion:1};
 m.state.examHistory=[{setSignature:ids.slice().sort().join('|'),points:90,finishedAt:now-1}];m.refreshEvidenceIntegrity();
 const before=clone(m.state),store=storage(JSON.stringify(before)),model=new Model(questions,store,'old',pool);assert(!model.storageWriteBlocked);
 assert.equal(model.state.examSession,null);assert.equal(model.state.mode,'story');assert.deepEqual(model.state.examHistory,before.examHistory);assert.equal(model.verifiedExamHistory().length,0);
 assert.deepEqual(model.state.contentMigrationArchive.questions.L044.examSession,before.examSession);
 assert(model.state.contentRecheckIds.includes('L045'));
 model.state.examHistory.push({...before.examHistory[0],finishedAt:now+20000});assert.equal(model.verifiedExamHistory().length,1);
});
test('old and migrated backups normalize in memory and repeated import is idempotent',()=>{
 const before=legacy(),bytes=JSON.stringify(before),prepared=Model.prepareBackupState(before,questions);assert(prepared);assert.equal(JSON.stringify(before),bytes);assert.deepEqual(Model.prepareBackupState(prepared,questions),prepared);assert.deepEqual(Model.prepareBackupState(before,questions),prepared);
});
test('save failure preserves original bytes and can retry without duplicate migration',()=>{
 const bytes=JSON.stringify(legacy()),st=storage(bytes),set=st.setItem;st.setItem=()=>false;const m=new Model(questions,st);assert.equal(st.value,bytes);assert(Model.validateBackupState(m.state,questions));st.setItem=set;assert(m.save());assert.deepEqual(new Model(questions,st).state,m.state);
});
test('malformed, unknown identity, future revision and altered seal never write',()=>{
 const valid=clone(reload(legacy()).model.state);
 for(const change of [v=>v.contentRevision=6,v=>v.questionContentVersions.L044='future',v=>delete v.questionContentVersions.L044,v=>v.questionStats.J001.correctCount++,v=>v.contentMigrationArchive.questions.L044.learningEvidence.correctCount++,v=>v.contentMigrationArchive.questions.J051={toIdentity:'bad'},v=>v.learningEvidenceIntegrity.schemaVersion=12]){
  const value=clone(valid);change(value);assert.equal(Model.validateBackupState(value,questions),false);assert.equal(Model.prepareBackupState(value,questions),null);const bytes=JSON.stringify(value),st=storage(bytes),m=new Model(questions,st);assert.equal(m.save(),false);assert.equal(st.writes,0);assert.equal(st.value,bytes);
 }
 for(const bytes of ['{broken','[]','null']){const st=storage(bytes),m=new Model(questions,st);assert.equal(m.save(),false);assert.equal(st.value,bytes);}
});
test('other 298 complete runtime records, all answers, canonical IDs stay unchanged',()=>{
 assert.deepEqual(Object.keys(questions),Object.keys(oldQuestions));assert.equal(Object.keys(questions).length,300);
 for(const id of Object.keys(questions)){
  assert.deepEqual(clone(questions[id].answer),clone(oldQuestions[id].answer));
  if(id==='J148'){
    const current=clone(questions[id]),historical=clone(oldQuestions[id]);
    assert.notEqual(current.story,historical.story,'J148 story must have an explicit successor');
    delete current.story;delete historical.story;
    assert.deepEqual(current,historical,'J148 non-story fields must stay unchanged');
  }else if(!['L044','L045'].includes(id)){
    assert.deepEqual(clone(questions[id]),clone(oldQuestions[id]),id);
  }
}
});
test('exam-only or last-review-only old exposure protects both IDs',()=>{
 const s={window:{}};vm.runInNewContext(old('data/questions.js'),s);const pool=s.window.ExamPoolDefinition;
 for(const kind of ['session','review']){
  const m=new OldModel(oldQuestions,storage(),'old',pool),ids=['L044','L045',...pool.filter(id=>!['L044','L045'].includes(id)).slice(0,13)];
  if(kind==='session')m.state.examSession={ids,startedAt:now,endAt:now+10000,status:'RUNNING',scores:{},evidenceVersion:1};
  else m.state.lastExamReview={items:ids.map(id=>({id,correct:true})),finishedAt:now};
  m.refreshEvidenceIntegrity();const model=new Model(questions,storage(JSON.stringify(m.state)),'new',pool);
  assert(!model.storageWriteBlocked);for(const id of ['L044','L045']){assert(model.state.contentRecheckIds.includes(id));assert.equal(model.learningEffectivenessForQuestion(id).initialStatus,'unknown');assert(model.state.contentMigrationArchive.questions[id][kind==='session'?'examSession':'lastExamReview']);}
  assert.equal(model.state.examSession,null);assert.equal(model.state.lastExamReview,null);
 }
});
test('old completion cannot retain two-set proof from duplicate unaffected exam passes',()=>{
 const pool=['L044','L045',...Array.from({length:13},(_,i)=>'J'+String(i+128).padStart(3,'0'))],m=new OldModel(oldQuestions,storage(),'old',pool);
 for(const type of ['ledger','worksheet','financial_statement','comprehensive']){
  const list=Object.values(oldQuestions).filter(q=>q.type===type&&!['L044','L045'].includes(q.id)),structure=q=>q.category+'::'+(q.variantGroup||q.format||'base');
  for(const q of [list[0],list[1],list.find(q=>structure(q)!==structure(list[0])&&q.id!==list[1].id)]){m.recordAttempt(q.id,true,1000,'',false,now);m.record(q.id,true,now);}
 }
 const affected=pool.join('|'),unaffected=['L033',...pool.filter(id=>!['L044','L045'].includes(id)),'L034'].join('|');
 m.state.examHistory=[{finishedAt:now,points:100,setSignature:affected},{finishedAt:now+1,points:100,setSignature:unaffected},{finishedAt:now+2,points:100,setSignature:unaffected}];m.refreshEvidenceIntegrity();assert(m.updateCompletion({skillMastery(){return 1;}}));
 const result=new Model(questions,storage(JSON.stringify(m.state)),'new',pool);assert(!result.storageWriteBlocked);assert.equal(result.state.completed,false);assert.equal(result.state.contentMigrationArchive.completed,true);assert.deepEqual(result.state.examHistory,clone(m.state.examHistory));
});
for(const target of ['L044','L045','J001'])test(target+' archived-only old exam is preserved without inventing new first exposure',()=>{
 const V5=evaluate(cp.execFileSync('git',['show','2cf70526f3cdc18560f151d4d32134a49aef79cb:js/model.js'],{encoding:'utf8'}),'ProgressModel');
 const store=storage(),v5=new V5(oldQuestions,store);v5.save();const oldM=new OldModel(oldQuestions,store);
 assert(!oldM.storageWriteBlocked);assert.equal(oldM.state.learningEffectiveness.initialHistory,'complete');
 const ids=[target,...Object.keys(oldQuestions).filter(id=>![target,'L044','L045'].includes(id)).slice(0,14)];
 // Persisted shape issued by the old 'keep original and end' path. The
 // unverified score is retained evidence, never authenticated as a success.
 oldM.state.legacyProvenance.archivedExams.push({reason:'unverifiable-score',archivedAt:now,
  session:{ids,startedAt:now-10000,endAt:now+10000,status:'RUNNING',scores:{[target]:{correct:false,earned:0,possible:target==='J001'?1:3,ratio:0}}}});
 oldM.refreshEvidenceIntegrity();oldM.save();assert(OldModel.validateBackupState(oldM.state,oldQuestions));
 const before=clone(oldM.state),result=new Model(questions,store);assert(!result.storageWriteBlocked);
 assert.deepEqual(result.state.legacyProvenance,before.legacyProvenance,'original archived scores and provenance unchanged');
 const targets=target==='J001'?[]:[target];assert.deepEqual(result.state.contentRecheckIds,targets);
 for(const id of targets){assert(result.state.contentMigrationArchive.questions[id]);assert.equal(result.learningEffectivenessForQuestion(id).initialStatus,'unknown');assert.equal(result.learningMastery(id).score,0);assert.equal(result.statsForQuestion(id).correctCount,0);}
 assert.deepEqual(new Model(questions,store).state,result.state);assert.deepEqual(Model.prepareBackupState(before,questions),clone(result.state));assert.deepEqual(Model.prepareBackupState(clone(result.state),questions),clone(result.state));
});
console.log(`LEDGER_OPENING ${passed} passed / ${failed} failed`);if(failed)process.exitCode=1;
module.exports={BASE,old,OldModel,oldQuestions,questions,clone,storage,now,legacy};
