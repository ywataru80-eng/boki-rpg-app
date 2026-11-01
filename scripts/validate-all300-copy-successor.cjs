'use strict';
// Release229 / Generation183. Prevent accidental accounting or history changes.
const assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process'),crypto=require('node:crypto');
const BASE='4067008230ad2fae5874d9e0e2e6caa8320ed3b0';
const ACCEPTED229='3ed53a7dc4f1a55785404b2f2690a71d7a0b9c39';
const FROM='20261029-228',TO='20261029-229';
const LOCK='reports/auto-gate/audit-locks/phase-b-generation-183.json';
const raw=(...args)=>cp.execFileSync('git',args,{encoding:'utf8',maxBuffer:64*1024*1024});
const git=(...args)=>raw(...args).toString('utf8').trim();
const read=p=>fs.readFileSync(p,'utf8');
const old=p=>raw('show',BASE+':'+p).toString('utf8');
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const list=(...args)=>git(...args).split('\n').filter(Boolean);
const EXPECT=[
 '.github/workflows/question-quality-ledger-audit.yml',
 '.github/workflows/reader-copy-300.yml',
 'form-a.html','index.html','js/controller.js','js/form-a.js','js/rpg.js','js/view.js',
 'package.json','pwa-release-manifest.json',LOCK,
 'scripts/audit-all300-reader-terminology.cjs','scripts/validate-all300-copy-successor.cjs',
 'service-worker.js','tests/audit-matrix.test.js','tests/user-facing-copy-contract.test.js'
].sort();
assert.equal(git('merge-base',BASE,'HEAD'),BASE,'baseline Release228 ancestry');
assert.equal(git('merge-base',ACCEPTED229,'HEAD'),ACCEPTED229,'accepted Release229 commit must remain an ancestor');
assert.deepEqual(list('diff','--name-only',BASE,ACCEPTED229).sort(),EXPECT,'accepted Release229 historical scope remains immutable');
const changed=[...new Set([
 ...list('diff','--name-only',ACCEPTED229,'HEAD'),
 ...list('diff','--name-only','HEAD'),
 ...list('diff','--cached','--name-only'),
 ...list('ls-files','--others','--exclude-standard').filter(s=>s!=='historical-quality/'&&s!=='artifacts/form-a-grade-results.json')
])].sort();
const postReleaseAuditFiles=['scripts/audit-all300-reader-terminology.cjs','scripts/audit-user-facing-prose.cjs','scripts/validate-all300-copy-successor.cjs'].sort();
assert.deepEqual(changed,postReleaseAuditFiles,'post-Release229 audit-only file scope mismatch');
// Keep the exact accepted 229 bytes as historical evidence; only the two
// targeted audit runtimes are allowed to gain the browser-domain preload.
const uniqueReplace=(value,from,to)=>{
 assert.equal(value.split(from).length,2,'expected unique audit-only patch anchor '+from.slice(0,90));
 return value.replace(from,to);
};
for(const [file,anchor,replacement] of [
 ['scripts/audit-user-facing-prose.cjs',
  'const {QuestionData,WorkCaseNarratives,AnchorScenes}=sandbox.window;',
  "const {QuestionData,WorkCaseNarratives,AnchorScenes}=sandbox.window;\nassert.equal(sandbox.AccountingDomain.accountType('未払配当金'),'liability','audit must use browser account taxonomy');\nassert(QuestionData.J051.explanation.includes('未払配当金は負債で'),'audited text must match browser runtime, not fallback taxonomy');"],
 ['scripts/audit-all300-reader-terminology.cjs',
  'const runtime=sandbox.window.QuestionData;',
  "const runtime=sandbox.window.QuestionData;\nassert.equal(sandbox.AccountingDomain.accountType('未払配当金'),'liability','audit must use browser account taxonomy');\nassert(runtime.J051.explanation.includes('未払配当金は負債で'),'audited text must match browser runtime, not fallback taxonomy');"]
]){
 let expected=raw('show',ACCEPTED229+':'+file).toString('utf8');
 expected=uniqueReplace(expected,'const sandbox={window:{},console};',
   "const sandbox={window:{},console};\n// Match index.html: the authoritative account classification loads before questions.js.\nvm.runInNewContext(read('data/accounting-domain.js'),sandbox,{filename:'data/accounting-domain.js',timeout:30000});\nsandbox.AccountingDomain=sandbox.window.AccountingDomain;");
 expected=uniqueReplace(expected,anchor,replacement);
 assert.equal(read(file),expected,'post-release audit patch must match exact reviewed changes: '+file);
}
for(const p of [
 'data/questions.js','data/accounting-domain.js','data/accounting-oracle.js',
 'data/form-a.json','js/engine.js','js/model.js','js/form-a-store.js','js/form-a-scoring.js',
 'js/app.js','js/feedback.js','js/explanation-formulas.js','js/explanation-model.js',
 'js/explanation-design-system.js','css/style.css','css/form-a.css',
 'reports/auto-gate/audit-locks/phase-b-generation-181.json',
 'reports/auto-gate/audit-locks/phase-b-generation-182.json'
])assert.equal(read(p),old(p),'protected user data or immutable audit authority '+p);
function replaceExact(file,replacements,{version=false}={}){
 let result=old(file);
 for(const [before,after] of replacements){
  assert.equal(result.split(before).length,2,'not a unique old reader-only label '+file+':'+before);
  result=result.replace(before,after);
 }
 if(version){assert(result.includes(FROM));result=result.replaceAll(FROM,TO);}
 assert.equal(read(file),result,'out-of-scope mutation in '+file);
}
replaceExact('index.html',[['伝票分類を練習する（独立トレーニング・Form A）','3伝票制の実務演習']],{version:true});
replaceExact('form-a.html',[
 ['伝票分類の確認 Form A | 簿記RPG','3伝票制の実務演習 | 簿記RPG'],
 ['伝票分類の確認 <span>独立練習 Form A</span>','3伝票制の実務演習'],
 ['取引IDを資料と照合してください。','取引A～Dの記号を資料と照らし合わせて回答してください。']
],{version:true});
assert.equal(read('service-worker.js'),old('service-worker.js').replaceAll(FROM,TO));
replaceExact('js/view.js',[
 ['月次決算 Boss Case','月次決算の特別案件'],
 ['年度決算 Boss Case','年度決算の特別案件'],
 ['LEVEL UP！ Lv.','レベルアップ！ Lv.'],
 ['NEW ROLE！「${achievement.role}」解放 — 新ツールと専用Boss Caseを確認できます','新しい役職「${achievement.role}」に昇格しました。新しい仕事と機能を確認できます']
]);
replaceExact('js/rpg.js',[
 ['Boss Case：月次決算','月次決算の特別案件'],
 ['Boss Case：年度決算','年度決算の特別案件']
]);
replaceExact('js/controller.js',[
 ['BOKI RPGが書き出した有効なJSONファイルを選んでください。','このアプリで保存したバックアップファイルを選んでください。']
]);
replaceExact('js/form-a.js',[
 ['const byId=id=>document.getElementById(id);',
  "const byId=id=>document.getElementById(id);\n  // Only the displayed prose is adapted; the assessed fixture, answer key and content identity remain unchanged.\n  const learnerText=value=>String(value).replaceAll('取引ID','取引の記号（A～D）');"],
 ["byId('question').textContent=scorer.fixture.question;","byId('question').textContent=learnerText(scorer.fixture.question);"],
 ["byId('explanation').textContent=scorer.fixture.explanation.initial;byId('supplement').textContent=scorer.fixture.explanation.supplement;",
  "byId('explanation').textContent=learnerText(scorer.fixture.explanation.initial);byId('supplement').textContent=learnerText(scorer.fixture.explanation.supplement);"]
]);
const previous=JSON.parse(old('pwa-release-manifest.json')),current=JSON.parse(read('pwa-release-manifest.json'));
assert.equal(current.release,TO);assert.equal(current.previousRelease,FROM);
assert.deepEqual(Object.keys(current.assets),Object.keys(previous.assets));
assert.deepEqual(Object.keys(current.pages),Object.keys(previous.pages));
for(const k of Object.keys(current.assets))assert.equal(current.assets[k],sha(k),'asset content digest '+k);
for(const k of Object.keys(current.pages))assert.equal(current.pages[k],sha(k),'page content digest '+k);
assert(read('package.json').includes('node scripts/audit-all300-reader-terminology.cjs && node scripts/audit-editorial.js'));
assert(read('tests/audit-matrix.test.js').includes("'20261029-229':'scripts/validate-all300-copy-successor.cjs'"));
assert(read('.github/workflows/question-quality-ledger-audit.yml').includes("'20261029-229': 'scripts/validate-all300-copy-successor.cjs'"));
const l=JSON.parse(read(LOCK));
assert.equal(l.generation,183);assert.equal(l.predecessor.generation,182);
const phase=require('./qa/phase-b-lifecycle');
const ver=list('ls-tree','-r','--name-only','HEAD','--',LOCK).includes(LOCK)?phase.verifyCurrent():phase.verifyCandidate(l);
assert(ver.ok,'immutable Generation183 '+ver.errors.join(';'));
console.log('RELEASE229_GEN183_PROTECTED_COPY_PASS; 300 text audit is terminology lint, not full editorial signoff');
