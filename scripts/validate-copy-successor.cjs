'use strict';
// Release228/Generation181: scoped user-visible copy and independent prose inventory.
// Not an acceptance certificate for 300 individual texts or pedagogical effectiveness.
const assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process'),crypto=require('node:crypto');
const BASE='dee5bb92886cd23495cc253bf2404a5f28c4c783';
const OLD='20261028-227',RELEASE='20261029-228';
const LOCK='reports/auto-gate/audit-locks/phase-b-generation-181.json';
const raw=(...x)=>cp.execFileSync('git',x,{encoding:'utf8',maxBuffer:64*1024*1024});
const git=(...x)=>raw(...x).toString('utf8').trim();
const read=p=>fs.readFileSync(p,'utf8');
const old=p=>raw('show',BASE+':'+p).toString('utf8');
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const list=(...x)=>git(...x).split('\n').filter(Boolean);
const expected=[
 '.github/workflows/question-quality-ledger-audit.yml',
 'form-a.html','index.html','js/controller.js','js/form-a.js','package.json',
 'pwa-release-manifest.json',LOCK,'scripts/audit-user-facing-prose.cjs',
 'scripts/validate-copy-successor.cjs','service-worker.js',
 'tests/audit-matrix.test.js','tests/learning-recommendation-ux.test.js',
 'tests/user-facing-copy-contract.test.js'
].sort();
assert.equal(git('merge-base',BASE,'HEAD'),BASE,'accepted Release227 ancestry required');
const files=[...new Set([
 ...list('diff','--name-only',BASE,'HEAD'),
 ...list('diff','--name-only','HEAD'),
 ...list('diff','--cached','--name-only'),
 ...list('ls-files','--others','--exclude-standard').filter(x=>x!=='historical-quality/'&&x!=='artifacts/form-a-grade-results.json')
])].sort();
assert.deepEqual(files,expected,'Release228 strict approved file scope');
for(const p of [
 'data/questions.js','data/accounting-domain.js','data/accounting-oracle.js','data/form-a.json',
 'js/engine.js','js/model.js','js/rpg.js','js/view.js',
 'js/feedback.js','js/explanation-model.js','js/explanation-formulas.js','js/form-a-store.js',
 'js/form-a-scoring.js','js/app.js','css/style.css','css/form-a.css',
 'reports/auto-gate/audit-locks/phase-b-generation-180.json'
]) assert.equal(read(p),old(p),'protected data/grade/history '+p);
const originalController=old('js/controller.js');
const beforeReview='${mission.dueCount}問の復習期限が来ています。期限が来た問題から再戦します。';
const afterReview='復習する問題が${mission.dueCount}問あります。復習モードから取り組みましょう。';
assert(originalController.includes(beforeReview),'old review explanation baseline');
const reviewCardOld='make(\'strong\', \'\', \`\u0024{dueIds.length}問の復習期限が来ています\`)';
const reviewCardNew='make(\'strong\', \'\', \`復習する問題が\u0024{dueIds.length}問あります。\`)';
const explanationOld="first ? \`\u0024{first.category || '学習済み問題'}から復習を始めます。期限前の問題は前倒ししません。\` : '期限が来た問題から復習します。'";
const explanationNew="first ? \`\u0024{first.category || '学習済み問題'}から取り組みます。復習期限前の問題は含まれません。\` : '復習期限に達した問題から取り組みます。'";
let expectedController=originalController.replace(beforeReview,afterReview);
for(const [before,after] of [[reviewCardOld,reviewCardNew],[explanationOld,explanationNew]]){
 assert.equal(expectedController.split(before).length,2,'old review card must be unique');
 expectedController=expectedController.replace(before,after);
}
assert.equal(read('js/controller.js'),expectedController,'controller may change only three review copy strings');
const oldForm=old('js/form-a.js');
const updates=[
 ['この保存領域での提示 ','このブラウザーの記録では'],
 [' 回目。入力は自動保存します。','回目の挑戦です。入力内容は自動保存されます。'],
 ['この保存領域で最初に提示した試行の結果です。過去の閲覧経験は不明です。','このブラウザーに保存されている最初の挑戦の結果です。別の端末で学習したかどうかは分かりません。'],
 ['再受験の結果です。この保存領域での最初の結果は変更されません。','2回目以降の挑戦です。最初の結果はそのまま残ります。'],
 ['保存領域を利用できます。開始すると最初の提示を記録します。','準備できました。「確認を始める」を押すと、最初の挑戦として記録します。']
];
let next=oldForm;for(const [a,b] of updates){assert.equal(next.split(a).length,2,'form copy anchor '+a);next=next.replace(a,b);}
assert.equal(read('js/form-a.js'),next,'Form A UI must change only four wording fragments');
assert.equal(read('service-worker.js'),old('service-worker.js').replaceAll(OLD,RELEASE),'SW release token only');
const manifest=JSON.parse(read('pwa-release-manifest.json')),prev=JSON.parse(old('pwa-release-manifest.json'));
assert.equal(manifest.release,RELEASE);assert.equal(manifest.previousRelease,OLD);
assert.deepEqual(Object.keys(manifest.assets),Object.keys(prev.assets));
assert.deepEqual(Object.keys(manifest.pages),Object.keys(prev.pages));
for(const f of Object.keys(prev.assets))assert.equal(manifest.assets[f],sha(f),'manifest current asset '+f);
for(const f of Object.keys(prev.pages))assert.equal(manifest.pages[f],sha(f),'manifest current page '+f);
for(const f of ['index.html','form-a.html'])assert(read(f).includes(RELEASE),'shell version token '+f);
for(const f of ['js/form-a.js','js/controller.js'])assert.notEqual(sha(f),crypto.createHash('sha256').update(old(f)).digest('hex'),'expected copy actually changed: '+f);
assert(read('index.html').includes('独立トレーニング・Form A')&&read('form-a.html').includes('本編のストーリーと独立しています。'),'assessment scope not disclosed');
assert(!read('form-a.html').includes('保存領域での初回提示'),'legacy UI copy survived');
assert(read('package.json').includes('node tests/user-facing-copy-contract.test.js && node scripts/audit-user-facing-prose.cjs'),'mandatory quality test routing');
assert(read('tests/audit-matrix.test.js').includes("'20261029-228':'scripts/validate-copy-successor.cjs'"),'matrix route');
assert(read('.github/workflows/question-quality-ledger-audit.yml').includes("'20261029-228': 'scripts/validate-copy-successor.cjs'"),'CI route');
assert.equal(read(LOCK).length>15000,true,'successor lock missing');
const l=JSON.parse(read(LOCK));assert.equal(l.generation,181);assert.equal(l.predecessor.generation,180);
const phase=require('./qa/phase-b-lifecycle');
const v=list('ls-tree','-r','--name-only','HEAD','--',LOCK).includes(LOCK)?phase.verifyCurrent():phase.verifyCandidate(l);
assert(v.ok,'Generation181 invalid: '+v.errors.join('; '));
console.log('RELEASE228_COPY_GEN181_PASS; audit inventory is not individual editorial certification');
