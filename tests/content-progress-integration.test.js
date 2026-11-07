'use strict';
const assert=require('assert'),fs=require('fs'),vm=require('vm');
const Model=require('../js/model'),RPG=require('../js/rpg');
const {NOW,questions,clone,storage,fixture}=require('./helpers/issue207-fixtures');
let reloads=0;
const sandbox={window:{ProgressModel:Model,RPGModel:RPG,location:{reload(){reloads++;}}},console,Event:class Event{},queueMicrotask:fn=>fn()};
vm.runInNewContext(fs.readFileSync('js/controller.js','utf8'),sandbox);
const Controller=sandbox.window.AppController;
let count=0;
function test(name,fn){fn();count++;console.log('PASS '+name);}
function context(){
  const progress=storage('ORIGINAL-PROGRESS'),character=storage('ORIGINAL-CHARACTER');
  const status={textContent:'',classList:{add(){},remove(){}}};
  const ctx=Object.create(Controller.prototype);
  Object.assign(ctx,{questions,model:{storage:progress,key:'p'},rpg:{storage:character,key:'c'},document:{getElementById:()=>status}});
  return {ctx,progress,character,status};
}
async function run(){
  test('controller reviewIds never redirects an unrelated concept to the replaced J051',()=>{
    const model=new Model(questions,storage(JSON.stringify(fixture('old'))));
    model.state.reviewSchedule={J001:{stage:0,dueAt:1}};
    model.state.reviewAssignments={J001:{sourceQuestionId:'J001',reviewQuestionId:'J051',conceptId:questions.J001.category,stage:0,dueAt:1,assignedAt:0,status:'assigned'}};
    const ctx=Object.create(Controller.prototype);Object.assign(ctx,{questions,ids:Object.keys(questions),model});
    const ids=ctx.reviewIds();assert.strictEqual(ids.length,1);assert.notStrictEqual(ids[0],'J051');
    assert.strictEqual(ctx.reviewMappings.get(ids[0]).reviewQuestionId,ids[0]);
    assert.strictEqual(model.state.reviewAssignments.J001.reviewQuestionId,ids[0]);
    const snapshot=JSON.stringify(model.state.reviewAssignments);ctx.reviewIds();assert.strictEqual(JSON.stringify(model.state.reviewAssignments),snapshot);
  });
  test('incomplete modern-topic rolling log is only a lower bound, not lifetime provenance',()=>{
    const before=fixture('new','J051');before.questionStats.J051.correctCount=503;
    const model=new Model(questions,storage(JSON.stringify(before)));
    assert.strictEqual(model.state.questionStats.J051.correctCount,3);
    assert.strictEqual(model.state.contentMigrationArchive.questions.J051.questionStats.correctCount,503);
    assert(model.state.contentRecheckIds.includes('J051'));
  });
  for(const id of ['J051','L031'])for(const schema of ['legacy','missing-aggregate']){
    test(`${id}: ${schema} recent failures cannot authenticate a stale completion flag`,()=>{
      // The rolling log can lose old successes while the lifetime completion flag
      // remains. Without the original aggregate, rebuilding that log is not proof.
      const before=fixture('new',id);delete before.questionStats;
      if(schema==='legacy')delete before.learningSchemaVersion;
      before.attempts.filter(attempt=>attempt.id===id).forEach(attempt=>{attempt.correct=false;});
      const model=new Model(questions,storage(JSON.stringify(before)));
      assert.strictEqual(model.statsForQuestion(id).correctCount,0);
      assert.strictEqual(model.statsForQuestion(id).incorrectCount,3);
      assert(!model.state.correctIds.includes(id));
      assert(model.state.contentRecheckIds.includes(id));
      const archive=model.state.contentMigrationArchive.questions[id];
      assert.strictEqual(archive.questionStats,null);
      assert.strictEqual(archive.flags.correct,true);
      assert.strictEqual(archive.provenComplete,false);
      assert(Model.validateBackupState(model.state,questions));
    });
  }
  test('matching category alone or a conflicting explicit identity is not accepted evidence',()=>{
    for(const change of [attempt=>delete attempt.concept,attempt=>attempt.contentIdentity='old-capital-v1',attempt=>{attempt.timestamp=null;attempt.at=null;}]){
      const before=fixture('new','J051');before.attempts.filter(item=>item.id==='J051').forEach(change);
      const model=new Model(questions,storage(JSON.stringify(before)));assert.strictEqual(model.statsForQuestion('J051').correctCount,0);
    }
  });
  test('wrong but schema-compatible L031 draft survives; alien old keys do not',()=>{
    const before=fixture('new','L031');Object.keys(before.drafts.L031.cells).forEach(key=>before.drafts.L031.cells[key]='誤った入力');
    const model=new Model(questions,storage(JSON.stringify(before)));assert.deepStrictEqual(model.state.drafts.L031,before.drafts.L031);
    before.drafts.L031.cells.r2_balance=598000;const old=new Model(questions,storage(JSON.stringify(before)));assert.strictEqual(old.state.drafts.L031,undefined);
  });
  test('completion requiring obsolete L031 evidence is invalidated without clearing exam history',()=>{
    const before=fixture('old','L031');before.completed=true;
    before.examHistory=[{points:100,finishedAt:NOW,setSignature:'set-a'},{points:90,finishedAt:NOW+1,setSignature:'set-b'}];
    const model=new Model(questions,storage(JSON.stringify(before)));assert.strictEqual(model.state.completed,false);
    assert.strictEqual(model.state.contentMigrationArchive.completed,true);assert.deepStrictEqual(model.state.examHistory,before.examHistory);
  });
  test('malformed/future archive is rejected and its bytes are not overwritten',()=>{
    const valid=new Model(questions,storage(JSON.stringify(fixture('mixed')))).state;
    for(const change of [v=>v.contentMigrationArchive.questions.J051.toIdentity='wrong',v=>v.contentMigrationArchive.questions.J051.questionStats.correctCount=-1,v=>delete v.contentMigrationArchive.questions.J051.flags,v=>v.attempts.find(a=>a.id==='J051').contentIdentity='wrong',v=>v.contentRecheckIds.push('J001')]){
      const state=clone(valid);change(state);assert.strictEqual(Model.validateBackupState(state,questions),false);
      const bytes=JSON.stringify(state),store=storage(bytes),model=new Model(questions,store);assert.strictEqual(model.save(),false);assert.strictEqual(store.value,bytes);
    }
  });
  const character=new RPG(storage()).state;
  const payload={format:'boki-rpg-backup',version:1,progress:fixture('mixed','L031'),character};
  const file={text:async()=>JSON.stringify(payload)};
  {
    const {ctx,progress,character:chars}=context();reloads=0;
    assert.strictEqual(await ctx.importBackup(file),true);assert.strictEqual(reloads,1);
    const migrated=JSON.parse(progress.value);assert.strictEqual(migrated.contentRevision,questions.D002.format==='decision-worksheet-v2'?6:5);
    assert.strictEqual(migrated.questionStats.L031.correctCount,1);assert.strictEqual(migrated.questionStats.L031.incorrectCount,1);
    assert.deepStrictEqual(JSON.parse(chars.value),character);
    const first=progress.value;assert.strictEqual(await ctx.importBackup(file),true);assert.strictEqual(progress.value,first);
    payload.progress=migrated;assert.strictEqual(await ctx.importBackup(file),true);assert.strictEqual(progress.value,first);
    count++;console.log('PASS controller backup old/migrated/repeated import normalizes before real writes');
  }
  {
    const {ctx,progress,character:chars}=context();reloads=0;let failures=0;const set=chars.setItem;
    chars.setItem=function(key,value){if(failures++===0)return false;return set.call(this,key,value);};
    assert.strictEqual(await ctx.importBackup(file),false);assert.strictEqual(reloads,0);
    assert.strictEqual(progress.value,'ORIGINAL-PROGRESS');assert.strictEqual(chars.value,'ORIGINAL-CHARACTER');
    count++;console.log('PASS character-write failure restores both original storage keys');
  }
  {
    const {ctx,progress,character:chars}=context();reloads=0;payload.progress.contentMigrationArchive.schemaVersion=2;
    assert.strictEqual(await ctx.importBackup(file),false);assert.strictEqual(progress.writes,0);assert.strictEqual(chars.writes,0);assert.strictEqual(reloads,0);
    count++;console.log('PASS incompatible backup rejected before transactional writes');
  }
  console.log(`CONTENT_PROGRESS_INTEGRATION ${count}/${count} PASS`);
}
run().catch(error=>{console.error(error.stack);process.exitCode=1;});
