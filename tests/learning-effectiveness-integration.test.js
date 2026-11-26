'use strict';
const assert = require('assert'), fs = require('fs'), vm = require('vm');
const Model = require('../js/model'), RPG = require('../js/rpg');
const {fixture, questions:canonical, storage:legacyStorage} = require('./helpers/issue207-fixtures');
const clone = value => JSON.parse(JSON.stringify(value));
const canonicalPool=(()=>{const s={window:{}};vm.runInNewContext(fs.readFileSync('data/questions.js','utf8'),s);return Array.from(s.window.ExamPoolDefinition);})();
const questions = { ...Object.fromEntries(Array.from({length:13},(_,i)=>['E'+i,{id:'E'+i,type:'journal',category:'仕訳',difficulty:1}])), Q:{id:'Q',type:'journal',category:'仕訳',difficulty:1}, R:{id:'R',type:'journal',category:'仕訳',difficulty:1} };
const values = () => ({data:{},getItem(key){return this.data[key] ?? null;},setItem(key,value){this.data[key]=value;return true;},removeItem(key){delete this.data[key];return true;}});
let reloads=0;
const sandbox={window:{ProgressModel:Model,RPGModel:RPG,GradingEngine:{grade:(_q,answer)=>({correct:answer.correct,earned:answer.correct?1:0,possible:1,ratio:answer.correct?1:0})},location:{reload(){reloads++;}}},console};
vm.runInNewContext(fs.readFileSync('js/controller.js','utf8'),sandbox);
const Controller=sandbox.window.AppController;
function context(mode='training') {
  const store=values(),model=new Model(questions,store,'p',Object.keys(questions)),rpg=new RPG(store,'r'),notices=[];
  const node=()=>({hidden:false,focus(){},append(){},replaceChildren(){},classList:{add(){},remove(){}}});
  const ctx=Object.create(Controller.prototype);
  Object.assign(ctx,{questions,ids:Object.keys(questions),model,rpg,reviewMappings:new Map(),
    document:{getElementById:()=>node(),createElement:()=>node(),querySelector:()=>null,querySelectorAll:()=>[]},
    view:{readAnswer:()=>({correct:true,debit:[],credit:[]}),result(){},updateRpg(){},renderQuestion(){},show(){},showNotice(text){notices.push(text);}},
    resetCalculator(){},renderModes(){},showMode(){},displayMode(){},updateExamStatus(){},isExamExpired:()=>false,modeIds:()=>['Q','R'],unansweredExamIds:()=>[]});
  model.state.mode=mode;if(mode==='exam'){ctx.buildExamIds=()=>Object.keys(questions);ctx.ensureExamSession();}ctx.start('Q');return {ctx,store,model,rpg,notices};
}
let passed=0,failed=0;
function test(name,fn){try{fn();passed++;console.log('PASS '+name);}catch(error){failed++;console.error('FAIL '+name+'\n'+error.stack);}}

test('controller captures observation receipt and actual hint support',()=>{
  const {ctx,model}=context();ctx.learningFlow.hintStage=2;ctx.submit();
  assert.deepStrictEqual(model.learningEffectivenessForQuestion('Q').firstAttempt,{correct:true,at:model.state.attempts[0].timestamp,mode:'training',support:'hint-2'});
  assert.strictEqual(ctx.learningObservationNumber,1);assert.strictEqual(model.state.attempts[0].observationNumber,1);
});
test('replayed initial submit cannot add accuracy, mastery or RPG rewards',()=>{
  const {ctx,model,rpg}=context();ctx.submit();const progress=JSON.stringify(model.state),character=JSON.stringify(rpg.state);
  ctx.learningFlow.phase='I';ctx.submitting=false;assert.strictEqual(ctx.submit(),false);
  assert.strictEqual(JSON.stringify(model.state),progress);assert.strictEqual(JSON.stringify(rpg.state),character);
});
test('failed persistence stops scoring side effects and retains a retryable receipt',()=>{
  const {ctx,store,model,rpg,notices}=context(),state=JSON.stringify(model.state),character=JSON.stringify(rpg.state),set=store.setItem;
  const bytes=JSON.stringify(store.data);store.setItem=()=>false;
  assert.strictEqual(ctx.submit(),false);assert.strictEqual(JSON.stringify(model.state),state);assert.strictEqual(JSON.stringify(rpg.state),character);
  assert.strictEqual(JSON.stringify(store.data),bytes);assert.strictEqual(ctx.submitting,false);assert(notices.length);
  store.setItem=set;ctx.submit();assert.strictEqual(model.questionAccuracy('Q').attempts,1);assert.strictEqual(model.learningEffectivenessForQuestion('Q').observedAttempts,1);
});
test('partial answer writes roll back finalization and rewards before any result',()=>{
  for(const mode of ['story','training','review','exam']){
    const {ctx,model,rpg,store}=context(mode);
    if(mode==='review'){const now=Date.now();model.state.reviewSchedule.Q={stage:0,dueAt:now-1};model.assignReview('Q','Q',now-1);ctx.start('Q');}
    if(mode==='exam')model.state.examSession.scores={};
    model.save();rpg.save();const before=clone(model.state),character=clone(rpg.state),bytes=clone(store.data),set=store.setItem;let writes=0;
    store.setItem=function(key,value){writes++;if(writes===2)return false;return set.call(this,key,value);};
    assert.strictEqual(ctx.submit(),false,mode);assert.deepStrictEqual(clone(model.state),before);assert.deepStrictEqual(clone(rpg.state),character);
    assert.strictEqual(store.data.p,bytes.p);assert.strictEqual(store.data.r,bytes.r);assert.strictEqual(ctx.submitting,false);
    store.setItem=set;ctx.submit();assert.strictEqual(model.learningEffectivenessForQuestion('Q').observedAttempts,1);
    assert(mode==='exam'||model.state.answeredIds.includes('Q'));
  }
});
test('each transaction write and commit failure restores both saved keys',()=>{
  for(const failure of [1,2,3,4]){
    const {ctx,model,rpg,store}=context();model.save();rpg.save();const before=clone(model.state),character=clone(rpg.state),bytes=clone(store.data);
    const set=store.setItem,remove=store.removeItem;let calls=0;
    store.setItem=function(k,v){if(++calls===failure)return false;return set.call(this,k,v);};
    store.removeItem=function(k){if(++calls===failure)return false;return remove.call(this,k);};
    assert.strictEqual(ctx.submit(),false,'failure '+failure);assert.deepStrictEqual(clone(model.state),before);assert.deepStrictEqual(clone(rpg.state),character);
    assert.deepStrictEqual(store.data,bytes);assert.strictEqual(ctx.learningFlow.phase,'I');
  }
});
test('persistent rollback failure is recovered before the next launch loads progress and rewards',()=>{
  const {ctx,model,rpg,store}=context();model.save();rpg.save();const bytes=clone(store.data),set=store.setItem;let calls=0;
  store.setItem=function(k,v){if(++calls>=3)return false;return set.call(this,k,v);};
  assert.strictEqual(ctx.submit(),false);assert.strictEqual(model.storageWriteBlocked,true);assert(store.data['p:pending-answer-v1']);
  assert.strictEqual(JSON.parse(store.data.p).learningEffectiveness.questions.Q.observedAttempts,1,'partial physical write exists only behind the pending journal');
  store.setItem=set;assert(Controller.recoverAnswerTransaction(store,'p','r'));assert.deepStrictEqual(store.data,bytes);
  ctx.model=new Model(questions,store,'p',Object.keys(questions));ctx.rpg=new RPG(store,'r');ctx.start('Q');ctx.submit();
  assert.strictEqual(ctx.model.learningEffectivenessForQuestion('Q').observedAttempts,1);assert.strictEqual(ctx.rpg.state.mastery['仕訳'].possible,1);
  assert.strictEqual(store.data['p:pending-answer-v1'],undefined);
});
test('a corrupted pending before-image cannot overwrite the original saved pair',()=>{
  const {ctx,model,rpg,store}=context();model.save();rpg.save();const set=store.setItem;let calls=0;
  store.setItem=function(k,v){if(++calls>=3)return false;return set.call(this,k,v);};ctx.submit();store.setItem=set;
  const journal=JSON.parse(store.data['p:pending-answer-v1']);journal.progress='{}';store.data['p:pending-answer-v1']=JSON.stringify(journal);const before=clone(store.data);
  assert.strictEqual(Controller.recoverAnswerTransaction(store,'p','r'),false);assert.deepStrictEqual(store.data,before);
});
test('invalid or unreadable transaction journals cannot overwrite saved data',()=>{
  const {store}=context();store.data['p:pending-answer-v1']='{bad';const before=clone(store.data);
  assert.strictEqual(Controller.recoverAnswerTransaction(store,'p','r'),false);assert.deepStrictEqual(store.data,before);
  assert.strictEqual(Controller.recoverAnswerTransaction({getItem(){throw Error('unreadable');},setItem(){throw Error('must not write');}},'p','r'),false);
});
test('exam finalization commits history, mastery and rewards once after a failed write',()=>{
  const {ctx,store}=context('exam'),model=new Model(canonical,values(),'p',canonicalPool),ids=canonicalPool.slice(0,15),now=Date.now(),rpg=new RPG(model.storage,'r');
  ctx.model=model;ctx.rpg=rpg;ctx.questions=canonical;ctx.stopExamTimer=()=>{};let results=0;ctx.view.examResult=()=>{results++;};
  model.state.mode='exam';model.state.examSession={ids,startedAt:now-1000,endAt:now+100000,status:'RUNNING',scores:{}};
  assert(model.recordAttempt(ids[0],true,10,'',false,now,null,'unsure',{mode:'exam',support:'none'}));
  model.state.examSession.scores[ids[0]]={correct:true,earned:1,possible:1,ratio:1,answer:{correct:true},observationNumber:1};
  ctx.unansweredExamIds=()=>ids.slice(1);model.refreshEvidenceIntegrity();model.save();rpg.save();const progress=clone(model.state),character=clone(rpg.state),saved=clone(model.storage.data),set=model.storage.setItem;let calls=0;
  model.storage.setItem=function(k,v){if(++calls===3)return false;return set.call(this,k,v);};
  assert.strictEqual(ctx.finishExam(true,now),false);assert.deepStrictEqual(clone(model.state),progress);assert.deepStrictEqual(clone(rpg.state),character);assert.deepStrictEqual(model.storage.data,saved);assert.strictEqual(results,0);
  model.storage.setItem=set;assert.strictEqual(ctx.finishExam(true,now),true);assert.strictEqual(model.state.examAttempt,1);assert.strictEqual(model.state.examHistory.length,1);
  assert.strictEqual(model.learningEffectivenessForQuestion(ids[0]).observedAttempts,1);assert.strictEqual(rpg.state.mastery[canonical[ids[0]].category].possible,1);assert.strictEqual(rpg.state.xp,20*canonical[ids[0]].difficulty);
  assert.strictEqual(ctx.finishExam(true,now),false);assert.strictEqual(results,1);assert(Model.validateBackupState(model.state,canonical,canonicalPool));
});
test('Accepted isolated negative NPV keeps its existing reward behavior when progress commits',()=>{
  const {ctx}=context(),q=require('./fixtures/foundation-extension-cases').npvNegative, catalog={[q.id]:q},store=values();
  ctx.questions=catalog;ctx.model=new Model(catalog,store,'p');ctx.rpg=new RPG(store,'r');ctx.model.state.mode='training';
  ctx.view.readAnswer=()=>({...clone(q.answer),correct:true});ctx.start(q.id);
  assert.notStrictEqual(ctx.submit(),false);assert.strictEqual(ctx.model.learningEffectivenessForQuestion(q.id).correctCount,1);
  assert.strictEqual(ctx.rpg.state.totalTransactionAmount,-5870);assert(ctx.rpg.state.rewardedIds.includes(q.id));
  assert(Model.validateBackupState(ctx.model.state,catalog));
  assert(RPG.validateBackupState(ctx.rpg.state),'the actual signed reward result must be restorable');
  assert.deepStrictEqual(new RPG(store,'r').state,ctx.rpg.state,'reload retains signed totals and every earned reward');
});
test('a staged invalid exam outcome cannot commit progress or RPG side effects',()=>{
  const {ctx}=context('exam'),ids=canonicalPool.slice(0,15),store=values(),model=new Model(canonical,store,'p',canonicalPool),rpg=new RPG(store,'r'),now=Date.now();
  ctx.model=model;ctx.rpg=rpg;ctx.questions=canonical;ctx.stopExamTimer=()=>{};ctx.view.examResult=()=>{throw Error('must not display an invalid result');};ctx.unansweredExamIds=()=>ids.slice(1);
  model.state.mode='exam';model.state.examSession={ids,startedAt:now-1000,endAt:now+1000,status:'RUNNING',scores:{[ids[0]]:{correct:true,earned:1,possible:1,ratio:1}}};
  model.save();rpg.save();const progress=clone(model.state),character=clone(rpg.state),bytes=clone(store.data);
  assert.strictEqual(ctx.finishExam(true,now),false);assert.deepStrictEqual(clone(model.state),progress);assert.deepStrictEqual(clone(rpg.state),character);assert.deepStrictEqual(store.data,bytes);
});
test('coaching only persists assisted recovery and remains idempotent',()=>{
  const {ctx,model,rpg}=context();ctx.view.readAnswer=()=>({correct:false,debit:[],credit:[]});ctx.submit();
  const stats=clone(model.state.questionStats),rows=clone(model.state.attempts),character=JSON.stringify(rpg.state);
  ctx.learningFlow.phase='R';ctx.submitting=false;ctx.view.readAnswer=()=>({correct:true});ctx.submit();
  const error=model.learningEffectivenessForQuestion('Q').misconceptionStats['journal-entry'];
  assert.strictEqual(error.assistedRecoveredCount,1);assert.strictEqual(error.recoveredCount,0);
  assert.deepStrictEqual(model.state.questionStats,stats);assert.deepStrictEqual(model.state.attempts,rows);assert.strictEqual(JSON.stringify(rpg.state),character);
  ctx.submit();assert.strictEqual(model.learningEffectivenessForQuestion('Q').misconceptionStats['journal-entry'].assistedRecoveredCount,1);
});
test('failed coaching persistence cannot report saved recovery or consume the retry',()=>{
  const {ctx,model,store}=context();ctx.view.readAnswer=()=>({correct:false,debit:[],credit:[]});ctx.submit();
  const before=JSON.stringify(model.state),set=store.setItem;ctx.learningFlow.phase='R';ctx.submitting=false;ctx.view.readAnswer=()=>({correct:true});store.setItem=()=>false;
  assert.strictEqual(ctx.submit(),false);assert.strictEqual(ctx.learningFlow.phase,'R');assert.strictEqual(JSON.stringify(model.state),before);
  store.setItem=set;ctx.submit();assert.strictEqual(model.learningEffectivenessForQuestion('Q').misconceptionStats['journal-entry'].assistedRecoveredCount,1);
});
test('controller supplies due source and keeps review target statistics separate',()=>{
  const {ctx,model}=context('review'),now=Date.now();model.state.reviewSchedule.Q={stage:2,dueAt:now-100};model.assignReview('Q','R',now-100);
  ctx.reviewMappings.set('R',{sourceQuestionId:'Q'});ctx.start('R');ctx.submit();
  const source=model.learningEffectivenessForQuestion('Q'),target=model.learningEffectivenessForQuestion('R');
  assert.strictEqual(source.observedAttempts,0);assert.strictEqual(source.delayedReview.successes,1);assert.strictEqual(source.delayedReview.highestConfirmedStage,3);
  assert.strictEqual(target.firstAttempt.mode,'review');assert.strictEqual(target.observedAttempts,1);
});
test('exam submitted blank is wrong; unsubmitted and expired items add no observation',()=>{
  const {ctx,model}=context('exam');model.state.examSession.scores={};ctx.view.readAnswer=()=>({correct:false,debit:[],credit:[]});ctx.submit();
  assert.strictEqual(model.learningEffectivenessForQuestion('Q').firstAttempt.correct,false);assert.strictEqual(model.learningEffectivenessForQuestion('Q').firstAttempt.mode,'exam');
  assert.strictEqual(model.learningEffectivenessForQuestion('R').observedAttempts,0);
  const before=clone(model.state.learningEffectiveness);ctx.submitting=false;ctx.isExamExpired=()=>true;ctx.finishExam=()=>{};ctx.submit();assert.deepStrictEqual(model.state.learningEffectiveness,before);
});
test('deadline reached during grading cannot leave a recorded unanswered exam item',()=>{
  const {ctx,model}=context('exam');model.state.examSession.scores={};let checks=0,finished=0;
  ctx.isExamExpired=()=>++checks>=3;ctx.finishExam=()=>{finished++;};ctx.submit();
  assert.strictEqual(finished,1);assert.strictEqual(model.learningEffectivenessForQuestion('Q').observedAttempts,0);
  assert.strictEqual(model.state.attempts.length,0);assert.deepStrictEqual(model.state.examSession.scores,{});
});
for(const id of ['J051','L031'])for(const kind of ['old','new','mixed'])test(`Accepted #207 ${id}/${kind} keeps archived history and unknown initial coverage`,()=>{
  const initial=fixture(kind,id),store=legacyStorage(JSON.stringify(initial));let model=new Model(canonical,store,'p',canonicalPool);
  const archive=clone(model.state.contentMigrationArchive),continuity=clone(model.state.learningContinuityState);
  assert.strictEqual(model.learningEffectivenessForQuestion(id).initialStatus,'unknown');assert.strictEqual(model.learningEffectivenessForQuestion(id).observedAttempts,0);
  assert(model.recordAttempt(id,true,10,'',false,Date.now(),null,'unsure',{support:'none'}));
  model=new Model(canonical,store,'p',canonicalPool);assert.deepStrictEqual(model.state.contentMigrationArchive,archive);assert.strictEqual(model.learningEffectivenessForQuestion(id).firstAttempt,null);
  assert.strictEqual(model.learningEffectivenessForQuestion(id).observedAttempts,1);assert(model.state.learningContinuityState.activeDayKeys.length>=continuity.activeDayKeys.length);
  assert(Model.validateBackupState(model.state,canonical,canonicalPool));
});
test('revision 1–3 cannot attach current evidence to pre-identity content',()=>{
  const current=new Model(canonical,legacyStorage(),'p');assert(current.recordAttempt('J051',false,10,'journal-entry',false,Date.now()));
  for(const revision of [1,2,3])for(const initialHistory of ['complete','unknown']){
    const mixed=fixture('old','J051');mixed.contentRevision=revision;
    mixed.learningEffectiveness=clone(current.state.learningEffectiveness);mixed.learningEffectiveness.initialHistory=initialHistory;
    if(initialHistory==='unknown')mixed.learningEffectiveness.questions.J051.firstAttempt=null;
    assert.strictEqual(Model.validateBackupState(mixed,canonical,canonicalPool),false);assert.strictEqual(Model.prepareBackupState(mixed,canonical,canonicalPool),null);
    const bytes=JSON.stringify(mixed),store=legacyStorage(bytes),loaded=new Model(canonical,store,'p',canonicalPool);
    assert.strictEqual(loaded.save(),false);assert.strictEqual(store.value,bytes);
  }
});
for(const key of ['xp','sureCorrect','sureWrong','unsureCorrect','unsureWrong'])test(`accepted safe-integer ${key} boundary cannot overflow on answer`,()=>{
    const {ctx,model,rpg,store}=context();const correct=!key.endsWith('Wrong'),sure=key.startsWith('sure');
    if(key==='xp')rpg.state.xp=Number.MAX_SAFE_INTEGER;else rpg.state.confidenceOutcomes[key]=Number.MAX_SAFE_INTEGER;
    assert(RPG.validateBackupState(rpg.state),'the starting character is a valid backup');
    model.save();rpg.save();ctx.rpg=new RPG(store,'r');assert.deepStrictEqual(ctx.rpg.state,rpg.state);
    ctx.view.readAnswer=()=>({correct,debit:[],credit:[]});ctx.document.querySelector=()=>({value:sure?'sure':'unsure'});
    const before=clone(model.state),character=clone(ctx.rpg.state),bytes=clone(store.data);
    assert.strictEqual(ctx.submit(),false,key);assert.deepStrictEqual(clone(model.state),before);assert.deepStrictEqual(clone(ctx.rpg.state),character);
    assert.deepStrictEqual(store.data,bytes);assert.deepStrictEqual(new RPG(store,'r').state,character);assert.strictEqual(ctx.learningFlow.phase,'I');
});
test('the last safe XP and confidence increments still commit exactly once',()=>{
  const {ctx,model,rpg,store}=context();rpg.state.xp=Number.MAX_SAFE_INTEGER-20;rpg.state.confidenceOutcomes.unsureCorrect=Number.MAX_SAFE_INTEGER-1;
  model.save();rpg.save();assert.notStrictEqual(ctx.submit(),false);assert.strictEqual(rpg.state.xp,Number.MAX_SAFE_INTEGER);assert.strictEqual(rpg.state.confidenceOutcomes.unsureCorrect,Number.MAX_SAFE_INTEGER);
  assert.deepStrictEqual(new RPG(store,'r').state,rpg.state);const bytes=clone(store.data);ctx.learningFlow.phase='I';ctx.submitting=false;
  assert.strictEqual(ctx.submit(),false);assert.deepStrictEqual(store.data,bytes);
});
test('finite imported mastery cannot become an infinite staged total',()=>{
  const {ctx,model,rpg,store}=context();rpg.state.mastery['仕訳']={earned:1e308,possible:1e308};model.save();rpg.save();assert(RPG.validateBackupState(rpg.state));
  const progress=clone(model.state),character=clone(rpg.state),bytes=clone(store.data);
  assert.strictEqual(ctx.learningTransaction(()=>{rpg.recordMastery(questions.Q,{earned:1e308,possible:1e308});return true;}),false);
  assert.deepStrictEqual(clone(model.state),progress);assert.deepStrictEqual(clone(rpg.state),character);assert.deepStrictEqual(store.data,bytes);
});
test('clock rollback before the review due time records an answer without a review success',()=>{
  const {ctx,model,rpg,store}=context('review'),due=Date.now()+1000;let clock=due;
  model.state.reviewSchedule.Q={stage:1,dueAt:due};model.assignReview('Q','R',due);ctx.reviewMappings.set('R',{sourceQuestionId:'Q'});
  sandbox.Date=class extends Date{static now(){return clock;}};
  try{
    ctx.start('R');const schedule=clone(model.state.reviewSchedule),assignment=clone(model.state.reviewAssignments),xp=rpg.state.xp;
    clock=due-1;assert.notStrictEqual(ctx.submit(),false);assert.strictEqual(model.state.attempts.at(-1).delayedSuccess,false);
    assert.strictEqual(model.state.learningContinuityState.today.reviewSuccessCount,0);assert.strictEqual(model.learningEffectivenessForQuestion('Q').delayedReview.successes,0);
    assert.deepStrictEqual(model.state.reviewSchedule,schedule);assert.deepStrictEqual(model.state.reviewAssignments,assignment);assert.strictEqual(rpg.state.xp,xp+20,'ordinary first-answer XP is unchanged');
    assert(!rpg.state.rewardedIds.some(id=>id.startsWith('@event:review-success:')),'no unqualified review bonus');
    const reloaded=new Model(questions,store,'p',Object.keys(questions));assert.strictEqual(reloaded.state.learningContinuityState.today.reviewSuccessCount,0);
    clock=due;ctx.start('R');assert.notStrictEqual(ctx.submit(),false);assert.strictEqual(model.state.learningContinuityState.today.reviewSuccessCount,1);
    assert.strictEqual(model.learningEffectivenessForQuestion('Q').delayedReview.successes,1);assert.strictEqual(model.state.reviewSchedule.Q.stage,2);assert.strictEqual(rpg.state.xp,xp+22,'qualified review adds its existing bonus once');
  }finally{delete sandbox.Date;}
});
test('a completed exam cannot lose its history or passed set in an issued backup',()=>{
  const {ctx,model}=context('exam');ctx.stopExamTimer=()=>{};ctx.view.examResult=()=>{};ctx.unansweredExamIds=()=>[];
  for(const id of Object.keys(questions)){
    const observationNumber=model.nextLearningObservation(id);assert(model.recordAttempt(id,true,10,'',false,Date.now(),null,'unsure',{mode:'exam',support:'none',observationNumber}));
    model.state.examSession.scores[id]={correct:true,earned:1,possible:1,ratio:1,answer:{correct:true},observationNumber};
  }
  model.refreshEvidenceIntegrity();assert(ctx.finishExam(true));assert.strictEqual(model.state.examHistory.length,1);assert.strictEqual(model.state.examHistory[0].points,100);assert(model.state.examHistory[0].setSignature);
  const original=clone(model.state);assert(Model.validateBackupState(original,questions,Object.keys(questions)));
  for(const mutate of [v=>v.examHistory=[],v=>v.examHistory[0].points=69,v=>delete v.examHistory[0].setSignature,v=>v.examHistory[0].finishedAt++]){
    const bad=clone(original);mutate(bad);assert.strictEqual(Model.validateBackupState(bad,questions,Object.keys(questions)),false);
    assert.strictEqual(Model.prepareBackupState(bad,questions,Object.keys(questions)),null);const store=values(),bytes=JSON.stringify(bad);store.data.p=bytes;
    assert(new Model(questions,store,'p',Object.keys(questions)).storageWriteBlocked);assert.strictEqual(store.data.p,bytes);
  }
});
test('an issued active exam rejects replacing an unanswered member',()=>{
  const {ctx}=context('exam'),store=values();ctx.questions=canonical;ctx.model=new Model(canonical,store,'p',canonicalPool);ctx.rpg=new RPG(store,'r');
  const ids=canonicalPool.slice(0,15);assert.strictEqual(ids.length,15);
  ctx.buildExamIds=()=>ids;ctx.model.state.mode='exam';ctx.ensureExamSession();ctx.start(ids[0]);ctx.view.readAnswer=()=>({correct:false,debit:[],credit:[]});assert.notStrictEqual(ctx.submit(),false);
  const original=clone(ctx.model.state);assert(Model.validateBackupState(original,canonical,canonicalPool));
  const bad=clone(original);assert(!ids.includes('J001'));bad.examSession.ids[1]='J001';
  assert.strictEqual(Model.validateBackupState(bad,canonical,canonicalPool),false);assert.strictEqual(Model.prepareBackupState(bad,canonical,canonicalPool),null);
  const bytes=JSON.stringify(bad);store.data.p=bytes;assert(new Model(canonical,store,'p',canonicalPool).storageWriteBlocked);assert.strictEqual(store.data.p,bytes);
});
test('an issued incorrect exam answer cannot acquire full points or altered mastery totals',()=>{
  const {ctx,model,store}=context('exam');ctx.view.readAnswer=()=>({correct:false,debit:[],credit:[]});assert.notStrictEqual(ctx.submit(),false);
  const original=clone(model.state);assert.strictEqual(original.examSession.scores.Q.correct,false);assert(Model.validateBackupState(original,questions,Object.keys(questions)));
  for(const patch of [{earned:1,possible:1,ratio:1},{earned:0,possible:1000,ratio:0},{answer:{correct:true}}]){
    const bad=clone(original);Object.assign(bad.examSession.scores.Q,patch);
    assert.strictEqual(Model.validateBackupState(bad,questions,Object.keys(questions)),false);assert.strictEqual(Model.prepareBackupState(bad,questions,Object.keys(questions)),null);
    const bytes=JSON.stringify(bad);store.data.p=bytes;assert(new Model(questions,store,'p',Object.keys(questions)).storageWriteBlocked);assert.strictEqual(store.data.p,bytes);
  }
});
test('issued Accepted migration archives and pending rechecks cannot silently disappear',()=>{
  for(const id of ['J051','L031']){
    const store=legacyStorage(JSON.stringify(fixture('old',id))),model=new Model(canonical,store,'p',canonicalPool),original=clone(model.state);
    assert(original.contentMigrationArchive.questions[id]);assert(original.contentRecheckIds.includes(id));assert(Model.validateBackupState(original,canonical,canonicalPool));
    for(const mutate of [v=>{v.contentMigrationArchive={schemaVersion:1,questions:{},reviewAssignments:{},completed:null};v.contentRecheckIds=[];},v=>v.contentRecheckIds=[]]){
      const bad=clone(original);mutate(bad);assert.strictEqual(Model.validateBackupState(bad,canonical,canonicalPool),false);assert.strictEqual(Model.prepareBackupState(bad,canonical,canonicalPool),null);
      const bytes=JSON.stringify(bad),saved=legacyStorage(bytes);assert(new Model(canonical,saved,'p',canonicalPool).storageWriteBlocked);assert.strictEqual(saved.value,bytes);
    }
  }
});
test('finite signed transaction totals survive reload and remain valid backups',()=>{
  for(const amount of [-5870,-0.5,0,4130,Number.MAX_VALUE]){
    const store=values(),rpg=new RPG(store,'r');rpg.state.totalTransactionAmount=amount;rpg.save();
    assert(RPG.validateBackupState(rpg.state));assert.deepStrictEqual(new RPG(store,'r').state,rpg.state);
  }
});
test('nonfinite and nonnumeric transaction totals remain rejected and normalize safely',()=>{
  for(const amount of [NaN,Infinity,-Infinity,'-5870',null]){
    const store=values(),rpg=new RPG(store,'r');rpg.state.totalTransactionAmount=amount;
    assert.strictEqual(RPG.validateBackupState(rpg.state),false);rpg.save();assert.strictEqual(new RPG(store,'r').state.totalTransactionAmount,0);
  }
});
// Real predecessor objects exercise the boundary between preserved bytes and
// authority. Confirmation is current consent, never historical authentication.
const predecessor = version => {
  const refs={v3:'bd558e21b3aa68ddccde3216d5ba89da105884cf',v4:'f7b86ac51be1b25ca32b50ac28d5efaa6ff26fa3',v5:'2cf70526f3cdc18560f151d4d32134a49aef79cb',v8:'d6da732f57e8a46717f67620b5a2761caa685872'};
  const module={exports:{}};vm.runInNewContext(require('child_process').execFileSync('git',['show',refs[version]+':js/model.js'],{encoding:'utf8'}),{module,console});return module.exports;
};
function oldDraftContext(){
  const c=context(),Old=predecessor('v8'),old=new Old(questions,values(),'p');
  old.setDraft('Q',{correct:true,debit:[],credit:[]});c.store.setItem('p',JSON.stringify(old.state,null,2));
  const original=c.store.data.p;c.ctx.model=c.model=new Model(questions,c.store,'p',Object.keys(questions));c.ctx.start('Q');
  c.ctx.view.showNotice=(text,options)=>c.notices.push({text,...options});return {...c,original};
}
test('unverified draft is editable; submit/cancel makes no observation or RPG mutation',()=>{
  const {ctx,model,rpg,store,notices,original}=oldDraftContext();
  assert(model.isUnverified('drafts','Q'));ctx.saveDraft(false);assert(model.isUnverified('drafts','Q'));
  const before=JSON.stringify(store.data),character=clone(rpg.state);
  assert.strictEqual(ctx.submit(),false);assert.strictEqual(model.learningEffectivenessForQuestion('Q').observedAttempts,0);
  assert.strictEqual(JSON.stringify(store.data),before);assert.deepStrictEqual(rpg.state,character);
  assert.strictEqual(model.state.legacyProvenance.original,original);assert(notices.at(-1).onConfirm);
  notices.at(-1).onConfirm();assert.strictEqual(model.learningEffectivenessForQuestion('Q').observedAttempts,1);
  assert(!model.isUnverified('drafts','Q'));assert.strictEqual(model.state.legacyProvenance.original,original);
  const earned=clone(rpg.state);ctx.submitting=false;ctx.learningFlow.phase='I';assert.strictEqual(ctx.submit(),false);assert.deepStrictEqual(clone(rpg.state),earned);
});
test('failed current-input approval preserves original bytes and pending status',()=>{
  const {ctx,model,store,rpg,notices}=oldDraftContext();const before=JSON.stringify(store.data),state=clone(model.state),character=clone(rpg.state);
  ctx.submit();store.setItem=()=>false;notices.at(-1).onConfirm();
  assert.strictEqual(JSON.stringify(store.data),before);assert.deepStrictEqual(model.state,state);assert.deepStrictEqual(rpg.state,character);
  assert(model.isUnverified('drafts','Q'));assert.strictEqual(model.learningEffectivenessForQuestion('Q').observedAttempts,0);
});
test('an open approval cannot authorize a changed input or another question',()=>{
  const {ctx,model,notices}=oldDraftContext();ctx.submit();const confirm=notices.at(-1).onConfirm;
  ctx.view.readAnswer=()=>({correct:false,debit:[],credit:[]});confirm();assert(model.isUnverified('drafts','Q'));
  ctx.currentId='R';confirm();assert.strictEqual(model.learningEffectivenessForQuestion('Q').observedAttempts,0);
});
test('unsigned review plan is preserved but cannot award delayed success or old stage',()=>{
  const Old=predecessor('v3'),old=new Old(questions,values(),'p');old.state.mode='training';old.recordAttempt('Q',false,10,'',false,1000);old.record('Q',false,1000);
  old.state.reviewSchedule.Q.stage=3;old.assignReview('Q','R',1001);const original=JSON.stringify(old.state),store=values();store.setItem('p',original);
  const model=new Model(questions,store,'p'),due=model.state.reviewSchedule.Q.dueAt;model.state.mode='review';model.assignReview('Q','R',due);
  assert.strictEqual(model.qualifiedDelayedReview('R','Q',due,'review'),null);
  assert(model.recordAttempt('R',true,10,'',true,due,3,'unsure',{mode:'review',support:'none',reviewSourceId:'Q'}));
  assert.strictEqual(model.completeReview('Q',true,due,'R'),false);
  assert.strictEqual(model.state.reviewSchedule.Q.stage,0);assert.strictEqual(model.state.reviewSchedule.Q.dueAt,due+1200000);
  assert.strictEqual(model.learningEffectivenessForQuestion('Q').delayedReview.successes,0);
  assert.strictEqual(model.state.legacyProvenance.original,original);assert(!model.isUnverified('reviewSchedule','Q'));
});
test('signed old review schedule remains usable without a blanket re-evaluation',()=>{
  const Old=predecessor('v4'),old=new Old(questions,values(),'p');old.recordAttempt('Q',false,10,'',false,1000);old.record('Q',false,1000);
  const store=values();store.setItem('p',JSON.stringify(old.state));const model=new Model(questions,store,'p'),due=model.state.reviewSchedule.Q.dueAt;
  model.state.mode='review';model.assignReview('Q','R',due);assert(!model.isUnverified('reviewSchedule','Q'));
  assert(model.qualifiedDelayedReview('R','Q',due,'review'));
});
test('unregradable old exam cannot finalize score, mastery or rewards',()=>{
  const c=context('exam'),Old=predecessor('v5'),old=new Old(questions,values(),'p',Object.keys(questions));
  old.state.mode='exam';old.state.examSession=clone(c.model.state.examSession);old.recordAttempt('Q',false,10,'',false,Date.now(),null,'unsure',{mode:'exam'});
  old.state.examSession.scores.Q={correct:false,earned:0,possible:1,ratio:0,observationNumber:1};old.save();
  c.store.setItem('p',JSON.stringify(old.state));c.ctx.model=c.model=new Model(questions,c.store,'p',Object.keys(questions));c.ctx.stopExamTimer=()=>{};
  c.ctx.view.showNotice=(text,options)=>c.notices.push({text,...options});const character=clone(c.rpg.state),original=c.model.state.legacyProvenance.original;
  c.ctx.start('R');c.ctx.submit();const currentSession=clone(c.model.state.examSession);
  assert.strictEqual(c.ctx.finishExam(true),false);assert.strictEqual(c.model.state.examHistory.length,0);assert.deepStrictEqual(c.rpg.state,character);
  c.notices.at(-1).onConfirm();assert.strictEqual(c.model.state.examSession,null);assert.strictEqual(c.model.state.examHistory.length,0);
  assert.deepStrictEqual(c.rpg.state,character);assert.strictEqual(c.model.state.legacyProvenance.original,original);
  assert.deepStrictEqual(clone(c.model.state.legacyProvenance.archivedExams[0].session),currentSession);
  assert.deepStrictEqual(new Model(questions,c.store,'p',Object.keys(questions)).state.legacyProvenance.archivedExams[0].session,currentSession);
});
test('a currently reanswered legacy exam score can finalize without blanket retest',()=>{
  const c=context('exam'),Old=predecessor('v5'),old=new Old(questions,values(),'p',Object.keys(questions));
  old.state.mode='exam';old.state.examSession=clone(c.model.state.examSession);old.recordAttempt('Q',false,10,'',false,Date.now(),null,'unsure',{mode:'exam'});
  old.state.examSession.scores.Q={correct:false,earned:0,possible:1,ratio:0,observationNumber:1};old.save();
  c.store.setItem('p',JSON.stringify(old.state));c.ctx.model=c.model=new Model(questions,c.store,'p',Object.keys(questions));c.ctx.stopExamTimer=()=>{};c.ctx.view.examResult=()=>{};
  const original=c.model.state.legacyProvenance.original;c.ctx.start('Q');c.ctx.submit();assert(!c.model.isUnverified('examScores','Q'));
  assert(c.ctx.finishExam(true));assert.strictEqual(c.model.state.examHistory.length,1);assert(c.rpg.state.rewardedIds.includes('Q'));
  assert.strictEqual(c.model.state.legacyProvenance.original,original);const rewarded=clone(c.rpg.state);assert.strictEqual(c.ctx.finishExam(true),false);assert.deepStrictEqual(clone(c.rpg.state),rewarded);
});
test('an unsigned old result list cannot delete a subsequently saved draft on retry',()=>{
  const {ctx,model,original}=oldDraftContext();model.state.lastExamReview={items:[{id:'Q'}]};model.refreshEvidenceIntegrity();model.save();
  ctx.buildExamIds=()=>Object.keys(questions);const draft=clone(model.state.drafts.Q);assert(ctx.retryExam());
  assert.deepStrictEqual(model.state.drafts.Q,draft);assert.strictEqual(model.state.legacyProvenance.original,original);
});
async function provenanceBackupTests(){
  const {ctx,model,rpg,store,original}=oldDraftContext();rpg.reward(questions.Q,{correct:true},1);rpg.save();
  const payload={format:'boki-rpg-backup',version:1,progress:clone(model.state),character:clone(rpg.state)};
  for(let i=0;i<2;i++){
    assert(await ctx.importBackup({text:async()=>JSON.stringify(payload)}));
    const restored=new Model(questions,store,'p');assert.strictEqual(restored.state.legacyProvenance.original,original);
    assert(restored.isUnverified('drafts','Q'));assert.deepStrictEqual(new RPG(store,'r').state,payload.character);
  }
  for(const mutate of [v=>delete v.legacyProvenance,v=>v.legacyProvenance.pending.drafts=[],v=>v.legacyProvenance.original='{}',v=>delete v.learningDayHistory]){
    const bad=clone(payload);mutate(bad.progress);const before=JSON.stringify(store.data);
    assert.strictEqual(await ctx.importBackup({text:async()=>JSON.stringify(bad)}),false);assert.strictEqual(JSON.stringify(store.data),before);
  }
  passed++;console.log('PASS repeated imports preserve unverified originals and rewards; altered provenance is atomic rejection');
}
async function signedBackupTests(){
  const {ctx}=context(),q=require('./fixtures/foundation-extension-cases').npvNegative,catalog={[q.id]:q},store=values();
  ctx.questions=catalog;ctx.model=new Model(catalog,store,'p');ctx.rpg=new RPG(store,'r');ctx.model.state.mode='training';
  ctx.view.readAnswer=()=>({...clone(q.answer),correct:true});ctx.start(q.id);assert.notStrictEqual(ctx.submit(),false);
  const payload={format:'boki-rpg-backup',version:1,progress:clone(ctx.model.state),character:clone(ctx.rpg.state)},beforeReloads=reloads;
  assert.strictEqual(payload.character.totalTransactionAmount,-5870);
  assert.strictEqual(await ctx.importBackup({text:async()=>JSON.stringify(payload)}),true);assert.strictEqual(reloads,beforeReloads+1);
  assert.deepStrictEqual(new RPG(store,'r').state,payload.character);
  assert.deepStrictEqual(new Model(catalog,store,'p').state.learningEffectiveness,payload.progress.learningEffectiveness);
  passed++;console.log('PASS actual signed NPV backup imports and reloads without losing rewards');
}
async function backupTests(){
  const {ctx,model,rpg,store}=context();ctx.view.readAnswer=()=>({correct:false,debit:[],credit:[]});ctx.submit();
  const payload={format:'boki-rpg-backup',version:1,progress:clone(model.state),character:clone(rpg.state)};
  const file={text:async()=>JSON.stringify(payload)},before=JSON.stringify(store.data),set=store.setItem;
  let failedOnce=false;store.setItem=function(key,value){if(key==='r'&&!failedOnce){failedOnce=true;return false;}return set.call(this,key,value);};
  assert.strictEqual(await ctx.importBackup(file),false);assert.strictEqual(JSON.stringify(store.data),before);assert.strictEqual(reloads,0);
  store.setItem=set;assert.strictEqual(await ctx.importBackup(file),true);assert.strictEqual(reloads,1);
  assert.deepStrictEqual(JSON.parse(store.data.p).learningEffectiveness,payload.progress.learningEffectiveness);
  payload.progress.learningEffectiveness.schemaVersion=99;const saved=JSON.stringify(store.data);assert.strictEqual(await ctx.importBackup(file),false);assert.strictEqual(JSON.stringify(store.data),saved);assert.strictEqual(reloads,1);
  passed++;console.log('PASS real two-key backup transaction preserves evidence and rolls back failures');
}
backupTests().then(signedBackupTests).then(provenanceBackupTests).catch(error=>{failed++;console.error(error.stack);}).finally(()=>{test('a transplanted active exam score cannot add a second history or mastery result',()=>{
  const {ctx,model,rpg,store}=context('exam');ctx.stopExamTimer=()=>{};ctx.view.examResult=()=>{};ctx.submit();
  const priorSession=clone(model.state.examSession);assert(ctx.finishExam(true));
  model.state.examSession={...priorSession,startedAt:priorSession.startedAt+100000,endAt:priorSession.endAt+100000};
  model.save();rpg.save();const progress=clone(model.state),character=clone(rpg.state),bytes=clone(store.data);
  assert.strictEqual(ctx.finishExam(true),false);assert.deepStrictEqual(clone(model.state),progress);assert.deepStrictEqual(clone(rpg.state),character);assert.deepStrictEqual(store.data,bytes);
});
test('review clock rollback cannot commit a review bonus without retention evidence',()=>{
  const {ctx,model,rpg}=context('training');ctx.submit();const now=Date.now();model.state.mode='review';model.state.reviewSchedule.Q={stage:1,dueAt:now-1000};model.assignReview('Q','R',now+1000);
  ctx.reviewMappings.set('R',{sourceQuestionId:'Q'});ctx.start('R');const beforeXp=rpg.state.xp;ctx.submit();
  assert.strictEqual(model.state.reviewSchedule.Q.stage,2);assert(rpg.state.xp>beforeXp);assert.strictEqual(model.learningEffectivenessForQuestion('Q').delayedReview.successes,1);
});
console.log(`LEARNING_EFFECTIVENESS_INTEGRATION ${passed}/${passed+failed} PASS; ${failed} FAIL`);if(failed)process.exitCode=1;});
