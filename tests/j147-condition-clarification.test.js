'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process'),vm=require('node:vm');
const BASE='db3119f44b78b1ea57b9327c5ed894d4bb309fbd';
const read=(p,prior)=>prior?cp.execFileSync('git',['show',BASE+':'+p],{encoding:'utf8',maxBuffer:32*1024*1024}):fs.readFileSync(p,'utf8');
const load=prior=>{const ctx={window:{},console};vm.createContext(ctx);for(const p of ['data/accounting-domain.js','data/questions.js','js/controller.js'])vm.runInContext(read(p,prior),ctx,{filename:p,timeout:30000});return ctx.window;};
const clone=x=>JSON.parse(JSON.stringify(x)),old=load(true),now=load(false),a=clone(old.QuestionData),b=clone(now.QuestionData);
assert.equal(Object.keys(a).length,300);assert.deepEqual(Object.keys(b),Object.keys(a));
for(const id of Object.keys(a)){assert.deepEqual(b[id].answer,a[id].answer,id+' answer');if(id!=='J147')assert.deepEqual(b[id],a[id],id+' immutable');}
const q=b.J147,prior=a.J147;
assert.deepEqual(Object.keys(q).filter(k=>JSON.stringify(q[k])!==JSON.stringify(prior[k])).sort(),['explanation','materials','question']);
assert(q.question.includes('期中は一勘定制で記帳している'));assert(JSON.stringify(q.materials).includes('一勘定制'));assert(q.explanation.includes('この問題では一勘定制を採用しているため'));
const balance=Number(q.question.match(/残高が([\d,]+)円/)[1].replaceAll(',','')),payment=Number(q.question.match(/仕入代金([\d,]+)円/)[1].replaceAll(',',''));
assert.equal(balance,30000);assert.equal(payment,80000);assert.equal(payment-balance,50000);
assert.deepEqual(q.answer,{debit:[{account:'仕入',amount:payment}],credit:[{account:'当座預金',amount:payment}]});
assert.deepEqual(clone(now.ExamPoolDefinition),clone(old.ExamPoolDefinition));
let count=0;for(const item of Object.values(a).filter(x=>x.type==='journal'))for(const side of ['debit','credit'])for(const e of item.answer[side]||[])for(const mode of ['story','exam']){assert.deepEqual(clone(now.AppController.accountChoices(b[item.id],e.account,mode)),clone(old.AppController.accountChoices(item,e.account,mode)));count++;}
assert.equal(count,698);console.log('J147_CONDITION_PASS 299 unchanged questions, 300 unchanged answers, 698 unchanged choice sets, independent 50000 overdraft');
