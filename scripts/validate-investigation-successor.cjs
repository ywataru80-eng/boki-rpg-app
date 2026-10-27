'use strict';
// Release227 / Generation180: Chapter 4 only, Grade3 accounting preserved.
const assert=require('node:assert/strict');
const fs=require('node:fs'),cp=require('node:child_process'),crypto=require('node:crypto');
const BASE='3eaccd488855534179ef5a3835816e35e6b50859';
const OLD='20261027-226',RELEASE='20261028-227';
const LOCK='reports/auto-gate/audit-locks/phase-b-generation-180.json';
const raw=(...a)=>cp.execFileSync('git',a,{encoding:'utf8',maxBuffer:64*1024*1024});
const git=(...a)=>raw(...a).trim();
const read=p=>fs.readFileSync(p,'utf8');
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const lines=(...a)=>git(...a).split('\n').filter(Boolean);
const allowed=[
 '.github/workflows/question-quality-ledger-audit.yml',
 'form-a.html','index.html','js/view.js','pwa-release-manifest.json',
 LOCK,'scripts/validate-investigation-successor.cjs','service-worker.js',
 'tests/audit-matrix.test.js','tests/story-business-decision.test.js'
].sort();
assert.equal(git('merge-base',BASE,'HEAD'),BASE,'release226 must be an ancestor');
const changed=[...new Set([
 ...lines('diff','--name-only',BASE,'HEAD'),
 ...lines('diff','--name-only','HEAD'),
 ...lines('diff','--cached','--name-only'),
 ...lines('ls-files','--others','--exclude-standard').filter(p=>p!=='historical-quality/'&&p!=='artifacts/form-a-grade-results.json')
])].sort();
assert.deepEqual(changed,allowed,'changed-file scope mismatch for Release227');
for(const p of ['index.html','form-a.html','service-worker.js'])
 assert.equal(read(p),raw('show',BASE+':'+p).replaceAll(OLD,RELEASE),p+' must only update release token');
const m=JSON.parse(read('pwa-release-manifest.json'));
const prev=JSON.parse(raw('show',BASE+':pwa-release-manifest.json'));
assert.equal(m.release,RELEASE);assert.equal(m.previousRelease,OLD);
assert.deepEqual(Object.keys(m.assets),Object.keys(prev.assets));
assert.deepEqual(Object.keys(m.pages),Object.keys(prev.pages));
for(const p of Object.keys(prev.assets))
 assert.equal(m.assets[p],p==='js/view.js'?sha(p):prev.assets[p],p+' asset hash');
for(const p of Object.keys(prev.pages))
 assert.equal(m.pages[p],sha(p),p+' page hash');
for(const p of [
 'data/questions.js','data/accounting-oracle.js','js/engine.js','js/model.js',
 'js/rpg.js','js/controller.js','reports/auto-gate/audit-locks/phase-b-generation-179.json'
]) assert.equal(read(p),raw('show',BASE+':'+p),p+' historical/protected content changed');
const view=read('js/view.js');
assert(view.includes('森への報告に向け、最初に何を確認しますか？'),'three-way prompt missing');
assert(view.includes('もう一方の資料も確認する（任意）'),'optional crosscheck missing');
assert(view.includes('第4章ではすでに現金実査額と帳簿残高の不一致が確認されています。'),'Chapter 4 context missing');
const lock=JSON.parse(read(LOCK));
assert.equal(lock.generation,180);assert.equal(lock.phase,'B_GENERATION');
assert.equal(lock.predecessor.generation,179);
const phase=require('./qa/phase-b-lifecycle');
const committed=lines('ls-tree','-r','--name-only','HEAD','--',LOCK).includes(LOCK);
const verified=committed?phase.verifyCurrent():phase.verifyCandidate(lock);
assert(verified.ok,'Generation180 invalid: '+verified.errors.join('; '));
console.log('RELEASE227_GEN180_CH04_SUCCESSOR_PASS');
