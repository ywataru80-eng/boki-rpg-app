'use strict';
// Issue259 P1: annual profile fields are immutable, while pre-profile 2026
// sessions and archived historical results remain valid without re-signing.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Model = require('../js/model');
const window = {ProgressModel:Model};
const context = {window,console};
vm.runInNewContext(fs.readFileSync('data/questions.js','utf8'),context,{timeout:30000});
vm.runInNewContext(fs.readFileSync('js/controller.js','utf8'),context,{timeout:30000});
const Controller = window.AppController;
const questions = window.QuestionData, pool = Array.from(window.ExamPoolDefinition), ids = pool.slice(0,15);
const storage = () => ({data:{},getItem(k){return this.data[k]??null;},setItem(k,v){this.data[k]=v;return true;},removeItem(k){delete this.data[k];}});
const store = storage();
const model = new Model(questions,store,'p',pool);
const previous = {finishedAt:1234,points:69,passed:false,setSignature:'old-exam-history',topicScores:{journal:{earned:69,possible:100}}};
model.state.examHistory = [previous];
model.state.mode = 'exam';
const controller = Object.create(Controller.prototype);
controller.model = model;
controller.buildExamIds = () => ids;
const session = controller.ensureExamSession(2000);
const expectedProfile = Model.examProfile2026();
assert.deepEqual(Object.keys(expectedProfile).sort(),['examProfileId','scoreProfileVersion','questionSetVersion'].sort());
assert.deepEqual(JSON.parse(JSON.stringify(Object.fromEntries(Object.keys(expectedProfile).map(k=>[k,session[k]])))),expectedProfile);
assert.equal(session.ids.length,15);
assert(model.validExamSession(session));
assert.equal(model.state.examHistory[0],previous,'old history reference not replaced');
assert.deepEqual(model.state.examHistory,[previous],'no retroactive grading');
assert.equal(Model.validateBackupState(model.state,questions,pool),true);
const serialized = JSON.parse(store.getItem('p'));
assert.deepEqual(serialized.examSession,JSON.parse(JSON.stringify(session)));
const restored = new Model(questions,store,'p',pool);
assert.notEqual(restored.storageWriteBlocked,true);
assert.deepEqual(restored.state.examSession,serialized.examSession,'new 2026 in-progress exam resumes');
assert.deepEqual(restored.state.examHistory,serialized.examHistory,'legacy history remains byte-equal');
assert.equal(restored.state.examHistory[0].examProfileId,undefined,'historical row never implicitly tagged');
assert.deepEqual(Model.prepareBackupState(restored.state,questions,pool).examSession,serialized.examSession,'profile survives backup import');
const legacy = JSON.parse(JSON.stringify(session));
for(const key of Object.keys(expectedProfile))delete legacy[key];
assert(model.validExamSession(legacy),'legacy FY2026 15-item session accepted as-is');
for(const [key,bad] of [
  ['examProfileId','FY2027-APP15-V1'],
  ['scoreProfileVersion',2],
  ['questionSetVersion','FY2027-CANONICAL300-R1']
]) {
  const corrupted = {...session,[key]:bad};
  assert.equal(model.validExamSession(corrupted),false,`reject unknown or altered ${key}`);
  const imported = JSON.parse(JSON.stringify(model.state));
  imported.examSession = corrupted;
  assert.equal(Model.validateBackupState(imported,questions,pool),false,`backup rejects ${key}`);
}
for(const key of Object.keys(expectedProfile)){
  const corrupted = {...session};delete corrupted[key];
  assert.equal(model.validExamSession(corrupted),false,`reject partial profile ${key}`);
  const imported=JSON.parse(JSON.stringify(model.state)); imported.examSession=corrupted;
  assert.equal(Model.validateBackupState(imported,questions,pool),false);
}
// Never silently reinterpret a spoofed future profile as the old 2026 score.
const attempt = {...session,examProfileId:'FY2027-APP15-V1'};
assert.equal(Controller.prototype.finishExam.call({model:{state:{examSession:attempt}}},true,2000,true),false);
assert.deepEqual(model.state.examHistory,[previous]);
console.log('ISSUE259_FY2026_PROFILE_GUARD_PASS: new/legacy/partial/unknown/backup/restore/history');
