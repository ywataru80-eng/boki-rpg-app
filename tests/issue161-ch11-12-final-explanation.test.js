'use strict';
const assert=require('assert'),fs=require('fs'),vm=require('vm');
const sandbox={window:{},console};
vm.createContext(sandbox);
for(const file of ['data/questions.js','js/explanation-formulas.js','js/feedback.js','js/explanation-model.js','js/explanation-design-system.js']){
  vm.runInContext(fs.readFileSync(file,'utf8'),sandbox,{filename:file});
}
const root=sandbox.window;
const target=Object.values(root.QuestionData).filter(q=>(/^E\d{3}$/u.test(q.id)&&Number(q.id.slice(1))>=11)||/^D\d{3}$/u.test(q.id)||/^F\d{3}$/u.test(q.id));
assert.strictEqual(target.length,40,'PR-G final explanation scope contains 40 questions');
assert.strictEqual(target.filter(q=>q.type==='correction').length,10,'final correction count');
assert.strictEqual(target.filter(q=>q.type==='worksheet').length,20,'final worksheet count');
assert.strictEqual(target.filter(q=>q.type==='financial_statement').length,10,'final financial-statement count');
assert.strictEqual(Object.values(root.QuestionData).filter(q=>q.teachingPresentation==='structured-always').length,300,'all 300 questions use structured teaching flow');
assert(target.every(q=>q.teachingPresentation==='structured-always'),'all final 40 questions opt into structured teaching flow');
assert(target.every(q=>q.explanationModel),'all final 40 expose explanationModel');
const profiles={};
for(const q of target){
  const wrong={cells:Object.fromEntries((q.table?.inputCells||[]).map(id=>[id,'']))};
  const model=root.ExplanationModel.build(q,wrong,{correct:false});
  const plan=root.ExplanationDesignSystem.planFor(q,{model,correct:false});
  profiles[plan.profileId]=(profiles[plan.profileId]||0)+1;
  assert(model.sources?.length,q.id+': source evidence');
  assert(model.summary?.length>=2,q.id+': learner strategy');
  assert(model.calculation?.length,q.id+': calculation guidance');
  assert(model.transfer?.length,q.id+': destination/transfer guidance');
  if(q.id!=='F001')assert(model.checks?.length,q.id+': independent check');
  assert(model.mistakes?.length,q.id+': wrong-answer diagnostic');
  const forbidden=new Set([...(q.table?.inputCells||[]),'before','adjustment','after']);
  for(const item of model.transfer)assert(!forbidden.has(String(item.to||'')),q.id+': no raw transfer destination '+String(item.to||''));
  for(const id of q.table?.inputCells||[])assert(!model.transfer.some(item=>String(item.to||'')===id),q.id+': no raw input key');
  assert(plan.components.some(item=>item.id==='goal'),q.id+': goal component');
  assert(plan.components.some(item=>item.id==='source'),q.id+': source component');
  assert(plan.components.some(item=>item.id==='decision'),q.id+': decision component');
  assert(plan.components.some(item=>item.id==='transfer'),q.id+': transfer component');
  if(model.checks?.length)assert(plan.components.some(item=>item.id==='check'),q.id+': check component');
}
assert.deepStrictEqual(JSON.parse(JSON.stringify(profiles)),{correction:10,closingDecision:17,worksheet:1,adjustedTrial:1,closingEntries:1,financialPL:1,financialBS:9},'final 40 teaching-profile distribution');
for(const id of Array.from({length:17},(_,i)=>'D'+String(i+2).padStart(3,'0'))){
  const model=root.ExplanationModel.build(root.QuestionData[id],{cells:{}},{correct:false});
  assert(model.transfer.every(item=>!['before','adjustment','after'].includes(String(item.to||''))),id+': worksheet destinations are learner-facing Japanese');
}
const f1=root.ExplanationModel.build(root.QuestionData.F001,{cells:{}},{correct:false});
assert.strictEqual(f1.checks.length,0,'F001 omits a fake check that would only repeat the profit calculation');
assert.strictEqual(f1.transfer.length,4,'F001 keeps all four answer destinations');
assert(f1.transfer.filter(item=>item.value==='上で求めた金額').length===2,'F001 calculated results are not numerically echoed in transfer cards');
for(const id of Array.from({length:9},(_,i)=>'F'+String(i+2).padStart(3,'0'))){
  const model=root.ExplanationModel.build(root.QuestionData[id],{cells:{}},{correct:false});
  assert.strictEqual(model.transfer.length,3,id+': balance-sheet answer destinations');
  assert(model.transfer.every(item=>item.value==='上で求めた金額'),id+': calculated balance-sheet values are not duplicated');
  assert(model.checks.some(item=>item.checkKind==='independent-balance'),id+': balance-sheet equality check');
}
console.log('ISSUE161_CH11_12_FINAL_EXPLANATION_PASS');