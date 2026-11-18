'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process'),vm=require('node:vm');
const BASE='b90b70db8eff129a396ff8ef977cc9336b7bf313';
const read=(file,prior)=>prior?cp.execFileSync('git',['show',BASE+':'+file],{encoding:'utf8',maxBuffer:32*1024*1024}):fs.readFileSync(file,'utf8');
const load=prior=>{
 const ctx={window:{},console};vm.createContext(ctx);
 for(const f of ['data/accounting-domain.js','data/questions.js','js/controller.js'])
  vm.runInContext(read(f,prior),ctx,{filename:f,timeout:30000});
 return ctx.window;
};
const original=load(true),next=load(false);
for(const [name,type] of [['商品','asset'],['売上原価','expense'],['固定資産除却損','expense']]){
 assert.equal(original.AccountingDomain.accountType(name),'unknown');
 assert.equal(next.AccountingDomain.accountType(name),type,name+' category');
}
const baseline=JSON.parse(JSON.stringify(original.QuestionData)),current=JSON.parse(JSON.stringify(next.QuestionData));
assert.equal(Object.keys(baseline).length,300);
assert.deepEqual(current,baseline,'2026 all 300 questions/answers/story unchanged');
assert.deepEqual(JSON.parse(JSON.stringify(next.ExamPoolDefinition)),JSON.parse(JSON.stringify(original.ExamPoolDefinition)),'2026 exam pool unchanged');
let count=0;
for(const q of Object.values(baseline).filter(q=>q.type==='journal')){
 for(const side of ['debit','credit'])for(const e of q.answer[side]||[]){
  for(const mode of ['story','exam']){
   const old=original.AppController.accountChoices(q,e.account,mode),now=next.AppController.accountChoices(current[q.id],e.account,mode);
   assert.deepEqual(JSON.parse(JSON.stringify(now)),JSON.parse(JSON.stringify(old)),q.id+' '+side+' '+mode);
   count++;
  }
 }
}
for(const account of ['商品','売上原価','固定資産除却損']){
 const q={id:'FY27_ACCOUNT_'+account,type:'journal',answer:{debit:[{account,amount:100}],credit:[{account:'現金',amount:100}]}};
 for(const mode of ['story','exam'])assert(next.AppController.accountChoices(q,account,mode).includes(account),account+' '+mode);
}
console.log('FY2027_ACCOUNT_COMPATIBILITY_PASS 300 questions '+count+' existing choices and three official accounts');
