'use strict';
// Release241/Generation205: FY2026 15-item session profile isolation only.
// It does NOT enable FY2027 examination, rewrite 300 questions, or re-grade
// historical entries. Exact baseline, scope, immutable authority and source
// integrity must be independently reproducible on every CI run.
const assert=require('node:assert/strict');
const fs=require('node:fs'),cp=require('node:child_process'),crypto=require('node:crypto');
const BASE='af5769e10f18f1f02d92bf757a757ea5f1dc2db0',OLD='20261123-240',RELEASE='20261123-241';
const GEN='reports/auto-gate/audit-locks/phase-b-generation-205.json';
const read=p=>fs.readFileSync(p);
const old=p=>cp.execFileSync('git',['show',`${BASE}:${p}`],{maxBuffer:32*1024*1024});
const git=(...a)=>cp.execFileSync('git',a,{encoding:'utf8',maxBuffer:32*1024*1024}).trim();
const sha=p=>crypto.createHash('sha256').update(read(p)).digest('hex');
const scope=new Set([
 '.github/workflows/question-quality-ledger-audit.yml',
 'js/model.js','js/controller.js','package.json','tests/issue259-fy2026-profile-guard.test.js',
 'index.html','form-a.html','service-worker.js','pwa-release-manifest.json',GEN,
 'scripts/validate-issue259-profile-guard-successor-241.cjs',
 'tests/audit-matrix.test.js','tests/editorial-review-230.test.js','tests/editorial-review-232.test.js',
 'tests/editorial-review-233.test.js','tests/editorial-review-234.test.js','tests/issue161-inventory.test.js',
 'tests/l039-explanation.test.js','tests/ledger-opening-migration.test.js','tests/user-facing-copy-contract.test.js'
]);
assert.equal(cp.spawnSync('git',['merge-base','--is-ancestor',BASE,'HEAD']).status,0,'must descend from exact Release240 main');
assert.equal(JSON.parse(old('pwa-release-manifest.json')).release,OLD);
const changed=git('diff','--name-only',BASE).split('\n').filter(Boolean);
const untracked=git('ls-files','--others','--exclude-standard').split('\n').filter(path=>path&&
 !path.startsWith('node_modules/')&&!path.startsWith('artifacts/')&&!path.startsWith('historical-quality/')&&!path.startsWith('reports/baseline-current/'));
const paths=[...new Set([...changed,...untracked])];
assert(paths.length>0&&paths.every(path=>scope.has(path)),'unexpected file changes: '+paths.filter(p=>!scope.has(p)).join(','));
for(const path of ['data/questions.js','data/accounting-domain.js','data/accounting-oracle.js',
 'js/engine.js','js/rpg.js','js/view.js','reports/auto-gate/audit-locks/phase-b-generation-204.json'])
 assert(read(path).equals(old(path)),path+' immutable source mutated');
assert(read('js/model.js').toString().includes("questionSetVersion:'FY2026-CANONICAL300-R6'"));
assert(read('js/model.js').toString().includes('keys.some(key => session[key] !== EXAM_PROFILE_2026[key])'));
assert(read('js/controller.js').toString().includes('const profile = root.ProgressModel?.examProfile2026?.()'));
assert(read('js/controller.js').toString().includes('const examProfileFields = profile && session.examProfileId'));
assert(read('js/controller.js').toString().includes("const EXAM_POINTS = Object.freeze([9, 9, 9, 9, 9, 5, 5, 5, 5, 6, 6, 6, 6, 6, 5]);"),
 'FY2026 grading authority changed');
for(const path of ['index.html','form-a.html','service-worker.js']){
 const original=old(path).toString();assert(original.includes(OLD));
 assert.equal(read(path).toString(),original.replaceAll(OLD,RELEASE),path+' unapproved markup/worker changes');
}
const manifest=JSON.parse(read('pwa-release-manifest.json')),
 previous=JSON.parse(old('pwa-release-manifest.json'));
assert.equal(manifest.release,RELEASE);assert.equal(manifest.previousRelease,OLD);
assert.deepEqual(Object.keys(manifest.assets),Object.keys(previous.assets));
assert.deepEqual(Object.keys(manifest.pages),Object.keys(previous.pages));
for(const [path,expected] of Object.entries({...manifest.assets,...manifest.pages}))
 assert.equal(sha(path),expected,'release SHA mismatch '+path);
const gen=JSON.parse(read(GEN));
assert.equal(gen.generation,205);assert.equal(gen.predecessor.generation,204);
const lifecycle=require('./qa/phase-b-lifecycle');
const committed=cp.spawnSync('git',['cat-file','-e',`HEAD:${GEN}`]).status===0;
const check=committed?lifecycle.verifyCurrent():lifecycle.verifyCandidate(gen);
assert(check.ok,'Gen205 authority: '+check.errors.join('; '));
cp.execFileSync(process.execPath,['tests/issue259-fy2026-profile-guard.test.js'],{stdio:'inherit'});
console.log('RELEASE241_GEN205_FY2026_PROFILE_GUARD_PASS (FY2027 official mode remains disabled)');
