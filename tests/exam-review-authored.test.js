'use strict';
// Critical regression: rewriting exam review must retain source-specific teaching.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const files=['data/accounting-domain.js','data/questions.js','js/feedback.js','js/explanation-formulas.js','js/explanation-model.js','js/view.js'];
const sandbox={window:{},console};
for(const filename of files){vm.runInNewContext(fs.readFileSync(filename,'utf8'),sandbox,{filename,timeout:15000});if(filename==='data/accounting-domain.js')sandbox.AccountingDomain=sandbox.window.AccountingDomain;}
class Node{constructor(tag){this.tagName=tag;this.children=[];this.className='';this.dataset={};this.textContent='';this.classList={add(){}};}
 append(...n){this.children.push(...n);} setAttribute(){} }
const view=new sandbox.window.AppView({createElement:tag=>new Node(tag)});
const data=sandbox.window.QuestionData, ids=Object.keys(data);
assert.equal(ids.length,300);
const before=JSON.stringify(data);
const find=(node,pred)=>[...(pred(node)?[node]:[]),...(node.children||[]).flatMap(n=>find(n,pred))];
const text=node=>[node.textContent||'',...(node.children||[]).map(text)].join(' ');
let preserved=0,validated=0;
for(const q of Object.values(data))for(const correct of [true,false]){
  const answer=correct?q.answer:q.type==='journal'?{debit:[],credit:[]}:{cells:{}};
  const tree=view.renderStructuredExplanation(q,answer,{correct});
  assert(tree,q.id+': lesson must exist');
  const detail=find(tree,n=>n.className==='explanation-flow-section explanation-authored-detail');
  assert(detail.length<=1,q.id+': no duplicate source-specific lesson card');
  if(detail.length){
    const original=String(q.explanation||'').split('【')[0].trim();
    assert(original.length>0,q.id+': authored intro retained');
    assert(text(detail[0]).includes(original),q.id+': explanatory source text must not be truncated');
    const disclosure=find(tree,n=>n.tagName==='details');
    assert(disclosure.some(d=>find(d,n=>n===detail[0]).length),q.id+': further reasoning must be collapsed');
    preserved++;
  }
  validated++;
}
assert(preserved>=200,'Expected at least 100 unique question texts preserved for both outcomes');
for(const id of ['L039','L040','F003','C002']){
 const q=data[id],tree=view.renderStructuredExplanation(q,q.answer,{correct:true});
 assert.equal(find(tree,n=>n.className==='explanation-flow-section explanation-authored-detail').length,1,id+': author context retained');
}
assert.equal(JSON.stringify(data),before,'no changes to canonical questions');
console.log('EXAM_REVIEW_AUTHORED_PASS',validated,'rendered states,',preserved,'explanation supplements preserved');
