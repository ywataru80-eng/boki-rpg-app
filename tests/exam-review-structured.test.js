'use strict';
// Test rendering paths and the absence of on-screen duplicate guidance.
// Browser/PWA test and accounting checks are separate mandatory gates.
const assert = require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const sandbox={window:{},console};
vm.runInNewContext(fs.readFileSync('data/questions.js','utf8'),sandbox,{filename:'data/questions.js',timeout:15000});
vm.runInNewContext(fs.readFileSync('js/view.js','utf8'),sandbox,{filename:'js/view.js',timeout:15000});
const ExplanationModel=require('../js/explanation-model');
const data=sandbox.window.QuestionData, ids=Object.keys(data).sort();
assert.equal(ids.length,300);
const before=JSON.stringify(data);
class Element {
 constructor(tag){this.tagName=tag;this.children=[];this.textContent='';this.dataset={};this.className='';this.hidden=false;}
 append(...n){this.children.push(...n);}
 replaceChildren(...n){this.children=[...n];}
 setAttribute(){}
}
const elements={};
const document={createElement:tag=>new Element(tag),getElementById:id=>elements[id]||(elements[id]=new Element('div'))};
const view=new sandbox.window.AppView(document);
const sectionsFor=(node,name)=>{const found=[];const visit=n=>{if(n.className===name)found.push(n);for(const c of n.children||[])visit(c);};visit(node);return found;};
let routeCount=0,accountCount=0;
view.answerReviewBlock=()=>new Element('section');
view.renderAchievement=()=>{};view.renderDiagnostics=()=>null;view.renderLearningTakeaway=()=>{};
view.renderAccountNature=(question,container)=>{accountCount++;if(['journal','correction'].includes(question.type)){const card=new Element('section');card.className='account-nature-explanation';card.textContent='account nature';container.append(card);}};
view.renderStructuredExplanation=(question,answer,score)=>{
 routeCount++;
 const model=ExplanationModel.build(question,answer,{correct:score.correct},{diagnostics:[]});
 assert(model.sources.length>0,question.id+': evidence');
 assert(model.summary.length>0,question.id+': learner reasoning');
 // Deliberate one-question fallback; other 299 route to structured content.
 if(question.id==='J002')return null;
 const out=new Element('section');out.className='explanation-flow';out.textContent='structured '+question.id;
 return out;
};
// Test full 300-ID sweep, including correct, incorrect and unanswered modes.
for(const status of ['correct','incorrect','unanswered']){
 const items=ids.map(id=>({id,earned:status==='correct'?2:0,points:2,correct:status==='correct',topic:data[id].category,
 answer:status==='unanswered'?null:status==='correct'?data[id].answer:
 (data[id].type==='journal'?{debit:[],credit:[]}:{cells:{}})}));
 view.examResult({points:status==='correct'?100:0,passed:status==='correct',unansweredCount:status==='unanswered'?300:0,items},data,[],{});
 const details=elements.explanation.children.filter(x=>x.tagName==='details');
 assert.equal(details.length,300,status+': all 300 review rows');
 details.forEach((row,index)=>{
  const id=ids[index],q=data[id];
  const main=sectionsFor(row,'exam-review-explanation');
  assert.equal(main.length,1,id+': one explanation block');
  assert.equal(sectionsFor(row,'account-nature-explanation').length,['journal','correction'].includes(q.type)?1:0,id+': one optional account guide');
  if(['journal','correction'].includes(q.type)){
   const nature=row.children.find(n=>n.className==='explanation-supplement');
   assert(nature,id+': account detail disclosure');
   assert.equal(nature.children[0].tagName,'summary');
   assert.equal(nature.children[1].className,'account-nature-explanation');
  }else assert(!row.children.some(n=>n.className==='explanation-supplement'),id+': no empty disclosure');
  if(id==='J002')assert.equal(main[0].textContent,q.explanation,id+': legacy explanation fallback');
  else assert.equal(sectionsFor(main[0],'explanation-flow').length,1,id+': structured lesson');
 });
}
assert.equal(routeCount,900,'300 questions × 3 review states');
assert.equal(accountCount,510,'170 journal/correction questions × 3 review states');
// Ordinary lesson's primary card must not repeat the account explanations.
for(const status of ['correct','incorrect']){
 for(const id of ['J017','J045','E001','D002']){
  const q=data[id],score={correct:status==='correct'};
  view.renderExplanation(q,score,status==='correct'?q.answer:null);
  const container=elements.explanation;
  const nature=sectionsFor(container,'account-nature-explanation');
  assert.equal(nature.length,['journal','correction'].includes(q.type)?1:0,id+': account guidance retained');
  if(nature.length){
   const topLevel=container.children.filter(node=>node.className==='account-nature-explanation');
   assert.equal(topLevel.length,0,id+': repetitive account guide must not be primary');
   assert(container.children.some(node=>node.className==='explanation-supplement'),id+': additional guidance disclosed');
  }
 }
}
assert.equal(JSON.stringify(data),before,'canonical content unchanged');
console.log('EXAM_REVIEW_STRUCTURED_V2_PASS: 900 review states, 510 account supplements, 8 study routes, no content mutation');
