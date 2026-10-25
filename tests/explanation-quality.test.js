'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Feedback=require('../js/feedback'),Model=require('../js/explanation-model'),Formulas=require('../js/explanation-formulas');
const sandbox={window:{WrongAnswerFeedback:Feedback}};
vm.runInNewContext(fs.readFileSync('data/questions.js','utf8'),sandbox);
vm.runInNewContext(fs.readFileSync('js/view.js','utf8'),sandbox);
const questions=sandbox.window.QuestionData,view=Object.create(sandbox.window.AppView.prototype),clone=v=>JSON.parse(JSON.stringify(v));
assert.equal(Object.keys(questions).length,300);
let scenarios=0;
for(const q of Object.values(questions)){
  const before=JSON.stringify(q),wrong=clone(q.answer);
  if(q.type==='journal')wrong.debit[0].amount+=1;
  else {const id=Object.keys(wrong.cells).find(id=>typeof wrong.cells[id]==='number')||Object.keys(wrong.cells)[0];wrong.cells[id]=typeof wrong.cells[id]==='number'?wrong.cells[id]+1:'未入力';}
  for(const [answer,correct] of [[q.answer,true],[wrong,false]]){
    const model=Model.build(q,answer,{correct});
    assert(Model.validate(model).valid,q.id);
    assert(model.summary.length&&model.sources.length,q.id+' teaching must remain');
    assert(!/特殊勘定の増加・減少|払出単価内訳円|NaN|undefined/.test(JSON.stringify({...model,fallback:null})),q.id+' generated explanation');
    assert(correct?model.mistakes.length===0:model.mistakes.length>0,q.id+' actual attempt diagnostics');
    scenarios++;
  }
  assert.equal(JSON.stringify(q),before,q.id+' no mutation');
}
for(const id of ['L004','L009','L014','L019','L024','L029']){
  const q=questions[id];
  assert.equal(view.comparisonValue(q,'r3_unitPrice',1200),'1,200円／個',id);
  const diagnostic=Feedback.diagnoseWrongAnswer(q,{cells:{...q.answer.cells,r3_unitPrice:1201}},{correct:false});
  assert.equal(diagnostic.length,1);assert(diagnostic[0].reason.includes('1,201円／個ではなく1,200円／個'));
  const model=Model.build(q,q.answer,{correct:true});
  assert.equal(model.transfer[0].semanticType,'unitPrice');
  assert(model.checks.some(c=>c.expected.includes('数量：')&&c.expected.includes('金額：')&&!c.evidenceRefs.includes('answer.cells')));
}
for(const [id,months] of [['L025',6],['L030',4],['L033',9]]){
  const q=questions[id];assert.equal(view.comparisonValue(q,'months',months),months+'か月');
  const model=Model.build(q,q.answer,{correct:true});assert.equal(model.transfer.find(c=>c.to==='使用月数').semanticType,'months');
  assert(Feedback.diagnoseWrongAnswer(q,{cells:{...q.answer.cells,months:months+1}},{correct:false})[0].reason.includes(months+'か月'));
}
assert(!Feedback.humanLabel(questions.L049,'value1').includes('単価の金額'));
for(const id of ['J006','J017']){
  const q=questions[id],a=clone(q.answer);a.debit[0].account='現金';
  const ds=Feedback.diagnoseWrongAnswer(q,a,{correct:false});
  assert.equal(ds.length,1,id+' replacing an account is one correction, not a second missing-row instruction');assert.equal(ds[0].kind,'account');
}
assert.equal(Feedback.formatValue(5,'years'),'5年');assert.equal(Feedback.formatValue(25,'quantity'),'25個');
assert.equal(view.comparisonValue(questions.L034,'d1Ref',113),'113','folio is not money');
assert.equal(view.comparisonValue(questions.L049,'value1',1100),'1,100円／個','legacy amount metadata must not override price meaning');
for(const [id,account,fragments] of [
  ['J017','現金過不足',['不足額','借方に仮記入']],
  ['J018','現金過不足',['原因が判明','貸方に記入','再び減らしません']],
  ['J022','減価償却累計額',['売却','貸方残高','借方に記入']],
  ['J045','貸倒引当金',['必要額','差額','貸方に追加']],
  ['J046','貸倒引当金',['前期','取り崩す','借方']],
  ['J047','減価償却累計額',['当期','貸方に積み上げ','間接法']],
  ['J050','損益',['貸方残高','当期純利益','借方に記入']],
  ['J051','繰越利益剰余金',['配当の決議','借方に記入','未払配当金']]
]){
  const q=questions[id],decision=Model.build(q,q.answer,{correct:true}).transfer.find(x=>x.decision.startsWith(account+'：')).decision;
  for(const fragment of fragments)assert(decision.includes(fragment),id+' '+fragment);
}
const clearing=questions.J018;
const reversed=Feedback.diagnoseWrongAnswer(clearing,{debit:clone(clearing.answer.credit),credit:clone(clearing.answer.debit)},{correct:false});
assert(!reversed.some(d=>/現金を増やし|実際有高より少ない/.test(d.reason)),'clearing a shortage is not finding excess cash');
for(const id of ['J048','J098','J150']){
  const q=questions[id],answer=clone(q.answer);answer.debit[0].amount++;
  const ds=Feedback.diagnoseWrongAnswer(q,answer,{correct:false});
  assert.equal(ds.length,1,id+' only one amount is wrong');assert.equal(ds[0].kind,'amount',id+' both sides are intentional');
  const missing=clone(q.answer);missing.debit.shift();
  const omitted=Feedback.diagnoseWrongAnswer(q,missing,{correct:false});
  assert.equal(omitted.length,1,id+' one omitted entry');assert.equal(omitted[0].kind,'missing',id+' legitimate opposite entry is not a reversal');
}
for(const id of ['J045','J095','J145']){
  const q=questions[id],ds=Feedback.diagnoseWrongAnswer(q,{debit:clone(q.answer.credit),credit:clone(q.answer.debit)},{correct:false});
  const expense=ds.find(d=>d.title.includes('貸倒引当金繰入'));
  assert(expense.reason.includes('費用'));assert(!expense.reason.includes('資産の控除項目'),id+' provision expense is not the allowance account');
}
for(const id of ['L035','L036','L037','L038','L042','L043']){
  const m=Model.build(questions[id],questions[id].answer,{correct:true});
  assert(!m.transfer.some(item=>item.semanticType!=='amount'&&item.to==='金額'),id+' dates and names do not go in an amount field');
}
for(const id of ['E001','E004','E012','E015','C004','C006','C010'])assert(Model.build(questions[id],questions[id].answer,{correct:true}).summary.some(s=>s.evidenceRef==='explanation'),id+' authored transaction reason must reach the screen');
for(const [id,expression] of [['J006','200,000 + 6,000 = 206,000'],['J028','420,000 − 20,000 − 50,000 = 350,000'],['J022','120,000 − 100,000 = 20,000'],['E002','25,000 − 20,000 = 5,000']])assert(Model.build(questions[id],questions[id].answer,{correct:true}).calculation.some(c=>c.expression===expression),id+' concrete arithmetic');
const l001=Model.build(questions.L001,questions.L001.answer,{correct:true});
assert(l001.calculation.some(c=>c.expression==='305,000 + 53,000 = 358,000'));
assert(l001.calculation.some(c=>c.expression==='358,000 − 26,500 = 331,500'));
assert(l001.checks.some(c=>c.expected.includes('331,500 + 26,500 − 53,000 = 305,000')));
for(const id of ['D002','D019','D020']){
  const q=questions[id],m=Model.build(q,q.answer,{correct:true}),profile=view.explanationTeachingProfile(q);
  assert(!profile.transfer.includes('精算表'),id+' use actual form');
  assert(!m.summary.some(s=>/損益計算書と貸借対照表のどちら/.test(s.text)),id+' no irrelevant classification');
}
const incomplete=Formulas.build({type:'journal',explanation:'帳簿価額＝300,000－180,000です。'});
assert.equal(incomplete[0].result,null,'an unresolved expression is not its first operand');
assert.equal(Formulas.build({type:'journal',explanation:'300,000－180,000＝120,000円です。'})[0].result,120000);
const coincidental={...questions.T001,question:'資料番号2、日付3日、合計5円',table:{...questions.T001.table,rows:[]},answer:{cells:{total_debit:5,total_credit:5}}};
assert(!Feedback.diagnoseWrongAnswer(coincidental,{cells:{}},{correct:false}).some(d=>d.thinking.includes('2円 ＋ 3円')),'dates and numbers are not valid sum operands');
console.log(JSON.stringify({status:'PASS',questions:300,scenarios,regressions:'units, transaction reasons, shortage clearing, source checks, actual forms, unresolved formulas, unsupported subset sums'}));
