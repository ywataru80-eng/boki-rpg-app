'use strict';
// Verify the learner-facing structured model preserves authored reasoning and
// displays all exam-point contrast evidence without modifying any canonical answer.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),
      vm=require('node:vm'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..');
const baseline='8c85fbe9bdf1c529bf2bd4e7ff23cfb85140a7ec';
const script=f=>fs.readFileSync(path.join(root,f),'utf8');
const oldModel=cp.execFileSync('git',['show',baseline+':js/explanation-model.js'],{cwd:root,encoding:'utf8'});
const instantiate=modelSource=>{
 const ctx={window:{},console};
 for(const src of [script('data/questions.js'),script('js/feedback.js'),script('js/explanation-formulas.js'),modelSource])
  vm.runInNewContext(src,ctx,{timeout:15000});
 return ctx.window;
};
const accepted=instantiate(oldModel),candidate=instantiate(script('js/explanation-model.js'));
const ids=Object.keys(candidate.QuestionData);
assert.equal(ids.length,300);
let found=0,safe=0,reasonRows=0,totalRuns=0,otherRows=0;
for(const id of ids){
 const question=candidate.QuestionData[id];
 const previous=accepted.QuestionData[id];
 assert.equal(JSON.stringify(question),JSON.stringify(previous),id+' canonical question unchanged');
 const marker=String(question.explanation||'').match(/【試験のポイント】\s*([\s\S]*?)(?=\n【|$)/u)?.[1]?.trim()||'';
 for(const correct of [false,true]){
  const answer=question.type==='journal'?{debit:[],credit:[]}:{cells:{}};
  const score={correct};
  const before=accepted.ExplanationModel.build(previous,answer,score);
  const after=candidate.ExplanationModel.build(question,answer,score);
  assert.equal(JSON.stringify(after.transfer),JSON.stringify(before.transfer),id+' transfer/accounting preserved');
  assert.equal(JSON.stringify(after.calculation),JSON.stringify(before.calculation),id+' calculation preserved');
  assert.equal(JSON.stringify(after.sources),JSON.stringify(before.sources),id+' evidence source preserved');
  assert.equal(JSON.stringify(after.checks),JSON.stringify(before.checks),id+' arithmetic checks preserved');
  const oldSummary=before.summary.map(x=>x.text);
  const newSummary=after.summary.map(x=>x.text);
  if(marker&&!oldSummary.some(x=>x.includes(marker))){
   const added='試験のポイント：'+marker;
   assert.equal(newSummary.filter(x=>x===added).length,1,id+' point visible exactly once');
   assert.equal(JSON.stringify(newSummary.filter(x=>x!==added)),JSON.stringify(oldSummary),id+' other reason text unchanged');
   assert(after.summary.find(x=>x.text===added)?.evidenceRef==='explanation',id+' evidenced point');
   if(!correct)found++;
  }else{
   assert.equal(JSON.stringify(after),JSON.stringify(before),id+' untouched');
   if(!correct)safe++;
  }
  if(question.type==='journal'){
    const entries=question.answer.debit.length+question.answer.credit.length;
    assert.equal(after.transfer.length,entries,id+' all account/side entries represented');
    reasonRows+=correct?0:entries;
  }else if(!correct)otherRows++;
  totalRuns++;
 }
}
assert.equal(found,44,'44 authored exam-point lessons recovered');
assert.equal(safe,256,'256 questions do not change');
assert.equal(reasonRows,349,'349 journal account entries maintained');
assert.equal(otherRows,150,'other forms untouched');
assert.equal(totalRuns,600,'300 questions in wrong/correct states');
const show=candidate.ExplanationModel.build(candidate.QuestionData.J004,{debit:[],credit:[]},{correct:false})
 .summary.map(x=>x.text).join('\n');
assert(show.includes('未払金ではありません'),'purchase/payable contrast must surface to learner');
assert(candidate.ExplanationModel.build(candidate.QuestionData.J045,{debit:[],credit:[]},{correct:false})
 .summary.some(x=>x.text.includes('差額補充法')),'allowance difference contrast visible');
assert(candidate.ExplanationModel.build(candidate.QuestionData.E001,{cells:{}},{correct:false}).summary.some(x=>x.text.startsWith('試験のポイント：訂正仕訳は')),'E001 visible lesson');
assert(candidate.ExplanationModel.build(candidate.QuestionData.F002,{cells:{}},{correct:false}).summary.some(x=>x.text.includes('貸借差額から逆算')),'F002 visible lesson');
console.log('PASS 300 questions x 2 grade states=600, 44 authored exam points revealed, 256 questions unchanged, 349 journal transfer rows intact, no answer or calculation drift');
