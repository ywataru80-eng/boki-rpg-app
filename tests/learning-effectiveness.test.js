'use strict';
const assert = require('assert');
const Model = require('../js/model');
const clone = value => JSON.parse(JSON.stringify(value));
const canonicalPool=(()=>{const s={window:{}};require('vm').runInNewContext(require('fs').readFileSync('data/questions.js','utf8'),s);return Array.from(s.window.ExamPoolDefinition);})();
const questions = {
  Q:{id:'Q',type:'journal',category:'仕訳',difficulty:1},
  R:{id:'R',type:'journal',category:'仕訳',difficulty:1,learningRole:'review'},
  T:{id:'T',type:'ledger',category:'帳簿',difficulty:2,table:{inputCells:['a','b']}}
};
const storage = (value = null) => ({value,writes:0,getItem(){return this.value;},setItem(_key,next){this.value=next;this.writes++;return true;}});
const fresh = value => {const store=storage(value);return {model:new Model(questions,store,'test'),store};};
const evidence = (model,id='Q') => {
  assert(model.state.learningEffectiveness,'Durable learning evidence is absent');
  return model.learningEffectivenessForQuestion(id);
};
const answer = (model,id,correct,at,options={}) => {
  const mode=options.mode || model.state.mode;
  model.state.mode=mode;
  return model.recordAttempt(id,correct,1000,correct?'':options.tag || (id==='T'?'a':'journal-entry'),Boolean(options.reviewSourceId&&correct),at,options.stage??null,'unsure',{
    mode,support:options.support || 'none',observationNumber:options.number ?? model.nextLearningObservation?.(id),reviewSourceId:options.reviewSourceId || null
  });
};
const schedule = (model,source='Q',target='R',stage=1,dueAt=2000) => {
  model.state.reviewSchedule[source]={stage,dueAt};model.assignReview(source,target,dueAt-1);model.state.mode='review';
};
let passed=0,failed=0;
function test(name,fn){try{fn();passed++;console.log('PASS '+name);}catch(error){failed++;console.error('FAIL '+name+'\n'+error.stack);}}

test('fresh unanswered is distinct from unknown and wrong',()=>{
  const {model}=fresh();const value=evidence(model);
  assert.strictEqual(value.initialStatus,'unanswered');assert.strictEqual(value.firstAttempt,null);
  assert.strictEqual(value.observedAttempts,0);assert.strictEqual(value.delayedReview.highestConfirmedStage,null);
  assert.strictEqual(model.learningEffectivenessForQuestion('missing'),null);
});
test('first result/time/mode/support survive 200-row eviction and reload',()=>{
  let {model,store}=fresh();assert(answer(model,'Q',false,1000,{mode:'training',support:'hint-1'}));
  for(let i=0;i<250;i++)assert(answer(model,'Q',true,2000+i,{mode:'story'}));
  model=new Model(questions,store,'test');const value=evidence(model);
  assert.strictEqual(model.state.attempts.length,200);assert(!model.state.attempts.some(x=>x.timestamp===1000));
  assert.deepStrictEqual(value.firstAttempt,{correct:false,at:1000,mode:'training',support:'hint-1'});
  assert.strictEqual(value.initialStatus,'observed');assert.strictEqual(value.observedAttempts,251);
  assert.deepStrictEqual([value.correctCount,value.incorrectCount],[250,1]);
  assert.deepStrictEqual(value.modes.training,{attempts:1,successes:0});assert.deepStrictEqual(value.modes.story,{attempts:250,successes:250});
  assert.strictEqual(model.questionAccuracy('Q').attempts,251);
});
test('detailed attempts persist mode/support and observation number',()=>{
  const {model}=fresh();assert(answer(model,'T',true,1000,{mode:'exam',support:'unknown'}));
  const row=model.state.attempts.at(-1);assert.strictEqual(row.mode,'exam');assert.strictEqual(row.support,'unknown');assert.strictEqual(row.observationNumber,1);
});
test('all modes have separate bounded counters',()=>{
  const {model}=fresh();for(const [i,mode] of ['story','training','review','exam','desk'].entries())assert(answer(model,'Q',i%2===0,1000+i,{mode}));
  const value=evidence(model);assert.strictEqual(value.observedAttempts,5);
  for(const [i,mode] of ['story','training','review','exam','desk'].entries())assert.deepStrictEqual(value.modes[mode],{attempts:1,successes:i%2===0?1:0});
  assert.strictEqual(value.delayedReview.attempts,0,'Review mode alone is not delayed retention');
});
test('due review measures source retention and target initial performance separately',()=>{
  const {model}=fresh();schedule(model);assert(answer(model,'R',true,2000,{mode:'review',reviewSourceId:'Q',stage:1}));
  assert.deepStrictEqual(evidence(model,'R').firstAttempt,{correct:true,at:2000,mode:'review',support:'none'});
  const source=evidence(model);assert.strictEqual(source.observedAttempts,0);assert.strictEqual(source.firstAttempt,null);
  assert.deepStrictEqual([source.delayedReview.attempts,source.delayedReview.successes,source.delayedReview.lastAt,source.delayedReview.highestConfirmedStage],[1,1,2000,2]);
  assert.deepStrictEqual(source.delayedReview.stages[1],{attempts:1,successes:1});
  assert(model.completeReview('Q',true,2000,'R'));assert.strictEqual(evidence(model).delayedReview.attempts,1);
  assert.strictEqual(model.completeReview('Q',true,2000,'R'),false);
});
test('failed due review counts once without a confirmed success stage',()=>{
  const {model}=fresh();schedule(model,'Q','R',2);assert(answer(model,'R',false,2000,{mode:'review',reviewSourceId:'Q',stage:2}));
  const value=evidence(model).delayedReview;assert.strictEqual(value.attempts,1);assert.strictEqual(value.successes,0);assert.strictEqual(value.highestConfirmedStage,null);
  assert(model.completeReview('Q',false,2000,'R'));assert.strictEqual(model.state.reviewSchedule.Q.stage,0);
});
for(const kind of ['early','wrong-target','stale-schedule','wrong-mode','missing-assignment'])test(kind+' is not delayed-retention evidence',()=>{
  const {model}=fresh();schedule(model);
  if(kind==='stale-schedule')model.state.reviewSchedule.Q.stage=2;
  if(kind==='missing-assignment')delete model.state.reviewAssignments.Q;
  assert(answer(model,kind==='wrong-target'?'T':'R',true,kind==='early'?1999:2000,{mode:kind==='wrong-mode'?'training':'review',reviewSourceId:'Q',stage:1}));
  assert.strictEqual(evidence(model).delayedReview.attempts,0);
});
test('delayed failure/success totals and stages persist beyond 200 attempts',()=>{
  let {model,store}=fresh();
  for(let i=0;i<220;i++){schedule(model,'Q','R',i%4,1000+i);assert(answer(model,'R',i%3!==0,1000+i,{mode:'review',reviewSourceId:'Q',stage:i%4}));assert(model.completeReview('Q',i%3!==0,1000+i,'R'));}
  model=new Model(questions,store,'test');const value=evidence(model).delayedReview;
  assert.strictEqual(value.attempts,220);assert.strictEqual(value.successes,146);assert.strictEqual(value.highestConfirmedStage,4);
  assert.strictEqual(value.stages.reduce((n,x)=>n+x.attempts,0),220);assert.strictEqual(value.stages.reduce((n,x)=>n+x.successes,0),146);
});
test('wrong patterns and unassisted recovery are durable and not counted twice',()=>{
  let {model,store}=fresh();answer(model,'Q',false,1000);answer(model,'Q',false,1001);answer(model,'Q',true,1002);answer(model,'Q',true,1003);
  for(let i=0;i<205;i++)answer(model,'R',true,2000+i);
  model=new Model(questions,store,'test');const pattern=evidence(model).misconceptionStats['journal-entry'];
  assert.strictEqual(pattern.occurrences,2);assert.strictEqual(pattern.recoveredCount,1);assert.strictEqual(pattern.pending,false);assert.strictEqual(pattern.lastOccurredAt,1001);assert.strictEqual(pattern.lastRecoveredAt,1002);
});
test('assisted correction is separate from unassisted recovery and ordinary scores',()=>{
  const {model}=fresh();answer(model,'Q',false,1000);const stats=clone(model.state.questionStats),continuity=clone(model.state.learningContinuityState),rows=clone(model.state.attempts);
  assert(model.recordAssistedRecovery('Q',1,1100));assert.strictEqual(model.recordAssistedRecovery('Q',1,1101),false);
  let pattern=evidence(model).misconceptionStats['journal-entry'];assert.strictEqual(pattern.assistedRecoveredCount,1);assert.strictEqual(pattern.recoveredCount,0);assert.strictEqual(pattern.pending,true);
  assert.deepStrictEqual(model.state.questionStats,stats);assert.deepStrictEqual(model.state.attempts,rows);assert.deepStrictEqual(model.state.learningContinuityState,continuity);
  answer(model,'Q',true,1200);pattern=evidence(model).misconceptionStats['journal-entry'];assert.strictEqual(pattern.recoveredCount,1);assert.strictEqual(pattern.assistedRecoveredCount,1);assert.strictEqual(pattern.pending,false);
});
test('hinted correct and unknown support do not manufacture unassisted recovery',()=>{
  const {model}=fresh();answer(model,'Q',false,1000);answer(model,'Q',true,1100,{support:'hint-2'});answer(model,'Q',true,1200,{support:'unknown'});
  const pattern=evidence(model).misconceptionStats['journal-entry'];assert.strictEqual(pattern.assistedRecoveredCount,1);assert.strictEqual(pattern.recoveredCount,0);assert.strictEqual(pattern.pending,true);
});
test('old coaching receipt cannot resolve a later wrong observation',()=>{
  const {model}=fresh();answer(model,'Q',false,1000);answer(model,'Q',false,1100);
  assert.strictEqual(model.recordAssistedRecovery('Q',1,1200),false);assert.strictEqual(evidence(model).misconceptionStats['journal-entry'].assistedRecoveredCount,0);
});
test('error tags are restricted to authored cells or generic classes',()=>{
  const {model}=fresh();answer(model,'T',false,1000,{tag:'a'});answer(model,'T',false,1001,{tag:'__proto__'});answer(model,'T',false,1002,{tag:'invented-diagnosis'});
  assert.deepStrictEqual(Object.keys(evidence(model,'T').misconceptionStats).sort(),['cell:a','table-cell']);
  assert.strictEqual(evidence(model,'T').misconceptionStats['table-cell'].occurrences,2);
});
test('replay is rejected after reload and after its detail row is evicted',()=>{
  let {model,store}=fresh();assert(answer(model,'Q',false,1000,{number:1}));for(let i=0;i<205;i++)answer(model,'R',true,2000+i);
  model=new Model(questions,store,'test');const before=JSON.stringify(model.state);
  assert.strictEqual(answer(model,'Q',false,1000,{number:1,mode:model.state.mode}),false);assert.strictEqual(JSON.stringify(model.state),before);
  assert(answer(model,'Q',true,3000,{number:2}));const newer=JSON.stringify(model.state);assert.strictEqual(answer(model,'Q',false,1000,{number:1}),false);assert.strictEqual(JSON.stringify(model.state),newer);
});
test('failed attempt save rolls back counters and allows one successful retry',()=>{
  const {model,store}=fresh();model.save();const bytes=store.value,state=JSON.stringify(model.state),set=store.setItem;
  store.setItem=()=>false;assert.strictEqual(answer(model,'Q',false,1000,{number:1}),false);assert.strictEqual(store.value,bytes);assert.strictEqual(JSON.stringify(model.state),state);
  store.setItem=set;assert(answer(model,'Q',false,1000,{number:1}));assert.strictEqual(evidence(model).observedAttempts,1);assert.strictEqual(model.questionAccuracy('Q').attempts,1);
});
test('failed assisted save is retryable without duplicate recovery',()=>{
  const {model,store}=fresh();answer(model,'Q',false,1000);const bytes=store.value,state=JSON.stringify(model.state),set=store.setItem;
  store.setItem=()=>{throw Error('quota');};assert.strictEqual(model.recordAssistedRecovery('Q',1,1100),false);assert.strictEqual(store.value,bytes);assert.strictEqual(JSON.stringify(model.state),state);
  store.setItem=set;assert(model.recordAssistedRecovery('Q',1,1100));assert.strictEqual(evidence(model).misconceptionStats['journal-entry'].assistedRecoveredCount,1);
});
test('legacy migration preserves old aggregates without inventing a first observation',()=>{
  const {model:old}=fresh();answer(old,'Q',false,1000);for(let i=0;i<250;i++)answer(old,'Q',true,2000+i);
  const legacy=clone(old.state);delete legacy.learningEffectiveness;delete legacy.learningEvidenceIntegrity;legacy.learningSchemaVersion=2;legacy.contentRevision=4;for(const row of legacy.attempts){delete row.mode;delete row.support;delete row.observationNumber;}
  const oldStats=clone(legacy.questionStats);let {model,store}=fresh(JSON.stringify(legacy));
  assert.strictEqual(model.state.learningEffectiveness.initialHistory,'unknown');assert.strictEqual(evidence(model).initialStatus,'unknown');assert.strictEqual(evidence(model).firstAttempt,null);assert.strictEqual(evidence(model).observedAttempts,0);assert.deepStrictEqual(model.state.questionStats,oldStats);
  assert(answer(model,'Q',true,5000));assert.strictEqual(evidence(model).firstAttempt,null);assert.strictEqual(evidence(model).observedAttempts,1);
  assert.strictEqual(evidence(model,'T').initialStatus,'unknown','Missing legacy evidence does not prove never attempted');
  const before=JSON.stringify(model.state);model=new Model(questions,store,'test');assert.strictEqual(JSON.stringify(model.state),before);
});
test('legacy migration save failure preserves old bytes and can retry safely',()=>{
  const old=clone(fresh().model.state);delete old.learningEffectiveness;delete old.learningEvidenceIntegrity;old.learningSchemaVersion=2;old.contentRevision=4;const bytes=JSON.stringify(old),store=storage(bytes),set=store.setItem;store.setItem=()=>false;
  const model=new Model(questions,store,'test');assert.strictEqual(store.value,bytes);assert.strictEqual(model.state.learningEffectiveness.initialHistory,'unknown');store.setItem=set;assert(model.save());assert.strictEqual(JSON.parse(store.value).learningEffectiveness.initialHistory,'unknown');
});
test('backup preparation round-trips current and old states without mutation',()=>{
  const {model}=fresh();answer(model,'Q',false,1000);model.recordAssistedRecovery('Q',1,1100);schedule(model);answer(model,'R',true,2000,{mode:'review',reviewSourceId:'Q'});
  const before=JSON.stringify(model.state);assert(Model.validateBackupState(model.state,questions));const result=Model.prepareBackupState(model.state,questions);assert.deepStrictEqual(result,model.state);assert.strictEqual(JSON.stringify(model.state),before);
  const legacy=clone(model.state);delete legacy.learningEffectiveness;delete legacy.learningEvidenceIntegrity;legacy.learningSchemaVersion=2;legacy.contentRevision=4;
  for(const row of legacy.attempts){delete row.mode;delete row.support;delete row.observationNumber;}
  assert(Model.validateBackupState(legacy,questions));const migrated=Model.prepareBackupState(legacy,questions);assert.strictEqual(migrated.learningEffectiveness.initialHistory,'unknown');assert.deepStrictEqual(Model.prepareBackupState(migrated,questions),migrated);
});
test('present corrupt/future evidence rejects import and blocks destructive load/save',()=>{
  const {model}=fresh();answer(model,'Q',false,1000);const valid=clone(model.state);
  for(const mutate of [v=>v.learningEffectiveness.schemaVersion=2,v=>v.learningEffectiveness.questions.Q.observedAttempts=-1,v=>v.learningEffectiveness.questions.Q.modes.story.successes=99,v=>v.learningEffectiveness.questions.Q.firstAttempt=null,v=>v.learningEffectiveness.questions.Q.delayedReview.successes=1,v=>v.learningEffectiveness.questions.Q.misconceptionStats['journal-entry'].recoveredCount=2,v=>v.learningEffectiveness.questions.missing=clone(v.learningEffectiveness.questions.Q),v=>v.learningEffectiveness=null]){
    const bad=clone(valid);mutate(bad);assert.strictEqual(Model.validateBackupState(bad,questions),false);assert.strictEqual(Model.prepareBackupState(bad,questions),null);
    const bytes=JSON.stringify(bad),loaded=fresh(bytes);assert.strictEqual(loaded.store.value,bytes);assert.strictEqual(loaded.model.save(),false);assert.strictEqual(loaded.store.value,bytes);
  }
});
test('corrupt or unreadable stores never become fabricated new-history coverage',()=>{
  const {model,store}=fresh('{broken');assert.strictEqual(model.save(),false);assert.strictEqual(store.value,'{broken');
  const broken={getItem(){throw Error('read denied');},setItem(){throw Error('must not write');}};const denied=new Model(questions,broken,'test');assert.strictEqual(denied.save(),false);assert.strictEqual(answer(denied,'Q',true,1000),false);
  const wrapped={getItem(){return null;},readItem(){return {ok:false,value:null};},setItem(){throw Error('must not write');}};assert.strictEqual(new Model(questions,wrapped,'test').save(),false);
});
test('invalid input, support, mode, stale sequence and overflow do not mutate evidence',()=>{
  const {model}=fresh();answer(model,'Q',true,1000);const before=JSON.stringify(model.state);
  for(const [id,at,context] of [['missing',1100,{}],['Q',-1,{}],['Q',Infinity,{}],['Q',1100,{support:'invented'}],['Q',1100,{mode:'not-a-mode'}],['Q',1100,{observationNumber:999}]])assert.strictEqual(model.recordAttempt(id,true,1,'',false,at,null,'unsure',{mode:'story',support:'none',...context}),false);
  assert.strictEqual(JSON.stringify(model.state),before);
  model.state.questionStats.Q.correctCount=Number.MAX_SAFE_INTEGER;const maximum=JSON.stringify(model.state);assert.strictEqual(answer(model,'Q',true,1100),false);assert.strictEqual(JSON.stringify(model.state),maximum);
});
test('record/finalization and reads cannot add observations or mutate returned data',()=>{
  const {model}=fresh();answer(model,'Q',true,1000);const before=clone(model.state.learningEffectiveness);model.record('Q',true,1000);model.save();assert.deepStrictEqual(model.state.learningEffectiveness,before);
  const value=evidence(model);value.observedAttempts=999;value.modes.story.attempts=999;assert.deepStrictEqual(model.state.learningEffectiveness,before);
});
test('contradictory first-result and error-recovery aggregates reject a backup',()=>{
  const {model}=fresh();answer(model,'Q',false,1000);const original=clone(model.state);
  for(const mutate of [
    v=>v.learningEffectiveness.questions.Q.firstAttempt.correct=true,
    v=>v.learningEffectiveness.questions.Q.firstAttempt.mode='exam',
    v=>{const e=v.learningEffectiveness.questions.Q.misconceptionStats['journal-entry'];e.recoveredCount=1;e.lastRecoveredAt=1001;e.pending=false;}
  ]){const value=clone(original);mutate(value);assert.strictEqual(Model.validateBackupState(value,questions),false);}
});
test('missing or reset complete-history entries cannot fabricate a new first answer',()=>{
  const {model}=fresh();answer(model,'Q',false,1000);model.record('Q',false,1000);answer(model,'R',true,1100);
  for(let i=0;i<205;i++)answer(model,'R',true,1200+i);
  const original=clone(model.state);
  for(const mutate of [
    v=>delete v.learningEffectiveness.questions.Q,
    v=>v.learningEffectiveness.questions={},
    v=>delete v.questionStats.Q,
    v=>{v.questionStats.Q.correctCount=1;},
    v=>{delete v.learningEffectiveness.questions.Q;delete v.questionStats.Q;}
  ]){
    const bad=clone(original);mutate(bad);assert.strictEqual(Model.validateBackupState(bad,questions),false);assert.strictEqual(Model.prepareBackupState(bad,questions),null);
    const bytes=JSON.stringify(bad),loaded=fresh(bytes);assert.strictEqual(loaded.model.save(),false);assert.strictEqual(loaded.store.value,bytes);
    assert.strictEqual(answer(loaded.model,'Q',true,2000),false);
  }
});
test('legacy observed evidence cannot lose its receipt while retaining a tagged detail',()=>{
  const legacy=clone(fresh().model.state);delete legacy.learningEffectiveness;delete legacy.learningEvidenceIntegrity;legacy.learningSchemaVersion=2;legacy.contentRevision=4;const {model}=fresh(JSON.stringify(legacy));answer(model,'Q',false,1000);
  const bad=clone(model.state);delete bad.learningEffectiveness.questions.Q;assert.strictEqual(Model.validateBackupState(bad,questions),false);
});
test('a missing evidence root with new observation receipts is corruption, not a legacy save',()=>{
  const {model}=fresh();answer(model,'Q',false,1000);const bad=clone(model.state);delete bad.learningEffectiveness;
  assert.strictEqual(Model.validateBackupState(bad,questions),false);assert.strictEqual(Model.prepareBackupState(bad,questions),null);
  const loaded=fresh(JSON.stringify(bad));assert.strictEqual(loaded.model.save(),false);
});
test('source finalization alone survives reload without becoming a graded first answer',()=>{
  let {model,store}=fresh();schedule(model,'Q','R',0,1000);assert(answer(model,'R',true,1000,{mode:'review',reviewSourceId:'Q',stage:0}));assert(model.completeReview('Q',true,1000,'R'));model=new Model(questions,store,'test');
  assert.strictEqual(model.state.answeredIds[0],'Q');assert(Model.validateBackupState(model.state,questions));
  assert.strictEqual(evidence(model).observedAttempts,0);assert.strictEqual(evidence(model).firstAttempt,null);
});
test('modern evidence cannot invoke legacy aggregation or continuity reconstruction',()=>{
  const {model}=fresh();for(let i=0;i<250;i++)answer(model,'Q',true,1000+i);const original=clone(model.state);
  for(const mutate of [v=>delete v.learningSchemaVersion,v=>v.learningSchemaVersion=1,v=>v.learningSchemaVersion=2,v=>v.learningSchemaVersion=0,
    v=>delete v.learningContinuityState,v=>v.learningContinuityState={activeDayKeys:[],today:{}},v=>delete v.lastLearningAt]){
    const bad=clone(original);mutate(bad);assert.strictEqual(Model.validateBackupState(bad,questions),false);assert.strictEqual(Model.prepareBackupState(bad,questions),null);
    const bytes=JSON.stringify(bad),loaded=fresh(bytes);assert.strictEqual(loaded.model.save(),false);assert.strictEqual(loaded.store.value,bytes);
  }
});
test('complete retained receipts cannot disagree with durable first evidence or disappear',()=>{
  const {model}=fresh();answer(model,'Q',false,1000);answer(model,'Q',true,1001);answer(model,'Q',true,1002);const original=clone(model.state);
  for(const mutate of [v=>v.attempts[0].correct=true,v=>v.attempts[0].mode='exam',v=>v.attempts[0].support='hint-2',
    v=>delete v.attempts[0].observationNumber,v=>v.attempts[1].support='hint-1',v=>v.attempts[1].timestamp=1000,
    v=>v.attempts[1].observationNumber=1]){
    const bad=clone(original);mutate(bad);assert.strictEqual(Model.validateBackupState(bad,questions),false);assert.strictEqual(Model.prepareBackupState(bad,questions),null);
    const bytes=JSON.stringify(bad),loaded=fresh(bytes);assert.strictEqual(loaded.model.save(),false);assert.strictEqual(loaded.store.value,bytes);
  }
});
test('empty evidence entries cannot authorize completion or practical competence',()=>{
  const {model}=fresh();model.record('T',true,1000);const forged=clone(model.state);
  assert.strictEqual(Model.validateBackupState(forged,questions),false);assert.strictEqual(Model.prepareBackupState(forged,questions),null);
});
test('a backward wall clock preserves ordered observations and existing maximum timestamps',()=>{
  let {model,store}=fresh();assert(answer(model,'Q',false,1000));assert(answer(model,'Q',true,900));assert(answer(model,'Q',true,950));
  model=new Model(questions,store,'test');assert.strictEqual(evidence(model).observedAttempts,3);assert.strictEqual(evidence(model).firstAttempt.at,1000);
  assert.strictEqual(model.state.questionStats.Q.lastAnsweredAt,1000);assert(Model.validateBackupState(model.state,questions));
});
test('a review receipt cannot authorize two same-category sources, including after eviction',()=>{
  const catalog={...questions,S:{...questions.Q,id:'S'}},store=storage(),model=new Model(catalog,store,'test',Object.keys(catalog));
  schedule(model);assert(answer(model,'R',true,2000,{mode:'review',reviewSourceId:'Q',stage:1}));assert(model.completeReview('Q',true,2000,'R'));
  for(const evict of [false,true]){
    if(evict)for(let i=0;i<201;i++)assert(answer(model,'T',true,3000+i,{mode:'training'}));
    for(const changeSource of [false,true]){
      const bad=clone(model.state);bad.learningEffectiveness.questions.S=clone(bad.learningEffectiveness.questions.Q);
      if(changeSource&&bad.learningEffectiveness.questions.S.delayedReview.receipts.correct)bad.learningEffectiveness.questions.S.delayedReview.receipts.correct.sourceId='S';
      bad.answeredIds.push('S');bad.correctIds.push('S');assert.strictEqual(Model.validateBackupState(bad,catalog,Object.keys(catalog)),false);assert.strictEqual(Model.prepareBackupState(bad,catalog,Object.keys(catalog)),null);
    }
  }
});
test('complete-history active exam scores require observed answers in exam mode',()=>{
  const catalog=Object.fromEntries(Array.from({length:15},(_,i)=>['E'+i,{...questions.Q,id:'E'+i}])),model=new Model(catalog,storage(),'test',Object.keys(catalog));
  model.state.examSession={ids:Object.keys(catalog),startedAt:100,endAt:20000,status:'RUNNING',scores:{E0:{correct:true,earned:1,possible:1,ratio:1}}};
  assert.strictEqual(Model.validateBackupState(model.state,catalog,Object.keys(catalog)),false);assert.strictEqual(Model.prepareBackupState(model.state,catalog,Object.keys(catalog)),null);
  assert(answer(model,'E0',true,1000,{mode:'training'}));assert.strictEqual(Model.validateBackupState(model.state,catalog,Object.keys(catalog)),false);
  assert(answer(model,'E0',true,1001,{mode:'exam'}));model.state.examSession.scores.E0.observationNumber=2;model.refreshEvidenceIntegrity();assert(Model.validateBackupState(model.state,catalog,Object.keys(catalog)));
  model.state.examSession.scores.E0={correct:false,earned:0,possible:1,ratio:0,observationNumber:2};assert.strictEqual(Model.validateBackupState(model.state,catalog,Object.keys(catalog)),false);
});
test('a backward coaching clock records assisted recovery once with a monotonic timestamp',()=>{
  const {model}=fresh();assert(answer(model,'Q',false,1000));const stats=clone(model.state.questionStats),rows=clone(model.state.attempts);
  assert.strictEqual(model.recordAssistedRecovery('Q',1,900),true);assert.strictEqual(model.recordAssistedRecovery('Q',1,800),false);
  let item=evidence(model).misconceptionStats['journal-entry'];assert.strictEqual(item.assistedRecoveredCount,1);assert.strictEqual(item.lastAssistedRecoveredAt,1000);
  assert.deepStrictEqual(model.state.questionStats,stats);assert.deepStrictEqual(model.state.attempts,rows);
  assert(answer(model,'Q',false,700));assert.strictEqual(model.recordAssistedRecovery('Q',2,600),true);
  item=evidence(model).misconceptionStats['journal-entry'];assert.strictEqual(item.assistedRecoveredCount,2);assert.strictEqual(item.lastAssistedRecoveredAt,1000);assert(Model.validateBackupState(model.state,questions));
});
test('an evicted review receipt cannot move its authority to another source',()=>{
  const catalog={...questions,S:{...questions.Q,id:'S'}},model=new Model(catalog,storage(),'test',Object.keys(catalog));
  schedule(model);assert(answer(model,'R',true,2000,{mode:'review',reviewSourceId:'Q',stage:1}));assert(model.completeReview('Q',true,2000,'R'));
  for(let i=0;i<201;i++)assert(answer(model,'T',true,3000+i,{mode:'training'}));
  const bad=clone(model.state);bad.learningEffectiveness.questions.S=bad.learningEffectiveness.questions.Q;delete bad.learningEffectiveness.questions.Q;
  bad.learningEffectiveness.questions.S.delayedReview.receipts.correct.sourceId='S';
  for(const key of ['answeredIds','correctIds'])bad[key]=bad[key].map(id=>id==='Q'?'S':id);
  bad.reviewSchedule.S=bad.reviewSchedule.Q;delete bad.reviewSchedule.Q;
  assert.strictEqual(Model.validateBackupState(bad,catalog,Object.keys(catalog)),false);assert.strictEqual(Model.prepareBackupState(bad,catalog,Object.keys(catalog)),null);
});
test('active exam cannot reuse an observed score from a different exam session after eviction',()=>{
  const catalog=Object.fromEntries(Array.from({length:15},(_,i)=>['E'+i,{...questions.Q,id:'E'+i}])),model=new Model(catalog,storage(),'test',Object.keys(catalog));
  model.state.examSession={ids:Object.keys(catalog),startedAt:100,endAt:2000,status:'RUNNING',evidenceVersion:1,scores:{}};
  assert(answer(model,'E0',true,1000,{mode:'exam'}));model.state.examSession.scores.E0={correct:true,earned:1,possible:1,ratio:1,observationNumber:1};model.refreshEvidenceIntegrity();
  for(const evict of [false,true]){
    if(evict)for(let i=0;i<201;i++)assert(answer(model,'E1',true,3000+i,{mode:'training'}));
    assert(Model.validateBackupState(model.state,catalog,Object.keys(catalog)));const bad=clone(model.state);bad.examAttempt++;bad.examSession.startedAt=5000;bad.examSession.endAt=6000;
    assert.strictEqual(Model.validateBackupState(bad,catalog,Object.keys(catalog)),false);assert.strictEqual(Model.prepareBackupState(bad,catalog,Object.keys(catalog)),null);
  }
});
test('a review after clock rollback records the same due event that advances completion',()=>{
  const {model}=fresh();assert(answer(model,'Q',true,500,{mode:'training'}));assert(model.record('Q',true,500));
  schedule(model,'Q','R',1,1000);model.state.reviewAssignments.Q.assignedAt=2000;
  assert(answer(model,'R',true,1500,{mode:'review',reviewSourceId:'Q',stage:1}));assert(model.completeReview('Q',true,1500,'R'));
  assert.strictEqual(model.state.reviewSchedule.Q.stage,2);assert.strictEqual(evidence(model).delayedReview.successes,1);
  assert.strictEqual(evidence(model).delayedReview.receipts.correct.at,1500);assert(Model.validateBackupState(model.state,questions));
});
test('reverse review bindings remain bounded when latest receipts switch targets',()=>{
  const catalog={...questions,S:{...questions.R,id:'S'}},store=storage(),model=new Model(catalog,store,'test',Object.keys(catalog));
  for(let i=0;i<220;i++){
    const id=i%2?'R':'S';schedule(model,'Q',id,i%4,1000+i);assert(answer(model,id,i%3!==0,1000+i,{mode:'review',reviewSourceId:'Q',stage:i%4}));assert(model.completeReview('Q',i%3!==0,1000+i,id));
    const bindings=Object.values(model.state.learningEffectiveness.questions).flatMap(item=>Object.values(item.reviewBindings)).reduce((sum,item)=>sum+Object.keys(item).length,0);
    assert.strictEqual(bindings,i?2:1);assert(Model.validateBackupState(model.state,catalog,Object.keys(catalog)));
  }
  const restored=new Model(catalog,store,'test',Object.keys(catalog));assert.strictEqual(restored.learningEffectivenessForQuestion('Q').delayedReview.attempts,220);
  const receipt=restored.state.learningEffectiveness.questions.Q.delayedReview.receipts.correct;
  const missing=clone(restored.state);delete missing.learningEffectiveness.questions[receipt.questionId].reviewBindings.Q.correct;assert.strictEqual(Model.validateBackupState(missing,catalog,Object.keys(catalog)),false);
  const orphan=clone(restored.state);orphan.learningEffectiveness.questions[receipt.questionId].reviewBindings.S={correct:{observationNumber:receipt.observationNumber,at:receipt.at,stage:receipt.stage}};assert.strictEqual(Model.validateBackupState(orphan,catalog,Object.keys(catalog)),false);
});
test('legacy unfinished exam remains unknown while a new session requires its own receipt',()=>{
  const catalog=Object.fromEntries(Array.from({length:15},(_,i)=>['E'+i,{...questions.Q,id:'E'+i}]));
  const old=new Model(catalog,storage(),'test',Object.keys(catalog)).state;delete old.learningEffectiveness;delete old.learningEvidenceIntegrity;old.learningSchemaVersion=2;old.contentRevision=4;old.mode='exam';
  old.examSession={ids:Object.keys(catalog),startedAt:100,endAt:2000,status:'RUNNING',scores:{E0:{correct:true,earned:1,possible:1,ratio:1}}};
  const model=new Model(catalog,storage(JSON.stringify(old)),'test',Object.keys(catalog));assert(Model.validateBackupState(model.state,catalog,Object.keys(catalog)));assert.strictEqual(model.learningEffectivenessForQuestion('E0').initialStatus,'unknown');
  model.state.examSession={...model.state.examSession,startedAt:3000,endAt:4000,evidenceVersion:1};assert.strictEqual(Model.validateBackupState(model.state,catalog,Object.keys(catalog)),false);
  assert(answer(model,'E0',true,3100,{mode:'exam'}));model.state.examSession.scores.E0.observationNumber=1;model.refreshEvidenceIntegrity();assert(Model.validateBackupState(model.state,catalog,Object.keys(catalog)));
  assert.strictEqual(model.learningEffectivenessForQuestion('E0').firstAttempt,null);delete model.state.examSession.scores.E0.observationNumber;assert.strictEqual(Model.validateBackupState(model.state,catalog,Object.keys(catalog)),false);
});
test('an active exam receipt survives eviction and clock rollback without inventing the first timestamp',()=>{
  const catalog=Object.fromEntries(Array.from({length:15},(_,i)=>['E'+i,{...questions.Q,id:'E'+i}])),store=storage(),model=new Model(catalog,store,'test',Object.keys(catalog));
  model.state.examSession={ids:Object.keys(catalog),startedAt:2000,endAt:3000,status:'RUNNING',evidenceVersion:1,scores:{}};
  assert(answer(model,'E0',false,1500,{mode:'exam'}));model.state.examSession.scores.E0={correct:false,earned:0,possible:1,ratio:0,observationNumber:1};model.refreshEvidenceIntegrity();
  for(let i=0;i<201;i++)assert(answer(model,'E1',true,1600+i,{mode:'training'}));
  assert(Model.validateBackupState(model.state,catalog,Object.keys(catalog)));const restored=new Model(catalog,store,'test',Object.keys(catalog));assert(Model.validateBackupState(restored.state,catalog,Object.keys(catalog)));
  const item=restored.learningEffectivenessForQuestion('E0');assert.strictEqual(item.firstAttempt.at,1500);assert.deepStrictEqual(item.lastExamObservation,{observationNumber:1,correct:false,at:1500,session:{startedAt:2000,endAt:3000,attempt:0}});
});
test('new answers in an unfinished legacy exam cannot lose their observation number',()=>{
  const catalog=Object.fromEntries(Array.from({length:15},(_,i)=>['E'+i,{...questions.Q,id:'E'+i}]));
  const old=new Model(catalog,storage(),'test',Object.keys(catalog)).state;delete old.learningEffectiveness;delete old.learningEvidenceIntegrity;old.learningSchemaVersion=2;old.contentRevision=4;old.mode='exam';
  old.examSession={ids:Object.keys(catalog),startedAt:100,endAt:2000,status:'RUNNING',scores:{E1:{correct:false,earned:0,possible:1,ratio:0}}};
  const model=new Model(catalog,storage(JSON.stringify(old)),'test',Object.keys(catalog));assert(answer(model,'E0',true,500,{mode:'exam'}));
  model.state.examSession.scores.E0={correct:true,earned:1,possible:1,ratio:1,observationNumber:1};model.refreshEvidenceIntegrity();assert(Model.validateBackupState(model.state,catalog,Object.keys(catalog)));
  delete model.state.examSession.scores.E0.observationNumber;assert.strictEqual(Model.validateBackupState(model.state,catalog,Object.keys(catalog)),false);
  model.state.learningEffectiveness.questions.E0.lastExamObservation=null;assert.strictEqual(Model.validateBackupState(model.state,catalog,Object.keys(catalog)),false);
  assert.strictEqual(model.learningEffectivenessForQuestion('E1').initialStatus,'unknown');
});
test('unknown-history evidence survives eviction and rejects a missing observed aggregate',()=>{
  const module={exports:{}};require('vm').runInNewContext(require('child_process').execFileSync('git',['show','81088e2ad3bc96a6ff5bd995e6dfcfb58a4fd62f:js/model.js'],{encoding:'utf8'}),{module});
  const store=storage(),old=new module.exports(questions,store,'test');old.recordAttempt('Q',false,10,'journal-entry',false,100);
  const model=new Model(questions,store,'test');assert(answer(model,'Q',true,1000));
  for(let i=0;i<201;i++)assert(answer(model,'T',true,2000+i,{mode:'training'}));
  assert(model.state.attempts.every(row=>row.questionId==='T'));assert(Model.validateBackupState(model.state,questions));
  const bad=clone(model.state);delete bad.learningEffectiveness.questions.Q;
  assert.strictEqual(Model.validateBackupState(bad,questions),false);assert.strictEqual(Model.prepareBackupState(bad,questions),null);
  const bytes=JSON.stringify(bad),loaded=fresh(bytes);assert(loaded.model.storageWriteBlocked);assert.strictEqual(loaded.store.value,bytes);
});
test('issued current backups cannot lose their entire evidence and masquerade as legacy',()=>{
  const {model}=fresh();assert(answer(model,'Q',false,1000));for(let i=0;i<201;i++)assert(answer(model,'T',true,2000+i));
  const bad=clone(model.state);delete bad.learningEffectiveness;
  for(const row of bad.attempts){delete row.observationNumber;delete row.mode;delete row.support;}
  assert.strictEqual(Model.validateBackupState(bad,questions),false);assert.strictEqual(Model.prepareBackupState(bad,questions),null);
  const bytes=JSON.stringify(bad),loaded=fresh(bytes);assert(loaded.model.storageWriteBlocked);assert.strictEqual(loaded.store.value,bytes);
});
test('issued evidence cannot lose or corrupt its outer integrity marker',()=>{
  const {model}=fresh();assert(answer(model,'Q',false,1000));const original=clone(model.state);
  for(const mutate of [v=>delete v.learningEvidenceIntegrity,v=>v.learningEvidenceIntegrity=null,v=>v.learningEvidenceIntegrity.schemaVersion=12,v=>v.learningEvidenceIntegrity.signature='deadbeef']){
    const bad=clone(original);mutate(bad);assert.strictEqual(Model.validateBackupState(bad,questions),false);assert.strictEqual(Model.prepareBackupState(bad,questions),null);
    const bytes=JSON.stringify(bad),loaded=fresh(bytes);assert(loaded.model.storageWriteBlocked);assert.strictEqual(loaded.store.value,bytes);
  }
});
test('an unmarked schema2 preview preserves all existing evidence when issued as schema3',()=>{
  const {model}=fresh();assert(answer(model,'Q',false,1000));assert(model.recordAssistedRecovery('Q',1,1100));
  const old=clone(model.state);delete old.learningEvidenceIntegrity;old.learningSchemaVersion=2;old.contentRevision=4;
  assert(Model.validateBackupState(old,questions));const migrated=Model.prepareBackupState(old,questions);
  assert.strictEqual(migrated.learningSchemaVersion,3);assert.deepStrictEqual(migrated.learningEffectiveness,old.learningEffectiveness);
  assert.deepStrictEqual(migrated.questionStats,old.questionStats);assert.deepStrictEqual(migrated.learningContinuityState,old.learningContinuityState);assert(migrated.learningEvidenceIntegrity);
  assert.deepStrictEqual(Model.prepareBackupState(migrated,questions),migrated);
});
test('issued completion flags cannot disappear while their observed evidence remains',()=>{
  const {model}=fresh();assert(answer(model,'Q',true,1000));
  assert(Model.validateBackupState(model.state,questions),'an observation before finalization remains valid');
  assert.deepStrictEqual(Model.prepareBackupState(model.state,questions).answeredIds,[],'never infer completion from an unfinished observation');
  model.record('Q',true,1000);
  assert(Model.validateBackupState(model.state,questions));
  for(const fields of [['answeredIds'],['correctIds'],['answeredIds','correctIds']]){
    const bad=clone(model.state);for(const field of fields)bad[field]=[];
    assert.strictEqual(Model.validateBackupState(bad,questions),false,fields.join('+'));
    assert.strictEqual(Model.prepareBackupState(bad,questions),null);
    const bytes=JSON.stringify(bad),loaded=fresh(bytes);assert(loaded.model.storageWriteBlocked);assert.strictEqual(loaded.store.value,bytes);
  }
});
test('issued lifetime result and time remain protected after every detail for that question is evicted',()=>{
  const {model}=fresh();assert(answer(model,'Q',true,1000));model.record('Q',true,1000);
  for(let i=0;i<201;i++)assert(answer(model,'T',false,2000+i));
  assert(model.state.attempts.every(row=>row.questionId==='T'));assert(Model.validateBackupState(model.state,questions));
  for(const mutate of [v=>v.questionStats.Q.lastResult=false,v=>v.questionStats.Q.lastAnsweredAt++,v=>v.questionStats.Q.correctStreak=0,v=>v.lastLearningAt++]){
    const bad=clone(model.state);mutate(bad);assert.strictEqual(Model.validateBackupState(bad,questions),false);
    assert.strictEqual(Model.prepareBackupState(bad,questions),null);
    const bytes=JSON.stringify(bad),loaded=fresh(bytes);assert(loaded.model.storageWriteBlocked);assert.strictEqual(loaded.store.value,bytes);
  }
});
test('the real prior schema3 preview retains its evidence, flags and statistics when its marker is upgraded',()=>{
  const vm=require('vm'),module={exports:{}};
  vm.runInNewContext(require('child_process').execFileSync('git',['show','ed21218967958e42e67ba9aafe9c333a5bbccc55:js/model.js'],{encoding:'utf8'}),{module,console});
  const store=storage(),old=new module.exports(questions,store,'test');old.recordAttempt('Q',true,10,'',false,100);old.record('Q',true,100);
  const original=clone(old.state);assert.strictEqual(original.learningEvidenceIntegrity.schemaVersion,1);
  assert(Model.validateBackupState(original,questions));const migrated=Model.prepareBackupState(original,questions);
  assert.strictEqual(migrated.learningEvidenceIntegrity.schemaVersion,11);
  const withoutMarker=value=>{const copy=clone(value);delete copy.learningEvidenceIntegrity;delete copy.contentRevision;if(copy.questionContentVersions){delete copy.questionContentVersions.L044;delete copy.questionContentVersions.L045;for(let n=2;n<=18;n++)delete copy.questionContentVersions['D'+String(n).padStart(3,'0')];}delete copy.learningDayHistory;delete copy.legacyProvenance;return copy;};
  assert.deepStrictEqual(withoutMarker(migrated),withoutMarker(original));assert.deepStrictEqual(JSON.parse(migrated.legacyProvenance.original),original);
  assert.deepStrictEqual(Model.prepareBackupState(migrated,questions),migrated);
});
test('issued continuity totals and evicted active days cannot silently change',()=>{
  const {model}=fresh();
  for(let day=0;day<30;day++)for(let n=0;n<10;n++)assert(answer(model,'Q',true,new Date(2026,0,1+day,12,0,n).getTime()));
  assert.strictEqual(model.state.attempts.length,200);assert.strictEqual(model.state.learningContinuityState.activeDayKeys.length,30);
  assert(Model.validateBackupState(model.state,questions));
  const original=clone(model.state);
  for(const mutate of [v=>v.learningContinuityState.today.correctCount--,v=>v.learningContinuityState.activeDayKeys.shift(),
    v=>v.learningContinuityState.today.attempts++,v=>v.learningContinuityState.today.questionIds=[],v=>v.learningContinuityState.today.reviewSuccessCount++]){
    const bad=clone(original);mutate(bad);assert(model.validLearningContinuityState(bad.learningContinuityState),'the bad state still passes structural validation');
    assert.strictEqual(Model.validateBackupState(bad,questions),false);assert.strictEqual(Model.prepareBackupState(bad,questions),null);
    const bytes=JSON.stringify(bad),loaded=fresh(bytes);assert(loaded.model.storageWriteBlocked);assert.strictEqual(loaded.store.value,bytes);
  }
});
test('the real v2-marker preview preserves thirty-day continuity when upgraded',()=>{
  const vm=require('vm'),module={exports:{}};
  vm.runInNewContext(require('child_process').execFileSync('git',['show','329358667766735b6dc305eb821b97024132fd26:js/model.js'],{encoding:'utf8'}),{module,console});
  const store=storage(),old=new module.exports(questions,store,'test');
  for(let day=0;day<30;day++)for(let n=0;n<10;n++)assert(old.recordAttempt('Q',true,10,'',false,new Date(2026,0,1+day,12,0,n).getTime()));
  const original=clone(old.state);assert.strictEqual(original.learningEvidenceIntegrity.schemaVersion,2);assert.strictEqual(original.learningContinuityState.activeDayKeys.length,30);
  const migrated=Model.prepareBackupState(original,questions);assert(migrated);assert.strictEqual(migrated.learningEvidenceIntegrity.schemaVersion,11);
  const withoutMarker=value=>{const copy=clone(value);delete copy.learningEvidenceIntegrity;delete copy.contentRevision;if(copy.questionContentVersions){delete copy.questionContentVersions.L044;delete copy.questionContentVersions.L045;for(let n=2;n<=18;n++)delete copy.questionContentVersions['D'+String(n).padStart(3,'0')];}delete copy.learningDayHistory;delete copy.legacyProvenance;return copy;};
  assert.deepStrictEqual(withoutMarker(migrated),withoutMarker(original));assert.deepStrictEqual(JSON.parse(migrated.legacyProvenance.original),original);assert.deepStrictEqual(Model.prepareBackupState(migrated,questions),migrated);
});
test('issued pending review authority cannot be removed or moved without invalidating its backup',()=>{
  const {model}=fresh();assert(answer(model,'Q',false,1000));model.record('Q',false,1000);model.assignReview('Q','R',1001);
  const original=clone(model.state);assert(Model.validateBackupState(original,questions));
  for(const mutate of [v=>{delete v.reviewSchedule.Q;delete v.reviewAssignments.Q;},v=>delete v.reviewSchedule.Q,v=>delete v.reviewAssignments.Q,
    v=>{v.reviewSchedule.Q.stage++;v.reviewAssignments.Q.stage++;},v=>{v.reviewSchedule.Q.dueAt++;v.reviewAssignments.Q.dueAt++;}]){
    const bad=clone(original);mutate(bad);assert.strictEqual(Model.validateBackupState(bad,questions),false);
    assert.strictEqual(Model.prepareBackupState(bad,questions),null);const bytes=JSON.stringify(bad),loaded=fresh(bytes);
    assert(loaded.model.storageWriteBlocked);assert.strictEqual(loaded.store.value,bytes);
  }
});
test('the real v3-marker preview preserves pending review authority on migration',()=>{
  const vm=require('vm'),module={exports:{}};
  vm.runInNewContext(require('child_process').execFileSync('git',['show','bd558e21b3aa68ddccde3216d5ba89da105884cf:js/model.js'],{encoding:'utf8'}),{module,console});
  const store=storage(),old=new module.exports(questions,store,'test');assert(old.recordAttempt('Q',false,10,'journal-entry',false,1000));old.record('Q',false,1000);old.assignReview('Q','R',1001);
  const original=clone(old.state);assert.strictEqual(original.learningEvidenceIntegrity.schemaVersion,3);
  const migrated=Model.prepareBackupState(original,questions);assert(migrated);assert.strictEqual(migrated.learningEvidenceIntegrity.schemaVersion,11);
  const withoutMarker=value=>{const copy=clone(value);delete copy.learningEvidenceIntegrity;delete copy.contentRevision;if(copy.questionContentVersions){delete copy.questionContentVersions.L044;delete copy.questionContentVersions.L045;for(let n=2;n<=18;n++)delete copy.questionContentVersions['D'+String(n).padStart(3,'0')];}delete copy.learningDayHistory;delete copy.legacyProvenance;return copy;};
  assert.deepStrictEqual(withoutMarker(migrated),withoutMarker(original));assert.deepStrictEqual(JSON.parse(migrated.legacyProvenance.original),original);assert.deepStrictEqual(Model.prepareBackupState(migrated,questions),migrated);
  const restored=fresh(JSON.stringify(migrated)).model;assert.deepStrictEqual(restored.dueReviewIds(original.reviewSchedule.Q.dueAt),['Q']);
});
test('the real v4-marker preview preserves completed exam history on migration',()=>{
  const vm=require('vm'),module={exports:{}};
  vm.runInNewContext(require('child_process').execFileSync('git',['show','f7b86ac51be1b25ca32b50ac28d5efaa6ff26fa3:js/model.js'],{encoding:'utf8'}),{module,console});
  const store=storage(),old=new module.exports(questions,store,'test');assert(old.recordAttempt('Q',true,10,'',false,1000));
  old.state.examHistory=[{finishedAt:2000,points:80,setSignature:'set-a'},{finishedAt:3000,points:75,setSignature:'set-b'}];old.updateCompletion({});
  const original=clone(old.state);assert.strictEqual(original.learningEvidenceIntegrity.schemaVersion,4);
  const migrated=Model.prepareBackupState(original,questions);assert(migrated);assert.strictEqual(migrated.learningEvidenceIntegrity.schemaVersion,11);
  const withoutMarker=value=>{const copy=clone(value);delete copy.learningEvidenceIntegrity;delete copy.contentRevision;if(copy.questionContentVersions){delete copy.questionContentVersions.L044;delete copy.questionContentVersions.L045;for(let n=2;n<=18;n++)delete copy.questionContentVersions['D'+String(n).padStart(3,'0')];}delete copy.learningDayHistory;delete copy.legacyProvenance;return copy;};
  assert.deepStrictEqual(withoutMarker(migrated),withoutMarker(original));assert.deepStrictEqual(JSON.parse(migrated.legacyProvenance.original),original);assert.deepStrictEqual(Model.prepareBackupState(migrated,questions),migrated);
  assert.deepStrictEqual(fresh(JSON.stringify(migrated)).model.state.examHistory,original.examHistory);
});
test('the real v5 marker preserves migrated archives and active exam grades on upgrade',()=>{
  const vm=require('vm'),module={exports:{}},legacy=require('./helpers/issue207-fixtures');
  vm.runInNewContext(require('child_process').execFileSync('git',['show','2cf70526f3cdc18560f151d4d32134a49aef79cb:js/model.js'],{encoding:'utf8'}),{module,console});
  for(const id of ['J051','L031']){
    const store=legacy.storage(JSON.stringify(legacy.fixture('old',id))),old=new module.exports(legacy.questions,store,'test');
    const ids=canonicalPool.slice(0,15),qid=ids[0];
    old.state.mode='exam';old.state.examSession={ids,startedAt:100,endAt:2000,status:'RUNNING',evidenceVersion:1,scores:{}};
    assert(old.recordAttempt(qid,false,10,'journal-entry',false,1000,null,'unsure',{mode:'exam',support:'none',observationNumber:1}));
    old.state.examSession.scores[qid]={correct:false,earned:0,possible:1,ratio:0,observationNumber:1,answer:{debit:[],credit:[]}};old.save();
    const original=clone(old.state);assert.strictEqual(original.learningEvidenceIntegrity.schemaVersion,5);assert(original.contentMigrationArchive.questions[id]);assert(original.contentRecheckIds.includes(id));
    const migrated=Model.prepareBackupState(original,legacy.questions,canonicalPool);assert(migrated);assert.strictEqual(migrated.learningEvidenceIntegrity.schemaVersion,11);
    const withoutMarker=value=>{const copy=clone(value);delete copy.learningEvidenceIntegrity;delete copy.contentRevision;if(copy.questionContentVersions){delete copy.questionContentVersions.L044;delete copy.questionContentVersions.L045;for(let n=2;n<=18;n++)delete copy.questionContentVersions['D'+String(n).padStart(3,'0')];}delete copy.learningDayHistory;delete copy.legacyProvenance;return copy;};
    assert.deepStrictEqual(withoutMarker(migrated),withoutMarker(original));assert.deepStrictEqual(JSON.parse(migrated.legacyProvenance.original),original);assert.deepStrictEqual(Model.prepareBackupState(migrated,legacy.questions,canonicalPool),migrated);
    const restored=new Model(legacy.questions,legacy.storage(JSON.stringify(migrated)),'test',canonicalPool);assert.deepStrictEqual(restored.state.examSession,original.examSession);assert.deepStrictEqual(restored.state.contentMigrationArchive,original.contentMigrationArchive);
  }
});
test('real v5 active exams reject both core and non-pool transfer members before migration',()=>{
  const vm=require('vm'),module={exports:{}},data={window:{}};vm.runInNewContext(require('fs').readFileSync('data/questions.js','utf8'),data);
  const catalog=data.window.QuestionData,pool=data.window.ExamPoolDefinition;
  vm.runInNewContext(require('child_process').execFileSync('git',['show','2cf70526f3cdc18560f151d4d32134a49aef79cb:js/model.js'],{encoding:'utf8'}),{module,console});
  const old=new module.exports(catalog,storage(),'test'),ids=Array.from(pool).slice(0,15);
  old.state.mode='exam';old.state.examSession={ids,startedAt:100,endAt:2000,status:'RUNNING',evidenceVersion:1,scores:{}};
  assert(old.recordAttempt(ids[0],false,10,'journal-entry',false,1000,null,'unsure',{mode:'exam',support:'none',observationNumber:1}));
  old.state.examSession.scores[ids[0]]={correct:false,earned:0,possible:1,ratio:0,observationNumber:1};old.save();
  const original=clone(old.state);assert.strictEqual(original.learningEvidenceIntegrity.schemaVersion,5);assert(Model.validateBackupState(original,catalog,pool));
  const outside=Object.keys(catalog).find(id=>catalog[id].learningRole==='transfer'&&!pool.includes(id));assert(outside);
  for(const unavailable of [undefined,null,[]]){
    assert.strictEqual(Model.validateBackupState(original,catalog,unavailable),false);assert.strictEqual(Model.prepareBackupState(original,catalog,unavailable),null);
    const bytes=JSON.stringify(original),store=storage(bytes);assert(new Model(catalog,store,'test',unavailable).storageWriteBlocked);assert.strictEqual(store.value,bytes);
  }
  for(const id of ['J001',outside]){
    const bad=clone(original);bad.examSession.ids[1]=id;assert.strictEqual(Model.validateBackupState(bad,catalog,pool),false,id);
    assert.strictEqual(Model.prepareBackupState(bad,catalog,pool),null);const bytes=JSON.stringify(bad),store=storage(bytes);
    assert(new Model(catalog,store,'test',pool).storageWriteBlocked);assert.strictEqual(store.value,bytes);
  }
});
test('issued placement completion cannot disappear before the first answer',()=>{
  const {model}=fresh();model.completePlacement({foundation:80,closing:70},1000);assert.strictEqual(model.state.attempts.length,0);
  const original=clone(model.state);assert(Model.validateBackupState(original,questions));
  for(const mutate of [v=>v.placement=null,v=>v.placement.foundation--,v=>v.placement.closing--,v=>v.placement.startQuestionId='R',v=>v.placement.completedAt++]){
    const bad=clone(original);mutate(bad);assert.strictEqual(Model.validateBackupState(bad,questions),false);assert.strictEqual(Model.prepareBackupState(bad,questions),null);
    const bytes=JSON.stringify(bad),loaded=fresh(bytes);assert(loaded.model.storageWriteBlocked);assert.strictEqual(loaded.store.value,bytes);
  }
});
test('placement completion, reset and legacy migration remain valid through reload',()=>{
  const {model,store}=fresh();model.completePlacement({foundation:80,closing:70},1000);
  let loaded=new Model(questions,store,'test');assert.deepStrictEqual(loaded.state.placement,model.state.placement);assert(Model.validateBackupState(loaded.state,questions));
  loaded.resetPlacement();loaded=new Model(questions,store,'test');assert.strictEqual(loaded.state.placement,null);assert(Model.validateBackupState(loaded.state,questions));
  assert(answer(loaded,'Q',false,2000));loaded.record('Q',false,2000);assert(loaded.migrateLegacyPlacement(3000));
  const migrated=clone(loaded.state.placement);assert.strictEqual(migrated.migrated,true);loaded=new Model(questions,store,'test');
  assert.deepStrictEqual(loaded.state.placement,migrated);assert(Model.validateBackupState(loaded.state,questions));
});
test('real v6 placement upgrades without inventing an initial answer',()=>{
  const vm=require('vm'),module={exports:{}};vm.runInNewContext(require('child_process').execFileSync('git',['show','8fd91a400b9f80502bc16e40e2701ce8e1e04669:js/model.js'],{encoding:'utf8'}),{module,console});
  const old=new module.exports(questions,storage(),'test');old.completePlacement({foundation:80,closing:70},1000);
  const original=clone(old.state);assert.strictEqual(original.learningEvidenceIntegrity.schemaVersion,6);
  const migrated=Model.prepareBackupState(original,questions);assert(migrated);assert.strictEqual(migrated.learningEvidenceIntegrity.schemaVersion,11);
  const withoutMarker=value=>{const copy=clone(value);delete copy.learningEvidenceIntegrity;delete copy.contentRevision;if(copy.questionContentVersions){delete copy.questionContentVersions.L044;delete copy.questionContentVersions.L045;for(let n=2;n<=18;n++)delete copy.questionContentVersions['D'+String(n).padStart(3,'0')];}delete copy.learningDayHistory;delete copy.legacyProvenance;return copy;};assert.deepStrictEqual(withoutMarker(migrated),withoutMarker(original));assert.deepStrictEqual(JSON.parse(migrated.legacyProvenance.original),original);
  assert.deepStrictEqual(migrated.learningEffectiveness.questions,{});assert.deepStrictEqual(Model.prepareBackupState(migrated,questions),migrated);
});
test('placement save failure keeps original bytes and cannot create answer evidence',()=>{
  const {model,store}=fresh();model.save();const original=store.value;store.setItem=()=>false;model.completePlacement({foundation:80,closing:70},1000);
  assert.strictEqual(store.value,original);const loaded=new Model(questions,store,'test');assert.strictEqual(loaded.state.placement,null);
  assert.deepStrictEqual(loaded.state.learningEffectiveness.questions,{});assert.strictEqual(loaded.state.attempts.length,0);
});
test('issued finalized mistake totals cannot disappear or change after detail eviction',()=>{
  const {model}=fresh();assert(answer(model,'Q',false,1000));model.record('Q',false,1000);
  for(let i=0;i<201;i++)assert(answer(model,'T',true,2000+i));
  assert(!model.state.attempts.some(row=>row.questionId==='Q'));assert.strictEqual(model.state.mistakeCounts.Q,1);
  const original=clone(model.state);assert(Model.validateBackupState(original,questions));
  for(const mutate of [v=>delete v.mistakeCounts.Q,v=>v.mistakeCounts.Q=2,v=>v.mistakeCounts={}]){
    const bad=clone(original);mutate(bad);assert.strictEqual(Model.validateBackupState(bad,questions),false);assert.strictEqual(Model.prepareBackupState(bad,questions),null);
    const bytes=JSON.stringify(bad),loaded=fresh(bytes);assert(loaded.model.storageWriteBlocked);assert.strictEqual(loaded.store.value,bytes);
  }
});
test('real v7 evicted mistake totals migrate, reload and increment without inferred history',()=>{
  const vm=require('vm'),module={exports:{}};vm.runInNewContext(require('child_process').execFileSync('git',['show','86135e34047c7356aa2a020d5221ca14f205c4d9:js/model.js'],{encoding:'utf8'}),{module,console});
  const old=new module.exports(questions,storage(),'test');
  for(let i=0;i<3;i++){assert(old.recordAttempt('Q',false,10,'journal-entry',false,1000+i));old.record('Q',false,1000+i);}
  for(let i=0;i<201;i++)assert(old.recordAttempt('T',true,10,'',false,2000+i));
  const original=clone(old.state);assert.strictEqual(original.learningEvidenceIntegrity.schemaVersion,7);assert.strictEqual(original.mistakeCounts.Q,3);
  const migrated=Model.prepareBackupState(original,questions);assert(migrated);assert.strictEqual(migrated.learningEvidenceIntegrity.schemaVersion,11);
  const withoutMarker=value=>{const copy=clone(value);delete copy.learningEvidenceIntegrity;delete copy.contentRevision;if(copy.questionContentVersions){delete copy.questionContentVersions.L044;delete copy.questionContentVersions.L045;for(let n=2;n<=18;n++)delete copy.questionContentVersions['D'+String(n).padStart(3,'0')];}delete copy.learningDayHistory;delete copy.legacyProvenance;return copy;};assert.deepStrictEqual(withoutMarker(migrated),withoutMarker(original));assert.deepStrictEqual(JSON.parse(migrated.legacyProvenance.original),original);
  const store=storage(JSON.stringify(migrated));let model=new Model(questions,store,'test');assert.strictEqual(model.state.mistakeCounts.Q,3);
  assert(answer(model,'Q',false,3000));model.record('Q',false,3000);assert.strictEqual(model.state.mistakeCounts.Q,4);
  assert(answer(model,'Q',true,4000));model.record('Q',true,4000);model=new Model(questions,store,'test');assert.strictEqual(model.state.mistakeCounts.Q,4);
  assert(Model.validateBackupState(model.state,questions));assert.deepStrictEqual(Model.prepareBackupState(model.state,questions),model.state);
});
test('unsigned v7 mistake totals cannot contradict protected complete-history evidence',()=>{
  const vm=require('vm'),module={exports:{}};vm.runInNewContext(require('child_process').execFileSync('git',['show','86135e34047c7356aa2a020d5221ca14f205c4d9:js/model.js'],{encoding:'utf8'}),{module,console});
  const old=new module.exports(questions,storage(),'test');assert(old.recordAttempt('Q',false,10,'journal-entry',false,1000));old.record('Q',false,1000);
  for(let i=0;i<201;i++)assert(old.recordAttempt('T',true,10,'',false,2000+i));
  const original=clone(old.state);assert.strictEqual(original.learningEvidenceIntegrity.schemaVersion,7);assert(Model.validateBackupState(original,questions));
  for(const mutate of [v=>v.mistakeCounts.Q=999,v=>v.mistakeCounts.Q=2,v=>delete v.mistakeCounts.Q]){
    const bad=clone(original);mutate(bad);assert(module.exports.validateBackupState(bad,questions),'the original v7 format does not bind this total');
    assert.strictEqual(Model.validateBackupState(bad,questions),false);assert.strictEqual(Model.prepareBackupState(bad,questions),null);
    const bytes=JSON.stringify(bad),loaded=fresh(bytes);assert(loaded.model.storageWriteBlocked);assert.strictEqual(loaded.store.value,bytes);
  }
});
test('legacy mistake bounds preserve review sources, unfinished answers and unknown history',()=>{
  const vm=require('vm'),module={exports:{}};vm.runInNewContext(require('child_process').execFileSync('git',['show','86135e34047c7356aa2a020d5221ca14f205c4d9:js/model.js'],{encoding:'utf8'}),{module,console});
  const old=new module.exports(questions,storage(),'test');assert(old.recordAttempt('Q',false,10,'journal-entry',false,1000));old.record('Q',false,1000);
  const due=old.state.reviewSchedule.Q.dueAt;old.assignReview('Q','R',due-1);old.state.mode='review';
  assert(old.recordAttempt('R',false,10,'journal-entry',false,due,0,'unsure',{mode:'review',support:'none',reviewSourceId:'Q'}));assert(old.completeReview('Q',false,due,'R'));
  assert.strictEqual(old.state.mistakeCounts.Q,2);assert.strictEqual(old.state.questionStats.Q.incorrectCount,1);assert.strictEqual(old.state.learningEffectiveness.questions.Q.delayedReview.attempts,1);
  const original=clone(old.state),migrated=Model.prepareBackupState(original,questions);assert(migrated);assert.deepStrictEqual(migrated.mistakeCounts,{Q:2});
  const excess=clone(original);excess.mistakeCounts.Q=3;assert.strictEqual(Model.prepareBackupState(excess,questions),null);
  const catalog={...questions,...Object.fromEntries(Array.from({length:12},(_,i)=>['E'+i,{...questions.Q,id:'E'+i}]))},pool=Object.keys(catalog);
  const pending=new module.exports(catalog,storage(),'test',pool);pending.state.mode='exam';pending.state.examSession={ids:pool,startedAt:100,endAt:3000,status:'RUNNING',evidenceVersion:1,scores:{}};
  assert(pending.recordAttempt('Q',false,10,'journal-entry',false,2000,null,'unsure',{mode:'exam',support:'none'}));
  pending.state.examSession.scores.Q={correct:false,earned:0,possible:1,ratio:0,observationNumber:1};pending.refreshEvidenceIntegrity();
  assert.deepStrictEqual(clone(pending.state.mistakeCounts),{});const pendingPrepared=Model.prepareBackupState(clone(pending.state),catalog,pool);assert(pendingPrepared);assert.deepStrictEqual(pendingPrepared.mistakeCounts,{});assert.deepStrictEqual(pendingPrepared.answeredIds,[]);
  assert.deepStrictEqual(pendingPrepared.examSession,clone(pending.state.examSession));
  const legacy=clone(new module.exports(questions,storage(),'test').state);delete legacy.learningEvidenceIntegrity;delete legacy.learningEffectiveness;legacy.learningSchemaVersion=2;legacy.contentRevision=4;
  legacy.mistakeCounts={Q:999};legacy.answeredIds=['Q'];legacy.incorrectIds=['Q'];
  const unknown=new module.exports(questions,storage(JSON.stringify(legacy)),'test');assert.strictEqual(unknown.state.learningEffectiveness.initialHistory,'unknown');
  const unknownPrepared=Model.prepareBackupState(clone(unknown.state),questions);assert(unknownPrepared);assert.deepStrictEqual(unknownPrepared.mistakeCounts,{Q:999});
  const restored=fresh(JSON.stringify(unknownPrepared)).model;assert.strictEqual(restored.state.mistakeCounts.Q,999);assert.strictEqual(restored.learningEffectivenessForQuestion('Q').firstAttempt,null);
});
test('genuine v5 active exam scores reject contradictory outcomes before resealing',()=>{
  const vm=require('vm'),module={exports:{}},data={window:{}};vm.runInNewContext(require('fs').readFileSync('data/questions.js','utf8'),data);
  vm.runInNewContext(require('child_process').execFileSync('git',['show','2cf70526f3cdc18560f151d4d32134a49aef79cb:js/model.js'],{encoding:'utf8'}),{module,console});
  const catalog=data.window.QuestionData,pool=Array.from(data.window.ExamPoolDefinition),old=new module.exports(catalog,storage(),'test'),id=pool[0];
  old.state.mode='exam';old.state.examSession={ids:pool.slice(0,15),startedAt:100,endAt:2000,status:'RUNNING',evidenceVersion:1,scores:{}};
  assert(old.recordAttempt(id,false,10,'journal-entry',false,1000,null,'unsure',{mode:'exam',support:'none'}));
  old.state.examSession.scores[id]={correct:false,earned:0,possible:1,ratio:0,observationNumber:1};old.save();const original=clone(old.state);assert(Model.validateBackupState(original,catalog,pool));
  for(const fields of [{earned:1,ratio:1},{earned:0,ratio:0.5},{earned:0.5,ratio:0.5},{earned:1,possible:2,ratio:0.5}]){
    const bad=clone(original);Object.assign(bad.examSession.scores[id],fields);assert(module.exports.validateBackupState(bad,catalog));
    assert.strictEqual(Model.validateBackupState(bad,catalog,pool),false);assert.strictEqual(Model.prepareBackupState(bad,catalog,pool),null);
    const bytes=JSON.stringify(bad),store=storage(bytes);assert(new Model(catalog,store,'test',pool).storageWriteBlocked);assert.strictEqual(store.value,bytes);
  }
});
test('issued partial journal and table drafts cannot disappear or change in backup',()=>{
  const {model}=fresh();assert(model.setDraft('Q',{debit:[{account:'現金',amount:100}],credit:[{account:'',amount:null}]}));assert(model.setDraft('T',{cells:{a:'12',b:''}}));
  const original=clone(model.state);assert(Model.validateBackupState(original,questions));
  for(const mutate of [v=>delete v.drafts.Q,v=>v.drafts.Q.debit[0].amount=200,v=>delete v.drafts.T,v=>v.drafts.T.cells.a='99']){
    const bad=clone(original);mutate(bad);assert.strictEqual(Model.validateBackupState(bad,questions),false);assert.strictEqual(Model.prepareBackupState(bad,questions),null);
    const bytes=JSON.stringify(bad),loaded=fresh(bytes);assert(loaded.model.storageWriteBlocked);assert.strictEqual(loaded.store.value,bytes);
  }
});
test('resolved ordinary v7 mistakes cannot lose finalized totals after eviction',()=>{
  const vm=require('vm'),module={exports:{}};vm.runInNewContext(require('child_process').execFileSync('git',['show','86135e34047c7356aa2a020d5221ca14f205c4d9:js/model.js'],{encoding:'utf8'}),{module,console});
  const old=new module.exports(questions,storage(),'test');old.state.mode='training';
  for(let i=0;i<3;i++){assert(old.recordAttempt('Q',false,10,'journal-entry',false,1000+i,null,'unsure',{mode:'training',support:'none'}));old.record('Q',false,1000+i);}
  let due;
  for(let stage=0;stage<4;stage++){
    due=old.state.reviewSchedule.Q.dueAt;old.assignReview('Q','Q',due-1);old.state.mode='review';
    assert(old.recordAttempt('Q',true,10,'',true,due,stage,'unsure',{mode:'review',support:'none',reviewSourceId:'Q'}));assert(old.completeReview('Q',true,due,'Q'));
  }
  old.state.mode='training';for(let i=0;i<201;i++)assert(old.recordAttempt('T',true,10,'',false,due+i+1));
  const original=clone(old.state);assert.strictEqual(original.mistakeCounts.Q,3);assert(!original.incorrectIds.includes('Q'));assert(!original.attempts.some(row=>row.questionId==='Q'));assert(Model.validateBackupState(original,questions));
  for(const count of [null,1,2]){
    const bad=clone(original);if(count===null)delete bad.mistakeCounts.Q;else bad.mistakeCounts.Q=count;assert(module.exports.validateBackupState(bad,questions));
    assert.strictEqual(Model.validateBackupState(bad,questions),false);assert.strictEqual(Model.prepareBackupState(bad,questions),null);const bytes=JSON.stringify(bad),loaded=fresh(bytes);assert(loaded.model.storageWriteBlocked);assert.strictEqual(loaded.store.value,bytes);
  }
});
test('real v8 partial drafts migrate losslessly and remain valid through every clear path',()=>{
  const vm=require('vm'),module={exports:{}};vm.runInNewContext(require('child_process').execFileSync('git',['show','d6da732f57e8a46717f67620b5a2761caa685872:js/model.js'],{encoding:'utf8'}),{module,console});
  const old=new module.exports(questions,storage(),'test');
  const journal={debit:[{account:'現金',amount:100}],credit:[{account:'',amount:null}]},table={cells:{a:'12',b:''}};
  assert(old.setDraft('Q',journal));assert(old.setDraft('T',table));const original=clone(old.state);
  assert.strictEqual(original.learningEvidenceIntegrity.schemaVersion,8);
  const migrated=Model.prepareBackupState(original,questions);assert(migrated);assert.strictEqual(migrated.learningEvidenceIntegrity.schemaVersion,11);
  const withoutMarker=value=>{const copy=clone(value);delete copy.learningEvidenceIntegrity;delete copy.contentRevision;if(copy.questionContentVersions){delete copy.questionContentVersions.L044;delete copy.questionContentVersions.L045;for(let n=2;n<=18;n++)delete copy.questionContentVersions['D'+String(n).padStart(3,'0')];}delete copy.learningDayHistory;delete copy.legacyProvenance;return copy;};assert.deepStrictEqual(withoutMarker(migrated),withoutMarker(original));assert.deepStrictEqual(JSON.parse(migrated.legacyProvenance.original),original);
  const store=storage(JSON.stringify(migrated));let model=new Model(questions,store,'test');
  const reload=()=>{assert(Model.validateBackupState(model.state,questions));assert.deepStrictEqual(Model.prepareBackupState(model.state,questions),model.state);model=new Model(questions,store,'test');assert(!model.storageWriteBlocked);};
  reload();assert.deepStrictEqual(model.state.drafts,{Q:journal,T:table});assert.strictEqual(model.state.attempts.length,0);
  assert(model.clearDraft('Q'));reload();assert.deepStrictEqual(model.state.drafts,{T:table});
  assert(model.setDraft('Q',journal));assert(model.clearDrafts(['Q','T']));reload();assert.deepStrictEqual(model.state.drafts,{});
  assert(model.setDraft('Q',journal));assert(answer(model,'Q',false,1000));model.record('Q',false,1000);reload();assert.deepStrictEqual(model.state.drafts,{});
  const due=model.state.reviewSchedule.Q.dueAt;model.assignReview('Q','R',due-1);assert(model.setDraft('R',journal));
  assert(answer(model,'R',true,due,{mode:'review',reviewSourceId:'Q',stage:0}));assert(model.completeReview('Q',true,due,'R'));reload();assert.deepStrictEqual(model.state.drafts,{});
});
test('draft save failure preserves the saved partial answer and creates no observation',()=>{
  const {model,store}=fresh();assert(model.setDraft('T',{cells:{a:'12',b:null}}));const before=store.value;
  store.setItem=()=>false;assert.strictEqual(model.setDraft('T',{cells:{a:'99',b:''}}),false);assert.strictEqual(store.value,before);
  const restored=new Model(questions,store,'test');assert(!restored.storageWriteBlocked);assert.deepStrictEqual(restored.state.drafts.T,{cells:{a:'12',b:null}});
  assert.strictEqual(restored.state.attempts.length,0);assert.strictEqual(restored.learningEffectivenessForQuestion('T').initialStatus,'unanswered');
});
test('a genuine v5 partial table grade preserves earned points and ratio through migration',()=>{
  const vm=require('vm'),module={exports:{}},data={window:{}};vm.runInNewContext(require('fs').readFileSync('data/questions.js','utf8'),data);
  vm.runInNewContext(require('child_process').execFileSync('git',['show','2cf70526f3cdc18560f151d4d32134a49aef79cb:js/model.js'],{encoding:'utf8'}),{module,console});
  const catalog=data.window.QuestionData,pool=Array.from(data.window.ExamPoolDefinition),id=pool.find(id=>catalog[id].type!=='journal'&&Object.keys(catalog[id].answer.cells).length>1);assert(id);
  const cells=catalog[id].answer.cells,first=Object.keys(cells)[0],answer={cells:{[first]:cells[first]}},grade=require('../js/engine').grade(catalog[id],answer);
  assert.strictEqual(grade.correct,false);assert.strictEqual(grade.earned,1);assert(grade.possible>1);assert.strictEqual(grade.ratio,1/grade.possible);
  const old=new module.exports(catalog,storage(),'test'),ids=[id,...pool.filter(q=>q!==id).slice(0,14)];
  old.state.mode='exam';old.state.examSession={ids,startedAt:100,endAt:2000,status:'RUNNING',evidenceVersion:1,scores:{}};
  assert(old.recordAttempt(id,false,10,first,false,1000,null,'unsure',{mode:'exam',support:'none'}));old.state.examSession.scores[id]={...grade,answer,observationNumber:1};old.save();
  const original=clone(old.state),migrated=Model.prepareBackupState(original,catalog,pool);assert(migrated);assert.deepStrictEqual(migrated.examSession,original.examSession);
  assert.deepStrictEqual(Model.prepareBackupState(migrated,catalog,pool),migrated);const restored=new Model(catalog,storage(JSON.stringify(migrated)),'test',pool);
  assert(!restored.storageWriteBlocked);assert.deepStrictEqual(restored.state.examSession,original.examSession);assert.deepStrictEqual(restored.state.mistakeCounts,{});
});
test('unsigned v2 continuity is corroborated or explicitly unverified, never silently promoted',()=>{
  const module={exports:{}};require('vm').runInNewContext(require('child_process').execFileSync('git',['show','329358667766735b6dc305eb821b97024132fd26:js/model.js'],{encoding:'utf8'}),{module,console});
  const old=new module.exports(questions,storage(),'test'),at=new Date(2026,0,1,12).getTime();old.recordAttempt('Q',true,10,'',false,at);
  const genuine=clone(old.state),good=Model.prepareBackupState(genuine,questions);assert.deepStrictEqual(good.legacyProvenance.pending.activeDays,[]);
  const changed=clone(genuine);changed.learningContinuityState.today.attempts=999;changed.learningContinuityState.today.correctCount=999;
  assert(module.exports.validateBackupState(changed,questions));assert.deepStrictEqual(changed.learningEvidenceIntegrity,genuine.learningEvidenceIntegrity);
  const migrated=Model.prepareBackupState(changed,questions),loaded=fresh(JSON.stringify(migrated)).model;
  assert.strictEqual(loaded.learningContinuity(at).verification.today,'unverified');assert.strictEqual(loaded.learningContinuity(at).verification.activeDays,'unverified');
  assert.strictEqual(loaded.learningContinuity(at).today.attempts,999);assert.deepStrictEqual(JSON.parse(migrated.legacyProvenance.original),changed);
  const next=at+86400000;assert(answer(loaded,'Q',true,next));assert.strictEqual(loaded.learningContinuity(next).today.attempts,1);
  assert.strictEqual(loaded.learningContinuity(next).verification.today,'verified');
});
test('clock rollback retains every recorded day after rolling log eviction and repeated reloads',()=>{
  const store=storage();let model=new Model(questions,store,'test');const days=[3,1,4,2].map(day=>new Date(2026,0,day,12).getTime()),counts=[0,0,0,0];
  for(let i=0;i<420;i++){const day=i%4;assert(answer(model,'Q',i%3===0,days[day]+i));counts[day]++;if(i%17===0)model=new Model(questions,store,'test');}
  assert.strictEqual(model.state.attempts.length,200);model=new Model(questions,store,'test');
  days.forEach((at,i)=>assert.strictEqual(model.learningContinuity(at).today.attempts,counts[i]));assert.strictEqual(model.learningContinuity(Math.max(...days)).currentStreak,4);
});
const priorModel=sha=>{const module={exports:{}};require('vm').runInNewContext(require('child_process').execFileSync('git',['show',sha+':js/model.js'],{encoding:'utf8'}),{module,console});return module.exports;};
test('v1 source review receipts survive eviction without promoting the review target or reviving recovered mistakes',()=>{
  const Old=priorModel('ed21218967958e42e67ba9aafe9c333a5bbccc55'),old=new Old(questions,storage(),'test');
  assert(answer(old,'Q',false,1000));old.record('Q',false,1000);
  for(let i=0;i<4;i++){
    const due=old.state.reviewSchedule.Q.dueAt,stage=old.state.reviewSchedule.Q.stage;
    old.assignReview('Q','R',due-1);assert(answer(old,'R',true,due,{mode:'review',reviewSourceId:'Q',stage}));assert(old.completeReview('Q',true,due,'R'));
  }
  assert(!old.state.incorrectIds.includes('Q'));
  for(let i=0;i<201;i++)assert(answer(old,'T',true,old.state.lastLearningAt+1,{mode:'training'}));
  old.state.answeredIds=[];old.state.correctIds=[];old.save();const original=clone(old.state);
  const migrated=Model.prepareBackupState(original,questions);assert(migrated);
  assert(migrated.correctIds.includes('Q'));assert(!migrated.correctIds.includes('R'));assert(!migrated.incorrectIds.includes('Q'));
  const {model}=fresh(JSON.stringify(migrated));assert(model.verifiedCorrectIds().includes('Q'));assert.deepStrictEqual(model.state.mistakeCounts,original.mistakeCounts);
  assert.deepStrictEqual(JSON.parse(model.state.legacyProvenance.original),original);assert.deepStrictEqual(Model.prepareBackupState(model.state,questions),model.state);
});
test('v1 unknown and exam-only flags remain visible candidates until current completion',()=>{
  const Old=priorModel('ed21218967958e42e67ba9aafe9c333a5bbccc55'),old=new Old(questions,storage(),'test');
  old.state.learningEffectiveness.initialHistory='unknown';old.state.correctIds=['T'];old.state.answeredIds=['T'];old.save();
  assert(answer(old,'Q',true,1000,{mode:'exam'}));old.record('Q',true,1000);const original=clone(old.state);
  const migrated=Model.prepareBackupState(original,questions);assert(migrated);const {model}=fresh(JSON.stringify(migrated));
  assert.deepStrictEqual(model.state.correctIds,original.correctIds);assert.deepStrictEqual(model.verifiedCorrectIds(),[]);
  for(const id of ['Q','T'])assert(model.isUnverified('correctIds',id));
  assert(answer(model,'Q',false,2000,{mode:'training'}));model.record('Q',false,2000);assert(model.isUnverified('correctIds','Q'));
  assert(answer(model,'Q',true,3000,{mode:'training'}));model.record('Q',true,3000);assert(!model.isUnverified('correctIds','Q'));assert(model.isUnverified('correctIds','T'));
  assert.deepStrictEqual(model.verifiedCorrectIds(),['Q']);assert.deepStrictEqual(JSON.parse(model.state.legacyProvenance.original),original);
  assert.deepStrictEqual(Model.prepareBackupState(model.state,questions),model.state);
});
test('earlier v10 preview repairs v1 omission without replacing progress earned after migration',()=>{
  const Old=priorModel('ed21218967958e42e67ba9aafe9c333a5bbccc55'),Preview=priorModel('05c147e0edf15f4441e18fed54ea396c7b3d8c4c'),old=new Old(questions,storage(),'test');
  assert(answer(old,'Q',true,1000));old.record('Q',true,1000);old.state.correctIds=[];old.state.answeredIds=[];old.save();
  const original=clone(old.state),previewStore=storage(JSON.stringify(original)),preview=new Preview(questions,previewStore,'test');
  assert(!preview.state.correctIds.includes('Q'));assert(answer(preview,'T',true,2000,{mode:'training'}));preview.record('T',true,2000);
  const before=clone(preview.state),model=new Model(questions,previewStore,'test');assert(!model.storageWriteBlocked);
  assert.deepStrictEqual(model.verifiedCorrectIds().sort(),['Q','T']);assert.deepStrictEqual(model.state.learningEffectiveness,before.learningEffectiveness);
  assert.deepStrictEqual(model.state.questionStats,before.questionStats);assert.strictEqual(model.state.legacyProvenance.original,before.legacyProvenance.original);
  const repeated=new Model(questions,previewStore,'test');assert.deepStrictEqual(repeated.state,model.state);assert.deepStrictEqual(Model.prepareBackupState(model.state,questions),model.state);
});
test('earlier v10 migration does not authenticate flags synthesized from unsigned pre-marker attempts',()=>{
  const Legacy=priorModel('81088e2ad3bc96a6ff5bd995e6dfcfb58a4fd62f'),Preview=priorModel('05c147e0edf15f4441e18fed54ea396c7b3d8c4c');
  const old=new Legacy(questions,storage(),'test');old.recordAttempt('Q',true,10,'',false,1000);delete old.state.correctIds;
  const store=storage(JSON.stringify(old.state)),preview=new Preview(questions,store,'test');assert(preview.state.correctIds.includes('Q'));
  const original=preview.state.legacyProvenance.original,model=new Model(questions,store,'test');assert(!model.storageWriteBlocked);
  assert(model.state.correctIds.includes('Q'));assert(model.isUnverified('correctIds','Q'));assert(!model.verifiedCorrectIds().includes('Q'));
  assert.strictEqual(model.state.legacyProvenance.original,original);
});
test('earlier v10 preserves retained finalized exam success when the latest observation is unfinished',()=>{
  const data={window:{}};require('vm').runInNewContext(require('fs').readFileSync('data/questions.js','utf8'),data);const catalog=data.window.QuestionData;
  const Old=priorModel('ed21218967958e42e67ba9aafe9c333a5bbccc55'),Preview=priorModel('05c147e0edf15f4441e18fed54ea396c7b3d8c4c');
  const id=canonicalPool.find(q=>catalog[q].type==='journal'),ids=[id,...canonicalPool.filter(q=>q!==id).slice(0,14)];
  const old=new Old(catalog,storage(),'test',canonicalPool);old.state.learningEffectiveness.initialHistory='unknown';old.state.correctIds=[id];old.refreshEvidenceIntegrity();
  const store={data:{test:JSON.stringify(old.state)},getItem(key){return this.data[key]??null;},setItem(key,value){this.data[key]=value;return true;},removeItem(key){delete this.data[key];return true;}};
  const preview=new Preview(catalog,store,'test',canonicalPool);
  for(const [startedAt,correct] of [[100,true],[3000,false]]){
    preview.state.examSession={ids,startedAt,endAt:startedAt+10000,status:'RUNNING',evidenceVersion:1,scores:{}};
    assert(answer(preview,id,correct,startedAt+500,{mode:'exam'}));
    preview.state.examSession.scores[id]={correct,earned:correct?1:0,possible:1,ratio:correct?1:0,observationNumber:preview.state.learningEffectiveness.questions[id].observedAttempts};
    if(correct){
      // Use the actual finalizer: history alone lacks the session identity, and
      // one answered question does not produce the synthetic 100-point result.
      const sandbox={window:{ProgressModel:Preview,RPGModel:require('../js/rpg')},console};
      require('vm').runInNewContext(require('child_process').execFileSync('git',['show','05c147e0edf15f4441e18fed54ea396c7b3d8c4c:js/controller.js'],{encoding:'utf8'}),sandbox);
      const ctx=Object.create(sandbox.window.AppController.prototype),node=()=>({focus(){},classList:{remove(){}}});
      Object.assign(ctx,{model:preview,rpg:new sandbox.window.RPGModel(preview.storage,'r'),questions:catalog,unansweredExamIds:()=>ids.slice(1),stopExamTimer(){},view:{examResult(){},show(){},showNotice(){}},document:{body:node(),getElementById:node}});
      preview.refreshEvidenceIntegrity();preview.save();assert(Preview.validateBackupState(preview.state,catalog,canonicalPool));
      assert(ctx.finishExam(true,startedAt+1000));
    }
    preview.refreshEvidenceIntegrity();preview.save();
  }
  assert(Preview.validateBackupState(preview.state,catalog,canonicalPool));
  const model=new Model(catalog,store,'test',canonicalPool);assert(!model.storageWriteBlocked);assert(model.verifiedCorrectIds().includes(id));
  assert.deepStrictEqual(model.state.examHistory,clone(preview.state.examHistory));assert.deepStrictEqual(Model.prepareBackupState(model.state,catalog,canonicalPool),model.state);
});
test('v7 abandoned wrong exam does not become a finalized mistake through a later timeout',()=>{
  const data={window:{}};require('vm').runInNewContext(require('fs').readFileSync('data/questions.js','utf8'),data);const catalog=data.window.QuestionData;
  const Old=priorModel('86135e34047c7356aa2a020d5221ca14f205c4d9'),id=canonicalPool.find(q=>catalog[q].type==='journal'),ids=[id,...canonicalPool.filter(q=>q!==id).slice(0,14)];
  for(const late of [0,5000]){
    const old=new Old(catalog,storage(),'test',canonicalPool);old.state.mode='exam';
    old.state.examSession={ids,startedAt:100,endAt:3600100,status:'RUNNING',evidenceVersion:1,scores:{}};
    assert(answer(old,id,false,500,{mode:'exam'}));
    old.state.examSession=null;old.state.examAttempt=1;
    old.state.examHistory=[{finishedAt:3610000+late,durationMs:3600000,setSignature:ids.join('|'),points:0}];old.refreshEvidenceIntegrity();old.save();
    const original=clone(old.state);assert(Old.validateBackupState(original,catalog,canonicalPool));assert.deepStrictEqual(original.mistakeCounts,{});
    const migrated=Model.prepareBackupState(original,catalog,canonicalPool);assert(migrated,'genuine abandoned answer was rejected as a completed mistake');
    assert.deepStrictEqual(migrated.mistakeCounts,{});assert.deepStrictEqual(JSON.parse(migrated.legacyProvenance.original),original);
    const store=storage(JSON.stringify(migrated)),model=new Model(catalog,store,'test',canonicalPool);assert(!model.storageWriteBlocked);
    assert.deepStrictEqual(Model.prepareBackupState(model.state,catalog,canonicalPool),model.state);
  }
});
const previewExamFixture=(previewSha,originalIds)=>{
  const vm=require('vm'),fs=require('fs'),cp=require('child_process'),data={window:{}};vm.runInNewContext(fs.readFileSync('data/questions.js','utf8'),data);const catalog=data.window.QuestionData;
  const Old=priorModel('ed21218967958e42e67ba9aafe9c333a5bbccc55'),Preview=priorModel(previewSha),old=new Old(catalog,storage(),'test',canonicalPool);
  old.state.learningEffectiveness.initialHistory='unknown';old.state.correctIds=originalIds;old.refreshEvidenceIntegrity();
  const store={data:{test:JSON.stringify(old.state)},getItem(key){return this.data[key]??null;},setItem(key,value){this.data[key]=value;return true;},removeItem(key){delete this.data[key];return true;}};
  const preview=new Preview(catalog,store,'test',canonicalPool),sandbox={window:{ProgressModel:Preview,RPGModel:require('../js/rpg')},console};
  vm.runInNewContext(cp.execFileSync('git',['show',previewSha+':js/controller.js'],{encoding:'utf8'}),sandbox);const rpg=new sandbox.window.RPGModel(store,'r');
  const finish=(id,answerValue,startedAt,index=0)=>{
    const ids=canonicalPool.filter(q=>q!==id&&catalog[q].category!==catalog[id].category).slice(0,14);ids.splice(index,0,id);
    preview.state.mode='exam';preview.state.examSession={ids,startedAt,endAt:startedAt+3600000,status:'RUNNING',evidenceVersion:1,scores:{}};
    const grade=require('../js/engine').grade(catalog[id],answerValue);assert(answer(preview,id,grade.correct,startedAt+500,{mode:'exam'}));
    preview.state.examSession.scores[id]={...grade,answer:answerValue,observationNumber:preview.state.learningEffectiveness.questions[id].observedAttempts};preview.refreshEvidenceIntegrity();preview.save();
    const ctx=Object.create(sandbox.window.AppController.prototype),node=()=>({focus(){},classList:{remove(){}}});
    Object.assign(ctx,{model:preview,rpg,questions:catalog,unansweredExamIds:()=>ids.filter(q=>q!==id),stopExamTimer(){},view:{examResult(){},show(){},showNotice(){}},document:{body:node(),getElementById:node}});
    assert(ctx.finishExam(true,startedAt+3600000+5000));return grade;
  };
  return {catalog,store,preview,finish};
};
test('rounded full topic points cannot authenticate an incorrect partial answer',()=>{
  const {catalog,store,preview,finish}=previewExamFixture('cfaeb11e13cb5ae2f9980bcecce1af6b7bbca306',['L034']);
  const value=clone(catalog.L034.answer),key=Object.keys(value.cells).find(key=>value.cells[key]!==0);delete value.cells[key];
  const grade=finish('L034',value,10000,5);assert.strictEqual(grade.correct,false);assert.strictEqual(grade.earned,13);assert.strictEqual(grade.possible,14);
  const topic=preview.state.examHistory[0].topicScores[catalog.L034.category];assert.strictEqual(topic.earned,5);assert.strictEqual(topic.possible,5);
  finish('J129',catalog.J129.answer,4000000);const before=clone(preview.state),rewards=store.getItem('r'),model=new Model(catalog,store,'test',canonicalPool);
  assert(!model.storageWriteBlocked);assert(model.state.correctIds.includes('L034'));assert(model.isUnverified('correctIds','L034'));assert(!model.verifiedCorrectIds().includes('L034'));
  assert.deepStrictEqual(model.state.examHistory,before.examHistory);assert.strictEqual(store.getItem('r'),rewards);assert.deepStrictEqual(Model.prepareBackupState(model.state,catalog,canonicalPool),model.state);
});
test('safe v2 progression retains current earlier exam approvals even without a rounding proof',()=>{
  const {catalog,store,preview,finish}=previewExamFixture('7be2a034db8c2308c14c3faefe89eb1fe04534ea',['L034','J129']);
  assert.strictEqual(preview.state.legacyProvenance.progressionVersion,2);
  finish('L034',catalog.L034.answer,10000,5);finish('J129',catalog.J129.answer,4000000);
  const before=clone(preview.state),rewards=store.getItem('r'),model=new Model(catalog,store,'test',canonicalPool);assert(!model.storageWriteBlocked);
  assert.deepStrictEqual(model.verifiedCorrectIds().sort(),['J129','L034']);assert.deepStrictEqual(model.state.examHistory,before.examHistory);
  assert.strictEqual(model.state.legacyProvenance.original,before.legacyProvenance.original);assert.strictEqual(store.getItem('r'),rewards);
  assert.deepStrictEqual(Model.prepareBackupState(model.state,catalog,canonicalPool),model.state);assert.deepStrictEqual(new Model(catalog,store,'test',canonicalPool).state,model.state);
});
test('unsigned original topic totals remain unverified after both preview migrations',()=>{
  const {catalog,store,preview}=previewExamFixture('cfaeb11e13cb5ae2f9980bcecce1af6b7bbca306',['J128']);
  const original=JSON.parse(preview.state.legacyProvenance.original),ids=['J128',...canonicalPool.filter(id=>id!=='J128'&&catalog[id].category!==catalog.J128.category).slice(0,14)];
  original.examHistory=[{finishedAt:1000,durationMs:1000,points:9,unansweredCount:14,setSignature:ids.sort().join('|'),topicScores:{[catalog.J128.category]:{earned:9,possible:9}}}];
  const Old=priorModel('ed21218967958e42e67ba9aafe9c333a5bbccc55');assert(Old.validateBackupState(original,catalog,canonicalPool));
  store.setItem('test',JSON.stringify(original));const Preview=priorModel('cfaeb11e13cb5ae2f9980bcecce1af6b7bbca306');new Preview(catalog,store,'test',canonicalPool);
  const model=new Model(catalog,store,'test',canonicalPool);assert(!model.storageWriteBlocked);assert(model.isUnverified('correctIds','J128'));
  assert.deepStrictEqual(model.verifiedCorrectIds(),[]);assert.deepStrictEqual(model.verifiedExamHistory(),[]);assert.deepStrictEqual(JSON.parse(model.state.legacyProvenance.original),original);
});
test('an unsigned legacy advanced review schedule cannot authenticate progression',()=>{
  const {catalog,store,preview}=previewExamFixture('cfaeb11e13cb5ae2f9980bcecce1af6b7bbca306',['J128']);
  const original=JSON.parse(preview.state.legacyProvenance.original);
  original.reviewSchedule.J128={stage:3,dueAt:1000};
  const Old=priorModel('ed21218967958e42e67ba9aafe9c333a5bbccc55');assert(Old.validateBackupState(original,catalog,canonicalPool));
  store.setItem('test',JSON.stringify(original));const Preview=priorModel('cfaeb11e13cb5ae2f9980bcecce1af6b7bbca306');new Preview(catalog,store,'test',canonicalPool);
  const model=new Model(catalog,store,'test',canonicalPool);assert(!model.storageWriteBlocked);
  assert(model.isUnverified('reviewSchedule','J128'));assert(model.isUnverified('correctIds','J128'));
  assert.deepStrictEqual(model.verifiedCorrectIds(),[]);assert.deepStrictEqual(JSON.parse(model.state.legacyProvenance.original),original);
});
console.log(`LEARNING_EFFECTIVENESS ${passed}/${passed+failed} PASS; ${failed} FAIL`);
if(failed)process.exitCode=1;
