'use strict';
// Issue #259: the 100-point result, question rows and topic subtotals must
// reconcile exactly.  This preserves the 2026 scoring contract and histories;
// the 2027 weights are regression data, not a switch to 2027 production mode.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const sandbox={window:{},console};
vm.runInNewContext(fs.readFileSync('js/controller.js','utf8'),sandbox,{filename:'js/controller.js',timeout:30000});
const Controller=sandbox.window.AppController;
const ids=Array.from({length:15},(_,i)=>'Q'+(i+1));
const weights26=[9,9,9,9,9,5,5,5,5,6,6,6,6,6,5];
const weights27=[9,9,9,9,9,7,6,6,6,5,5,5,5,5,5];
const scores=ratios=>Object.fromEntries(ids.map((id,i)=>[id,{ratio:ratios[i],earned:Math.round(ratios[i]*12),possible:12,correct:ratios[i]===1}]));
const calc=(ratios,weights)=>Controller.allocateExamPoints(ids,scores(ratios),weights);
const sum=a=>a.reduce((x,y)=>x+y,0);
for(const weights of [weights26,weights27]){
 assert.equal(sum(weights),100,'annual integer score contract');
 for(const [name,ratios,total] of [['zero',Array(15).fill(0),0],['all-correct',Array(15).fill(1),100]]){
  const result=calc(ratios,weights);
  assert.equal(result.points,total,name);
  assert.equal(sum(result.displayed),total,name+' detail');
 }
}
const tie=Array(15).fill(0);tie[5]=tie[6]=0.5;
const tied=calc(tie,weights26);
assert.equal(tied.points,5,'original row-rounding defect: 2.5 + 2.5 = 5');
assert.deepEqual(Array.from(tied.displayed.slice(5,7)),[3,2],'integer rows reconcile after stable tie-breaking');
assert.deepEqual(Array.from(calc(tie,weights26).displayed),Array.from(tied.displayed),'determinism');
for(const [weights,start,fraction,expected] of [
 [weights26,9,4/6,69],[weights26,9,5/6,70],
 [weights27,8,5/6,69],[weights27,8,1,70]]){
 const ratios=Array(15).fill(0);for(let i=0;i<9;i++)ratios[i]=1;
 ratios[start]=fraction;
 const result=calc(ratios,weights);
 assert.equal(result.points,expected,'69/70 pass threshold');
 assert.equal(sum(result.displayed),expected,'69/70 subtotal');
 assert.equal(result.points>=70,expected>=70,'pass decision');
}
assert.throws(()=>Controller.allocateExamPoints(['A','A'],{},[5,5]),/contract/);
assert.throws(()=>Controller.allocateExamPoints(['A'],{A:{ratio:1.01}},[5]),/score/);
assert.throws(()=>Controller.allocateExamPoints(['A'],{A:{ratio:0.5}},[0]),/score/);
const empty=Array(15).fill(0);
assert.equal(calc(empty,weights26).displayed.every(n=>n===0),true,'no phantom points on unanswered');
// Real Controller.finishExam uses the same integer allocator, and the persisted
// review/history topic subtotals must equal the 100-point result.
function finish(ratios,expected,force=true){
 const examScores=scores(ratios),session={ids,startedAt:100,endAt:100000,status:'RUNNING',scores:examScores,evidenceVersion:1};
 const oldHistory={points:38,passed:false,topicScores:{old:{earned:38,possible:100}},setSignature:'previous'};
 let review,rewarded=0,recorded=0,saved=0,focused=false;
 const model={state:{examSession:session,examAttempt:1,examHistory:[oldHistory],legacyProvenance:{pending:{examScores:[]}}},
   record(){recorded++;},clearDrafts(){},refreshEvidenceIntegrity(){},save(){saved++;return true;}};
 const controller={model,unansweredExamIds:Controller.prototype.unansweredExamIds,
   questions:Object.fromEntries(ids.map((id,i)=>[id,{category:i%2?'ledger':'journal'}])),
   rpg:{level:1,role:'staff',recordMastery(){},reward(){rewarded++;}},stopExamTimer(){},
   document:{body:{classList:{remove(){}}},getElementById(){return{focus(){focused=true;}};}},
   view:{examResult(result){review=result;},show(){}}};
 const result=Controller.prototype.finishExam.call(controller,force,1000,true);
 assert.equal(result,true,'finishExam complete');
 assert.equal(review.points,expected,'review score');
 assert.equal(review.passed,expected>=70,'review pass/fail');
 assert.equal(sum(review.items.map(r=>r.earned)),expected,'rendered question rows');
 assert.equal(sum(Object.values(review.topicScores).map(r=>r.earned)),expected,'rendered topic subtotals');
 assert.equal(sum(review.items.map(r=>r.points)),100,'question point weights');
 assert.equal(sum(Object.values(review.topicScores).map(r=>r.possible)),100,'topic possible weights');
 assert.equal(model.state.examSession,null,'exam ended');
 assert.equal(model.state.examHistory.length,2,'one new exam history row');
 assert.equal(model.state.examHistory[0],oldHistory,'historical entry identity unchanged');
 assert.equal(model.state.examHistory[1].points,expected,'persisted history score');
 assert.equal(sum(Object.values(model.state.examHistory[1].topicScores).map(r=>r.earned)),expected,'persisted history topics');
 assert.equal(model.state.examAttempt,2,'attempt advances once');
 assert.equal(recorded,ratios.length,'all 15 learning records still processed');
 assert.equal(saved,1,'single save');
 assert.equal(focused,true,'exam result focus');
 return {review,model,session};
}
finish(tie,5);
finish(Array(15).fill(0),0);
finish(Array(15).fill(1),100);
let cases=0,seed=0x12345678;
const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return seed>>>0};
for(const weights of [weights26,weights27])for(let trial=0;trial<25000;trial++){
 const ratios=ids.map(()=>{const den=random()%30+1;return (random()%(den+1))/den;});
 const expected=Math.round(ratios.reduce((acc,ratio,i)=>acc+ratio*weights[i],0));
 const result=calc(ratios,weights);
 assert.equal(result.points,expected);
 assert.equal(sum(result.displayed),expected);
 assert(result.displayed.every((v,i)=>Number.isSafeInteger(v)&&v>=0&&v<=weights[i]));
 cases++;
}
console.log('ISSUE259_SCORE_BREAKDOWN_PASS: integration/history/tie/unanswered/69/70/100; random='+cases);
