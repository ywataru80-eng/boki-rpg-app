'use strict';
// Regression: in a finished exam, unanswered questions must not be diagnosed as mistakes.
// The underlying feedback engine produces missing-entry diagnostics for a null answer;
// examResult must distinguish deliberate omissions from incorrect submitted work.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const sandbox={window:{},console};
for(const filename of ['data/accounting-domain.js','data/questions.js','js/feedback.js','js/explanation-formulas.js','js/explanation-model.js','js/view.js']) {
  vm.runInNewContext(fs.readFileSync(filename,'utf8'),sandbox,{filename,timeout:20000});
  if(filename==='data/accounting-domain.js')sandbox.AccountingDomain=sandbox.window.AccountingDomain;
}
class E {
 constructor(tag){this.tagName=tag;this.children=[];this.className='';this._text='';this.dataset={};this.classList={add(){}};this.hidden=false;}
 append(...nodes){this.children.push(...nodes)}
 replaceChildren(...nodes){this.children=[...nodes];this._text='';}
 setAttribute(){}
 set textContent(v){this._text=String(v||'');this.children=[];}
 get textContent(){return this._text+this.children.map(x=>x.textContent).join('');}
}
const els={};const doc={createElement:tag=>new E(tag),getElementById:id=>els[id]||(els[id]=new E('div'))};
const view=new sandbox.window.AppView(doc);
view.renderAchievement=()=>{};
view.answerReviewBlock=()=>new E('section');
view.renderExamReviewExplanation=()=>new E('section');
view.renderAccountNature=()=>{};
const originals=sandbox.window.QuestionData;
const ids=Object.keys(originals).sort();assert.equal(ids.length,300);
const before=JSON.stringify(originals);
const all=(node,pred)=>[...(pred(node)?[node]:[]),...(node.children||[]).flatMap(n=>all(n,pred))];
let diagnosedWithoutAnswer=0,diagnosedWrong=0,diagnosedCorrect=0;
const realDiagnostics=view.renderDiagnostics.bind(view);
view.renderDiagnostics=(question,answer,score)=>{
 if(answer==null) diagnosedWithoutAnswer++;
 else if(!score.correct) diagnosedWrong++;
 else diagnosedCorrect++;
 return realDiagnostics(question,answer,score);
};
for(const state of ['unanswered','wrong','correct']) {
 const items=ids.map(id=>({id,topic:originals[id].category,correct:state==='correct',earned:state==='correct'?2:0,points:2,
   answer:state==='unanswered'?null:state==='correct'?originals[id].answer:
     originals[id].type==='journal'?{debit:[],credit:[]}:{cells:{}}}));
 view.examResult({points:state==='correct'?100:0,passed:state==='correct',unansweredCount:state==='unanswered'?300:0,items}, originals, [], {});
 const rows=els.explanation.children.filter(node=>node.tagName==='details');
 assert.equal(rows.length,300,`${state}: 300 exam rows`);
 for(let i=0;i<rows.length;i++) {
   const diagnostics=all(rows[i],node=>node.className==='wrong-answer-feedback');
   const expected=state==='wrong'?1:0;
   assert.equal(diagnostics.length,expected,`${ids[i]}: ${state} must ${expected?'show':'not show'} wrong-answer diagnostic`);
   if(state==='unanswered')assert(rows[i].children[0].textContent.includes('未回答'),`${ids[i]}: label unanswered`);
 }
}
assert.equal(diagnosedWithoutAnswer,0,'Never diagnose unanswered as incorrect');
assert.equal(diagnosedWrong,300,'Diagnose only 300 deliberately incorrect submissions');
assert.equal(diagnosedCorrect,0,'Do not diagnose correct submissions');
assert.equal(JSON.stringify(originals),before,'Canonical questions are immutable');
console.log('EXAM_REVIEW_UNANSWERED_PASS: 300 unanswered free of false diagnosis, 300 wrong have feedback, 300 correct no feedback');
