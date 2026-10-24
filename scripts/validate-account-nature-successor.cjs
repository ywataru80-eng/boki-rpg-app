'use strict';
// Fail-closed Release220 successor gate. Never rewrite Release219 evidence.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const cp=require('node:child_process');
const crypto=require('node:crypto');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const base='e0070f468eeb0d814f3cd1c3a032a22ead5c8c1d';
const oldRelease='20261024-219',newRelease='20261025-220';
const git=(...args)=>String(cp.execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:64*1024*1024})).trim();
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const origin=p=>String(cp.execFileSync('git',['show',base+':'+p],{cwd:root,encoding:'utf8',maxBuffer:64*1024*1024}));
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex');
assert.equal(git('merge-base',base,'HEAD'),base,'Release220 must descend from immutable merged Release219');
const changed=git('diff','--name-only',base,'HEAD').split('\n').filter(Boolean).sort();
const expected=[
  '.github/workflows/question-quality-ledger-audit.yml',
  'data/accounting-domain.js','form-a.html','index.html','js/view.js','package.json',
  'pwa-release-manifest.json','reports/auto-gate/audit-locks/phase-b-generation-166.json',
  'scripts/validate-account-nature-successor.cjs','service-worker.js',
  'tests/account-nature-teaching.test.js'
].sort();
assert.deepEqual(changed,expected,'change scope must be exactly the 11 approved files');
assert.equal(git('status','--porcelain','--untracked-files=no'),'','Release220 checked-out files must be clean');
const forbidden=[
 'data/questions.js','data/accounting-oracle.js','js/engine.js','js/model.js','js/controller.js',
 'js/rpg.js','js/app.js','js/feedback.js','js/explanation-model.js','js/explanation-formulas.js',
 'js/explanation-design-system.js','css/style.css','manifest.webmanifest',
 'scripts/validate-category-successor.cjs'
];
for(const file of forbidden)assert.equal(read(file),origin(file),file+' must be byte-unchanged');
for(const file of ['index.html','form-a.html','service-worker.js']){
 const old=origin(file);
 assert(old.includes(oldRelease),file+' must start from Release219');
 assert.equal(read(file),old.replaceAll(oldRelease,newRelease),file+' release-id substitution only');
}
const baselineDomain=origin('data/accounting-domain.js');
const oldExp="'保険料','法人税、住民税及び事業税','雑損']";
const newExp="'保険料','広告宣伝費','支払家賃','法人税、住民税及び事業税','雑損']";
assert.equal(baselineDomain.split(oldExp).length,2,'account-domain single insertion anchor');
assert.equal(read('data/accounting-domain.js'),baselineDomain.replace(oldExp,newExp),
 'extend only verified correction-only expense classes; no taxonomy changes elsewhere');
const oldTest=JSON.parse(origin('package.json'));
const newTest=JSON.parse(read('package.json'));
assert.equal(newTest.scripts.test,'node tests/account-nature-teaching.test.js && '+oldTest.scripts.test,
 'new post-answer test must be prepended to full old regression suite');
oldTest.scripts.test=newTest.scripts.test;
assert.deepEqual(newTest,oldTest,'no dependency/config or QA command change');
const oldView=origin('js/view.js'),newView=read('js/view.js');
const originalResult="details.append(explanation); container.append(details);";
const newResult="details.append(explanation); this.renderAccountNature(question, details); container.append(details);";
assert.equal(oldView.split(originalResult).length,2,'unique original exam review');
assert.equal(oldView.split("      container.append(lead);").length,2,'unique post-score teaching anchor');
assert.equal(oldView.split("    renderExplanation(question, score, userAnswer) {").length,2,'unique method anchor');
const oldHead="    renderExplanation(question, score, userAnswer) {";
const idx=newView.indexOf("    renderAccountNature(question, container) {");
const end=newView.indexOf(oldHead,idx);
assert(idx>=0&&end>idx,'post-answer teaching method missing');
const insertion=newView.slice(idx,end);
assert(insertion.includes("question.type !== 'journal' && question.type !== 'correction'"),'limit account teaching to real journal formats');
assert(insertion.includes("const type = this.accountType(item.account)"),'reuse existing taxonomy');
assert(insertion.includes("type === 'contraAsset'"),'contra-asset exception');
assert(insertion.includes("type === 'temporary'")===false,'temporary and closing accounts must use generic special-case fallback');
assert(newView.includes("this.renderAccountNature(question, container);"),'answer feedback must include account teaching');
assert(newView.includes(newResult),'exam feedback must include account teaching');
const expectedView=oldView.replace(oldHead,insertion+oldHead)
  .replace("      container.append(lead);","      container.append(lead);\n      this.renderAccountNature(question, container);")
  .replace(originalResult,newResult);
assert.equal(newView,expectedView,'exact UI-only method and two post-answer call sites');
const m=JSON.parse(read('pwa-release-manifest.json'));
assert.equal(m.release,newRelease);
assert.equal(m.previousRelease,oldRelease);
assert.equal(Object.keys(m.assets).length,20);
assert.equal(Object.keys(m.pages).length,1);
for(const [file,h] of Object.entries({...m.assets,...m.pages}))assert.equal(sha(file),h,file+' manifest SHA mismatch');
const gen=JSON.parse(read('reports/auto-gate/audit-locks/phase-b-generation-166.json'));
assert.equal(gen.generation,166);
assert.equal(gen.predecessor.generation,165);
const check=require('./qa/phase-b-lifecycle').verifyCurrent();
assert(check.ok,'Generation166 current authority invalid: '+check.errors.join('; '));
assert.equal(check.generation,166);
const workflow=read('.github/workflows/question-quality-ledger-audit.yml');
const before=origin('.github/workflows/question-quality-ledger-audit.yml');
const a="'20261024-219': 'scripts/validate-category-successor.cjs'";
const w="'20261024-219': 'scripts/validate-category-successor.cjs',\n            '20261025-220': 'scripts/validate-account-nature-successor.cjs'";
assert.equal(before.split(a).length,2,'unique historical release-specific CI route');
assert.equal(workflow,before.replace(a,w),'old and new CI validator map exact');
console.log('PASS Release220 successor: 11-file scope, canonical 300 immutable, account taxonomy, post-answer UI, manifest 20/20, Generation166 valid');
