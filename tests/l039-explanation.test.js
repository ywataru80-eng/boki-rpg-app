'use strict';
const assert=require('assert'),fs=require('fs'),vm=require('vm'),crypto=require('crypto');
const Model=require('../js/explanation-model');
const s={window:{}};vm.runInNewContext(fs.readFileSync('data/questions.js','utf8'),s);const q=s.window.QuestionData.L039;
// Independent period allocation from the prompt, not answer values.
const principal=Number(q.question.match(/借入金([\d,]+)円/)[1].replaceAll(',','')),rate=Number(q.question.match(/年利率([\d.]+)%/)[1]);
const yearly=principal*rate/100,monthly=yearly/12,previous=monthly*6,current=monthly*6,expense=yearly-previous+current;
assert.deepStrictEqual(JSON.parse(JSON.stringify(q.answer.cells)),{priorAccrual:previous,reversal:previous,annualPayment:yearly,currentAccrual:current,profitTransfer:expense,nextBalance:expense-expense});
assert.strictEqual(yearly+current,previous+expense,'expense ledger independently balances');
for(const correct of [true,false]){
 const m=Model.build(q,correct?q.answer:{cells:{}},{correct});const text=JSON.stringify([m.calculation,m.transfer]);
 for(const term of ['前期に費用計上済み','二重計上','前期10月〜3月','当期4月〜9月','−9,000 ＋ 18,000 ＋ 9,000 = 18,000','当期10月〜3月','負債','支払利息勘定の貸方','損益勘定の借方','未払利息勘定','次期繰越0円'])assert(text.includes(term),'missing reasoning: '+term);
 assert(m.checks.length>0,'supplementary independent check');
}
// PR219's fixed baseline remains authoritative except the separately approved
// L044/L045 prompt/explanation fields; all remaining fields are byte-equivalent.
const cp=require('node:child_process'),old={window:{}};
vm.runInNewContext(cp.execFileSync('git',['show','37086c6ae6511a249218533375bf6f19dac231d1:data/questions.js'],{encoding:'utf8',maxBuffer:8*1024*1024}),old);
const project=data=>{
 const result=JSON.parse(JSON.stringify(data));
 for(const id of ['L044','L045'])for(const key of ['question','explanation','explanationModel'])delete result[id][key];
 delete result.J148.story; // J148's approved story-only successor is tested independently.
 return result;
};
assert.notStrictEqual(s.window.QuestionData.J148.story,old.window.QuestionData.J148.story,'J148 successor must differ from historical story');
assert.match(s.window.QuestionData.J148.story,/商品販売.*約束手形/,'J148 story must align with the promissory-note sale');
assert.deepStrictEqual(project(s.window.QuestionData),project(old.window.QuestionData),'298 questions including L039, and all other fields of L044/L045 unchanged');
console.log('L039 period allocation, teaching and protected data: PASS');
