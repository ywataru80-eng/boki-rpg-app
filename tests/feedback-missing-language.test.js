'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const Feedback=require('../js/feedback');
const sandbox={window:{}};
vm.runInNewContext(fs.readFileSync('data/questions.js','utf8'),sandbox);
const clone=v=>JSON.parse(JSON.stringify(v));
let questions=0,cases=0,missing=0;
for(const q of Object.values(sandbox.window.QuestionData)){
  if(q.type!=='journal')continue;
  questions++;
  const variants=[
    {debit:[],credit:[]},
    {debit:clone(q.answer.debit).slice(0,-1),credit:clone(q.answer.credit)},
    {debit:clone(q.answer.debit),credit:clone(q.answer.credit).slice(0,-1)},
    {debit:clone(q.answer.credit),credit:clone(q.answer.debit)}
  ];
  for(const attempt of variants){
    const before=JSON.stringify(q), answerBefore=JSON.stringify(attempt);
    const diagnoses=Feedback.diagnoseWrongAnswer(q,attempt,{correct:false});
    assert(Array.isArray(diagnoses),q.id+' diagnoses array');
    for(const d of diagnoses){
      assert(!/この要素を省くと取引の一部が記録されません|取引を構成する資産・負債・純資産・収益・費用の変化を列挙し/.test(d.reason+' '+d.nextRule),q.id+' avoid generic missing guidance');
      if(d.kind!=='missing')continue;
      missing++;
      assert.match(d.reason,/^(?:借方|貸方)に「[^」]+」[0-9,]+円を記入します。$/,q.id+' concrete side/account/amount');
      assert(d.nextRule&&d.nextRule.length>15,q.id+' substantive guidance');
    }
    assert.equal(JSON.stringify(q),before,q.id+' question unchanged');
    assert.equal(JSON.stringify(attempt),answerBefore,q.id+' attempt unchanged');
    cases++;
  }
}
assert.equal(questions,150);assert.equal(cases,600);assert(missing>=600);

let checkedEntries=0;
for(const q of Object.values(sandbox.window.QuestionData)){
  if(q.type!=='journal')continue;
  const sum=rows=>rows.reduce((total,row)=>total+Number(row.amount),0);
  assert.equal(sum(q.answer.debit),sum(q.answer.credit),q.id+' independent debit/credit balance');
  for(const side of ['debit','credit'])for(const row of q.answer[side]){
    const guidance=Feedback.transactionReason(q,row.account,side);
    assert(guidance&&guidance.length>=35,q.id+' substantive account-specific reason '+side+' '+row.account);
    assert(!/問題文で「[^」]+」に該当する取引を確認し|定義を登録できていない勘定|特殊勘定の増加・減少を取引の目的に沿って/u.test(guidance),
      q.id+' prohibit generic rationale '+side+' '+row.account);
    checkedEntries++;
  }
}
assert.equal(checkedEntries,349,'full journal account-side coverage');
const check=(id,account,side,reason)=>{
  assert(Feedback.transactionReason(sandbox.window.QuestionData[id],account,side).includes(reason),id+' '+side+' '+account+' requires '+reason);
};
check('J001','現金','debit','資産');
check('J001','資本金','credit','純資産');
check('J004','仕入','debit','費用');
check('J004','買掛金','credit','負債');
for(const id of ['J048','J098']){
  check(id,'仕入','debit','期首');
  check(id,'繰越商品','credit','期首');
  check(id,'繰越商品','debit','期末');
  check(id,'仕入','credit','期末');
}
check('J051','未払配当金','credit','負債');
check('J150','当座預金','debit','受取手形');
check('J150','受取手形','credit','債権');
check('J150','支払手形','debit','負債');
check('J150','当座預金','credit','支払手形');

const cashReversal=Feedback.diagnoseWrongAnswer(sandbox.window.QuestionData.J017,
  {debit:[{account:'現金',amount:5000}],credit:[{account:'現金過不足',amount:5000}]},
  {correct:false});
assert(cashReversal.some(d=>d.kind==='side'&&/帳簿上の現金/.test(d.reason)&&/実際有高/.test(d.reason)&&/一時的/.test(d.reason)),
  'cash-over-short rationale must take precedence over generic asset interpretation');
console.log('PASS missing feedback regression',JSON.stringify({questions,cases,missing}));
