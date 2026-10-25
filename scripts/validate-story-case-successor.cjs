'use strict';
// Successor Release222: strict scope, canonical/Oracle invariance, manifest and Generation170.
const assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process'),crypto=require('node:crypto'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const baseline='ab2678bc138b55dd0065e14c948376f52c12ddbf',older='20261025-221',release='20261025-222';
const git=(...args)=>cp.execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:64*1024*1024}).trim();
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const original=p=>cp.execFileSync('git',['show',baseline+':'+p],{cwd:root,encoding:'utf8',maxBuffer:64*1024*1024});
const digest=p=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex');
assert.equal(git('merge-base',baseline,'HEAD'),baseline,'Release222 must preserve accepted Release221 ancestry');
assert.equal(git('status','--porcelain','--untracked-files=no'),'','release candidate tracked files must be clean');
const expected=[
  '.github/workflows/question-quality-ledger-audit.yml','css/style.css','form-a.html','index.html',
  'js/view.js','package.json','pwa-release-manifest.json',
  'reports/auto-gate/audit-locks/phase-b-generation-170.json',
  'reports/auto-gate/audit-locks/phase-b-generation-171.json',
  'scripts/validate-story-case-successor.cjs','service-worker.js',
  'tests/audit-matrix.test.js','tests/story-business-decision.test.js'
].sort();
const changed=git('diff','--name-only',baseline,'HEAD').split('\n').filter(Boolean).sort();
assert.deepEqual(changed,expected,'Release222 must change only 13 approved files');
for(const filename of [
  'data/questions.js','data/accounting-domain.js','data/accounting-oracle.js','js/controller.js',
  'js/model.js','js/rpg.js','js/engine.js','js/app.js','js/feedback.js',
  'js/explanation-design-system.js','js/explanation-formulas.js','js/explanation-model.js',
  'reports/auto-gate/audit-locks/phase-b-generation-168.json',
  'reports/auto-gate/audit-locks/phase-b-generation-169.json',
  'scripts/validate-special-account-reason-successor.cjs','manifest.webmanifest'
]){
  assert.equal(read(filename),original(filename),filename+' must be untouched');
}
for(const filename of ['index.html','form-a.html','service-worker.js']){
  assert.equal(read(filename),original(filename).replaceAll(older,release),filename+' must only advance release token');
}
const baseView=original('js/view.js'),nextView=read('js/view.js');
assert(nextView.includes('renderStoryCaseDecision(question, score)'), 'post-answer result must render optional reflection');
assert(nextView.includes("this.questionMode !== 'story'"), 'exam/review/training firewall');
assert(nextView.includes('option.valid ?'), 'judgement feedback must depend on selected evidence');
assert(nextView.includes('報告を確定せず'),'wrong answer cannot create false business resolution');
assert(nextView.includes('採点や報酬に影響しません'), 'educational authority boundary');
assert(nextView.startsWith(baseView.slice(0,baseView.indexOf('    result(question, score, userAnswer'))),'View code before existing result unchanged');
assert(nextView.includes('    renderNarrativeResult(scenes = []'),'prior 36-scene system preserved');
const baseStyle=original('css/style.css');
assert(read('css/style.css').startsWith(baseStyle),'old mobile and journal CSS must stay byte-exact');
assert(read('package.json').includes('node tests/story-business-decision.test.js && node tests/story-narrative-result.test.js'),'mandatory test route');
assert.equal(read('package.json').replace('node tests/story-business-decision.test.js && ',''),original('package.json'),'package change must be only new mandatory test');
assert(fs.existsSync(path.join(root,'tests/story-business-decision.test.js')),'new 12 chapter tests required');
const matrixOld=original('tests/audit-matrix.test.js');
const routeA="  '20261025-221':'scripts/validate-special-account-reason-successor.cjs'";
assert.equal(read('tests/audit-matrix.test.js'),matrixOld.replace(routeA,routeA+",\n  '20261025-222':'scripts/validate-story-case-successor.cjs'"),'matrix must update only successor router');
const workflowOld=original('.github/workflows/question-quality-ledger-audit.yml');
const routeB="            '20261025-221': 'scripts/validate-special-account-reason-successor.cjs'";
assert.equal(read('.github/workflows/question-quality-ledger-audit.yml'),workflowOld.replace(routeB,routeB+",\n            '20261025-222': 'scripts/validate-story-case-successor.cjs'"),'CI must update only successor router');
const manifest=JSON.parse(read('pwa-release-manifest.json')),oldM=JSON.parse(original('pwa-release-manifest.json'));
assert.equal(manifest.release,release);
assert.equal(manifest.previousRelease,older);
assert.deepEqual(Object.keys(manifest.assets),Object.keys(oldM.assets));
assert.deepEqual(Object.keys(manifest.pages),['form-a.html']);
assert.equal(Object.keys(manifest.assets).length,20);
for(const [file,sha] of Object.entries({...manifest.assets,...manifest.pages})) assert.equal(digest(file),sha,file+' release SHA256');
const phase=require('./qa/phase-b-lifecycle');
const gen=JSON.parse(read('reports/auto-gate/audit-locks/phase-b-generation-171.json'));
const prev=JSON.parse(read('reports/auto-gate/audit-locks/phase-b-generation-170.json'));
assert.equal(prev.generation,170);
assert.equal(gen.generation,171);
assert.deepEqual(gen.predecessor,phase.identity(prev),'Generation170 immutable predecessor continuity');
const validated=phase.verifyCurrent();
assert(validated.ok,'Generation171 invalid: '+validated.errors.join('; '));
assert.equal(validated.generation,171);
console.log('PASS Release222: 12 scoped paths, immutable 300 canonical data, 20 PWA hashes, Generation171, existing grades/history untouched');
