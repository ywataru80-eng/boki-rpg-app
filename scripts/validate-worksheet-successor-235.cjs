'use strict';
// Issue #256: Release235 / Generation189, strict P1 worksheet error-comparison successor.
// Never modify or silently relax historical Release234 content identity evidence.
const assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process'),crypto=require('node:crypto');
const BASE='d712814e2eda42efbdf73aa3e68eb09105284c92',PREV='20261103-234',NEXT='20261105-235';
const GEN='reports/auto-gate/audit-locks/phase-b-generation-189.json';
const git=(...args)=>cp.execFileSync('git',args,{encoding:'utf8'}).trim();
const old=p=>cp.execFileSync('git',['show',BASE+':'+p],{encoding:'utf8'});
const read=p=>fs.readFileSync(p,'utf8');
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
assert.equal(cp.spawnSync('git',['merge-base','--is-ancestor',BASE,'HEAD']).status,0,'successor must retain Release234 ancestry');
const allowed=new Set([
  '.github/workflows/question-quality-ledger-audit.yml','form-a.html','index.html',
  'js/view.js','package.json','pwa-release-manifest.json','service-worker.js',
  'reports/auto-gate/audit-locks/phase-b-generation-189.json',
  'scripts/validate-worksheet-successor-235.cjs','tests/worksheet-comparison-routing.test.js',
  'tests/audit-matrix.test.js','tests/editorial-review-230.test.js',
  'tests/editorial-review-232.test.js','tests/editorial-review-233.test.js',
  'tests/user-facing-copy-contract.test.js'
]);
const untracked=git('ls-files','--others','--exclude-standard').split(/\n/u).filter(Boolean);
const fixture='historical-quality/';
if(untracked.includes(fixture)){
  assert.equal(process.env.GITHUB_ACTIONS,'true','historical evidence fixture only in CI');
  assert.equal(process.env.GITHUB_JOB,'ledger','historical evidence fixture only in ledger job');
  assert(fs.lstatSync(fixture).isDirectory()&&!fs.lstatSync(fixture).isSymbolicLink(),'historical fixture must be a directory');
  assert.equal(git('-C',fixture,'rev-parse','HEAD'),'37086c6ae6511a249218533375bf6f19dac231d1','pinned historical source');
  assert.equal(git('-C',fixture,'status','--porcelain','--untracked-files=all'),'','historical fixture clean');
}
const paths=[...new Set([
  ...git('diff','--name-only',BASE,'HEAD').split(/\n/u),
  ...git('diff','--name-only').split(/\n/u),
  ...git('diff','--cached','--name-only').split(/\n/u),
  ...untracked.filter(p=>p!==fixture)
])].filter(Boolean).filter(p=>!p.startsWith('artifacts/')&&!p.startsWith('reports/baseline-current/')).sort();
for(const p of ['js/view.js','package.json','pwa-release-manifest.json','service-worker.js',GEN,'tests/worksheet-comparison-routing.test.js']){
  assert(paths.includes(p),'required P1 successor file missing: '+p);
}
assert(paths.every(p=>allowed.has(p)),'unexpected Release235 files: '+paths.filter(p=>!allowed.has(p)).join(','));
const manifest=JSON.parse(read('pwa-release-manifest.json')),before=JSON.parse(old('pwa-release-manifest.json'));
assert.equal(before.release,PREV);assert.equal(manifest.release,NEXT);assert.equal(manifest.previousRelease,PREV);
assert.deepEqual(Object.keys(before.assets).sort(),Object.keys(manifest.assets).sort());
assert.deepEqual(Object.keys(before.pages).sort(),Object.keys(manifest.pages).sort());
for(const [p,hash] of Object.entries({...manifest.assets,...manifest.pages}))assert.equal(sha(p),hash,'PWA digest mismatch: '+p);
for(const p of ['index.html','form-a.html','service-worker.js'])assert.equal(read(p),old(p).replaceAll(PREV,NEXT),p+' release marker only');
const needle="if (question.type === 'worksheet') {";
const replacement="if (question.type === 'worksheet' && question.format === 'eight-column-worksheet') {";
const origView=old('js/view.js');assert.equal(origView.split(needle).length,2,'historical worksheet condition');
assert.equal(read('js/view.js'),origView.replace(needle,replacement),'only scoped worksheet-routing line is changed');
const testEntry='node tests/editorial-review-234.test.js && node scripts/audit-editorial.js';
const testReplaced='node tests/editorial-review-234.test.js && node tests/worksheet-comparison-routing.test.js && node scripts/audit-editorial.js';
assert.equal(read('package.json'),old('package.json').replace(testEntry,testReplaced),'package script adds only scoped regression test');
for(const p of ['data/questions.js','data/accounting-domain.js','data/accounting-oracle.js','js/model.js','js/engine.js','js/rpg.js','js/controller.js'])
  assert.equal(sha(p),crypto.createHash('sha256').update(old(p)).digest('hex'),p+' protected authority changed');
const previousGen=cp.execFileSync('git',['show',BASE+':reports/auto-gate/audit-locks/phase-b-generation-188.json']);
assert(fs.readFileSync('reports/auto-gate/audit-locks/phase-b-generation-188.json').equals(previousGen),'Generation188 historical bytes changed');
const gen=JSON.parse(read(GEN));assert.equal(gen.schemaVersion,3);assert.equal(gen.generation,189);assert.equal(gen.predecessor.generation,188);
const lifecycle=require('./qa/phase-b-lifecycle');
const committed=cp.spawnSync('git',['cat-file','-e','HEAD:'+GEN],{encoding:'utf8'}).status===0;
const check=committed?lifecycle.verifyCurrent():lifecycle.verifyCandidate(gen);
assert(check.ok,'Generation189 integrity: '+check.errors.join('; '));
cp.execFileSync(process.execPath,['tests/worksheet-comparison-routing.test.js'],{stdio:'inherit'});
console.log('RELEASE235_GEN189_WORKSHEET_COMPARISON_SCOPE_PASS');

