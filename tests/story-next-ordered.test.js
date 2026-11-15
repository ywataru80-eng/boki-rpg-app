'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const sandbox={window:{},Event:class Event{},queueMicrotask(fn){fn();},console};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(root,'data/questions.js'),'utf8'),sandbox);
vm.runInContext(fs.readFileSync(path.join(root,'js/controller.js'),'utf8'),sandbox);
const methods=sandbox.window.AppController.prototype;
const questions=sandbox.window.QuestionData;
assert.equal(Object.keys(questions).length,300);
const authority={questions,ids:Object.keys(questions),examCandidateIds:methods.examCandidateIds,learningIds:methods.learningIds};
const storyIds=methods.storyIds.call(authority);
assert.equal(storyIds.length,166,'12 chapters, 166 ordered Story cases');
assert.equal(storyIds[storyIds.indexOf('L001')+1],'L002','authored route L001→L002');
function follow(id,mode='story',phase='C'){
  let started=null,suggestions=0,home=false;
  const ctx={
    currentId:id,questions,learningFlow:{questionId:id,phase,nextConsumed:false,gameOverPending:false},
    model:{state:{mode,answeredIds:[id],reviewSchedule:{},examSession:null},recommendedIds(){suggestions++;return ['L006','L011'];}},
    modeIds(){return storyIds;},start(nextId){started=nextId;},renderModes(){},
    showMode(target){home=target==='story';},dispatchPendingGameOver(){throw Error('unexpected game over');}
  };
  const result=methods.next.call(ctx);
  return {result,started,suggestions,home,consumed:ctx.learningFlow.nextConsumed};
}
let count=0,a=follow('L001');
assert.equal(a.started,'L002','Story must not skip same-topic items');
assert.equal(a.suggestions,0);assert.equal(a.consumed,true);count++;
a=follow('L001','training');
assert.equal(a.started,'L006','Training adaptive behavior unchanged');assert.equal(a.suggestions,1);count++;
a=follow('L001','story','I');
assert.equal(a.result,false);assert.equal(a.started,null);assert.equal(a.consumed,false);count++;
for(let chapter=1;chapter<=11;chapter++){
  const last=storyIds.filter(id=>questions[id].chapter===chapter).at(-1);
  const nextId=storyIds[storyIds.indexOf(last)+1];
  assert.equal(questions[nextId].chapter,chapter+1);
  a=follow(last);assert.equal(a.started,nextId,'chapter '+chapter+' transition');
  assert.equal(a.suggestions,0);count++;
}
a=follow(storyIds.at(-1));assert.equal(a.started,null);assert(a.home);count++;
console.log('STORY_NEXT_ORDERED_PASS',count,storyIds.length);
