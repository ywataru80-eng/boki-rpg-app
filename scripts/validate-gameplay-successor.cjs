'use strict';
// Release226 / Generation179: evidence-first Chapter 4 Story-only, accepted against Release225.
const assert=require('node:assert/strict');
const fs=require('node:fs'),cp=require('node:child_process'),crypto=require('node:crypto'),path=require('node:path');
const ROOT=path.resolve(__dirname,'..');
const BASE='eddde65e44cc32254a27f22fa8d4f5638430be23';
const FEATURE='094635fff6e8633ffe28b79b573885e00aae5a9b';
const PREVIOUS='20261026-225',RELEASE='20261027-226';
const LOCK='reports/auto-gate/audit-locks/phase-b-generation-179.json';
const git=(...args)=>cp.execFileSync('git',args,{cwd:ROOT,encoding:'utf8',maxBuffer:64*1024*1024}).trim();
const original=p=>cp.execFileSync('git',['show',BASE+':'+p],{cwd:ROOT,encoding:'utf8',maxBuffer:64*1024*1024});
const feature=p=>cp.execFileSync('git',['show',FEATURE+':'+p],{cwd:ROOT,encoding:'utf8',maxBuffer:64*1024*1024});
const read=p=>fs.readFileSync(path.join(ROOT,p),'utf8');
const digest=p=>crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT,p))).digest('hex');
const listed=args=>git(...args).split('\n').filter(Boolean);
const ALLOWED=[
 '.github/workflows/question-quality-ledger-audit.yml',
 'form-a.html','index.html','js/view.js','pwa-release-manifest.json',
 LOCK,'scripts/validate-gameplay-successor.cjs','service-worker.js',
 'tests/audit-matrix.test.js','tests/story-business-decision.test.js'
].sort();
assert.equal(git('merge-base',BASE,'HEAD'),BASE,'Release225 must be an ancestor');
const untracked=listed(['ls-files','--others','--exclude-standard']);
const fixture='historical-quality/';
if(untracked.includes(fixture)){
 const dir=path.resolve(ROOT,fixture);
 assert.equal(process.env.GITHUB_ACTIONS,'true','historical checkout only in GitHub Actions');
 assert.equal(process.env.GITHUB_JOB,'ledger','historical checkout only in ledger job');
 assert(fs.lstatSync(dir).isDirectory()&&!fs.lstatSync(dir).isSymbolicLink());
 assert.equal(git('-C',dir,'rev-parse','HEAD'),'37086c6ae6511a249218533375bf6f19dac231d1');
 assert.equal(git('-C',dir,'status','--porcelain','--untracked-files=all'),'');
}
const changed=[...new Set([
 ...listed(['diff','--name-only',BASE,'HEAD']),
 ...listed(['diff','--name-only','HEAD']),
 ...listed(['diff','--cached','--name-only']),
 ...untracked.filter(p=>p!=='artifacts/form-a-grade-results.json'&&p!==fixture)
])].sort();
assert.deepEqual(changed,ALLOWED,'Release226 changed-file scope mismatch');
for(const f of ['js/view.js','tests/story-business-decision.test.js']){
 assert.equal(read(f),feature(f).toString('utf8'),f+' differs from reviewed PR239 candidate');
}
for(const f of ['index.html','form-a.html','service-worker.js']){
 const old=original(f).toString('utf8');
 assert(old.includes(PREVIOUS),f+' original release absent');
 assert.equal(read(f),old.replaceAll(PREVIOUS,RELEASE),f+' must only change release token');
}
for(const [f,anchor,addition] of [
 ['tests/audit-matrix.test.js',"'20261026-225':'scripts/validate-editorial-successor.cjs'",",\n  '20261027-226':'scripts/validate-gameplay-successor.cjs'"],
 ['.github/workflows/question-quality-ledger-audit.yml',"'20261026-225': 'scripts/validate-editorial-successor.cjs'",",\n            '20261027-226': 'scripts/validate-gameplay-successor.cjs'"]
]){
 const old=original(f).toString('utf8');
 assert.equal(old.split(anchor).length,2,'route anchor must be unique for '+f);
 assert.equal(read(f),old.replace(anchor,anchor+addition),f+' may only extend release router');
}
const m=JSON.parse(read('pwa-release-manifest.json'));
const oldM=JSON.parse(original('pwa-release-manifest.json'));
assert.equal(m.release,RELEASE);
assert.equal(m.previousRelease,PREVIOUS);
assert.deepEqual(Object.keys(m.assets),Object.keys(oldM.assets));
assert.deepEqual(Object.keys(m.pages),Object.keys(oldM.pages));
for(const f of Object.keys(oldM.assets))assert.equal(m.assets[f],f==='js/view.js'?digest(f):oldM.assets[f],f+' PWA content hash mismatch');
for(const f of Object.keys(oldM.pages))assert.equal(m.pages[f],digest(f),f+' PWA page hash mismatch');
assert.equal(read('reports/auto-gate/audit-locks/phase-b-generation-178.json'),original('reports/auto-gate/audit-locks/phase-b-generation-178.json').toString('utf8'),'historical Generation178 must be byte-identical');
const lock=JSON.parse(read(LOCK)),phase=require('./qa/phase-b-lifecycle');
assert.equal(lock.generation,179);
assert.equal(lock.phase,'B_GENERATION');
assert.equal(lock.predecessor.generation,178);
const committed=listed(['ls-tree','-r','--name-only','HEAD','--',LOCK]).includes(LOCK);
if(committed){
 assert.equal(git('status','--porcelain','--untracked-files=no'),'','committed Release226 must have clean tracked worktree');
 const out=phase.verifyCurrent();
 assert(out.ok,'committed Generation179 invalid: '+out.errors.join('; '));
 assert.equal(out.generation,179);
}else{
 const out=phase.verifyCandidate(lock);
 assert(out.ok,'precommit Generation179 invalid: '+out.errors.join('; '));
}
console.log('PASS Release226 '+(committed?'committed':'precommit')+': reviewed Story pilot, protected accounting, strict release hashes, Gen179 continuity');
