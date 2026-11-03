'use strict';
// Render the actual teaching model, not a fake teaching model.
// Protect the concepts most likely to be accidentally lost in explanation trimming.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const files=['data/accounting-domain.js','data/questions.js','js/feedback.js','js/explanation-formulas.js','js/explanation-model.js','js/view.js'];
const sandbox={window:{},console};
for(const f of files){
 vm.runInNewContext(fs.readFileSync(f,'utf8'),sandbox,{filename:f,timeout:15000});
 if(f==='data/accounting-domain.js')sandbox.AccountingDomain=sandbox.window.AccountingDomain;
}
class Element{
 constructor(tag){this.tagName=tag;this.textContent='';this.children=[];this.className='';this.dataset={};this.classList={add(){}};}
 append(...nodes){this.children.push(...nodes);}
 setAttribute(){}
}
const view=new sandbox.window.AppView({createElement:tag=>new Element(tag)});
const stringify=node=>[node.textContent||'',...(node.children||[]).map(stringify)].join(' ');
const checks={
 J017:['実際有高','現金過不足','仮勘定','借方','貸方','5,000'],
 J018:['通信費','現金は再び減らしません','現金過不足','3,000'],
 J045:['差額補充法','10,000','貸倒引当金繰入','貸倒引当金'],
 J047:['間接法','120,000','減価償却費','減価償却累計額'],
 D002:['次期分','31,500','63,000','189,000'],
 C002:['55,000','10,000','46,000','382,000','消費税'],
 C003:['5,000','9,000','40,000','45,000','前受']
};
let executed=0;
for(const [id,terms] of Object.entries(checks)){
 const q=sandbox.window.QuestionData[id];assert(q,id+': exists');
 for(const correct of [true,false]){
  const answer=correct?q.answer:q.type==='journal'?{debit:[],credit:[]}:{cells:{}};
  const node=view.renderStructuredExplanation(q,answer,{correct});
  assert(node,id+': structured explanation exists');
  const text=stringify(node);
  for(const term of terms)assert(text.includes(term),id+': explanation lost '+term);
  executed++;
 }
}
console.log('EXAM_REVIEW_CONTENT_PASS: '+executed+' important real-model review paths, essential explanations retained');
