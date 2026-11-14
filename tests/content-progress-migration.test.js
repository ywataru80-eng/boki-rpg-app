'use strict';
const assert=require('assert'),fs=require('fs'),vm=require('vm');
const Model=require('../js/model');
const {NOW,questions,clone,storage,fixture}=require('./helpers/issue207-fixtures');
let passed=0,failed=0;
const test=(name,fn)=>{try{fn();passed++;console.log('PASS '+name);}catch(error){failed++;console.error('FAIL '+name+': '+error.message);}};
const load=value=>{const store=storage(JSON.stringify(value));return {model:new Model(questions,store,'test'),store};};
const stats=(model,id)=>{const s=model.statsForQuestion(id);return [s.correctCount,s.incorrectCount];};
for(const id of ['J051','L031']){
  test(`${id}: old-only evidence is archived, not new mastery`,()=>{
    const before=fixture('old',id),{model,store}=load(before);
    assert.deepStrictEqual(stats(model,id),[0,0]);assert.strictEqual(model.learningMastery(id).state,'未着手');
    for(const key of ['answeredIds','correctIds','incorrectIds'])assert(!model.state[key].includes(id));
    assert.strictEqual(model.state.drafts[id],undefined);assert.strictEqual(model.state.reviewSchedule[id],undefined);
    const archive=model.state.contentMigrationArchive.questions[id];
    assert.deepStrictEqual(archive.questionStats,before.questionStats[id]);assert.deepStrictEqual(archive.draft,before.drafts[id]);
    assert.strictEqual(archive.attempts.length,3);assert(model.state.contentRecheckIds.includes(id));
    assert.deepStrictEqual(model.state.learningContinuityState,before.learningContinuityState);
    assert.strictEqual(model.state.lastLearningAt,before.lastLearningAt);
    assert.deepStrictEqual(model.state.questionStats.J001,before.questionStats.J001);assert.deepStrictEqual(model.state.drafts.J001,before.drafts.J001);
    assert(Model.validateBackupState(model.state,questions));
    const again=new Model(questions,store,'test');assert.deepStrictEqual(again.state,model.state);assert.strictEqual(store.writes,1);
  });
  test(`${id}: proven new-only evidence and schedule survive`,()=>{
    const before=fixture('new',id),{model}=load(before);
    assert.deepStrictEqual(model.state.questionStats[id],before.questionStats[id]);assert.strictEqual(model.learningMastery(id).state,'定着');
    assert.deepStrictEqual(model.state.reviewSchedule[id],before.reviewSchedule[id]);assert(model.state.correctIds.includes(id));
    assert(!model.state.contentRecheckIds.includes(id));
    if(id==='L031')assert.deepStrictEqual(model.state.drafts[id],before.drafts[id]);
    else assert.deepStrictEqual(model.state.contentMigrationArchive.questions[id].draft,before.drafts[id]);
  });
  test(`${id}: mixed old3 plus new wrong1/right1 counts only new 1/1`,()=>{
    const before=fixture('mixed',id),{model}=load(before);
    assert.deepStrictEqual(stats(model,id),[1,1]);assert.strictEqual(model.recentAccuracy({questionId:id}).attempts,2);
    assert.strictEqual(model.state.contentMigrationArchive.questions[id].questionStats.correctCount,4);
    assert.deepStrictEqual(model.state.reviewSchedule[id],{stage:0,dueAt:NOW+240000+1200000});
    assert.deepStrictEqual(model.state.learningContinuityState,before.learningContinuityState);
  });
  for(const kind of ['stats','evicted'])test(`${id}: ${kind} aggregate is archived without invented provenance`,()=>{
    const before=fixture(kind,id),{model}=load(before);
    assert.deepStrictEqual(stats(model,id),[0,0]);assert.strictEqual(model.state.contentMigrationArchive.questions[id].questionStats.correctCount,3);
    assert(model.state.contentRecheckIds.includes(id));assert.deepStrictEqual(model.state.learningContinuityState,before.learningContinuityState);
    assert(model.state.attempts.length<=200);
  });
  test(`${id}: explicit identities preserve new lifetime stats after log eviction`,()=>{
    let {model,store}=load(fixture('old',id));
    for(let n=0;n<3;n++)model.recordAttempt(id,true,1000,'',false,NOW+n);
    model.record(id,true,NOW+2);
    assert.strictEqual(model.state.attempts.at(-1).contentIdentity,model.state.questionContentVersions[id]);
    for(let n=0;n<201;n++)model.recordAttempt('J001',true,1000,'',false,NOW+1000+n);
    const archive=clone(model.state.contentMigrationArchive);
    model=new Model(questions,store,'test');assert.deepStrictEqual(stats(model,id),[3,0]);assert.deepStrictEqual(model.state.contentMigrationArchive,archive);
    assert.strictEqual(model.state.attempts.length,200);assert(!model.state.contentRecheckIds.includes(id));
  });
  test(`${id}: failed save leaves original bytes intact and can retry`,()=>{
    const original=JSON.stringify(fixture('old',id)),store=storage(original),set=store.setItem;
    store.setItem=()=>false;const model=new Model(questions,store,'test');
    assert.strictEqual(store.value,original);assert.deepStrictEqual(stats(model,id),[0,0]);
    store.setItem=set;assert(model.save());assert(Model.validateBackupState(JSON.parse(store.value),questions));
  });
}
test('incoming/outgoing review assignments removed; unrelated schedules/assignments preserved',()=>{
  const before=fixture('old','J051');
  before.reviewAssignments={J001:{sourceQuestionId:'J001',reviewQuestionId:'J051',conceptId:questions.J001.category,stage:0,dueAt:NOW,assignedAt:NOW,status:'assigned'},J051:{sourceQuestionId:'J051',reviewQuestionId:'J001',conceptId:questions.J001.category,stage:0,dueAt:NOW,assignedAt:NOW,status:'assigned'}};
  const {model}=load(before);assert.deepStrictEqual(model.state.reviewAssignments,{});assert.deepStrictEqual(model.state.reviewSchedule.J001,before.reviewSchedule.J001);
  assert.deepStrictEqual(model.state.contentMigrationArchive.reviewAssignments,before.reviewAssignments);
});
test('assignReview respects controller replacement target instead of reusing stale target',()=>{
  const {model}=load(fixture('old'));model.state.reviewSchedule.J001={stage:0,dueAt:1};
  model.state.reviewAssignments.J001={sourceQuestionId:'J001',reviewQuestionId:'J051',conceptId:questions.J001.category,stage:0,dueAt:1,assignedAt:0,status:'assigned'};
  assert.strictEqual(model.assignReview('J001','J001',NOW).reviewQuestionId,'J001');
});
test('future content schema and identity are rejected without overwriting storage',()=>{
  const valid=new Model(questions,storage(),'empty').state;
  for(const change of [v=>v.contentRevision=(questions.D002.format==='decision-worksheet-v2'?7:6),v=>v.questionContentVersions.J051='future-v9',v=>delete v.questionContentVersions,v=>v.contentMigrationArchive.schemaVersion=2]){
    const candidate=clone(valid);change(candidate);assert.strictEqual(Model.validateBackupState(candidate,questions),false);
    const original=JSON.stringify(candidate),store=storage(original),model=new Model(questions,store,'test');
    assert.strictEqual(store.value,original);assert.strictEqual(store.writes,0);assert.strictEqual(model.save(),false);assert.strictEqual(store.value,original);
  }
});
test('backup normalization migrates in memory and is idempotent',()=>{
  const before=fixture('mixed','L031'),original=JSON.stringify(before);
  const migrated=Model.prepareBackupState(before,questions);assert(migrated);assert.deepStrictEqual([migrated.questionStats.L031.correctCount,migrated.questionStats.L031.incorrectCount],[1,1]);
  assert.strictEqual(JSON.stringify(before),original);assert.deepStrictEqual(Model.prepareBackupState(migrated,questions),migrated);
});
test('earned RPG rewards and independent character storage never change during migration',()=>{
  const RPG=require('../js/rpg'),store=storage(),rpg=new RPG(store,'character');
  rpg.reward(questions.J051,{ratio:1,earned:1,possible:1},1);const before=store.value,xp=rpg.state.xp;
  load(fixture('old'));assert.strictEqual(store.value,before);assert.strictEqual(rpg.reward(questions.J051,{ratio:1,earned:1,possible:1},1),false);assert.strictEqual(rpg.state.xp,xp);
});
console.log(`CONTENT_PROGRESS_MIGRATION ${passed} passed / ${failed} failed`);if(failed)process.exitCode=1;
