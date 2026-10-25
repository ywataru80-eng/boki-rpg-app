'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process'),crypto=require('node:crypto'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const base='fb8cf8a7a93fe3190a2d031679bf0f9179252d11',older='20261025-220',release='20261025-221';
const git=(...args)=>cp.execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:64*1024*1024}).trim();
const read=p=>fs.readFileSync(path.join(root,p),'utf8'),original=p=>cp.execFileSync('git',['show',base+':'+p],{cwd:root,encoding:'utf8'});
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex');
assert.equal(git('merge-base',base,'HEAD'),base,'must be a successor of accepted Release220');
const changes=git('diff','--name-only',base,'HEAD').split('\n').filter(Boolean).sort();
const expected=[
  '.github/workflows/question-quality-ledger-audit.yml','form-a.html','index.html','js/view.js',
  'pwa-release-manifest.json','reports/auto-gate/audit-locks/phase-b-generation-168.json',
  'reports/auto-gate/audit-locks/phase-b-generation-169.json',
  'scripts/validate-special-account-reason-successor.cjs','service-worker.js',
  'tests/account-nature-teaching.test.js','tests/audit-matrix.test.js'
].sort();
assert.deepEqual(changes,expected,'Release221 scope must remain the eleven reviewed files');
assert.equal(git('status','--porcelain','--untracked-files=no'),'','tracked tree must be clean');
for(const file of ['data/questions.js','data/accounting-domain.js','data/accounting-oracle.js','js/engine.js',
  'js/model.js','js/controller.js','js/rpg.js','js/app.js','js/feedback.js',
  'js/explanation-model.js','js/explanation-formulas.js','js/explanation-design-system.js',
  'reports/auto-gate/audit-locks/phase-b-generation-166.json',
  'reports/auto-gate/audit-locks/phase-b-generation-167.json',
  'scripts/validate-account-nature-successor.cjs','manifest.webmanifest','css/style.css']){
  assert.equal(read(file),original(file),file+' immutable baseline');
}
for(const file of ['index.html','form-a.html','service-worker.js'])
  assert.equal(read(file),original(file).replaceAll(older,release),file+' release-id only');
const oldView=original('js/view.js'),newView=read('js/view.js');
const oldStart=oldView.indexOf('        reason.textContent = movement\n');
const oldEnd=oldView.indexOf('        li.append(strong, reason);',oldStart);
const newStart=newView.indexOf('        // Special accounts are not ordinary five-element balances.');
const newEnd=newView.indexOf('        li.append(strong, reason);',newStart);
assert(oldStart>=0&&oldEnd>oldStart&&newStart>=0&&newEnd>newStart,'special account exact anchors');
assert.equal(newView.slice(0,newStart),oldView.slice(0,oldStart),'view code before reasons unchanged');
assert.equal(newView.slice(newEnd),oldView.slice(oldEnd),'view code after reasons unchanged');
for(const term of ['type === \'temporary\'','type === \'closing\'','paired(\'credit\', \'現金\')',
  'paired(\'debit\', \'現金\')','当期純利益','当期純損失','原因未判明','先に借方へ仮記録','先に貸方へ仮記録'])
  assert(newView.includes(term),'missing audited teaching branch '+term);
const oldMatrix=original('tests/audit-matrix.test.js'),routeOld="  '20261025-220':'scripts/validate-account-nature-successor.cjs'";
assert.equal(read('tests/audit-matrix.test.js'),oldMatrix.replace(routeOld,routeOld+",\n  '20261025-221':'scripts/validate-special-account-reason-successor.cjs'"),'test route-only change');
const oldWorkflow=original('.github/workflows/question-quality-ledger-audit.yml'),
  workflowOld="            '20261025-220': 'scripts/validate-account-nature-successor.cjs'";
assert.equal(read('.github/workflows/question-quality-ledger-audit.yml'),oldWorkflow.replace(workflowOld,workflowOld+",\n            '20261025-221': 'scripts/validate-special-account-reason-successor.cjs'"),'workflow route-only change');
const m=JSON.parse(read('pwa-release-manifest.json')),oldM=JSON.parse(original('pwa-release-manifest.json'));
assert.equal(m.release,release);
assert.equal(m.previousRelease,older);
assert.equal(Object.keys(m.assets).length,20);
assert.deepEqual(Object.keys(m.assets),Object.keys(oldM.assets),'PWA asset inventory unchanged');
assert.equal(Object.keys(m.pages).length,1);
for(const [p,h] of Object.entries({...m.assets,...m.pages}))assert.equal(hash(p),h,p+' SHA256 manifest');
assert.equal(m.assets['js/view.js'],hash('js/view.js'));
const prev=JSON.parse(read('reports/auto-gate/audit-locks/phase-b-generation-167.json'));
const g=JSON.parse(read('reports/auto-gate/audit-locks/phase-b-generation-168.json'));
const lifecycle=require('./qa/phase-b-lifecycle');
assert.equal(prev.generation,167);assert.equal(g.generation,168);
assert.deepEqual(g.predecessor,lifecycle.identity(prev),'immutable Generation167 linked');
const validity=lifecycle.verifyCurrent();
assert(validity.ok,'Generation168 authority invalid: '+validity.errors.join('; '));
const g169=JSON.parse(read('reports/auto-gate/audit-locks/phase-b-generation-169.json'));
assert.equal(g169.generation,169,'supplemental immutable candidate generation');
assert.deepEqual(g169.predecessor,lifecycle.identity(g),'Generation168 predecessor link');
assert.equal(validity.generation,169);
console.log('PASS Release221 successor: fixed 11-file scope; historical evidence; 20 assets; Generation169');
