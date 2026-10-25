'use strict';
// Release225 successor: teach exact input placement without altering accounting authority.
const assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process'),crypto=require('node:crypto'),path=require('node:path');
const root=path.resolve(__dirname,'..'),base='f152068998b3841e1882709083dacc30b6f78ce6';
const older='20261025-224',release='20261026-225';
const lockPath='reports/auto-gate/audit-locks/phase-b-generation-176.json';
const oldLock='reports/auto-gate/audit-locks/phase-b-generation-175.json';
const git=(...args)=>cp.execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:64*1024*1024}).trim();
const prior=p=>cp.execFileSync('git',['show',base+':'+p],{cwd:root,encoding:'utf8',maxBuffer:64*1024*1024});
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex');
const listed=args=>git(...args).split('\n').filter(Boolean);
const approved=[
 '.github/workflows/question-quality-ledger-audit.yml','form-a.html','index.html',
 'js/explanation-model.js','js/view.js','pwa-release-manifest.json',
 lockPath,'scripts/validate-editorial-successor.cjs','service-worker.js',
 'tests/audit-matrix.test.js','tests/explanation-quality.test.js'
].sort();
assert.equal(git('merge-base',base,'HEAD'),base,'Release224 must be an ancestor');
const untracked=listed(['ls-files','--others','--exclude-standard']);
const fixture='historical-quality/';
if(untracked.includes(fixture)){
 const folder=path.join(root,fixture);
 assert.equal(process.env.GITHUB_ACTIONS,'true','nested historical checkout requires GitHub Actions');
 assert.equal(process.env.GITHUB_JOB,'ledger','nested historical checkout only allowed for ledger job');
 assert(fs.existsSync(folder)&&fs.lstatSync(folder).isDirectory()&&!fs.lstatSync(folder).isSymbolicLink(),'must be real nested checkout');
 assert.equal(git('-C',folder,'rev-parse','--show-toplevel'),folder,'separate checkout required');
 assert.equal(git('-C',folder,'rev-parse','HEAD'),'37086c6ae6511a249218533375bf6f19dac231d1','fixed historical checkout required');
 assert.equal(git('-C',folder,'status','--porcelain','--untracked-files=all'),'','historical checkout must be clean');
}
const changed=[...new Set([
 ...listed(['diff','--name-only',base,'HEAD']),
 ...listed(['diff','--name-only','HEAD']),
 ...listed(['diff','--cached','--name-only']),
 ...untracked.filter(p=>p!=='artifacts/form-a-grade-results.json'&&p!==fixture)
])].sort();
assert.deepEqual(changed,approved,'Release225 must change exactly 11 approved files');
for(const p of [
 'data/questions.js','data/accounting-domain.js','data/accounting-oracle.js','data/form-a.json',
 'js/model.js','js/rpg.js','js/engine.js','js/feedback.js','js/controller.js','js/app.js',
 'js/explanation-formulas.js','js/explanation-design-system.js','css/style.css','css/form-a.css',
 'manifest.webmanifest','package.json','package-lock.json',oldLock,
 'scripts/qa/audit-core.js','scripts/qa/phase-b-lifecycle.js',
 'scripts/validate-story-bridge-successor.cjs'
])assert.equal(read(p),prior(p).toString('utf8'),p+' must remain byte-identical');
assert.equal(hash(oldLock),'69459a0d9d4d8ea87152425446cad94ad0eec0489cf03a859917ce355bdbb2af','Generation175 immutable raw bytes');
for(const p of ['index.html','form-a.html','service-worker.js']){
 const source=prior(p).toString('utf8');
 assert(source.includes(older),p+' old release token absent');
 assert.equal(read(p),source.replaceAll(older,release),p+' only cache version may advance');
}
assert.equal(hash('js/explanation-model.js'),'a52e6650d6a61d3dedf4198fee4d1fb47ea64a86c90281605499b1d26bcb51cf','reviewed model required');
assert.equal(hash('js/view.js'),'b482918f3be6eab0dc556a30635ce69ec83eac81d5bf4ff54f4fbbaaa43b7200','reviewed view required');
assert.equal(hash('tests/explanation-quality.test.js'),'394ac71189b63b39b0308feb449ab3c77b7493aa3144b046d79e470ba9a62e38','fixed regression test required');
for(const [p,anchor,addition] of [
 ['tests/audit-matrix.test.js',"  '20261025-224':'scripts/validate-story-bridge-successor.cjs'",",\n  '20261026-225':'scripts/validate-editorial-successor.cjs'"],
 ['.github/workflows/question-quality-ledger-audit.yml',"            '20261025-224': 'scripts/validate-story-bridge-successor.cjs'",",\n            '20261026-225': 'scripts/validate-editorial-successor.cjs'"]
]){
 const old=prior(p).toString('utf8');
 assert.equal(old.split(anchor).length-1,1,p+' original anchor must be unique');
 assert.equal(read(p),old.replace(anchor,anchor+addition),p+' must only route Release225');
}
const oldManifest=JSON.parse(prior('pwa-release-manifest.json').toString('utf8'));
const manifest=JSON.parse(read('pwa-release-manifest.json'));
assert.equal(manifest.release,release);
assert.equal(manifest.previousRelease,older);
assert.deepEqual(Object.keys(manifest.assets),Object.keys(oldManifest.assets));
for(const p of Object.keys(oldManifest.assets)){
 const expected=['js/view.js','js/explanation-model.js'].includes(p)?hash(p):oldManifest.assets[p];
 assert.equal(manifest.assets[p],expected,p+' exact approved asset hash');
}
assert.equal(manifest.pages['form-a.html'],hash('form-a.html'),'Form A updated hash');
const lock=JSON.parse(read(lockPath));
assert.equal(lock.generation,176);
assert.equal(lock.predecessor.generation,175);
const phase=require('./qa/phase-b-lifecycle');
const committed=listed(['ls-tree','-r','--name-only','HEAD','--',lockPath]).includes(lockPath);
if(committed){
 const r=phase.verifyCurrent();
 assert(r.ok,'Generation176 committed integrity failed: '+r.errors.join('; '));
 assert.equal(r.generation,176);
}else{
 const r=phase.verifyCandidate(lock);
 assert(r.ok,'Generation176 precommit candidate failed: '+r.errors.join('; '));
}
console.log('PASS Release225 '+(committed?'committed':'precommit')+': 11 scoped files, 300 immutable, Generation176 continuity');
