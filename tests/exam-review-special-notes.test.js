'use strict';
// Four-way safeguard: preserve protected authored reasoning; never invent a
// diagnosis for a genuinely unanswered exam question.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const ctx={window:{},console};
for(const name of ['data/accounting-domain.js','data/questions.js','js/feedback.js','js/explanation-formulas.js','js/explanation-model.js','js/view.js']){
 vm.runInNewContext(fs.readFileSync(name,'utf8'),ctx,{filename:name,timeout:15000});
 if(name==='data/accounting-domain.js')ctx.AccountingDomain=ctx.window.AccountingDomain;
}
class El{constructor(tag){this.tagName=tag;this.children=[];this.className='';this.textContent='';this.dataset={};this.classList={add(){}};}
 append(...nodes){this.children.push(...nodes);}setAttribute(){} }
const view=new ctx.window.AppView({createElement:tag=>new El(tag)}),data=ctx.window.QuestionData;
const seek=(node,fn)=>[...(fn(node)?[node]:[]),...(node.children||[]).flatMap(x=>seek(x,fn))];
const body=node=>[node.textContent||'',...(node.children||[]).map(body)].join(' ');
const mustExist={J020:['補給時点'],J030:['負担の区別'],J070:['月末の確認'],J080:['納付期限日の処理'],J120:['処理の範囲'],J130:['納付総額の確認'],J147:['決算時の処理'],D002:['表示上の注意'],D020:['収益の振替','費用の振替','当期純利益の振替']};
let reviewed=0,allNoteRows=0;
for(const [id,labels] of Object.entries(mustExist)){
 const q=data[id];assert(q,id+': missing question');
 for(const correct of [false,true]){
  const answer=correct?q.answer:q.type==='journal'?{debit:[],credit:[]}:{cells:{}};
  const render=view.renderStructuredExplanation(q,answer,{correct});
  const notes=seek(render,n=>n.className==='explanation-flow-section explanation-special-note');
  const noteText=notes.map(body).join(' ');
  for(const label of labels) assert(noteText.includes(label),id+': special note '+label+' lost');
  const disclose=seek(render,n=>n.tagName==='details');
  for(const n of notes)assert(disclose.some(d=>seek(d,x=>x===n).length),id+': special note must be inside disclosure');
  allNoteRows+=notes.length;reviewed++;
 }
}
// An omitted answer must never be presented as an inferred error cause.
let skipped=0;
for(const q of Object.values(data)){
 const el=view.renderStructuredExplanation(q,null,{correct:false});
 assert(el,q.id+': missing-answer lesson');
 const headings=seek(el,n=>n.tagName==='h5').map(x=>x.textContent).join(' ');
 assert(!headings.includes('原因の候補'),q.id+': no invented cause for unanswered');
 skipped++;
}
console.log('EXAM_SPECIAL_NOTES_PASS:',reviewed,'priority reviews;',allNoteRows,'protected note blocks;',skipped,'unanswered');
