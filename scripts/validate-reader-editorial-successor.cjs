'use strict';
// Release230 / Generation184: accept only reader-facing editorial improvements.
// Accepted historical authority, question identities, answers and user state stay immutable.
const assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process'),crypto=require('node:crypto');
const BASE='8dc237c9fa3d7b92f8d5834827f7e6ea2d48d390',OLD='20261029-229',NEXT='20261101-230';
const raw=(...args)=>cp.execFileSync('git',args,{encoding:'utf8',maxBuffer:64*1024*1024});
const git=(...args)=>raw(...args).trim();
const list=(...args)=>git(...args).split('\n').filter(Boolean);
const read=p=>fs.readFileSync(p,'utf8');
const old=p=>raw('show',BASE+':'+p);
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const EXPECT=[
 '.github/workflows/question-quality-ledger-audit.yml',
 'data/questions.js','form-a.html','index.html','package.json','pwa-release-manifest.json',
 'reports/auto-gate/audit-locks/phase-b-generation-184.json',
 'scripts/validate-reader-editorial-successor.cjs','service-worker.js',
 'tests/audit-matrix.test.js','tests/editorial-review-230.test.js','tests/user-facing-copy-contract.test.js'
].sort();
assert.equal(git('merge-base',BASE,'HEAD'),BASE,'must descend from merged Release229 audit authority');
const changed=[...new Set([
 ...list('diff','--name-only',BASE,'HEAD'),
 ...list('diff','--name-only','HEAD'),
 ...list('diff','--cached','--name-only'),
 ...list('ls-files','--others','--exclude-standard').filter(p=>p!=='historical-quality/'&&p!=='artifacts/form-a-grade-results.json')
])].sort();
assert.deepEqual(changed,EXPECT,'Release230 changed-file scope');
for(const file of [
 'data/accounting-domain.js','data/accounting-oracle.js','data/form-a.json',
 'js/engine.js','js/model.js','js/view.js','js/controller.js','js/feedback.js','js/rpg.js','js/app.js',
 'js/form-a.js','js/form-a-scoring.js','js/form-a-store.js','css/style.css','css/form-a.css',
 'reports/auto-gate/audit-locks/phase-b-generation-182.json',
 'reports/auto-gate/audit-locks/phase-b-generation-183.json',
 'scripts/audit-user-facing-prose.cjs','scripts/audit-all300-reader-terminology.cjs',
 'scripts/validate-all300-copy-successor.cjs'
])assert(fs.readFileSync(file).equals(old(file)),'protected file edited: '+file);
const current=JSON.parse(read('pwa-release-manifest.json'));
const previous=JSON.parse(old('pwa-release-manifest.json').toString('utf8'));
assert.equal(current.release,NEXT);
assert.equal(current.previousRelease,OLD);
assert.deepEqual(Object.keys(current.assets),Object.keys(previous.assets));
assert.deepEqual(Object.keys(current.pages),Object.keys(previous.pages));
for(const p of Object.keys(current.assets))assert.equal(current.assets[p],sha(p),'asset checksum '+p);
for(const p of Object.keys(current.pages))assert.equal(current.pages[p],sha(p),'page checksum '+p);
assert.equal(read('service-worker.js'),old('service-worker.js').toString('utf8').replaceAll(OLD,NEXT),'service worker only release bump');
assert.equal(read('index.html'),old('index.html').toString('utf8').replaceAll(OLD,NEXT),'index only release bump');
assert.equal(read('form-a.html'),old('form-a.html').toString('utf8').replaceAll(OLD,NEXT),'standalone practice shell only release bump');
assert(read('package.json').includes('node tests/editorial-review-230.test.js'),'mandatory runtime regression missing');
assert(read('tests/audit-matrix.test.js').includes("'20261101-230':'scripts/validate-reader-editorial-successor.cjs'"));
assert(read('.github/workflows/question-quality-ledger-audit.yml').includes("'20261101-230': 'scripts/validate-reader-editorial-successor.cjs'"));
cp.execFileSync(process.execPath,['tests/editorial-review-230.test.js'],{stdio:'inherit'});
const lifecycle=require('./qa/phase-b-lifecycle');
const authority=JSON.parse(read('reports/auto-gate/audit-locks/phase-b-generation-184.json'));
assert.equal(authority.generation,184);
assert.equal(authority.predecessor.generation,183);
const verdict=lifecycle.verifyCurrent();
assert(verdict.ok,'successor generation history invalid: '+verdict.errors.join('; '));
console.log('RELEASE230_GEN184_PROTECTION_PASS; professional human signoff and learner efficacy require separate evidence');
